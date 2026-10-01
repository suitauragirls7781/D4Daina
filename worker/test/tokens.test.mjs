// Session tokens, revocation and Google credential verification (worker/src/tokens.js), plus the
// firebase-admin/auth shim. Run: node --test worker/test/tokens.test.mjs
// Google's key download is mocked: nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createD1 } from './d1-node.mjs';
import { setEnv } from '../src/env.js';
import { createStore } from '../src/docstore.js';
import { createCustomToken, revokeRefreshTokens, verifyIdToken } from '../src/tokens.js';
import { getAuth } from '../src/shims/firebase-admin-auth.js';

const SECRET = 'test-only-auth-token-secret';
const DEFAULT_GOOGLE_CLIENT_ID = '531923624003-fi0npjcv76mqfi85meqkjldppui8g4vc.apps.googleusercontent.com';
const DAY = 24 * 60 * 60;

const db = createD1();
const useEnv = (extra = {}) => setEnv({ AUTH_TOKEN_SECRET: SECRET, DB: db, ...extra });
useEnv();

const now = () => Math.floor(Date.now() / 1000);
const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const readPayload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

// A token signed outside tokens.js, to control iat / exp / alg freely
const signHs256 = (payload, { secret = SECRET, header = { alg: 'HS256', typ: 'JWT' } } = {}) => {
  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

// ---- our own tokens ----

test('admin token: uid sag-admin, admin claim, 400 days', async () => {
  const token = await createCustomToken('sag-admin', { admin: true });
  assert.deepEqual(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')), { alg: 'HS256', typ: 'JWT' });
  const decoded = await verifyIdToken(token);
  assert.equal(decoded.uid, 'sag-admin');
  assert.equal(decoded.admin, true);
  assert.equal(decoded.customerEmail, undefined);
  assert.equal(decoded.exp - decoded.iat, 400 * DAY);
  assert.ok(Math.abs(decoded.iat - now()) <= 2);
});

test('customer token: c_ uid, customerEmail claim, 180 days', async () => {
  const token = await createCustomToken('c_0123456789abcdef0123456789', { customerEmail: 'asha@example.com' });
  const decoded = await verifyIdToken(token);
  assert.equal(decoded.uid, 'c_0123456789abcdef0123456789');
  assert.equal(decoded.customerEmail, 'asha@example.com');
  assert.equal(decoded.admin, undefined);
  assert.equal(decoded.exp - decoded.iat, 180 * DAY);
});

test('claims cannot override uid, iat or exp', async () => {
  const token = await createCustomToken('c_abc', { uid: 'sag-admin', iat: 1, exp: 99999999999, customerEmail: 'a@b.co' });
  const payload = readPayload(token);
  assert.equal(payload.uid, 'c_abc');
  assert.equal(payload.exp - payload.iat, 180 * DAY);
  assert.ok(Math.abs(payload.iat - now()) <= 2);
});

test('a uid is required', async () => {
  await assert.rejects(createCustomToken(''), { code: 'auth/argument-error' });
  await assert.rejects(createCustomToken(undefined, { admin: true }), { code: 'auth/argument-error' });
});

test('tampered, foreign and malformed tokens are rejected', async () => {
  const token = await createCustomToken('c_abc', { customerEmail: 'a@b.co' });
  const [header, payload, signature] = token.split('.');

  // a customer promoting himself to admin
  const forged = b64url({ ...readPayload(token), admin: true });
  await assert.rejects(verifyIdToken(`${header}.${forged}.${signature}`), { code: 'auth/argument-error' });
  // one changed signature character
  const flipped = signature.slice(0, -2) + (signature.at(-2) === 'A' ? 'B' : 'A') + signature.at(-1);
  await assert.rejects(verifyIdToken(`${header}.${payload}.${flipped}`), { code: 'auth/argument-error' });
  // signed with another secret
  await assert.rejects(verifyIdToken(signHs256({ uid: 'sag-admin', admin: true, iat: now(), exp: now() + 60 }, { secret: 'guess' })), { code: 'auth/argument-error' });
  // "alg: none" and an empty signature
  await assert.rejects(verifyIdToken(`${b64url({ alg: 'none' })}.${payload}.`), { code: 'auth/argument-error' });
  await assert.rejects(verifyIdToken(`${b64url({ alg: 'none' })}.${payload}.${signature}`), { code: 'auth/argument-error' });

  for (const junk of ['', 'abc', 'a.b', 'a.b.c', `${header}.${payload}.c`,`${header}.${payload}`, `${header}.!!.${signature}`, null, undefined, 42, {}]) {
    await assert.rejects(verifyIdToken(junk), { code: 'auth/argument-error' });
  }
});

test('expired tokens and tokens without uid or exp are rejected', async () => {
  await assert.rejects(verifyIdToken(signHs256({ uid: 'c_abc', iat: now() - 100, exp: now() - 1 })), { code: 'auth/id-token-expired' });
  await assert.rejects(verifyIdToken(signHs256({ uid: 'c_abc', iat: now() })), { code: 'auth/id-token-expired' });
  await assert.rejects(verifyIdToken(signHs256({ uid: 'c_abc', iat: now(), exp: 'never' })), { code: 'auth/id-token-expired' });
  await assert.rejects(verifyIdToken(signHs256({ admin: true, iat: now(), exp: now() + 60 })), { code: 'auth/argument-error' });
  // sanity: the same helper produces a token that does verify
  assert.equal((await verifyIdToken(signHs256({ uid: 'c_abc', iat: now(), exp: now() + 60 }))).uid, 'c_abc');
});

test('without AUTH_TOKEN_SECRET nothing is minted or accepted', async () => {
  const token = await createCustomToken('sag-admin', { admin: true });
  setEnv({ DB: db });
  await assert.rejects(createCustomToken('sag-admin', { admin: true }), /SERVER_CONFIG_MISSING/);
  await assert.rejects(verifyIdToken(token), /SERVER_CONFIG_MISSING/);
  useEnv();
  assert.equal((await verifyIdToken(token)).uid, 'sag-admin');
});

test('changing AUTH_TOKEN_SECRET invalidates old tokens', async () => {
  const token = await createCustomToken('sag-admin', { admin: true });
  setEnv({ AUTH_TOKEN_SECRET: 'rotated-secret', DB: db });
  await assert.rejects(verifyIdToken(token), { code: 'auth/argument-error' });
  useEnv();
  assert.equal((await verifyIdToken(token)).uid, 'sag-admin');
});

// ---- revocation ----

test('revokeRefreshTokens: older tokens fail the revocation check, newer ones pass', async () => {
  const old = signHs256({ uid: 'sag-admin', admin: true, iat: now() - 3600, exp: now() + 3600 });
  assert.equal((await verifyIdToken(old, true)).admin, true); // nothing revoked yet

  await revokeRefreshTokens('sag-admin');
  const state = await createStore(db).getDoc('auth_state', 'sag-admin');
  assert.ok(Math.abs(state.data.revokedAt - Date.now()) < 5000);

  await assert.rejects(verifyIdToken(old, true), { code: 'auth/id-token-revoked' });
  // without checkRevoked the token still verifies (api/_lib/http.js asks for the check only for admin tokens)
  assert.equal((await verifyIdToken(old)).uid, 'sag-admin');
  assert.equal((await verifyIdToken(old, false)).uid, 'sag-admin');

  // the session issued straight after a password change (same second) must work
  const fresh = await createCustomToken('sag-admin', { admin: true });
  assert.equal((await verifyIdToken(fresh, true)).admin, true);
});

test('revocation is per uid, and a token without iat cannot pass the check', async () => {
  await revokeRefreshTokens('sag-admin');
  const customer = signHs256({ uid: 'c_abc', customerEmail: 'a@b.co', iat: now() - 3600, exp: now() + 3600 });
  assert.equal((await verifyIdToken(customer, true)).customerEmail, 'a@b.co');
  await assert.rejects(verifyIdToken(signHs256({ uid: 'sag-admin', admin: true, exp: now() + 3600 }), true), { code: 'auth/id-token-revoked' });
  await assert.rejects(revokeRefreshTokens(''), { code: 'auth/argument-error' });
});

// ---- Google credentials ----

const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const googleKeyPair = await crypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
const otherKeyPair = await crypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
const KID = 'test-key-1';
const jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', googleKeyPair.publicKey)), kid: KID, use: 'sig', alg: 'RS256' }] };

let jwksDownloads = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  jwksDownloads += 1;
  return new Response(JSON.stringify(jwks), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=22000, must-revalidate' } });
};
test.after(() => { globalThis.fetch = realFetch; });

const googlePayload = (overrides = {}) => ({
  iss: 'https://accounts.google.com',
  aud: DEFAULT_GOOGLE_CLIENT_ID,
  sub: '110169484474386276334',
  email: 'Asha.Customer@gmail.com',
  email_verified: true,
  name: 'Asha Customer',
  picture: 'https://lh3.googleusercontent.com/a/photo',
  iat: now() - 5,
  exp: now() + 3600,
  ...overrides,
});

const signGoogle = async (payload, { key = googleKeyPair.privateKey, kid = KID, alg = 'RS256' } = {}) => {
  const unsigned = `${b64url({ alg, kid, typ: 'JWT' })}.${b64url(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
};

test('a valid Google credential returns the shape api/customer-auth.js reads', async () => {
  const decoded = await verifyIdToken(await signGoogle(googlePayload()));
  assert.deepEqual(decoded, {
    uid: 'google:110169484474386276334',
    email: 'Asha.Customer@gmail.com',
    email_verified: true,
    name: 'Asha Customer',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    firebase: { sign_in_provider: 'google.com' },
  });
  // it carries none of our claims, so it can never act as an admin or customer session
  assert.equal(decoded.admin, undefined);
  assert.equal(decoded.customerEmail, undefined);
  assert.equal(jwksDownloads, 1);
});

test('both Google issuer spellings are accepted and the keys are downloaded once', async () => {
  const decoded = await verifyIdToken(await signGoogle(googlePayload({ iss: 'accounts.google.com' })));
  assert.equal(decoded.email, 'Asha.Customer@gmail.com');
  await verifyIdToken(await signGoogle(googlePayload()), true);
  assert.equal(jwksDownloads, 1);
});

test('email_verified is passed through untouched', async () => {
  assert.equal((await verifyIdToken(await signGoogle(googlePayload({ email_verified: false })))).email_verified, false);
  assert.equal((await verifyIdToken(await signGoogle(googlePayload({ email_verified: 'true' })))).email_verified, 'true');
});

test('a Google credential for another app (wrong aud) is rejected', async () => {
  await assert.rejects(verifyIdToken(await signGoogle(googlePayload({ aud: 'other-app.apps.googleusercontent.com' }))), { code: 'auth/argument-error' });
  await assert.rejects(verifyIdToken(await signGoogle(googlePayload({ aud: [DEFAULT_GOOGLE_CLIENT_ID] }))), { code: 'auth/argument-error' });
});

test('GOOGLE_CLIENT_ID from the environment replaces the default audience', async () => {
  useEnv({ GOOGLE_CLIENT_ID: 'new-client.apps.googleusercontent.com' });
  try {
    assert.equal((await verifyIdToken(await signGoogle(googlePayload({ aud: 'new-client.apps.googleusercontent.com' })))).email_verified, true);
    await assert.rejects(verifyIdToken(await signGoogle(googlePayload())), { code: 'auth/argument-error' });
  } finally {
    useEnv();
  }
});

test('an expired Google credential is rejected', async () => {
  await assert.rejects(verifyIdToken(await signGoogle(googlePayload({ exp: now() - 1 }))), { code: 'auth/id-token-expired' });
  const { exp, ...withoutExp } = googlePayload();
  await assert.rejects(verifyIdToken(await signGoogle(withoutExp)), { code: 'auth/id-token-expired' });
});

test('a bad Google signature is rejected', async () => {
  // right key id, signed by somebody else's key
  await assert.rejects(verifyIdToken(await signGoogle(googlePayload(), { key: otherKeyPair.privateKey })), { code: 'auth/argument-error' });
  // payload changed after signing
  const [header, , signature] = (await signGoogle(googlePayload())).split('.');
  await assert.rejects(verifyIdToken(`${header}.${b64url(googlePayload({ email: 'victim@gmail.com' }))}.${signature}`), { code: 'auth/argument-error' });
});

test('an unknown key id is rejected without calling Google again straight away', async () => {
  const before = jwksDownloads;
  await assert.rejects(verifyIdToken(await signGoogle(googlePayload(), { key: otherKeyPair.privateKey, kid: 'attacker-key' })), { code: 'auth/argument-error' });
  assert.equal(jwksDownloads, before);
});

test('algorithm confusion: a Google-looking token signed with HS256 is rejected, whatever the key', async () => {
  const publicKeyAsSecret = JSON.stringify(jwks.keys[0]);
  for (const secret of [SECRET, publicKeyAsSecret, jwks.keys[0].n]) {
    const token = signHs256(googlePayload(), { secret, header: { alg: 'HS256', kid: KID, typ: 'JWT' } });
    await assert.rejects(verifyIdToken(token), { code: 'auth/argument-error' });
  }
  // and one of our own HS256 tokens is not a Google sign-in
  const own = await verifyIdToken(await createCustomToken('c_abc', { customerEmail: 'a@b.co', email: 'a@b.co', email_verified: true }));
  assert.equal(own.firebase, undefined);
});

test('a Google credential without a subject is rejected', async () => {
  const { sub, ...withoutSub } = googlePayload();
  await assert.rejects(verifyIdToken(await signGoogle(withoutSub)), { code: 'auth/argument-error' });
});

// ---- firebase-admin/auth shim ----

test('getAuth() gives the handlers what they call', async () => {
  const auth = getAuth({ name: 'ignored app' });
  const token = await auth.createCustomToken('sag-admin', { admin: true });
  assert.equal((await auth.verifyIdToken(token)).admin, true);
  assert.equal((await auth.verifyIdToken(token, true)).uid, 'sag-admin');
  // api/_lib/firebaseAdmin.js and api/customer-auth.js chain .catch() on these two
  assert.equal(await auth.revokeRefreshTokens('c_someone').catch(() => 'failed'), undefined);
  assert.equal(await auth.deleteUser('google:1').catch(() => 'failed'), undefined);
});
