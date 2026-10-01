// Scenarios 4 and 5: checkout with the real pricing rules, Razorpay payment verification and the Razorpay webhook.
// The money path: every assertion is made on the HTTP answer AND on the stored documents.
// Run: node --test worker/test/scenarios/orders-payment.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { addressFor, createOrder, lineOf, newAttemptKey, pickOutfit, razorpaySignature, sendRazorpayWebhook, verifyPayment, webhookSignature } from '../harness/checkout.mjs';

const h = await startHarness();

// A real product from the export, with a known stock; the owner's settings with known pricing rules.
const outfit = pickOutfit(h.exported('products'));
const second = pickOutfit(h.exported('products'), 1);
const PRICE = Math.round(Number(outfit.data.price));
const SHIPPING = 80;
const PREPAID = 50;
const STORE_EMAIL = 'owner@store.example';

const setStock = (product, stockQuantity, inStock = stockQuantity > 0) => h.update('products', product.id, { stockQuantity, inStock });
const stockOf = async (product) => (await h.doc('products', product.id)).stockQuantity;
const storeSettings = await h.setting('storeSettings');
const useSettings = (overrides = {}) => h.putSetting('storeSettings', {
  ...storeSettings, storeEmail: STORE_EMAIL, shippingCharge: SHIPPING, freeShippingThreshold: 2 * PRICE, prepaidDiscount: PREPAID,
  minOrderAmount: 0, maxOrderAmount: 0, couponsEnabled: true, ...overrides,
});
await useSettings();
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await setStock(outfit, 5);
await setStock(second, 5);
await h.put('coupons', 'harness10', { code: 'HARNESS10', discountType: 'percentage', discountValue: 10, minOrderValue: 0, isActive: true, usageLimit: 0, usageCount: 0, perUserLimit: 1 });

/** The owner's pricing rules, worked out by hand: 10% coupon, then the prepaid discount, shipping free from two pieces. */
const expectedTotals = (quantity, { coupon = false } = {}) => {
  const subtotal = PRICE * quantity;
  const couponDiscount = coupon ? Math.round(subtotal * 0.1) : 0;
  const shippingCharge = quantity >= 2 ? 0 : SHIPPING;
  return { subtotal, couponDiscount, prepaidDiscount: PREPAID, shippingCharge, finalTotal: subtotal - couponDiscount - PREPAID + shippingCharge };
};

const orders = () => h.docs('orders');
const purchasesToday = async () => Number((await h.doc('daily_analytics', h.today()))?.purchases) || 0;
const confirmationsFor = (orderNumber) => h.mail.filter((mail) => mail.subject === `Order ${orderNumber} confirmed — payment received`);
const storeAlertsFor = (orderNumber) => h.mail.filter((mail) => mail.to === STORE_EMAIL && mail.subject.startsWith(`New order ${orderNumber} `));
const capturedEvent = (orderNumber, razorpayOrderId, paymentId) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId, status: 'captured', notes: { order_number: orderNumber } } } },
});

const BUYER = 'buyer@example.test';
const attemptKey = newAttemptKey();
const buyerIp = h.nextIp();
let order = null; // { orderNumber, razorpayOrderId } of the main order

// ---- pricing and creation ----

test('quote: the price preview follows the owner\'s rules and writes nothing', async () => {
  const before = (await orders()).length;
  const response = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 2)], couponCode: 'harness10' });
  assert.equal(response.status, 200, response.text);
  const want = expectedTotals(2, { coupon: true });
  const { quote } = response.body;
  assert.deepEqual(
    { subtotal: quote.subtotal, couponCode: quote.couponCode, couponDiscount: quote.couponDiscount, comboDiscount: quote.comboDiscount, prepaidDiscount: quote.prepaidDiscount, shippingCharge: quote.shippingCharge, finalTotal: quote.finalTotal },
    { subtotal: want.subtotal, couponCode: 'HARNESS10', couponDiscount: want.couponDiscount, comboDiscount: 0, prepaidDiscount: PREPAID, shippingCharge: 0, finalTotal: want.finalTotal },
  );
  assert.equal(quote.discountAmount, want.couponDiscount + PREPAID);
  assert.equal((await orders()).length, before);
  assert.equal(h.services.razorpayOrders.length, 0);
});

