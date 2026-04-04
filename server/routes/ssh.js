const express = require('express');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const router = express.Router();

function sanitizeUsername(username) {
  if (!username || !/^[a-zA-Z0-9_\-]+$/.test(username) || username.length > 32) {
    throw new Error('Invalid username');
  }
  return username;
}

function getUserHome(username) {
  try {
    // Try to get home dir from /etc/passwd
    const passwd = fs.readFileSync('/etc/passwd', 'utf8');
    const line = passwd.split('\n').find(l => l.startsWith(username + ':'));
    if (line) {
      const parts = line.split(':');
      return parts[5] || `/home/${username}`;
    }
  } catch (_) {}
  return username === 'root' ? '/root' : `/home/${username}`;
}

function validatePublicKey(key) {
  const trimmed = key.trim();
  const validTypes = [
    'ssh-rsa', 'ssh-dss', 'ssh-ed25519', 'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'sk-ssh-ed25519@openssh.com',
    'sk-ecdsa-sha2-nistp256@openssh.com',
  ];
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return false;
  if (!validTypes.includes(parts[0])) return false;
  // Check base64 data
  if (!/^[A-Za-z0-9+/]+=*$/.test(parts[1])) return false;
  return true;
}

// GET /api/ssh/keys/:username
router.get('/keys/:username', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const username = sanitizeUsername(req.params.username);
    const homeDir = getUserHome(username);
    const authKeysPath = path.join(homeDir, '.ssh', 'authorized_keys');

    let keys = [];
    try {
      const content = fs.readFileSync(authKeysPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const parts = line.split(/\s+/);
        const keyObj = {
          index: i,
          type: parts[0] || 'unknown',
          key: parts[1] || '',
          comment: parts.slice(2).join(' ') || '',
          truncatedKey: parts[1] ? `${parts[1].substring(0, 20)}...${parts[1].slice(-10)}` : '',
          fingerprint: null,
        };

        // Get fingerprint
        try {
          const tmpFile = `/tmp/nixpanel-key-${Date.now()}-${i}`;
          fs.writeFileSync(tmpFile, line, { mode: 0o600 });
          const { stdout } = await execAsync(`ssh-keygen -l -f ${tmpFile} 2>/dev/null`, { timeout: 5000 });
          fs.unlinkSync(tmpFile);
          keyObj.fingerprint = stdout.trim().split(/\s+/).slice(1, 2).join('') || null;
        } catch (_) {}

        keys.push(keyObj);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    res.json({ username, keys });
  } catch (err) {
    console.error('[SSH] List keys error:', err);
    res.status(500).json({ error: err.message || 'Failed to list SSH keys' });
  }
});

// POST /api/ssh/keys/:username - add a public key
router.post('/keys/:username', authenticateToken, requireRole('admin'), async (req, res) => {
  const { key } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Public key is required' });
  }

  const trimmedKey = key.trim();
  if (!validatePublicKey(trimmedKey)) {
    return res.status(400).json({ error: 'Invalid SSH public key format' });
  }

  if (/[\n\r]/.test(trimmedKey.split(/\s+/).slice(0, 2).join(''))) {
    return res.status(400).json({ error: 'Invalid key format' });
  }

  try {
    const username = sanitizeUsername(req.params.username);
    const homeDir = getUserHome(username);
    const sshDir = path.join(homeDir, '.ssh');
    const authKeysPath = path.join(sshDir, 'authorized_keys');

    // Ensure .ssh dir exists
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
      await execAsync(`chown ${username}:${username} ${sshDir} 2>/dev/null || true`, { timeout: 3000 });
    }

    // Read existing keys and check for duplicates
    let existing = '';
    try {
      existing = fs.readFileSync(authKeysPath, 'utf8');
    } catch (_) {}

    const keyData = trimmedKey.split(/\s+/)[1];
    if (existing.includes(keyData)) {
      return res.status(400).json({ error: 'Key already exists' });
    }

    fs.appendFileSync(authKeysPath, '\n' + trimmedKey + '\n');
    await execAsync(`chmod 600 ${authKeysPath} && chown ${username}:${username} ${authKeysPath} 2>/dev/null || true`, { timeout: 3000 });

    auditLog(req.user.id, req.user.username, 'SSH_KEY_ADD', username, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    console.error('[SSH] Add key error:', err);
    res.status(500).json({ error: err.message || 'Failed to add SSH key' });
  }
});

