const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../db/database');
const { getAnthropicApiKey } = require('../utils/apiKey');

const execAsync = promisify(exec);
const router = express.Router();

router.use(authenticateToken);

// Helper to run commands safely
async function run(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout });
    return (stdout || '').trim();
  } catch (err) {
    return (err.stdout || '').trim() || `[error: ${err.message}]`;
  }
}

// Gather system context based on problem type
async function gatherContext(problem = '', quickAction = '') {
  const context = {};
  const problemLower = (problem + ' ' + quickAction).toLowerCase();

  // Always gather basic info
  const [uptime, loadAvg, memory, disk] = await Promise.all([
    run('uptime 2>/dev/null', 10000),
    run('cat /proc/loadavg 2>/dev/null', 5000),
    run('free -h 2>/dev/null', 5000),
    run('df -h 2>/dev/null', 10000),
  ]);

  context.uptime = uptime;
  context.loadAverage = loadAvg;
  context.memory = memory;
  context.disk = disk;

  // Performance/slow issues
  if (problemLower.includes('slow') || quickAction === 'slow') {
    const [topCpu, iostat] = await Promise.all([
      run("ps aux --sort=-%cpu | head -11 2>/dev/null", 10000),
      run('iostat -x 1 1 2>/dev/null || echo "iostat not available"', 10000),
    ]);
    context.topCpuProcesses = topCpu;
    context.ioStats = iostat;
  }

  // Network/connection issues
  if (problemLower.includes('connect') || problemLower.includes('network') || quickAction === 'network') {
    const [ports, routes, networking] = await Promise.all([
      run('ss -tunlp 2>/dev/null', 10000),
      run('ip route 2>/dev/null || route -n 2>/dev/null', 10000),
      run('systemctl status networking network-manager 2>/dev/null | head -20', 10000),
    ]);
    context.openPorts = ports;
    context.routes = routes;
    context.networkingStatus = networking;
  }

  // Disk issues
  if (problemLower.includes('disk') || problemLower.includes('space') || problemLower.includes('storage') || quickAction === 'disk') {
    const [largestDirs, largeLogs] = await Promise.all([
      run('du -sh /* 2>/dev/null | sort -rh | head -10', 20000),
      run('find /var/log -name "*.log" -size +100M 2>/dev/null | head -10', 15000),
    ]);
    context.largestDirectories = largestDirs;
    context.largeLogs = largeLogs;
  }

  // Service issues
  if (problemLower.includes('service') || problemLower.includes('daemon') || quickAction === 'service') {
    const [failedUnits, recentLogs] = await Promise.all([
      run('systemctl list-units --failed --no-pager 2>/dev/null', 10000),
      run('journalctl -n 50 --no-pager 2>/dev/null', 10000),
    ]);
    context.failedUnits = failedUnits;
    context.recentLogs = recentLogs;
  }

  // Security issues
  if (problemLower.includes('security') || problemLower.includes('hack') || problemLower.includes('breach') || quickAction === 'security') {
    const [recentLogins, failedLogins, ports] = await Promise.all([
      run('last -n 10 2>/dev/null', 10000),
      run('lastb -n 10 2>/dev/null || echo "lastb not available"', 10000),
      run('ss -tunlp 2>/dev/null', 10000),
    ]);
    context.recentLogins = recentLogins;
    context.failedLogins = failedLogins;
    context.openPorts = ports;
  }

  return context;
}

// Format context for AI prompt
function formatContext(context) {
  const sections = [];
  const labels = {
    uptime: 'System Uptime',
    loadAverage: 'Load Average (/proc/loadavg)',
    memory: 'Memory Usage (free -h)',
    disk: 'Disk Usage (df -h)',
    topCpuProcesses: 'Top CPU Processes',
    ioStats: 'I/O Statistics',
    openPorts: 'Open Ports (ss -tunlp)',
    routes: 'Network Routes',
    networkingStatus: 'Networking Service Status',
    largestDirectories: 'Largest Directories',
    largeLogs: 'Large Log Files (>100MB)',
    failedUnits: 'Failed Systemd Units',
    recentLogs: 'Recent System Logs',
    recentLogins: 'Recent Logins',
    failedLogins: 'Failed Login Attempts',
  };

  for (const [key, label] of Object.entries(labels)) {
    if (context[key]) {
      sections.push(`=== ${label} ===\n${context[key]}`);
    }
  }

  return sections.join('\n\n');
}

