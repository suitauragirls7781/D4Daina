// Scenarios 2 and 3: customer sign-in by email code and by Google, and what the session token then opens.
// Run: node --test worker/test/scenarios/customer-auth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { startHarness } from '../harness/harness.mjs';

const h = await startHarness();

const auth = (body, options) => h.post('/api/customer-auth', body, options);
const otpDoc = (email, purpose = 'login') => h.doc('customer_email_otps', `${email}__${purpose}`);
const codeIn = (mail) => mail.subject.match(/^(\d{6}) is your/)[1];
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const now = () => Math.floor(Date.now() / 1000);

/** A session token signed outside the server, to control its secret, lifetime and algorithm. */
const signSession = (payload, { secret = h.env.AUTH_TOKEN_SECRET, header = { alg: 'HS256', typ: 'JWT' } } = {}) => {
  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

/** Sends a code to a new address and returns it (each address gets its own client IP: the limit is per IP). */
const requestCode = async (email, purpose = 'login') => {
  const before = h.mailTo(email).length;
  const response = await auth({ action: 'send', email, purpose, name: 'Asha' }, { ip: h.nextIp() });
  assert.equal(response.status, 200, response.text);
  assert.equal(h.mailTo(email).length, before + 1);
  return codeIn(h.mailTo(email).at(-1));
};

const wrongCodeFor = (code) => (code === '111111' ? '222222' : '111111');

// ---- email code ----

let ashaToken = '';

test('send: the code goes out by email, only its hash is stored', async () => {
  const response = await auth({ action: 'send', email: 'Asha@Example.test', purpose: 'login', name: 'Asha' }, { ip: h.nextIp() });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, expiresInSeconds: 600, cooldownSeconds: 30 });

  const [mail] = h.mailTo('asha@example.test');
  assert.match(mail.subject, /^\d{6} is your Suit Aura Girls verification code$/);
  assert.equal(mail.from, h.env.BREVO_SENDER_EMAIL);
  const code = codeIn(mail);

  const stored = await otpDoc('asha@example.test');
  assert.equal(stored.email, 'asha@example.test');
  assert.match(stored.code_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(stored).includes(code));
  assert.equal(stored.attempts, 0);
  assert.equal(stored.sends.length, 1);
  assert.equal(stored.expires_at_ms - stored.sent_at_ms, 10 * 60 * 1000);
});

test('send: a second code within 30 seconds is refused and no email goes out', async () => {
  const response = await auth({ action: 'send', email: 'asha@example.test', purpose: 'login' }, { ip: h.nextIp() });
  assert.equal(response.status, 429);
  assert.match(response.body.error, /wait 30 seconds/);
  assert.equal(h.mailTo('asha@example.test').length, 1);
});

test('verify: a wrong code is refused and counted; the right code signs the customer in once', async () => {
  const code = codeIn(h.mailTo('asha@example.test')[0]);

  const wrong = await auth({ action: 'verify', email: 'asha@example.test', purpose: 'login', code: wrongCodeFor(code) });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /Incorrect code/);
  assert.equal((await otpDoc('asha@example.test')).attempts, 1);
  assert.equal(await h.doc('customers', 'asha@example.test'), null);

  const incomplete = await auth({ action: 'verify', email: 'asha@example.test', purpose: 'login', code: '123' });
  assert.equal(incomplete.status, 400);

  const right = await auth({ action: 'verify', email: 'asha@example.test', purpose: 'login', code, name: 'Asha Rao', phone: '+91 98765 43210' });
  assert.equal(right.status, 200, right.text);
  assert.equal(right.body.verified, true);
  assert.equal(right.body.email, 'asha@example.test');
  assert.deepEqual({ name: right.body.customer.name, phone: right.body.customer.phone }, { name: 'Asha Rao', phone: '9876543210' });
  ashaToken = right.body.firebaseToken;

  const claims = payloadOf(ashaToken);
  assert.equal(claims.customerEmail, 'asha@example.test');
  assert.match(claims.uid, /^c_[a-f0-9]{26}$/);
  assert.equal(claims.admin, undefined);
  assert.equal(claims.exp - claims.iat, 180 * 24 * 60 * 60);

  // The customer record and the profile seed were written
  const customer = await h.doc('customers', 'asha@example.test');
  assert.deepEqual({ email: customer.email, name: customer.name, phone: customer.phone, status: customer.status }, { email: 'asha@example.test', name: 'Asha Rao', phone: '9876543210', status: 'active' });
  const profile = await h.doc('profiles', 'asha@example.test');
  assert.deepEqual({ email: profile.email, fullName: profile.fullName, phone: profile.phone }, { email: 'asha@example.test', fullName: 'Asha Rao', phone: '9876543210' });

  // Single use: the same code does not work a second time
  const stored = await otpDoc('asha@example.test');
  assert.equal(stored.code_hash, '');
  const again = await auth({ action: 'verify', email: 'asha@example.test', purpose: 'login', code });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /invalid or has expired/);
});

