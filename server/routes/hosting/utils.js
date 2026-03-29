const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Detect web server
async function detectWebServer() {
  const checks = [
    { name: 'nginx', check: 'systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null' },
    { name: 'apache2', check: 'systemctl is-active apache2 2>/dev/null || systemctl is-active httpd 2>/dev/null' },
  ];
  for (const c of checks) {
    try {
      const { stdout } = await execAsync(c.check, { timeout: 5000 });
      if (stdout.includes('active')) return c.name === 'apache2' ? 'apache' : c.name;
    } catch (_) {}
  }
  // Check if installed even if not running
  for (const bin of [['nginx','nginx'],['apache','apache2'],['apache','httpd']]) {
    try { await execAsync(`which ${bin[1]}`, {timeout:3000}); return bin[0]; } catch(_){}
  }
  return null;
}

// Detect package manager
async function detectPkgManager() {
  for (const [bin, name] of [['apt-get','apt'],['dnf','dnf'],['yum','yum']]) {
    try { await execAsync(`which ${bin}`, {timeout:3000}); return name; } catch(_){}
  }
  return null;
}

// Validate domain name
function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain) && domain.length <= 253;
}

// Validate username (for FTP, email, DB)
function validateUsername(username) {
  return /^[a-z0-9_][a-z0-9_\-]{1,30}$/.test(username);
}

// Sanitize path - must be absolute, no traversal
function sanitizePath(p) {
  if (!p || typeof p !== 'string') throw new Error('Invalid path');
  const normalized = path.normalize(p);
  if (!path.isAbsolute(normalized)) throw new Error('Path must be absolute');
  if (normalized.includes('..')) throw new Error('Path traversal not allowed');
  return normalized;
}

// Get web server config dirs
function getWebServerPaths(server) {
  if (server === 'nginx') {
    return {
      sitesAvailable: '/etc/nginx/sites-available',
      sitesEnabled: '/etc/nginx/sites-enabled',
      configDir: '/etc/nginx',
      logDir: '/var/log/nginx',
      reload: 'systemctl reload nginx',
      test: 'nginx -t',
    };
  }
  return {
    sitesAvailable: '/etc/apache2/sites-available',
    sitesEnabled: '/etc/apache2/sites-enabled',
    configDir: '/etc/apache2',
    logDir: '/var/log/apache2',
    reload: 'systemctl reload apache2 2>/dev/null || systemctl reload httpd',
    test: 'apache2ctl -t 2>&1 || apachectl -t 2>&1',
  };
}

// Default document root
function getDocRoot(domain) {
  return `/var/www/${domain}/public_html`;
}

module.exports = { detectWebServer, detectPkgManager, validateDomain, validateUsername, sanitizePath, getWebServerPaths, getDocRoot };