// POST /api/troubleshoot/diagnose - SSE stream
router.post('/diagnose', async (req, res) => {
  const { problem, quickAction } = req.body;

  if (!problem && !quickAction) {
    return res.status(400).json({ error: 'Problem description or quickAction required' });
  }

  const anthropicApiKey = getAnthropicApiKey();
  if (!anthropicApiKey) {
    return res.status(403).json({
      error: 'AI_KEY_REQUIRED',
      message: 'Please add your Anthropic API key in Settings → AI Configuration to use AI features.',
      setupUrl: '/settings#ai-config',
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // Step 1: Gather system context
    res.write(`data: ${JSON.stringify({ type: 'status', text: 'Gathering system data...' })}\n\n`);

    const context = await gatherContext(problem || '', quickAction || '');
    const formattedContext = formatContext(context);

    res.write(`data: ${JSON.stringify({ type: 'context', data: context })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'status', text: 'Analyzing with AI...' })}\n\n`);

    // Step 2: Build prompt
    const quickActionPrompts = {
      slow: 'The system appears to be running slowly.',
      network: 'There are network connectivity issues.',
      disk: 'There may be disk space or I/O issues.',
      service: 'One or more services may be down or failing.',
      security: 'A security audit and check is needed.',
    };

    const problemDesc = problem || quickActionPrompts[quickAction] || 'General system diagnosis';

    const userPrompt = `I need help diagnosing this Linux system issue: ${problemDesc}

Here is the current system data I've collected:

${formattedContext}

Please:
1. Analyze the system data above
2. Identify the most likely root cause(s) of the issue
3. Provide specific, actionable steps to fix the problem
4. Include any relevant commands I should run (use code blocks)
5. Mention any security or stability concerns you notice in the data
6. Be concise but thorough`;

    // Step 3: Stream AI response
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: `You are NixPanel's AI Troubleshoot assistant. You analyze live Linux system data and help administrators diagnose and fix problems.

Always provide specific commands in code blocks. Be direct and actionable.
If you see concerning data in the system output, call it out clearly.
Format your response with clear sections using markdown.`,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    auditLog(req.user.id, req.user.username, 'TROUBLESHOOT_DIAGNOSE', problem || quickAction, null, req.ip);

  } catch (err) {
    console.error('[Troubleshoot] Diagnose error:', err);

    if (err.status === 401) {
      res.write(`data: ${JSON.stringify({ type: 'error', text: 'Invalid ANTHROPIC_API_KEY' })}\n\n`);
    } else if (err.status === 429) {
      res.write(`data: ${JSON.stringify({ type: 'error', text: 'AI rate limit exceeded. Please wait a moment.' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', text: err.message || 'Diagnosis failed' })}\n\n`);
    }
    res.end();
  }
});

// Safe command whitelist for execute endpoint
const SAFE_PREFIXES = [
  'systemctl status', 'systemctl list-units',
  'journalctl',
  'df ', 'df\n', 'df-h', 'du ',
  'free ', 'free\n',
  'ps ', 'ps\n',
  'top -bn1',
  'netstat ', 'ss ',
  'ip addr', 'ip route', 'ip link', 'ip neigh',
  'ping -c ',
  'cat /var/log/', 'cat /etc/', 'cat /proc/',
  'ls ', 'ls\n',
  'find / -name', 'find /var', 'find /etc', 'find /home', 'find /tmp',
  'uptime',
  'uname',
  'hostname',
  'who', 'w\n', 'w ',
  'last ', 'last\n',
  'lsof ',
  'lsblk',
  'fdisk -l',
  'mount\n', 'mount ',
  'dmesg',
  'vmstat',
  'iostat',
  'sar ',
  'netstat ',
  'dig ', 'nslookup ',
  'traceroute ', 'tracepath ',
  'iptables -L', 'iptables -n',
  'nft list',
  'crontab -l',
  'env\n', 'env ',
  'id\n', 'id ',
];

const BLOCKED_PATTERNS = [
  /\brm\b/, /\bdd\b/, /\bmkfs\b/, /\bfdisk\b(?!.*-l)/, /\bformat\b/,
  /[>;|&].*rm/, /\|.*delete/, /\bsudo\s+rm\b/, /\bsudo\s+dd\b/,
  />\s*\//, />>/, /\|\s*sh\b/, /\|\s*bash\b/,
  /\bchmod\s+777\b/, /\bchown\b/, /\bpasswd\b/,
  /\bcurl\b.*\|\s*bash/, /\bwget\b.*\|\s*bash/,
  /\bnc\s/, /\bnetcat\b/,
  /\bpython.*-c/, /\bruby.*-e/, /\bperl.*-e/,
  /\beval\b/, /\bexec\b/,
];

function isCommandSafe(cmd) {
  const trimmed = cmd.trim().toLowerCase();

  // Check blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Check safe prefixes
  for (const prefix of SAFE_PREFIXES) {
    if (trimmed.startsWith(prefix.toLowerCase()) || trimmed === prefix.trim().toLowerCase()) {
      return true;
    }
  }

  // Additional safe single commands
  const safeSingleCommands = ['uptime', 'free', 'df', 'ps', 'w', 'who', 'hostname', 'uname -a', 'lsblk', 'mount', 'dmesg | tail -50'];
  if (safeSingleCommands.includes(trimmed)) return true;

  return false;
}

// POST /api/troubleshoot/execute
router.post('/execute', requireRole('admin'), async (req, res) => {
  const { command } = req.body;

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command required' });
  }

  if (command.length > 500) {
    return res.status(400).json({ error: 'Command too long' });
  }

  if (!isCommandSafe(command)) {
    return res.status(403).json({ error: 'Command not allowed. Only read-only diagnostic commands are permitted.' });
  }

  try {
    auditLog(req.user.id, req.user.username, 'TROUBLESHOOT_EXECUTE', command, null, req.ip);

    const { stdout, stderr } = await execAsync(command, { timeout: 30000 })
      .catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || err.message }));

    res.json({ output: (stdout + (stderr ? '\n' + stderr : '')).trim(), command });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