test('create: the order is priced on the server, a Razorpay order is made for exactly that amount, stock is untouched', async () => {
  const before = (await orders()).length;
  const response = await createOrder(h, { email: BUYER, items: [lineOf(outfit, 2)], couponCode: 'harness10', attemptKey, ip: buyerIp });
  assert.equal(response.status, 200, response.text);
  const want = expectedTotals(2, { coupon: true });
  const body = response.body;
  order = { orderNumber: body.orderNumber, razorpayOrderId: body.razorpayOrderId };

  // What the browser gets to open Razorpay Checkout
  assert.match(body.orderNumber, /^SAG-\d{6}-[A-Z2-9]{5}$/);
  assert.equal(body.gateway, 'razorpay');
  assert.equal(body.keyId, h.env.RAZORPAY_KEY_ID);
  assert.equal(body.amount, want.finalTotal * 100);
  assert.equal(body.currency, 'INR');
  assert.equal(body.order.finalTotal, want.finalTotal);
  // The first answer is the guest view: no address, no contact details
  assert.equal(body.order.deliveryAddress, undefined);
  assert.equal(body.order.customerEmail, undefined);
  assert.ok(!response.text.includes(h.env.RAZORPAY_KEY_SECRET));

  // What Razorpay was asked for
  assert.equal(h.services.razorpayOrders.length, 1);
  const [atRazorpay] = h.services.razorpayOrders;
  assert.deepEqual(
    { id: atRazorpay.id, amount: atRazorpay.amount, currency: atRazorpay.currency, receipt: atRazorpay.receipt, notes: atRazorpay.notes },
    { id: body.razorpayOrderId, amount: want.finalTotal * 100, currency: 'INR', receipt: body.orderNumber, notes: { order_number: body.orderNumber, customer_email: BUYER } },
  );

  // What was stored
  assert.equal((await orders()).length, before + 1);
  const stored = await h.doc('orders', body.orderNumber);
  assert.deepEqual(
    {
      status: stored.status, paymentStatus: stored.paymentStatus, paymentMethod: stored.paymentMethod, razorpayOrderId: stored.razorpayOrderId, razorpayOrderIds: stored.razorpayOrderIds,
      attemptKey: stored.attemptKey, customerEmail: stored.customerEmail, customerMobile: stored.customerMobile, subtotal: stored.subtotal, couponCode: stored.couponCode, couponId: stored.couponId,
      couponDiscount: stored.couponDiscount, prepaidDiscount: stored.prepaidDiscount, shippingCharge: stored.shippingCharge, finalTotal: stored.finalTotal, stockDeducted: stored.stockDeducted,
    },
    {
      status: 'Pending', paymentStatus: 'Unpaid', paymentMethod: 'razorpay', razorpayOrderId: body.razorpayOrderId, razorpayOrderIds: [body.razorpayOrderId],
      attemptKey, customerEmail: BUYER, customerMobile: '9876543210', subtotal: want.subtotal, couponCode: 'HARNESS10', couponId: 'harness10',
      couponDiscount: want.couponDiscount, prepaidDiscount: PREPAID, shippingCharge: 0, finalTotal: want.finalTotal, stockDeducted: false,
    },
  );
  assert.equal(stored.items.length, 1);
  assert.deepEqual(
    { id: stored.items[0].product.id, name: stored.items[0].product.name, price: stored.items[0].product.price, size: stored.items[0].selectedSize, quantity: stored.items[0].quantity },
    { id: outfit.id, name: outfit.data.name, price: PRICE, size: outfit.data.sizes[0], quantity: 2 },
  );
  assert.deepEqual(stored.deliveryAddress.city, addressFor(BUYER).city);
  assert.equal(stored.timeline.length, 1);

  // Nothing is reserved or counted before payment
  assert.equal(await stockOf(outfit), 5);
  assert.equal((await h.doc('coupons', 'harness10')).usageCount, 0);
  assert.equal(h.mail.length, 0);
});

