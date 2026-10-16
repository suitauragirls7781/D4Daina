// Scenario 7: what happens to an order after checkout. Payment result and "pay again", order tracking,
// the customer's own order list, cancellation requests, returns / exchanges and the admin's side of them.
// Run: node --test worker/test/scenarios/orders-account.test.mjs
import test from 'node:test';
import { readMediaGrant } from '../../../api/_lib/media.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startHarness } from '../harness/harness.mjs';
import { createOrder, lineOf, pickOutfit, placePaidOrder, verifyPayment } from '../harness/checkout.mjs';

const h = await startHarness();

const STORE_EMAIL = 'owner@store.example';
const ASHA = 'asha@example.test';
const MEERA = 'meera@example.test';
const outfit = pickOutfit(h.exported('products'));
const clearance = pickOutfit(h.exported('products'), 1);

await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), storeEmail: STORE_EMAIL, minOrderAmount: 0, maxOrderAmount: 0, cancellationWindowHours: 0 });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 40, inStock: true });
// Sold at half its original price: a "final clearance" piece (exchange only)
await h.update('products', clearance.id, { stockQuantity: 40, inStock: true, originalPrice: Math.round(Number(clearance.data.price)) * 2 });

const ashaToken = await h.customerToken(ASHA);
const meeraToken = await h.customerToken(MEERA);
const adminToken = await h.adminToken();

const orders = (body, options) => h.post('/api/orders', body, options);
const stock = async (product = outfit) => (await h.doc('products', product.id)).stockQuantity;
const mailsTo = (address, subject) => h.mailTo(address).filter((mail) => mail.subject.includes(subject));
const adminUpdate = (orderNumber, changes) => orders({ action: 'admin-update', orderNumber, ...changes }, { token: adminToken });
const adminReturn = (orderNumber, returnAction, extra = {}) => orders({ action: 'admin-return', orderNumber, returnAction, ...extra }, { token: adminToken });
const paidOrder = (email, items, options = {}) => placePaidOrder(h, { email, items, ...options });
const deliveredOrder = async (email, items, options) => {
  const orderNumber = await paidOrder(email, items, options);
  const delivered = await adminUpdate(orderNumber, { status: 'Delivered', notify: false });
  assert.equal(delivered.status, 200, delivered.text);
  return orderNumber;
};
const returnRequest = (orderNumber, token, form) => orders({ action: 'return-request', orderNumber, ...form }, { token });
const FITS_BADLY = { type: 'return', reason: "Size doesn't fit", details: '', photos: [] };
// A customer may send 10 return requests an hour and sign 24 photos. The tests below send more than that
// as one customer, so each starts with those counters cleared ("an hour later").
const anHourLater = async () => {
  for (const row of await h.docs('rate_limits')) {
    if (row.id.startsWith('return')) await h.remove('rate_limits', row.id);
  }
};

// ---- the customer's order list ----

test('my-orders: only the signed-in customer\'s orders, newest first, with old unpaid ones hidden', async () => {
  const first = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  const second = await paidOrder(ASHA, [lineOf(outfit, 2)]);
  const unpaid = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] })).body.orderNumber;
  const abandoned = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] })).body.orderNumber;
  await h.update('orders', abandoned, { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() });
  const meeras = await paidOrder(MEERA, [lineOf(outfit, 1)], { address: { mobile: '9000000001' } });

  const response = await orders({ action: 'my-orders' }, { token: ashaToken });
  assert.equal(response.status, 200, response.text);
  const numbers = response.body.orders.map((order) => order.orderNumber);
  assert.deepEqual([...numbers].sort(), [first, second, unpaid].sort());
  assert.ok(response.body.orders.every((order) => order.customerEmail === ASHA));
  assert.deepEqual(response.body.orders.map((order) => order.date), response.body.orders.map((order) => order.date).sort().reverse());
  // The exported customers' orders are in the database and none of them is in this answer
  assert.ok((await h.docs('orders')).length > numbers.length + 2);
  assert.ok(!numbers.includes(meeras) && !numbers.includes(abandoned));

  // The owner's view: the address in full, the phone number masked
  const view = response.body.orders.find((order) => order.orderNumber === first);
  assert.equal(view.deliveryAddress.houseFlat, '12 Test Lane');
  assert.equal(view.customerMobile, '••••••3210');
  assert.equal(view.returnEligibility.canRequest, false);

  const meera = await orders({ action: 'my-orders' }, { token: meeraToken });
  assert.deepEqual(meera.body.orders.map((order) => order.orderNumber), [meeras]);
  assert.equal((await orders({ action: 'my-orders' })).status, 401);
  assert.equal((await orders({ action: 'my-orders' }, { token: adminToken })).status, 401);
});

