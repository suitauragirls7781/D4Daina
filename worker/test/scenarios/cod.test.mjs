// Scenario: cash on delivery with an online advance. The shopper pays the cash-on-delivery charge online (Razorpay)
// to confirm the order and the rest in cash at the door; an order paid in full online gets the prepaid discount.
// Every assertion is made on the HTTP answer AND on the stored documents.
// Run: node --test worker/test/scenarios/cod.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { addressFor, lineOf, newAttemptKey, pickOutfit, verifyPayment } from '../harness/checkout.mjs';

const h = await startHarness();
const outfit = pickOutfit(h.exported('products'));
const PRICE = Math.round(Number(outfit.data.price));
const COD_CHARGE = 99;
const PERCENT = 15;
const STORE_EMAIL = 'owner@store.example';
const BUYER = 'cod-buyer@example.test';

const storeSettings = await h.setting('storeSettings');
const useSettings = (overrides = {}) => h.putSetting('storeSettings', {
  ...storeSettings, storeEmail: STORE_EMAIL, shippingCharge: 0, freeShippingThreshold: 0, prepaidDiscount: 0, prepaidPercent: PERCENT, prepaidMinPrice: 0,
  minOrderAmount: 0, maxOrderAmount: 0, couponsEnabled: true, codEnabled: true, codCharge: COD_CHARGE, ...overrides,
});
await useSettings();
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 9, inStock: true });

const create = (payMode, extra = {}) => h.post('/api/orders', {
  action: 'create', items: [lineOf(outfit, 1)], couponCode: '', attemptKey: newAttemptKey(), address: addressFor(BUYER), payMode, ...extra,
}, { ip: h.nextIp() });
const prepaidDiscount = Math.round((PRICE * PERCENT) / 100);

test('quote: paying online gets the percent off and free delivery; cash on delivery gets no discount and the charge', async () => {
  const online = (await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)] })).body.quote;
  assert.deepEqual(
    { prepaidDiscount: online.prepaidDiscount, shippingCharge: online.shippingCharge, finalTotal: online.finalTotal, payMode: online.payMode, codAdvance: online.codAdvance, codDue: online.codDue },
    { prepaidDiscount, shippingCharge: 0, finalTotal: PRICE - prepaidDiscount, payMode: 'prepaid', codAdvance: 0, codDue: 0 },
  );
  assert.deepEqual({ codEnabled: online.codEnabled, codCharge: online.codCharge }, { codEnabled: true, codCharge: COD_CHARGE });
  const cod = (await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)], payMode: 'cod' })).body.quote;
  assert.deepEqual(
    { prepaidDiscount: cod.prepaidDiscount, shippingCharge: cod.shippingCharge, finalTotal: cod.finalTotal, payMode: cod.payMode, codAdvance: cod.codAdvance, codDue: cod.codDue },
    { prepaidDiscount: 0, shippingCharge: COD_CHARGE, finalTotal: PRICE + COD_CHARGE, payMode: 'cod', codAdvance: COD_CHARGE, codDue: PRICE },
  );
});