test('create: a second click with the same attempt key returns the same order and makes no second Razorpay order', async () => {
  const before = (await orders()).length;
  const again = await createOrder(h, { email: BUYER, items: [lineOf(outfit, 2)], couponCode: 'harness10', attemptKey, ip: buyerIp, address: { houseFlat: '14 Corrected Lane' } });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.orderNumber, order.orderNumber);
  assert.equal(again.body.razorpayOrderId, order.razorpayOrderId);
  assert.equal(again.body.amount, expectedTotals(2, { coupon: true }).finalTotal * 100);
  assert.equal((await orders()).length, before);
  assert.equal(h.services.razorpayOrders.length, 1);
  // The corrected address is kept on the same order
  assert.equal((await h.doc('orders', order.orderNumber)).deliveryAddress.houseFlat, '14 Corrected Lane');
});

test('create: a signed-in customer\'s order belongs to the signed-in email, not the one typed in the address', async () => {
  const token = await h.customerToken('member@example.test');
  const response = await createOrder(h, { email: 'typed@example.test', items: [lineOf(second, 1)], token });
  assert.equal(response.status, 200, response.text);
  const stored = await h.doc('orders', response.body.orderNumber);
  assert.equal(stored.customerEmail, 'member@example.test');
  assert.equal(stored.deliveryAddress.email, 'typed@example.test');
  assert.match(stored.customerUid, /^c_/);
});

// ---- payment verification ----

test('verify: a wrong signature is refused and the order stays unpaid', async () => {
  const refused = [
    'f'.repeat(64),
    razorpaySignature('not-the-key-secret', order.razorpayOrderId, 'pay_Forged0001'),
    razorpaySignature(h.env.RAZORPAY_KEY_SECRET, order.razorpayOrderId, 'pay_AnotherPayment'),
  ];
  for (const signature of refused) {
    const response = await verifyPayment(h, { ...order, paymentId: 'pay_Forged0001', signature });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /could not be verified/);
  }
  const incomplete = await h.post('/api/orders', { action: 'verify', orderNumber: order.orderNumber });
  assert.equal(incomplete.status, 400);
  const stored = await h.doc('orders', order.orderNumber);
  assert.equal(stored.paymentStatus, 'Unpaid');
  assert.equal(await stockOf(outfit), 5);
  assert.equal(h.mail.length, 0);
});

