const nodemailer = require('nodemailer');

function createTransport() {
  // Support SMTP, sendmail, or SES
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
  }
  // Fallback: sendmail
  return nodemailer.createTransport({ sendmail: true });
}

const FROM = process.env.EMAIL_FROM || 'NixPanel <noreply@nixpanel.io>';
const SUPPORT = process.env.EMAIL_SUPPORT || 'support@nixpanel.io';
const DOCS_URL = 'https://nixpanel.io/docs';
const MANAGE_URL = process.env.STRIPE_PORTAL_URL || 'https://nixpanel.io/billing';

function planDetails(plan) {
  const plans = {
    solo:   { name: 'Solo',   features: ['1 server', 'All Pro features', 'Email support'] },
    host:   { name: 'Host',   features: ['5 servers', 'All Pro features + Web Hosting', 'Priority support'] },
    agency: { name: 'Agency', features: ['Unlimited servers', 'All features', 'Dedicated support'] },
  };
  return plans[plan] || plans['solo'];
}

function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NixPanel</title>
  <style>
    body { margin: 0; padding: 0; background: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center; border-bottom: 1px solid #1e40af44; }
    .logo { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; }
    .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-text { font-size: 22px; font-weight: 700; color: #fff; }
    .body { background: #111827; padding: 40px; border: 1px solid #1f2937; border-top: none; }
    .body-rounded-bottom { border-radius: 0 0 12px 12px; }
    h1 { font-size: 24px; font-weight: 700; color: #f1f5f9; margin: 0 0 16px; }
    p { font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px; }
    .key-box { background: #0a0e1a; border: 2px solid #3b82f6; border-radius: 10px; padding: 20px 24px; text-align: center; margin: 24px 0; }
    .key-box .label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
    .key-box .key { font-size: 20px; font-weight: 700; font-family: 'Courier New', monospace; color: #60a5fa; letter-spacing: 0.05em; }
    .steps { background: #0f172a; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { font-size: 14px; color: #94a3b8; line-height: 1.8; }
    .steps li strong { color: #e2e8f0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff !important; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin: 8px 4px; }
    .btn-outline { background: transparent; border: 1px solid #3b82f6; color: #60a5fa !important; }
    .plan-badge { display: inline-block; background: linear-gradient(135deg, #eab308, #f59e0b); color: #000; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    .features { list-style: none; padding: 0; margin: 16px 0; }
    .features li { font-size: 14px; color: #94a3b8; padding: 4px 0; }
    .features li::before { content: '✓ '; color: #22c55e; font-weight: 700; }
    .warning-box { background: #431407; border: 1px solid #dc2626; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .warning-box p { color: #fca5a5; margin: 0; font-size: 14px; }
    .receipt-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .receipt-table td { padding: 10px 0; border-bottom: 1px solid #1f2937; font-size: 14px; color: #94a3b8; }
    .receipt-table td:last-child { text-align: right; color: #e2e8f0; font-weight: 500; }
    .footer { text-align: center; padding: 24px; }
    .footer p { font-size: 12px; color: #374151; margin: 4px 0; }
    .footer a { color: #4b5563; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
        </div>
        <span class="logo-text">NixPanel</span>
      </div>
    </div>
    <div class="body body-rounded-bottom">
      ${content}
    </div>
    <div class="footer">
      <p>NixPanel &mdash; Linux Administration Panel</p>
      <p><a href="${DOCS_URL}">Documentation</a> &middot; <a href="mailto:${SUPPORT}">Support</a> &middot; <a href="${MANAGE_URL}">Manage Subscription</a></p>
      <p style="margin-top: 12px;">You received this email because you purchased a NixPanel subscription.</p>
    </div>
  </div>
</body>
</html>`;
}

async function send(to, subject, html) {
  if (process.env.EMAIL_DISABLED === 'true') {
    console.log(`[Email] Skipped (EMAIL_DISABLED): ${subject} → ${to}`);
    return;
  }
  try {
    const transport = createTransport();
    await transport.sendMail({ from: FROM, to, subject, html });
    console.log(`[Email] Sent: ${subject} → ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

async function welcomeEmail(email, licenseKey, plan) {
  const pd = planDetails(plan);
  const subject = 'Welcome to NixPanel Pro — Your License Key Inside';
  const html = baseLayout(`
    <div class="plan-badge">${pd.name} Plan</div>
    <h1>Welcome to NixPanel Pro!</h1>
    <p>Thank you for subscribing. Your license key is ready to activate. Keep this email safe — you'll need this key whenever you set up a new NixPanel installation.</p>

    <div class="key-box">
      <div class="label">Your License Key</div>
      <div class="key">${licenseKey}</div>
    </div>

    <div class="steps">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#e2e8f0;">Activation Steps</p>
      <ol>
        <li>Log into your NixPanel installation at your server's IP/domain</li>
        <li>Click <strong>Upgrade</strong> in the left sidebar</li>
        <li>Enter the license key above and click <strong>Activate License</strong></li>
        <li>All Pro features unlock immediately</li>
      </ol>
    </div>

    <p><strong style="color:#e2e8f0;">What's included in your ${pd.name} plan:</strong></p>
    <ul class="features">
      ${pd.features.map(f => `<li>${f}</li>`).join('')}
      <li>AI Assistant &amp; Troubleshooting</li>
      <li>Firewall, SSH &amp; SSL Management</li>
      <li>Backup, Process &amp; Security Center</li>
      <li>Automation Center &amp; Cron Manager</li>
    </ul>

    <div style="text-align:center;margin-top:28px;">
      <a href="${DOCS_URL}/activation" class="btn">View Activation Guide</a>
      <a href="${MANAGE_URL}" class="btn btn-outline">Manage Subscription</a>
    </div>

    <p style="margin-top:28px;font-size:13px;">Questions? Reply to this email or reach us at <a href="mailto:${SUPPORT}" style="color:#60a5fa;">${SUPPORT}</a>. We typically respond within a few hours.</p>
  `);
  await send(email, subject, html);
}

async function paymentFailedEmail(email, plan) {
  const pd = planDetails(plan);
  const subject = 'NixPanel — Payment Failed, Action Required';
  const html = baseLayout(`
    <div class="warning-box">
      <p><strong>⚠️ Your payment could not be processed.</strong> Please update your payment method to keep your Pro features active.</p>
    </div>
    <h1>Payment Failed</h1>
    <p>We were unable to charge your payment method for your NixPanel <strong style="color:#e2e8f0;">${pd.name}</strong> subscription.</p>
    <p>Your Pro features will remain active for a short grace period while we retry the payment. If the payment continues to fail, your subscription will be suspended and Pro features will be locked.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${MANAGE_URL}" class="btn">Update Payment Method</a>
    </div>

    <p style="font-size:13px;">If you believe this is an error or need help, contact us at <a href="mailto:${SUPPORT}" style="color:#60a5fa;">${SUPPORT}</a>.</p>
  `);
  await send(email, subject, html);
}

async function cancellationEmail(email, plan, expiresAt) {
  const pd = planDetails(plan);
  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'at the end of your billing period';
  const subject = 'NixPanel Subscription Cancelled';
  const html = baseLayout(`
    <h1>Subscription Cancelled</h1>
    <p>Your NixPanel <strong style="color:#e2e8f0;">${pd.name}</strong> subscription has been cancelled.</p>
    <p>You'll continue to have access to all Pro features until <strong style="color:#e2e8f0;">${expiry}</strong>. After that, your installation will revert to the free tier.</p>

    <div class="steps">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#e2e8f0;">What happens next?</p>
      <ol>
        <li>Pro features remain active until <strong>${expiry}</strong></li>
        <li>After expiry, NixPanel reverts to the free tier automatically</li>
        <li>Your data and configuration are never deleted</li>
        <li>You can resubscribe at any time to regain access</li>
      </ol>
    </div>

    <p>We're sorry to see you go. If there's anything we could have done better, please <a href="mailto:${SUPPORT}" style="color:#60a5fa;">let us know</a>.</p>

    <div style="text-align:center;margin-top:28px;">
      <a href="https://nixpanel.io/pricing" class="btn">Resubscribe</a>
    </div>
  `);
  await send(email, subject, html);
}

async function paymentReceiptEmail(email, amount, plan, date) {
  const pd = planDetails(plan);
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
  const formattedDate = new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subject = 'NixPanel Payment Receipt';
  const html = baseLayout(`
    <h1>Payment Receipt</h1>
    <p>Thank you for your payment. Here's a summary of your transaction.</p>

    <table class="receipt-table">
      <tr><td>Plan</td><td>${pd.name}</td></tr>
      <tr><td>Amount</td><td>${formattedAmount}</td></tr>
      <tr><td>Date</td><td>${formattedDate}</td></tr>
      <tr><td>Status</td><td style="color:#22c55e;font-weight:600;">✓ Paid</td></tr>
    </table>

    <div style="text-align:center;margin:28px 0;">
      <a href="${MANAGE_URL}" class="btn">View Billing History</a>
    </div>

    <p style="font-size:13px;">Need help? Contact <a href="mailto:${SUPPORT}" style="color:#60a5fa;">${SUPPORT}</a>.</p>
  `);
  await send(email, subject, html);
}

module.exports = { welcomeEmail, paymentFailedEmail, cancellationEmail, paymentReceiptEmail };
