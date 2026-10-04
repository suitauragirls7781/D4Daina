import { createAdminFirebaseToken, firestore, revokeAdminFirebaseSessions } from './_lib/firebaseAdmin.js';
import { createUploadSignature, destroyImage } from './_lib/cloudinary.js';
import { createHmac, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { clearGatewayCache, gatewaysDoc, normalizeGateways, razorpayCreds } from './_lib/payu.js';
import { GEMINI_MESSAGES, aiAdminView, aiDoc, describeProduct, pickModel, readAi } from './_lib/gemini.js';
import { effectivePlan, readUsage, savePlan } from './_lib/usage.js';

const hint = (value) => (value ? `••••${value.slice(-4)}` : '');

// A key pair is saved only after Razorpay itself accepts it (one harmless read of the orders list)
const checkRazorpayKeys = async (keyId, secret) => {
  const response = await fetch('https://api.razorpay.com/v1/orders?count=1', {
    headers: { authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` },
  }).catch(() => null);
  return Boolean(response?.ok);
};

// What the admin page sees of the gateway settings: never the PayU salt itself, only whether it is set.
const adminGatewayView = (gateways) => ({
  razorpay: (() => {
    const creds = razorpayCreds(gateways);
    return {
      enabled: gateways.razorpay.enabled,
      configured: creds.ready,
      mode: creds.mode,
      source: creds.source,
      keyId: creds.keyId,
      secretSet: Boolean(creds.secret),
      secretHint: hint(creds.secret),
      webhookSecretSet: creds.webhookSecrets.length > 0,
      webhookSecretHint: hint(gateways.razorpay.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || ''),
    };
  })(),
  payu: {
    enabled: gateways.payu.enabled,
    mode: gateways.payu.mode,
    merchantKey: gateways.payu.merchantKey,
    saltSet: Boolean(gateways.payu.salt),
    saltHint: gateways.payu.salt ? `••••${gateways.payu.salt.slice(-4)}` : '',
  },
  urls: {
    success: 'https://www.suitauragirls.in/api/payu',
    failure: 'https://www.suitauragirls.in/api/payu',
    webhook: 'https://www.suitauragirls.in/api/payu?webhook=1',
    razorpayWebhook: 'https://www.suitauragirls.in/api/webhooks/razorpay',
  },
});

const COOKIE_NAME = 'sag_admin_session';
// The owner's phone stays signed in: 400 days (the longest a browser keeps a cookie), renewed on every visit.
// Changing the password or PIN (Settings → Security) still signs every device out.
const SESSION_SECONDS = 60 * 60 * 24 * 400;
// "Save login on this phone" switched off: a normal working-day sign-in
const SHORT_SESSION_SECONDS = 60 * 60 * 12;
const sessionSeconds = (remember) => (remember === false ? SHORT_SESSION_SECONDS : SESSION_SECONDS);
const PUBLIC_SETTINGS = new Set([
  'homepageSections',
  'heroConfig',
  'storeSettings',
  'banners',
  'dealOfTheDay',
  'paymentSettings',
  'instagramReels',
  'comboOffer',
  'discovery',
  'auraReels',
  'lookRelations',
]);

const FEATURE_KEYS = ['assistant', 'voiceSearch', 'compare', 'surpriseMe', 'findMySize', 'personalRails', 'occasions', 'giftMode', 'shareWishlist', 'priceDropAlerts', 'backInStockAlerts', 'googleOneTap', 'reels', 'completeLook', 'bundleBuilder', 'visualSearch', 'reviewPhotos', 'styleProfile'];
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const CLOUDINARY_VIDEO = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/video\/upload\/[^\s"'<>]+$/;
const CLOUDINARY_ASSET = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/(image|video)\/upload\/[^\s"'<>]+$/;
// Aura Reels: only this store's Cloudinary videos, each optionally linked to a product
const sanitizeAuraReels = (value) => (Array.isArray(value) ? value : []).slice(0, 50).map((r, i) => ({
  id: text(r?.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase() || `reel-${i + 1}`,
  videoUrl: CLOUDINARY_VIDEO.test(String(r?.videoUrl || '')) ? String(r.videoUrl) : '',
  posterUrl: CLOUDINARY_ASSET.test(String(r?.posterUrl || '')) ? String(r.posterUrl) : '',
  caption: text(r?.caption, 200),
  productId: ID.test(String(r?.productId || '')) ? String(r.productId) : '',
  enabled: Boolean(r?.enabled),
})).filter((r) => r.videoUrl);
// Complete the Look: combo / set product id -> up to 12 accessory ids (MAX_LOOK_ITEMS in src/utils/looks.ts).
const sanitizeLookRelations = (value) => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  .filter(([k]) => ID.test(k)).slice(0, 500)
  .map(([k, ids]) => [k, [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => ID.test(id) && id !== k))].slice(0, 12)])
  .filter(([, ids]) => ids.length));
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const sanitizeDiscovery = (value) => ({
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, value?.features?.[k] !== false])),
  occasions: (Array.isArray(value?.occasions) ? value.occasions : []).slice(0, 30).map((o, i) => ({
    id: text(o?.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase() || `occasion-${i + 1}`,
    name: text(o?.name, 40) || 'Occasion',
    description: text(o?.description, 160),
    enabled: Boolean(o?.enabled),
    match: text(o?.match, 30),
    maxPrice: Number(o?.maxPrice) > 0 ? Math.round(Number(o.maxPrice)) : null,
    sizes: (Array.isArray(o?.sizes) ? o.sizes : []).map((z) => text(z, 12)).filter(Boolean).slice(0, 10),
    productIds: (Array.isArray(o?.productIds) ? o.productIds : []).map((id) => text(String(id), 60)).filter(Boolean).slice(0, 100),
  })),
});

const sanitizeComboOffer = (value) => ({
  enabled: Boolean(value?.enabled),
  percent: Math.min(50, Math.max(0, Math.round(Number(value?.percent) || 0))),
  minItems: Math.min(10, Math.max(2, Math.round(Number(value?.minItems) || 2))),
  title: typeof value?.title === 'string' ? value.title.trim().slice(0, 80) : '',
  subtitle: typeof value?.subtitle === 'string' ? value.subtitle.trim().slice(0, 200) : '',
});

// Only real Instagram reel/post links are stored, normalised to https://www.instagram.com/<type>/<code>/
const sanitizeInstagramReels = (value) => (Array.isArray(value) ? value : [])
  .map((reel) => {
    const match = String(reel?.url || '').trim().match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/);
    if (!match) return null;
    const type = match[1] === 'reels' ? 'reel' : match[1];
    return {
      id: String(reel.id || match[2]).slice(0, 60),
      url: `https://www.instagram.com/${type}/${match[2]}/`,
      caption: typeof reel.caption === 'string' ? reel.caption.trim().slice(0, 120) : '',
    };
  })
  .filter(Boolean)
  .slice(0, 24);

const sanitizePublicPaymentSettings = (value) => ({
  mode: value?.mode === 'live' ? 'live' : 'test',
  prepaidOnly: true,
  allowCod: false,
  razorpayKeyIdPlaceholder: typeof value?.razorpayKeyIdPlaceholder === 'string'
    ? value.razorpayKeyIdPlaceholder.trim().slice(0, 160)
    : '',
  enableUpi: Boolean(value?.enableUpi),
  enableCards: Boolean(value?.enableCards),
  enableNetBanking: Boolean(value?.enableNetBanking),
});

const sanitizePublicStoreSettings = (value) => {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const stringFields = [
    'storeName', 'tagline', 'logoText', 'storeEmail', 'phone', 'whatsapp', 'address',
    'instagramUrl', 'facebookUrl', 'twitterUrl', 'currency', 'currencySymbol', 'announcementText',
  ];
  const safe = Object.fromEntries(stringFields.map((key) => [
    key,
    typeof settings[key] === 'string' ? settings[key].trim().slice(0, 500) : '',
  ]));
  safe.shippingCharge = Math.max(0, Number(settings.shippingCharge) || 0);
  safe.freeShippingThreshold = Math.max(0, Number(settings.freeShippingThreshold) || 0);
  safe.prepaidDiscount = Math.min(5000, Math.max(0, Number(settings.prepaidDiscount) || 0));
  // Online payment discount in percent (0 = off), given only on products priced above prepaidMinPrice
  safe.prepaidPercent = Math.min(50, Math.max(0, Math.floor(Number(settings.prepaidPercent) || 0)));
  safe.prepaidMinPrice = Math.min(1000000, Math.max(0, Math.floor(Number(settings.prepaidMinPrice) || 0)));
  safe.announcementActive = settings.announcementActive ?? true;
  // Checkout rules (enforced again in api/_lib/orders.js) and invoice details. 0 = no limit / not shown.
  const whole = (raw, max) => Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)));
  safe.minOrderAmount = whole(settings.minOrderAmount, 1000000);
  safe.maxOrderAmount = whole(settings.maxOrderAmount, 10000000);
  if (safe.maxOrderAmount > 0 && safe.maxOrderAmount < safe.minOrderAmount) safe.maxOrderAmount = 0;
  safe.couponsEnabled = settings.couponsEnabled !== false;
  safe.cancellationWindowHours = settings.cancellationWindowHours === undefined || settings.cancellationWindowHours === null || settings.cancellationWindowHours === ''
    ? 0
    : whole(settings.cancellationWindowHours, 720);
  safe.processingDays = whole(settings.processingDays, 30);
  safe.deliveryMinDays = whole(settings.deliveryMinDays, 60);
  safe.deliveryMaxDays = whole(settings.deliveryMaxDays, 60);
  if (safe.deliveryMaxDays > 0 && safe.deliveryMinDays > safe.deliveryMaxDays) safe.deliveryMinDays = safe.deliveryMaxDays;
  if (safe.deliveryMaxDays === 0 && safe.deliveryMinDays > 0) safe.deliveryMaxDays = safe.deliveryMinDays;
  const text = (key, max) => (typeof settings[key] === 'string' ? settings[key].trim().slice(0, max) : '');
  safe.legalName = text('legalName', 160);
  const gstin = text('gstin', 20).toUpperCase().replace(/\s+/g, '');
  // Loose GSTIN shape: 2-digit state code, 10-character PAN, entity digit, Z, check character
  safe.gstin = /^\d{2}[A-Z0-9]{10}[A-Z0-9]Z[A-Z0-9]$/.test(gstin) ? gstin : '';
  safe.invoicePrefix = text('invoicePrefix', 20).toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'SAG-INV';
  safe.invoiceAddress = text('invoiceAddress', 500);
  safe.invoiceNote = text('invoiceNote', 500);
  return safe;
};

