require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change_this_admin_key';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'licenses.db');

// ─── Database setup ────────────────────────────────────────────────────────────
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'pro',
      status TEXT NOT NULL DEFAULT 'active',
      server_count INTEGER DEFAULT 0,
      max_servers INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS license_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      server_id TEXT NOT NULL,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      UNIQUE(license_key, server_id)
    );

    CREATE TABLE IF NOT EXISTS license_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT,
      server_id TEXT,
      event TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_servers_key ON license_servers(license_key);
    CREATE INDEX IF NOT EXISTS idx_events_key ON license_events(license_key);
  `);
  console.log('[DB] License database initialized');
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

app.use(limiter);

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Admin API key required' });
  }
  next();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `NIXP-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function logEvent(licenseKey, serverId, event, ip) {
  try {
    getDb().prepare(
      'INSERT INTO license_events (license_key, server_id, event, ip_address) VALUES (?, ?, ?, ?)'
    ).run(licenseKey, serverId || null, event, ip || null);
  } catch (_) {}
}

function validateLicense(licenseKey, serverId, ip) {
  const database = getDb();
  const license = database.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey);

  if (!license) {
    return { valid: false, message: 'License key not found' };
  }

  if (license.status !== 'active') {
    return { valid: false, message: `License is ${license.status}` };
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return { valid: false, message: 'License has expired' };
  }

  if (serverId) {
    const existing = database.prepare(
      'SELECT * FROM license_servers WHERE license_key = ? AND server_id = ?'
    ).get(licenseKey, serverId);

    if (existing) {
      // Known server - update last_seen
      database.prepare(
        'UPDATE license_servers SET last_seen = CURRENT_TIMESTAMP, ip_address = ? WHERE license_key = ? AND server_id = ?'
      ).run(ip || null, licenseKey, serverId);
    } else {
      // New server - check limit
      const serverCount = database.prepare(
        'SELECT COUNT(*) as count FROM license_servers WHERE license_key = ?'
      ).get(licenseKey).count;

      if (serverCount >= license.max_servers) {
        return {
          valid: false,
          message: `Server limit reached (${license.max_servers} server${license.max_servers !== 1 ? 's' : ''} allowed on ${license.plan} plan)`,
        };
      }

      // Register new server
      database.prepare(
        'INSERT INTO license_servers (license_key, server_id, ip_address) VALUES (?, ?, ?)'
      ).run(licenseKey, serverId, ip || null);

      database.prepare(
        'UPDATE licenses SET server_count = server_count + 1 WHERE license_key = ?'
      ).run(licenseKey);
    }
  }

  return {
    valid: true,
    plan: license.plan,
    email: license.email,
    expires_at: license.expires_at || null,
    max_servers: license.max_servers,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /validate
app.post('/validate', (req, res) => {
  const { license_key, email, server_id } = req.body;

  if (!license_key || typeof license_key !== 'string') {
    return res.status(400).json({ valid: false, message: 'license_key required' });
  }

  const result = validateLicense(license_key.trim(), server_id, req.ip);
  logEvent(license_key.trim(), server_id, result.valid ? 'VALIDATE_OK' : 'VALIDATE_FAIL', req.ip);

  if (!result.valid) {
    return res.status(200).json(result);
  }

  res.json(result);
});

// POST /activate (alias for validate with explicit activate event)
app.post('/activate', (req, res) => {
  const { license_key, email, server_id } = req.body;

  if (!license_key || typeof license_key !== 'string') {
    return res.status(400).json({ valid: false, message: 'license_key required' });
  }

  const result = validateLicense(license_key.trim(), server_id, req.ip);
  logEvent(license_key.trim(), server_id, result.valid ? 'ACTIVATE_OK' : 'ACTIVATE_FAIL', req.ip);

  res.json(result);
});

// POST /deactivate
app.post('/deactivate', (req, res) => {
  const { license_key, server_id } = req.body;

  if (!license_key || !server_id) {
    return res.status(400).json({ error: 'license_key and server_id required' });
  }

  const database = getDb();
  const deleted = database.prepare(
    'DELETE FROM license_servers WHERE license_key = ? AND server_id = ?'
  ).run(license_key.trim(), server_id);

  if (deleted.changes > 0) {
    database.prepare(
      'UPDATE licenses SET server_count = MAX(0, server_count - 1) WHERE license_key = ?'
    ).run(license_key.trim());
    logEvent(license_key.trim(), server_id, 'DEACTIVATE', req.ip);
  }

  res.json({ success: true });
});

// ─── Admin Routes ──────────────────────────────────────────────────────────────

// GET /admin/licenses
app.get('/admin/licenses', requireAdmin, (req, res) => {
  const database = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  const total = database.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
  const licenses = database.prepare(
    'SELECT id, license_key, email, plan, status, server_count, max_servers, created_at, expires_at, notes FROM licenses ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);

  res.json({ total, page, limit, licenses });
});

// POST /admin/licenses
app.post('/admin/licenses', requireAdmin, (req, res) => {
  const { email, plan = 'pro', max_servers = 1, expires_at, notes } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }

  const validPlans = ['pro', 'team', 'agency'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ error: `plan must be one of: ${validPlans.join(', ')}` });
  }

  const maxServersMap = { pro: 1, team: 5, agency: 999 };
  const resolvedMaxServers = parseInt(max_servers) || maxServersMap[plan] || 1;

  const database = getDb();
  let licenseKey;
  let attempts = 0;

  // Generate unique key
  while (attempts < 10) {
    licenseKey = generateLicenseKey();
    const existing = database.prepare('SELECT id FROM licenses WHERE license_key = ?').get(licenseKey);
    if (!existing) break;
    attempts++;
  }

  if (!licenseKey) {
    return res.status(500).json({ error: 'Failed to generate unique license key' });
  }

  database.prepare(
    'INSERT INTO licenses (license_key, email, plan, status, max_servers, expires_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(licenseKey, email.trim(), plan, 'active', resolvedMaxServers, expires_at || null, notes || null);

  logEvent(licenseKey, null, 'LICENSE_CREATED', req.ip);

  res.json({
    success: true,
    license_key: licenseKey,
    email: email.trim(),
    plan,
    max_servers: resolvedMaxServers,
    expires_at: expires_at || null,
  });
});

