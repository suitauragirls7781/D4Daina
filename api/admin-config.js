import { createAdminFirebaseToken, firestore } from './_lib/firebaseAdmin.js';
import { createUploadSignature, destroyImage } from './_lib/cloudinary.js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'sag_admin_session';
const SESSION_SECONDS = 60 * 60 * 8;
const PUBLIC_SETTINGS = new Set([
  'homepageSections',
  'heroConfig',
  'storeSettings',
  'banners',
  'dealOfTheDay',
  'paymentSettings',
]);

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
  safe.announcementActive = settings.announcementActive ?? true;
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

const hashSecret = (value, salt = randomBytes(16)) => {
  const saltHex = salt.toString('hex');
  const hashHex = scryptSync(value, salt, 64).toString('hex');
  return `${saltHex}:${hashHex}`;
};

const verifySecret = (value, stored) => {
  if (!value || !stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(value, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const getCredentials = async (client, bootstrap = false) => {
  const snapshot = await credentialsDoc(client).get();
  if (snapshot.exists) return snapshot.data();
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
    secret_path_slug: 'sag-vault',
    allow_direct_admin_route: false,
    session_version: 1,
  };
  await credentialsDoc(client).set(initialCredentials);
  return initialCredentials;
};

const signPayload = (payload) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
  .update(payload)
  .digest('base64url');

const createSession = (credentials) => {
  const payload = Buffer.from(JSON.stringify({
    username: credentials.username,
    version: credentials.session_version,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
};

const setSessionCookie = (res, token, clear = false) => {
  const secure = process.env.VERCEL === '1' ? '; Secure' : '';
  const maxAge = clear ? 0 : SESSION_SECONDS;
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

  const credentials = await getCredentials(client);
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
        return reply(res, 200, {
          success: true,
          username: credentials.username,
          sessionVersion: credentials.session_version,
          firebaseToken: await createAdminFirebaseToken(),
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

      const snapshot = await settingsCollection(client).get();
      const settings = {};
      snapshot.docs.forEach((settingDoc) => {
        if (!PUBLIC_SETTINGS.has(settingDoc.id)) return;
        try {
          settings[settingDoc.id] = JSON.parse(settingDoc.data().value_json);
        } catch {}
      });
      if (settings.storeSettings) settings.storeSettings = sanitizePublicStoreSettings(settings.storeSettings);
      if (settings.paymentSettings) settings.paymentSettings = sanitizePublicPaymentSettings(settings.paymentSettings);
      return reply(res, 200, { settings });
    }

    if (!ensureSameOrigin(req)) return reply(res, 403, { error: 'Cross-origin request rejected.' });
    const body = parseBody(req);

    if (req.method === 'POST' && action === 'login') {
      const credentials = await getCredentials(client, true);
      const usernameMatches = body.username?.trim().toLowerCase() === credentials.username.toLowerCase();
      const passwordMatches = verifySecret(body.password, credentials.password_hash);
      const pinMatches = !credentials.require_pin || verifySecret(body.pin, credentials.pin_hash);
      if (!usernameMatches || !passwordMatches || !pinMatches) {
        return reply(res, 401, { error: 'Invalid admin credentials.' });
      }
      setSessionCookie(res, createSession(credentials));
      return reply(res, 200, {
        success: true,
        username: credentials.username,
        sessionVersion: credentials.session_version,
        firebaseToken: await createAdminFirebaseToken(),
      });
    }

    if (req.method === 'POST' && action === 'logout') {
      setSessionCookie(res, '', true);
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

    if (req.method !== 'PUT') return reply(res, 405, { error: 'Method not allowed.' });

    const auth = await authenticate(req, client);
    if (!auth) return reply(res, 401, { error: 'Admin session required.' });

    if (body.securityConfig) {
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
      setSessionCookie(res, createSession(nextCredentials));
      return reply(res, 200, { success: true, sessionVersion: nextCredentials.session_version });
    }

    const settings = body.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return reply(res, 400, { error: 'Settings object required.' });
    }
    const entries = Object.entries(settings);
    if (entries.length === 0 || entries.some(([key]) => !PUBLIC_SETTINGS.has(key))) {
      return reply(res, 400, { error: 'Unsupported storefront setting.' });
    }
    const sanitizers = { storeSettings: sanitizePublicStoreSettings, paymentSettings: sanitizePublicPaymentSettings };
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