test('verify: a genuine payment for another order cannot pay this one', async () => {
  const other = await createOrder(h, { email: 'other@example.test', items: [lineOf(second, 1)] });
  assert.equal(other.status, 200, other.text);
  // Correctly signed by Razorpay, but for the other (cheaper) Razorpay order
  const response = await verifyPayment(h, { orderNumber: order.orderNumber, razorpayOrderId: other.body.razorpayOrderId, paymentId: 'pay_OtherOrder01' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /does not match this order/);
  assert.equal((await h.doc('orders', order.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal((await h.doc('orders', other.body.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal(await stockOf(outfit), 5);
});

test('verify: the correct signature marks the order paid, takes the stock, counts the coupon and sends both emails', async () => {
  const purchasesBefore = await purchasesToday();
  const response = await verifyPayment(h, { ...order, paymentId: 'pay_Genuine0001' });
  assert.equal(response.status, 200, response.text);
  // The payer gets the full receipt view
  assert.equal(response.body.order.paymentStatus, 'Paid');
  assert.equal(response.body.order.status, 'Processing');
  assert.equal(response.body.order.paymentRef, 'pay_Genuine0001');
  assert.equal(response.body.order.deliveryAddress.pincode, '713301');

  const stored = await h.doc('orders', order.orderNumber);
  assert.deepEqual(
    { paymentStatus: stored.paymentStatus, status: stored.status, paymentRef: stored.paymentRef, paidVia: stored.paidVia, stockDeducted: stored.stockDeducted, deductedQuantities: stored.deductedQuantities, stockShortfall: stored.stockShortfall },
    { paymentStatus: 'Paid', status: 'Processing', paymentRef: 'pay_Genuine0001', paidVia: 'checkout', stockDeducted: true, deductedQuantities: { [outfit.id]: 2 }, stockShortfall: [] },
  );
  assert.ok(!Number.isNaN(Date.parse(stored.paidAt)));
  assert.deepEqual(stored.timeline.map((entry) => entry.status), ['Pending', 'Processing']);
  assert.deepEqual(stored.emailLog.map((entry) => [entry.kind, entry.ok]), [['confirmed', true]]);

  const product = await h.doc('products', outfit.id);
  assert.equal(product.stockQuantity, 3);
  assert.equal(product.inStock, true);
  assert.equal((await h.doc('coupons', 'harness10')).usageCount, 1);
  assert.equal(await purchasesToday(), purchasesBefore + 1);

  assert.equal(confirmationsFor(order.orderNumber).length, 1);
  assert.equal(confirmationsFor(order.orderNumber)[0].to, BUYER);
  assert.equal(storeAlertsFor(order.orderNumber).length, 1);
});

test('verify sent again, and the webhook arriving as well, change nothing: paid once, stock taken once', async () => {
  const purchasesBefore = await purchasesToday();
  const before = await h.doc('orders', order.orderNumber);

  const again = await verifyPayment(h, { ...order, paymentId: 'pay_Genuine0001' });
  assert.equal(again.status, 200);
  assert.equal(again.body.order.paymentStatus, 'Paid');
  const webhook = await sendRazorpayWebhook(h, capturedEvent(order.orderNumber, order.razorpayOrderId, 'pay_Genuine0001'));
  assert.equal(webhook.status, 200);
  assert.deepEqual(webhook.body, { ok: true, changed: false });

  assert.deepEqual(await h.doc('orders', order.orderNumber), before);
  assert.equal(await stockOf(outfit), 3);
  assert.equal((await h.doc('coupons', 'harness10')).usageCount, 1);
  assert.equal(await purchasesToday(), purchasesBefore);
  assert.equal(confirmationsFor(order.orderNumber).length, 1);
  assert.equal(storeAlertsFor(order.orderNumber).length, 1);
});

test('create: the same attempt key after payment answers "already paid" instead of charging again', async () => {
  const response = await createOrder(h, { email: BUYER, items: [lineOf(outfit, 2)], attemptKey, ip: buyerIp });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.alreadyPaid, true);
  assert.equal(response.body.orderNumber, order.orderNumber);
  assert.equal(response.body.razorpayOrderId, undefined);
});

// ---- coupons ----

test('coupon: once per customer, counted only when paid, and never past its usage limit', async () => {
  const razorpayOrdersBefore = h.services.razorpayOrders.length;
  // The same customer (same email) cannot use it again
  const sameEmail = await createOrder(h, { email: BUYER, items: [lineOf(outfit, 1)], couponCode: 'HARNESS10' });
  assert.equal(sameEmail.status, 400);
  assert.match(sameEmail.body.error, /already used HARNESS10/);
  // ... nor with another email but the same phone number
  const samePhone = await createOrder(h, { email: 'alias@example.test', items: [lineOf(outfit, 1)], couponCode: 'HARNESS10' });
  assert.equal(samePhone.status, 400);
  assert.match(samePhone.body.error, /already used HARNESS10/);
  assert.equal(h.services.razorpayOrders.length, razorpayOrdersBefore);

  // Another customer can; creating an unpaid order does not count as a use
  const newcomer = await createOrder(h, { email: 'newcomer@example.test', items: [lineOf(outfit, 1)], couponCode: 'HARNESS10', address: { mobile: '9123456780' } });
  assert.equal(newcomer.status, 200, newcomer.text);
  assert.equal((await h.doc('coupons', 'harness10')).usageCount, 1);

  // The overall limit (1 use, already used once)
  await h.update('coupons', 'harness10', { usageLimit: 1 });
  const overLimit = await createOrder(h, { email: 'third@example.test', items: [lineOf(outfit, 1)], couponCode: 'HARNESS10', address: { mobile: '9123456781' } });
  assert.equal(overLimit.status, 400);
  assert.match(overLimit.body.error, /usage limit/);
  await h.update('coupons', 'harness10', { usageLimit: 0 });

  const unknown = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)], couponCode: 'NOSUCHCODE' });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.error, /not valid/);
});

test('coupon: check-coupon previews the discount; switched off by the owner, no coupon works', async () => {
  const preview = await h.post('/api/orders', { action: 'check-coupon', couponCode: 'harness10', subtotal: 2000 });
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.body.discount, 200);
  assert.equal(preview.body.coupon.code, 'HARNESS10');

  await useSettings({ couponsEnabled: false });
  const off = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)], couponCode: 'HARNESS10' });
  await useSettings();
  assert.equal(off.status, 400);
  assert.match(off.body.error, /Coupons are not available/);
});