// ---- tracking ----

test('track: a guest needs the order number plus the email or phone, and never sees the address or contact details', async () => {
  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  const track = (body, options = {}) => orders({ action: 'track', orderNumber, ...body }, { ip: h.nextIp(), ...options });

  for (const contact of ['Asha@Example.test', '+91 98765 43210', '9876543210']) {
    const response = await track({ contact });
    assert.equal(response.status, 200, contact);
    const view = response.body.order;
    assert.equal(view.orderNumber, orderNumber);
    assert.equal(view.paymentStatus, 'Paid');
    assert.equal(view.items[0].product.id, outfit.id);
    for (const hidden of ['deliveryAddress', 'customerEmail', 'customerMobile', 'customerName', 'paymentRef', 'returnEligibility']) assert.equal(view[hidden], undefined, hidden);
    assert.ok(!response.text.includes('Test Lane') && !response.text.includes('9876543210') && !response.text.toLowerCase().includes(ASHA));
    assert.ok(view.timeline.every((entry) => Object.keys(entry).sort().join() === 'at,status'));
  }
  const lowerCase = await orders({ action: 'track', orderNumber: orderNumber.toLowerCase(), contact: ASHA }, { ip: h.nextIp() });
  assert.equal(lowerCase.status, 200);

  for (const contact of ['', 'someone@else.test', '9876543211', '43210']) {
    const response = await track({ contact });
    assert.equal(response.status, 404, `contact "${contact}"`);
  }
  assert.equal((await orders({ action: 'track', orderNumber: 'SAG-000000-AAAAA', contact: ASHA }, { ip: h.nextIp() })).status, 404);
  assert.equal((await orders({ action: 'track', contact: ASHA }, { ip: h.nextIp() })).status, 400);

  // Signed in: the owner sees everything; another customer needs the contact and still gets the short view
  const owner = await track({}, { token: ashaToken });
  assert.equal(owner.body.order.deliveryAddress.houseFlat, '12 Test Lane');
  assert.equal(typeof owner.body.order.returnEligibility.canRequest, 'boolean');
  assert.equal((await track({}, { token: meeraToken })).status, 404);
  const other = await track({ contact: ASHA }, { token: meeraToken });
  assert.equal(other.body.order.deliveryAddress, undefined);
  // The admin browsing the storefront: the full order, without the customer's own actions
  const admin = await track({}, { token: adminToken });
  assert.equal(admin.body.order.deliveryAddress.houseFlat, '12 Test Lane');
  assert.equal(admin.body.order.returnEligibility, undefined);
});

test('track: at most 30 lookups in 10 minutes from one address', async () => {
  const ip = h.nextIp();
  for (let index = 1; index <= 30; index += 1) {
    const response = await orders({ action: 'track', orderNumber: 'SAG-000000-AAAAA', contact: 'x@example.test' }, { ip });
    assert.equal(response.status, 404, `lookup ${index}`);
  }
  const blocked = await orders({ action: 'track', orderNumber: 'SAG-000000-AAAAA', contact: 'x@example.test' }, { ip });
  assert.equal(blocked.status, 429);
});

// ---- payment result and pay again ----

test('payment-result: asks Razorpay about an unpaid order and finalises a payment whose browser never came back', async () => {
  const created = await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] });
  const { orderNumber, razorpayOrderId } = created.body;
  const result = (options) => orders({ action: 'payment-result', orderNumber }, options);

  assert.equal((await result({})).status, 401);
  assert.equal((await result({ token: meeraToken })).status, 404);

  // Razorpay knows of no captured payment yet
  h.services.razorpayPayments[razorpayOrderId] = [{ id: 'pay_Attempt001', status: 'failed' }];
  const pending = await result({ token: ashaToken });
  assert.equal(pending.status, 200, pending.text);
  assert.deepEqual([pending.body.paid, pending.body.gatewayNote], [false, '']);
  assert.equal((await h.doc('orders', orderNumber)).paymentStatus, 'Unpaid');

  // The payment was captured after all
  const stockBefore = await stock();
  h.services.razorpayPayments[razorpayOrderId] = [{ id: 'pay_Attempt001', status: 'failed' }, { id: 'pay_Captured01', status: 'captured' }];
  const paid = await result({ token: ashaToken });
  assert.equal(paid.body.paid, true);
  assert.equal(paid.body.order.paymentRef, 'pay_Captured01');
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.paymentStatus, stored.paidVia, stored.paymentRef], ['Paid', 'reconcile', 'pay_Captured01']);
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(mailsTo(ASHA, `Order ${orderNumber} confirmed`).length, 1);

  // Asking again does not ask Razorpay again and changes nothing
  const razorpayCalls = h.net.calls.length;
  const again = await result({ token: ashaToken });
  assert.equal(again.body.paid, true);
  assert.equal(h.net.calls.length, razorpayCalls);
  assert.equal(await stock(), stockBefore - 1);
});

