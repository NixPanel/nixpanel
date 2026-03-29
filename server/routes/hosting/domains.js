const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { detectWebServer, validateDomain, sanitizePath, getWebServerPaths, getDocRoot } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

// GET /api/hosting/domains - list all virtual hosts
router.get('/', authenticateToken, async (req, res) => {
  try {
    const server = await detectWebServer();
    if (!server) return res.json({ domains: [], server: null, message: 'No web server detected' });

    const paths = getWebServerPaths(server);
    const domains = [];

    if (!fs.existsSync(paths.sitesAvailable)) {
      return res.json({ domains: [], server, message: `${paths.sitesAvailable} not found` });
    }

    const files = fs.readdirSync(paths.sitesAvailable).filter(f => f.endsWith('.conf') || (!f.includes('.') && server === 'nginx'));

    for (const file of files) {
      try {
        const configPath = path.join(paths.sitesAvailable, file);
        const content = fs.readFileSync(configPath, 'utf-8');
        const enabledPath = path.join(paths.sitesEnabled, file);
        const enabled = fs.existsSync(enabledPath);

        // Parse domain name
        let domainName = file.replace(/\.conf$/, '');
        const serverNameMatch = content.match(/server_name\s+([^\s;]+)/i) || content.match(/ServerName\s+(\S+)/i);
        if (serverNameMatch) domainName = serverNameMatch[1];

        // Parse document root
        let docRoot = getDocRoot(domainName);
        const docRootMatch = content.match(/root\s+([^\s;]+)/i) || content.match(/DocumentRoot\s+"?([^\s"]+)"?/i);
        if (docRootMatch) docRoot = docRootMatch[1];

        // Check SSL
        const hasSSL = content.includes('ssl') || content.includes('443');

        // Check disk usage
        let diskUsage = null;
        if (fs.existsSync(docRoot)) {
          try {
            const { stdout } = await execAsync(`du -sh "${docRoot}" 2>/dev/null`, { timeout: 5000 });
            diskUsage = stdout.split('\t')[0];
          } catch (_) {}
        }

        domains.push({
          name: domainName,
          file,
          configPath,
          docRoot,
          enabled,
          hasSSL,
          diskUsage,
          server,
        });
      } catch (_) {}
    }

    res.json({ domains, server });
  } catch (err) {
    console.error('[Domains]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/domains - create virtual host
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain, docRoot: customDocRoot, phpVersion, autoSSL, serverOverride } = req.body;

  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain name' });

  try {
    const server = serverOverride || await detectWebServer();
    if (!server) return res.status(503).json({ error: 'No web server detected. Install nginx or apache2 first.' });

    const paths = getWebServerPaths(server);
    const docRoot = customDocRoot ? sanitizePath(customDocRoot) : getDocRoot(domain);
    const configFile = `${domain}.conf`;
    const configPath = path.join(paths.sitesAvailable, configFile);

    if (fs.existsSync(configPath)) return res.status(409).json({ error: 'Virtual host already exists for this domain' });

    // Create document root
    await execAsync(`mkdir -p "${docRoot}" && chown -R www-data:www-data "${docRoot}" 2>/dev/null || chown -R nginx:nginx "${docRoot}" 2>/dev/null || true`, { timeout: 10000 });
    await execAsync(`chmod 755 "${docRoot}"`, { timeout: 5000 });

    // Create default index.html
    const indexPath = path.join(docRoot, 'index.html');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html><head><title>Welcome to ${domain}</title></head>
<body><h1>Welcome to ${domain}</h1><p>This site is managed by NixPanel.</p></body></html>`);
    }

    // Generate config
    let config;
    if (server === 'nginx') {
      config = generateNginxConfig(domain, docRoot, phpVersion);
    } else {
      config = generateApacheConfig(domain, docRoot, phpVersion);
    }

    // Backup existing if any
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, configPath + '.nixpanel.bak');
    }
    fs.writeFileSync(configPath, config);

    // Enable site
    if (server === 'nginx') {
      const enabledPath = path.join(paths.sitesEnabled, configFile);
      if (!fs.existsSync(enabledPath)) {
        await execAsync(`ln -sf "${configPath}" "${enabledPath}"`, { timeout: 5000 });
      }
    } else {
      await execAsync(`a2ensite ${configFile} 2>/dev/null || true`, { timeout: 10000 });
    }

    // Test and reload
    try {
      await execAsync(paths.test, { timeout: 15000 });
      await execAsync(paths.reload, { timeout: 15000 });
    } catch (err) {
      return res.status(500).json({ error: 'Config syntax error: ' + err.message });
    }

    auditLog(req.user.id, req.user.username, 'DOMAIN_CREATE', domain, { docRoot, server }, req.ip);

    // Request SSL if requested
    let sslResult = null;
    if (autoSSL) {
      try {
        const { stdout } = await execAsync(`certbot --${server} -d ${domain} --non-interactive --agree-tos --email admin@${domain} --redirect 2>&1`, { timeout: 120000 });
        sslResult = { success: true, output: stdout };
      } catch (e) {
        sslResult = { success: false, error: e.message };
      }
    }

    res.status(201).json({ success: true, domain, docRoot, server, sslResult });
  } catch (err) {
    console.error('[Domains] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/domains/:domain/config - get config content
router.get('/:domain/config', authenticateToken, async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const server = await detectWebServer();
    if (!server) return res.status(503).json({ error: 'No web server' });
    const paths = getWebServerPaths(server);
    const configPath = path.join(paths.sitesAvailable, req.params.domain + '.conf');
    if (!fs.existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });
    const content = fs.readFileSync(configPath, 'utf-8');
    res.json({ content, path: configPath, server });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hosting/domains/:domain/config - save config
router.put('/:domain/config', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  const { content } = req.body;
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Content required' });
  try {
    const server = await detectWebServer();
    const paths = getWebServerPaths(server);
    const configPath = path.join(paths.sitesAvailable, req.params.domain + '.conf');
    if (!fs.existsSync(configPath)) return res.status(404).json({ error: 'Config not found' });
    fs.copyFileSync(configPath, configPath + '.nixpanel.bak');
    fs.writeFileSync(configPath, content);
    // Test syntax
    try {
      await execAsync(paths.test, { timeout: 15000 });
      await execAsync(paths.reload, { timeout: 15000 });
    } catch (e) {
      fs.copyFileSync(configPath + '.nixpanel.bak', configPath);
      await execAsync(paths.reload, { timeout: 15000 }).catch(() => {});
      return res.status(400).json({ error: 'Syntax error (reverted): ' + e.message });
    }
    auditLog(req.user.id, req.user.username, 'DOMAIN_CONFIG_EDIT', req.params.domain, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/domains/:domain/toggle - enable/disable
router.post('/:domain/toggle', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const server = await detectWebServer();
    const paths = getWebServerPaths(server);
    const configFile = req.params.domain + '.conf';
    const enabledPath = path.join(paths.sitesEnabled, configFile);

    if (fs.existsSync(enabledPath)) {
      if (server === 'nginx') { fs.unlinkSync(enabledPath); }
      else { await execAsync(`a2dissite ${configFile}`, { timeout: 10000 }); }
    } else {
      const availPath = path.join(paths.sitesAvailable, configFile);
      if (server === 'nginx') { await execAsync(`ln -sf "${availPath}" "${enabledPath}"`, { timeout: 5000 }); }
      else { await execAsync(`a2ensite ${configFile}`, { timeout: 10000 }); }
    }
    await execAsync(paths.reload, { timeout: 15000 }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/domains/:domain
router.delete('/:domain', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  const { removeFiles } = req.query;
  try {
    const server = await detectWebServer();
    const paths = getWebServerPaths(server);
    const configFile = req.params.domain + '.conf';

    if (server === 'nginx') {
      const enabledPath = path.join(paths.sitesEnabled, configFile);
      if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
    } else {
      await execAsync(`a2dissite ${configFile} 2>/dev/null || true`, { timeout: 10000 });
    }

    const configPath = path.join(paths.sitesAvailable, configFile);
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

    if (removeFiles === 'true') {
      const docRoot = getDocRoot(req.params.domain);
      if (fs.existsSync(docRoot)) {
        await execAsync(`rm -rf "${docRoot}"`, { timeout: 30000 });
      }
    }

    await execAsync(paths.reload, { timeout: 15000 }).catch(() => {});
    auditLog(req.user.id, req.user.username, 'DOMAIN_DELETE', req.params.domain, { removeFiles }, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/domains/:domain/logs
router.get('/:domain/logs', authenticateToken, async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const server = await detectWebServer();
    const paths = getWebServerPaths(server);
    const lines = Math.min(parseInt(req.query.lines) || 100, 500);
    const logType = req.query.type === 'error' ? 'error' : 'access';
    const logFile = path.join(paths.logDir, `${req.params.domain}.${logType}.log`);
    const fallback = path.join(paths.logDir, logType + '.log');
    const target = fs.existsSync(logFile) ? logFile : fallback;
    const { stdout } = await execAsync(`tail -n ${lines} "${target}" 2>/dev/null || echo "Log not found"`, { timeout: 10000 });
    res.json({ content: stdout, path: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/domains/:domain/ssl - request/renew SSL
router.post('/:domain/ssl', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDomain(req.params.domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const { email } = req.body;
    const server = await detectWebServer();
    const emailArg = email ? `--email ${email}` : '--register-unsafely-without-email';
    const { stdout } = await execAsync(
      `certbot --${server === 'apache' ? 'apache' : 'nginx'} -d ${req.params.domain} --non-interactive --agree-tos ${emailArg} --redirect 2>&1`,
      { timeout: 180000 }
    );
    auditLog(req.user.id, req.user.username, 'DOMAIN_SSL', req.params.domain, null, req.ip);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message, output: err.stdout || '' });
  }
});

function generateNginxConfig(domain, docRoot, phpVersion) {
  const phpSocket = phpVersion ? `/run/php/php${phpVersion}-fpm.sock` : '/run/php/php-fpm.sock';
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    root ${docRoot};
    index index.php index.html index.htm;

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${phpSocket};
    }

    location ~ /\\.ht {
        deny all;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
`;
}

function generateApacheConfig(domain, docRoot, phpVersion) {
  return `<VirtualHost *:80>
    ServerName ${domain}
    ServerAlias www.${domain}
    DocumentRoot ${docRoot}

    ErrorLog \${APACHE_LOG_DIR}/${domain}.error.log
    CustomLog \${APACHE_LOG_DIR}/${domain}.access.log combined

    <Directory ${docRoot}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
`;
}

module.exports = router;
