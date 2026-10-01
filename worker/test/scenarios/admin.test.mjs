// Scenario 8: the owner's admin panel API (api/admin-config.js): sign-in, the session cookie, settings,
// payment gateway keys, upload signatures, the photo assistant, logout and "sign out everywhere".
// Run: node --test worker/test/scenarios/admin.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { startHarness } from '../harness/harness.mjs';
import { adminCookieAttributes, adminCookieFrom, adminLogin, adminPut, ADMIN_COOKIE } from '../harness/admin.mjs';
import { createOrder, lineOf, pickOutfit, sendRazorpayWebhook } from '../harness/checkout.mjs';

// api/admin-config.js guards its database reads with a 2.5 s timer that it never cancels; when the timer
// fires (even after the read succeeded) the handler treats the database as down for a minute and answers
// from its fallbacks. That is the same on Vercel and is reported to the lead. These tests are about the
// normal path, so setTimeout is frozen here: nothing in this file needs a timer to fire (h.sleep is real).
mock.timers.enable({ apis: ['setTimeout'] });

const h = await startHarness();

const FOUR_HUNDRED_DAYS = 60 * 60 * 24 * 400;
const get = (action, cookie) => h.call(`/api/admin-config?action=${action}`, { cookie });
const adminPost = (action, cookie, body, options = {}) => h.post(`/api/admin-config?action=${action}`, body, { cookie, ...options });
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const adminAction = (token) => h.post('/api/orders', { action: 'admin-test-email', email: 'probe@example.test' }, { token });
const adminRead = async (token) => (await h.post('/api/db', { ops: [{ op: 'query', collection: 'orders', limit: 1 }] }, { token })).body.results[0];

/** A session cookie made outside the server, to control what it says and which secret signs it. */
const forgeCookie = (session, secret = h.env.ADMIN_SESSION_SECRET) => {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${ADMIN_COOKIE}=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
};

let cookie = '';
let token = '';

// ---- sign-in ----

test('login: a wrong username, password or PIN is refused and sets no cookie; the first attempt creates hashed credentials', async () => {
  assert.equal(await h.doc('admin_credentials', 'singleton'), null);
  const wrong = {
    'wrong password': { password: 'not-the-password' },
    'wrong PIN': { pin: '000000' },
    'wrong username': { username: 'someone' },
    'no PIN': { pin: '' },
    'password and PIN swapped': { password: h.env.ADMIN_INITIAL_PIN, pin: h.env.ADMIN_INITIAL_PASSWORD },
  };
  for (const [name, credentials] of Object.entries(wrong)) {
    const response = await adminLogin(h, credentials);
    assert.equal(response.status, 401, name);
    assert.deepEqual(response.cookies, [], name);
    assert.equal(response.body.firebaseToken, undefined, name);
  }
  const numericPassword = await h.post('/api/admin-config?action=login', { username: h.env.ADMIN_INITIAL_USERNAME, password: 12345678, pin: 246810 }, { ip: h.nextIp() });
  assert.equal(numericPassword.status, 401);

  const stored = await h.doc('admin_credentials', 'singleton');
  assert.deepEqual(
    { username: stored.username, require_pin: stored.require_pin, session_version: stored.session_version, secret_path_slug: stored.secret_path_slug },
    { username: h.env.ADMIN_INITIAL_USERNAME, require_pin: true, session_version: 1, secret_path_slug: 'drdaina' },
  );
  // The cheap-on-Workers hash format, and never the secrets themselves
  assert.match(stored.password_hash, /^pbkdf2-sha256\$5000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.match(stored.pin_hash, /^pbkdf2-sha256\$5000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(stored).includes(h.env.ADMIN_INITIAL_PASSWORD) && !JSON.stringify(stored).includes(h.env.ADMIN_INITIAL_PIN));
});

test('login: the right credentials give the session cookie and an admin token', async () => {
  const response = await adminLogin(h, { username: ` ${h.env.ADMIN_INITIAL_USERNAME.toUpperCase()} ` });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual({ success: response.body.success, username: response.body.username, sessionVersion: response.body.sessionVersion }, { success: true, username: h.env.ADMIN_INITIAL_USERNAME, sessionVersion: 1 });

  const attributes = adminCookieAttributes(response);
  assert.deepEqual(
    { httponly: attributes.httponly, secure: attributes.secure, samesite: attributes.samesite, path: attributes.path, maxAge: attributes['max-age'] },
    { httponly: true, secure: true, samesite: 'Strict', path: '/api/admin-config', maxAge: String(FOUR_HUNDRED_DAYS) },
  );
  cookie = adminCookieFrom(response);
  token = response.body.firebaseToken;
  const claims = payloadOf(token);
  assert.deepEqual({ uid: claims.uid, admin: claims.admin, lifetime: claims.exp - claims.iat }, { uid: 'sag-admin', admin: true, lifetime: FOUR_HUNDRED_DAYS });

  const shortSession = await adminLogin(h, { remember: false });
  assert.equal(adminCookieAttributes(shortSession)['max-age'], String(12 * 60 * 60));
});

test('login: ten attempts per address in 15 minutes, then even the right password has to wait', async () => {
  const ip = h.nextIp();
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await adminLogin(h, { password: `guess-${attempt}`, ip });
    assert.equal(response.status, 401, `attempt ${attempt}`);
  }
  const blocked = await adminLogin(h, { ip });
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.cookies, []);
  assert.equal((await h.doc('rate_limits', `admin_login:${ip}`)).count, 10);
  // Other addresses are not affected
  assert.equal((await adminLogin(h)).status, 200);
});