test('pay-again: the same order gets a new Razorpay order; a payment on the old or the new one pays it once', async () => {
  const created = await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] });
  const { orderNumber, razorpayOrderId: firstId } = created.body;
  const payAgain = (options) => orders({ action: 'pay-again', orderNumber }, { ip: h.nextIp(), ...options });

  assert.equal((await payAgain({})).status, 401);
  assert.equal((await payAgain({ token: meeraToken })).status, 404);

  const retry = await payAgain({ token: ashaToken });
  assert.equal(retry.status, 200, retry.text);
  assert.equal(retry.body.orderNumber, orderNumber);
  assert.notEqual(retry.body.razorpayOrderId, firstId);
  assert.equal(retry.body.amount, created.body.amount);
  assert.equal(h.services.razorpayOrders.at(-1).receipt, orderNumber);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.razorpayOrderId, stored.razorpayOrderIds], [retry.body.razorpayOrderId, [firstId, retry.body.razorpayOrderId]]);

  // The customer completed the FIRST payment window: still this order's payment
  const stockBefore = await stock();
  const paid = await verifyPayment(h, { orderNumber, razorpayOrderId: firstId, paymentId: 'pay_FirstWindow' });
  assert.equal(paid.status, 200, paid.text);
  assert.equal((await h.doc('orders', orderNumber)).paymentStatus, 'Paid');
  // ... and the second window being paid as well is recorded once only (the owner refunds the double charge by hand)
  const second = await verifyPayment(h, { orderNumber, razorpayOrderId: retry.body.razorpayOrderId, paymentId: 'pay_SecondWindow' });
  assert.equal(second.status, 200);
  assert.equal((await h.doc('orders', orderNumber)).paymentRef, 'pay_FirstWindow');
  assert.equal(await stock(), stockBefore - 1);

  const done = await payAgain({ token: ashaToken });
  assert.equal(done.body.alreadyPaid, true);
});

test('pay-again: an order that was cancelled or is older than three days cannot be paid any more', async () => {
  const cancelled = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] })).body.orderNumber;
  assert.equal((await adminUpdate(cancelled, { status: 'Cancelled', notify: false })).status, 200);
  const old = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] })).body.orderNumber;
  await h.update('orders', old, { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() });
  const razorpayOrdersBefore = h.services.razorpayOrders.length;
  for (const orderNumber of [cancelled, old]) {
    const response = await orders({ action: 'pay-again', orderNumber }, { token: ashaToken, ip: h.nextIp() });
    assert.equal(response.status, 409, orderNumber);
  }
  assert.equal(h.services.razorpayOrders.length, razorpayOrdersBefore);
});

// ---- cancellation ----

test('request-cancel: the owner of a paid order asks, the store is emailed, and cancelling puts the stock back', async () => {
  const stockBefore = await stock();
  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 2)]);
  assert.equal(await stock(), stockBefore - 2);
  const cancel = (body, options) => orders({ action: 'request-cancel', orderNumber, ...body }, options);

  assert.equal((await cancel({ reason: 'Ordered by mistake' }, {})).status, 401);
  assert.equal((await cancel({ reason: 'Ordered by mistake' }, { token: meeraToken })).status, 404);
  assert.equal((await cancel({ reason: '' }, { token: ashaToken })).status, 400);

  const asked = await cancel({ reason: 'Ordered by mistake' }, { token: ashaToken });
  assert.equal(asked.status, 200, asked.text);
  assert.equal(asked.body.order.cancelRequest.reason, 'Ordered by mistake');
  let stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.cancelRequest.reason, stored.cancelRequest.storeNotified, stored.status], ['Ordered by mistake', true, 'Processing']);
  assert.equal(stored.timeline.at(-1).status, 'Cancellation requested');
  assert.equal(mailsTo(STORE_EMAIL, `Cancellation requested: order ${orderNumber}`).length, 1);
  assert.equal((await cancel({ reason: 'Asking twice' }, { token: ashaToken })).status, 409);
  // Nothing is cancelled or refunded by the request itself
  assert.equal(await stock(), stockBefore - 2);

  const cancelled = await adminUpdate(orderNumber, { status: 'Cancelled' });
  assert.equal(cancelled.status, 200, cancelled.text);
  stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.stockDeducted, stored.deductedQuantities, stored.cancelRequest.outcome], ['Cancelled', false, {}, 'cancelled']);
  assert.equal(await stock(), stockBefore);
  assert.equal(mailsTo(ASHA, `Order ${orderNumber} cancelled`).length, 1);

  // Saving "Cancelled" again does not add the stock a second time
  await adminUpdate(orderNumber, { status: 'Cancelled', notes: 'refunded in Razorpay' });
  await adminUpdate(orderNumber, { status: 'Refunded', notify: false });
  assert.equal(await stock(), stockBefore);
});

