const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const router = express.Router();

// Allowed base directories for browsing
const ALLOWED_BASE_DIRS = ['/', '/home', '/etc', '/var', '/opt', '/srv', '/tmp'];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB for reading
const MAX_DIR_ENTRIES = 500;

function validatePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid path');
  }

  const normalized = path.normalize(filePath);

  // Block path traversal and dangerous patterns
  if (normalized.includes('..')) {
    throw new Error('Path traversal not allowed');
  }

  // Must be an absolute path
  if (!path.isAbsolute(normalized)) {
    throw new Error('Path must be absolute');
  }

  // Block access to sensitive files
  const blockedPaths = [
    '/etc/shadow', '/etc/gshadow', '/etc/sudoers',
    '/proc/kcore', '/dev',
  ];

  if (blockedPaths.some(blocked => normalized === blocked || normalized.startsWith(blocked + '/'))) {
    throw new Error('Access to this path is not allowed');
  }

  return normalized;
}

// GET /api/files/list?path=/
router.get('/list', authenticateToken, (req, res) => {
  const reqPath = req.query.path || '/';

  try {
    const safePath = validatePath(reqPath);
    const stat = fs.statSync(safePath);

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = fs.readdirSync(safePath, { withFileTypes: true })
      .slice(0, MAX_DIR_ENTRIES)
      .map(entry => {
        try {
          const entryPath = path.join(safePath, entry.name);
          const entryStat = fs.statSync(entryPath);
          return {
            name: entry.name,
            path: entryPath,
            type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
            size: entryStat.size,
            modified: entryStat.mtime,
            permissions: entryStat.mode.toString(8).slice(-3),
          };
        } catch (_) {
          return {
            name: entry.name,
            path: path.join(safePath, entry.name),
            type: 'unknown',
            size: 0,
            modified: null,
            permissions: '???',
          };
        }
      })
      .sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

    res.json({
      path: safePath,
      parent: safePath === '/' ? null : path.dirname(safePath),
      entries,
    });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Path not found' });
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    if (err.message) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to list directory' });
  }
});

// GET /api/files/read?path=/etc/hosts
router.get('/read', authenticateToken, (req, res) => {
  const reqPath = req.query.path;

  if (!reqPath) {
    return res.status(400).json({ error: 'Path required' });
  }

  try {
    const safePath = validatePath(reqPath);
    const stat = fs.statSync(safePath);

    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }

    if (stat.size > MAX_FILE_SIZE) {
      return res.status(413).json({ error: `File too large (max ${MAX_FILE_SIZE / 1024}KB)` });
    }

    const content = fs.readFileSync(safePath, 'utf-8');
    res.json({
      path: safePath,
      content,
      size: stat.size,
      modified: stat.mtime,
    });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    if (err.message) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// PUT /api/files/write - Write file content
router.put('/write', authenticateToken, requireRole('admin'), (req, res) => {
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Path and content required' });
  }

  try {
    const safePath = validatePath(filePath);

    // Extra protection for system files
    const readonlyPaths = ['/etc/fstab', '/etc/passwd', '/boot'];
    if (readonlyPaths.some(p => safePath === p || safePath.startsWith(p + '/'))) {
      return res.status(403).json({ error: 'This file is protected from web edits' });
    }

    // Create backup
    if (fs.existsSync(safePath)) {
      fs.writeFileSync(safePath + '.nixpanel.bak', fs.readFileSync(safePath));
    }

    fs.writeFileSync(safePath, content, 'utf-8');
    auditLog(req.user.id, req.user.username, 'FILE_WRITE', safePath, { size: content.length }, req.ip);

    res.json({ success: true, path: safePath });
  } catch (err) {
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    if (err.message) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// DELETE /api/files/delete
router.delete('/delete', authenticateToken, requireRole('admin'), (req, res) => {
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'Path required' });
  }

  try {
    const safePath = validatePath(filePath);

    // Extra safety: block deleting critical system files
    const protectedPaths = ['/etc', '/bin', '/usr/bin', '/sbin', '/lib', '/boot', '/root'];
    if (protectedPaths.some(p => safePath === p || safePath.startsWith(p + '/'))) {
      return res.status(403).json({ error: 'Cannot delete system files' });
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      fs.rmdirSync(safePath); // Only removes empty directories
    } else {
      fs.unlinkSync(safePath);
    }

    auditLog(req.user.id, req.user.username, 'FILE_DELETE', safePath, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    if (err.code === 'ENOTEMPTY') return res.status(400).json({ error: 'Directory is not empty' });
    if (err.message) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// POST /api/files/mkdir
router.post('/mkdir', authenticateToken, requireRole('admin'), (req, res) => {
  const { path: dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Path required' });
  }

  try {
    const safePath = validatePath(dirPath);
    fs.mkdirSync(safePath, { recursive: false });
    auditLog(req.user.id, req.user.username, 'DIR_CREATE', safePath, null, req.ip);
    res.json({ success: true, path: safePath });
  } catch (err) {
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'Directory already exists' });
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    if (err.message) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

module.exports = router;