// ---- the session ----

test('session: the cookie is checked and renewed on every visit; forged, expired and foreign cookies are refused', async () => {
  const response = await get('session', cookie);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual({ username: response.body.username, sessionVersion: response.body.sessionVersion }, { username: h.env.ADMIN_INITIAL_USERNAME, sessionVersion: 1 });
  assert.equal(adminCookieAttributes(response)['max-age'], String(FOUR_HUNDRED_DAYS));
  assert.notEqual(adminCookieFrom(response), '');
  assert.equal(payloadOf(response.body.firebaseToken).admin, true);
  assert.equal((await get('session', adminCookieFrom(response))).status, 200);

  const session = { username: h.env.ADMIN_INITIAL_USERNAME, version: 1, remember: true, expiresAt: Date.now() + 60000 };
  assert.equal((await get('session', forgeCookie(session))).status, 200, 'a cookie signed with the server secret is what the server itself issues');
  const refused = {
    'no cookie': '',
    'signed with another secret': forgeCookie(session, 'guessed-secret'),
    expired: forgeCookie({ ...session, expiresAt: Date.now() - 1 }),
    'older session version': forgeCookie({ ...session, version: 0 }),
    'another username': forgeCookie({ ...session, username: 'intruder' }),
    'payload changed, signature kept': `${ADMIN_COOKIE}=${Buffer.from(JSON.stringify({ ...session, expiresAt: Date.now() + 9e9 })).toString('base64url')}.${cookie.split('.')[1]}`,
    garbage: `${ADMIN_COOKIE}=abc`,
  };
  for (const [name, bad] of Object.entries(refused)) {
    const answer = await get('session', bad);
    assert.equal(answer.status, 401, name);
    assert.deepEqual(answer.cookies, [], name);
  }
});

test('security: the login settings are shown without the password or PIN', async () => {
  const response = await get('security', cookie);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.securityConfig, {
    adminUsername: h.env.ADMIN_INITIAL_USERNAME, adminPassword: '', securityPin: '', requirePin: true, secretPathSlug: 'drdaina', allowDirectAdminRoute: false, sessionVersion: 1,
  });
  assert.ok(!response.text.includes('pbkdf2'));
});

// ---- storefront settings ----

