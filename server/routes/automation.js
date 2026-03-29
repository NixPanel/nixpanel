const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDb, auditLog } = require('../db/database');

const router = express.Router();

// Initialize automation tables and seed template scripts
function initAutomation() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS script_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER,
      script_name TEXT NOT NULL,
      output TEXT,
      exit_code INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      run_by TEXT
    );
  `);

  // Seed template scripts if table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM scripts').get();
  if (count.count === 0) {
    const templates = [
      {
        name: 'System Health Report',
        description: 'Comprehensive system health overview including uptime, disk, memory and CPU',
        content: `#!/bin/bash
echo "========================================"
echo "  SYSTEM HEALTH REPORT"
echo "  $(date)"
echo "========================================"
echo ""
echo "--- UPTIME ---"
uptime
echo ""
echo "--- DISK USAGE ---"
df -h
echo ""
echo "--- MEMORY ---"
free -h
echo ""
echo "--- TOP PROCESSES ---"
top -bn1 | head -20
echo ""
echo "--- LOAD AVERAGE ---"
cat /proc/loadavg
echo ""
echo "========================================"
echo "Report complete."
`,
      },
      {
        name: 'Disk Cleanup',
        description: 'Clean temp files, old journal logs, and remove unused packages',
        content: `#!/bin/bash
echo "Starting disk cleanup..."
echo ""
echo "--- Cleaning /tmp ---"
find /tmp -type f -atime +7 -delete 2>/dev/null && echo "Old /tmp files removed"
echo ""
echo "--- Vacuuming journal logs (keep last 7 days) ---"
journalctl --vacuum-time=7d
echo ""
echo "--- Removing unused packages ---"
if command -v apt-get &>/dev/null; then
  apt-get autoremove -y 2>&1
elif command -v dnf &>/dev/null; then
  dnf autoremove -y 2>&1
else
  echo "Package manager not found"
fi
echo ""
echo "--- Disk usage after cleanup ---"
df -h
echo ""
echo "Cleanup complete."
`,
      },
      {
        name: 'User Audit',
        description: 'Audit current users, recent logins and active sessions',
        content: `#!/bin/bash
echo "========================================"
echo "  USER AUDIT REPORT"
echo "  $(date)"
echo "========================================"
echo ""
echo "--- RECENT LOGINS (last 20) ---"
last -n 20
echo ""
echo "--- CURRENTLY LOGGED IN ---"
who
echo ""
echo "--- ACTIVE SESSIONS ---"
w
echo ""
echo "--- SYSTEM USERS (UID >= 1000) ---"
awk -F: '$3>=1000 {print $1, "(uid="$3", shell="$7")"}' /etc/passwd
echo ""
echo "--- SUDO GROUP MEMBERS ---"
grep -E '^sudo|^wheel' /etc/group 2>/dev/null || echo "None found"
echo ""
echo "Audit complete."
`,
      },
      {
        name: 'Security Check',
        description: 'Quick security audit: failed logins, SUID files, listening ports, and updates',
        content: `#!/bin/bash
echo "========================================"
echo "  SECURITY CHECK"
echo "  $(date)"
echo "========================================"
echo ""
echo "--- RECENT FAILED LOGINS ---"
lastb -n 20 2>/dev/null || echo "lastb not available"
echo ""
echo "--- SUID FILES (top 20) ---"
find / -perm /4000 -type f 2>/dev/null | head -20
echo ""
echo "--- LISTENING PORTS ---"
ss -tunlp 2>/dev/null
echo ""
echo "--- AVAILABLE UPDATES ---"
if command -v apt &>/dev/null; then
  apt list --upgradable 2>/dev/null | head -20
elif command -v dnf &>/dev/null; then
  dnf check-update --quiet 2>/dev/null | head -20
fi
echo ""
echo "--- FAIL2BAN STATUS ---"
fail2ban-client status 2>/dev/null || echo "fail2ban not available"
echo ""
echo "Security check complete."
`,
      },
      {
        name: 'Backup Script',
        description: 'Backup /etc and /home to /var/backups/nixpanel/',
        content: `#!/bin/bash
BACKUP_DIR="/var/backups/nixpanel"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/system-$DATE.tar.gz"

echo "Starting backup..."
echo "Backup file: $BACKUP_FILE"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Run backup
tar czf "$BACKUP_FILE" /etc /home 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "Backup successful!"
  echo "File: $BACKUP_FILE"
  echo "Size: $(du -sh "$BACKUP_FILE" | cut -f1)"
else
  echo ""
  echo "Backup failed!"
  exit 1
fi

