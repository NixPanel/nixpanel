const { getSetting } = require('../db/database');

function requirePro(req, res, next) {
  const status = getSetting('license_status');
  const expires = getSetting('license_expires');

  // Check if license is valid and not expired
  if (status === 'active') {
    if (expires) {
      const expiresDate = new Date(expires);
      if (expiresDate > new Date()) {
        return next(); // Valid pro license
      }
    } else {
      return next(); // Active with no expiry (lifetime)
    }
  }

  res.status(403).json({
    error: 'Pro feature',
    code: 'PRO_REQUIRED',
    message: 'This feature requires a NixPanel Pro license.',
    upgradeUrl: '/upgrade',
  });
}

module.exports = requirePro;
