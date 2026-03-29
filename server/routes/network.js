const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const si = require('systeminformation');
const { authenticateToken, requireRole } = require('../middleware/auth');

const execAsync = promisify(exec);
const router = express.Router();

const HOST_REGEX = /^[a-zA-Z0-9.\-]+$/;
const MAX_HOST_LEN = 253;

function sanitizeHost(host) {
  if (!host || typeof host !== 'string') throw new Error('Host is required');
  const h = host.trim();
  if (!HOST_REGEX.test(h) || h.length > MAX_HOST_LEN) {
    throw new Error('Invalid hostname or IP address');
  }
  return h;
}

// POST /api/network/ping
router.post('/ping', authenticateToken, async (req, res) => {
  const { host } = req.body;

  try {
    const safeHost = sanitizeHost(host);
    const { stdout, stderr } = await execAsync(
      `ping -c 4 -W 10 ${safeHost} 2>&1`,
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || '' }));

    res.json({ output: stdout + stderr, host: safeHost });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/network/traceroute
router.post('/traceroute', authenticateToken, async (req, res) => {
  const { host } = req.body;

  try {
    const safeHost = sanitizeHost(host);

    // Try traceroute, fall back to tracepath
    let cmd = 'traceroute';
    try {
      await execAsync('which traceroute', { timeout: 3000 });
    } catch (_) {
      cmd = 'tracepath';
    }

    const { stdout, stderr } = await execAsync(
      `${cmd} -m 20 ${safeHost} 2>&1`,
      { timeout: 60000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || '' }));

    res.json({ output: stdout + stderr, host: safeHost });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/network/dns
router.post('/dns', authenticateToken, async (req, res) => {
  const { host, type = 'A' } = req.body;

  const validTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'PTR', 'SOA'];
  const queryType = validTypes.includes(type) ? type : 'A';

  try {
    const safeHost = sanitizeHost(host);

    let output = '';
    try {
      const { stdout } = await execAsync(`dig +short ${queryType} ${safeHost} 2>&1`, { timeout: 15000 });
      output = stdout;
    } catch (_) {
      try {
        const { stdout } = await execAsync(`nslookup -type=${queryType} ${safeHost} 2>&1`, { timeout: 15000 });
        output = stdout;
      } catch (err2) {
        output = err2.stdout || err2.message;
      }
    }

    res.json({ output, host: safeHost, type: queryType });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/network/ports
router.get('/ports', authenticateToken, async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync('ss -tunlp 2>/dev/null', { timeout: 10000 });
    const lines = (stdout || '').split('\n').filter(l => l.trim());
    const ports = [];

    // Parse ss output (skip header)
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 5) continue;

      const proto = parts[0];
      const state = parts[1];
      const localAddr = parts[4];
      const process_ = parts[6] || '';

      // Extract port from local address
      const portMatch = localAddr.match(/:(\d+)$/) || localAddr.match(/\*:(\d+)$/) || localAddr.match(/0\.0\.0\.0:(\d+)/);
      const port = portMatch ? parseInt(portMatch[1]) : null;

      // Extract process name
      const procMatch = process_.match(/users:\(\("([^"]+)"/);
      const procName = procMatch ? procMatch[1] : '';

      const pidMatch = process_.match(/pid=(\d+)/);
      const pid = pidMatch ? parseInt(pidMatch[1]) : null;

      if (port) {
        ports.push({
          proto,
          state,
          localAddr,
          port,
          process: procName,
          pid,
        });
      }
    }

    // Deduplicate by port+proto
    const seen = new Set();
    const unique = ports.filter(p => {
      const key = `${p.proto}:${p.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ ports: unique, raw: stdout });
  } catch (err) {
    console.error('[Network] Ports error:', err);
    res.status(500).json({ error: 'Failed to get open ports' });
  }
});

// GET /api/network/interfaces
router.get('/interfaces', authenticateToken, async (req, res) => {
  try {
    const interfaces = await si.networkInterfaces();
    const stats = await si.networkStats();

    const statsMap = {};
    for (const s of stats) {
      statsMap[s.iface] = s;
    }

    const result = interfaces.map(iface => ({
      iface: iface.iface,
      ip4: iface.ip4,
      ip6: iface.ip6,
      mac: iface.mac,
      speed: iface.speed,
      type: iface.type,
      operstate: iface.operstate,
      internal: iface.internal,
      rxBytes: statsMap[iface.iface]?.rx_bytes || 0,
      txBytes: statsMap[iface.iface]?.tx_bytes || 0,
      rxSec: Math.round(statsMap[iface.iface]?.rx_sec || 0),
      txSec: Math.round(statsMap[iface.iface]?.tx_sec || 0),
    }));

    res.json({ interfaces: result });
  } catch (err) {
    console.error('[Network] Interfaces error:', err);
    res.status(500).json({ error: 'Failed to get network interfaces' });
  }
});

// GET /api/network/bandwidth
router.get('/bandwidth', authenticateToken, async (req, res) => {
  try {
    const stats = await si.networkStats();
    const bandwidth = stats
      .filter(s => !s.iface.startsWith('lo'))
      .map(s => ({
        iface: s.iface,
        rxSec: Math.round(s.rx_sec || 0),
        txSec: Math.round(s.tx_sec || 0),
        rxBytes: s.rx_bytes,
        txBytes: s.tx_bytes,
        timestamp: Date.now(),
      }));

    res.json({ bandwidth });
  } catch (err) {
    console.error('[Network] Bandwidth error:', err);
    res.status(500).json({ error: 'Failed to get bandwidth stats' });
  }
});

module.exports = router;