// DELETE /api/ssh/keys/:username/:keyIndex
router.delete('/keys/:username/:keyIndex', authenticateToken, requireRole('admin'), async (req, res) => {
  const keyIndex = parseInt(req.params.keyIndex);
  if (isNaN(keyIndex) || keyIndex < 0) {
    return res.status(400).json({ error: 'Invalid key index' });
  }

  try {
    const username = sanitizeUsername(req.params.username);
    const homeDir = getUserHome(username);
    const authKeysPath = path.join(homeDir, '.ssh', 'authorized_keys');

    let content = '';
    try {
      content = fs.readFileSync(authKeysPath, 'utf8');
    } catch (_) {
      return res.status(404).json({ error: 'authorized_keys not found' });
    }

    const lines = content.split('\n');
    const keyLines = [];
    const lineMap = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l && !l.startsWith('#')) {
        lineMap.push(i);
        keyLines.push(l);
      }
    }

    if (keyIndex >= keyLines.length) {
      return res.status(404).json({ error: 'Key index out of range' });
    }

    // Remove the line
    lines.splice(lineMap[keyIndex], 1);
    fs.writeFileSync(authKeysPath, lines.join('\n'), { mode: 0o600 });

    auditLog(req.user.id, req.user.username, 'SSH_KEY_DELETE', `${username}[${keyIndex}]`, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    console.error('[SSH] Delete key error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete SSH key' });
  }
});

const KEYPAIR_STORE = '/etc/nixpanel/ssh';

function ensureKeypairStore() {
  if (!fs.existsSync(KEYPAIR_STORE)) {
    fs.mkdirSync(KEYPAIR_STORE, { recursive: true, mode: 0o700 });
  }
}

function sanitizeKeyName(name) {
  if (!name || typeof name !== 'string') throw new Error('Key name required');
  const safe = name.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 64);
  if (!safe) throw new Error('Invalid key name');
  return safe;
}

// POST /api/ssh/generate - generate a new key pair and store it
router.post('/generate', authenticateToken, requireRole('admin'), async (req, res) => {
  let { type = 'ed25519', bits = 4096, comment = '', name = '' } = req.body;

  const validTypes = ['rsa', 'ed25519', 'ecdsa'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid key type' });
  }

  bits = parseInt(bits) || 4096;
  if (bits < 1024 || bits > 8192) bits = 4096;

  comment = String(comment).replace(/[^a-zA-Z0-9@.\-_ ]/g, '').substring(0, 100);

  // Derive storage name from comment or generate timestamp-based name
  const storeName = name
    ? sanitizeKeyName(name)
    : `key_${type}_${Date.now()}`;

  try {
    ensureKeypairStore();
    const keyPath = path.join(KEYPAIR_STORE, storeName);

    if (fs.existsSync(keyPath)) {
      return res.status(400).json({ error: `A key named "${storeName}" already exists` });
    }

    let cmd = `ssh-keygen -t ${type} -f "${keyPath}" -N "" -q`;
    if (type === 'rsa') cmd += ` -b ${bits}`;
    if (comment) cmd += ` -C "${comment}"`;

    await execAsync(cmd, { timeout: 30000 });

    fs.chmodSync(keyPath, 0o600);
    fs.chmodSync(`${keyPath}.pub`, 0o644);

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const publicKey = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();

    let fingerprint = null;
    try {
      const { stdout } = await execAsync(`ssh-keygen -l -f "${keyPath}.pub"`, { timeout: 5000 });
      fingerprint = stdout.trim();
    } catch (_) {}

    auditLog(req.user.id, req.user.username, 'SSH_KEYGEN', storeName, null, req.ip);
    res.json({ privateKey, publicKey, fingerprint, type, bits, name: storeName });
  } catch (err) {
    console.error('[SSH] Generate error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate key pair' });
  }
});