# Show recent backups
echo ""
echo "--- Recent Backups ---"
ls -lh "$BACKUP_DIR" | tail -10
`,
      },
    ];

    const insert = db.prepare('INSERT INTO scripts (name, description, content, created_by) VALUES (?, ?, ?, ?)');
    for (const t of templates) {
      insert.run(t.name, t.description, t.content, 'system');
    }
    console.log('[Automation] Template scripts seeded');
  }
}

// Initialize on module load
try {
  initAutomation();
} catch (err) {
  console.error('[Automation] Init error:', err);
}

// All automation routes require auth
router.use(authenticateToken, requireRole('admin'));

// GET /api/automation/scripts
router.get('/scripts', async (req, res) => {
  try {
    const db = getDb();
    const scripts = db.prepare(`
      SELECT s.*,
        (SELECT started_at FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1) as last_run,
        (SELECT exit_code FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1) as last_exit_code
      FROM scripts s
      ORDER BY s.name
    `).all();
    res.json({ scripts });
  } catch (err) {
    console.error('[Automation] List scripts error:', err);
    res.status(500).json({ error: 'Failed to list scripts' });
  }
});

// POST /api/automation/scripts
router.post('/scripts', async (req, res) => {
  const { name, description, content } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Script name is required' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Script content is required' });
  }
  if (name.length > 100) {
    return res.status(400).json({ error: 'Script name too long (max 100 chars)' });
  }

  try {
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO scripts (name, description, content, created_by) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), description?.trim() || '', content, req.user.username);

    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(result.lastInsertRowid);
    auditLog(req.user.id, req.user.username, 'SCRIPT_CREATE', `script:${result.lastInsertRowid}`, { name }, req.ip);

    res.status(201).json({ script });
  } catch (err) {
    console.error('[Automation] Create script error:', err);
    res.status(500).json({ error: 'Failed to create script' });
  }
});

// PUT /api/automation/scripts/:id
router.put('/scripts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid script ID' });

  const { name, description, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content are required' });

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM scripts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Script not found' });

    db.prepare(
      'UPDATE scripts SET name = ?, description = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name.trim(), description?.trim() || '', content, id);

    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
    auditLog(req.user.id, req.user.username, 'SCRIPT_UPDATE', `script:${id}`, { name }, req.ip);

    res.json({ script });
  } catch (err) {
    console.error('[Automation] Update script error:', err);
    res.status(500).json({ error: 'Failed to update script' });
  }
});

// DELETE /api/automation/scripts/:id
router.delete('/scripts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid script ID' });

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Script not found' });

    db.prepare('DELETE FROM scripts WHERE id = ?').run(id);
    auditLog(req.user.id, req.user.username, 'SCRIPT_DELETE', `script:${id}`, { name: existing.name }, req.ip);

    res.json({ success: true });
  } catch (err) {
    console.error('[Automation] Delete script error:', err);
    res.status(500).json({ error: 'Failed to delete script' });
  }
});

// POST /api/automation/scripts/:id/run - SSE stream
router.post('/scripts/:id/run', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid script ID' });

  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Write temp script file
  const tmpFile = path.join(os.tmpdir(), `nixpanel_script_${Date.now()}_${Math.random().toString(36).slice(2)}.sh`);

  let runId;
  let output = '';
  const startedAt = new Date().toISOString();

  try {
    fs.writeFileSync(tmpFile, script.content, { mode: 0o700 });

    // Create run record
    const runResult = db.prepare(
      'INSERT INTO script_runs (script_id, script_name, output, exit_code, started_at, run_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, script.name, '', null, startedAt, req.user.username);
    runId = runResult.lastInsertRowid;

    auditLog(req.user.id, req.user.username, 'SCRIPT_RUN', `script:${id}`, { name: script.name }, req.ip);

    res.write(`data: ${JSON.stringify({ type: 'start', scriptName: script.name, runId })}\n\n`);

    await new Promise((resolve) => {
      const proc = spawn('bash', [tmpFile], {
        env: { ...process.env, PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },
        timeout: 5 * 60 * 1000,
      });

      // Kill on timeout
      const timeoutHandle = setTimeout(() => {
        proc.kill('SIGKILL');
        const msg = '\n[Script timed out after 5 minutes]\n';
        output += msg;
        res.write(`data: ${JSON.stringify({ type: 'output', text: msg })}\n\n`);
      }, 5 * 60 * 1000);

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);

        // Update run record
        try {
          db.prepare(
            'UPDATE script_runs SET output = ?, exit_code = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(output, code, runId);
        } catch (_) {}

        res.write(`data: ${JSON.stringify({ type: 'done', exitCode: code })}\n\n`);
        res.end();
        resolve();
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        const msg = `\n[Process error: ${err.message}]\n`;
        output += msg;
        res.write(`data: ${JSON.stringify({ type: 'error', text: msg })}\n\n`);
        res.end();
        resolve();
      });

      // Handle client disconnect
      req.on('close', () => {
        proc.kill('SIGTERM');
        clearTimeout(timeoutHandle);
        resolve();
      });
    });

  } catch (err) {
    console.error('[Automation] Run script error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', text: err.message })}\n\n`);
    res.end();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// GET /api/automation/runs
router.get('/runs', async (req, res) => {
  try {
    const db = getDb();
    const runs = db.prepare(`
      SELECT id, script_id, script_name, exit_code, started_at, finished_at, run_by,
        CASE WHEN finished_at IS NOT NULL
          THEN ROUND((julianday(finished_at) - julianday(started_at)) * 86400)
          ELSE NULL END as duration_seconds
      FROM script_runs
      ORDER BY started_at DESC
      LIMIT 50
    `).all();
    res.json({ runs });
  } catch (err) {
    console.error('[Automation] List runs error:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// GET /api/automation/runs/:id/output
router.get('/runs/:id/output', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });

  try {
    const db = getDb();
    const run = db.prepare('SELECT * FROM script_runs WHERE id = ?').get(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    res.json({ run });
  } catch (err) {
    console.error('[Automation] Get run output error:', err);
    res.status(500).json({ error: 'Failed to get run output' });
  }
});

module.exports = router;
