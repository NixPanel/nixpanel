const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');

const execAsync = promisify(exec);
const router = express.Router();

// All security routes require admin
router.use(authenticateToken, requireRole('admin'));

// Validate jail name (alphanumeric + hyphens)
function validateJailName(name) {
  if (!name || typeof name !== 'string') throw new Error('Jail name required');
  if (!/^[a-zA-Z0-9\-_]+$/.test(name) || name.length > 64) throw new Error('Invalid jail name');
  return name;
}

// Validate IP address (IPv4 or IPv6)
function validateIP(ip) {
  if (!ip || typeof ip !== 'string') throw new Error('IP address required');
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  const trimmed = ip.trim();
  if (!ipv4.test(trimmed) && !ipv6.test(trimmed)) throw new Error('Invalid IP address');
  if (trimmed.length > 45) throw new Error('IP address too long');
  return trimmed;
}

// Helper to run a command with timeout
async function run(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout });
    return { stdout: stdout || '', stderr: stderr || '', error: null };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', error: err.message };
  }
}

// GET /api/security/score
router.get('/score', async (req, res) => {
  try {
    const findings = [];
    let score = 100;

    // Check SSH config
    let sshConfig = '';
    try {
      sshConfig = fs.readFileSync('/etc/ssh/sshd_config', 'utf8');
    } catch (_) {}

    if (sshConfig) {
      const rootLoginMatch = sshConfig.match(/^\s*PermitRootLogin\s+(\S+)/im);
      const rootLogin = rootLoginMatch ? rootLoginMatch[1].toLowerCase() : 'yes';
      if (rootLogin !== 'no') {
        score -= 15;
        findings.push({ severity: 'high', category: 'SSH', message: `PermitRootLogin is "${rootLogin}" - should be "no"` });
      } else {
        findings.push({ severity: 'ok', category: 'SSH', message: 'PermitRootLogin is disabled' });
      }

      const passAuthMatch = sshConfig.match(/^\s*PasswordAuthentication\s+(\S+)/im);
      const passAuth = passAuthMatch ? passAuthMatch[1].toLowerCase() : 'yes';
      if (passAuth !== 'no') {
        score -= 15;
        findings.push({ severity: 'high', category: 'SSH', message: `PasswordAuthentication is "${passAuth}" - consider disabling` });
      } else {
        findings.push({ severity: 'ok', category: 'SSH', message: 'Password authentication is disabled' });
      }

      const portMatch = sshConfig.match(/^\s*Port\s+(\d+)/im);
      const sshPort = portMatch ? parseInt(portMatch[1]) : 22;
      if (sshPort === 22) {
        score -= 5;
        findings.push({ severity: 'medium', category: 'SSH', message: 'SSH is on default port 22 - consider changing' });
      } else {
        findings.push({ severity: 'ok', category: 'SSH', message: `SSH running on non-default port ${sshPort}` });
      }
    }

    // Check fail2ban
    const f2bResult = await run('fail2ban-client status 2>/dev/null', 10000);
    if (f2bResult.error || !f2bResult.stdout.includes('Jail list')) {
      score -= 10;
      findings.push({ severity: 'medium', category: 'Fail2Ban', message: 'fail2ban is not running or not installed' });
    } else {
      findings.push({ severity: 'ok', category: 'Fail2Ban', message: 'fail2ban is active' });
    }

    // Check for available updates
    const updatesResult = await run('apt list --upgradable 2>/dev/null | grep -c upgradable || dnf check-update --quiet 2>/dev/null | grep -c "^[a-zA-Z]" || echo "0"', 20000);
    const updateCount = parseInt(updatesResult.stdout.trim()) || 0;
    if (updateCount > 20) {
      score -= 15;
      findings.push({ severity: 'high', category: 'Updates', message: `${updateCount} packages have available updates` });
    } else if (updateCount > 0) {
      score -= 5;
      findings.push({ severity: 'medium', category: 'Updates', message: `${updateCount} packages have available updates` });
    } else {
      findings.push({ severity: 'ok', category: 'Updates', message: 'System packages are up to date' });
    }

    // Check open ports
    const portsResult = await run('ss -tunlp 2>/dev/null', 10000);
    const expectedPorts = new Set([22, 80, 443, 3001, 3000, 8080]);
    const portLines = portsResult.stdout.split('\n').filter(l => l.trim() && !l.startsWith('Netid'));
    const openPorts = [];
    for (const line of portLines) {
      const portMatch = line.match(/:(\d+)\s/);
      if (portMatch) {
        const p = parseInt(portMatch[1]);
        if (!expectedPorts.has(p)) openPorts.push(p);
      }
    }
    const unexpectedPorts = [...new Set(openPorts)].filter(p => p > 0);
    if (unexpectedPorts.length > 5) {
      score -= 10;
      findings.push({ severity: 'medium', category: 'Ports', message: `${unexpectedPorts.length} unexpected open ports detected` });
    } else if (unexpectedPorts.length > 0) {
      findings.push({ severity: 'info', category: 'Ports', message: `${unexpectedPorts.length} unexpected ports open: ${unexpectedPorts.slice(0, 5).join(', ')}` });
    } else {
      findings.push({ severity: 'ok', category: 'Ports', message: 'No unexpected open ports detected' });
    }

    // Check for recent failed logins
    const lastbResult = await run('lastb -n 50 2>/dev/null | wc -l', 10000);
    const failedLogins = parseInt(lastbResult.stdout.trim()) || 0;
    if (failedLogins > 20) {
      score -= 5;
      findings.push({ severity: 'medium', category: 'Logins', message: `${failedLogins} failed login attempts in recent history` });
    } else {
      findings.push({ severity: 'ok', category: 'Logins', message: 'No excessive failed login attempts' });
    }

    score = Math.max(0, Math.min(100, score));

    res.json({ score, findings });
  } catch (err) {
    console.error('[Security] Score error:', err);
    res.status(500).json({ error: 'Failed to compute security score' });
  }
});

