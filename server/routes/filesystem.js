const express = require('express');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

// Validate absolute path with no traversal
function sanitizePath(p) {
  if (!p || typeof p !== 'string') throw new Error('Path is required');
  const normalized = path.normalize(p);
  if (!path.isAbsolute(normalized)) throw new Error('Path must be absolute');
  if (normalized.includes('..')) throw new Error('Path traversal not allowed');
  return normalized;
}

// Validate device path (must start with /dev/)
function validateDevice(dev) {
  if (!dev || typeof dev !== 'string') throw new Error('Device is required');
  const normalized = path.normalize(dev);
  if (!normalized.startsWith('/dev/')) throw new Error('Device must start with /dev/');
  if (normalized.includes('..')) throw new Error('Invalid device path');
  // Only allow alphanumeric, /, -
  if (!/^\/dev\/[a-zA-Z0-9\-_]+$/.test(normalized)) throw new Error('Invalid device path characters');
  return normalized;
}

// Validate device name (only alphanumeric, e.g. sda, sda1, nvme0n1)
function validateDeviceName(name) {
  if (!name || typeof name !== 'string') throw new Error('Device name is required');
  if (!/^[a-zA-Z0-9]+$/.test(name)) throw new Error('Device name must be alphanumeric only');
  if (name.length > 32) throw new Error('Device name too long');
  return name;
}

// GET /api/filesystem/mounts
router.get('/mounts', authenticateToken, async (req, res) => {
  try {
    // Get disk usage
    const { stdout: dfOut } = await execAsync('df -h --output=source,fstype,size,used,avail,pcent,target 2>/dev/null', { timeout: 15000 })
      .catch(() => ({ stdout: '' }));

    // Get inode usage
    const { stdout: dfIOut } = await execAsync('df -i --output=source,iused,iavail,ipcent,target 2>/dev/null', { timeout: 15000 })
      .catch(() => ({ stdout: '' }));

    // Parse df -h output
    const mounts = [];
    const dfLines = dfOut.split('\n').filter(l => l.trim());
    for (let i = 1; i < dfLines.length; i++) {
      const parts = dfLines[i].split(/\s+/);
      if (parts.length < 7) continue;
      mounts.push({
        filesystem: parts[0],
        type: parts[1],
        size: parts[2],
        used: parts[3],
        available: parts[4],
        usePercent: parts[5],
        mountPoint: parts[6],
        inodeUsed: '',
        inodeAvail: '',
        inodePercent: '',
      });
    }

    // Parse inode data and merge
    const inodeLines = dfIOut.split('\n').filter(l => l.trim());
    const inodeMap = {};
    for (let i = 1; i < inodeLines.length; i++) {
      const parts = inodeLines[i].split(/\s+/);
      if (parts.length < 5) continue;
      inodeMap[parts[4]] = {
        inodeUsed: parts[1],
        inodeAvail: parts[2],
        inodePercent: parts[3],
      };
    }

    for (const m of mounts) {
      const inodeData = inodeMap[m.mountPoint];
      if (inodeData) {
        m.inodeUsed = inodeData.inodeUsed;
        m.inodeAvail = inodeData.inodeAvail;
        m.inodePercent = inodeData.inodePercent;
      }
    }

    res.json({ mounts });
  } catch (err) {
    console.error('[Filesystem] Mounts error:', err);
    res.status(500).json({ error: 'Failed to get mount information' });
  }
});

// GET /api/filesystem/devices
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL,FSTYPE,SERIAL,VENDOR 2>/dev/null', { timeout: 15000 })
      .catch(() => ({ stdout: '{"blockdevices":[]}' }));

    let data;
    try {
      data = JSON.parse(stdout);
    } catch (_) {
      data = { blockdevices: [] };
    }

    res.json({ devices: data.blockdevices || [] });
  } catch (err) {
    console.error('[Filesystem] Devices error:', err);
    res.status(500).json({ error: 'Failed to get block devices' });
  }
});

