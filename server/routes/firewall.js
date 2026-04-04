const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getDb, auditLog } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const execAsync = promisify(exec);
const router = express.Router();

// GET /api/firewall/rules - Get current iptables rules
router.get('/rules', authenticateToken, async (req, res) => {
  try {
    const [iptablesOut, ip6tablesOut] = await Promise.allSettled([
      execAsync('iptables -L -n --line-numbers -v 2>&1', { timeout: 10000 }),
      execAsync('ip6tables -L -n --line-numbers -v 2>&1', { timeout: 10000 }),
    ]);

    // Also get UFW status if available
    const ufwOut = await execAsync('ufw status verbose 2>/dev/null || echo "UFW not available"', { timeout: 10000 }).catch(() => ({ stdout: 'UFW not available' }));

    res.json({
      iptables: iptablesOut.status === 'fulfilled' ? iptablesOut.value.stdout : 'iptables not available',
      ip6tables: ip6tablesOut.status === 'fulfilled' ? ip6tablesOut.value.stdout : 'ip6tables not available',
      ufw: ufwOut.stdout,
    });
  } catch (err) {
    console.error('[Firewall] Rules error:', err);
    res.status(500).json({ error: 'Failed to get firewall rules' });
  }
});

// GET /api/firewall/ufw - UFW status
router.get('/ufw', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('ufw status numbered 2>&1', { timeout: 10000 });
    res.json({ output: stdout });
  } catch (err) {
    res.json({ output: 'UFW not available or not installed', error: true });
  }
});

// POST /api/firewall/ufw/enable
router.post('/ufw/enable', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { stdout } = await execAsync('ufw --force enable 2>&1', { timeout: 15000 });
    auditLog(req.user.id, req.user.username, 'FIREWALL_UFW_ENABLE', 'firewall', null, req.ip);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/firewall/ufw/disable
router.post('/ufw/disable', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { stdout } = await execAsync('ufw disable 2>&1', { timeout: 15000 });
    auditLog(req.user.id, req.user.username, 'FIREWALL_UFW_DISABLE', 'firewall', null, req.ip);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/firewall/ufw/rule - Add UFW rule
router.post('/ufw/rule', authenticateToken, requireRole('admin'), async (req, res) => {
  const { action, port, protocol, from, comment } = req.body;

  if (!action || !['allow', 'deny', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be allow, deny, or reject' });
  }

  if (!port || !/^\d{1,5}(:\d{1,5})?$/.test(String(port))) {
    return res.status(400).json({ error: 'Invalid port number' });
  }

  const proto = protocol && ['tcp', 'udp'].includes(protocol) ? `/${protocol}` : '';
  const fromClause = from && /^[\d./a-zA-Z:]+$/.test(from) ? ` from ${from}` : '';
  const commentClause = comment ? ` comment '${comment.replace(/'/g, '')}'` : '';

  try {
    const cmd = `ufw ${action}${fromClause} to any port ${port}${proto}${commentClause} 2>&1`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });

    auditLog(req.user.id, req.user.username, 'FIREWALL_RULE_ADD', `${action}:${port}`, { port, protocol, from }, req.ip);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/firewall/ufw/rule/:ruleNumber
router.delete('/ufw/rule/:ruleNumber', authenticateToken, requireRole('admin'), async (req, res) => {
  const ruleNum = parseInt(req.params.ruleNumber);
  if (!ruleNum || ruleNum < 1 || ruleNum > 999) {
    return res.status(400).json({ error: 'Invalid rule number' });
  }

  try {
    const { stdout } = await execAsync(`ufw --force delete ${ruleNum} 2>&1`, { timeout: 15000 });
    auditLog(req.user.id, req.user.username, 'FIREWALL_RULE_DELETE', String(ruleNum), null, req.ip);
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firewall/connections - Active network connections
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('ss -tunp 2>/dev/null || netstat -tunp 2>/dev/null || echo "No network tools available"', { timeout: 10000 });
    res.json({ connections: stdout });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

module.exports = router;
