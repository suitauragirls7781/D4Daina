// The store cancels a paid order and says why; the order then waits for its refund and is marked refunded.
// The reason and the refund reference are for the store only: the customer's view never carries them.
// Run: node --test worker/test/scenarios/cancel-refund.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { lineOf, pickOutfit, placePaidOrder } from '../harness/checkout.mjs';

const h = await startHarness();
const outfit = pickOutfit(h.exported('products').filter((row) => !['kids', 'toy'].includes(row.data.productType) && !['Baby Girls', 'Baby Boys', 'Toys'].includes(row.data.category)));
await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), minOrderAmount: 0, maxOrderAmount: 0 });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 40, inStock: true });

const EMAIL = 'cancel.refund@gmail.com';
const admin = async (body) => h.post('/api/orders', { action: 'admin-update', ...body }, { token: await h.adminToken() });
const stockOf = async () => (await h.doc('products', outfit.id)).stockQuantity;

test('cancelling a paid order keeps the reason, who and when; the stock goes back once', async () => {
  const before = await stockOf();
  const orderNumber = await placePaidOrder(h, { email: EMAIL, items: [lineOf(outfit, 2)] });
  assert.equal(await stockOf(), before - 2);

  const cancelled = await admin({ orderNumber, status: 'Cancelled', cancelReason: 'Out of stock' });
  assert.equal(cancelled.status, 200, cancelled.text);
  const saved = await h.doc('orders', orderNumber);
  assert.equal(saved.status, 'Cancelled');
  assert.equal(saved.paymentStatus, 'Paid', 'the money is still with the store until it is refunded');
  assert.equal(saved.cancelReason, 'Out of stock');
  assert.equal(saved.cancelledBy, 'store');
  assert.ok(Date.parse(saved.cancelledAt) > 0);
  assert.equal(await stockOf(), before);
  // The reason is never in what the customer is shown
  assert.ok(!JSON.stringify(saved.timeline).includes('Out of stock'));
  const mine = await h.post('/api/orders', { action: 'my-orders' }, { token: await h.customerToken(EMAIL) });
  assert.equal(mine.status, 200, mine.text);
  const shown = mine.body.orders.find((order) => order.orderNumber === orderNumber);
  assert.ok(shown);
  assert.ok(!mine.text.includes('Out of stock') && !('cancelReason' in shown) && !('cancelledBy' in shown));

  // Marked refunded afterwards, with the refund's reference: the stock is not added a second time
  const refunded = await admin({ orderNumber, status: 'Refunded', refundRef: 'rfnd_Test123' });
  assert.equal(refunded.status, 200, refunded.text);
  const after = await h.doc('orders', orderNumber);
  assert.equal(after.status, 'Refunded');
  assert.equal(after.paymentStatus, 'Refunded');
  assert.equal(after.refundRef, 'rfnd_Test123');
  assert.ok(Date.parse(after.refundedAt) > 0);
  assert.equal(after.cancelReason, 'Out of stock', 'the reason stays on the order');
  assert.equal(await stockOf(), before);
  const again = await h.post('/api/orders', { action: 'my-orders' }, { token: await h.customerToken(EMAIL) });
  assert.ok(!again.text.includes('rfnd_Test123'));
});

test('a cancellation the customer asked for is marked as such; a cancel without a reason still works', async () => {
  const asked = await placePaidOrder(h, { email: EMAIL, items: [lineOf(outfit, 1)], address: { mobile: '9000000051' } });
  const request = await h.post('/api/orders', { action: 'request-cancel', orderNumber: asked, reason: 'Ordered by mistake' }, { token: await h.customerToken(EMAIL) });
  assert.equal(request.status, 200, request.text);
  assert.equal((await admin({ orderNumber: asked, status: 'Cancelled', cancelReason: 'Customer asked to cancel: Ordered by mistake' })).status, 200);
  const first = await h.doc('orders', asked);
  assert.equal(first.cancelledBy, 'customer request');
  assert.equal(first.cancelReason, 'Customer asked to cancel: Ordered by mistake');

  const plain = await placePaidOrder(h, { email: EMAIL, items: [lineOf(outfit, 1)], address: { mobile: '9000000052' } });
  assert.equal((await admin({ orderNumber: plain, status: 'Cancelled' })).status, 200);
  const second = await h.doc('orders', plain);
  assert.equal(second.cancelledBy, 'store');
  assert.equal(second.cancelReason, undefined);
  assert.ok(Date.parse(second.cancelledAt) > 0);
});

test('only the admin can cancel or refund, and a very long reason is cut', async () => {
  const orderNumber = await placePaidOrder(h, { email: EMAIL, items: [lineOf(outfit, 1)], address: { mobile: '9000000053' } });
  const stranger = await h.post('/api/orders', { action: 'admin-update', orderNumber, status: 'Cancelled', cancelReason: 'x' });
  assert.equal(stranger.status, 401);
  const customer = await h.post('/api/orders', { action: 'admin-update', orderNumber, status: 'Refunded' }, { token: await h.customerToken(EMAIL) });
  assert.equal(customer.status, 401);
  assert.equal((await h.doc('orders', orderNumber)).status, 'Processing');
  assert.equal((await admin({ orderNumber, status: 'Cancelled', cancelReason: 'r'.repeat(500) })).status, 200);
  assert.equal((await h.doc('orders', orderNumber)).cancelReason.length, 160);
});
