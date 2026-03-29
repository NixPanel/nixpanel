const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { validateUsername, sanitizePath } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

// GET /api/hosting/ftp/accounts
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = [];
    // Get FTP users from passwd (shell = nologin or false)
    const { stdout } = await execAsync("getent passwd | awk -F: '$7 ~ /ftponly|nologin|false/ && $3>=1000 {print $1\"|\"$6}'", { timeout: 10000 });
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.split('|');
      const user = parts[0];
      const home = parts[1];
      if (user) accounts.push({ username: user, directory: home, enabled: true, type: 'system' });
    }

    // FTP server status
    let ftpStatus = 'inactive';
    let ftpServer = null;
    for (const svc of ['vsftpd', 'proftpd']) {
      try {
        const { stdout: s } = await execAsync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 5000 });
        if (s.trim() === 'active') { ftpStatus = 'active'; ftpServer = svc; break; }
        else if (s.trim() !== 'unknown' && s.trim() !== '') { ftpServer = svc; }
      } catch (_) {}
    }

    res.json({ accounts, ftpStatus, ftpServer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/ftp/accounts - create FTP account
router.post('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  const { username, password, directory } = req.body;
  if (!validateUsername(username)) return res.status(400).json({ error: 'Invalid username' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password too short' });

  try {
    const dir = directory ? sanitizePath(directory) : `/var/www/${username}`;
    // Create directory if not exists
    await execAsync(`mkdir -p "${dir}"`, { timeout: 10000 });

    // Create system user with restricted shell
    try {
      await execAsync(`useradd -m -d "${dir}" -s /usr/sbin/nologin ${username} 2>&1`, { timeout: 15000 });
    } catch (e) {
      if (!e.message.includes('already exists') && !e.stdout?.includes('already exists')) throw e;
    }
    // Use printf to avoid special character issues with chpasswd
    await execAsync(`printf '%s:%s' '${username}' '${password.replace(/'/g, "'\\''")}' | chpasswd`, { timeout: 10000 });
    await execAsync(`chown ${username}:${username} "${dir}" 2>/dev/null || true`, { timeout: 5000 });

    auditLog(req.user.id, req.user.username, 'FTP_CREATE', username, { directory: dir }, req.ip);
    res.status(201).json({ success: true, username, directory: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/ftp/accounts/:username
router.delete('/accounts/:username', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  try {
    await execAsync(`userdel ${req.params.username} 2>&1`, { timeout: 10000 });
    auditLog(req.user.id, req.user.username, 'FTP_DELETE', req.params.username, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hosting/ftp/accounts/:username/password
router.put('/accounts/:username/password', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password too short' });
  try {
    await execAsync(`printf '%s:%s' '${req.params.username}' '${password.replace(/'/g, "'\\''")}' | chpasswd`, { timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/ftp/connections - active FTP connections
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('ss -tnp | grep ":21 " 2>/dev/null || netstat -tnp 2>/dev/null | grep ":21 " || echo "No active connections"', { timeout: 10000 });
    res.json({ connections: stdout });
  } catch (err) {
    res.json({ connections: 'Unable to retrieve connections' });
  }
});

// GET /api/hosting/ftp/status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const services = {};
    for (const svc of ['vsftpd', 'proftpd']) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 5000 });
        services[svc] = stdout.trim();
      } catch (_) { services[svc] = 'not-installed'; }
    }
    // Get server IP
    let serverIp = '';
    try {
      const { stdout } = await execAsync("hostname -I | awk '{print $1}'", { timeout: 5000 });
      serverIp = stdout.trim();
    } catch (_) {}
    res.json({ services, serverIp, port: 21 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