test('cash on delivery: Razorpay is asked for the charge only, and the order is confirmed once that is paid', async () => {
  const razorpayBefore = h.services.razorpayOrders.length;
  const stockBefore = (await h.doc('products', outfit.id)).stockQuantity;
  const response = await create('cod');
  assert.equal(response.status, 200, response.text);
  const body = response.body;
  assert.equal(body.gateway, 'razorpay');
  assert.equal(body.amount, COD_CHARGE * 100, 'the browser is told to pay only the advance');
  assert.deepEqual(
    { finalTotal: body.order.finalTotal, payMode: body.order.payMode, codAdvance: body.order.codAdvance, codDue: body.order.codDue },
    { finalTotal: PRICE + COD_CHARGE, payMode: 'cod', codAdvance: COD_CHARGE, codDue: PRICE },
  );
  assert.equal(h.services.razorpayOrders.length, razorpayBefore + 1);
  assert.equal(h.services.razorpayOrders.at(-1).amount, COD_CHARGE * 100);

  const unpaid = await h.doc('orders', body.orderNumber);
  assert.deepEqual(
    { paymentStatus: unpaid.paymentStatus, status: unpaid.status, payMode: unpaid.payMode, codAdvance: unpaid.codAdvance, codDue: unpaid.codDue, prepaidDiscount: unpaid.prepaidDiscount, shippingCharge: unpaid.shippingCharge, finalTotal: unpaid.finalTotal },
    { paymentStatus: 'Unpaid', status: 'Pending', payMode: 'cod', codAdvance: COD_CHARGE, codDue: PRICE, prepaidDiscount: 0, shippingCharge: COD_CHARGE, finalTotal: PRICE + COD_CHARGE },
  );
  assert.equal((await h.doc('products', outfit.id)).stockQuantity, stockBefore, 'no stock is taken before the advance is paid');

  const mailBefore = h.mail.length;
  const verified = await verifyPayment(h, { orderNumber: body.orderNumber, razorpayOrderId: body.razorpayOrderId, paymentId: 'pay_codadvance0001' });
  assert.equal(verified.status, 200, verified.text);
  const paid = await h.doc('orders', body.orderNumber);
  assert.deepEqual({ paymentStatus: paid.paymentStatus, status: paid.status, stockDeducted: paid.stockDeducted }, { paymentStatus: 'Paid', status: 'Processing', stockDeducted: true });
  assert.match(paid.timeline.at(-1).note || paid.timeline.at(-1).message || JSON.stringify(paid.timeline.at(-1)), new RegExp(`Advance of ₹${COD_CHARGE} received. ₹${PRICE} to be collected in cash`));
  assert.equal((await h.doc('products', outfit.id)).stockQuantity, stockBefore - 1);

  // The emails say what was paid and what is still to be collected
  const sent = h.mail.slice(mailBefore);
  const toCustomer = sent.find((mail) => mail.to === BUYER);
  assert.equal(toCustomer.subject, `Order ${body.orderNumber} confirmed — cash on delivery`);
  assert.ok(toCustomer.html.includes('Pay in cash on delivery'), 'the customer email names the cash amount');
  const toStore = sent.find((mail) => mail.to === STORE_EMAIL);
  assert.ok(toStore.subject.startsWith(`New COD order ${body.orderNumber} `), toStore.subject);
  assert.ok(toStore.subject.includes('collect'), toStore.subject);
});

test('paying in full online: Razorpay is asked for the discounted total', async () => {
  const response = await create('prepaid');
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.amount, (PRICE - prepaidDiscount) * 100);
  const stored = await h.doc('orders', response.body.orderNumber);
  assert.deepEqual(
    { payMode: stored.payMode, codAdvance: stored.codAdvance, codDue: stored.codDue, prepaidDiscount: stored.prepaidDiscount, shippingCharge: stored.shippingCharge, finalTotal: stored.finalTotal },
    { payMode: 'prepaid', codAdvance: 0, codDue: 0, prepaidDiscount, shippingCharge: 0, finalTotal: PRICE - prepaidDiscount },
  );
});

test('cash on delivery is refused when the owner has it off, and nothing is created', async () => {
  await useSettings({ codEnabled: false });
  const before = (await h.docs('orders')).length;
  const razorpayBefore = h.services.razorpayOrders.length;
  const response = await create('cod');
  assert.equal(response.status, 409, response.text);
  assert.match(response.text, /Cash on delivery is not available/);
  assert.equal((await h.docs('orders')).length, before);
  assert.equal(h.services.razorpayOrders.length, razorpayBefore);
  const quote = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)], payMode: 'cod' });
  assert.equal(quote.status, 409);
  await useSettings();
});

test('the same checkout switched from cash on delivery to online makes its own order at its own price', async () => {
  const attemptKey = newAttemptKey();
  const ip = h.nextIp();
  const post = (payMode) => h.post('/api/orders', { action: 'create', items: [lineOf(outfit, 1)], couponCode: '', attemptKey, address: addressFor(BUYER), payMode }, { ip });
  const cod = await post('cod');
  const online = await post('prepaid');
  assert.equal(cod.body.amount, COD_CHARGE * 100);
  assert.equal(online.body.amount, (PRICE - prepaidDiscount) * 100);
  assert.notEqual(cod.body.orderNumber, online.body.orderNumber, 'an advance-sized Razorpay order is never reused for a full payment');
});
