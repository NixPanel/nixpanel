const express = require('express');
const si = require('systeminformation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/system/overview
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const [cpu, mem, osInfo, uptime, load, diskLayout, networkInterfaces] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.time(),
      si.currentLoad(),
      si.diskLayout(),
      si.networkInterfaces(),
    ]);

    res.json({
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpu.speed,
        usage: Math.round(load.currentLoad * 10) / 10,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 100 * 10) / 10,
        swapTotal: mem.swaptotal,
        swapUsed: mem.swapused,
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      uptime: {
        seconds: uptime.uptime,
        bootTime: uptime.bootTime,
      },
      disk: diskLayout.map(d => ({
        name: d.name,
        type: d.type,
        size: d.size,
        vendor: d.vendor,
      })),
      network: networkInterfaces
        .filter(n => !n.internal)
        .map(n => ({
          iface: n.iface,
          ip4: n.ip4,
          ip6: n.ip6,
          mac: n.mac,
          speed: n.speed,
        })),
    });
  } catch (err) {
    console.error('[System] Overview error:', err);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
});

// GET /api/system/stats - Real-time stats for dashboard
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [load, mem, fsSize, networkStats, processes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.processes(),
    ]);

    res.json({
      cpu: {
        usage: Math.round(load.currentLoad * 10) / 10,
        cores: load.cpus.map(c => Math.round(c.load * 10) / 10),
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 100 * 10) / 10,
        buffers: mem.buffers,
        cached: mem.cached,
      },
      disk: fsSize
        .filter(fs => fs.size > 0)
        .map(fs => ({
          fs: fs.fs,
          mount: fs.mount,
          size: fs.size,
          used: fs.used,
          available: fs.available,
          usedPercent: Math.round(fs.use * 10) / 10,
        })),
      network: networkStats.map(n => ({
        iface: n.iface,
        rxSec: Math.round(n.rx_sec || 0),
        txSec: Math.round(n.tx_sec || 0),
        rxBytes: n.rx_bytes,
        txBytes: n.tx_bytes,
      })),
      processes: {
        all: processes.all,
        running: processes.running,
        blocked: processes.blocked,
        sleeping: processes.sleeping,
      },
    });
  } catch (err) {
    console.error('[System] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// GET /api/system/processes
router.get('/processes', authenticateToken, async (req, res) => {
  try {
    const procs = await si.processes();
    const sorted = procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        memVsz: p.memVsz,
        memRss: p.memRss,
        state: p.state,
        user: p.user,
        command: p.command,
      }));

    res.json({ total: procs.all, processes: sorted });
  } catch (err) {
    console.error('[System] Processes error:', err);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// GET /api/system/temperature
router.get('/temperature', authenticateToken, async (req, res) => {
  try {
    const temps = await si.cpuTemperature();
    res.json(temps);
  } catch (err) {
    res.json({ main: null, cores: [], max: null });
  }
});

module.exports = router;
