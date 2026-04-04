const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

// Detect package manager
async function detectPackageManager() {
  const managers = [
    { name: 'apt', check: 'which apt-get', list: 'dpkg -l', search: 'apt-cache search' },
    { name: 'dnf', check: 'which dnf', list: 'dnf list installed', search: 'dnf search' },
    { name: 'yum', check: 'which yum', list: 'yum list installed', search: 'yum search' },
    { name: 'pacman', check: 'which pacman', list: 'pacman -Q', search: 'pacman -Ss' },
    { name: 'apk', check: 'which apk', list: 'apk list --installed', search: 'apk search' },
    { name: 'zypper', check: 'which zypper', list: 'zypper packages --installed-only', search: 'zypper search' },
  ];

  for (const mgr of managers) {
    try {
      await execAsync(mgr.check);
      return mgr;
    } catch (_) {
      continue;
    }
  }
  return null;
}

function sanitizePackageName(name) {
  // Only allow alphanumeric, hyphens, dots, underscores, plus signs
  if (!/^[a-zA-Z0-9._+\-]+$/.test(name)) {
    throw new Error('Invalid package name');
  }
  return name;
}

// GET /api/packages/manager
router.get('/manager', authenticateToken, async (req, res) => {
  try {
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }
    res.json({ manager: mgr.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to detect package manager' });
  }
});

// GET /api/packages/installed
router.get('/installed', authenticateToken, async (req, res) => {
  try {
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }

    let packages = [];
    const { stdout } = await execAsync(mgr.list, { timeout: 30000 });

    if (mgr.name === 'apt') {
      packages = stdout.split('\n')
        .filter(line => line.startsWith('ii'))
        .map(line => {
          const parts = line.split(/\s+/);
          return { name: parts[1], version: parts[2], description: parts.slice(4).join(' ') };
        });
    } else if (mgr.name === 'dnf' || mgr.name === 'yum') {
      packages = stdout.split('\n')
        .filter(line => line.includes('@'))
        .map(line => {
          const parts = line.trim().split(/\s+/);
          return { name: parts[0], version: parts[1], description: '' };
        });
    } else if (mgr.name === 'pacman') {
      packages = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.trim().split(/\s+/);
          return { name: parts[0], version: parts[1], description: '' };
        });
    } else if (mgr.name === 'apk') {
      packages = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/^(.+?)-(\d[^\s]*)\s/);
          if (match) return { name: match[1], version: match[2], description: '' };
          return { name: line.trim(), version: '', description: '' };
        })
        .filter(p => p.name);
    }

    res.json({ manager: mgr.name, count: packages.length, packages });
  } catch (err) {
    console.error('[Packages] List error:', err);
    res.status(500).json({ error: 'Failed to list packages' });
  }
});

// GET /api/packages/updates
router.get('/updates', authenticateToken, async (req, res) => {
  try {
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }

    let updates = [];
    let command;

    if (mgr.name === 'apt') {
      command = 'apt-get -s upgrade 2>/dev/null | grep "^Inst" | head -50';
    } else if (mgr.name === 'dnf') {
      command = 'dnf check-update --quiet 2>/dev/null | head -50';
    } else if (mgr.name === 'pacman') {
      command = 'pacman -Qu 2>/dev/null | head -50';
    } else {
      return res.json({ manager: mgr.name, count: 0, updates: [] });
    }

    const { stdout } = await execAsync(command, { timeout: 60000 }).catch(() => ({ stdout: '' }));
    updates = stdout.split('\n').filter(line => line.trim()).map(line => ({ package: line.trim() }));

    res.json({ manager: mgr.name, count: updates.length, updates });
  } catch (err) {
    console.error('[Packages] Updates error:', err);
    res.status(500).json({ error: 'Failed to check updates' });
  }
});

// POST /api/packages/install
router.post('/install', authenticateToken, requireRole('admin'), async (req, res) => {
  const { packageName } = req.body;

  try {
    const safe = sanitizePackageName(packageName);
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }

    let command;
    if (mgr.name === 'apt') command = `apt-get install -y ${safe}`;
    else if (mgr.name === 'dnf') command = `dnf install -y ${safe}`;
    else if (mgr.name === 'yum') command = `yum install -y ${safe}`;
    else if (mgr.name === 'pacman') command = `pacman -S --noconfirm ${safe}`;
    else if (mgr.name === 'apk') command = `apk add ${safe}`;
    else if (mgr.name === 'zypper') command = `zypper install -y ${safe}`;
    else return res.status(400).json({ error: 'Unsupported package manager' });

    auditLog(req.user.id, req.user.username, 'PACKAGE_INSTALL', safe, null, req.ip);

    const { stdout, stderr } = await execAsync(command, { timeout: 120000 });
    res.json({ success: true, output: stdout + stderr });
  } catch (err) {
    console.error('[Packages] Install error:', err);
    res.status(500).json({ error: err.message || 'Installation failed' });
  }
});

// DELETE /api/packages/:name
router.delete('/:name', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const safe = sanitizePackageName(req.params.name);
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }

    let command;
    if (mgr.name === 'apt') command = `apt-get remove -y ${safe}`;
    else if (mgr.name === 'dnf') command = `dnf remove -y ${safe}`;
    else if (mgr.name === 'yum') command = `yum remove -y ${safe}`;
    else if (mgr.name === 'pacman') command = `pacman -R --noconfirm ${safe}`;
    else if (mgr.name === 'apk') command = `apk del ${safe}`;
    else return res.status(400).json({ error: 'Unsupported package manager' });

    auditLog(req.user.id, req.user.username, 'PACKAGE_REMOVE', safe, null, req.ip);

    const { stdout, stderr } = await execAsync(command, { timeout: 120000 });
    res.json({ success: true, output: stdout + stderr });
  } catch (err) {
    console.error('[Packages] Remove error:', err);
    res.status(500).json({ error: err.message || 'Removal failed' });
  }
});

// GET /api/packages/search?q=query
router.get('/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query too short' });
  }

  try {
    const safe = sanitizePackageName(q);
    const mgr = await detectPackageManager();
    if (!mgr) {
      return res.status(404).json({ error: 'No supported package manager found' });
    }

    let command;
    if (mgr.name === 'apt') command = `apt-cache search ${safe} 2>/dev/null | head -30`;
    else if (mgr.name === 'dnf') command = `dnf search ${safe} 2>/dev/null | head -30`;
    else if (mgr.name === 'pacman') command = `pacman -Ss ${safe} 2>/dev/null | head -30`;
    else if (mgr.name === 'apk') command = `apk search ${safe} 2>/dev/null | head -30`;
    else return res.json({ results: [] });

    const { stdout } = await execAsync(command, { timeout: 30000 }).catch(() => ({ stdout: '' }));
    const results = stdout.split('\n').filter(line => line.trim()).map(line => ({ name: line.trim() }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