// ---- other pricing rules ----

test('pricing: one piece pays shipping; the combo offer comes off before the coupon', async () => {
  const single = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)] });
  assert.equal(single.status, 200, single.text);
  const want = expectedTotals(1);
  assert.deepEqual(
    { shippingCharge: single.body.quote.shippingCharge, prepaidDiscount: single.body.quote.prepaidDiscount, finalTotal: single.body.quote.finalTotal },
    { shippingCharge: SHIPPING, prepaidDiscount: PREPAID, finalTotal: want.finalTotal },
  );

  await h.putSetting('comboOffer', { enabled: true, percent: 10, minItems: 2 });
  const combo = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 2)], couponCode: 'HARNESS10' });
  await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
  assert.equal(combo.status, 200, combo.text);
  const comboDiscount = Math.round(PRICE * 2 * 0.1);
  const couponDiscount = Math.round((PRICE * 2 - comboDiscount) * 0.1);
  assert.deepEqual(
    { comboDiscount: combo.body.quote.comboDiscount, couponDiscount: combo.body.quote.couponDiscount, finalTotal: combo.body.quote.finalTotal },
    { comboDiscount, couponDiscount, finalTotal: PRICE * 2 - comboDiscount - couponDiscount - PREPAID },
  );
});

test('pricing: the owner\'s minimum and maximum order value are enforced', async () => {
  await useSettings({ minOrderAmount: PRICE * 3 });
  const tooSmall = await createOrder(h, { email: 'limits@example.test', items: [lineOf(outfit, 1)] });
  await useSettings({ maxOrderAmount: PRICE });
  const tooLarge = await createOrder(h, { email: 'limits@example.test', items: [lineOf(outfit, 2)] });
  await useSettings();
  assert.equal(tooSmall.status, 400);
  assert.match(tooSmall.body.error, /Minimum order/);
  assert.equal(tooLarge.status, 400);
  assert.match(tooLarge.body.error, /Maximum order/);
  assert.deepEqual(await h.docs('orders', [['customerEmail', '==', 'limits@example.test']]), []);
});

// ---- stock and tampering ----

test('stock: more than is left, a sold-out product and a hidden product are refused before Razorpay is asked', async () => {
  const razorpayOrdersBefore = h.services.razorpayOrders.length;
  const ordersBefore = (await orders()).length;

  const tooMany = await createOrder(h, { email: 'stock@example.test', items: [lineOf(outfit, 4)] });
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.body.error, /Only 3 pieces/);
  // Two lines of the same product are added up
  const split = await createOrder(h, { email: 'stock@example.test', items: [lineOf(outfit, 2), { ...lineOf(outfit, 2), color: { name: 'Blue' } }] });
  assert.equal(split.status, 409);

  await setStock(outfit, 0);
  const soldOut = await createOrder(h, { email: 'stock@example.test', items: [lineOf(outfit, 1)] });
  assert.equal(soldOut.status, 409);
  assert.match(soldOut.body.error, /sold out/);

  await h.update('products', outfit.id, { stockQuantity: 3, inStock: true, hidden: true });
  const hidden = await createOrder(h, { email: 'stock@example.test', items: [lineOf(outfit, 1)] });
  await h.update('products', outfit.id, { hidden: false });
  assert.equal(hidden.status, 409);
  assert.match(hidden.body.error, /no longer available/);

  assert.equal(h.services.razorpayOrders.length, razorpayOrdersBefore);
  assert.equal((await orders()).length, ordersBefore);
});

