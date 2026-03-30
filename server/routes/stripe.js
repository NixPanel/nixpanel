const express = require('express');
const https = require('https');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { welcomeEmail, paymentFailedEmail, cancellationEmail, paymentReceiptEmail } = require('../utils/email');

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Map price IDs → plan names
function planFromPriceId(priceId) {
  const map = {
    [process.env.STRIPE_PRICE_SOLO_MONTHLY]:  'solo',
    [process.env.STRIPE_PRICE_SOLO_ANNUAL]:   'solo',
    [process.env.STRIPE_PRICE_HOST_MONTHLY]:  'host',
    [process.env.STRIPE_PRICE_HOST_ANNUAL]:   'host',
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY]:'agency',
    [process.env.STRIPE_PRICE_AGENCY_ANNUAL]: 'agency',
  };
  return map[priceId] || 'solo';
}

// Call license server admin API to create/deactivate a license
function callLicenseServer(method, path, body) {
  return new Promise((resolve, reject) => {
    const adminKey = process.env.LICENSE_SERVER_ADMIN_KEY;

    // Parse LICENSE_SERVER_URL if set, fall back to individual env vars
    let licenseHost, licensePort, useHttps;
    if (process.env.LICENSE_SERVER_URL) {
      const parsed = new URL(process.env.LICENSE_SERVER_URL);
      licenseHost = parsed.hostname;
      licensePort = parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
      useHttps = parsed.protocol === 'https:';
    } else {
      licenseHost = process.env.LICENSE_SERVER_HOST || 'license.nixpanel.io';
      licensePort = parseInt(process.env.LICENSE_SERVER_PORT) || 443;
      useHttps = licensePort === 443 || process.env.LICENSE_SERVER_HTTPS === 'true';
    }

    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname: licenseHost,
      port: licensePort,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Admin-Key': adminKey || '',
      },
      timeout: 10000,
    };

    const mod = useHttps ? https : require('http');
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { reject(new Error('Invalid response from license server')); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('License server timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── POST /api/stripe/create-checkout-session ────────────────────────────────
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const { priceId, customerEmail } = req.body;

    if (!priceId) return res.status(400).json({ error: 'priceId required' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      automatic_tax: { enabled: true },
      success_url: `${process.env.SITE_URL || 'https://nixpanel.io'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL || 'https://nixpanel.io'}/pricing`,
      metadata: { priceId },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[Stripe] create-checkout-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/stripe/create-portal-session ──────────────────────────────────
router.post('/create-portal-session', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const { customerEmail } = req.body;

    const db = getDb();
    const email = customerEmail || req.user?.email;
    let customerId;

    if (email) {
      const customer = db.prepare('SELECT stripe_customer_id FROM customers WHERE email = ?').get(email);
      customerId = customer?.stripe_customer_id;
    }

    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found. Please contact support.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.SITE_URL || 'https://nixpanel.io'}/upgrade`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] create-portal-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/stripe/subscription-status ─────────────────────────────────────
router.get('/subscription-status', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const email = req.user?.email;

    if (!email) return res.json({ status: 'free', plan: null });

    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!customer) return res.json({ status: 'free', plan: null });

    res.json({
      status: customer.status,
      plan: customer.plan,
      licenseKey: customer.license_key,
      expiresAt: customer.expires_at,
      cancelledAt: customer.cancelled_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────
// NOTE: This route uses express.raw() — registered in index.js before express.json()
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Stripe] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  console.log(`[Stripe] Webhook received: ${event.type}`);

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    console.error(`[Stripe] Error handling ${event.type}:`, err.message);
    // Return 200 to prevent Stripe retrying — we log the error internally
  }

  res.json({ received: true });
});

async function handleWebhookEvent(event) {
  const db = getDb();

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const priceId = session.metadata?.priceId;
      const plan = planFromPriceId(priceId);

      if (!email) {
        console.error('[Stripe] checkout.session.completed: no email');
        break;
      }

      // Generate license key via license server
      let licenseKey = null;
      try {
        const licenseRes = await callLicenseServer('POST', '/admin/licenses', {
          email,
          plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
        console.log('[Stripe] License server response:', JSON.stringify(licenseRes));
        licenseKey = licenseRes.license_key || licenseRes.key || licenseRes.licenseKey || licenseRes.license;
      } catch (err) {
        console.error('[Stripe] Failed to generate license key:', err.message);
        // Generate a fallback key if license server is down
        licenseKey = 'NIXP-' + require('crypto').randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g).join('-');
      }

      // Upsert customer record
      db.prepare(`
        INSERT INTO customers (email, stripe_customer_id, stripe_subscription_id, plan, status, license_key, created_at)
        VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          plan = excluded.plan,
          status = 'active',
          license_key = excluded.license_key,
          cancelled_at = NULL
      `).run(email, customerId, subscriptionId, plan, licenseKey);

      // Log payment
      db.prepare(`
        INSERT INTO payments (customer_email, stripe_payment_id, amount, currency, plan, status)
        VALUES (?, ?, ?, ?, ?, 'completed')
      `).run(email, session.payment_intent, session.amount_total || 0, session.currency || 'usd', plan);

      await welcomeEmail(email, licenseKey, plan);
      console.log(`[Stripe] Checkout complete: ${email} → ${plan} (key: ${licenseKey})`);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const email = invoice.customer_email;
      const plan = invoice.metadata?.plan || getPlanForCustomer(db, invoice.customer);

      db.prepare(`
        INSERT INTO payments (customer_email, stripe_payment_id, amount, currency, plan, status)
        VALUES (?, ?, ?, ?, ?, 'succeeded')
      `).run(email, invoice.payment_intent, invoice.amount_paid || 0, invoice.currency || 'usd', plan);

      // Extend subscription status
      if (email) {
        db.prepare(`UPDATE customers SET status = 'active', expires_at = ? WHERE email = ?`)
          .run(invoice.lines?.data?.[0]?.period?.end
            ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
            : null, email);
      }

      if (email && invoice.billing_reason !== 'subscription_create') {
        // Don't send receipt on initial checkout — welcomeEmail covers that
        await paymentReceiptEmail(email, invoice.amount_paid, plan, new Date(invoice.created * 1000));
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const email = invoice.customer_email;
      const plan = getPlanForCustomer(db, invoice.customer);

      db.prepare(`
        INSERT INTO payments (customer_email, stripe_payment_id, amount, currency, plan, status)
        VALUES (?, ?, ?, ?, ?, 'failed')
      `).run(email, invoice.payment_intent, invoice.amount_due || 0, invoice.currency || 'usd', plan);

      if (email) await paymentFailedEmail(email, plan);
      console.log(`[Stripe] Payment failed: ${email}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const email = await getEmailForCustomer(sub.customer);
      const plan = getPlanForCustomer(db, sub.customer);
      const expiresAt = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      if (email) {
        db.prepare(`
          UPDATE customers SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, expires_at = ?
          WHERE stripe_customer_id = ?
        `).run(expiresAt, sub.customer);
      }

      // Deactivate on license server
      try {
        const customer = db.prepare('SELECT license_key FROM customers WHERE stripe_customer_id = ?').get(sub.customer);
        if (customer?.license_key) {
          await callLicenseServer('DELETE', `/admin/licenses/${encodeURIComponent(customer.license_key)}`);
        }
      } catch (err) {
        console.error('[Stripe] Failed to deactivate license:', err.message);
      }

      if (email) await cancellationEmail(email, plan, expiresAt);
      console.log(`[Stripe] Subscription cancelled: ${email}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const newPriceId = sub.items?.data?.[0]?.price?.id;
      const newPlan = planFromPriceId(newPriceId);
      const email = await getEmailForCustomer(sub.customer);

      if (email) {
        db.prepare(`UPDATE customers SET plan = ?, status = ? WHERE stripe_customer_id = ?`)
          .run(newPlan, sub.status === 'active' ? 'active' : sub.status, sub.customer);
      }

      // Update plan on license server
      try {
        const customer = db.prepare('SELECT license_key FROM customers WHERE stripe_customer_id = ?').get(sub.customer);
        if (customer?.license_key) {
          await callLicenseServer('PATCH', `/admin/licenses/${encodeURIComponent(customer.license_key)}`, { plan: newPlan });
        }
      } catch (err) {
        console.error('[Stripe] Failed to update license plan:', err.message);
      }

      console.log(`[Stripe] Subscription updated: ${email} → ${newPlan}`);
      break;
    }

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }
}

// Helper: get plan from SQLite by stripe customer ID
function getPlanForCustomer(db, customerId) {
  if (!customerId) return 'solo';
  const row = db.prepare('SELECT plan FROM customers WHERE stripe_customer_id = ?').get(customerId);
  return row?.plan || 'solo';
}

// Helper: get email by calling Stripe API
async function getEmailForCustomer(customerId) {
  if (!customerId) return null;
  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    return customer?.email || null;
  } catch (_) {
    return null;
  }
}

module.exports = router;
