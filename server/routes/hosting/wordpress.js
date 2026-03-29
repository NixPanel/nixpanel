const express = require('express');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { validateDomain, sanitizePath } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

function generateKey(length = 64) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

function mysqlEscape(str) {
  return String(str).replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, (char) => {
    const escapes = { '\0': '\\0', '\x08': '\\b', '\x09': '\\t', '\x1a': '\\z', '\n': '\\n', '\r': '\\r', '"': '\\"', "'": "\\'", '\\': '\\\\', '%': '\\%' };
    return escapes[char];
  });
}

// GET /api/hosting/wordpress/installations - scan for WP installs
router.get('/installations', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('find /var/www -name "wp-config.php" -maxdepth 6 2>/dev/null | head -20', { timeout: 30000 });
    const installations = [];

    for (const configPath of stdout.trim().split('\n').filter(Boolean)) {
      try {
        const dir = path.dirname(configPath);
        const pathParts = dir.split('/');
        const domain = pathParts[3] || path.basename(dir);

        // Get WP version
        let version = 'unknown';
        const versionFile = path.join(dir, 'wp-includes/version.php');
        if (fs.existsSync(versionFile)) {
          const content = fs.readFileSync(versionFile, 'utf-8');
          const match = content.match(/\$wp_version\s*=\s*'([^']+)'/);
          if (match) version = match[1];
        }

        // Check for updates via WP-CLI if available
        let updateAvailable = false;
        try {
          const { stdout: wpOut } = await execAsync(`wp --path="${dir}" core check-update --allow-root 2>/dev/null | head -3`, { timeout: 10000 });
          updateAvailable = wpOut.includes('available');
        } catch (_) {}

        // Count plugins
        let pluginCount = 0;
        try {
          const pluginsDir = path.join(dir, 'wp-content/plugins');
          if (fs.existsSync(pluginsDir)) {
            pluginCount = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory()).length;
          }
        } catch (_) {}

        installations.push({
          path: dir,
          path64: Buffer.from(dir).toString('base64'),
          domain,
          version,
          updateAvailable,
          configPath,
          pluginCount,
        });
      } catch (_) {}
    }

    res.json({ installations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/wordpress/install - one-click install with SSE streaming
router.post('/install', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain, adminUser, adminPassword, adminEmail, siteTitle, dbName, dbUser, dbPassword } = req.body;

  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  if (!adminPassword || adminPassword.length < 8) return res.status(400).json({ error: 'Admin password too short' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const docRoot = `/var/www/${domain}/public_html`;
  const db = dbName || domain.replace(/[^a-z0-9]/g, '_').slice(0, 16) + '_wp';
  const dbuser = dbUser || db.slice(0, 16) + '_u';
  const dbpass = dbPassword || generateKey(16);
  const MYSQL_CNF = '/root/.nixpanel_mysql.cnf';

  try {
    send({ text: `Creating document root: ${docRoot}\n` });
    await execAsync(`mkdir -p "${docRoot}"`, { timeout: 10000 });

    send({ text: 'Downloading WordPress...\n' });
    await execAsync(`curl -sL https://wordpress.org/latest.tar.gz | tar -xz -C /tmp/ && cp -r /tmp/wordpress/. "${docRoot}/" 2>&1`, { timeout: 60000 });

    send({ text: 'Creating database and user...\n' });
    if (!fs.existsSync(MYSQL_CNF)) fs.writeFileSync(MYSQL_CNF, '[client]\nuser=root\npassword=\n', { mode: 0o600 });
    const escapedPass = mysqlEscape(dbpass);
    await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS '${dbuser}'@'localhost' IDENTIFIED BY '${escapedPass}'; GRANT ALL ON \`${db}\`.* TO '${dbuser}'@'localhost'; FLUSH PRIVILEGES;" 2>&1`, { timeout: 20000 });

    send({ text: 'Configuring WordPress...\n' });
    const wpConfigContent = `<?php
define('DB_NAME', '${db}');
define('DB_USER', '${dbuser}');
define('DB_PASSWORD', '${dbpass}');
define('DB_HOST', 'localhost');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

define('AUTH_KEY',         '${generateKey()}');
define('SECURE_AUTH_KEY',  '${generateKey()}');
define('LOGGED_IN_KEY',    '${generateKey()}');
define('NONCE_KEY',        '${generateKey()}');
define('AUTH_SALT',        '${generateKey()}');
define('SECURE_AUTH_SALT', '${generateKey()}');
define('LOGGED_IN_SALT',   '${generateKey()}');
define('NONCE_SALT',       '${generateKey()}');

$table_prefix = 'wp_';
define('WP_DEBUG', false);
if ( !defined('ABSPATH') ) define('ABSPATH', __DIR__ . '/');
require_once ABSPATH . 'wp-settings.php';
`;
    fs.writeFileSync(path.join(docRoot, 'wp-config.php'), wpConfigContent);

    send({ text: 'Setting permissions...\n' });
    await execAsync(`chown -R www-data:www-data "${docRoot}" 2>/dev/null || chown -R nginx:nginx "${docRoot}" 2>/dev/null || true && find "${docRoot}" -type d -exec chmod 755 {} \\; && find "${docRoot}" -type f -exec chmod 644 {} \\;`, { timeout: 30000 });

    // Try WP-CLI install
    send({ text: 'Running WordPress installation...\n' });
    try {
      const url = `http://${domain}`;
      const title = (siteTitle || domain).replace(/['"]/g, '');
      const user = (adminUser || 'admin').replace(/[^a-zA-Z0-9_]/g, '');
      const emailAddr = (adminEmail || `admin@${domain}`).replace(/[^a-zA-Z0-9@._+\-]/g, '');
      const pass = adminPassword.replace(/['"]/g, '');
      const { stdout: wpOut } = await execAsync(`wp --path="${docRoot}" core install --url="${url}" --title="${title}" --admin_user="${user}" --admin_password="${pass}" --admin_email="${emailAddr}" --allow-root 2>&1`, { timeout: 60000 });
      send({ text: wpOut + '\nWordPress installed via WP-CLI.\n' });
    } catch (_) {
      send({ text: 'WP-CLI not available - complete install via browser at your domain.\n' });
    }

    auditLog(req.user.id, req.user.username, 'WP_INSTALL', domain, { db, dbuser }, req.ip);
    send({ done: true, success: true, domain, docRoot, db, dbuser });
    res.end();
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

// GET /api/hosting/wordpress/:path64/plugins - list plugins
router.get('/:path64/plugins', authenticateToken, async (req, res) => {
  try {
    const wpPath = Buffer.from(req.params.path64, 'base64').toString('utf-8');
    sanitizePath(wpPath);
    const { stdout } = await execAsync(`wp --path="${wpPath}" plugin list --format=json --allow-root 2>/dev/null`, { timeout: 15000 });
    res.json({ plugins: JSON.parse(stdout) });
  } catch (err) {
    res.json({ plugins: [], error: err.message });
  }
});

// POST /api/hosting/wordpress/:path64/update-all - SSE streaming updates
router.post('/:path64/update-all', authenticateToken, requireRole('admin'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    const wpPath = Buffer.from(req.params.path64, 'base64').toString('utf-8');
    sanitizePath(wpPath);

    send({ text: 'Updating WordPress core...\n' });
    try {
      const { stdout: c } = await execAsync(`wp --path="${wpPath}" core update --allow-root 2>&1`, { timeout: 60000 });
      send({ text: c });
    } catch (e) { send({ text: e.message + '\n' }); }

    send({ text: 'Updating plugins...\n' });
    try {
      const { stdout: p } = await execAsync(`wp --path="${wpPath}" plugin update --all --allow-root 2>&1`, { timeout: 120000 });
      send({ text: p });
    } catch (e) { send({ text: e.message + '\n' }); }

    send({ text: 'Updating themes...\n' });
    try {
      const { stdout: t } = await execAsync(`wp --path="${wpPath}" theme update --all --allow-root 2>&1`, { timeout: 60000 });
      send({ text: t });
    } catch (e) { send({ text: e.message + '\n' }); }

    send({ done: true });
    res.end();
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

// POST /api/hosting/wordpress/:path64/maintenance - toggle maintenance mode
router.post('/:path64/maintenance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const wpPath = Buffer.from(req.params.path64, 'base64').toString('utf-8');
    sanitizePath(wpPath);
    const { enable } = req.body;
    const cmd = enable
      ? `wp --path="${wpPath}" maintenance-mode activate --allow-root`
      : `wp --path="${wpPath}" maintenance-mode deactivate --allow-root`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/wordpress/:path64/reset-password
router.post('/:path64/reset-password', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const wpPath = Buffer.from(req.params.path64, 'base64').toString('utf-8');
    sanitizePath(wpPath);
    const { username, newPassword } = req.body;
    if (!username || !/^[a-zA-Z0-9_]{1,60}$/.test(username)) return res.status(400).json({ error: 'Invalid username' });
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
    const safePass = newPassword.replace(/["'`\\]/g, '');
    const { stdout } = await execAsync(`wp --path="${wpPath}" user update "${username}" --user_pass="${safePass}" --allow-root 2>&1`, { timeout: 15000 });
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