test('request-cancel: an unpaid order cannot be cancelled this way; "keep order" closes the request and tells the customer', async () => {
  const unpaid = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] })).body.orderNumber;
  const refused = await orders({ action: 'request-cancel', orderNumber: unpaid, reason: 'Changed my mind' }, { token: ashaToken });
  assert.equal(refused.status, 409);

  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  await orders({ action: 'request-cancel', orderNumber, reason: 'Changed my mind' }, { token: ashaToken });
  const kept = await adminUpdate(orderNumber, { cancelRequestHandled: true, customerNote: 'Already packed for you' });
  assert.equal(kept.status, 200, kept.text);
  assert.equal(kept.body.cancelKeptEmailSent, true);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.cancelRequest.outcome, stored.stockDeducted], ['Processing', 'kept', true]);
  assert.equal(mailsTo(ASHA, `Update on your cancellation request for order ${orderNumber}`).length, 1);
});

test('request-cancel: allowed on a packed order, refused once it is shipped; cancelling the packed order puts the stock back', async () => {
  const stockBefore = await stock();
  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 2)]);
  assert.equal((await adminUpdate(orderNumber, { status: 'Packed', notify: false })).status, 200);
  assert.equal(await stock(), stockBefore - 2);

  const asked = await orders({ action: 'request-cancel', orderNumber, reason: 'Ordered the wrong size' }, { token: ashaToken });
  assert.equal(asked.status, 200, asked.text);
  let stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.cancelRequest.reason, stored.cancelRequest.handledAt], ['Packed', 'Ordered the wrong size', undefined]);
  assert.equal(mailsTo(STORE_EMAIL, `Cancellation requested: order ${orderNumber}`).length, 1);
  // A save that does not change the status (a note) leaves the request open
  await adminUpdate(orderNumber, { notes: 'will call the customer' });
  assert.equal((await h.doc('orders', orderNumber)).cancelRequest.handledAt, undefined);

  // The admin cancels the packed order: the request closes as cancelled and the stock comes back, once
  const cancelled = await adminUpdate(orderNumber, { status: 'Cancelled' });
  assert.equal(cancelled.status, 200, cancelled.text);
  stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.stockDeducted, stored.deductedQuantities, stored.cancelRequest.outcome], ['Cancelled', false, {}, 'cancelled']);
  assert.ok(stored.cancelRequest.handledAt);
  assert.equal(await stock(), stockBefore);
  assert.equal(mailsTo(ASHA, `Order ${orderNumber} cancelled`).length, 1);
  await adminUpdate(orderNumber, { status: 'Cancelled', notes: 'refunded in Razorpay' });
  assert.equal(await stock(), stockBefore);

  // Once the order is with the courier the customer can no longer ask
  const shipped = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  assert.equal((await adminUpdate(shipped, { status: 'Shipped', notify: false })).status, 200);
  const refused = await orders({ action: 'request-cancel', orderNumber: shipped, reason: 'Changed my mind' }, { token: ashaToken });
  assert.equal(refused.status, 409, refused.text);
  assert.match(refused.body.error, /already been shipped/);
  assert.equal((await h.doc('orders', shipped)).cancelRequest, undefined);
});

test('request-cancel: packing an order keeps its request open; shipping it closes the request as "order kept" and tells the customer', async () => {
  const stockBefore = await stock();
  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  const asked = await orders({ action: 'request-cancel', orderNumber, reason: 'Changed my mind' }, { token: ashaToken });
  assert.equal(asked.status, 200, asked.text);

  assert.equal((await adminUpdate(orderNumber, { status: 'Packed', notify: false })).status, 200);
  let stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.cancelRequest.handledAt, stored.cancelRequest.outcome], ['Packed', undefined, undefined]);

  const shipped = await adminUpdate(orderNumber, { status: 'Shipped' });
  assert.equal(shipped.status, 200, shipped.text);
  assert.equal(shipped.body.cancelKeptEmailSent, true);
  stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.cancelRequest.outcome, stored.stockDeducted], ['Shipped', 'kept', true]);
  assert.ok(stored.cancelRequest.handledAt);
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(mailsTo(ASHA, `Update on your cancellation request for order ${orderNumber}`).length, 1);
});

