// Scenario 8, the cut-over case: the admin credentials imported from Firestore carry the OLD hash format
// (scrypt, "<saltHex>:<hashHex>"). The owner must still be able to sign in with them, and changing the
// password moves the stored hashes to the new, cheaper format.
// Run: node --test worker/test/scenarios/admin-imported-credentials.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { startHarness } from '../harness/harness.mjs';
import { adminCookieFrom, adminLogin, adminPut } from '../harness/admin.mjs';

// See admin.test.mjs: the handler's uncancelled 2.5 s timer must not fire in the middle of these tests.
mock.timers.enable({ apis: ['setTimeout'] });

const h = await startHarness();

/** A hash as api/admin-config.js wrote it before the PBKDF2 format: scrypt with Node's default cost. */
const scryptHash = (secret) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(secret, salt, 64).toString('hex')}`;
};

const IMPORTED = { username: 'shopowner', password: 'Imported-Passw0rd', pin: '864209' };
await h.put('admin_credentials', 'singleton', {
  singleton: true,
  username: IMPORTED.username,
  password_hash: scryptHash(IMPORTED.password),
  pin_hash: scryptHash(IMPORTED.pin),
  require_pin: true,
  secret_path_slug: 'drdaina',
  allow_direct_admin_route: false,
  session_version: 7,
});

test('imported scrypt credentials sign the owner in; the bootstrap credentials from the environment do not', async () => {
  const bootstrap = await adminLogin(h);
  assert.equal(bootstrap.status, 401);
  assert.equal((await adminLogin(h, { ...IMPORTED, password: 'wrong' })).status, 401);
  assert.equal((await adminLogin(h, { ...IMPORTED, pin: '000000' })).status, 401);

  const login = await adminLogin(h, IMPORTED);
  assert.equal(login.status, 200, login.text);
  assert.equal(login.body.sessionVersion, 7);
  // Signing in does not rewrite the stored hashes
  assert.ok(!(await h.doc('admin_credentials', 'singleton')).password_hash.startsWith('pbkdf2'));
});

test('changing the password and PIN stores them in the new format; both then sign in', async () => {
  const cookie = adminCookieFrom(await adminLogin(h, IMPORTED));
  const changed = await adminPut(h, cookie, { securityConfig: { adminPassword: IMPORTED.password, securityPin: IMPORTED.pin, requirePin: true } });
  assert.equal(changed.status, 200, changed.text);
  const stored = await h.doc('admin_credentials', 'singleton');
  assert.match(stored.password_hash, /^pbkdf2-sha256\$5000\$/);
  assert.match(stored.pin_hash, /^pbkdf2-sha256\$5000\$/);
  assert.deepEqual([stored.username, stored.session_version], [IMPORTED.username, 8]);
  assert.equal((await adminLogin(h, IMPORTED)).status, 200);
});
