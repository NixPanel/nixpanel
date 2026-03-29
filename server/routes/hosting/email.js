const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { auditLog } = require('../../db/database');
const { validateDomain, validateUsername, detectPkgManager } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

const VIRTUAL_MAILBOX_MAPS = '/etc/postfix/vmailbox';
const VIRTUAL_ALIAS_MAPS = '/etc/postfix/virtual';
const MAIL_BASE = '/var/mail/vhosts';

function validateEmailLocal(local) {
  return /^[a-zA-Z0-9._+\-]{1,64}$/.test(local);
}

// GET /api/hosting/email/accounts
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = [];
    // Read vmailbox map
    if (fs.existsSync(VIRTUAL_MAILBOX_MAPS)) {
      const lines = fs.readFileSync(VIRTUAL_MAILBOX_MAPS, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const [email, maildir] = line.split(/\s+/);
        if (!email) continue;
        const parts = email.split('@');
        const local = parts[0];
        const domain = parts[1];
        let size = '0';
        try {
          const maildirPath = path.join(MAIL_BASE, domain, local);
          if (fs.existsSync(maildirPath)) {
            const { stdout } = await execAsync(`du -sh "${maildirPath}" 2>/dev/null`, { timeout: 5000 });
            size = stdout.split('\t')[0];
          }
        } catch (_) {}
        accounts.push({ email, local, domain, maildir, size });
      }
    }
    // Also check postfix status
    let postfixStatus = 'unknown';
    try {
      const { stdout } = await execAsync('systemctl is-active postfix 2>/dev/null || service postfix status 2>/dev/null', { timeout: 5000 });
      postfixStatus = stdout.trim().includes('active') ? 'active' : 'inactive';
    } catch (_) { postfixStatus = 'inactive'; }

    res.json({ accounts, postfixStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/email/accounts - create email account
router.post('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  const { email, password, quota } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email address' });
  const atIdx = email.indexOf('@');
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!validateEmailLocal(local) || !validateDomain(domain)) return res.status(400).json({ error: 'Invalid email format' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    // Create maildir structure
    const maildirPath = path.join(MAIL_BASE, domain, local);
    await execAsync(`mkdir -p "${maildirPath}/Maildir/{cur,new,tmp}" && chown -R vmail:vmail "${MAIL_BASE}" 2>/dev/null || true`, { timeout: 10000 });

    // Add to vmailbox map
    const entry = `${email} ${domain}/${local}/Maildir/\n`;
    if (!fs.existsSync(VIRTUAL_MAILBOX_MAPS)) fs.writeFileSync(VIRTUAL_MAILBOX_MAPS, '');
    const existing = fs.readFileSync(VIRTUAL_MAILBOX_MAPS, 'utf-8');
    if (existing.includes(email)) return res.status(409).json({ error: 'Email already exists' });
    fs.appendFileSync(VIRTUAL_MAILBOX_MAPS, entry);

    // Add password to passwd db (saslpasswd2 or doveadm)
    const escapedPw = password.replace(/'/g, "'\\''");
    let hashStored = false;
    try {
      const { stdout: hashOut } = await execAsync(`doveadm pw -s SHA512-CRYPT -p '${escapedPw}' 2>/dev/null`, { timeout: 10000 });
      const hash = hashOut.trim();
      const passwdFile = '/etc/dovecot/passwd';
      if (!fs.existsSync(passwdFile)) fs.writeFileSync(passwdFile, '');
      const passwdContent = fs.readFileSync(passwdFile, 'utf-8');
      if (!passwdContent.includes(email + ':')) {
        fs.appendFileSync(passwdFile, `${email}:{SHA512-CRYPT}${hash}\n`);
      }
      hashStored = true;
    } catch (_) {}

    if (!hashStored) {
      const hash = await bcrypt.hash(password, 12);
      const passwdFile = '/etc/dovecot/passwd';
      if (!fs.existsSync(passwdFile)) fs.writeFileSync(passwdFile, '');
      fs.appendFileSync(passwdFile, `${email}:{BLF-CRYPT}${hash}\n`);
    }

    // Rebuild postfix maps
    await execAsync(`postmap ${VIRTUAL_MAILBOX_MAPS} 2>/dev/null || true`, { timeout: 10000 });
    await execAsync('systemctl reload postfix 2>/dev/null || true', { timeout: 10000 });

    auditLog(req.user.id, req.user.username, 'EMAIL_CREATE', email, { domain }, req.ip);
    res.status(201).json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/email/accounts/:email
router.delete('/accounts/:email', authenticateToken, requireRole('admin'), async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  const atIdx = email.indexOf('@');
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!validateEmailLocal(local) || !validateDomain(domain)) return res.status(400).json({ error: 'Invalid email format' });

  try {
    // Remove from vmailbox
    if (fs.existsSync(VIRTUAL_MAILBOX_MAPS)) {
      const lines = fs.readFileSync(VIRTUAL_MAILBOX_MAPS, 'utf-8').split('\n').filter(l => !l.startsWith(email + ' ') && !l.startsWith(email + '\t'));
      fs.writeFileSync(VIRTUAL_MAILBOX_MAPS, lines.join('\n'));
    }
    // Remove from dovecot passwd
    const passwdFile = '/etc/dovecot/passwd';
    if (fs.existsSync(passwdFile)) {
      const lines = fs.readFileSync(passwdFile, 'utf-8').split('\n').filter(l => !l.startsWith(email + ':'));
      fs.writeFileSync(passwdFile, lines.join('\n'));
    }
    await execAsync(`postmap ${VIRTUAL_MAILBOX_MAPS} 2>/dev/null || true`, { timeout: 10000 });
    await execAsync('systemctl reload postfix 2>/dev/null || true', { timeout: 10000 });
    auditLog(req.user.id, req.user.username, 'EMAIL_DELETE', email, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/email/forwarders
router.get('/forwarders', authenticateToken, async (req, res) => {
  try {
    const forwarders = [];
    if (fs.existsSync(VIRTUAL_ALIAS_MAPS)) {
      const lines = fs.readFileSync(VIRTUAL_ALIAS_MAPS, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) forwarders.push({ from: parts[0], to: parts.slice(1).join(', ') });
      }
    }
    res.json({ forwarders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hosting/email/forwarders
router.post('/forwarders', authenticateToken, requireRole('admin'), async (req, res) => {
  const { from: fromAddr, to: toAddr } = req.body;
  if (!fromAddr || !toAddr) return res.status(400).json({ error: 'from and to required' });
  if (!fromAddr.includes('@') || !toAddr.includes('@')) return res.status(400).json({ error: 'Invalid email addresses' });
  try {
    if (!fs.existsSync(VIRTUAL_ALIAS_MAPS)) fs.writeFileSync(VIRTUAL_ALIAS_MAPS, '');
    fs.appendFileSync(VIRTUAL_ALIAS_MAPS, `${fromAddr} ${toAddr}\n`);
    await execAsync(`postmap ${VIRTUAL_ALIAS_MAPS} 2>/dev/null || true`, { timeout: 10000 });
    await execAsync('systemctl reload postfix 2>/dev/null || true', { timeout: 10000 });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hosting/email/forwarders/:from
router.delete('/forwarders/:from', authenticateToken, requireRole('admin'), async (req, res) => {
  const from = decodeURIComponent(req.params.from);
  if (!from.includes('@')) return res.status(400).json({ error: 'Invalid address' });
  try {
    if (fs.existsSync(VIRTUAL_ALIAS_MAPS)) {
      const lines = fs.readFileSync(VIRTUAL_ALIAS_MAPS, 'utf-8').split('\n').filter(l => !l.startsWith(from + ' ') && !l.startsWith(from + '\t'));
      fs.writeFileSync(VIRTUAL_ALIAS_MAPS, lines.join('\n'));
      await execAsync(`postmap ${VIRTUAL_ALIAS_MAPS} 2>/dev/null || true`, { timeout: 10000 });
      await execAsync('systemctl reload postfix 2>/dev/null || true', { timeout: 10000 });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hosting/email/dns-records/:domain - generate DNS record suggestions
router.get('/dns-records/:domain', authenticateToken, async (req, res) => {
  const { domain } = req.params;
  if (!validateDomain(domain)) return res.status(400).json({ error: 'Invalid domain' });

  // Get server IP
  let serverIp = '';
  try {
    const { stdout } = await execAsync("curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}'", { timeout: 10000 });
    serverIp = stdout.trim();
  } catch (_) {}

  const records = [
    { type: 'MX', name: domain, value: `mail.${domain}`, priority: 10, description: 'Mail server record' },
    { type: 'A', name: `mail.${domain}`, value: serverIp || 'YOUR_SERVER_IP', description: 'Mail server A record' },
    { type: 'TXT', name: domain, value: `v=spf1 ip4:${serverIp || 'YOUR_SERVER_IP'} a mx ~all`, description: 'SPF record - authorizes your server to send email' },
    { type: 'TXT', name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`, description: 'DMARC policy record' },
    { type: 'TXT', name: `_domainkey.${domain}`, value: 'v=DKIM1; k=rsa; p=YOUR_DKIM_PUBLIC_KEY', description: 'DKIM record (generate key with opendkim-genkey)' },
  ];

  res.json({ domain, serverIp, records });
});

// GET /api/hosting/email/status - check mail server status
router.get('/status', authenticateToken, async (req, res) => {
  const services = {};
  for (const svc of ['postfix', 'dovecot', 'opendkim', 'spamassassin']) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 5000 });
      services[svc] = stdout.trim() === 'active' ? 'active' : 'inactive';
    } catch (_) {
      services[svc] = 'not-installed';
    }
  }
  res.json({ services });
});

module.exports = router;