// ---- the admin's order updates ----

test('admin-update: admin only; statuses, tracking links and dates are checked; a status change emails the customer', async () => {
  const orderNumber = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  for (const token of [undefined, ashaToken]) {
    const response = await orders({ action: 'admin-update', orderNumber, status: 'Shipped' }, { token });
    assert.equal(response.status, 401);
  }
  assert.equal((await adminUpdate(orderNumber, { status: 'Teleported' })).status, 400);
  assert.equal((await adminUpdate(orderNumber, { trackingUrl: 'http://courier.example/track/1' })).status, 400);
  assert.equal((await adminUpdate(orderNumber, { expectedDeliveryDate: '2026-02-31' })).status, 400);
  assert.equal((await adminUpdate('SAG-000000-AAAAA', { status: 'Shipped' })).status, 404);
  assert.equal((await h.doc('orders', orderNumber)).status, 'Processing');

  const shipped = await adminUpdate(orderNumber, { status: 'Shipped', courierPartner: 'Delhivery', trackingNumber: 'DL123', trackingUrl: 'https://courier.example/track/DL123', expectedDeliveryDate: '2026-12-05' });
  assert.equal(shipped.status, 200, shipped.text);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual(
    [stored.status, stored.courierPartner, stored.trackingNumber, stored.trackingUrl, stored.expectedDeliveryDate],
    ['Shipped', 'Delhivery', 'DL123', 'https://courier.example/track/DL123', '2026-12-05'],
  );
  assert.equal(stored.timeline.at(-1).status, 'Shipped');
  assert.deepEqual(stored.emailLog.map((entry) => entry.kind), ['confirmed', 'Shipped']);
  const [mail] = mailsTo(ASHA, `Order ${orderNumber} has shipped`);
  assert.match(mail.html, /DL123/);
});

test('admin-update: marking an unpaid order paid by hand takes the stock exactly like a verified payment', async () => {
  const orderNumber = (await createOrder(h, { email: ASHA, items: [lineOf(outfit, 2)] })).body.orderNumber;
  const stockBefore = await stock();
  const marked = await adminUpdate(orderNumber, { paymentStatus: 'Paid', paymentRef: 'UPI-REF-1', notify: false });
  assert.equal(marked.status, 200, marked.text);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.paymentStatus, stored.status, stored.paidVia, stored.paymentRef, stored.deductedQuantities], ['Paid', 'Processing', 'admin', 'UPI-REF-1', { [outfit.id]: 2 }]);
  assert.equal(await stock(), stockBefore - 2);
  await adminUpdate(orderNumber, { paymentStatus: 'Paid', notify: false });
  assert.equal(await stock(), stockBefore - 2);
});

// ---- returns and exchanges ----

test('return-request: only the signed-in owner of a delivered order, within the return window', async () => {
  const notDelivered = await paidOrder(ASHA, [lineOf(outfit, 1)]);
  const early = await returnRequest(notDelivered, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] });
  assert.equal(early.status, 409);
  assert.match(early.body.error, /once the order has been delivered/);

  const orderNumber = await deliveredOrder(ASHA, [lineOf(outfit, 1)]);
  const form = { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] };
  assert.equal((await returnRequest(orderNumber, undefined, form)).status, 401);
  assert.equal((await returnRequest(orderNumber, meeraToken, form)).status, 404);
  assert.equal((await returnRequest(orderNumber, adminToken, form)).status, 401);

  const invalid = {
    'no type or reason given': { type: 'refund-me', items: [{ line: 0, qty: 1 }], reason: "Size doesn't fit" },
    'unknown reason': { ...form, reason: 'Just because' },
    'no items': { ...form, items: [] },
    'more pieces than bought': { ...form, items: [{ line: 0, qty: 2 }] },
    'a line that is not in the order': { ...form, items: [{ line: 3, qty: 1 }] },
    '"Other" without details': { ...form, reason: 'Other', details: '' },
    'damaged without a photo': { ...form, reason: 'Damaged / defective' },
    'a photo from somewhere else': { ...form, photos: ['https://evil.example/photo.jpg'] },
  };
  for (const [name, body] of Object.entries(invalid)) {
    const response = await returnRequest(orderNumber, ashaToken, body);
    assert.equal(response.status, 400, name);
  }
  assert.equal((await h.doc('orders', orderNumber)).returnRequest, undefined);

  // Delivered 47 days ago: the 45-day window has closed
  const stored = await h.doc('orders', orderNumber);
  const longAgo = new Date(Date.now() - 47 * 24 * 60 * 60 * 1000).toISOString();
  await h.update('orders', orderNumber, { timeline: stored.timeline.map((entry) => (entry.status === 'Delivered' ? { ...entry, at: longAgo } : entry)) });
  const late = await returnRequest(orderNumber, ashaToken, form);
  assert.equal(late.status, 409);
  assert.match(late.body.error, /45-day return \/ exchange window/);
  assert.equal(mailsTo(STORE_EMAIL, 'requested: order').filter((mail) => mail.subject.includes(orderNumber)).length, 0);

  // That was the customer's tenth request this hour: the eleventh is refused whatever it asks
  const eleventh = await returnRequest(orderNumber, ashaToken, form);
  assert.equal(eleventh.status, 429);
});