const reply = (res, status, body) => {
  res.status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
};

const database = () => firestore();
const credentialsDoc = (client) => client.collection('admin_credentials').doc('singleton');
// Each public setting is one document; values are stored as JSON because Firestore rejects nested arrays.
const settingsCollection = (client) => client.collection('storefront_settings');

// Admin password and PIN hashes.
// New hashes: `pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>`. scrypt at Node's default cost takes about
// 40 ms of CPU per hash (two per sign-in), far above the ~10 ms a request gets on Cloudflare Workers, so the
// admin could not sign in there. PBKDF2 at this count costs about 1 ms. What keeps it sound at that cost:
// the secret is first keyed with ADMIN_SESSION_SECRET (a pepper that is never in the database), so a leaked
// credentials document cannot be brute-forced on its own, not even the 6-digit PIN, which no amount of
// stretching could protect; and sign-in is limited to 10 attempts per IP per 15 minutes.
// Consequence: after rotating ADMIN_SESSION_SECRET the password and PIN have to be set again.
// Old hashes (`<saltHex>:<hashHex>`, scrypt) still verify, so existing credentials keep working.
const PBKDF2_SCHEME = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 5000;
const PBKDF2_MAX_ITERATIONS = 1000000;
const PBKDF2_BYTES = 32;

