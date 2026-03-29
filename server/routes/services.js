const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

function sanitizeServiceName(name) {
  if (!/^[a-zA-Z0-9@._\-]+$/.test(name)) {
    throw new Error('Invalid service name');
  }
  return name;
}

async function isSystemd() {
  try {
    await execAsync('systemctl --version', { timeout: 5000 });
    return true;
  } catch (_) {
    return false;
  }
}

// GET /api/services - List all services
router.get('/', authenticateToken, async (req, res) => {
  try {
    const systemd = await isSystemd();
    if (!systemd) {
      return res.status(503).json({ error: 'systemd not available on this system' });
    }

    const { stdout } = await execAsync(
      'systemctl list-units --type=service --all --no-pager --output=json 2>/dev/null || systemctl list-units --type=service --all --no-pager 2>/dev/null',
      { timeout: 15000 }
    );

    let services = [];
    try {
      services = JSON.parse(stdout).map(s => ({
        name: s.unit.replace('.service', ''),
        fullName: s.unit,
        load: s.load,
        active: s.active,
        sub: s.sub,
        description: s.description,
      }));
    } catch (_) {
      // Parse text format fallback
      services = stdout.split('\n')
        .filter(line => line.includes('.service'))
        .map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            name: (parts[0] || '').replace('.service', ''),
            fullName: parts[0] || '',
            load: parts[1] || '',
            active: parts[2] || '',
            sub: parts[3] || '',
            description: parts.slice(4).join(' ') || '',
          };
        })
        .filter(s => s.name);
    }

    res.json({ services, total: services.length });
  } catch (err) {
    console.error('[Services] List error:', err);
    res.status(500).json({ error: 'Failed to list services' });
  }
});

// GET /api/services/:name/status
router.get('/:name/status', authenticateToken, async (req, res) => {
  try {
    const name = sanitizeServiceName(req.params.name);
    const { stdout } = await execAsync(
      `systemctl status ${name}.service --no-pager -l 2>&1 || true`,
      { timeout: 10000 }
    );
    res.json({ name, status: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

// GET /api/services/:name/logs
router.get('/:name/logs', authenticateToken, async (req, res) => {
  try {
    const name = sanitizeServiceName(req.params.name);
    const lines = Math.min(parseInt(req.query.lines) || 100, 500);
    const { stdout } = await execAsync(
      `journalctl -u ${name}.service --no-pager -n ${lines} 2>&1 || echo "journalctl not available"`,
      { timeout: 15000 }
    );
    res.json({ name, logs: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get service logs' });
  }
});

// POST /api/services/:name/:action
router.post('/:name/:action', authenticateToken, requireRole('admin', 'operator'), async (req, res) => {
  const allowedActions = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];

  try {
    const name = sanitizeServiceName(req.params.name);
    const { action } = req.params;

    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Allowed: ' + allowedActions.join(', ') });
    }

    // Extra safety: prevent stopping critical services
    const criticalServices = ['sshd', 'ssh', 'networking', 'network', 'systemd-networkd'];
    if (action === 'stop' && criticalServices.includes(name)) {
      return res.status(403).json({ error: 'Cannot stop critical system services' });
    }

    const { stdout, stderr } = await execAsync(
      `sudo systemctl ${action} ${name}.service 2>&1 || true`,
      { timeout: 30000 }
    );

    auditLog(req.user.id, req.user.username, `SERVICE_${action.toUpperCase()}`, name, null, req.ip);

    res.json({ success: true, action, service: name, output: stdout + stderr });
  } catch (err) {
    console.error('[Services] Action error:', err);
    res.status(500).json({ error: err.message || 'Service action failed' });
  }
});

module.exports = router;