let twoPieces = '';

test('return: requested -> approved (needs a note) -> received -> refunded; one of two pieces returned leaves the order delivered', async () => {
  await anHourLater();
  twoPieces = await deliveredOrder(ASHA, [lineOf(outfit, 2)]);
  const stockBefore = await stock();

  const asked = await returnRequest(twoPieces, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] });
  assert.equal(asked.status, 200, asked.text);
  assert.match(asked.body.message, /return request has been sent/);
  let stored = await h.doc('orders', twoPieces);
  assert.deepEqual(
    [stored.returnRequest.type, stored.returnRequest.status, stored.returnRequest.reason, stored.returnRequest.storeNotified, stored.status],
    ['return', 'requested', "Size doesn't fit", true, 'Delivered'],
  );
  assert.deepEqual(stored.returnRequest.items.map((item) => [item.line, item.productId, item.qty, item.price]), [[0, outfit.id, 1, Math.round(Number(outfit.data.price))]]);
  assert.equal(stored.timeline.at(-1).status, 'Return requested');
  assert.equal(mailsTo(STORE_EMAIL, `Return requested: order ${twoPieces}`).length, 1);
  // One open request at a time
  assert.equal((await returnRequest(twoPieces, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] })).status, 409);

  // Admin only, and each step only from the right state
  for (const token of [undefined, ashaToken]) {
    assert.equal((await orders({ action: 'admin-return', orderNumber: twoPieces, returnAction: 'approve', note: 'Send it back' }, { token })).status, 401);
  }
  assert.equal((await adminReturn(twoPieces, 'approve')).status, 400, 'approving needs the next steps for the customer');
  assert.equal((await adminReturn(twoPieces, 'receive')).status, 409, 'cannot be received before it is approved');
  assert.equal((await adminReturn(twoPieces, 'refund')).status, 409, 'cannot be refunded before it is approved');
  assert.equal((await adminReturn(twoPieces, 'shred')).status, 400);
  assert.equal((await h.doc('orders', twoPieces)).returnRequest.status, 'requested');

  const approved = await adminReturn(twoPieces, 'approve', { note: 'Please courier the piece to our Asansol address.' });
  assert.equal(approved.status, 200, approved.text);
  assert.equal(approved.body.customerEmailed, true);
  const [approval] = mailsTo(ASHA, `Your return request is approved · order ${twoPieces}`);
  assert.match(approval.html, /Please courier the piece to our Asansol address\./);

  assert.equal((await adminReturn(twoPieces, 'exchange')).status, 409, 'a return is refunded, not exchanged');
  const received = await adminReturn(twoPieces, 'receive', { notify: false });
  assert.equal(received.status, 200, received.text);
  assert.equal(received.body.customerEmailed, null);
  assert.equal(mailsTo(ASHA, `We have received your return · order ${twoPieces}`).length, 0);

  const refunded = await adminReturn(twoPieces, 'refund');
  assert.equal(refunded.status, 200, refunded.text);
  stored = await h.doc('orders', twoPieces);
  assert.deepEqual(stored.returnRequest.history.map((entry) => entry.status), ['requested', 'approved', 'received', 'refunded']);
  // One of two pieces came back: the order itself is still a delivered, paid order
  assert.deepEqual([stored.returnRequest.status, stored.status, stored.paymentStatus], ['refunded', 'Delivered', 'Paid']);
  assert.equal(stored.timeline.at(-1).status, 'Refund issued');
  assert.deepEqual(stored.emailLog.map((entry) => entry.kind).filter((kind) => kind.startsWith('return-')), ['return-approved', 'return-refunded']);
  assert.equal(mailsTo(ASHA, `Your refund has been issued · order ${twoPieces}`).length, 1);
  assert.equal((await adminReturn(twoPieces, 'refund')).status, 409, 'already refunded');
  // Stock is not changed by a return (the owner restocks by hand)
  assert.equal(await stock(), stockBefore);

  const view = await orders({ action: 'my-orders' }, { token: ashaToken });
  const eligibility = view.body.orders.find((order) => order.orderNumber === twoPieces).returnEligibility;
  assert.deepEqual([eligibility.canRequest, eligibility.remaining], [true, [1]]);
});