// GET /api/ssh/keypairs - list all stored key pairs
router.get('/keypairs', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    ensureKeypairStore();
    const files = fs.readdirSync(KEYPAIR_STORE);
    const keypairs = [];
    const seen = new Set();

    for (const file of files) {
      if (file.endsWith('.pub')) continue;
      const name = file;
      if (seen.has(name)) continue;
      seen.add(name);

      const privatePath = path.join(KEYPAIR_STORE, name);
      const publicPath = `${privatePath}.pub`;
      if (!fs.existsSync(publicPath)) continue;

      const publicKey = fs.readFileSync(publicPath, 'utf8').trim();
      const parts = publicKey.split(/\s+/);
      const stat = fs.statSync(privatePath);

      let fingerprint = null;
      try {
        const result = require('child_process').execFileSync(
          'ssh-keygen', ['-l', '-f', publicPath], { timeout: 5000 }
        ).toString().trim();
        fingerprint = result.split(/\s+/).slice(1, 2).join('') || null;
      } catch (_) {}

      keypairs.push({
        name,
        type: parts[0] || 'unknown',
        comment: parts.slice(2).join(' ') || '',
        fingerprint,
        publicKey,
        createdAt: stat.birthtime || stat.mtime,
        privatePath,
        publicPath,
      });
    }

    keypairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ keypairs });
  } catch (err) {
    console.error('[SSH] List keypairs error:', err);
    res.status(500).json({ error: 'Failed to list key pairs' });
  }
});

// GET /api/ssh/keypairs/:name/download?type=public|private
router.get('/keypairs/:name/download', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const name = sanitizeKeyName(req.params.name);
    const keyType = req.query.type === 'private' ? 'private' : 'public';
    const filePath = keyType === 'private'
      ? path.join(KEYPAIR_STORE, name)
      : path.join(KEYPAIR_STORE, `${name}.pub`);

    if (!filePath.startsWith(KEYPAIR_STORE + '/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const filename = keyType === 'private' ? name : `${name}.pub`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    auditLog(req.user.id, req.user.username, 'SSH_KEY_DOWNLOAD', `${name}:${keyType}`, null, req.ip);
    res.send(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ssh/keypairs/:name/authorize - add public key to a user's authorized_keys
router.post('/keypairs/:name/authorize', authenticateToken, requireRole('admin'), async (req, res) => {
  const { username = 'root' } = req.body;
  try {
    const name = sanitizeKeyName(req.params.name);
    const publicPath = path.join(KEYPAIR_STORE, `${name}.pub`);
    if (!fs.existsSync(publicPath)) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const publicKey = fs.readFileSync(publicPath, 'utf8').trim();
    const safeUser = sanitizeUsername(username);
    const homeDir = getUserHome(safeUser);
    const sshDir = path.join(homeDir, '.ssh');
    const authKeysPath = path.join(sshDir, 'authorized_keys');

    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
      await execAsync(`chown ${safeUser}:${safeUser} "${sshDir}" 2>/dev/null || true`, { timeout: 3000 });
    }

    let existing = '';
    try { existing = fs.readFileSync(authKeysPath, 'utf8'); } catch (_) {}

    const keyData = publicKey.split(/\s+/)[1];
    if (existing.includes(keyData)) {
      return res.status(400).json({ error: 'Key already in authorized_keys' });
    }

    fs.appendFileSync(authKeysPath, '\n' + publicKey + '\n');
    await execAsync(`chmod 600 "${authKeysPath}" && chown ${safeUser}:${safeUser} "${authKeysPath}" 2>/dev/null || true`, { timeout: 3000 });

    auditLog(req.user.id, req.user.username, 'SSH_KEY_AUTHORIZE', `${name} -> ${safeUser}`, null, req.ip);
    res.json({ success: true, message: `Public key authorized for ${safeUser}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/ssh/keypairs/:name
router.delete('/keypairs/:name', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const name = sanitizeKeyName(req.params.name);
    const privatePath = path.join(KEYPAIR_STORE, name);
    const publicPath = `${privatePath}.pub`;

    if (!privatePath.startsWith(KEYPAIR_STORE + '/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    let deleted = false;
    if (fs.existsSync(privatePath)) { fs.unlinkSync(privatePath); deleted = true; }
    if (fs.existsSync(publicPath)) { fs.unlinkSync(publicPath); deleted = true; }

    if (!deleted) return res.status(404).json({ error: 'Key not found' });

    auditLog(req.user.id, req.user.username, 'SSH_KEYPAIR_DELETE', name, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
