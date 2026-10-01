import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Payment gateway switches and Razorpay / PayU credentials. Stored in a server-only document (never in storefront_settings,
// never sent to the browser); only the Admin SDK can read it.
export const gatewaysDoc = (db) => db.collection('private_settings').doc('payment_gateways');

const DEFAULTS = { razorpay: { enabled: true }, payu: { enabled: false, mode: 'test', merchantKey: '', salt: '' } };
let cache = null;

export const normalizeGateways = (raw) => ({
  razorpay: {
    enabled: raw?.razorpay?.enabled !== false,
    keyId: String(raw?.razorpay?.keyId || '').trim(),
    keySecret: String(raw?.razorpay?.keySecret || '').trim(),
    webhookSecret: String(raw?.razorpay?.webhookSecret || '').trim(),
  },
  payu: {
    enabled: Boolean(raw?.payu?.enabled),
    mode: raw?.payu?.mode === 'live' ? 'live' : 'test',
    merchantKey: String(raw?.payu?.merchantKey || '').trim(),
    salt: String(raw?.payu?.salt || '').trim(),
  },
});

/** Gateway settings, cached for 20 seconds per server instance (an admin switch takes effect within that time). */
export const readGateways = async (db, { fresh = false } = {}) => {
  if (!fresh && cache && Date.now() - cache.at < 20000) return cache.value;
  try {
    // A slow or over-quota database must not freeze the checkout: after 3 seconds the last known settings are used
    const snap = await Promise.race([
      gatewaysDoc(db).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GATEWAYS_TIMEOUT')), 3000)),
    ]);
    const value = normalizeGateways(snap.exists ? snap.data() : DEFAULTS);
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (cache) return cache.value;
    // Nothing known yet: Razorpay with the server's own keys (PayU stays off until its settings can be read)
    console.error('Gateway settings unavailable, using defaults:', error?.message);
    return normalizeGateways(DEFAULTS);
  }
};

export const clearGatewayCache = () => { cache = null; };

/**
 * Razorpay keys in use: the ones saved in Admin → Payment Gateways, otherwise the Vercel environment variables.
 * The mode follows the key itself (rzp_live_… / rzp_test_…).
 */
export const razorpayCreds = (gateways) => {
  const saved = gateways?.razorpay || {};
  const fromAdmin = Boolean(saved.keyId && saved.keySecret);
  const keyId = fromAdmin ? saved.keyId : String(process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '').trim();
  const secret = fromAdmin ? saved.keySecret : String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  return {
    keyId,
    secret,
    // Webhooks are accepted with the admin's secret and the environment one, so switching keys never drops a payment
    webhookSecrets: [saved.webhookSecret, process.env.RAZORPAY_WEBHOOK_SECRET].map((v) => String(v || '').trim()).filter(Boolean),
    mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
    source: fromAdmin ? 'admin' : 'env',
    ready: Boolean(keyId && secret),
  };
};

/** What the checkout may show: a gateway counts as available only when it is switched on and configured.
 * A gateway in test (sandbox) mode is offered only to the signed-in admin, so shoppers can never pay with test cards. */
export const publicGateways = (gateways, { admin = false } = {}) => ({
  razorpay: gateways.razorpay.enabled && razorpayCreds(gateways).ready && (razorpayCreds(gateways).mode === 'live' || admin),
  payu: payuReady(gateways) && (gateways.payu.mode === 'live' || admin),
});

export const payuReady = (gateways) => gateways.payu.enabled && Boolean(gateways.payu.merchantKey && gateways.payu.salt);

export const payuUrls = (mode) => (mode === 'live'
  ? { pay: 'https://secure.payu.in/_payment', verify: 'https://info.payu.in/merchant/postservice?form=2' }
  : { pay: 'https://test.payu.in/_payment', verify: 'https://test.payu.in/merchant/postservice.php?form=2' });

const sha512 = (value) => createHash('sha512').update(value, 'utf8').digest('hex');

export const payuAmount = (rupees) => (Math.round(Number(rupees) * 100) / 100).toFixed(2);

/** Request hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT */
export const payuRequestHash = ({ key, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }, salt) => (
  sha512([key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', salt].join('|'))
);

/** Response hash: [additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key */
export const payuResponseHash = (fields, salt) => {
  const parts = [salt, fields.status || '', '', '', '', '', '', fields.udf5 || '', fields.udf4 || '', fields.udf3 || '', fields.udf2 || '', fields.udf1 || '',
    fields.email || '', fields.firstname || '', fields.productinfo || '', fields.amount || '', fields.txnid || '', fields.key || ''];
  if (fields.additionalCharges) parts.unshift(fields.additionalCharges);
  return sha512(parts.join('|'));
};

export const sameHex = (a, b) => {
  const left = Buffer.from(String(a || '').toLowerCase());
  const right = Buffer.from(String(b || '').toLowerCase());
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
};

/**
 * Asks PayU itself for the transaction (never trusts only the browser's POST). PayU can take a few seconds to
 * record a payment right after the customer returns, so a missing or still-pending answer is asked again
 * (after 1.5s and 3s) before giving up; the result page and "Check payment" can always ask later.
 */
export const payuVerifyTransaction = async (gateways, txnid, { attempts = 3 } = {}) => {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      last = await payuVerifyOnce(gateways, txnid);
      if (last.status !== 'pending') return last;
    } catch (error) {
      if (attempt === attempts && !last) throw error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
  }
  if (last) return last;
  throw new Error('PAYU_VERIFY_FAILED');
};

const payuVerifyOnce = async (gateways, txnid) => {
  const { merchantKey: key, salt, mode } = gateways.payu;
  const hash = sha512(`${key}|verify_payment|${txnid}|${salt}`);
  const response = await fetch(payuUrls(mode).verify, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ key, command: 'verify_payment', var1: txnid, hash }).toString(),
  });
  const data = await response.json().catch(() => ({}));
  const details = data?.transaction_details?.[txnid];
  if (!response.ok || !details) throw new Error('PAYU_VERIFY_FAILED');
  return {
    status: String(details.status || '').toLowerCase(), // success | failure | pending
    amount: Number(details.amt || details.transaction_amount || 0),
    mihpayid: String(details.mihpayid || ''),
    mode: String(details.mode || ''),
    error: String(details.error_Message || details.field9 || ''),
  };
};

// Signed link back to the result page (the customer may not be signed in when PayU returns them).
const RESULT_TTL_MS = 2 * 24 * 60 * 60 * 1000;
export const resultToken = (orderNumber, ts = Date.now()) => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('SERVER_CONFIG_MISSING');
  return `${ts}.${createHmac('sha256', secret).update(`payment-result:${orderNumber}:${ts}`).digest('hex').slice(0, 40)}`;
};

export const checkResultToken = (orderNumber, token) => {
  const [tsText, mac] = String(token || '').split('.');
  const ts = Number(tsText);
  if (!ts || !mac || Date.now() - ts > RESULT_TTL_MS || ts > Date.now() + 60000) return false;
  const expected = resultToken(orderNumber, ts).split('.')[1];
  return sameHex(expected, mac);
};