test('exchange: the size must be one the product is sold in; rejecting needs a reason; the first request is kept on record', async () => {
  await anHourLater();
  const exchange = (items, details = '') => returnRequest(twoPieces, ashaToken, { type: 'exchange', reason: "Size doesn't fit", details, photos: [], items });
  assert.equal((await exchange([{ line: 0, qty: 1, exchangeSize: 'NO-SUCH-SIZE' }])).status, 400);
  assert.equal((await exchange([{ line: 0, qty: 2, exchangeSize: outfit.data.sizes[0] }])).status, 400, 'one piece was already returned');
  assert.equal((await exchange([{ line: 0, qty: 1 }])).status, 400, 'no size and no note');

  const asked = await exchange([{ line: 0, qty: 1, exchangeSize: outfit.data.sizes[0] }]);
  assert.equal(asked.status, 200, asked.text);
  let stored = await h.doc('orders', twoPieces);
  assert.deepEqual([stored.returnRequest.type, stored.returnRequest.status, stored.returnRequest.items[0].exchangeSize], ['exchange', 'requested', outfit.data.sizes[0]]);
  assert.deepEqual(stored.pastReturnRequests.map((request) => [request.type, request.status]), [['return', 'refunded']]);
  assert.equal(mailsTo(STORE_EMAIL, `Exchange requested: order ${twoPieces}`).length, 1);

  assert.equal((await adminReturn(twoPieces, 'reject')).status, 400, 'rejecting needs a reason for the customer');
  const rejected = await adminReturn(twoPieces, 'reject', { note: 'That size is sold out.' });
  assert.equal(rejected.status, 200, rejected.text);
  stored = await h.doc('orders', twoPieces);
  assert.deepEqual([stored.returnRequest.status, stored.returnRequest.adminNote, stored.status], ['rejected', 'That size is sold out.', 'Delivered']);
  assert.match(mailsTo(ASHA, `Update on your exchange request · order ${twoPieces}`)[0].html, /That size is sold out\./);
  assert.equal((await adminReturn(twoPieces, 'exchange')).status, 409, 'a rejected request cannot be completed');
});

test('return with photos: only photos signed for this customer and order; when every piece is refunded the order becomes Refunded', async () => {
  await anHourLater();
  const sign = (orderNumber, token) => orders({ action: 'return-photo-sign', orderNumber }, { token, ip: h.nextIp() });
  assert.equal((await sign(twoPieces, undefined)).status, 401);
  assert.equal((await sign(twoPieces, meeraToken)).status, 404);

  const signed = await sign(twoPieces, ashaToken);
  assert.equal(signed.status, 200, signed.text);
  // The answer is a permission to upload exactly one photo, under an id the server chose, into "returns"
  const grant = signed.body;
  assert.deepEqual([grant.kind, grant.folder], ['image', 'returns']);
  assert.match(grant.id, /^rt_[a-f0-9]{24}$/);
  assert.equal(grant.url, `https://media.suitauragirls.in/i/returns/${grant.id}/w1100.webp`);
  assert.deepEqual(readMediaGrant(grant.grant), { kind: 'image', folder: 'returns', id: grant.id });
  assert.equal(readMediaGrant(grant.grant.replace(grant.id, 'rt_' + 'f'.repeat(24))), null, 'a grant cannot be pointed at another id');
  assert.ok(!signed.text.includes(h.env.ADMIN_SESSION_SECRET));
  const key = grant.id;
  assert.equal((await h.doc('return_photos', key)).orderNumber, twoPieces);
  const photoUrl = grant.url;

  // A photo signed for Meera's order cannot be attached to Asha's request
  const meeras = await deliveredOrder(MEERA, [lineOf(outfit, 1)], { address: { mobile: '9000000001' } });
  const meerasPhoto = (await sign(meeras, meeraToken)).body.url;
  const damaged = (photos) => returnRequest(twoPieces, ashaToken, { type: 'return', reason: 'Damaged / defective', details: 'Torn seam', items: [{ line: 0, qty: 1 }], photos });
  assert.equal((await damaged([meerasPhoto])).status, 400);
  assert.equal((await damaged([photoUrl.replace('media.suitauragirls.in', 'media.example.com')])).status, 400);
  assert.equal((await h.doc('orders', twoPieces)).returnRequest.status, 'rejected');

  const asked = await damaged([photoUrl]);
  assert.equal(asked.status, 200, asked.text);
  let stored = await h.doc('orders', twoPieces);
  assert.deepEqual(stored.returnRequest.photos, [photoUrl]);
  assert.deepEqual(stored.pastReturnRequests.map((request) => [request.type, request.status]), [['return', 'refunded'], ['exchange', 'rejected']]);
  assert.notEqual((await h.doc('return_photos', key)).attachedAt, '');
  assert.match(mailsTo(STORE_EMAIL, `Return requested: order ${twoPieces}`).at(-1).html, new RegExp(key));

  await adminReturn(twoPieces, 'approve', { note: 'Pickup arranged.' });
  const refunded = await adminReturn(twoPieces, 'refund');
  assert.equal(refunded.status, 200, refunded.text);
  stored = await h.doc('orders', twoPieces);
  // Both pieces have now been returned and refunded
  assert.deepEqual([stored.returnRequest.status, stored.status, stored.paymentStatus, stored.timeline.at(-1).status], ['refunded', 'Refunded', 'Refunded', 'Refunded']);

  const again = await returnRequest(twoPieces, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] });
  assert.equal(again.status, 409);
  // A photo is used once
  const another = await deliveredOrder(ASHA, [lineOf(outfit, 1)]);
  const reused = await returnRequest(another, ashaToken, { type: 'return', reason: 'Damaged / defective', details: 'Torn seam', items: [{ line: 0, qty: 1 }], photos: [photoUrl] });
  assert.equal(reused.status, 400);
});

