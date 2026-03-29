const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/nixpanel';

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  }
}

function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') throw new Error('Invalid filename');
  const base = path.basename(filename);
  if (!base || base === '.' || base === '..') throw new Error('Invalid filename');
  if (!/^[a-zA-Z0-9._\-]+$/.test(base)) throw new Error('Invalid filename characters');
  return base;
}

function sanitizeSourcePath(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') throw new Error('Invalid source path');
  if (!path.isAbsolute(sourcePath)) throw new Error('Source path must be absolute');
  const normalized = path.normalize(sourcePath);
  if (normalized !== sourcePath) throw new Error('Path contains traversal');
  return normalized;
}

function getBackupPath(filename) {
  const safe = sanitizeFilename(filename);
  const fullPath = path.join(BACKUP_DIR, safe);
  // Ensure it's within backup dir
  if (!fullPath.startsWith(BACKUP_DIR + path.sep) && fullPath !== BACKUP_DIR) {
    throw new Error('Path traversal detected');
  }
  return fullPath;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// GET /api/backup/list
router.get('/list', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = [];

    for (const file of files) {
      if (!file.endsWith('.tar.gz') && !file.endsWith('.tgz')) continue;
      try {
        const fullPath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(fullPath);
        backups.push({
          filename: file,
          size: stat.size,
          sizeHuman: formatSize(stat.size),
          createdAt: stat.birthtime || stat.mtime,
          modifiedAt: stat.mtime,
        });
      } catch (_) {}
    }

    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ backups, backupDir: BACKUP_DIR });
  } catch (err) {
    console.error('[Backup] List error:', err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /api/backup/create
router.post('/create', authenticateToken, requireRole('admin'), async (req, res) => {
  const { source, name, description } = req.body;

  if (!source) {
    return res.status(400).json({ error: 'Source directory is required' });
  }

  try {
    const safeSrc = sanitizeSourcePath(source);

    if (!fs.existsSync(safeSrc)) {
      return res.status(400).json({ error: 'Source directory does not exist' });
    }

    ensureBackupDir();

    // Build filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const baseName = name
      ? name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50)
      : path.basename(safeSrc);
    const filename = `${baseName}_${timestamp}.tar.gz`;
    const outputPath = path.join(BACKUP_DIR, filename);

    auditLog(req.user.id, req.user.username, 'BACKUP_CREATE', `${safeSrc} -> ${filename}`, null, req.ip);

    const { stdout, stderr } = await execAsync(
      `tar -czf "${outputPath}" -C "${path.dirname(safeSrc)}" "${path.basename(safeSrc)}" 2>&1`,
      { timeout: 600000 }
    );

    const stat = fs.statSync(outputPath);
    res.json({
      success: true,
      filename,
      size: stat.size,
      sizeHuman: formatSize(stat.size),
      output: stdout + stderr,
    });
  } catch (err) {
    console.error('[Backup] Create error:', err);
    res.status(500).json({ error: err.message || 'Backup creation failed', output: err.stderr || '' });
  }
});

// POST /api/backup/restore
router.post('/restore', authenticateToken, requireRole('admin'), async (req, res) => {
  const { filename, destination } = req.body;

  if (!filename || !destination) {
    return res.status(400).json({ error: 'filename and destination are required' });
  }

  try {
    const backupPath = getBackupPath(filename);
    const safeDest = sanitizeSourcePath(destination);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    if (!fs.existsSync(safeDest)) {
      fs.mkdirSync(safeDest, { recursive: true });
    }

    auditLog(req.user.id, req.user.username, 'BACKUP_RESTORE', `${filename} -> ${safeDest}`, null, req.ip);

    const { stdout, stderr } = await execAsync(
      `tar -xzf "${backupPath}" -C "${safeDest}" 2>&1`,
      { timeout: 600000 }
    );

    res.json({ success: true, output: stdout + stderr });
  } catch (err) {
    console.error('[Backup] Restore error:', err);
    res.status(500).json({ error: err.message || 'Restore failed', output: err.stderr || '' });
  }
});

// GET /api/backup/download/:filename
router.get('/download/:filename', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const backupPath = getBackupPath(req.params.filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    auditLog(req.user.id, req.user.username, 'BACKUP_DOWNLOAD', req.params.filename, null, req.ip);
    res.download(backupPath, path.basename(backupPath));
  } catch (err) {
    console.error('[Backup] Download error:', err);
    res.status(500).json({ error: err.message || 'Download failed' });
  }
});

// DELETE /api/backup/:filename
router.delete('/:filename', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const backupPath = getBackupPath(req.params.filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    fs.unlinkSync(backupPath);
    auditLog(req.user.id, req.user.username, 'BACKUP_DELETE', req.params.filename, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    console.error('[Backup] Delete error:', err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

module.exports = router;