test('tampering: prices sent by the browser are ignored; bad quantities, sizes and products are refused', async () => {
  const cheap = await createOrder(h, {
    email: 'tamper@example.test',
    items: [{ ...lineOf(outfit, 1), price: 1, originalPrice: 1, finalTotal: 1, product: { id: outfit.id, price: 1 } }],
  });
  assert.equal(cheap.status, 200, cheap.text);
  const want = expectedTotals(1);
  assert.equal(cheap.body.amount, want.finalTotal * 100);
  assert.equal(h.services.razorpayOrders.at(-1).amount, want.finalTotal * 100);
  const stored = await h.doc('orders', cheap.body.orderNumber);
  assert.equal(stored.items[0].product.price, PRICE);
  assert.equal(stored.finalTotal, want.finalTotal);

  const razorpayOrdersBefore = h.services.razorpayOrders.length;
  const refused = {
    'quantity 0': [{ ...lineOf(outfit, 0) }],
    'negative quantity': [{ ...lineOf(outfit, -2) }],
    'quantity above 10': [{ ...lineOf(outfit, 11) }],
    'quantity not a number': [{ ...lineOf(outfit, 1), quantity: 'two' }],
    'unknown product': [{ productId: 'no-such-product', size: 'M', quantity: 1 }],
    'size that is not offered': [{ ...lineOf(outfit, 1), size: 'NO-SUCH-SIZE' }],
    'no product id': [{ size: 'M', quantity: 1 }],
    'empty bag': [],
    '21 lines': Array.from({ length: 21 }, () => lineOf(outfit, 1)),
  };
  for (const [name, items] of Object.entries(refused)) {
    const response = await createOrder(h, { email: 'tamper@example.test', items });
    assert.ok([400, 409].includes(response.status), `${name}: ${response.status}`);
  }
  const notAList = await h.post('/api/orders', { action: 'create', items: 'everything', address: addressFor('tamper@example.test') }, { ip: h.nextIp() });
  assert.equal(notAList.status, 400);
  assert.equal(h.services.razorpayOrders.length, razorpayOrdersBefore);
});

test('address: an invalid phone, email or PIN code is refused before anything is priced or stored', async () => {
  const bad = { mobile: '12345', email: 'nope', pincode: '012345', fullName: 'A', houseFlat: '', city: '', state: '' };
  for (const [field, value] of Object.entries(bad)) {
    const response = await createOrder(h, { email: 'address@example.test', items: [lineOf(outfit, 1)], address: { [field]: value } });
    assert.equal(response.status, 400, field);
  }
  assert.deepEqual(await h.docs('orders', [['customerMobile', '==', '12345']]), []);
});

test('create: when Razorpay does not answer, the shopper gets a 502 and no order is stored', async () => {
  const key = newAttemptKey();
  h.services.razorpayOrderStatus = 500;
  const response = await createOrder(h, { email: 'down@example.test', items: [lineOf(outfit, 1)], attemptKey: key });
  h.services.razorpayOrderStatus = 200;
  assert.equal(response.status, 502);
  assert.match(response.body.error, /payment gateway is not responding/);
  assert.deepEqual(await h.docs('orders', [['attemptKey', '==', key]]), []);
});

test('gateways: shoppers are offered Razorpay; the checkout rejects cross-site and unknown requests', async () => {
  const gateways = await h.post('/api/orders', { action: 'gateways' });
  assert.deepEqual(gateways.body, { gateways: { razorpay: true, payu: false } });
  assert.equal((await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)] }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.post('/api/orders', { action: 'no-such-action' })).status, 400);
  assert.equal((await h.call('/api/orders')).status, 405);
  // The browser may not create or change orders through the data gateway
  const direct = await h.post('/api/db', { ops: [{ op: 'set', path: `orders/${order.orderNumber}`, data: { paymentStatus: 'Paid' }, merge: true }, { op: 'get', path: `orders/${order.orderNumber}` }] });
  assert.deepEqual(direct.body.results.map((result) => result.error?.code), ['permission-denied', 'permission-denied']);
});

