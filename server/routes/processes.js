const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const si = require('systeminformation');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

function validatePid(pid) {
  const n = parseInt(pid);
  if (isNaN(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error('Invalid PID');
  }
  if (n === 1) {
    throw new Error('Cannot signal PID 1 (init)');
  }
  if (n === process.pid) {
    throw new Error('Cannot signal the current process');
  }
  return n;
}

// GET /api/processes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const procs = await si.processes();
    const list = procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        user: p.user,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        memRss: p.memRss,
        state: p.state,
        command: p.command,
        priority: p.priority,
        nice: p.nice,
        started: p.started,
      }));

    res.json({
      total: procs.all,
      running: procs.running,
      sleeping: procs.sleeping,
      blocked: procs.blocked,
      processes: list,
    });
  } catch (err) {
    console.error('[Processes] List error:', err);
    res.status(500).json({ error: 'Failed to list processes' });
  }
});

// POST /api/processes/:pid/kill
router.post('/:pid/kill', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const { signal = 'SIGTERM' } = req.body;

  const validSignals = ['SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGINT'];
  if (!validSignals.includes(signal)) {
    return res.status(400).json({ error: 'Invalid signal' });
  }

  try {
    const pid = validatePid(req.params.pid);

    // Check process exists
    try {
      process.kill(pid, 0);
    } catch (err) {
      if (err.code === 'ESRCH') {
        return res.status(404).json({ error: 'Process not found' });
      }
      // EPERM means it exists but we can't check it - continue
    }

    auditLog(req.user.id, req.user.username, 'PROCESS_KILL', `${pid} ${signal}`, null, req.ip);

    await execAsync(`kill -${signal} ${pid}`, { timeout: 5000 });
    res.json({ success: true, pid, signal });
  } catch (err) {
    if (err.message.includes('PID') || err.message.includes('signal') || err.message.includes('current')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Processes] Kill error:', err);
    res.status(500).json({ error: err.message || 'Failed to kill process' });
  }
});

// POST /api/processes/:pid/renice
router.post('/:pid/renice', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const { nice } = req.body;
  const niceVal = parseInt(nice);

  if (isNaN(niceVal) || niceVal < -20 || niceVal > 19) {
    return res.status(400).json({ error: 'Nice value must be between -20 and 19' });
  }

  try {
    const pid = validatePid(req.params.pid);

    auditLog(req.user.id, req.user.username, 'PROCESS_RENICE', `${pid} nice=${niceVal}`, null, req.ip);

    const { stdout } = await execAsync(`renice ${niceVal} -p ${pid} 2>&1`, { timeout: 5000 });
    res.json({ success: true, pid, nice: niceVal, output: stdout.trim() });
  } catch (err) {
    if (err.message.includes('PID') || err.message.includes('init') || err.message.includes('current')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Processes] Renice error:', err);
    res.status(500).json({ error: err.message || 'Failed to renice process' });
  }
});

module.exports = router;
