const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { validateUsername } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

function validateDbName(name) {
  return /^[a-zA-Z0-9_]{1,64}$/.test(name);
}

const MYSQL_CNF = '/root/.nixpanel_mysql.cnf';

async function getMysqlCreds() {
  if (!fs.existsSync(MYSQL_CNF)) {
    fs.writeFileSync(MYSQL_CNF, '[client]\nuser=root\npassword=\n', { mode: 0o600 });
  }
}

function mysqlEscape(str) {
  return String(str).replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, (char) => {
    const escapes = { '\0': '\\0', '\x08': '\\b', '\x09': '\\t', '\x1a': '\\z', '\n': '\\n', '\r': '\\r', '"': '\\"', "'": "\\'", '\\': '\\\\', '%': '\\%' };
    return escapes[char];
  });
}

// GET /api/hosting/databases
router.get('/', authenticateToken, async (req, res) => {
  try {
    await getMysqlCreds();
    const { stdout } = await execAsync(
      `mysql --defaults-extra-file=${MYSQL_CNF} -e "SELECT table_schema as db, ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys') GROUP BY table_schema;" 2>&1`,
      { timeout: 15000 }
    );
    const databases = stdout.split('\n').slice(1).filter(l => l.trim() && !l.startsWith('db')).map(line => {
      const parts = line.split('\t');
      return { name: parts[0]?.trim(), sizeMb: parseFloat(parts[1]) || 0 };
    }).filter(d => d.name);

    let mysqlVersion = 'unknown';
    let mysqlStatus = 'inactive';
    try {
      const { stdout: vs } = await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "SELECT VERSION();" 2>&1`, { timeout: 5000 });
      mysqlVersion = vs.split('\n')[1]?.trim() || 'unknown';
      mysqlStatus = 'active';
    } catch (_) {
      try {
        const { stdout: as } = await execAsync('systemctl is-active mysql 2>/dev/null || systemctl is-active mariadb 2>/dev/null', { timeout: 5000 });
        mysqlStatus = as.trim() === 'active' ? 'active' : 'inactive';
      } catch (_2) {}
    }

    res.json({ databases, mysqlStatus, mysqlVersion });
  } catch (err) {
    res.json({ databases: [], mysqlStatus: 'error', error: err.message });
  }
});

// POST /api/hosting/databases - create database
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, createUser, username, password } = req.body;
  if (!validateDbName(name)) return res.status(400).json({ error: 'Invalid database name (alphanumeric + underscore only)' });

  try {
    await getMysqlCreds();
    await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1`, { timeout: 15000 });

    let userResult = null;
    if (createUser && username && password) {
      if (!validateUsername(username)) return res.status(400).json({ error: 'Invalid username' });
      if (password.length < 8) return res.status(400).json({ error: 'Password too short' });
      const escapedPw = mysqlEscape(password);
      await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "CREATE USER IF NOT EXISTS '${username}'@'localhost' IDENTIFIED BY '${escapedPw}';" 2>&1`, { timeout: 10000 });
      await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${username}'@'localhost'; FLUSH PRIVILEGES;" 2>&1`, { timeout: 10000 });
      userResult = { username, database: name };
    }

    auditLog(req.user.id, req.user.username, 'DB_CREATE', name, { createUser, username }, req.ip);
    res.status(201).json({ success: true, name, userResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/databases/:name
router.delete('/:name', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDbName(req.params.name)) return res.status(400).json({ error: 'Invalid database name' });
  try {
    await getMysqlCreds();
    await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "DROP DATABASE IF EXISTS \`${req.params.name}\`;" 2>&1`, { timeout: 15000 });
    auditLog(req.user.id, req.user.username, 'DB_DELETE', req.params.name, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/databases/users - list DB users
router.get('/users', authenticateToken, async (req, res) => {
  try {
    await getMysqlCreds();
    const { stdout } = await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "SELECT user, host FROM mysql.user WHERE host='localhost' AND user NOT IN ('root','mysql.sys','mysql.session','mysql.infoschema') ORDER BY user;" 2>&1`, { timeout: 10000 });
    const users = stdout.split('\n').slice(1).filter(l => l.trim() && !l.startsWith('user')).map(line => {
      const parts = line.split('\t');
      return { user: parts[0]?.trim(), host: parts[1]?.trim() };
    }).filter(u => u.user);
    res.json({ users });
  } catch (err) {
    res.json({ users: [], error: err.message });
  }
});

// POST /api/hosting/databases/:db/users - assign user to DB
router.post('/:db/users', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDbName(req.params.db)) return res.status(400).json({ error: 'Invalid database name' });
  const { username, password, privileges = 'ALL' } = req.body;
  if (!validateUsername(username)) return res.status(400).json({ error: 'Invalid username' });
  const allowedPrivs = ['ALL', 'SELECT', 'SELECT,INSERT,UPDATE,DELETE', 'SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,INDEX,ALTER'];
  if (!allowedPrivs.includes(privileges)) return res.status(400).json({ error: 'Invalid privileges' });

  try {
    await getMysqlCreds();
    if (password) {
      const escapedPw = mysqlEscape(password);
      await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "CREATE USER IF NOT EXISTS '${username}'@'localhost' IDENTIFIED BY '${escapedPw}'; ALTER USER '${username}'@'localhost' IDENTIFIED BY '${escapedPw}';" 2>&1`, { timeout: 10000 });
    }
    await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "GRANT ${privileges} PRIVILEGES ON \`${req.params.db}\`.* TO '${username}'@'localhost'; FLUSH PRIVILEGES;" 2>&1`, { timeout: 10000 });
    auditLog(req.user.id, req.user.username, 'DB_USER_ASSIGN', req.params.db, { username, privileges }, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/databases/users/:username
router.delete('/users/:username', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateUsername(req.params.username)) return res.status(400).json({ error: 'Invalid username' });
  try {
    await getMysqlCreds();
    await execAsync(`mysql --defaults-extra-file=${MYSQL_CNF} -e "DROP USER IF EXISTS '${req.params.username}'@'localhost'; FLUSH PRIVILEGES;" 2>&1`, { timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/databases/:name/export
router.post('/:name/export', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!validateDbName(req.params.name)) return res.status(400).json({ error: 'Invalid database name' });
  try {
    const backupDir = '/var/backups/nixpanel';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filename = `${req.params.name}_${Date.now()}.sql.gz`;
    const filepath = path.join(backupDir, filename);
    await execAsync(`mysqldump --defaults-extra-file=${MYSQL_CNF} --single-transaction "${req.params.name}" | gzip > "${filepath}"`, { timeout: 120000 });
    res.download(filepath, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
