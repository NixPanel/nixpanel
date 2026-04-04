const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const requirePro = require('../middleware/requirePro');
const { getSetting, setSetting, getDb, auditLog } = require('../db/database');
const { encryptKey, decryptKey, getAnthropicApiKey } = require('../utils/apiKey');

const execAsync = promisify(exec);
const router = express.Router();
router.use(authenticateToken);

// Helper to run a command with timeout
async function run(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout });
    return { stdout: stdout || '', stderr: stderr || '', error: null };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', error: err.message };
  }
}

// GET /api/settings/ai-key-status
router.get('/ai-key-status', (req, res) => {
  const encrypted = getSetting('anthropic_api_key');
  if (!encrypted) {
    return res.json({ configured: false, lastFour: null });
  }
  const key = decryptKey(encrypted);
  if (!key) {
    return res.json({ configured: false, lastFour: null });
  }
  return res.json({ configured: true, lastFour: key.slice(-4) });
});

// POST /api/settings/ai-key
router.post('/ai-key', requirePro, (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'API key required' });
  }

  if (!apiKey.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'Invalid API key format. Key must start with sk-ant-' });
  }

  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run('anthropic_api_key', encryptKey(apiKey));

  res.json({ success: true, lastFour: apiKey.slice(-4) });
});

// POST /api/settings/test-ai-key
router.post('/test-ai-key', requirePro, async (req, res) => {
  const { apiKey } = req.body;

  let keyToTest = apiKey;

  if (!keyToTest) {
    keyToTest = getAnthropicApiKey();
    if (!keyToTest) {
      return res.status(400).json({ valid: false, error: 'No API key configured' });
    }
  }

  if (!keyToTest.startsWith('sk-ant-')) {
    return res.json({ valid: false, error: 'Invalid API key format' });
  }

  try {
    const client = new Anthropic({ apiKey: keyToTest });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    return res.json({ valid: true, model: response.model });
  } catch (err) {
    if (err.status === 401) {
      return res.json({ valid: false, error: 'Invalid API key' });
    }
    return res.json({ valid: false, error: 'Connection failed' });
  }
});

// DELETE /api/settings/ai-key
router.delete('/ai-key', requirePro, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM settings WHERE key = ?').run('anthropic_api_key');
  res.json({ success: true });
});

// ─── SSL / Let's Encrypt endpoints ────────────────────────────────────────────

// GET /api/settings/ssl — return SSL status
router.get('/ssl', requireRole('admin'), async (req, res) => {
  try {
    const domain   = getSetting('ssl_domain')    || null;
    const certPath = getSetting('ssl_cert_path') || null;
    const keyPath  = getSetting('ssl_key_path')  || null;

    const configured = !!(domain && certPath && keyPath);

    let certInfo = null;
    if (certPath && fs.existsSync(certPath)) {
      const r = await run(`openssl x509 -in "${certPath}" -noout -enddate -subject 2>/dev/null`, 5000);
      if (!r.error) {
        const endMatch = r.stdout.match(/notAfter=(.+)/);
        const subjMatch = r.stdout.match(/subject=(.+)/);
        if (endMatch) {
          const exp = new Date(endMatch[1].trim());
          const daysLeft = Math.floor((exp - new Date()) / 86400000);
          certInfo = {
            notAfter: exp.toISOString(),
            daysLeft,
            subject: subjMatch ? subjMatch[1].trim() : null,
          };
        }
      }
    }

    res.json({ configured, domain, certPath, keyPath, certInfo });
  } catch (err) {
    console.error('[SSL] Status error:', err);
    res.status(500).json({ error: 'Failed to get SSL status' });
  }
});

