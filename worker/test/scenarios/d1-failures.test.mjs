// What the real handlers do when D1 itself fails: a dropped call during payment verification is repeated
// and the order is paid exactly once; a database that refuses work gives shoppers the "busy" answer and
// makes visitor counting step aside, as the handlers were written to do for Firestore's codes 14 and 8.
// Run: node --test worker/test/scenarios/d1-failures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { createOrder, lineOf, pickOutfit, sendRazorpayWebhook, verifyPayment } from '../harness/checkout.mjs';

const h = await startHarness();

const outfit = pickOutfit(h.exported('products'));
const BUYER = 'd1-failures@example.test';
await h.update('products', outfit.id, { stockQuantity: 5, inStock: true });

/**
 * Makes the Worker's next write batches fail with these D1 messages (reads keep working), then restores
 * the database. `afterCommit` loses only the answer: the batch itself goes through.
 */
const failWrites = async (messages, work, { afterCommit = false } = {}) => {
  const db = h.workerEnv.DB;
  const realBatch = db.batch;
  const left = [...messages];
  let failed = 0;
  db.batch = async (statements) => {
    const isWrite = !/^\s*SELECT/i.test(statements[0].statement.sql);
    if (!isWrite || left.length === 0) return realBatch(statements);
    if (afterCommit) await realBatch(statements);
    failed += 1;
    throw new Error(left.shift());
  };
  try {
    return { result: await work(), failed };
  } finally {
    db.batch = realBatch;
  }
};

const newOrder = async () => {
  const created = await createOrder(h, { email: BUYER, items: [lineOf(outfit, 1)] });
  assert.equal(created.status, 200, created.text);
  const { orderNumber, razorpayOrderId } = created.body;
  return { orderNumber, razorpayOrderId, paymentId: `pay_${orderNumber.replace(/-/g, '')}` };
};
const stock = async () => (await h.doc('products', outfit.id)).stockQuantity;
const purchases = async () => Number((await h.doc('daily_analytics', h.today()))?.purchases) || 0;
const confirmations = (orderNumber) => h.mail.filter((mail) => mail.subject === `Order ${orderNumber} confirmed — payment received`);

test('verify: a dropped D1 call is repeated; the order is paid, stock and the purchase counter move once', async () => {
  const order = await newOrder();
  const [stockBefore, purchasesBefore] = [await stock(), await purchases()];
  const { result, failed } = await failWrites(['D1_ERROR: Network connection lost.'], () => verifyPayment(h, order));
  assert.equal(failed, 1);
  assert.equal(result.status, 200, result.text);
  assert.equal((await h.doc('orders', order.orderNumber)).paymentStatus, 'Paid');
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(await purchases(), purchasesBefore + 1);
  assert.equal(confirmations(order.orderNumber).length, 1);
});

test('verify: when the lost call had in fact committed, nothing is applied twice', async () => {
  const order = await newOrder();
  const [stockBefore, purchasesBefore] = [await stock(), await purchases()];
  const { result } = await failWrites(['D1_ERROR: Network connection lost.'], () => verifyPayment(h, order), { afterCommit: true });
  assert.equal(result.status, 200, result.text);
  assert.equal((await h.doc('orders', order.orderNumber)).paymentStatus, 'Paid');
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(await purchases(), purchasesBefore + 1);
});

test('verify: a database that refuses work answers "busy" without claiming that no money was taken; the webhook then completes the order', async () => {
  const order = await newOrder();
  const stockBefore = await stock();
  const { result } = await failWrites(Array(3).fill('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'), () => verifyPayment(h, order));
  assert.equal(result.status, 503, result.text);
  assert.match(result.body.error, /do not pay again/);
  assert.doesNotMatch(result.body.error, /No money has been taken/);
  assert.equal((await h.doc('orders', order.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal(await stock(), stockBefore);

  const webhook = await sendRazorpayWebhook(h, {
    event: 'payment.captured',
    payload: { payment: { entity: { id: order.paymentId, order_id: order.razorpayOrderId, status: 'captured', notes: { order_number: order.orderNumber } } } },
  });
  assert.equal(webhook.status, 200, webhook.text);
  assert.equal((await h.doc('orders', order.orderNumber)).paymentStatus, 'Paid');
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(confirmations(order.orderNumber).length, 1);
});

test('create: the same refusal before payment keeps the "no money has been taken" answer', async () => {
  const { result } = await failWrites(Array(3).fill('D1_ERROR: D1 DB is overloaded. Too many requests queued.'), () => createOrder(h, { email: BUYER, items: [lineOf(outfit, 1)] }));
  assert.equal(result.status, 503, result.text);
  assert.match(result.body.error, /No money has been taken/);
});

test('tracking: a database that refuses work pauses visitor counting instead of failing or retrying', async () => {
  const visit = () => h.post('/api/track', { event: 'visit', visitorId: 'vis_d1_failures_1', path: '/' }, { ip: h.nextIp() });
  const { result, failed } = await failWrites(Array(3).fill('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'), visit);
  assert.deepEqual([result.status, result.body], [200, { ok: true, counted: false, paused: true }]);
  assert.equal(failed, 1);
  // paused for the rest of the minute: the next visitor does not reach the database at all
  const next = await visit();
  assert.deepEqual([next.body, next.d1Calls], [{ ok: true, counted: false, paused: true }, 0]);
  assert.equal(await h.doc('visitor_sessions', 'vis_d1_failures_1'), null);
});