test('verify: five wrong codes burn the code and lock the address for 30 minutes', async () => {
  const code = await requestCode('locked@example.test');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await auth({ action: 'verify', email: 'locked@example.test', code: wrongCodeFor(code) });
    assert.equal(response.status, 400, `attempt ${attempt}`);
  }
  const fifth = await auth({ action: 'verify', email: 'locked@example.test', code: wrongCodeFor(code) });
  assert.equal(fifth.status, 429);
  // The right code no longer works, and a new one cannot be requested during the lock
  const right = await auth({ action: 'verify', email: 'locked@example.test', code });
  assert.equal(right.status, 400);
  assert.equal(await h.doc('customers', 'locked@example.test'), null);
  const stored = await otpDoc('locked@example.test');
  assert.equal(stored.code_hash, '');
  assert.ok(stored.locked_until > Date.now() + 29 * 60 * 1000);
  await h.update('customer_email_otps', 'locked@example.test__login', { sent_at_ms: 0 });
  const resend = await auth({ action: 'send', email: 'locked@example.test' }, { ip: h.nextIp() });
  assert.equal(resend.status, 429);
  assert.match(resend.body.error, /Too many incorrect attempts/);
  assert.equal(h.mailTo('locked@example.test').length, 1);
});

test('verify: an expired code is refused', async () => {
  const code = await requestCode('late@example.test');
  await h.update('customer_email_otps', 'late@example.test__login', { expires_at_ms: Date.now() - 1000 });
  const response = await auth({ action: 'verify', email: 'late@example.test', code });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /invalid or has expired/);
  assert.equal(await h.doc('customers', 'late@example.test'), null);
});

test('verify: a code for "signup" does not work for "login"', async () => {
  const code = await requestCode('purpose@example.test', 'signup');
  const wrongPurpose = await auth({ action: 'verify', email: 'purpose@example.test', purpose: 'login', code });
  assert.equal(wrongPurpose.status, 400);
  const rightPurpose = await auth({ action: 'verify', email: 'purpose@example.test', purpose: 'signup', code });
  assert.equal(rightPurpose.status, 200);
});

test('send: at most 15 codes an hour from one network', async () => {
  const ip = h.nextIp();
  for (let index = 1; index <= 15; index += 1) {
    const response = await auth({ action: 'send', email: `net${index}@example.test` }, { ip });
    assert.equal(response.status, 200, `send ${index}`);
  }
  const mailsBefore = h.mail.length;
  const blocked = await auth({ action: 'send', email: 'net16@example.test' }, { ip });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many codes requested from this network/);
  assert.equal(h.mail.length, mailsBefore);
  assert.equal((await h.doc('rate_limits', `otp_ip:${ip}`)).count, 15);
});

test('send: at most 8 codes a day to one address', async () => {
  await requestCode('daily@example.test');
  const sends = Array.from({ length: 8 }, (_, index) => Date.now() - (index + 1) * 60 * 1000);
  await h.update('customer_email_otps', 'daily@example.test__login', { sends, sent_at_ms: Date.now() - 60 * 1000 });
  const response = await auth({ action: 'send', email: 'daily@example.test' }, { ip: h.nextIp() });
  assert.equal(response.status, 429);
  assert.match(response.body.error, /Daily limit/);
});

