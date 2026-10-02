// api/admin-config.js gives each database read 2.5 seconds; after a timeout it trusts the signed cookie
// alone for a minute, without the "signed out everywhere" check. That must happen only when the database
// really was slow, not because time went by after a read that answered at once (a slow admin request:
// photo assistant, deleting many images).
// A file of its own: the handler remembers "database down" for a minute per process.
// Run: node --test worker/test/scenarios/admin-slow-request.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { signInAdmin } from '../harness/admin.mjs';

// Only setTimeout is under the test's control; Date keeps running, as the handler compares real time.
mock.timers.enable({ apis: ['setTimeout'] });

const h = await startHarness();
const session = (cookie) => h.call('/api/admin-config?action=session', { cookie });

test('time passing after a quick database read does not switch off the "signed out everywhere" check', async () => {
  const { cookie } = await signInAdmin(h);
  assert.equal((await session(cookie)).status, 200);

  // the rest of a slow request: more than the 2.5 seconds the read was given
  mock.timers.tick(3000);

  // the owner changes the password on another device: every older session must stop working at once
  const credentials = await h.doc('admin_credentials', 'singleton');
  await h.update('admin_credentials', 'singleton', { session_version: credentials.session_version + 1 });
  const stale = await session(cookie);
  assert.equal(stale.status, 401, stale.text);

  // and sign-in still counts attempts in the database, not in the per-process fallback
  const address = h.nextIp();
  const again = await h.post('/api/admin-config?action=login', { username: h.env.ADMIN_INITIAL_USERNAME, password: 'wrong', pin: '000000' }, { ip: address });
  assert.equal(again.status, 401);
  assert.equal((await h.doc('rate_limits', `admin_login:${address}`)).count, 1);
});
