const path = require('path');
const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
require('dotenv').config({ path: path.join(basePath, '.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

if (isPkg) {
  console.log('[NixPanel] Running as compiled binary');
  console.log('[NixPanel] Binary path:', process.execPath);
}
const { WebSocketServer } = require('ws');
const http = require('http');
const si = require('systeminformation');

const { initializeDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const systemRoutes = require('./routes/system');
const packagesRoutes = require('./routes/packages');
const usersRoutes = require('./routes/users');
const servicesRoutes = require('./routes/services');
const firewallRoutes = require('./routes/firewall');
const logsRoutes = require('./routes/logs');
const filesRoutes = require('./routes/files');
const aiRoutes = require('./routes/ai');
const cronRoutes = require('./routes/cron');
const sshRoutes = require('./routes/ssh');
const sslRoutes = require('./routes/ssl');
const backupRoutes = require('./routes/backup');
const processesRoutes = require('./routes/processes');
const networkRoutes = require('./routes/network');
const filesystemRoutes = require('./routes/filesystem');
const securityRoutes = require('./routes/security');
const automationRoutes = require('./routes/automation');
const troubleshootRoutes = require('./routes/troubleshoot');
const { authenticateToken } = require('./middleware/auth');
const requirePro = require('./middleware/requirePro');
const licenseRoutes = require('./routes/license');
const stripeRoutes = require('./routes/stripe');
const settingsRoutes = require('./routes/settings');

// ─── Init ──────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Trust X-Forwarded-For from Apache reverse proxy
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDatabase();

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,        // Disabled: Vite's crossorigin attrs conflict with CORP
  crossOriginResourcePolicy: false,    // Allow assets to load without CORP blocking
  crossOriginEmbedderPolicy: false,    // Allow embedding without COEP
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Stricter for auth endpoints
  message: { error: 'Too many login attempts, please try again later.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

// ─── Body parsing ──────────────────────────────────────────────────────────────
// Stripe webhook MUST use raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/stripe', stripeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/packages', packagesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', requirePro, aiRoutes);
app.use('/api/firewall', requirePro, firewallRoutes);
app.use('/api/cron', requirePro, cronRoutes);
app.use('/api/ssh', requirePro, sshRoutes);
app.use('/api/ssl', requirePro, sslRoutes);
app.use('/api/backup', requirePro, backupRoutes);
app.use('/api/processes', requirePro, processesRoutes);
app.use('/api/network', requirePro, networkRoutes);
app.use('/api/filesystem', requirePro, filesystemRoutes);
app.use('/api/security', requirePro, securityRoutes);
app.use('/api/automation', requirePro, automationRoutes);
app.use('/api/troubleshoot', requirePro, troubleshootRoutes);

// Web Hosting routes (Pro)
app.use('/api/hosting', require('./routes/hosting/index'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ─── Static client files ───────────────────────────────────────────────────────
// When running as pkg binary, __dirname points inside the snapshot (embedded assets).
// When running from source, __dirname is the server/ directory.
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// Catch-all: serve React app
app.get('*', (req, res) => {
  const indexPath = path.join(clientBuildPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      error: 'Client not built. Run: cd client && npm install && npm run build',
    });
  }
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set();

wss.on('connection', (ws, req) => {
  // Authenticate WebSocket connections
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    ws.userId = decoded.userId;
    ws.username = decoded.username;
  } catch (_) {
    ws.close(4001, 'Invalid token');
    return;
  }

  wsClients.add(ws);
  console.log(`[WS] Client connected: ${ws.username} (${wsClients.size} total)`);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wsClients.size} total)`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    wsClients.delete(ws);
  });
});

// Broadcast real-time stats every 3 seconds
let statsInterval;

async function broadcastStats() {
  if (wsClients.size === 0) return;

  try {
    const [load, mem, networkStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats(),
    ]);

    const data = JSON.stringify({
      type: 'stats',
      payload: {
        cpu: Math.round(load.currentLoad * 10) / 10,
        memory: Math.round((mem.used / mem.total) * 100 * 10) / 10,
        network: networkStats.map(n => ({
          iface: n.iface,
          rxSec: Math.round(n.rx_sec || 0),
          txSec: Math.round(n.tx_sec || 0),
        })),
        timestamp: Date.now(),
      },
    });

    for (const client of wsClients) {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    }
  } catch (err) {
    // Silently ignore stats errors
  }
}

// ─── Error handling ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║          NixPanel Server             ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  HTTP:  http://0.0.0.0:${PORT}         ║`);
  console.log(`║  WS:    ws://0.0.0.0:${PORT}/ws        ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  statsInterval = setInterval(broadcastStats, 3000);

  // Start HTTPS server if SSL is configured
  startHttpsIfConfigured();
});

function startHttpsIfConfigured() {
  const { getSetting } = require('./db/database');
  const certPath = getSetting('ssl_cert_path');
  const keyPath = getSetting('ssl_key_path');
  if (!certPath || !keyPath) return;
  try {
    const fs = require('fs');
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.log('[SSL] Cert files not found, skipping HTTPS');
      return;
    }
    const https = require('https');
    const httpsServer = https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }, app);
    const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 3443;
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`[SSL] HTTPS server running on port ${HTTPS_PORT}`);
    });
    // Attach WebSocket to HTTPS server too
    const { WebSocketServer: WSSHttps } = require('ws');
    const wssHttps = new WSSHttps({ server: httpsServer, path: '/ws' });
    wssHttps.on('connection', (ws, req) => {
      // reuse same auth logic — copy the wss connection handler
      wss.emit('connection', ws, req);
    });
  } catch (err) {
    console.error('[SSL] Failed to start HTTPS server:', err.message);
  }
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('\n[Server] Shutting down gracefully...');
  clearInterval(statsInterval);
  for (const client of wsClients) {
    client.close();
  }
  server.close(() => {
    console.log('[Server] Closed.');
    process.exit(0);
  });
}

module.exports = app;