// DELETE /admin/licenses/:key
app.delete('/admin/licenses/:key', requireAdmin, (req, res) => {
  const database = getDb();
  database.prepare("UPDATE licenses SET status = 'revoked' WHERE license_key = ?").run(req.params.key);
  logEvent(req.params.key, null, 'LICENSE_REVOKED', req.ip);
  res.json({ success: true });
});

// GET /admin/licenses/:key/servers
app.get('/admin/licenses/:key/servers', requireAdmin, (req, res) => {
  const database = getDb();
  const servers = database.prepare(
    'SELECT server_id, first_seen, last_seen, ip_address FROM license_servers WHERE license_key = ?'
  ).all(req.params.key);
  res.json({ servers });
});

// GET /admin/events
app.get('/admin/events', requireAdmin, (req, res) => {
  const database = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const events = database.prepare(
    'SELECT * FROM license_events ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
  res.json({ events });
});

// ─── Seed script helper (POST /admin/seed) ────────────────────────────────────
app.post('/admin/seed', requireAdmin, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Seed not available in production' });
  }

  const database = getDb();
  const testLicenses = [
    { email: 'test-solo@example.com', plan: 'pro', max_servers: 1 },
    { email: 'test-team@example.com', plan: 'team', max_servers: 5 },
    { email: 'test-agency@example.com', plan: 'agency', max_servers: 999 },
    { email: 'test-expired@example.com', plan: 'pro', max_servers: 1, expires_at: '2020-01-01T00:00:00Z' },
  ];

  const created = [];
  for (const l of testLicenses) {
    const key = generateLicenseKey();
    database.prepare(
      'INSERT OR IGNORE INTO licenses (license_key, email, plan, status, max_servers, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(key, l.email, l.plan, 'active', l.max_servers, l.expires_at || null);
    created.push({ ...l, license_key: key });
  }

  res.json({ seeded: created });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NixPanel License Server            ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  HTTP:  http://0.0.0.0:${PORT}         ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