const peppered = (value) => {
  if (!process.env.ADMIN_SESSION_SECRET) throw new Error('SERVER_CONFIG_MISSING');
  return createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(value).digest();
};

export const hashSecret = (value, salt = randomBytes(16)) => {
  const hashHex = pbkdf2Sync(peppered(value), salt, PBKDF2_ITERATIONS, PBKDF2_BYTES, 'sha256').toString('hex');
  return `${PBKDF2_SCHEME}$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hashHex}`;
};

const verifyPbkdf2Secret = (value, stored) => {
  const [, iterationsText, saltHex, hashHex] = stored.split('$');
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  // PBKDF2 output of a shorter length is a prefix of the full one, so a truncated hash must not be accepted
  if (expected.length !== PBKDF2_BYTES) return false;
  const actual = pbkdf2Sync(peppered(value), Buffer.from(saltHex, 'hex'), iterations, PBKDF2_BYTES, 'sha256');
  return timingSafeEqual(expected, actual);
};

export const verifySecret = (value, stored) => {
  if (!value || typeof value !== 'string' || typeof stored !== 'string' || !stored) return false;
  if (stored.startsWith(`${PBKDF2_SCHEME}$`)) return verifyPbkdf2Secret(value, stored);
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(value, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

// Last admin credentials read from the database, kept while this server instance is warm. Used only when
// the database cannot be reached (quota, outage) so the owner is not locked out of the admin panel.
let lastCredentials = null;
const getCredentials = async (client, bootstrap = false) => {
  const snapshot = await credentialsDoc(client).get();
  if (snapshot.exists) { lastCredentials = snapshot.data(); return lastCredentials; }
  if (!bootstrap) return null;

  const username = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const pin = process.env.ADMIN_INITIAL_PIN;
  if (!username || !password || !pin) throw new Error('ADMIN_BOOTSTRAP_CONFIG_MISSING');

  const initialCredentials = {
    singleton: true,
    username,
    password_hash: hashSecret(password),
    pin_hash: hashSecret(pin),
    require_pin: true,
    secret_path_slug: 'drdaina',
    allow_direct_admin_route: false,
    session_version: 1,
  };
  await credentialsDoc(client).set(initialCredentials);
  return initialCredentials;
};

// Firestore can be unavailable (for example when the free daily quota is used up). The owner must never be
// locked out of the admin panel then: sign-in falls back to the credentials kept in the Worker's secrets
// (ADMIN_INITIAL_*), compared in constant time, with an in-memory attempt limit. Normal Firestore-backed
// sign-in resumes on its own as soon as the database answers again.
const FIRESTORE_WAIT_MS = 2500;
// After the database failed to answer, skip it for a minute so every admin call isn't slowed down again
let firestoreDownUntil = 0;
const firestoreTimeout = () => Object.assign(new Error('FIRESTORE_TIMEOUT'), { code: 'timeout' });
// Last catalogue this server instance built: served (briefly cached) when Firestore is unavailable or over quota
let lastCatalog = null;

const withTimeout = (promise) => {
  if (Date.now() < firestoreDownUntil) {
    promise.catch(() => {});
    return Promise.reject(firestoreTimeout());
  }
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => { firestoreDownUntil = Date.now() + 60 * 1000; reject(firestoreTimeout()); }, FIRESTORE_WAIT_MS); }),
  ]).catch((error) => {
    if (error?.code === 8 || /RESOURCE_EXHAUSTED|quota/i.test(String(error?.message || ''))) firestoreDownUntil = Date.now() + 60 * 1000;
    throw error;
  // The timer is stopped once the database has answered: left running, it would fire during a slow admin
  // request and mark a healthy database as down, which skips the "signed out everywhere" check for a minute.
  }).finally(() => clearTimeout(timer));
};
const isFirestoreDown = (error) => error?.code === 8 || error?.code === 14 || error?.code === 4 || error?.code === 'timeout'
  || /RESOURCE_EXHAUSTED|quota|FIRESTORE_TIMEOUT|UNAVAILABLE|DEADLINE_EXCEEDED/i.test(String(error?.message || ''));
