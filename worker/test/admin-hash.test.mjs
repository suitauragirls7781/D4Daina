// Admin password / PIN hashing in api/admin-config.js: the new PBKDF2 format and the old scrypt format.
// Run: node --test worker/test/admin-hash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';

process.env.ADMIN_SESSION_SECRET = 'test-only-session-secret';
const { hashSecret, verifySecret } = await import('../../api/admin-config.js');

// Exactly what hashSecret produced before the change (what is stored in admin_credentials today)
const legacyScryptHash = (value) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(value, salt, 64).toString('hex')}`;
};

test('new hashes use the prefixed PBKDF2 format with a random salt', () => {
  const first = hashSecret('S3cure-Passw0rd');
  const second = hashSecret('S3cure-Passw0rd');
  assert.match(first, /^pbkdf2-sha256\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('a new hash verifies the right secret and rejects wrong ones', () => {
  const password = hashSecret('S3cure-Passw0rd');
  const pin = hashSecret('482913');
  assert.equal(verifySecret('S3cure-Passw0rd', password), true);
  assert.equal(verifySecret('482913', pin), true);
  assert.equal(verifySecret('S3cure-Passw0rd ', password), false);
  assert.equal(verifySecret('482914', pin), false);
  assert.equal(verifySecret('482913', password), false);
});

test('an old scrypt hash still verifies, and still rejects wrong secrets', () => {
  const stored = legacyScryptHash('old-admin-password');
  assert.equal(verifySecret('old-admin-password', stored), true);
  assert.equal(verifySecret('old-admin-passwore', stored), false);
});

test('empty, missing or malformed input never verifies', () => {
  const stored = hashSecret('S3cure-Passw0rd');
  const [scheme, iterations, salt, hash] = stored.split('$');
  assert.equal(verifySecret('', stored), false);
  assert.equal(verifySecret(undefined, stored), false);
  assert.equal(verifySecret(123456, hashSecret('123456')), false);
  assert.equal(verifySecret('S3cure-Passw0rd', ''), false);
  assert.equal(verifySecret('S3cure-Passw0rd', undefined), false);
  assert.equal(verifySecret('S3cure-Passw0rd', 'not-a-hash'), false);
  assert.equal(verifySecret('S3cure-Passw0rd', `${scheme}$0$${salt}$${hash}`), false);
  assert.equal(verifySecret('S3cure-Passw0rd', `${scheme}$${iterations}$${salt}$`), false);
  assert.equal(verifySecret('S3cure-Passw0rd', `${scheme}$${iterations}$${salt}$${hash.slice(0, 32)}`), false);
  assert.equal(verifySecret('S3cure-Passw0rd', `${scheme}$${Number(iterations) + 1}$${salt}$${hash}`), false);
});

test('the hash depends on ADMIN_SESSION_SECRET (pepper), and a missing secret is a config error', () => {
  const stored = hashSecret('S3cure-Passw0rd');
  process.env.ADMIN_SESSION_SECRET = 'another-secret';
  assert.equal(verifySecret('S3cure-Passw0rd', stored), false);
  delete process.env.ADMIN_SESSION_SECRET;
  assert.throws(() => hashSecret('S3cure-Passw0rd'), /SERVER_CONFIG_MISSING/);
  assert.throws(() => verifySecret('S3cure-Passw0rd', stored), /SERVER_CONFIG_MISSING/);
  process.env.ADMIN_SESSION_SECRET = 'test-only-session-secret';
  assert.equal(verifySecret('S3cure-Passw0rd', stored), true);
});

test('a new-format hash costs a small fraction of the old scrypt one', () => {
  const cpuMs = (fn) => {
    const start = process.cpuUsage();
    for (let i = 0; i < 10; i += 1) fn();
    const used = process.cpuUsage(start);
    return (used.user + used.system) / 1000 / 10;
  };
  const fresh = hashSecret('S3cure-Passw0rd');
  const legacy = legacyScryptHash('S3cure-Passw0rd');
  const freshMs = cpuMs(() => verifySecret('S3cure-Passw0rd', fresh));
  const legacyMs = cpuMs(() => verifySecret('S3cure-Passw0rd', legacy));
  assert.ok(freshMs < legacyMs / 5, `pbkdf2 ${freshMs.toFixed(2)} ms vs scrypt ${legacyMs.toFixed(2)} ms`);
});
