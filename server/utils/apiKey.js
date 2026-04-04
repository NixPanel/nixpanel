const crypto = require('crypto');
const { getSetting } = require('../db/database');

function getEncryptionKey() {
  const secret = process.env.JWT_SECRET || 'nixpanel-default-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptKey(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptKey(encryptedText) {
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length < 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts.slice(1).join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_) {
    return null;
  }
}

// Returns the decrypted Anthropic API key from settings, or null
function getAnthropicApiKey() {
  const encrypted = getSetting('anthropic_api_key');
  if (!encrypted) return null;
  return decryptKey(encrypted);
}

module.exports = { encryptKey, decryptKey, getAnthropicApiKey };