// GET /api/security/fail2ban
router.get('/fail2ban', async (req, res) => {
  try {
    const statusResult = await run('fail2ban-client status 2>/dev/null', 15000);

    if (statusResult.error || !statusResult.stdout.includes('Jail list')) {
      return res.json({ active: false, jails: [], error: 'fail2ban is not running' });
    }

    // Parse jail list
    const jailMatch = statusResult.stdout.match(/Jail list:\s*(.+)/);
    const jailNames = jailMatch
      ? jailMatch[1].split(',').map(j => j.trim()).filter(Boolean)
      : [];

    const jails = [];
    for (const jailName of jailNames) {
      const jailResult = await run(`fail2ban-client status ${jailName} 2>/dev/null`, 10000);
      const jailOut = jailResult.stdout;

      const currentlyBannedMatch = jailOut.match(/Currently banned:\s*(\d+)/);
      const totalBannedMatch = jailOut.match(/Total banned:\s*(\d+)/);
      const bannedIPsMatch = jailOut.match(/Banned IP list:\s*(.+)/);
      const failedMatch = jailOut.match(/Currently failed:\s*(\d+)/);

      const bannedIPs = bannedIPsMatch && bannedIPsMatch[1].trim()
        ? bannedIPsMatch[1].trim().split(/\s+/).filter(Boolean)
        : [];

      jails.push({
        name: jailName,
        currentlyBanned: parseInt(currentlyBannedMatch?.[1] || '0'),
        totalBanned: parseInt(totalBannedMatch?.[1] || '0'),
        currentlyFailed: parseInt(failedMatch?.[1] || '0'),
        bannedIPs,
      });
    }

    res.json({ active: true, jails });
  } catch (err) {
    console.error('[Security] Fail2ban error:', err);
    res.status(500).json({ error: 'Failed to get fail2ban status' });
  }
});

// POST /api/security/fail2ban/unban
router.post('/fail2ban/unban', async (req, res) => {
  const { jail, ip } = req.body;

  try {
    const safeJail = validateJailName(jail);
    const safeIP = validateIP(ip);

    auditLog(req.user.id, req.user.username, 'FAIL2BAN_UNBAN', `${safeJail}/${safeIP}`, null, req.ip);

    const result = await run(`fail2ban-client set ${safeJail} unbanip ${safeIP} 2>&1`, 15000);
    const output = (result.stdout + result.stderr).trim();

    res.json({ success: true, output });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/security/logins
router.get('/logins', async (req, res) => {
  try {
    const [lastResult, lastbResult] = await Promise.all([
      run('last -n 20 2>/dev/null', 15000),
      run('lastb -n 20 2>/dev/null || journalctl _SYSTEMD_UNIT=sshd.service -n 50 --no-pager 2>/dev/null', 15000),
    ]);

    // Parse `last` output
    const parseLogins = (output, type) => {
      const logins = [];
      const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('wtmp') && !l.startsWith('btmp'));
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 3) continue;
        logins.push({
          type,
          user: parts[0],
          terminal: parts[1],
          ip: parts[2] && parts[2] !== 'tty' ? parts[2] : '',
          date: parts.slice(3, 7).join(' '),
          raw: line,
        });
      }
      return logins;
    };

    const recentLogins = parseLogins(lastResult.stdout, 'success');
    const failedLogins = parseLogins(lastbResult.stdout, 'failed');

    res.json({ recentLogins, failedLogins });
  } catch (err) {
    console.error('[Security] Logins error:', err);
    res.status(500).json({ error: 'Failed to get login history' });
  }
});

