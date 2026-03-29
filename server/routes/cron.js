const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

// Validate individual cron field
function isValidCronField(value, min, max) {
  if (value === '*') return true;
  if (/^\*\/\d+$/.test(value)) {
    const step = parseInt(value.split('/')[1]);
    return step >= 1 && step <= max;
  }
  if (/^\d+$/.test(value)) {
    const n = parseInt(value);
    return n >= min && n <= max;
  }
  if (/^\d+-\d+$/.test(value)) {
    const [a, b] = value.split('-').map(Number);
    return a >= min && b <= max && a <= b;
  }
  // Comma-separated
  if (value.includes(',')) {
    return value.split(',').every(v => isValidCronField(v.trim(), min, max));
  }
  return false;
}

function validateCronExpression(minute, hour, day, month, weekday) {
  if (!isValidCronField(String(minute), 0, 59)) return 'Invalid minute (0-59)';
  if (!isValidCronField(String(hour), 0, 23)) return 'Invalid hour (0-23)';
  if (!isValidCronField(String(day), 1, 31)) return 'Invalid day (1-31)';
  if (!isValidCronField(String(month), 1, 12)) return 'Invalid month (1-12)';
  if (!isValidCronField(String(weekday), 0, 7)) return 'Invalid weekday (0-7)';
  return null;
}

// Simple next-run calculation (approximate, not DST-aware)
function getNextRun(minute, hour, day, month, weekday) {
  try {
    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);

    const matchField = (value, current) => {
      if (value === '*') return true;
      if (/^\*\/(\d+)$/.test(value)) {
        const step = parseInt(value.split('/')[1]);
        return current % step === 0;
      }
      if (value.includes(',')) {
        return value.split(',').some(v => matchField(v.trim(), current));
      }
      if (/^\d+-\d+$/.test(value)) {
        const [a, b] = value.split('-').map(Number);
        return current >= a && current <= b;
      }
      return parseInt(value) === current;
    };

    for (let i = 0; i < 366 * 24 * 60; i++) {
      const m = next.getMinutes();
      const h = next.getHours();
      const dom = next.getDate();
      const mo = next.getMonth() + 1;
      const dow = next.getDay();

      if (
        matchField(String(minute), m) &&
        matchField(String(hour), h) &&
        matchField(String(day), dom) &&
        matchField(String(month), mo) &&
        matchField(String(weekday), dow)
      ) {
        return next.toISOString();
      }
      next.setMinutes(next.getMinutes() + 1);
    }
    return null;
  } catch (_) {
    return null;
  }
}

function sanitizeUsername(username) {
  if (!/^[a-zA-Z0-9_\-]+$/.test(username) || username.length > 32) {
    throw new Error('Invalid username');
  }
  return username;
}

function parseCrontabLine(line, source, user) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 6) return null;

  const [minute, hour, day, month, weekday, ...cmdParts] = parts;
  const command = cmdParts.join(' ');

  return {
    schedule: `${minute} ${hour} ${day} ${month} ${weekday}`,
    minute, hour, day, month, weekday,
    command,
    user: user || 'root',
    source,
    raw: trimmed,
    nextRun: getNextRun(minute, hour, day, month, weekday),
  };
}

// GET /api/cron - list all crontabs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const jobs = [];
    let idCounter = 0;

    // Read /etc/crontab
    try {
      const content = fs.readFileSync('/etc/crontab', 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 7) {
          const [minute, hour, day, month, weekday, user, ...cmdParts] = parts;
          const command = cmdParts.join(' ');
          jobs.push({
            id: `crontab-${idCounter++}`,
            schedule: `${minute} ${hour} ${day} ${month} ${weekday}`,
            minute, hour, day, month, weekday,
            command,
            user,
            source: '/etc/crontab',
            nextRun: getNextRun(minute, hour, day, month, weekday),
          });
        }
      });
    } catch (_) {}

    // Read /etc/cron.d/*
    try {
      const files = fs.readdirSync('/etc/cron.d');
      for (const file of files) {
        try {
          const content = fs.readFileSync(`/etc/cron.d/${file}`, 'utf8');
          content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 7) {
              const [minute, hour, day, month, weekday, user, ...cmdParts] = parts;
              const command = cmdParts.join(' ');
              jobs.push({
                id: `crond-${file}-${idCounter++}`,
                schedule: `${minute} ${hour} ${day} ${month} ${weekday}`,
                minute, hour, day, month, weekday,
                command,
                user,
                source: `/etc/cron.d/${file}`,
                nextRun: getNextRun(minute, hour, day, month, weekday),
              });
            }
          });
        } catch (_) {}
      }
    } catch (_) {}

    // Read user crontabs
    const users = req.user.role === 'admin' ? [] : [req.user.username];
    if (req.user.role === 'admin') {
      try {
        const { stdout } = await execAsync('getent passwd | cut -d: -f1', { timeout: 5000 });
        stdout.split('\n').filter(u => u.trim()).forEach(u => users.push(u.trim()));
      } catch (_) {
        users.push('root');
      }
    }

    for (const username of users) {
      try {
        const safe = sanitizeUsername(username);
        const { stdout } = await execAsync(`crontab -l -u ${safe} 2>/dev/null`, { timeout: 5000 });
        stdout.split('\n').forEach(line => {
          const job = parseCrontabLine(line, `crontab:${safe}`, safe);
          if (job) {
            job.id = `user-${safe}-${idCounter++}`;
            jobs.push(job);
          }
        });
      } catch (_) {}
    }

    res.json({ jobs });
  } catch (err) {
    console.error('[Cron] List error:', err);
    res.status(500).json({ error: 'Failed to list cron jobs' });
  }
});