test('send: when the email provider refuses, the customer may try again at once', async () => {
  h.services.brevoStatus = 400;
  const failed = await auth({ action: 'send', email: 'bounce@example.test' }, { ip: h.nextIp() });
  h.services.brevoStatus = 201;
  assert.equal(failed.status, 502);
  assert.equal((await otpDoc('bounce@example.test')).sent_at_ms, 0);
  const retry = await auth({ action: 'send', email: 'bounce@example.test' }, { ip: h.nextIp() });
  assert.equal(retry.status, 200);
});

test('requests from another site, without an Origin, or with GET are refused', async () => {
  const foreign = await auth({ action: 'send', email: 'x@example.test' }, { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  const none = await auth({ action: 'send', email: 'x@example.test' }, { origin: null });
  assert.equal(none.status, 403);
  const get = await h.call('/api/customer-auth');
  assert.equal(get.status, 405);
  const invalid = await auth({ action: 'send', email: 'not-an-email' });
  assert.equal(invalid.status, 400);
  assert.equal(h.mailTo('x@example.test').length, 0);
});

// ---- what the token opens ----

test('the token authenticates /api/orders customer actions', async () => {
  const mine = await h.post('/api/orders', { action: 'my-orders' }, { token: ashaToken });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body, { orders: [] });
  const anonymous = await h.post('/api/orders', { action: 'my-orders' });
  assert.equal(anonymous.status, 401);
});

test('expired, forged and tampered tokens are treated as signed out', async () => {
  const claims = payloadOf(ashaToken);
  const [head, , signature] = ashaToken.split('.');
  const rejected = {
    expired: signSession({ ...claims, iat: now() - 1000, exp: now() - 1 }),
    'signed with another secret': signSession({ ...claims }, { secret: 'not-the-server-secret' }),
    'payload changed, signature kept': `${head}.${b64url({ ...claims, customerEmail: 'victim@example.test' })}.${signature}`,
    'alg none': `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.x`,
    'not a token': 'hello',
  };
  for (const [name, token] of Object.entries(rejected)) {
    const response = await h.post('/api/orders', { action: 'my-orders' }, { token });
    assert.equal(response.status, 401, name);
  }
  // The same claims, properly signed and not expired, are accepted: the checks above failed for the stated reason
  const valid = await h.post('/api/orders', { action: 'my-orders' }, { token: signSession({ ...claims, iat: now(), exp: now() + 60 }) });
  assert.equal(valid.status, 200);
});

test('a customer token never grants admin actions, even with an admin claim signed by another secret', async () => {
  const asCustomer = await h.post('/api/orders', { action: 'admin-test-email', email: 'x@example.test' }, { token: ashaToken });
  assert.equal(asCustomer.status, 401);
  const forgedAdmin = signSession({ uid: 'sag-admin', admin: true, iat: now(), exp: now() + 60 }, { secret: 'guess' });
  const asForgedAdmin = await h.post('/api/orders', { action: 'admin-test-email', email: 'x@example.test' }, { token: forgedAdmin });
  assert.equal(asForgedAdmin.status, 401);
  assert.equal(h.mailTo('x@example.test').length, 0);
});

test('the token opens the customer\'s own profile through /api/db and nobody else\'s', async () => {
  const response = await h.post('/api/db', { ops: [
    { op: 'get', path: 'profiles/asha@example.test' },
    { op: 'get', path: 'profiles/purpose@example.test' },
    { op: 'get', path: 'customers/purpose@example.test' },
    { op: 'set', path: 'profiles/asha@example.test', data: { wishlist: [] }, merge: true },
    { op: 'set', path: 'customers/asha@example.test', data: { status: 'vip' }, merge: true },
    { op: 'query', collection: 'orders' },
  ] }, { token: ashaToken });
  assert.equal(response.status, 200);
  const [own, otherProfile, otherCustomer, ownWrite, customerWrite, orders] = response.body.results;
  assert.equal(own.exists, true);
  assert.equal(own.data.email, 'asha@example.test');
  assert.equal(otherProfile.error.code, 'permission-denied');
  assert.equal(otherCustomer.error.code, 'permission-denied');
  assert.equal(ownWrite.error, undefined);
  assert.equal(customerWrite.error.code, 'permission-denied');
  assert.equal(orders.error.code, 'permission-denied');
  assert.deepEqual((await h.doc('profiles', 'asha@example.test')).wishlist, []);
  assert.equal((await h.doc('customers', 'asha@example.test')).status, 'active');

  const anonymous = await h.post('/api/db', { ops: [{ op: 'get', path: 'profiles/asha@example.test' }] });
  assert.equal(anonymous.body.results[0].error.code, 'permission-denied');
});

// ---- Google ----

const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
h.services.googleKeys.push({ ...google.publicKey.export({ format: 'jwk' }), kid: 'harness-key-1', alg: 'RS256', use: 'sig' });

const googleCredential = (claims = {}, { key = google.privateKey, kid = 'harness-key-1' } = {}) => {
  const payload = {
    iss: 'https://accounts.google.com',
    aud: h.env.GOOGLE_CLIENT_ID,
    sub: '109876543210987654321',
    email: 'Meera@Example.test',
    email_verified: true,
    name: 'Meera Nair',
    iat: now(),
    exp: now() + 3600,
    ...claims,
  };
  const unsigned = `${b64url({ alg: 'RS256', kid, typ: 'JWT' })}.${b64url(payload)}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url')}`;
};

test('Google sign-in: a valid credential signs the customer in with the same kind of session', async () => {
  const response = await auth({ action: 'google', idToken: googleCredential() });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.email, 'meera@example.test');
  assert.equal(response.body.customer.name, 'Meera Nair');
  assert.equal(payloadOf(response.body.firebaseToken).customerEmail, 'meera@example.test');
  assert.equal((await h.doc('customers', 'meera@example.test')).name, 'Meera Nair');
  assert.equal((await h.doc('profiles', 'meera@example.test')).email, 'meera@example.test');

  const orders = await h.post('/api/orders', { action: 'my-orders' }, { token: response.body.firebaseToken });
  assert.equal(orders.status, 200);
  // Google's keys were downloaded once and are kept
  await auth({ action: 'google', idToken: googleCredential() });
  assert.equal(h.net.callsTo('https://www.googleapis.com/oauth2/v3/certs').length, 1);
});