test('settings: saved through the admin API, cleaned on the way in, and served to shoppers', async () => {
  const before = (await h.call('/api/admin-config')).body.settings;
  const sections = [{ id: 'hero', enabled: true }, { id: 'reviews', enabled: false }];
  const saved = await adminPut(h, cookie, { settings: {
    storeSettings: { ...before.storeSettings, shippingCharge: 99, prepaidDiscount: 999999, announcementText: '  Diwali offers  ', gstin: 'not a gstin', internalRemark: 'must not be stored' },
    homepageSections: sections,
    comboOffer: { enabled: true, percent: 80, minItems: 1, title: 'Combo' },
  } });
  assert.equal(saved.status, 200, saved.text);

  const stored = await h.setting('storeSettings');
  assert.deepEqual(
    { shippingCharge: stored.shippingCharge, prepaidDiscount: stored.prepaidDiscount, announcementText: stored.announcementText, gstin: stored.gstin, internalRemark: stored.internalRemark },
    { shippingCharge: 99, prepaidDiscount: 5000, announcementText: 'Diwali offers', gstin: '', internalRemark: undefined },
  );
  assert.deepEqual(await h.setting('homepageSections'), sections);
  assert.deepEqual(await h.setting('comboOffer'), { enabled: true, percent: 50, minItems: 2, title: 'Combo', subtitle: '' });

  const after = (await h.call('/api/admin-config')).body.settings;
  assert.equal(after.storeSettings.shippingCharge, 99);
  assert.deepEqual(after.homepageSections, sections);
  assert.deepEqual(after.heroConfig, before.heroConfig);
  const catalogue = await h.call('/api/admin-config?action=catalog&v=after-save');
  assert.equal(catalogue.body.settings.storeSettings.shippingCharge, 99);
  // The checkout prices with the saved value straight away
  const outfit = pickOutfit(h.exported('products'));
  await h.update('products', outfit.id, { stockQuantity: 5, inStock: true });
  await adminPut(h, cookie, { settings: { storeSettings: { ...after.storeSettings, freeShippingThreshold: 0 }, comboOffer: { enabled: false } } });
  const quote = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)] });
  assert.equal(quote.body.quote.shippingCharge, 99);
});

