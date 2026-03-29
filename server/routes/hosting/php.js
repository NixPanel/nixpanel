const express = require('express');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { detectPkgManager } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

const SUPPORTED_VERSIONS = ['7.4', '8.0', '8.1', '8.2', '8.3'];

async function getInstalledPHPVersions() {
  const installed = [];
  for (const v of SUPPORTED_VERSIONS) {
    try {
      const { stdout } = await execAsync(`php${v} --version 2>/dev/null | head -1`, { timeout: 5000 });
      if (stdout.includes('PHP')) {
        let fpmStatus = 'unknown';
        try {
          const { stdout: ss } = await execAsync(`systemctl is-active php${v}-fpm 2>/dev/null`, { timeout: 5000 });
          fpmStatus = ss.trim();
        } catch (_) {}
        installed.push({ version: v, status: 'installed', fpmStatus, path: `/usr/bin/php${v}` });
      }
    } catch (_) {}
  }
  // Also check generic php
  try {
    const { stdout } = await execAsync('php --version 2>/dev/null | head -1', { timeout: 5000 });
    const match = stdout.match(/PHP (\d+\.\d+)/);
    if (match && !installed.find(i => i.version === match[1])) {
      installed.push({ version: match[1], status: 'installed', fpmStatus: 'default', path: '/usr/bin/php' });
    }
  } catch (_) {}
  return installed;
}

// GET /api/hosting/php/versions
router.get('/versions', authenticateToken, async (req, res) => {
  try {
    const installed = await getInstalledPHPVersions();
    res.json({ versions: installed, supported: SUPPORTED_VERSIONS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/php/install/:version - SSE streaming install
router.post('/install/:version', authenticateToken, requireRole('admin'), async (req, res) => {
  const { version } = req.params;
  if (!SUPPORTED_VERSIONS.includes(version)) return res.status(400).json({ error: 'Unsupported PHP version' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const pkgMgr = await detectPkgManager();
    let cmd;
    if (pkgMgr === 'apt') {
      cmd = `add-apt-repository -y ppa:ondrej/php 2>&1 && apt-get update 2>&1 && apt-get install -y php${version} php${version}-fpm php${version}-mysql php${version}-curl php${version}-gd php${version}-mbstring php${version}-xml php${version}-zip php${version}-bcmath php${version}-intl 2>&1`;
    } else if (pkgMgr === 'dnf' || pkgMgr === 'yum') {
      cmd = `${pkgMgr} install -y https://rpms.remirepo.net/enterprise/remi-release-9.rpm 2>&1 && ${pkgMgr} module enable php:remi-${version} -y 2>&1 && ${pkgMgr} install -y php${version.replace('.', '')} php${version.replace('.', '')}-php-fpm php${version.replace('.', '')}-php-mysqlnd 2>&1`;
    } else {
      send({ error: 'Unsupported package manager' });
      return res.end();
    }

    const child = spawn('bash', ['-c', cmd], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
    child.stdout.on('data', d => send({ text: d.toString() }));
    child.stderr.on('data', d => send({ text: d.toString() }));
    child.on('close', (code) => {
      send({ done: true, exitCode: code });
      res.end();
      auditLog(null, 'system', 'PHP_INSTALL', version, { exitCode: code }, null);
    });
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

// GET /api/hosting/php/:version/ini - get php.ini settings
router.get('/:version/ini', authenticateToken, async (req, res) => {
  const { version } = req.params;
  if (!SUPPORTED_VERSIONS.includes(version) && version !== 'default') return res.status(400).json({ error: 'Invalid version' });

  try {
    // Find php.ini path
    let iniPath = `/etc/php/${version}/fpm/php.ini`;
    if (!fs.existsSync(iniPath)) iniPath = `/etc/php/${version}/cli/php.ini`;
    if (!fs.existsSync(iniPath)) iniPath = '/etc/php.ini';
    if (!fs.existsSync(iniPath)) {
      try {
        const { stdout } = await execAsync(`php${version} --ini 2>/dev/null | grep "Loaded Configuration" | awk '{print $NF}'`, { timeout: 5000 });
        iniPath = stdout.trim();
      } catch (_) {}
    }

    const settings = {};
    const importantKeys = ['memory_limit', 'upload_max_filesize', 'post_max_size', 'max_execution_time', 'max_input_time', 'display_errors', 'error_reporting', 'date.timezone', 'max_file_uploads'];
    if (fs.existsSync(iniPath)) {
      const content = fs.readFileSync(iniPath, 'utf-8');
      for (const key of importantKeys) {
        const escapedKey = key.replace('.', '\\.');
        const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)`, 'm'));
        if (match) settings[key] = match[1].trim();
      }
    }
    res.json({ version, iniPath, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hosting/php/:version/ini - update php.ini settings
router.put('/:version/ini', authenticateToken, requireRole('admin'), async (req, res) => {
  const { version } = req.params;
  if (!SUPPORTED_VERSIONS.includes(version)) return res.status(400).json({ error: 'Invalid version' });
  const { settings } = req.body;

  const allowedKeys = ['memory_limit', 'upload_max_filesize', 'post_max_size', 'max_execution_time', 'max_input_time', 'display_errors', 'date.timezone', 'max_file_uploads'];
  const allowedValues = /^[\w\s.\/:,\-+!@#%^&*()=\[\]{}|;'<>?~`"]+$/;

  for (const [k, v] of Object.entries(settings)) {
    if (!allowedKeys.includes(k)) return res.status(400).json({ error: `Disallowed key: ${k}` });
    if (!allowedValues.test(String(v))) return res.status(400).json({ error: `Invalid value for ${k}` });
  }

  try {
    let iniPath = `/etc/php/${version}/fpm/php.ini`;
    if (!fs.existsSync(iniPath)) iniPath = `/etc/php/${version}/cli/php.ini`;
    if (!fs.existsSync(iniPath)) return res.status(404).json({ error: 'php.ini not found' });

    fs.copyFileSync(iniPath, iniPath + '.nixpanel.bak');
    let content = fs.readFileSync(iniPath, 'utf-8');

    for (const [k, v] of Object.entries(settings)) {
      const escapedKey = k.replace('.', '\\.');
      const regex = new RegExp(`^(\\s*;?\\s*${escapedKey}\\s*=).*`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${k} = ${v}`);
      } else {
        content += `\n${k} = ${v}\n`;
      }
    }
    fs.writeFileSync(iniPath, content);

    // Restart FPM
    await execAsync(`systemctl restart php${version}-fpm 2>/dev/null || true`, { timeout: 15000 });
    auditLog(req.user.id, req.user.username, 'PHP_INI_EDIT', version, settings, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/php/:version/restart
router.post('/:version/restart', authenticateToken, requireRole('admin'), async (req, res) => {
  const { version } = req.params;
  if (!SUPPORTED_VERSIONS.includes(version)) return res.status(400).json({ error: 'Invalid version' });
  try {
    await execAsync(`systemctl restart php${version}-fpm`, { timeout: 15000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
