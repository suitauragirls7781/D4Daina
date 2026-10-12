// A payment that fails or is closed in the payment window is noted on the unpaid order ("pay-note"), so the
// store can see why orders stay unpaid. Only the browser that made the order (its attempt key) can add a note,
// a paid order takes none, and the note never changes what the order is.
// Run: node --test worker/test/scenarios/pay-note.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { createOrder, lineOf, newAttemptKey, pickOutfit, verifyPayment } from '../harness/checkout.mjs';

const h = await startHarness();
const outfit = pickOutfit(h.exported('products'));
await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), minOrderAmount: 0, maxOrderAmount: 0 });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 40, inStock: true });

const note = (body) => h.post('/api/orders', { action: 'pay-note', ...body });

test('a failed and a closed payment are noted on the unpaid order, and only with its attempt key', async () => {
  const attemptKey = newAttemptKey();
  const created = await createOrder(h, { email: 'note.shopper@gmail.com', items: [lineOf(outfit, 1)], attemptKey });
  assert.equal(created.status, 200, created.text);
  const { orderNumber, razorpayOrderId } = created.body;

  const failed = await note({ orderNumber, attemptKey, kind: 'failed', code: 'BAD_REQUEST_ERROR', reason: 'Payment was unsuccessful as the UPI app did not respond.', step: 'payment_authorization', source: 'customer', method: 'prepaid · google_pay', browser: 'Instagram app' });
  assert.deepEqual(failed.body, { ok: true });
  const closed = await note({ orderNumber, attemptKey, kind: 'closed', method: 'prepaid', browser: 'Instagram app' });
  assert.deepEqual(closed.body, { ok: true });

  // Someone who only knows the order number adds nothing
  assert.deepEqual((await note({ orderNumber, attemptKey: newAttemptKey(), kind: 'failed', reason: 'made up' })).body, { ok: false });
  assert.deepEqual((await note({ orderNumber, kind: 'failed', reason: 'no key' })).body, { ok: false });

  const saved = await h.doc('orders', orderNumber);
  assert.equal(saved.payTries.length, 2);
  assert.deepEqual(saved.payTries.map((t) => t.kind), ['failed', 'closed']);
  assert.equal(saved.payTries[0].reason, 'Payment was unsuccessful as the UPI app did not respond.');
  assert.equal(saved.payTries[0].browser, 'Instagram app');
  assert.equal(saved.paymentStatus, 'Unpaid');
  assert.equal(saved.status, 'Pending');

  // The same order is then paid: it is confirmed as usual and takes no more notes
  const verified = await verifyPayment(h, { orderNumber, razorpayOrderId, paymentId: 'pay_NoteTest1' });
  assert.equal(verified.status, 200, verified.text);
  assert.deepEqual((await note({ orderNumber, attemptKey, kind: 'failed', reason: 'late' })).body, { ok: false });
  const paid = await h.doc('orders', orderNumber);
  assert.equal(paid.paymentStatus, 'Paid');
  assert.equal(paid.payTries.length, 2);
  // What the customer is shown never carries the notes
  assert.equal('payTries' in verified.body.order, false);
});

test('only the last ten notes are kept', async () => {
  const attemptKey = newAttemptKey();
  const created = await createOrder(h, { email: 'note.shopper2@gmail.com', items: [lineOf(outfit, 1)], attemptKey, address: { mobile: '9000000077' } });
  assert.equal(created.status, 200, created.text);
  for (let i = 1; i <= 12; i++) assert.deepEqual((await note({ orderNumber: created.body.orderNumber, attemptKey, kind: 'failed', reason: `try ${i}` })).body, { ok: true });
  const saved = await h.doc('orders', created.body.orderNumber);
  assert.equal(saved.payTries.length, 10);
  assert.equal(saved.payTries[0].reason, 'try 3');
  assert.equal(saved.payTries[9].reason, 'try 12');
});