// GET /api/security/ssh-config
router.get('/ssh-config', async (req, res) => {
  try {
    let config = '';
    try {
      config = fs.readFileSync('/etc/ssh/sshd_config', 'utf8');
    } catch (_) {
      return res.json({ error: 'Could not read /etc/ssh/sshd_config', checks: [] });
    }

    const checks = [];

    const getVal = (key, defaultVal) => {
      const m = config.match(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'im'));
      return m ? m[1] : defaultVal;
    };

    const rootLogin = getVal('PermitRootLogin', 'yes');
    checks.push({
      key: 'PermitRootLogin',
      value: rootLogin,
      pass: rootLogin.toLowerCase() === 'no',
      recommendation: 'Should be "no" to prevent direct root SSH access',
    });

    const passAuth = getVal('PasswordAuthentication', 'yes');
    checks.push({
      key: 'PasswordAuthentication',
      value: passAuth,
      pass: passAuth.toLowerCase() === 'no',
      recommendation: 'Disable and use key-based authentication only',
    });

    const port = getVal('Port', '22');
    checks.push({
      key: 'Port',
      value: port,
      pass: port !== '22',
      recommendation: 'Consider changing from default port 22',
    });

    const maxAuthTries = getVal('MaxAuthTries', '6');
    const maxAuthNum = parseInt(maxAuthTries);
    checks.push({
      key: 'MaxAuthTries',
      value: maxAuthTries,
      pass: maxAuthNum <= 3,
      recommendation: 'Should be 3 or less to limit brute force attempts',
    });

    const protocol = getVal('Protocol', '2');
    checks.push({
      key: 'Protocol',
      value: protocol,
      pass: protocol === '2',
      recommendation: 'Should be 2 only (SSH protocol version)',
    });

    const x11Forward = getVal('X11Forwarding', 'no');
    checks.push({
      key: 'X11Forwarding',
      value: x11Forward,
      pass: x11Forward.toLowerCase() === 'no',
      recommendation: 'Disable X11Forwarding if not needed',
    });

    const allowAgentForwarding = getVal('AllowAgentForwarding', 'yes');
    checks.push({
      key: 'AllowAgentForwarding',
      value: allowAgentForwarding,
      pass: allowAgentForwarding.toLowerCase() === 'no',
      recommendation: 'Disable agent forwarding if not needed',
    });

    const loginGraceTime = getVal('LoginGraceTime', '120');
    const lgTime = parseInt(loginGraceTime);
    checks.push({
      key: 'LoginGraceTime',
      value: loginGraceTime,
      pass: lgTime <= 30,
      recommendation: 'Should be 30 seconds or less',
    });

    res.json({ checks, rawConfig: config });
  } catch (err) {
    console.error('[Security] SSH config error:', err);
    res.status(500).json({ error: 'Failed to read SSH configuration' });
  }
});

// GET /api/security/open-ports
router.get('/open-ports', async (req, res) => {
  try {
    const { stdout } = await execAsync('ss -tunlp 2>/dev/null', { timeout: 15000 });

    const EXPECTED_PORTS = new Set([22, 80, 443, 3001, 3000, 8080, 25, 587, 465, 143, 993, 110, 995]);

    const ports = [];
    const lines = stdout.split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 5) continue;

      const proto = parts[0];
      const state = parts[1];
      const localAddr = parts[4];
      const processInfo = parts[6] || '';

      const portMatch = localAddr.match(/:(\d+)$/);
      const port = portMatch ? parseInt(portMatch[1]) : null;
      if (!port) continue;

      const procMatch = processInfo.match(/users:\(\("([^"]+)"/);
      const procName = procMatch ? procMatch[1] : '';

      const pidMatch = processInfo.match(/pid=(\d+)/);
      const pid = pidMatch ? parseInt(pidMatch[1]) : null;

      ports.push({
        proto,
        state,
        localAddr,
        port,
        process: procName,
        pid,
        unexpected: !EXPECTED_PORTS.has(port),
      });
    }

    // Deduplicate
    const seen = new Set();
    const unique = ports.filter(p => {
      const key = `${p.proto}:${p.port}:${p.localAddr}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ ports: unique });
  } catch (err) {
    console.error('[Security] Open ports error:', err);
    res.status(500).json({ error: 'Failed to get open ports' });
  }
});

// GET /api/security/suid-files
router.get('/suid-files', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'find / -perm /4000 -type f 2>/dev/null | head -50',
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '' }));

    const files = stdout.split('\n').filter(f => f.trim()).map(f => f.trim());
    res.json({ files });
  } catch (err) {
    console.error('[Security] SUID files error:', err);
    res.status(500).json({ error: 'Failed to scan SUID files' });
  }
});

// GET /api/security/world-writable
router.get('/world-writable', async (req, res) => {
  try {
    const { stdout } = await execAsync(
      'find / -not \\( -path /proc -prune \\) -not \\( -path /sys -prune \\) -perm -002 -type f 2>/dev/null | head -30',
      { timeout: 30000 }
    ).catch(err => ({ stdout: err.stdout || '' }));

    const files = stdout.split('\n').filter(f => f.trim()).map(f => f.trim());
    res.json({ files });
  } catch (err) {
    console.error('[Security] World-writable error:', err);
    res.status(500).json({ error: 'Failed to scan world-writable files' });
  }
});

module.exports = router;