test('payment when stock ran short meanwhile: the order is paid, stock stops at zero and the shortfall is noted', async () => {
  await setStock(second, 2);
  const created = await createOrder(h, { email: 'short@example.test', items: [lineOf(second, 2)] });
  assert.equal(created.status, 200, created.text);
  await setStock(second, 1); // someone else bought one in between
  const paid = await verifyPayment(h, { orderNumber: created.body.orderNumber, razorpayOrderId: created.body.razorpayOrderId, paymentId: 'pay_Shortfall01' });
  assert.equal(paid.status, 200, paid.text);

  const stored = await h.doc('orders', created.body.orderNumber);
  assert.equal(stored.paymentStatus, 'Paid');
  assert.deepEqual(stored.deductedQuantities, { [second.id]: 1 });
  assert.deepEqual(stored.stockShortfall.map((entry) => [entry.productId, entry.requested, entry.available]), [[second.id, 2, 1]]);
  assert.match(stored.notes, /Stock shortfall at payment time/);
  const product = await h.doc('products', second.id);
  assert.equal(product.stockQuantity, 0);
  assert.equal(product.inStock, false);
  await setStock(second, 5);
});

// ---- Razorpay webhook ----

/** A fresh unpaid order of one piece of the second product. */
const unpaidOrder = async (email) => {
  const created = await createOrder(h, { email, items: [lineOf(second, 1)] });
  assert.equal(created.status, 200, created.text);
  return { orderNumber: created.body.orderNumber, razorpayOrderId: created.body.razorpayOrderId };
};