test('exchange: completed by the admin as "exchanged"; a clearance piece can only be exchanged, not returned', async () => {
  await anHourLater();
  const orderNumber = await deliveredOrder(ASHA, [lineOf(clearance, 1)]);
  const asReturn = await returnRequest(orderNumber, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] });
  assert.equal(asReturn.status, 400);
  assert.match(asReturn.body.error, /clearance/);

  const asked = await returnRequest(orderNumber, ashaToken, { type: 'exchange', reason: "Size doesn't fit", details: '', photos: [], items: [{ line: 0, qty: 1, exchangeSize: clearance.data.sizes[0] }] });
  assert.equal(asked.status, 200, asked.text);
  await adminReturn(orderNumber, 'approve', { note: 'Send it back; the new size ships when it arrives.' });
  assert.equal((await adminReturn(orderNumber, 'refund')).status, 409, 'an exchange is exchanged, not refunded');
  const done = await adminReturn(orderNumber, 'exchange');
  assert.equal(done.status, 200, done.text);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.returnRequest.status, stored.status, stored.paymentStatus], ['exchanged', 'Delivered', 'Paid']);
  assert.equal(mailsTo(ASHA, `Your exchange is complete · order ${orderNumber}`).length, 1);
});

test('return-request from an older page ({ orderNumber, reason }) is a return of every piece', async () => {
  const orderNumber = await deliveredOrder(ASHA, [lineOf(outfit, 2)]);
  const response = await orders({ action: 'return-request', orderNumber, reason: 'Did not like the colour' }, { token: ashaToken });
  assert.equal(response.status, 200, response.text);
  const { returnRequest: request } = await h.doc('orders', orderNumber);
  assert.deepEqual([request.type, request.reason, request.details, request.items.map((item) => item.qty)], ['return', 'Other', 'Did not like the colour', [2]]);
});

test('admin-update to Refunded closes an open return request and restores the stock', async () => {
  const orderNumber = await deliveredOrder(ASHA, [lineOf(outfit, 1)]);
  const stockBefore = await stock();
  await returnRequest(orderNumber, ashaToken, { ...FITS_BADLY, items: [{ line: 0, qty: 1 }] });
  const refunded = await adminUpdate(orderNumber, { status: 'Refunded' });
  assert.equal(refunded.status, 200, refunded.text);
  const stored = await h.doc('orders', orderNumber);
  assert.deepEqual([stored.status, stored.paymentStatus, stored.returnRequest.status, stored.stockDeducted], ['Refunded', 'Refunded', 'refunded', false]);
  assert.equal(await stock(), stockBefore + 1);
  assert.equal(mailsTo(ASHA, `Refund processed for order ${orderNumber}`).length, 1);
});

test('admin test email goes through Brevo for the admin only', async () => {
  const sent = await orders({ action: 'admin-test-email', email: 'check@example.test' }, { token: adminToken });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(h.mailTo('check@example.test').length, 1);
  const refused = await orders({ action: 'admin-test-email', email: 'check@example.test' }, { token: ashaToken });
  assert.equal(refused.status, 401);
});