const envCredentials = () => {
  const username = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const pin = process.env.ADMIN_INITIAL_PIN;
  if (!username || !password || !pin) return null;
  return { username, password, pin, session_version: 0, require_pin: true, secret_path_slug: 'drdaina', allow_direct_admin_route: false, fallback: true };
};
const sameText = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};
const fallbackAttempts = new Map();
const fallbackAllow = (ip) => {
  const now = Date.now();
  const entry = fallbackAttempts.get(ip);
  if (!entry || now - entry.start > 15 * 60 * 1000) {
    fallbackAttempts.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
};

const signPayload = (payload) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
  .update(payload)
  .digest('base64url');

const createSession = (credentials, remember = true) => {
  const payload = Buffer.from(JSON.stringify({
    username: credentials.username,
    version: credentials.session_version,
    remember: remember !== false,
    expiresAt: Date.now() + sessionSeconds(remember) * 1000,
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
};

const setSessionCookie = (res, token, clear = false, remember = true) => {
  const secure = process.env.SECURE_COOKIES === '1' ? '; Secure' : '';
  const maxAge = clear ? 0 : sessionSeconds(remember);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${clear ? '' : token}; HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age=${maxAge}${secure}`);
};

const getCookie = (req, name) => {
  const cookieHeader = req.headers.cookie || '';
  const value = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
};

const authenticate = async (req, client) => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('SERVER_CONFIG_MISSING');
  const token = getCookie(req, COOKIE_NAME);
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(signPayload(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!session.username || session.expiresAt <= Date.now()) return null;

  let credentials;
  try {
    credentials = await withTimeout(getCredentials(client));
  } catch (error) {
    if (!isFirestoreDown(error)) throw error;
    // Database unavailable (quota, outage): the cookie is signed with the server secret and has not expired,
    // so the session stays valid. Only the "signed out everywhere" check is skipped until the database is back.
    if (lastCredentials && lastCredentials.username === session.username) return { credentials: lastCredentials, session };
    const fallback = envCredentials();
    if (fallback && fallback.username === session.username) return { credentials: fallback, session };
    return {
      session,
      credentials: { username: session.username, session_version: session.version, require_pin: true, secret_path_slug: 'drdaina', allow_direct_admin_route: false, fallback: true },
    };
  }
  if (!credentials || credentials.username !== session.username || credentials.session_version !== session.version) return null;
  return { credentials, session };
};

const ensureSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
};

const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let client;
  try {
    client = database();
    const action = req.query?.action;

    if (req.method === 'GET') {
      if (action === 'session') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        const { credentials } = auth;
        // Sliding sign-in: every visit pushes the expiry out again
        const remember = auth.session.remember !== false;
        setSessionCookie(res, createSession({ username: auth.session.username, session_version: auth.session.version }, remember), false, remember);
        return reply(res, 200, {
          success: true,
          username: credentials.username,
          sessionVersion: credentials.session_version,
          firebaseToken: await createAdminFirebaseToken(),
        });
      }

      // Admin only: payment gateway switches (PayU salt is never returned)
      if (action === 'payment-gateways') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        const snap = await gatewaysDoc(client).get();
        return reply(res, 200, { gateways: adminGatewayView(normalizeGateways(snap.exists ? snap.data() : {})) });
      }

      // Admin only: the product-photo assistant (Gemini) status; the key itself is never returned
      if (action === 'ai-assistant') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        return reply(res, 200, { ai: aiAdminView(await readAi(client)) });
      }

      // Admin only: today's real Cloudflare usage against the free plan's daily limits, and the emails left at Brevo
      if (action === 'usage') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        return reply(res, 200, await readUsage(process.env, new Date(), await effectivePlan(client, process.env, true)));
      }

      // Admin only: the latest Razorpay payments with their status and failure reason (for checking payments)
      if (action === 'razorpay-payments') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        const gwSnap = await gatewaysDoc(client).get();
        const { keyId, secret } = razorpayCreds(normalizeGateways(gwSnap.exists ? gwSnap.data() : {}));
        const response = await fetch('https://api.razorpay.com/v1/payments?count=25', {
          headers: { authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return reply(res, 502, { error: data?.error?.description || 'Razorpay did not answer.' });
        return reply(res, 200, {
          mode: keyId.startsWith('rzp_live') ? 'live' : keyId.startsWith('rzp_test') ? 'test' : 'unknown',
          payments: (data.items || []).map((p) => ({
            at: new Date(p.created_at * 1000).toISOString(), status: p.status, method: p.method, amount: p.amount / 100,
            orderId: p.order_id, upiFlow: p.upi?.flow || '', app: p.upi?.payer_account_type || p.wallet || '',
            error: p.error_description || '', reason: p.error_reason || '', source: p.error_source || '', step: p.error_step || '',
          })),
        });
      }

      if (action === 'security') {
        const auth = await authenticate(req, client);
        if (!auth) return reply(res, 401, { error: 'Admin session required.' });
        const { credentials } = auth;
        return reply(res, 200, { securityConfig: {
          adminUsername: credentials.username,
          adminPassword: '',
          securityPin: '',
          requirePin: credentials.require_pin,
          secretPathSlug: credentials.secret_path_slug,
          allowDirectAdminRoute: credentials.allow_direct_admin_route,
          sessionVersion: credentials.session_version,
        } });
      }

      const publicSettingsFrom = (snapshot) => {
        const settings = {};
        snapshot.docs.forEach((settingDoc) => {
          if (!PUBLIC_SETTINGS.has(settingDoc.id)) return;
          try {
            settings[settingDoc.id] = JSON.parse(settingDoc.data().value_json);
          } catch {}
        });
        if (settings.storeSettings) settings.storeSettings = sanitizePublicStoreSettings(settings.storeSettings);
        if (settings.paymentSettings) settings.paymentSettings = sanitizePublicPaymentSettings(settings.paymentSettings);
        if (settings.instagramReels) settings.instagramReels = sanitizeInstagramReels(settings.instagramReels);
        return settings;
      };

      // Everything a shopper's page needs in one answer. Cloudflare's cache keeps it for 10 minutes and gives the
      // same copy to every visitor, so the database is read a few times an hour instead of on every visit.
      // The admin panel (and an admin browsing the store) keeps reading Firestore live.
      if (action === 'catalog') {
        try {
          const [settingsSnap, productsSnap, categoriesSnap, reviewsSnap, couponsSnap] = await Promise.race([Promise.all([
            settingsCollection(client).get(),
            client.collection('products').get(),
            client.collection('categories').get(),
            client.collection('reviews').where('status', '==', 'approved').get(),
            client.collection('coupons').get(),
          ]), new Promise((_, reject) => setTimeout(() => reject(new Error('CATALOG_TIMEOUT')), 5000))]);
          const pick = (data, keys) => Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
          const body = {
            settings: publicSettingsFrom(settingsSnap),
            products: productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.hidden),
            categories: categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            // Public review fields only (never the reviewer's email)
            reviews: reviewsSnap.docs.map((d) => ({
              id: d.id,
              ...pick(d.data(), ['productId', 'productName', 'userName', 'rating', 'comment', 'adminReply', 'date', 'verifiedPurchase', 'sizePurchased', 'location', 'imageUrl', 'helpfulCount', 'createdAt']),
              status: 'approved',
            })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 300),
            coupons: couponsSnap.docs.map((d) => ({
              id: d.id,
              ...pick(d.data(), ['code', 'discountType', 'discountValue', 'minOrderValue', 'maxDiscount', 'startDate', 'expiryDate', 'usageLimit', 'usageCount', 'isActive', 'perUserLimit', 'allowedCategories', 'allowedProductIds']),
            })).filter((c) => c.isActive !== false),
            generatedAt: new Date().toISOString(),
          };
          lastCatalog = body;
          res.status(200)
            .setHeader('Content-Type', 'application/json; charset=utf-8')
            .setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=600');
          res.end(JSON.stringify(body));
          return;
        } catch (error) {
          console.error('Catalog unavailable:', error?.message || error);
          if (lastCatalog) {
            res.status(200)
              .setHeader('Content-Type', 'application/json; charset=utf-8')
              .setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
            res.end(JSON.stringify(lastCatalog));
            return;
          }
          // Never cached: the browser falls back to reading the store live
          return reply(res, 503, { error: 'Catalog unavailable.' });
        }
      }

      const snapshot = await settingsCollection(client).get();
      return reply(res, 200, { settings: publicSettingsFrom(snapshot) });
    }

    if (!ensureSameOrigin(req)) return reply(res, 403, { error: 'Cross-origin request rejected.' });
    const body = parseBody(req);

    if (req.method === 'POST' && action === 'login') {
      // At most 10 attempts per IP per 15 minutes.
      const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().replace(/[^A-Za-z0-9_.:-]/g, '_');
      const limitRef = client.collection('rate_limits').doc(`admin_login:${ip}`);
      let allowed;
      let credentials;
      let fallback = false;
      try {
      allowed = await withTimeout(client.runTransaction(async (tx) => {
        const snap = await tx.get(limitRef);
        const now = Date.now();
        const data = snap.exists ? snap.data() : null;
        if (!data || now - data.windowStart > 15 * 60 * 1000) {
          tx.set(limitRef, { windowStart: now, count: 1, expiresAt: new Date(now + 15 * 60 * 1000) });
          return true;
        }
        if (data.count >= 10) return false;
        tx.update(limitRef, { count: data.count + 1 });
        return true;
      }));
      credentials = await withTimeout(getCredentials(client, true));
      } catch (error) {
        if (!isFirestoreDown(error)) throw error;
        allowed = fallbackAllow(ip);
        if (lastCredentials) {
          credentials = lastCredentials; // hashed, same as the database
        } else {
          credentials = envCredentials();
          if (!credentials) throw error;
          fallback = true;
        }
        console.warn('Admin sign-in is using the environment credentials: Firestore unavailable.', error?.message || error);
      }
      if (!allowed) return reply(res, 429, { error: 'Too many login attempts. Please wait 15 minutes and try again.' });
      const usernameMatches = body.username?.trim().toLowerCase() === credentials.username.toLowerCase();
      const passwordMatches = fallback ? sameText(body.password, credentials.password) : verifySecret(body.password, credentials.password_hash);
      const pinMatches = fallback ? sameText(body.pin, credentials.pin) : (!credentials.require_pin || verifySecret(body.pin, credentials.pin_hash));
      if (!usernameMatches || !passwordMatches || !pinMatches) {
        return reply(res, 401, { error: 'Invalid admin credentials.' });
      }
      const remember = body.remember !== false;
      setSessionCookie(res, createSession(credentials, remember), false, remember);
      return reply(res, 200, {
        success: true,
        username: credentials.username,
        sessionVersion: credentials.session_version,
        firebaseToken: await createAdminFirebaseToken(),
      });
    }

    if (req.method === 'POST' && action === 'logout') {
      setSessionCookie(res, '', true);
      await revokeAdminFirebaseSessions();
      return reply(res, 200, { success: true });
    }

    if (req.method === 'POST' && (action === 'cloudinary-sign' || action === 'cloudinary-delete')) {
      const auth = await authenticate(req, client);
      if (!auth) return reply(res, 401, { error: 'Admin session required.' });
      if (action === 'cloudinary-sign') return reply(res, 200, createUploadSignature(String(body.folder || '')));
      const urls = (Array.isArray(body.urls) ? body.urls : [body.url]).filter((url) => typeof url === 'string').slice(0, 50);
      const results = await Promise.allSettled(urls.map((url) => destroyImage(url)));
      const failed = urls.filter((_, index) => results[index].status === 'rejected');
      return reply(res, failed.length ? 207 : 200, { success: failed.length === 0, failed });
    }

    if (req.method === 'POST' && action === 'ai-describe') {
      const auth = await authenticate(req, client);
      if (!auth) return reply(res, 401, { error: 'Admin session required.' });
      const { geminiKey, model } = await readAi(client);
      if (!geminiKey) return reply(res, 400, { error: GEMINI_MESSAGES.GEMINI_NOT_SET, code: 'GEMINI_NOT_SET' });
      try {
        const result = await describeProduct({
          key: geminiKey,
          model,
          images: body.images,
          department: ['women', 'kids', 'toys'].includes(body.department) ? body.department : 'women',
          categories: body.categories,
          setTypes: body.setTypes,
          kinds: body.kinds,
          ages: body.ages,
          name: typeof body.name === 'string' ? body.name : '',
        });
        if (result.saveModel) await aiDoc(client).set({ model: result.saveModel }, { merge: true }).catch(() => undefined);
        return reply(res, 200, { success: true, ...result });
      } catch (error) {
        const code = String(error?.message || '').split(':')[0];
        console.error('Gemini describe failed:', error?.message || error);
        const status = code === 'GEMINI_QUOTA' ? 429 : ['GEMINI_NO_PHOTOS', 'GEMINI_NO_CATEGORIES', 'GEMINI_KEY_INVALID', 'GEMINI_KEY_DENIED'].includes(code) ? 400 : 502;
        return reply(res, status, { error: GEMINI_MESSAGES[code] || 'Gemini could not read these photos right now. Please try again.', code });
      }
    }

    if (req.method !== 'PUT') return reply(res, 405, { error: 'Method not allowed.' });

    const auth = await authenticate(req, client);
    if (!auth) return reply(res, 401, { error: 'Admin session required.' });

    if (body.securityConfig) {
      if (auth.credentials.fallback) return reply(res, 503, { error: 'The store database is busy right now. Please change the login details again in a few minutes.' });
      const { securityConfig } = body;
      const current = auth.credentials;
      const password = securityConfig.adminPassword || '';
      const pin = securityConfig.securityPin || '';
      if (password && password.length < 8) return reply(res, 400, { error: 'Password must be at least 8 characters.' });
      if (securityConfig.requirePin && pin && !/^\d{6}$/.test(pin)) return reply(res, 400, { error: 'PIN must be six digits.' });
      const nextCredentials = {
        singleton: true,
        username: securityConfig.adminUsername?.trim() || current.username,
        password_hash: password ? hashSecret(password) : current.password_hash,
        pin_hash: pin ? hashSecret(pin) : current.pin_hash,
        require_pin: securityConfig.requirePin ?? current.require_pin,
        secret_path_slug: securityConfig.secretPathSlug || current.secret_path_slug,
        allow_direct_admin_route: securityConfig.allowDirectAdminRoute ?? current.allow_direct_admin_route,
        session_version: current.session_version + 1,
      };
      await credentialsDoc(client).set(nextCredentials);
      await revokeAdminFirebaseSessions();
      setSessionCookie(res, createSession(nextCredentials));
      return reply(res, 200, { success: true, sessionVersion: nextCredentials.session_version });
    }

    // Usage & limits: the owner's Cloudflare plan switch (server-only document). Answers with the usage for that plan.
    if (body.cloudflarePlan !== undefined) {
      const plan = body.cloudflarePlan;
      if (plan !== 'free' && plan !== 'paid') return reply(res, 400, { error: 'Choose the free or the paid plan.' });
      await savePlan(client, plan);
      return reply(res, 200, await readUsage(process.env, new Date(), plan));
    }

    // Product-photo assistant: the free Gemini API key (server-only document), checked with Google before saving
    if (body.aiAssistant&& typeof body.aiAssistant === 'object') {
      if (body.aiAssistant.clear === true) {
        await aiDoc(client).set({ geminiKey: '', model: '', updatedAt: new Date().toISOString() });
        return reply(res, 200, { success: true, ai: aiAdminView({ geminiKey: '', model: '' }) });
      }
      const key = typeof body.aiAssistant.geminiKey === 'string' ? body.aiAssistant.geminiKey.trim() : '';
      if (!/^[A-Za-z0-9._-]{20,160}$/.test(key)) return reply(res, 400, { error: 'This does not look like a Gemini API key. Copy it again from aistudio.google.com → Get API key.' });
      let model;
      try {
        model = await pickModel(key);
      } catch (error) {
        const code = String(error?.message || '').split(':')[0];
        return reply(res, 400, { error: GEMINI_MESSAGES[code] || 'Google could not check this key right now. Please try again.' });
      }
      await aiDoc(client).set({ geminiKey: key, model, updatedAt: new Date().toISOString() });
      return reply(res, 200, { success: true, ai: aiAdminView({ geminiKey: key, model }) });
    }

    // Payment gateway switches and PayU credentials (server-only document)
    if (body.paymentGateways && typeof body.paymentGateways === 'object') {
      const input = body.paymentGateways;
      const snap = await gatewaysDoc(client).get();
      const current = normalizeGateways(snap.exists ? snap.data() : {});
      const key = typeof input.payu?.merchantKey === 'string' ? input.payu.merchantKey.trim() : current.payu.merchantKey;
      const salt = typeof input.payu?.salt === 'string' && input.payu.salt.trim() ? input.payu.salt.trim() : current.payu.salt;
      if (key && !/^[A-Za-z0-9]{4,40}$/.test(key)) return reply(res, 400, { error: 'The PayU merchant key looks wrong (letters and numbers only).' });
      if (salt && !/^[A-Za-z0-9+/=_-]{8,200}$/.test(salt)) return reply(res, 400, { error: 'The PayU salt looks wrong.' });
      // Razorpay keys: a new pair must look right and be accepted by Razorpay; empty secret fields keep the saved ones
      const rzIn = input.razorpay || {};
      const rzKeyId = typeof rzIn.keyId === 'string' ? rzIn.keyId.trim() : current.razorpay.keyId;
      const rzSecret = typeof rzIn.keySecret === 'string' && rzIn.keySecret.trim() ? rzIn.keySecret.trim() : (rzKeyId === current.razorpay.keyId ? current.razorpay.keySecret : '');
      const rzWebhook = typeof rzIn.webhookSecret === 'string' && rzIn.webhookSecret.trim() ? rzIn.webhookSecret.trim() : current.razorpay.webhookSecret;
      if (rzKeyId && !/^rzp_(live|test)_[A-Za-z0-9]{6,40}$/.test(rzKeyId)) return reply(res, 400, { error: 'The Razorpay Key ID should start with rzp_live_ or rzp_test_.' });
      if (rzKeyId && !rzSecret) return reply(res, 400, { error: 'Add the Razorpay Key Secret for this Key ID.' });
      if (rzSecret && !/^[A-Za-z0-9]{10,80}$/.test(rzSecret)) return reply(res, 400, { error: 'The Razorpay Key Secret looks wrong.' });
      if (rzWebhook && rzWebhook.length > 200) return reply(res, 400, { error: 'The webhook secret is too long.' });
      const keysChanged = rzKeyId !== current.razorpay.keyId || rzSecret !== current.razorpay.keySecret;
      if (rzKeyId && keysChanged && !(await checkRazorpayKeys(rzKeyId, rzSecret))) {
        return reply(res, 400, { error: 'Razorpay did not accept this Key ID and Secret. Copy them again from Razorpay Dashboard → Account & Settings → API Keys.' });
      }
      const next = normalizeGateways({
        razorpay: {
          enabled: rzIn.enabled ?? current.razorpay.enabled,
          keyId: rzIn.clearKeys === true ? '' : rzKeyId,
          keySecret: rzIn.clearKeys === true ? '' : rzSecret,
          webhookSecret: rzIn.clearKeys === true ? '' : rzWebhook,
        },
        payu: {
          enabled: input.payu?.enabled ?? current.payu.enabled,
          mode: input.payu?.mode ?? current.payu.mode,
          merchantKey: key,
          salt,
        },
      });
      if (next.payu.enabled && (!next.payu.merchantKey || !next.payu.salt)) {
        return reply(res, 400, { error: 'Add the PayU merchant key and salt before switching PayU on.' });
      }
      await gatewaysDoc(client).set({ ...next, updatedAt: new Date().toISOString() });
      clearGatewayCache();
      return reply(res, 200, { success: true, gateways: adminGatewayView(next) });
    }

    const settings = body.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return reply(res, 400, { error: 'Settings object required.' });
    }
    const entries = Object.entries(settings);
    if (entries.length === 0 || entries.some(([key]) => !PUBLIC_SETTINGS.has(key))) {
      return reply(res, 400, { error: 'Unsupported storefront setting.' });
    }
    const sanitizers = {
      storeSettings: sanitizePublicStoreSettings,
      paymentSettings: sanitizePublicPaymentSettings,
      instagramReels: sanitizeInstagramReels,
      comboOffer: sanitizeComboOffer,
      discovery: sanitizeDiscovery,
      auraReels: sanitizeAuraReels,
      lookRelations: sanitizeLookRelations,
    };
    const batch = client.batch();
    entries.forEach(([key, value]) => {
      const safeValue = sanitizers[key] ? sanitizers[key](value) : value;
      batch.set(settingsCollection(client).doc(key), {
        value_json: JSON.stringify(safeValue),
        updated_at: new Date().toISOString(),
      });
    });
    await batch.commit();
    return reply(res, 200, { success: true });
  } catch (error) {
    const message = error?.message || 'Unable to process admin configuration.';
    if (message === 'INVALID_UPLOAD_FOLDER') return reply(res, 400, { error: 'Unsupported upload folder.' });
    if (message === 'CLOUDINARY_CONFIG_MISSING') return reply(res, 503, { error: 'Image uploads are not configured yet.' });
    const status = ['SERVER_CONFIG_MISSING', 'ADMIN_BOOTSTRAP_CONFIG_MISSING'].includes(message) ? 503 : 500;
    console.error('Admin config API error:', message);
    return reply(res, status, { error: status === 503 ? 'Server-side admin credentials are not configured.' : 'Unable to process admin configuration.' });
  }
}