// POST /api/filesystem/mount
router.post('/mount', authenticateToken, requireRole('admin'), async (req, res) => {
  const { device, mountPoint, fsType = 'auto' } = req.body;

  const validFsTypes = ['ext4', 'xfs', 'ntfs', 'vfat', 'auto', 'btrfs', 'exfat'];
  if (!validFsTypes.includes(fsType)) {
    return res.status(400).json({ error: 'Invalid filesystem type' });
  }

  try {
    const safeDevice = validateDevice(device);
    const safeMountPoint = sanitizePath(mountPoint);

    auditLog(req.user.id, req.user.username, 'FS_MOUNT', `${safeDevice} -> ${safeMountPoint}`, { fsType }, req.ip);

    const fsArg = fsType === 'auto' ? '' : `-t ${fsType}`;
    const { stdout, stderr } = await execAsync(
      `mount ${fsArg} ${safeDevice} ${safeMountPoint} 2>&1`,
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || err.message }));

    if (stderr && !stdout) {
      return res.status(500).json({ error: stderr.trim() });
    }

    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/filesystem/unmount
router.post('/unmount', authenticateToken, requireRole('admin'), async (req, res) => {
  const { mountPoint } = req.body;

  // Block unmounting critical system mounts
  const PROTECTED = ['/', '/boot', '/proc', '/sys', '/dev', '/run'];

  try {
    const safeMountPoint = sanitizePath(mountPoint);

    if (PROTECTED.includes(safeMountPoint)) {
      return res.status(400).json({ error: 'Cannot unmount protected system mount' });
    }

    auditLog(req.user.id, req.user.username, 'FS_UNMOUNT', safeMountPoint, null, req.ip);

    const { stdout, stderr } = await execAsync(
      `umount ${safeMountPoint} 2>&1`,
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || err.message }));

    if (stderr && !stdout) {
      return res.status(500).json({ error: stderr.trim() });
    }

    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/filesystem/largest?path=/
router.get('/largest', authenticateToken, async (req, res) => {
  const rawPath = req.query.path || '/';

  try {
    const safePath = sanitizePath(rawPath);

    const { stdout } = await execAsync(
      `du -ah ${safePath} 2>/dev/null | sort -rh | head -20`,
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '' }));

    const files = [];
    for (const line of stdout.split('\n').filter(l => l.trim())) {
      const [size, ...pathParts] = line.split('\t');
      if (size && pathParts.length > 0) {
        files.push({ size: size.trim(), path: pathParts.join('\t').trim() });
      }
    }

    res.json({ files, path: safePath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/filesystem/smart/:device
router.get('/smart/:device', authenticateToken, async (req, res) => {
  try {
    const deviceName = validateDeviceName(req.params.device);
    const devicePath = `/dev/${deviceName}`;

    const { stdout, stderr } = await execAsync(
      `smartctl -H -A ${devicePath} 2>&1`,
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || '' }));

    const output = (stdout + stderr).trim();

    // Parse SMART overall health
    const healthMatch = output.match(/SMART overall-health self-assessment test result:\s*(\w+)/);
    const health = healthMatch ? healthMatch[1] : 'UNKNOWN';

    // Parse SMART attributes
    const attributes = [];
    const attrSection = output.split('Vendor Specific SMART Attributes')[1] || '';
    const attrLines = attrSection.split('\n').filter(l => l.trim());
    for (const line of attrLines) {
      const m = line.match(/^\s*(\d+)\s+([\w-]+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (m) {
        attributes.push({
          id: m[1],
          name: m[2],
          flags: m[3],
          value: m[4],
          worst: m[5],
          threshold: m[6],
          type: m[7],
          updated: m[8],
          failingNow: m[9],
          rawValue: m[10].trim(),
        });
      }
    }

    res.json({ device: devicePath, health, attributes, raw: output });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
