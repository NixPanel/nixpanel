const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { validateDomain } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

const BIND_ZONES_DIR = '/etc/bind/zones';
const NAMED_CONF = '/etc/bind/named.conf.local';

function sanitizeRecordValue(value) {
  return value.replace(/[^a-zA-Z0-9.\-_@: ]/g, '').trim();
}

const VALID_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'];

// GET /api/hosting/dns/zones
router.get('/zones', authenticateToken, async (req, res) => {
  try {
    const zones = [];
    if (fs.existsSync(BIND_ZONES_DIR)) {
      const files = fs.readdirSync(BIND_ZONES_DIR).filter(f => f.startsWith('db.'));
      for (const f of files) {
        zones.push({ domain: f.replace('db.', ''), file: path.join(BIND_ZONES_DIR, f) });
      }
    } else if (fs.existsSync(NAMED_CONF)) {
      const content = fs.readFileSync(NAMED_CONF, 'utf-8');
      const matches = [...content.matchAll(/zone\s+"([^"]+)"/g)];
      for (const m of matches) zones.push({ domain: m[1], file: null });
    }
    // Check if BIND is running
    let bindStatus = 'not-installed';
    try {
      const { stdout } = await execAsync('systemctl is-active named 2>/dev/null || systemctl is-active bind9 2>/dev/null', { timeout: 5000 });
      bindStatus = stdout.trim() === 'active' ? 'active' : 'inactive';
    } catch (_) {}
    res.json({ zones, bindStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/dns/zones/:domain/records
router.get('/zones/:domain/records', authenticateToken, async (req, res) => {
  const { domain } = req.params;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const zoneFile = path.join(BIND_ZONES_DIR, `db.${domain}`);
    if (!fs.existsSync(zoneFile)) return res.json({ records: [], zoneFile, exists: false });
    const content = fs.readFileSync(zoneFile, 'utf-8');
    const records = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('$') || trimmed.startsWith('(') || trimmed.startsWith(')')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        const typeIdx = parts.findIndex(p => VALID_RECORD_TYPES.includes(p.toUpperCase()));
        if (typeIdx >= 0) {
          records.push({
            name: parts[0],
            ttl: typeIdx > 1 ? parts[typeIdx - 1] : '3600',
            type: parts[typeIdx].toUpperCase(),
            value: parts.slice(typeIdx + 1).join(' '),
          });
        }
      }
    }
    res.json({ records, content, zoneFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/dns/zones/:domain/records - add DNS record
router.post('/zones/:domain/records', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain } = req.params;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  const { name, type, value, ttl = '3600', priority } = req.body;

  if (!VALID_RECORD_TYPES.includes(type?.toUpperCase())) return res.status(400).json({ error: 'Invalid record type' });
  if (!name || !value) return res.status(400).json({ error: 'name and value required' });

  const safeName = name.replace(/[^a-zA-Z0-9._@\-*]/g, '');
  const safeValue = sanitizeRecordValue(value);
  const safeTTL = /^\d+$/.test(String(ttl)) ? ttl : '3600';

  try {
    const zoneFile = path.join(BIND_ZONES_DIR, `db.${domain}`);
    if (!fs.existsSync(zoneFile)) return res.status(404).json({ error: 'Zone not found. Create the zone first.' });

    const entry = type.toUpperCase() === 'MX'
      ? `${safeName}\t${safeTTL}\tIN\t${type.toUpperCase()}\t${priority || 10}\t${safeValue}\n`
      : `${safeName}\t${safeTTL}\tIN\t${type.toUpperCase()}\t${safeValue}\n`;

    fs.appendFileSync(zoneFile, entry);

    await execAsync(`rndc reload ${domain} 2>/dev/null || true`, { timeout: 10000 });
    auditLog(req.user.id, req.user.username, 'DNS_RECORD_ADD', domain, { name, type }, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/dns/zones/:domain/records - remove a record line
router.delete('/zones/:domain/records', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain } = req.params;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  const { name, type, value } = req.body;
  if (!name || !type || !value) return res.status(400).json({ error: 'name, type, and value required' });

  try {
    const zoneFile = path.join(BIND_ZONES_DIR, `db.${domain}`);
    if (!fs.existsSync(zoneFile)) return res.status(404).json({ error: 'Zone not found' });
    const lines = fs.readFileSync(zoneFile, 'utf-8').split('\n');
    // Remove lines that match name+type+value
    const filtered = lines.filter(line => {
      const l = line.trim();
      return !(l.includes(name) && l.toUpperCase().includes(type.toUpperCase()) && l.includes(value));
    });
    fs.writeFileSync(zoneFile, filtered.join('\n'));
    await execAsync(`rndc reload ${domain} 2>/dev/null || true`, { timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/dns/zones - create new zone
router.post('/zones', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain } = req.body;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    if (!fs.existsSync(BIND_ZONES_DIR)) fs.mkdirSync(BIND_ZONES_DIR, { recursive: true });
    const zoneFile = path.join(BIND_ZONES_DIR, `db.${domain}`);
    if (fs.existsSync(zoneFile)) return res.status(409).json({ error: 'Zone already exists' });

    let serverIp = '';
    try {
      const { stdout } = await execAsync("hostname -I | awk '{print $1}'", { timeout: 5000 });
      serverIp = stdout.trim();
    } catch (_) {}

    const serial = new Date().toISOString().replace(/\D/g, '').slice(0, 10);
    const zoneContent = `$TTL 3600
@\tIN\tSOA\tns1.${domain}.\tadmin.${domain}. (
\t\t${serial} ; Serial
\t\t3600 ; Refresh
\t\t1800 ; Retry
\t\t604800 ; Expire
\t\t300 ) ; Minimum TTL

@\tIN\tNS\tns1.${domain}.
@\tIN\tNS\tns2.${domain}.
ns1\tIN\tA\t${serverIp || '127.0.0.1'}
ns2\tIN\tA\t${serverIp || '127.0.0.1'}
@\tIN\tA\t${serverIp || '127.0.0.1'}
www\tIN\tA\t${serverIp || '127.0.0.1'}
mail\tIN\tA\t${serverIp || '127.0.0.1'}
@\tIN\tMX\t10\tmail.${domain}.
`;
    fs.writeFileSync(zoneFile, zoneContent);

    // Add to named.conf.local
    if (fs.existsSync(NAMED_CONF)) {
      const entry = `\nzone "${domain}" {\n\ttype master;\n\tfile "${zoneFile}";\n};\n`;
      fs.appendFileSync(NAMED_CONF, entry);
      await execAsync('rndc reload 2>/dev/null || systemctl reload named 2>/dev/null || systemctl reload bind9 2>/dev/null || true', { timeout: 10000 });
    }

    auditLog(req.user.id, req.user.username, 'DNS_ZONE_CREATE', domain, { zoneFile }, req.ip);
    res.json({ success: true, zoneFile, content: zoneContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/dns/zones/:domain - delete zone
router.delete('/zones/:domain', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain } = req.params;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const zoneFile = path.join(BIND_ZONES_DIR, `db.${domain}`);
    if (fs.existsSync(zoneFile)) fs.unlinkSync(zoneFile);

    // Remove from named.conf.local
    if (fs.existsSync(NAMED_CONF)) {
      const content = fs.readFileSync(NAMED_CONF, 'utf-8');
      const cleaned = content.replace(new RegExp(`\\nzone\\s+"${domain.replace(/\./g, '\\.')}"\\s*\\{[^}]*\\};?`, 'g'), '');
      fs.writeFileSync(NAMED_CONF, cleaned);
      await execAsync('rndc reload 2>/dev/null || true', { timeout: 10000 });
    }

    auditLog(req.user.id, req.user.username, 'DNS_ZONE_DELETE', domain, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/dns/lookup - DNS lookup tool
router.post('/lookup', authenticateToken, async (req, res) => {
  const { domain, type = 'A' } = req.body;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });
  if (!VALID_RECORD_TYPES.includes(type.toUpperCase())) return res.status(400).json({ error: 'Invalid record type' });

  try {
    const results = {};
    // Local lookup
    try {
      const { stdout } = await execAsync(`dig +short ${domain} ${type.toUpperCase()} 2>/dev/null || nslookup -type=${type} ${domain} 2>/dev/null`, { timeout: 10000 });
      results.local = stdout.trim() || 'No result';
    } catch (_) { results.local = 'Lookup failed'; }

    // Google DNS
    try {
      const { stdout } = await execAsync(`dig @8.8.8.8 +short ${domain} ${type.toUpperCase()} 2>/dev/null`, { timeout: 10000 });
      results.google = stdout.trim() || 'No result';
    } catch (_) { results.google = 'Unreachable'; }

    // Cloudflare DNS
    try {
      const { stdout } = await execAsync(`dig @1.1.1.1 +short ${domain} ${type.toUpperCase()} 2>/dev/null`, { timeout: 10000 });
      results.cloudflare = stdout.trim() || 'No result';
    } catch (_) { results.cloudflare = 'Unreachable'; }

    res.json({ domain, type, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
