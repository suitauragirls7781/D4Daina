// A caller that goes away (closed tab, Razorpay's 5-second webhook timeout) must not cut a request short:
// Workers cancels request work that ctx.waitUntil does not hold, and the handlers send the confirmation
// emails only after the payment is marked Paid. A local run cannot drop the connection, so this checks the
// contract instead: the whole request is handed to waitUntil at once, and that promise ends only when the
// handler's last write is in.
// Run: node --test worker/test/scenarios/disconnect.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, SITE, BROWSER_UA } from '../harness/harness.mjs';

const h = await startHarness();

/** Starts a request and returns what the Worker handed to waitUntil before its first pause. */
const start = (path, body, headers = {}) => {
  const held = [];
  const request = new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'user-agent': BROWSER_UA, 'cf-connecting-ip': h.nextIp(), ...headers },
    body: JSON.stringify(body),
  });
  const answer = h.worker.fetch(request, h.workerEnv, { waitUntil: (promise) => { held.push(promise); }, passThroughOnException() {} });
  return { held: [...held], answer };
};

test('an api/** request is held by waitUntil until the handler has finished', async () => {
  const { held, answer } = start('/api/track', { event: 'visit', visitorId: 'vis_disconnect_1', path: '/' });
  assert.equal(held.length, 1);
  assert.equal(await h.doc('visitor_sessions', 'vis_disconnect_1'), null);
  // nobody reads the answer: the held promise alone carries the request to its end
  await held[0];
  // the session record is the last thing the handler writes, after its counting transaction
  assert.equal((await h.doc('visitor_sessions', 'vis_disconnect_1')).visitCount, 1);
  assert.equal((await answer).status, 200);
});

test('an /api/db request is held the same way', async () => {
  const { held, answer } = start('/api/db', { ops: [{ op: 'set', path: 'abandoned_checkouts/disconnect-1', data: { firstName: 'A' }, merge: true }] });
  assert.equal(held.length, 1);
  await held[0];
  assert.deepEqual(await h.doc('abandoned_checkouts', 'disconnect-1'), { firstName: 'A' });
  assert.deepEqual((await (await answer).json()).results, [{ ok: true }]);
});

test('the held promise never rejects, whatever the handler does', async () => {
  const { held, answer } = start('/api/orders', { action: 'no-such-action' });
  assert.equal(held.length, 1);
  await assert.doesNotReject(held[0]);
  assert.ok((await answer).status >= 400);
});
