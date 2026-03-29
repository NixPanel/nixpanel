const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const bcrypt = require('bcryptjs');
const { getDb, auditLog } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const execAsync = promisify(exec);
const router = express.Router();

// GET /api/users/system - List system users
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('getent passwd', { timeout: 10000 });
    const users = stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [username, , uid, gid, gecos, home, shell] = line.split(':');
        return { username, uid: parseInt(uid), gid: parseInt(gid), gecos, home, shell };
      })
      .filter(u => u.uid >= 1000 || u.uid === 0); // Root and real users

    res.json({ users });
  } catch (err) {
    console.error('[Users] System users error:', err);
    res.status(500).json({ error: 'Failed to list system users' });
  }
});

// GET /api/users/groups - List system groups
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execAsync('getent group', { timeout: 10000 });
    const groups = stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, , gid, members] = line.split(':');
        return {
          name,
          gid: parseInt(gid),
          members: members ? members.split(',').filter(m => m) : [],
        };
      });

    res.json({ groups });
  } catch (err) {
    console.error('[Users] Groups error:', err);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// GET /api/users/panel - List panel users
router.get('/panel', authenticateToken, requireRole('admin'), (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, role, email, created_at, last_login, is_active FROM users ORDER BY username'
  ).all();
  res.json({ users });
});

// POST /api/users/panel - Create panel user
router.post('/panel', authenticateToken, requireRole('admin'), async (req, res) => {
  const { username, password, role, email } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }

  if (!['admin', 'operator', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, operator, or viewer' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, email || null);

    auditLog(req.user.id, req.user.username, 'USER_CREATE', username, { role }, req.ip);

    res.status(201).json({ id: result.lastInsertRowid, username, role, email });
  } catch (err) {
    console.error('[Users] Create error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/panel/:id - Update panel user
router.put('/panel/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role, email, is_active } = req.body;

  // Prevent admin from disabling themselves
  if (parseInt(id) === req.user.id && is_active === false) {
    return res.status(400).json({ error: 'Cannot disable your own account' });
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = [];
    const values = [];

    if (role !== undefined) {
      if (!['admin', 'operator', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push('role = ?');
      values.push(role);
    }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    auditLog(req.user.id, req.user.username, 'USER_UPDATE', id, { role, is_active }, req.ip);
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('[Users] Update error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/panel/:id - Delete panel user
router.delete('/panel/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    auditLog(req.user.id, req.user.username, 'USER_DELETE', user.username, null, req.ip);

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('[Users] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/users/audit - Audit log
router.get('/audit', authenticateToken, requireRole('admin'), (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const db = getDb();

  const logs = db.prepare(`
    SELECT * FROM audit_log
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(Math.min(parseInt(limit), 500), parseInt(offset));

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

  res.json({ logs, total });
});

module.exports = router;