test('Google sign-in: credentials for another app, unverified, expired, wrongly signed or unsigned are refused', async () => {
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const refused = {
    'wrong audience': googleCredential({ aud: 'another-app.apps.googleusercontent.com', email: 'aud@example.test' }),
    'email not verified': googleCredential({ email_verified: false, email: 'unverified@example.test' }),
    expired: googleCredential({ exp: now() - 10, email: 'expired@example.test' }),
    'signed by someone else': googleCredential({ email: 'forged@example.test' }, { key: stranger.privateKey }),
    // Algorithm confusion: Google's issuer, but signed with our own session secret
    'HS256 with the Google issuer': signSession({ iss: 'https://accounts.google.com', aud: h.env.GOOGLE_CLIENT_ID, sub: '1', email: 'confused@example.test', email_verified: true, exp: now() + 60 }),
    empty: '',
  };
  for (const [name, idToken] of Object.entries(refused)) {
    const response = await auth({ action: 'google', idToken });
    assert.equal(response.status, 401, name);
    assert.equal(response.body.firebaseToken, undefined, name);
  }
  for (const email of ['aud', 'unverified', 'expired', 'forged', 'confused']) {
    assert.equal(await h.doc('customers', `${email}@example.test`), null, email);
  }
});

test('Google sign-in: one of our own session tokens is not a Google credential', async () => {
  const response = await auth({ action: 'google', idToken: ashaToken });
  assert.equal(response.status, 401);
});
