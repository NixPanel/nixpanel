const express = require('express');
const requirePro = require('../../middleware/requirePro');
const { authenticateToken } = require('../../middleware/auth');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { detectWebServer, detectPkgManager } = require('./utils');

const execAsync = promisify(exec);
const router = express.Router();

// All hosting routes require Pro + auth
router.use(requirePro);
router.use(authenticateToken);

// Sub-routers
router.use('/domains', require('./domains'));
router.use('/email', require('./email'));
router.use('/databases', require('./databases'));
router.use('/php', require('./php'));
router.use('/wordpress', require('./wordpress'));
router.use('/ftp', require('./ftp'));
router.use('/dns', require('./dns'));

// GET /api/hosting/status - hosting dashboard overview
router.get('/status', async (req, res) => {
  try {
    const webServer = await detectWebServer();
    const services = {};

    for (const svc of ['nginx', 'apache2', 'httpd', 'mysql', 'mariadb', 'postfix', 'dovecot', 'vsftpd', 'named', 'bind9']) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 3000 });
        services[svc] = stdout.trim();
      } catch (_) { services[svc] = 'inactive'; }
    }

    // Count domains
    let domainCount = 0;
    try {
      const wsPath = webServer === 'nginx' ? '/etc/nginx/sites-available' : '/etc/apache2/sites-available';
      if (fs.existsSync(wsPath)) domainCount = fs.readdirSync(wsPath).filter(f => f.endsWith('.conf')).length;
    } catch (_) {}

    // Count WP installs
    let wpCount = 0;
    try {
      const { stdout } = await execAsync('find /var/www -name "wp-config.php" -maxdepth 6 2>/dev/null | wc -l', { timeout: 10000 });
      wpCount = parseInt(stdout.trim()) || 0;
    } catch (_) {}

    // Disk usage for /var/www
    let wwwUsage = null;
    try {
      const { stdout } = await execAsync('du -sh /var/www 2>/dev/null', { timeout: 10000 });
      wwwUsage = stdout.split('\t')[0];
    } catch (_) {}

    res.json({ webServer, services, domainCount, wpCount, wwwUsage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
