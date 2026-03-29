const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

const CERT_DIRS = [
  '/etc/ssl/certs',
  '/etc/letsencrypt/live',
  '/etc/nginx/ssl',
  '/etc/apache2/ssl',
];

function sanitizeDomain(domain) {
  if (!domain || !/^[a-zA-Z0-9.\-]+$/.test(domain) || domain.length > 253) {
    throw new Error('Invalid domain name');
  }
  return domain;
}

function sanitizeEmail(email) {
  if (!email || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new Error('Invalid email address');
  }
  return email;
}

async function parseCertificate(certPath) {
  try {
    const { stdout } = await execAsync(
      `openssl x509 -in "${certPath}" -noout -text -subject -issuer -dates -fingerprint -ext subjectAltName 2>/dev/null`,
      { timeout: 10000 }
    );

    const cert = {
      path: certPath,
      name: path.basename(certPath),
      subject: null,
      issuer: null,
      notBefore: null,
      notAfter: null,
      fingerprint: null,
      sans: [],
      status: 'valid',
    };

    // Parse subject
    const subjectMatch = stdout.match(/subject=(.+)/);
    if (subjectMatch) cert.subject = subjectMatch[1].trim();

    // Parse issuer
    const issuerMatch = stdout.match(/issuer=(.+)/);
    if (issuerMatch) cert.issuer = issuerMatch[1].trim();

    // Parse dates
    const beforeMatch = stdout.match(/notBefore=(.+)/);
    if (beforeMatch) cert.notBefore = new Date(beforeMatch[1].trim()).toISOString();

    const afterMatch = stdout.match(/notAfter=(.+)/);
    if (afterMatch) {
      cert.notAfter = new Date(afterMatch[1].trim()).toISOString();

      const expiry = new Date(afterMatch[1].trim());
      const now = new Date();
      const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));

      if (expiry < now) {
        cert.status = 'expired';
      } else if (daysLeft < 30) {
        cert.status = 'warning';
      } else {
        cert.status = 'valid';
      }
      cert.daysLeft = daysLeft;
    }

    // Parse fingerprint
    const fpMatch = stdout.match(/SHA1 Fingerprint=(.+)/i) || stdout.match(/Fingerprint=(.+)/i);
    if (fpMatch) cert.fingerprint = fpMatch[1].trim();

    // Parse SANs
    const sanMatch = stdout.match(/X509v3 Subject Alternative Name:[\s\S]*?(\n\s+[^\n]+)/);
    if (sanMatch) {
      cert.sans = sanMatch[1].trim().split(',').map(s => s.trim().replace(/^DNS:/, ''));
    }

    // Extract CN from subject
    const cnMatch = cert.subject && cert.subject.match(/CN\s*=\s*([^,/]+)/);
    cert.cn = cnMatch ? cnMatch[1].trim() : cert.name;

    return cert;
  } catch (err) {
    return null;
  }
}

// GET /api/ssl/certs
router.get('/certs', authenticateToken, async (req, res) => {
  try {
    const certs = [];

    for (const dir of CERT_DIRS) {
      try {
        if (!fs.existsSync(dir)) continue;
        const stat = fs.statSync(dir);

        if (dir === '/etc/letsencrypt/live') {
          // Sub-directories are domain names
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const certPath = path.join(dir, entry.name, 'cert.pem');
              if (fs.existsSync(certPath)) {
                const cert = await parseCertificate(certPath);
                if (cert) certs.push(cert);
              }
            }
          }
        } else {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (!file.endsWith('.pem') && !file.endsWith('.crt') && !file.endsWith('.cer')) continue;
            const fullPath = path.join(dir, file);
            try {
              const fstat = fs.statSync(fullPath);
              if (!fstat.isFile()) continue;
              const cert = await parseCertificate(fullPath);
              if (cert) certs.push(cert);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    res.json({ certs, count: certs.length });
  } catch (err) {
    console.error('[SSL] List error:', err);
    res.status(500).json({ error: 'Failed to list certificates' });
  }
});

// GET /api/ssl/certs/:name
router.get('/certs/:name', authenticateToken, async (req, res) => {
  const name = req.params.name;

  // Validate: no path traversal
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid certificate name' });
  }

  try {
    // Search for the cert in known directories
    let certPath = null;
    for (const dir of CERT_DIRS) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        certPath = candidate;
        break;
      }
      // Check letsencrypt subdirs
      if (dir === '/etc/letsencrypt/live') {
        const candidate2 = path.join(dir, name, 'cert.pem');
        if (fs.existsSync(candidate2)) {
          certPath = candidate2;
          break;
        }
      }
    }

    if (!certPath) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const cert = await parseCertificate(certPath);
    if (!cert) {
      return res.status(500).json({ error: 'Failed to parse certificate' });
    }

    // Get full text
    try {
      const { stdout } = await execAsync(`openssl x509 -in "${certPath}" -noout -text 2>/dev/null`, { timeout: 10000 });
      cert.fullText = stdout;
    } catch (_) {}

    res.json(cert);
  } catch (err) {
    console.error('[SSL] Get cert error:', err);
    res.status(500).json({ error: 'Failed to get certificate details' });
  }
});

// POST /api/ssl/certbot - run certbot for a domain
router.post('/certbot', authenticateToken, requireRole('admin'), async (req, res) => {
  const { domain, email, webroot, webrootPath } = req.body;

  try {
    const safeDomain = sanitizeDomain(domain);
    const safeEmail = sanitizeEmail(email);

    let cmd = `certbot certonly --non-interactive --agree-tos --email ${safeEmail} -d ${safeDomain}`;

    if (webroot && webrootPath) {
      // Validate webroot path
      if (!path.isAbsolute(webrootPath) || webrootPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid webroot path' });
      }
      cmd += ` --webroot -w ${webrootPath}`;
    } else {
      cmd += ' --standalone';
    }

    auditLog(req.user.id, req.user.username, 'SSL_CERTBOT', safeDomain, null, req.ip);

    const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
    res.json({ success: true, output: stdout + stderr });
  } catch (err) {
    console.error('[SSL] Certbot error:', err);
    res.status(500).json({ error: err.message || 'Certbot failed', output: err.stderr || '' });
  }
});

// POST /api/ssl/renew - run certbot renew
router.post('/renew', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    auditLog(req.user.id, req.user.username, 'SSL_RENEW', 'all', null, req.ip);
    const { stdout, stderr } = await execAsync('certbot renew --non-interactive 2>&1', { timeout: 300000 });
    res.json({ success: true, output: stdout + stderr });
  } catch (err) {
    console.error('[SSL] Renew error:', err);
    res.status(500).json({ error: err.message || 'Renewal failed', output: err.stderr || '' });
  }
});

module.exports = router;
