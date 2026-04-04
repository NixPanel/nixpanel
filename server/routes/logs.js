const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateToken } = require('../middleware/auth');

const execAsync = promisify(exec);
const router = express.Router();

const ALLOWED_LOG_DIRS = ['/var/log'];
const BLOCKED_PATTERNS = ['..', '~', '$', '`', ';', '|', '&', '>', '<', '!'];

function sanitizeLogPath(filePath) {
  // Normalize and validate path
  const normalized = path.normalize(filePath);
  if (BLOCKED_PATTERNS.some(p => normalized.includes(p))) {
    throw new Error('Invalid path');
  }
  const allowed = ALLOWED_LOG_DIRS.some(dir => normalized.startsWith(dir));
  if (!allowed) {
    throw new Error('Access denied: path outside allowed directories');
  }
  return normalized;
}

// GET /api/logs/files - List available log files
router.get('/files', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'find /var/log -maxdepth 3 -name "*.log" -o -name "syslog" -o -name "messages" -o -name "auth.log" -o -name "kern.log" -o -name "dmesg" 2>/dev/null | sort | head -100',
      { timeout: 10000 }
    );

    const files = stdout.split('\n')
      .filter(f => f.trim())
      .map(f => {
        try {
          const stat = fs.statSync(f);
          return {
            path: f,
            name: path.basename(f),
            size: stat.size,
            modified: stat.mtime,
          };
        } catch (_) {
          return { path: f, name: path.basename(f), size: 0, modified: null };
        }
      });

    res.json({ files });
  } catch (err) {
    console.error('[Logs] Files error:', err);
    res.status(500).json({ error: 'Failed to list log files' });
  }
});

// GET /api/logs/read?path=/var/log/syslog&lines=100
router.get('/read', authenticateToken, async (req, res) => {
  const { lines = 100, search } = req.query;
  const logPath = req.query.path;

  if (!logPath) {
    return res.status(400).json({ error: 'Log path required' });
  }

  try {
    const safePath = sanitizeLogPath(logPath);
    const lineCount = Math.min(parseInt(lines) || 100, 1000);

    let cmd;
    if (search) {
      // Sanitize search term: only allow alphanumeric and basic chars
      const safeSearch = search.replace(/[^a-zA-Z0-9 ._\-@]/g, '');
      cmd = `tail -n ${lineCount * 2} "${safePath}" 2>/dev/null | grep -i "${safeSearch}" | tail -n ${lineCount}`;
    } else {
      cmd = `tail -n ${lineCount} "${safePath}" 2>/dev/null`;
    }

    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    res.json({ path: safePath, content: stdout });
  } catch (err) {
    if (err.message.includes('Access denied') || err.message.includes('Invalid path')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to read log file' });
  }
});

// GET /api/logs/journal?unit=sshd&lines=100
router.get('/journal', authenticateToken, async (req, res) => {
  const { unit, lines = 100, since, priority } = req.query;

  let cmd = `journalctl --no-pager -n ${Math.min(parseInt(lines) || 100, 1000)}`;

  if (unit) {
    const safeUnit = unit.replace(/[^a-zA-Z0-9@._\-]/g, '');
    cmd += ` -u ${safeUnit}.service`;
  }

  if (since) {
    // Only allow relative time like "1h", "30m", "7d"
    if (/^\d+[mhd]$/.test(since)) {
      cmd += ` --since "-${since}"`;
    }
  }

  if (priority && /^[0-7]$/.test(priority)) {
    cmd += ` -p ${priority}`;
  }

  cmd += ' 2>&1 || echo "journalctl not available"';

  try {
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    res.json({ content: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read journal' });
  }
});

// GET /api/logs/dmesg
router.get('/dmesg', authenticateToken, async (req, res) => {
  try {
    const lines = Math.min(parseInt(req.query.lines) || 100, 500);
    const { stdout } = await execAsync(`dmesg --time-format=ctime 2>/dev/null | tail -n ${lines}`, { timeout: 10000 });
    res.json({ content: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read dmesg' });
  }
});

module.exports = router;