// POST /api/settings/ssl/setup — install certbot + issue cert
router.post('/ssl/setup', requireRole('admin'), async (req, res) => {
  const { domain, email } = req.body;

  // Validate domain
  if (!domain || typeof domain !== 'string' ||
      !/^[a-zA-Z0-9.\-]+$/.test(domain) || domain.length > 253) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  // Validate email
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  auditLog(req.user.id, req.user.username, 'SSL_SETUP', domain, null, req.ip);

  try {
    // Check if certbot is installed
    const whichResult = await run('which certbot', 5000);
    if (whichResult.error || !whichResult.stdout.trim()) {
      // Install certbot
      const osRelease = await run('cat /etc/os-release 2>/dev/null', 3000);
      const osText = osRelease.stdout.toLowerCase();

      let installResult;
      if (osText.includes('ubuntu') || osText.includes('debian') || osText.includes('mint')) {
        installResult = await run('apt-get install -y certbot 2>&1', 180000);
      } else if (osText.includes('fedora')) {
        installResult = await run('dnf install -y certbot 2>&1', 180000);
      } else if (osText.includes('almalinux') || osText.includes('rocky') || osText.includes('centos') || osText.includes('rhel')) {
        await run('dnf install -y epel-release 2>&1', 60000);
        installResult = await run('dnf install -y certbot 2>&1', 180000);
      } else if (osText.includes('arch') || osText.includes('manjaro')) {
        installResult = await run('pacman -Sy --noconfirm certbot 2>&1', 180000);
      } else if (osText.includes('alpine')) {
        installResult = await run('apk add --no-cache certbot 2>&1', 180000);
      } else {
        // Fallback: try dnf then apt-get
        const tryDnf = await run('which dnf 2>/dev/null', 3000);
        if (!tryDnf.error && tryDnf.stdout.trim()) {
          installResult = await run('dnf install -y certbot 2>&1', 180000);
        } else {
          installResult = await run('apt-get install -y certbot 2>&1', 180000);
        }
      }

      if (installResult && installResult.error) {
        return res.status(500).json({ error: `Failed to install certbot: ${(installResult.stderr || installResult.stdout || installResult.error).trim()}` });
      }
    }

    // Run certbot
    const certbotCmd = `certbot certonly --standalone --non-interactive --agree-tos -m ${email} -d ${domain} 2>&1`;
    const certResult = await run(certbotCmd, 120000);

    if (certResult.error) {
      return res.status(500).json({ error: `Certbot failed: ${(certResult.stdout || certResult.stderr || certResult.error).trim()}` });
    }

    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const keyPath  = `/etc/letsencrypt/live/${domain}/privkey.pem`;

    // Save to DB
    setSetting('ssl_domain',    domain);
    setSetting('ssl_cert_path', certPath);
    setSetting('ssl_key_path',  keyPath);

    res.json({
      success: true,
      certPath,
      keyPath,
      message: `Certificate issued for ${domain}`,
      output: certResult.stdout,
    });
  } catch (err) {
    console.error('[SSL] Setup error:', err);
    res.status(500).json({ error: err.message || 'SSL setup failed' });
  }
});

// POST /api/settings/ssl/renew — renew the panel cert
router.post('/ssl/renew', requireRole('admin'), async (req, res) => {
  const domain = getSetting('ssl_domain');

  auditLog(req.user.id, req.user.username, 'SSL_RENEW', domain || 'all', null, req.ip);

  try {
    const cmd = domain
      ? `certbot renew --non-interactive --cert-name ${domain} 2>&1`
      : 'certbot renew --non-interactive 2>&1';

    const result = await run(cmd, 120000);

    if (result.error) {
      return res.status(500).json({ error: `Renewal failed: ${(result.stderr || result.stdout || result.error).trim()}` });
    }

    res.json({ success: true, message: 'Certificate renewed successfully', output: result.stdout });
  } catch (err) {
    console.error('[SSL] Renew error:', err);
    res.status(500).json({ error: err.message || 'Renewal failed' });
  }
});

// DELETE /api/settings/ssl — clear SSL config (doesn't delete cert files)
router.delete('/ssl', requireRole('admin'), (req, res) => {
  const domain = getSetting('ssl_domain');
  auditLog(req.user.id, req.user.username, 'SSL_REMOVE', domain || 'n/a', null, req.ip);

  try {
    const db = getDb();
    db.prepare('DELETE FROM settings WHERE key IN (?, ?, ?)').run('ssl_domain', 'ssl_cert_path', 'ssl_key_path');
    res.json({ success: true, message: 'SSL configuration cleared' });
  } catch (err) {
    console.error('[SSL] Delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to clear SSL config' });
  }
});

module.exports = router;