// POST /api/cron/validate - validate cron expression
router.post('/validate', authenticateToken, (req, res) => {
  const { minute = '*', hour = '*', day = '*', month = '*', weekday = '*' } = req.body;
  const error = validateCronExpression(minute, hour, day, month, weekday);
  if (error) {
    return res.json({ valid: false, error });
  }
  const nextRun = getNextRun(minute, hour, day, month, weekday);
  res.json({ valid: true, nextRun });
});

// POST /api/cron - add a cron job
router.post('/', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const { minute = '*', hour = '*', day = '*', month = '*', weekday = '*', command, user } = req.body;

  if (!command || typeof command !== 'string' || command.length > 500) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  const cronError = validateCronExpression(minute, hour, day, month, weekday);
  if (cronError) {
    return res.status(400).json({ error: cronError });
  }

  // Sanitize command: no newlines
  if (/[\n\r]/.test(command)) {
    return res.status(400).json({ error: 'Command contains invalid characters' });
  }

  try {
    const targetUser = user || req.user.username;
    const safeUser = sanitizeUsername(targetUser);
    const cronLine = `${minute} ${hour} ${day} ${month} ${weekday} ${command}`;

    // Get existing crontab
    let existing = '';
    try {
      const { stdout } = await execAsync(`crontab -l -u ${safeUser} 2>/dev/null`, { timeout: 5000 });
      existing = stdout;
    } catch (_) {}

    const newCrontab = existing.trimEnd() + '\n' + cronLine + '\n';

    // Write via temp file
    const tmpFile = `/tmp/nixpanel-cron-${Date.now()}`;
    fs.writeFileSync(tmpFile, newCrontab, { mode: 0o600 });
    await execAsync(`crontab -u ${safeUser} ${tmpFile}`, { timeout: 5000 });
    fs.unlinkSync(tmpFile);

    auditLog(req.user.id, req.user.username, 'CRON_ADD', cronLine, null, req.ip);
    res.json({ success: true, schedule: cronLine });
  } catch (err) {
    console.error('[Cron] Add error:', err);
    res.status(500).json({ error: 'Failed to add cron job' });
  }
});

// PUT /api/cron/:id - edit a cron job (user crontab only)
router.put('/:id', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const { minute = '*', hour = '*', day = '*', month = '*', weekday = '*', command, user } = req.body;
  const { id } = req.params;

  if (!command || /[\n\r]/.test(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  const cronError = validateCronExpression(minute, hour, day, month, weekday);
  if (cronError) {
    return res.status(400).json({ error: cronError });
  }

  // id format: user-USERNAME-INDEX
  const idMatch = id.match(/^user-([^-]+)-(\d+)$/);
  if (!idMatch) {
    return res.status(400).json({ error: 'Can only edit user crontab entries' });
  }

  try {
    const targetUser = user || idMatch[1];
    const safeUser = sanitizeUsername(targetUser);

    let existing = '';
    try {
      const { stdout } = await execAsync(`crontab -l -u ${safeUser} 2>/dev/null`, { timeout: 5000 });
      existing = stdout;
    } catch (_) {}

    const lines = existing.split('\n');
    const cronLines = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
    const jobIndex = parseInt(idMatch[2]);

    // Replace the nth non-comment line
    let counter = 0;
    const newLines = lines.map(line => {
      if (line.trim() && !line.trim().startsWith('#')) {
        if (counter === jobIndex % cronLines.length) {
          counter++;
          return `${minute} ${hour} ${day} ${month} ${weekday} ${command}`;
        }
        counter++;
      }
      return line;
    });

    const tmpFile = `/tmp/nixpanel-cron-${Date.now()}`;
    fs.writeFileSync(tmpFile, newLines.join('\n'), { mode: 0o600 });
    await execAsync(`crontab -u ${safeUser} ${tmpFile}`, { timeout: 5000 });
    fs.unlinkSync(tmpFile);

    auditLog(req.user.id, req.user.username, 'CRON_EDIT', id, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    console.error('[Cron] Edit error:', err);
    res.status(500).json({ error: 'Failed to edit cron job' });
  }
});

// DELETE /api/cron/:id - delete a cron job
router.delete('/:id', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const { id } = req.params;

  const idMatch = id.match(/^user-([^-]+)-(\d+)$/);
  if (!idMatch) {
    return res.status(400).json({ error: 'Can only delete user crontab entries' });
  }

  try {
    const safeUser = sanitizeUsername(idMatch[1]);

    let existing = '';
    try {
      const { stdout } = await execAsync(`crontab -l -u ${safeUser} 2>/dev/null`, { timeout: 5000 });
      existing = stdout;
    } catch (_) {}

    const lines = existing.split('\n');
    const cronLines = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
    const jobIndex = parseInt(idMatch[2]);

    let counter = 0;
    const newLines = lines.filter(line => {
      if (line.trim() && !line.trim().startsWith('#')) {
        const keep = counter !== jobIndex % cronLines.length;
        counter++;
        return keep;
      }
      return true;
    });

    const tmpFile = `/tmp/nixpanel-cron-${Date.now()}`;
    fs.writeFileSync(tmpFile, newLines.join('\n'), { mode: 0o600 });
    await execAsync(`crontab -u ${safeUser} ${tmpFile}`, { timeout: 5000 });
    fs.unlinkSync(tmpFile);

    auditLog(req.user.id, req.user.username, 'CRON_DELETE', id, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    console.error('[Cron] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete cron job' });
  }
});

module.exports = router;