test('settings: refused without the cookie, from another site, for unknown keys, and through the browser data gateway', async () => {
  const before = await h.doc('storefront_settings', 'storeSettings');
  const body = { settings: { storeSettings: { shippingCharge: 1 } } };
  assert.equal((await adminPut(h, '', body)).status, 401);
  assert.equal((await h.call('/api/admin-config', { method: 'PUT', json: body, cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await adminPut(h, cookie, { settings: { storeSettings: { shippingCharge: 1 }, adminNotes: 'x' } })).status, 400);
  assert.equal((await adminPut(h, cookie, { settings: {} })).status, 400);
  assert.equal((await adminPut(h, cookie, { settings: ['storeSettings'] })).status, 400);
  assert.equal((await adminPut(h, cookie, {})).status, 400);
  const direct = await h.post('/api/db', { ops: [{ op: 'set', path: 'storefront_settings/storeSettings', data: { value_json: '{}' } }] }, { token });
  assert.equal(direct.body.results[0].error.code, 'permission-denied');
  assert.deepEqual(await h.doc('storefront_settings', 'storeSettings'), before);
  assert.equal(await h.doc('storefront_settings', 'adminNotes'), null);
  // Other verbs and actions
  assert.equal((await h.call('/api/admin-config', { method: 'OPTIONS' })).status, 204);
  assert.equal((await adminPost('no-such-action', cookie, {})).status, 405);
});

// ---- payment gateways ----

test('payment gateways: the admin sees hints only; new Razorpay keys are saved only when Razorpay accepts them', async () => {
  const view = await get('payment-gateways', cookie);
  assert.equal(view.status, 200, view.text);
  assert.deepEqual(view.body.gateways.razorpay, {
    enabled: true, configured: true, mode: 'live', source: 'env', keyId: h.env.RAZORPAY_KEY_ID, secretSet: true,
    secretHint: `••••${h.env.RAZORPAY_KEY_SECRET.slice(-4)}`, webhookSecretSet: true, webhookSecretHint: `••••${h.env.RAZORPAY_WEBHOOK_SECRET.slice(-4)}`,
  });
  assert.deepEqual(view.body.gateways.payu, { enabled: false, mode: 'test', merchantKey: '', saltSet: false, saltHint: '' });
  assert.ok(!view.text.includes(h.env.RAZORPAY_KEY_SECRET) && !view.text.includes(h.env.RAZORPAY_WEBHOOK_SECRET));

  const newKey = { keyId: 'rzp_live_AdminSavedKey01', keySecret: 'AdminSavedSecret0001' };
  const invalid = {
    'key id of the wrong shape': { razorpay: { keyId: 'live_key_1', keySecret: newKey.keySecret } },
    'key id without its secret': { razorpay: { keyId: newKey.keyId } },
    'secret with odd characters': { razorpay: { keyId: newKey.keyId, keySecret: 'short!' } },
    'a pair Razorpay does not accept': { razorpay: newKey },
    'not signed in': null,
  };
  for (const [name, paymentGateways] of Object.entries(invalid)) {
    const response = paymentGateways ? await adminPut(h, cookie, { paymentGateways }) : await adminPut(h, '', { paymentGateways: { razorpay: newKey } });
    assert.equal(response.status, paymentGateways ? 400 : 401, name);
  }
  assert.equal(await h.doc('private_settings', 'payment_gateways'), null);

  h.services.razorpayKeys.add(`${newKey.keyId}:${newKey.keySecret}`);
  const saved = await adminPut(h, cookie, { paymentGateways: { razorpay: { ...newKey, webhookSecret: 'admin-webhook-secret' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(
    { source: saved.body.gateways.razorpay.source, keyId: saved.body.gateways.razorpay.keyId, secretHint: saved.body.gateways.razorpay.secretHint },
    { source: 'admin', keyId: newKey.keyId, secretHint: `••••${newKey.keySecret.slice(-4)}` },
  );
  assert.ok(!saved.text.includes(newKey.keySecret) && !saved.text.includes('admin-webhook-secret'));
  assert.deepEqual((await h.doc('private_settings', 'payment_gateways')).razorpay, { enabled: true, keyId: newKey.keyId, keySecret: newKey.keySecret, webhookSecret: 'admin-webhook-secret' });

  // The checkout uses the saved keys at once
  const outfit = pickOutfit(h.exported('products'));
  const created = await createOrder(h, { email: 'keys@example.test', items: [lineOf(outfit, 1)] });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.keyId, newKey.keyId);
  const razorpayCall = h.net.callsTo('https://api.razorpay.com/v1/orders').filter((call) => call.method === 'POST').at(-1);
  assert.equal(razorpayCall.headers.authorization, `Basic ${Buffer.from(`${newKey.keyId}:${newKey.keySecret}`).toString('base64')}`);

  // Webhooks signed with the admin's secret or the environment's are both accepted; any other is not
  const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_Unknown' } } } };
  assert.equal((await sendRazorpayWebhook(h, event, { secret: 'admin-webhook-secret' })).status, 200);
  assert.equal((await sendRazorpayWebhook(h, event)).status, 200);
  assert.equal((await sendRazorpayWebhook(h, event, { secret: 'some-other-secret' })).status, 401);

  // Removing the saved keys returns to the server's own
  const cleared = await adminPut(h, cookie, { paymentGateways: { razorpay: { clearKeys: true } } });
  assert.equal(cleared.body.gateways.razorpay.source, 'env');
  assert.equal((await createOrder(h, { email: 'keys@example.test', items: [lineOf(outfit, 1)] })).body.keyId, h.env.RAZORPAY_KEY_ID);
});

test('razorpay-payments: the latest payments are listed for the admin only', async () => {
  h.net.on('GET', 'https://api.razorpay.com/v1/payments', () => new Response(JSON.stringify({ items: [
    { created_at: 1790000000, status: 'failed', method: 'upi', amount: 129900, order_id: 'order_Test000001', error_description: 'Payment was cancelled', error_reason: 'payment_cancelled' },
  ] }), { status: 200 }));
  const response = await get('razorpay-payments', cookie);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.mode, 'live');
  assert.deepEqual(
    { status: response.body.payments[0].status, amount: response.body.payments[0].amount, orderId: response.body.payments[0].orderId, error: response.body.payments[0].error },
    { status: 'failed', amount: 1299, orderId: 'order_Test000001', error: 'Payment was cancelled' },
  );
});

// ---- uploads and the photo assistant ----

test('cloudinary-sign: a signature for the store\'s own folders only; cloudinary-delete removes only the store\'s files', async () => {
  const signed = await adminPost('cloudinary-sign', cookie, { folder: 'product-images' });
  assert.equal(signed.status, 200, signed.text);
  const { signature, cloudName, apiKey, folder, timestamp } = signed.body;
  assert.deepEqual([cloudName, apiKey, folder], [h.env.CLOUDINARY_CLOUD_NAME, h.env.CLOUDINARY_API_KEY, 'suitauragirls/product-images']);
  assert.ok(Math.abs(timestamp - Date.now() / 1000) < 5);
  assert.equal(signature, createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${h.env.CLOUDINARY_API_SECRET}`).digest('hex'));
  assert.ok(!signed.text.includes(h.env.CLOUDINARY_API_SECRET));

  assert.equal((await adminPost('cloudinary-sign', cookie, { folder: '../private' })).status, 400);
  assert.equal((await adminPost('cloudinary-sign', '', { folder: 'product-images' })).status, 401);
  assert.equal((await adminPost('cloudinary-sign', cookie, { folder: 'product-images' }, { origin: 'https://evil.example' })).status, 403);

  const own = `https://res.cloudinary.com/${h.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1764000000/suitauragirls/product-images/abc123.jpg`;
  const deleted = await adminPost('cloudinary-delete', cookie, { urls: [own] });
  assert.equal(deleted.status, 200, deleted.text);
  assert.deepEqual(h.services.cloudinaryDestroyed, ['suitauragirls/product-images/abc123']);

  const foreign = ['https://res.cloudinary.com/another-cloud/image/upload/suitauragirls/product-images/abc.jpg', `https://res.cloudinary.com/${h.env.CLOUDINARY_CLOUD_NAME}/image/upload/someone-else/abc.jpg`];
  const refused = await adminPost('cloudinary-delete', cookie, { urls: foreign });
  assert.equal(refused.status, 207);
  assert.deepEqual(refused.body.failed, foreign);
  assert.equal(h.services.cloudinaryDestroyed.length, 1);
  assert.equal((await adminPost('cloudinary-delete', '', { urls: [own] })).status, 401);
});

test('ai-assistant: status without the key; a key is saved only after Google accepts it; it can be removed', async () => {
  const empty = await get('ai-assistant', cookie);
  assert.equal(empty.status, 200, empty.text);
  assert.deepEqual(empty.body.ai, { fromServer: false, configured: false, keyHint: '', model: '' });

  assert.equal((await adminPut(h, cookie, { aiAssistant: { geminiKey: 'too short' } })).status, 400);
  assert.equal((await adminPost('ai-describe', cookie, { images: [] })).status, 400, 'no key saved yet');

  const key = 'AIzaHarnessOnlyKey_0123456789abcdef';
  const saved = await adminPut(h, cookie, { aiAssistant: { geminiKey: key } });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(saved.body.ai, { fromServer: false, configured: true, keyHint: `…${key.slice(-4)}`, model: 'gemini-3.1-flash-lite' });
  assert.equal(h.net.callsTo('https://generativelanguage.googleapis.com/v1beta/models').at(-1).headers['x-goog-api-key'], key);
  assert.deepEqual({ geminiKey: (await h.doc('private_settings', 'ai_assistant')).geminiKey, model: (await h.doc('private_settings', 'ai_assistant')).model }, { geminiKey: key, model: 'gemini-3.1-flash-lite' });

  const status = await get('ai-assistant', cookie);
  assert.deepEqual(status.body.ai, { fromServer: false, configured: true, keyHint: `…${key.slice(-4)}`, model: 'gemini-3.1-flash-lite' });
  assert.ok(!status.text.includes(key));

  const cleared = await adminPut(h, cookie, { aiAssistant: { clear: true } });
  assert.deepEqual(cleared.body.ai, { fromServer: false, configured: false, keyHint: '', model: '' });
  assert.equal((await h.doc('private_settings', 'ai_assistant')).geminiKey, '');
});

// ---- the admin token, logout and "sign out everywhere" ----

test('the admin token opens admin actions and admin reads; a customer token does not', async () => {
  assert.equal((await adminAction(token)).status, 200);
  assert.equal((await adminRead(token)).docs.length, 1);
  const customer = await h.customerToken('asha@example.test');
  assert.equal((await adminAction(customer)).status, 401);
  assert.equal((await adminRead(customer)).error.code, 'permission-denied');
  // The server-only collections stay closed even to the admin's browser
  const closed = await h.post('/api/db', { ops: ['admin_credentials/singleton', 'auth_state/sag-admin', 'rate_limits/x', 'customer_email_otps/x'].map((path) => ({ op: 'get', path })) }, { token });
  assert.deepEqual(closed.body.results.map((result) => result.error?.code), Array(4).fill('permission-denied'));
});

test('logout: the cookie is cleared and every admin token issued so far stops working', async () => {
  // Revocation is compared in whole seconds (as Firebase does), so the token must be older than this second
  await h.sleep(1100);
  const response = await adminPost('logout', cookie, {});
  assert.equal(response.status, 200, response.text);
  const attributes = adminCookieAttributes(response);
  assert.deepEqual([attributes.value, attributes['max-age']], ['', '0']);
  assert.ok((await h.doc('auth_state', 'sag-admin')).revokedAt <= Date.now());

  assert.equal((await adminAction(token)).status, 401);
  assert.equal((await adminRead(token)).error.code, 'permission-denied');
  assert.equal(h.mailTo('probe@example.test').length, 1);

  // Signing in again gives a token that works
  const again = await adminLogin(h);
  cookie = adminCookieFrom(again);
  token = again.body.firebaseToken;
  assert.equal((await adminAction(token)).status, 200);
});

test('security change: validated, then the password and PIN are replaced and every other session is signed out', async () => {
  assert.equal((await adminPut(h, cookie, { securityConfig: { adminPassword: 'short' } })).status, 400);
  assert.equal((await adminPut(h, cookie, { securityConfig: { requirePin: true, securityPin: '12345' } })).status, 400);
  assert.equal((await adminPut(h, '', { securityConfig: { adminPassword: 'Another-Passw0rd' } })).status, 401);
  assert.equal((await h.doc('admin_credentials', 'singleton')).session_version, 1);

  const otherDevice = adminCookieFrom(await adminLogin(h));
  await h.sleep(1100);
  const changed = await adminPut(h, cookie, { securityConfig: { adminPassword: 'Another-Passw0rd', securityPin: '135790', requirePin: true } });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.body.sessionVersion, 2);
  const newCookie = adminCookieFrom(changed);

  const stored = await h.doc('admin_credentials', 'singleton');
  assert.equal(stored.session_version, 2);
  assert.match(stored.password_hash, /^pbkdf2-sha256\$/);
  assert.ok(!JSON.stringify(stored).includes('Another-Passw0rd') && !JSON.stringify(stored).includes('135790'));

  // Old cookies and old tokens are out
  assert.equal((await get('session', cookie)).status, 401);
  assert.equal((await get('session', otherDevice)).status, 401);
  assert.equal((await adminAction(token)).status, 401);
  // The device that made the change stays in: its new cookie works and gives a working token straight away
  const session = await get('session', newCookie);
  assert.equal(session.status, 200, session.text);
  assert.equal(session.body.sessionVersion, 2);
  assert.equal((await adminAction(session.body.firebaseToken)).status, 200);

  assert.equal((await adminLogin(h)).status, 401, 'the old password no longer works');
  assert.equal((await adminLogin(h, { password: 'Another-Passw0rd' })).status, 401, 'the new password needs the new PIN');
  assert.equal((await adminLogin(h, { password: 'Another-Passw0rd', pin: '135790' })).status, 200);
});
