const express = require('express');
const https = require('https');
const { getSetting, setSetting, auditLog } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/license/status
router.get('/status', authenticateToken, (req, res) => {
  const status = getSetting('license_status') || 'free';
  const email = getSetting('license_email') || null;
  const expires = getSetting('license_expires') || null;
  const plan = getSetting('license_plan') || null;
  const key = getSetting('license_key');

  const isActive = status === 'active' && (!expires || new Date(expires) > new Date());

  res.json({
    status: isActive ? 'active' : status,
    plan,
    email,
    expires,
    hasKey: !!key,
    maskedKey: key ? key.slice(0, 8) + '...' + key.slice(-4) : null,
  });
});

// POST /api/license/activate
router.post('/activate', authenticateToken, requireRole('admin'), async (req, res) => {
  const { licenseKey, email } = req.body;

  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ error: 'License key required' });
  }

  // Sanitize
  if (!/^[A-Z0-9\-]{10,60}$/.test(licenseKey.trim())) {
    return res.status(400).json({ error: 'Invalid license key format' });
  }

  // Try to validate against license server
  // If license server unreachable, do offline validation (basic format check + store)
  try {
    const result = await validateWithServer(licenseKey.trim(), email);

    setSetting('license_key', licenseKey.trim());
    setSetting('license_status', 'active');
    setSetting('license_email', result.email || email || '');
    setSetting('license_plan', result.plan || 'pro');
    if (result.expires_at) setSetting('license_expires', result.expires_at);

    auditLog(req.user.id, req.user.username, 'LICENSE_ACTIVATE', 'license', { plan: result.plan }, req.ip);

    res.json({ success: true, plan: result.plan, email: result.email, expires: result.expires_at });
  } catch (err) {
    // Offline mode: store as pending validation
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.message === 'OFFLINE') {
      setSetting('license_key', licenseKey.trim());
      setSetting('license_status', 'active'); // Optimistic - allow offline use
      setSetting('license_email', email || '');
      setSetting('license_plan', 'pro');

      return res.json({
        success: true,
        plan: 'pro',
        offline: true,
        message: 'License activated (offline mode - will verify when connectivity is available)',
      });
    }
    res.status(400).json({ error: err.message || 'License validation failed' });
  }
});

// POST /api/license/deactivate
router.post('/deactivate', authenticateToken, requireRole('admin'), (req, res) => {
  setSetting('license_status', 'free');
  setSetting('license_key', '');
  setSetting('license_email', '');
  setSetting('license_plan', '');
  setSetting('license_expires', '');

  auditLog(req.user.id, req.user.username, 'LICENSE_DEACTIVATE', 'license', null, req.ip);
  res.json({ success: true });
});

async function validateWithServer(key, email) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ license_key: key, email, server_id: getServerId() });

    const options = {
      hostname: 'license.nixpanel.io',
      path: '/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    };

    const req = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.valid) {
            resolve(json);
          } else {
            reject(new Error(json.message || 'Invalid license key'));
          }
        } catch (_) {
          reject(new Error('Invalid response from license server'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(Object.assign(new Error('OFFLINE'), { code: 'ENOTFOUND' })); });
    req.write(body);
    req.end();
  });
}

function getServerId() {
  let id = getSetting('server_id');
  if (!id) {
    id = require('crypto').randomBytes(16).toString('hex');
    setSetting('server_id', id);
  }
  return id;
}

module.exports = router;