test('webhook: a missing, wrong or wrongly keyed signature is refused and nothing changes', async () => {
  const target = await unpaidOrder('hook1@example.test');
  const event = capturedEvent(target.orderNumber, target.razorpayOrderId, 'pay_Hook0001');
  const raw = JSON.stringify(event);
  const stockBefore = await stockOf(second);
  const refused = {
    'no signature': '',
    'random signature': 'a'.repeat(64),
    'signed with the API key secret, not the webhook secret': webhookSignature(h.env.RAZORPAY_KEY_SECRET, raw),
    'signature of a different body': webhookSignature(h.env.RAZORPAY_WEBHOOK_SECRET, `${raw} `),
  };
  for (const [name, signature] of Object.entries(refused)) {
    const response = await sendRazorpayWebhook(h, event, { raw, signature });
    assert.equal(response.status, 401, name);
  }
  assert.equal((await h.doc('orders', target.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal(await stockOf(second), stockBefore);
  assert.equal(confirmationsFor(target.orderNumber).length, 0);
});

test('webhook: payment.captured pays an unpaid order once; the same event again changes nothing', async () => {
  const target = await unpaidOrder('hook2@example.test');
  const stockBefore = await stockOf(second);
  const purchasesBefore = await purchasesToday();
  const event = capturedEvent(target.orderNumber, target.razorpayOrderId, 'pay_Hook0002');

  const first = await sendRazorpayWebhook(h, event);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, { ok: true, changed: true });
  const stored = await h.doc('orders', target.orderNumber);
  assert.deepEqual(
    { paymentStatus: stored.paymentStatus, status: stored.status, paidVia: stored.paidVia, paymentRef: stored.paymentRef, deducted: stored.deductedQuantities },
    { paymentStatus: 'Paid', status: 'Processing', paidVia: 'webhook', paymentRef: 'pay_Hook0002', deducted: { [second.id]: 1 } },
  );
  assert.deepEqual(stored.emailLog.map((entry) => [entry.kind, entry.ok]), [['confirmed', true]]);
  assert.equal(await stockOf(second), stockBefore - 1);
  assert.equal(await purchasesToday(), purchasesBefore + 1);
  assert.equal(confirmationsFor(target.orderNumber).length, 1);
  assert.equal(storeAlertsFor(target.orderNumber).length, 1);

  const repeat = await sendRazorpayWebhook(h, event);
  assert.deepEqual(repeat.body, { ok: true, changed: false });
  // The browser's verify arriving after the webhook is harmless too
  const late = await verifyPayment(h, { ...target, paymentId: 'pay_Hook0002' });
  assert.equal(late.status, 200);
  assert.equal(await stockOf(second), stockBefore - 1);
  assert.equal(await purchasesToday(), purchasesBefore + 1);
  assert.equal(confirmationsFor(target.orderNumber).length, 1);
});

test('webhook: the signature is checked over the exact bytes received, whatever their formatting', async () => {
  const target = await unpaidOrder('hook3@example.test');
  // Spacing, key order and non-ASCII text that JSON.parse + JSON.stringify would not reproduce
  const raw = `{ "payload" : { "payment" : { "entity" : { "notes" : { "order_number" : "${target.orderNumber}", "city" : "आसनसोल \\u0041" }, "order_id" : "${target.razorpayOrderId}", "id" : "pay_Hook0003" } } },\r\n  "event" : "payment.captured" }\n`;
  const response = await sendRazorpayWebhook(h, null, { raw });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body, { ok: true, changed: true });
  assert.equal((await h.doc('orders', target.orderNumber)).paymentStatus, 'Paid');
});

test('webhook: order.paid with the receipt, and an event that names only the Razorpay order, both find the order', async () => {
  const byReceipt = await unpaidOrder('hook4@example.test');
  const orderPaid = await sendRazorpayWebhook(h, {
    event: 'order.paid',
    payload: { order: { entity: { id: byReceipt.razorpayOrderId, receipt: byReceipt.orderNumber } }, payment: { entity: { id: 'pay_Hook0004', order_id: byReceipt.razorpayOrderId } } },
  });
  assert.deepEqual(orderPaid.body, { ok: true, changed: true });
  assert.equal((await h.doc('orders', byReceipt.orderNumber)).paymentRef, 'pay_Hook0004');

  const byRazorpayId = await unpaidOrder('hook5@example.test');
  const bare = await sendRazorpayWebhook(h, { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Hook0005', order_id: byRazorpayId.razorpayOrderId } } } });
  assert.deepEqual(bare.body, { ok: true, changed: true });
  assert.equal((await h.doc('orders', byRazorpayId.orderNumber)).paymentStatus, 'Paid');
});

test('webhook: other events, unknown orders and a body that is not JSON are answered without changing anything', async () => {
  const target = await unpaidOrder('hook6@example.test');
  const failed = await sendRazorpayWebhook(h, { ...capturedEvent(target.orderNumber, target.razorpayOrderId, 'pay_Hook0006'), event: 'payment.failed' });
  assert.deepEqual(failed.body, { ignored: true });
  const unknown = await sendRazorpayWebhook(h, { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Hook0007', order_id: 'order_NotOurs' } } } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ignored, true);
  const notJson = await sendRazorpayWebhook(h, null, { raw: 'event=payment.captured' });
  assert.equal(notJson.status, 400);
  const get = await h.call('/api/webhooks/razorpay');
  assert.equal(get.status, 405);
  assert.equal((await h.doc('orders', target.orderNumber)).paymentStatus, 'Unpaid');
});

test('webhook: a captured payment whose Razorpay order belongs to another order is not applied', async () => {
  const target = await unpaidOrder('hook7@example.test');
  const other = await unpaidOrder('hook8@example.test');
  // Signed by Razorpay, but the notes point at an order this payment was not made for
  const response = await sendRazorpayWebhook(h, capturedEvent(target.orderNumber, other.razorpayOrderId, 'pay_Hook0008'));
  assert.equal(response.status, 500);
  assert.equal((await h.doc('orders', target.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal((await h.doc('orders', other.orderNumber)).paymentStatus, 'Unpaid');
});

test('no secret reached the logs or any response', async () => {
  const everything = JSON.stringify(h.logs);
  for (const name of ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'ADMIN_SESSION_SECRET', 'AUTH_TOKEN_SECRET', 'BREVO_API_KEY']) {
    assert.ok(!everything.includes(h.env[name]), name);
  }
});
