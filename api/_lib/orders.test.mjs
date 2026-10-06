// Unit tests for server-side pricing, payment finalisation and stock restore.
// Run: node api/_lib/orders.test.mjs  (uses an in-memory stand-in for the Firestore Admin SDK)
import assert from 'node:assert/strict';
import {
  ORDER_STATUSES,
  alertStoreOfNewOrder,
  applyReturnAction,
  cancelBlockReason,
  cancelRequestOutcome,
  cleanExpectedDate,
  cleanTrackingUrl,
  closeReturnOnRefund,
  couponDiscountFor,
  estimateDelivery,
  finalizePaidOrder,
  isClearanceLine,
  isReturnOpen,
  legacyNotesRequest,
  normalizeReturnRequest,
  ownerOrderView,
  priceCart,
  publicOrderView,
  recordCancelRequestAlert,
  recordReturnRequestAlert,
  requestCancellation,
  restoreOrderStock,
  returnBlockReason,
  returnPhotoKey,
  returnWindowEndsAt,
  returnableQty,
  validateCoupon,
  validateReturnInput,
} from './orders.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createDb = (seed) => {
  const data = clone(seed);
  const docRef = (collection, id) => ({
    id,
    collection,
    get: async () => snap(collection, id),
    create: async (value) => {
      if (data[collection]?.[id]) throw Object.assign(new Error('exists'), { code: 6 });
      (data[collection] ||= {})[id] = clone(value);
    },
    update: async (value) => apply(collection, id, value),
    set: async (value) => { (data[collection] ||= {})[id] = clone(value); },
  });
  const snap = (collection, id) => {
    const value = data[collection]?.[id];
    return { id, exists: Boolean(value), ref: docRef(collection, id), data: () => clone(value) };
  };
  const apply = (collection, id, value) => {
    const current = data[collection][id];
    for (const [key, v] of Object.entries(value)) {
      if (v && typeof v === 'object' && v.operand !== undefined) current[key] = (Number(current[key]) || 0) + v.operand;
      else current[key] = clone(v);
    }
  };
  // Equality-only queries with an optional limit (enough for the code under test)
  const query = (collection, filters = [], max = Infinity) => ({
    where: (field, op, value) => {
      assert.equal(op, '==', 'only equality filters are used');
      return query(collection, [...filters, [field, value]], max);
    },
    limit: (count) => query(collection, filters, count),
    get: async () => {
      if (filters.length) db.queries.push({ collection, filters, max });
      return {
        docs: Object.keys(data[collection] || {})
          .filter((id) => filters.every(([field, value]) => data[collection][id][field] === value))
          .slice(0, max)
          .map((id) => snap(collection, id)),
      };
    },
  });
  const db = {
    data,
    queries: [],
    collection: (collection) => ({
      doc: (id) => docRef(collection, id),
      ...query(collection),
    }),
    getAll: async (...refs) => refs.map((ref) => snap(ref.collection, ref.id)),
    runTransaction: async (fn) => {
      const writes = [];
      let wrote = false;
      const tx = {
        get: async (ref) => { assert.equal(wrote, false, 'reads must happen before writes'); return snap(ref.collection, ref.id); },
        getAll: async (...refs) => { assert.equal(wrote, false, 'reads must happen before writes'); return refs.map((ref) => snap(ref.collection, ref.id)); },
        update: (ref, value) => { wrote = true; writes.push(() => apply(ref.collection, ref.id, value)); },
        set: (ref, value) => { wrote = true; writes.push(() => { (data[ref.collection] ||= {})[ref.id] = clone(value); }); },
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return db;
};

const seed = {
  products: {
    p1: { name: 'Suit One', price: 1499, originalPrice: 2499, stockQuantity: 5, inStock: true, sizes: ['S', 'M', 'L'], images: ['a.jpg'] },
    p2: { name: 'Suit Two', price: 999, stockQuantity: 1, inStock: true, sizes: [] },
    p3: { name: 'Sold Out', price: 500, stockQuantity: 0, inStock: false, sizes: [] },
  },
  coupons: {
    c1: { code: 'SAVE10', discountType: 'percentage', discountValue: 10, maxDiscount: 200, minOrderValue: 1000, isActive: true, usageLimit: 5, usageCount: 0 },
    c2: { code: 'OFF', discountType: 'fixed', discountValue: 300, minOrderValue: 0, isActive: false },
    c3: { code: 'USEDUP', discountType: 'fixed', discountValue: 300, minOrderValue: 0, isActive: true, usageLimit: 1, usageCount: 1 },
  },
  storefront_settings: {
    storeSettings: { value_json: JSON.stringify({ shippingCharge: 99, freeShippingThreshold: 2000, prepaidDiscount: 100 }) },
  },
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('prices come from the catalogue, not the request', async () => {
  const db = createDb(seed);
  const priced = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 1, price: 1 }], '');
  assert.equal(priced.subtotal, 1499);
  assert.equal(priced.shippingCharge, 99); // below the free-shipping threshold
  assert.equal(priced.prepaidDiscount, 100);
  assert.equal(priced.finalTotal, 1499 + 99 - 100);
});

test('free shipping above threshold, coupon capped at maxDiscount', async () => {
  const db = createDb(seed);
  const priced = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 2 }], 'save10');
  assert.equal(priced.subtotal, 2998);
  assert.equal(priced.shippingCharge, 0);
  assert.equal(priced.couponDiscount, 200);
  assert.equal(priced.couponCode, 'SAVE10');
  assert.equal(priced.finalTotal, 2998 - 200 - 100);
});

test('inactive, used-up and below-minimum coupons are rejected', async () => {
  const db = createDb(seed);
  await assert.rejects(priceCart(db, [{ productId: 'p2', size: '', quantity: 1 }], 'OFF'), /no longer active/);
  await assert.rejects(priceCart(db, [{ productId: 'p2', size: '', quantity: 1 }], 'USEDUP'), /usage limit/);
  await assert.rejects(priceCart(db, [{ productId: 'p2', size: '', quantity: 1 }], 'SAVE10'), /minimum order/);
  await assert.rejects(priceCart(db, [{ productId: 'p2', size: '', quantity: 1 }], 'NOPE'), /not valid/);
});

test('stock, size and quantity limits are enforced', async () => {
  const db = createDb(seed);
  await assert.rejects(priceCart(db, [{ productId: 'p3', size: '', quantity: 1 }], ''), /sold out/);
  await assert.rejects(priceCart(db, [{ productId: 'p1', size: 'S', quantity: 3 }, { productId: 'p1', size: 'M', quantity: 3 }], ''), /Only 5 pieces/);
  await assert.rejects(priceCart(db, [{ productId: 'p1', size: 'XL', quantity: 1 }], ''), /not available/);
  await assert.rejects(priceCart(db, [{ productId: 'p1', size: 'M', quantity: 0 }], ''), /Quantity/);
  await assert.rejects(priceCart(db, [], ''), /empty/);
});

test('combo discount applies at the minimum piece count, before the coupon', async () => {
  const db = createDb({
    ...seed,
    storefront_settings: {
      ...seed.storefront_settings,
      comboOffer: { value_json: JSON.stringify({ enabled: true, percent: 15, minItems: 2 }) },
    },
  });
  const single = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 1 }], '');
  assert.equal(single.comboDiscount, 0);
  const pair = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 1 }, { productId: 'p1', size: 'L', quantity: 1 }], 'SAVE10');
  assert.equal(pair.comboDiscount, Math.round(2998 * 0.15)); // 450
  assert.equal(pair.couponDiscount, 200); // 10% of 2548 = 255, capped at 200
  assert.equal(pair.finalTotal, 2998 - 450 - 200 - 100);
  const off = createDb({ ...seed, storefront_settings: { ...seed.storefront_settings, comboOffer: { value_json: JSON.stringify({ enabled: false, percent: 15, minItems: 2 }) } } });
  assert.equal((await priceCart(off, [{ productId: 'p1', size: 'M', quantity: 2 }], '')).comboDiscount, 0);
});

test('category / product-limited coupon applies only to eligible lines', async () => {
  const db = createDb({
    ...seed,
    products: {
      ...seed.products,
      k1: { name: 'Kurta Set', category: 'Kurta Sets', price: 2000, stockQuantity: 5, inStock: true, sizes: [] },
      d1: { name: 'Dress', category: 'Dresses', price: 1000, stockQuantity: 5, inStock: true, sizes: [] },
    },
    coupons: {
      ...seed.coupons,
      k10: { code: 'KURTA10', discountType: 'percentage', discountValue: 10, minOrderValue: 0, isActive: true, allowedCategories: ['kurta sets'] },
      pick: { code: 'PICK500', discountType: 'fixed', discountValue: 500, minOrderValue: 0, isActive: true, allowedProductIds: ['d1'] },
      big: { code: 'BIG5000', discountType: 'fixed', discountValue: 5000, minOrderValue: 0, isActive: true, allowedProductIds: ['d1'] },
    },
  });
  const both = [{ productId: 'k1', size: '', quantity: 1 }, { productId: 'd1', size: '', quantity: 1 }];
  const mixed = await priceCart(db, both, 'KURTA10');
  assert.equal(mixed.subtotal, 3000);
  assert.equal(mixed.couponDiscount, 200); // 10% of the 2000 kurta set only
  assert.equal((await priceCart(db, both, 'pick500')).couponDiscount, 500);
  assert.equal((await priceCart(db, both, 'BIG5000')).couponDiscount, 1000); // never more than the eligible lines
  await assert.rejects(priceCart(db, [{ productId: 'd1', size: '', quantity: 1 }], 'KURTA10'), /valid only on kurta sets/);
  await assert.rejects(priceCart(db, [{ productId: 'k1', size: '', quantity: 1 }], 'PICK500'), /valid only on selected products/);
});

test('per-customer coupon limit counts only paid orders by the same email or mobile', async () => {
  const db = createDb({
    ...seed,
    coupons: { ...seed.coupons, once: { code: 'ONCE', discountType: 'fixed', discountValue: 100, minOrderValue: 0, isActive: true, perUserLimit: 1 } },
    orders: {
      o1: { couponCode: 'ONCE', paymentStatus: 'Paid', customerEmail: 'asha@example.com', customerMobile: '9876543210' },
      o2: { couponCode: 'ONCE', paymentStatus: 'Unpaid', customerEmail: 'meera@example.com', customerMobile: '9123456780' },
    },
  });
  const items = [{ productId: 'p2', size: '', quantity: 1 }];
  await assert.rejects(priceCart(db, items, 'ONCE', { email: 'Asha@Example.com', phone: '' }), /once per customer/);
  await assert.rejects(priceCart(db, items, 'ONCE', { email: 'new@example.com', phone: '+91 98765 43210' }), /once per customer/);
  const ok = await priceCart(db, items, 'ONCE', { email: 'meera@example.com', phone: '9123456780' }); // only an unpaid order
  assert.equal(ok.couponDiscount, 100);
  assert.ok(db.queries.length > 0 && db.queries.every((q) => q.collection === 'orders' && q.max === 1), 'reads are limited to perUserLimit documents');
  // Without a known customer (bag preview) the limit is not checked
  assert.equal((await priceCart(db, items, 'ONCE')).couponDiscount, 100);
});

test('fixed coupon never exceeds subtotal', () => {
  assert.equal(couponDiscountFor({ discountType: 'fixed', discountValue: 5000 }, 999), 999);
});

const paidSetup = () => {
  const db = createDb(seed);
  db.data.orders = {
    'SAG-1': {
      orderNumber: 'SAG-1', razorpayOrderId: 'order_1', paymentStatus: 'Unpaid', status: 'Pending', couponId: 'c1',
      items: [{ product: { id: 'p1' }, quantity: 2 }, { product: { id: 'p1' }, quantity: 1 }, { product: { id: 'p2' }, quantity: 3 }],
      timeline: [],
    },
  };
  return db;
};

test('paying deducts stock once, never below zero, and counts coupon use', async () => {
  const db = paidSetup();
  const first = await finalizePaidOrder(db, 'SAG-1', { paymentId: 'pay_1', razorpayOrderId: 'order_1', source: 'test' });
  assert.equal(first.changed, true);
  assert.equal(db.data.products.p1.stockQuantity, 2); // 5 - 3
  assert.equal(db.data.products.p2.stockQuantity, 0); // only 1 was left
  assert.equal(db.data.products.p2.inStock, false);
  assert.equal(db.data.coupons.c1.usageCount, 1);
  const order = db.data.orders['SAG-1'];
  assert.equal(order.paymentStatus, 'Paid');
  assert.equal(order.status, 'Processing');
  assert.deepEqual(order.deductedQuantities, { p1: 3, p2: 1 });
  assert.equal(order.stockShortfall.length, 1);

  const again = await finalizePaidOrder(db, 'SAG-1', { paymentId: 'pay_1', razorpayOrderId: 'order_1', source: 'webhook' });
  assert.equal(again.changed, false, 'verify + webhook must not double-deduct');
  assert.equal(db.data.products.p1.stockQuantity, 2);
  assert.equal(db.data.coupons.c1.usageCount, 1);
});

test('payment for a different Razorpay order is refused', async () => {
  const db = paidSetup();
  await assert.rejects(finalizePaidOrder(db, 'SAG-1', { paymentId: 'pay_x', razorpayOrderId: 'order_OTHER', source: 'test' }), /does not match/);
  assert.equal(db.data.products.p1.stockQuantity, 5);
});

test('cancelling restores exactly what was deducted, only once', async () => {
  const db = paidSetup();
  await finalizePaidOrder(db, 'SAG-1', { paymentId: 'pay_1', razorpayOrderId: 'order_1', source: 'test' });
  const restore = async () => db.runTransaction(async (tx) => {
    const order = (await tx.get(db.collection('orders').doc('SAG-1'))).data();
    const result = await restoreOrderStock(tx, db, order);
    result.apply?.();
    tx.update(db.collection('orders').doc('SAG-1'), { stockDeducted: false, deductedQuantities: {} });
  });
  await restore();
  assert.equal(db.data.products.p1.stockQuantity, 5);
  assert.equal(db.data.products.p2.stockQuantity, 1);
  assert.equal(db.data.products.p2.inStock, true);
  await restore();
  assert.equal(db.data.products.p1.stockQuantity, 5, 'second cancel must not add stock again');
});

const cancelSetup = (overrides = {}) => {
  const db = createDb(seed);
  db.data.orders = {
    'SAG-2': {
      orderNumber: 'SAG-2', customerEmail: 'asha@example.com', paymentStatus: 'Paid', status: 'Processing',
      paymentRef: 'pay_2', finalTotal: 1398, timeline: [{ status: 'Processing', at: '2026-09-01T00:00:00.000Z', note: 'Payment received' }],
      deliveryAddress: { fullName: 'Asha', mobile: '9876543210', email: 'asha@example.com', houseFlat: '12 Rose Villa', street: 'MG Road', area: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      ...overrides,
    },
  };
  return db;
};

test('cancel eligibility: only paid orders that are not shipped yet (packed still counts), one request per order', () => {
  const base = { paymentStatus: 'Paid', status: 'Processing' };
  assert.equal(cancelBlockReason(base), '');
  assert.equal(cancelBlockReason({ ...base, status: 'Pending' }), '');
  assert.equal(cancelBlockReason({ ...base, status: 'Packed' }), '', 'a packed order is still in the store');
  for (const status of ['Shipped', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned', 'Refund Requested']) {
    assert.match(cancelBlockReason({ ...base, status }), /already been shipped/, status);
  }
  assert.match(cancelBlockReason({ ...base, status: 'Cancelled' }), /already cancelled/);
  assert.match(cancelBlockReason({ paymentStatus: 'Refunded', status: 'Refunded' }), /refunded/);
  assert.match(cancelBlockReason({ ...base, paymentStatus: 'Unpaid', status: 'Pending' }), /Only paid/);
  assert.match(cancelBlockReason({ ...base, cancelRequest: { reason: 'x', at: 'y' } }), /already with our team/);
});

test('owner can request cancellation: request + timeline recorded, status and stock untouched', async () => {
  const db = cancelSetup();
  const order = await requestCancellation(db, { orderNumber: 'sag-2', email: 'Asha@Example.com', reason: `  Ordered the wrong size ${'x'.repeat(400)}` });
  const saved = db.data.orders['SAG-2'];
  assert.equal(saved.status, 'Processing', 'the admin decides; status is not changed');
  assert.equal(saved.paymentStatus, 'Paid', 'no automatic refund');
  assert.equal(saved.cancelRequest.reason.length, 300);
  assert.ok(saved.cancelRequest.reason.startsWith('Ordered the wrong size'));
  assert.ok(!Number.isNaN(new Date(saved.cancelRequest.at).getTime()));
  assert.equal(saved.timeline.length, 2);
  assert.equal(saved.timeline[1].status, 'Cancellation requested');
  assert.equal(order.cancelRequest.reason, saved.cancelRequest.reason);
  assert.equal(db.data.products.p1.stockQuantity, 5);
  await assert.rejects(requestCancellation(db, { orderNumber: 'SAG-2', email: 'asha@example.com', reason: 'again please' }), /already with our team/);
  assert.equal(db.data.orders['SAG-2'].timeline.length, 2, 'a second request writes nothing');
});

test('cancellation request is refused for other customers, guests, bad input and ineligible orders', async () => {
  const db = cancelSetup();
  await assert.rejects(requestCancellation(db, { orderNumber: 'SAG-2', email: 'someone@else.com', reason: 'Changed my mind' }), (error) => error.status === 404);
  await assert.rejects(requestCancellation(db, { orderNumber: 'SAG-2', email: '', reason: 'Changed my mind' }), (error) => error.status === 401);
  await assert.rejects(requestCancellation(db, { orderNumber: 'SAG-404', email: 'asha@example.com', reason: 'Changed my mind' }), (error) => error.status === 404);
  await assert.rejects(requestCancellation(db, { orderNumber: 'SAG-2', email: 'asha@example.com', reason: ' ' }), /why you want to cancel/);
  assert.equal(db.data.orders['SAG-2'].cancelRequest, undefined);
  for (const [overrides, pattern] of [
    [{ status: 'Shipped' }, /already been shipped/],
    [{ status: 'Out for Delivery' }, /already been shipped/],
    [{ status: 'Delivered' }, /already been shipped/],
    [{ status: 'Cancelled' }, /already cancelled/],
    [{ paymentStatus: 'Unpaid', status: 'Pending' }, /Only paid/],
  ]) {
    const other = cancelSetup(overrides);
    await assert.rejects(requestCancellation(other, { orderNumber: 'SAG-2', email: 'asha@example.com', reason: 'Changed my mind' }), (error) => pattern.test(error.message) && error.status === 409);
    assert.equal(other.data.orders['SAG-2'].cancelRequest, undefined);
  }
});

test('a packed order can still be asked to be cancelled: the request is recorded and the order stays Packed', async () => {
  const db = cancelSetup({ status: 'Packed' });
  const order = await requestCancellation(db, { orderNumber: 'SAG-2', email: 'asha@example.com', reason: 'Changed my mind' });
  const saved = db.data.orders['SAG-2'];
  assert.equal(order.cancelRequest.reason, 'Changed my mind');
  assert.deepEqual([saved.status, saved.paymentStatus, saved.cancelRequest.reason], ['Packed', 'Paid', 'Changed my mind']);
  assert.equal(saved.timeline.at(-1).status, 'Cancellation requested');
  // The request stays open while the order is packed; it closes only when the order is shipped, kept or cancelled
  assert.equal(cancelRequestOutcome(saved), null);
  assert.equal(cancelRequestOutcome(saved, { nextStatus: 'Shipped' }), 'kept');
  assert.equal(cancelRequestOutcome(saved, { nextStatus: 'Cancelled' }), 'cancelled');
});

test('guest lookups get the short view; the owner view adds the full address and payment reference', () => {
  const order = cancelSetup().data.orders['SAG-2'];
  const pub = publicOrderView(order);
  assert.equal(pub.paymentRef, undefined);
  assert.equal(pub.deliveryAddress, undefined, 'no address in a guest lookup');
  assert.equal(pub.cancelRequest, null);
  const own = ownerOrderView({ ...order, cancelRequest: { reason: 'r', at: 'a' } });
  assert.equal(own.paymentRef, 'pay_2');
  assert.equal(own.deliveryAddress.houseFlat, '12 Rose Villa');
  assert.equal(own.deliveryAddress.mobile, '9876543210');
  assert.equal(own.cancelRequest.reason, 'r');
  assert.equal(own.customerMobile, '');
});

test('an open cancellation request is closed by keep, by shipping the order (or any later status), and by cancel / refund', () => {
  const open = { status: 'Processing', cancelRequest: { reason: 'r', at: 'a' } };
  assert.equal(cancelRequestOutcome(open), null, 'a plain save (e.g. tracking only) leaves it open');
  assert.equal(cancelRequestOutcome(open, { nextStatus: 'Pending' }), null);
  assert.equal(cancelRequestOutcome(open, { nextStatus: 'Packed' }), null, 'packing the order leaves the request open');
  assert.equal(cancelRequestOutcome({ ...open, status: 'Packed' }), null, 'a request on a packed order stays open');
  assert.equal(cancelRequestOutcome({ ...open, status: 'Packed' }, { keep: true }), 'kept');
  assert.equal(cancelRequestOutcome(open, { keep: true }), 'kept');
  for (const status of ['Shipped', 'In Transit', 'Out for Delivery', 'Delivered']) {
    assert.equal(cancelRequestOutcome(open, { nextStatus: status }), 'kept', status);
    assert.equal(cancelRequestOutcome({ ...open, status: 'Packed' }, { nextStatus: status }), 'kept', `Packed -> ${status}`);
  }
  for (const status of ['Cancelled', 'Refund Requested', 'Refunded']) assert.equal(cancelRequestOutcome(open, { nextStatus: status }), 'cancelled', status);
  assert.equal(cancelRequestOutcome(open, { nextStatus: 'Cancelled', keep: true }), 'cancelled', 'cancelling wins over keep');
  // A request left open on an order that has already moved on (older data) closes on the next save.
  assert.equal(cancelRequestOutcome({ ...open, status: 'Shipped' }), 'kept');
  assert.equal(cancelRequestOutcome({ ...open, status: 'Cancelled' }, { keep: true }), 'cancelled');
  assert.equal(cancelRequestOutcome({ ...open, cancelRequest: { ...open.cancelRequest, handledAt: 'h', outcome: 'kept' } }, { nextStatus: 'Cancelled' }), null, 'already closed');
  assert.equal(cancelRequestOutcome({ status: 'Processing' }, { keep: true }), null, 'no request');
});

test('the store alert result is recorded on the request, kept from the customer view', async () => {
  const db = cancelSetup();
  await requestCancellation(db, { orderNumber: 'SAG-2', email: 'asha@example.com', reason: 'Changed my mind' });
  await recordCancelRequestAlert(db, 'SAG-2', false);
  const saved = db.data.orders['SAG-2'];
  assert.equal(saved.cancelRequest.storeNotified, false);
  assert.equal(saved.cancelRequest.reason, 'Changed my mind');
  assert.equal(publicOrderView(saved).cancelRequest.storeNotified, undefined);
  assert.equal(publicOrderView(saved).cancelRequest.reason, undefined, 'the reason is for the owner only');
  assert.deepEqual(Object.keys(ownerOrderView(saved).cancelRequest).sort(), ['at', 'reason']);
  const closed = ownerOrderView({ ...saved, cancelRequest: { ...saved.cancelRequest, handledAt: 'h', outcome: 'kept' } }).cancelRequest;
  assert.deepEqual(closed, { reason: 'Changed my mind', at: saved.cancelRequest.at, handledAt: 'h', outcome: 'kept' });
  // Nothing to record on an order without a request.
  const other = cancelSetup();
  await recordCancelRequestAlert(other, 'SAG-2', true);
  assert.equal(other.data.orders['SAG-2'].cancelRequest, undefined);
});

// ---- Returns / exchanges and order tracking ----

const DAY = 24 * 60 * 60 * 1000;
const CLOUD = 'democloud';
const photoUrl = (key = 'a'.repeat(24)) => `https://media.suitauragirls.in/i/returns/rt_${key}/w1100.webp`;
const deliveredOrder = (overrides = {}) => ({
  orderNumber: 'SAG-3', customerEmail: 'asha@example.com', customerName: 'Asha', customerMobile: '9876543210',
  paymentStatus: 'Paid', status: 'Delivered', paymentRef: 'pay_3', finalTotal: 3997, giftNote: 'Happy birthday',
  items: [
    { id: 'p1-M-Red', product: { id: 'p1', name: 'Suit One', price: 1499, originalPrice: 2499, images: ['a.jpg'] }, selectedSize: 'M', selectedColor: { name: 'Red', hex: '#f00' }, quantity: 2 },
    { id: 'p4-L-Default', product: { id: 'p4', name: 'Clearance Kurti', price: 999, originalPrice: 2400, images: ['b.jpg'] }, selectedSize: 'L', selectedColor: { name: 'Default', hex: '' }, quantity: 1 },
  ],
  timeline: [
    { status: 'Processing', at: '2026-09-01T00:00:00.000Z', note: 'Payment received' },
    { status: 'Delivered', at: '2026-09-10T10:00:00.000Z', note: 'internal: left with guard' },
  ],
  deliveryAddress: { fullName: 'Asha', mobile: '9876543210', email: 'asha@example.com', houseFlat: '12 Rose Villa', street: 'MG Road', area: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  ...overrides,
});
const deliveredMs = new Date('2026-09-10T10:00:00.000Z').getTime();
const catalogue = new Map([['p1', { sizes: ['S', 'M', 'L'] }], ['p4', { sizes: ['M', 'L', 'XL'] }]]);
const photoCheck = (url) => Boolean(returnPhotoKey(url));

test('return window: until 11:59 pm India time on the 7th day after delivery; unknown delivery date is left to the admin', () => {
  // Delivered 10 Sept, 3:30 pm IST: requests are taken until 17 Sept, 11:59:59 pm IST (6:29:59 pm UTC).
  const order = deliveredOrder();
  const lastMoment = Date.parse('2026-09-17T18:29:59.999Z');
  assert.equal(returnWindowEndsAt(order), '2026-09-17T18:29:59.999Z');
  assert.equal(returnBlockReason(order, deliveredMs + 2 * DAY), '');
  assert.equal(returnBlockReason(order, deliveredMs + 7 * DAY + 60 * 60 * 1000), '', 'later in the day shown as the last day still counts');
  assert.equal(returnBlockReason(order, lastMoment), '', 'the last moment of the window still counts');
  assert.match(returnBlockReason(order, lastMoment + 1), /7-day return \/ exchange window .* ended on 17 Sept?\.? 2026/);
  // Delivered just after midnight IST on 11 Sept (still 10 Sept in UTC): the window runs to 18 Sept, 11:59 pm IST.
  const lateNight = deliveredOrder({ timeline: [{ status: 'Delivered', at: '2026-09-10T18:40:00.000Z' }] });
  assert.equal(returnWindowEndsAt(lateNight), '2026-09-18T18:29:59.999Z');
  const noDate = deliveredOrder({ timeline: [] });
  assert.equal(returnWindowEndsAt(noDate), '');
  assert.equal(returnBlockReason(noDate, deliveredMs + 60 * DAY), '');
});

test('return eligibility: delivered + paid only, one open request at a time, never the same piece twice', () => {
  const now = deliveredMs + DAY;
  for (const status of ['Pending', 'Processing', 'Packed', 'Shipped', 'Cancelled']) {
    assert.match(returnBlockReason(deliveredOrder({ status }), now), /once the order has been delivered/, status);
  }
  assert.match(returnBlockReason(deliveredOrder({ paymentStatus: 'Unpaid' }), now), /Only paid orders/);
  assert.match(returnBlockReason(deliveredOrder({ status: 'Refunded', paymentStatus: 'Refunded' }), now), /already been refunded/);
  for (const status of ['requested', 'approved', 'received']) {
    assert.match(returnBlockReason(deliveredOrder({ returnRequest: { status, type: 'return' } }), now), /already with our team/, status);
  }
  // A finished request leaves the other pieces open for a new request; once every piece is back, nothing is left.
  const partlyBack = deliveredOrder({ returnRequest: { status: 'refunded', type: 'return', items: [{ line: 0, qty: 1 }] } });
  assert.equal(returnBlockReason(partlyBack, now), '', 'one of the two pieces of line 0 and line 1 can still be asked for');
  assert.deepEqual(returnableQty(partlyBack), [1, 1]);
  const allBack = deliveredOrder({
    returnRequest: { status: 'exchanged', type: 'exchange', items: [{ line: 1, qty: 1 }, { line: 0, qty: 1 }] },
    pastReturnRequests: [{ status: 'refunded', type: 'return', items: [{ line: 0, qty: 1 }] }],
  });
  assert.deepEqual(returnableQty(allBack), [0, 0]);
  assert.match(returnBlockReason(allBack, now), /Every piece of this order has already been returned or exchanged/);
  assert.deepEqual(returnableQty(deliveredOrder({ returnRequest: { status: 'rejected', type: 'return', items: [{ line: 0, qty: 2 }] } })), [2, 1], 'rejected requests do not count');
  assert.equal(returnBlockReason(deliveredOrder({ returnRequest: { status: 'exchanged', type: 'exchange', items: [{ line: 1, qty: 1 }] } }), deliveredMs + 30 * DAY).includes('window'), true, 'the window still applies');
  assert.equal(returnBlockReason(deliveredOrder({ returnRequest: { status: 'rejected', type: 'return' } }), now), '', 'a rejected request can be followed by a new one');
  assert.match(returnBlockReason(deliveredOrder({ returnRequest: { status: 'rejected' }, pastReturnRequests: [{}, {}] }), now), /several return requests/);
  // Older requests: { reason, at } with the order status Refund Requested, or one the store handled before item-level returns.
  assert.match(returnBlockReason(deliveredOrder({ status: 'Refund Requested', returnRequest: { reason: 'too big', at: 'x' } }), now), /already with our team/);
  assert.match(returnBlockReason(deliveredOrder({ returnRequest: { reason: 'too big', at: 'x' } }), now), /already been handled/);
});

test('return photos: only the store\'s own storage, the returns folder and a server-issued key', () => {
  assert.equal(returnPhotoKey(photoUrl()), `rt_${'a'.repeat(24)}`);
  assert.equal(returnPhotoKey(photoUrl().replace('media.suitauragirls.in', 'media.example.com')), null, 'another host');
  assert.equal(returnPhotoKey(photoUrl().replace('https://', 'http://')), null);
  assert.equal(returnPhotoKey(photoUrl().replace('/returns/', '/reviews/')), null, 'another folder');
  assert.equal(returnPhotoKey(photoUrl().replace('w1100.webp', 'w480.webp')), null, 'only the saved address of a photo');
  assert.equal(returnPhotoKey(photoUrl('A'.repeat(24))), null);
  assert.equal(returnPhotoKey(photoUrl().replace('/rt_', '/xx_')), null, 'only an id this server issued');
  assert.equal(returnPhotoKey(`${photoUrl()}?x=1`), null);
});

test('return request validation: items, quantities, clearance, sizes, reasons and photos', () => {
  const order = deliveredOrder();
  const opts = { products: catalogue, isPhotoUrl: photoCheck };
  const ok = validateReturnInput(order, { type: 'return', items: [{ line: 0, qty: 2 }], reason: "Size doesn't fit", details: '  Too loose  ', photos: [] }, opts);
  assert.equal(ok.type, 'return');
  assert.deepEqual(ok.items.map((i) => [i.line, i.qty, i.size, i.name, i.clearance, i.color]), [[0, 2, 'M', 'Suit One', false, 'Red']]);
  assert.equal(ok.details, 'Too loose');
  assert.equal(isClearanceLine(order.items[1]), true);
  assert.equal(isClearanceLine(order.items[0]), false);
  assert.equal(isClearanceLine({ product: { price: 1000 } }), false, 'no original price: not clearance');

  const bad = (input, pattern) => assert.throws(() => validateReturnInput(order, { reason: "Size doesn't fit", ...input }, opts), pattern);
  bad({ type: 'refund', items: [{ line: 0, qty: 1 }] }, /return or exchange/);
  bad({ type: 'return', items: [] }, /at least one item/);
  bad({ type: 'return', items: [{ line: 5, qty: 1 }] }, /not in this order/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }, { line: 0, qty: 1 }] }, /not in this order/);
  bad({ type: 'return', items: [{ line: 0, qty: 3 }] }, /between 1 and 2/);
  bad({ type: 'return', items: [{ line: 0, qty: 0 }] }, /between 1 and 2/);
  bad({ type: 'return', items: [{ line: 0, qty: 1.5 }] }, /between 1 and 2/);
  bad({ type: 'return', items: [{ line: 1, qty: 1 }] }, /clearance .* only be exchanged/);
  bad({ type: 'exchange', items: [{ line: 1, qty: 1 }] }, /choose the size you want for Clearance Kurti/);
  bad({ type: 'exchange', items: [{ line: 0, qty: 1, exchangeSize: 'XXL' }] }, /Size XXL is not offered/);
  bad({ type: 'exchange', items: [{ line: 0, qty: 1 }] }, /or tell us in the note/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], reason: 'Because' }, /choose a reason/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], reason: 'Other', details: 'no' }, /a little more/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], reason: 'Damaged / defective' }, /at least one photo/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], reason: 'Wrong item received' }, /at least one photo/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], photos: ['https://example.com/x.jpg'] }, /photos could not be used/);
  bad({ type: 'return', items: [{ line: 0, qty: 1 }], photos: ['1', '2', '3', '4', '5'].map((d) => photoUrl(d.repeat(24))) }, /at most 4/);

  const exchange = validateReturnInput(order, {
    type: 'exchange',
    items: [{ line: 1, qty: 1, exchangeSize: 'XL' }, { line: 0, qty: 1 }],
    reason: 'Damaged / defective',
    details: 'Stitching came apart; any size is fine',
    photos: [photoUrl(), photoUrl()],
  }, opts);
  assert.deepEqual(exchange.items.map((i) => [i.line, i.exchangeSize]), [[1, 'XL'], [0, '']]);
  assert.equal(exchange.photos.length, 1, 'duplicate photos are dropped');
});

const withRequest = (request, overrides = {}) => deliveredOrder({
  returnRequest: { type: 'return', status: 'requested', reason: "Size doesn't fit", details: '', photos: [], at: '2026-09-11T00:00:00.000Z', history: [{ status: 'requested', at: '2026-09-11T00:00:00.000Z', note: '' }], items: [{ line: 0, qty: 2, name: 'Suit One', size: 'M' }], ...request },
  ...overrides,
});

test('admin return lifecycle: approve → received → refunded; a whole-order refund refunds the order', () => {
  let order = withRequest({ items: [{ line: 0, qty: 2 }, { line: 1, qty: 1 }] });
  const at = '2026-09-12T00:00:00.000Z';
  let result = applyReturnAction(order, 'approve', { note: 'Please pack it; our courier will call you.', at });
  assert.equal(result.request.status, 'approved');
  assert.equal(result.request.adminNote, 'Please pack it; our courier will call you.');
  assert.equal(result.request.approvedAt, at);
  assert.equal(result.update.status, undefined, 'the order stays Delivered');
  assert.equal(result.update.timeline.at(-1).status, 'Return approved');
  order = { ...order, ...result.update };
  assert.equal(isReturnOpen(order), true);
  assert.throws(() => applyReturnAction(order, 'approve', { at }), /already approved/);
  assert.throws(() => applyReturnAction(order, 'exchange', { at }), /mark it refunded/);
  result = applyReturnAction(order, 'receive', { at });
  order = { ...order, ...result.update };
  assert.equal(order.returnRequest.status, 'received');
  assert.equal(order.returnRequest.adminNote, '', 'a note belongs to its own step: the approval instructions are not repeated');
  assert.equal(order.returnRequest.history[1].note, 'Please pack it; our courier will call you.', 'earlier notes stay in the history');
  result = applyReturnAction(order, 'refund', { note: 'Refunded ₹3,997 to your UPI.', at });
  order = { ...order, ...result.update };
  assert.equal(order.returnRequest.status, 'refunded');
  assert.equal(order.returnRequest.adminNote, 'Refunded ₹3,997 to your UPI.');
  assert.equal(order.status, 'Refunded');
  assert.equal(order.paymentStatus, 'Refunded');
  assert.equal(order.timeline.at(-1).status, 'Refunded');
  assert.deepEqual(order.returnRequest.history.map((h) => h.status), ['requested', 'approved', 'received', 'refunded']);
  assert.equal(isReturnOpen(order), false);
  assert.throws(() => applyReturnAction(order, 'reject', { note: 'late', at }), /already refunded/);
});

test('admin return lifecycle: partial refunds keep the order; approve and reject need a note; exchanges complete', () => {
  const partial = withRequest({ status: 'approved', adminNote: 'Send it to our shop' });
  const refunded = applyReturnAction(partial, 'refund', { at: 'now' });
  assert.equal(refunded.update.status, undefined, 'only part of the order came back');
  assert.equal(refunded.update.paymentStatus, undefined);
  assert.equal(refunded.update.timeline.at(-1).status, 'Refund issued');
  assert.equal(refunded.request.adminNote, '', 'no note on this step');

  // The rest came back in a second request: now every piece is refunded, so the order is Refunded.
  const second = deliveredOrder({
    pastReturnRequests: [{ ...refunded.request }],
    returnRequest: { type: 'return', status: 'received', items: [{ line: 1, qty: 1 }], history: [] },
  });
  const all = applyReturnAction(second, 'refund', { at: 'later' });
  assert.equal(all.update.status, 'Refunded');
  assert.equal(all.update.paymentStatus, 'Refunded');
  // An exchange of the other piece does not make the order Refunded.
  const mixed = applyReturnAction({ ...second, pastReturnRequests: [{ ...refunded.request, status: 'exchanged', type: 'exchange' }] }, 'refund', { at: 'later' });
  assert.equal(mixed.update.status, undefined);

  assert.throws(() => applyReturnAction(withRequest({}), 'approve', { note: '' }), /next steps for the customer/);
  assert.throws(() => applyReturnAction(withRequest({}), 'reject', { note: ' ' }), /short note/);
  const rejected = applyReturnAction(withRequest({}), 'reject', { note: 'The tags were removed.' });
  assert.equal(rejected.request.status, 'rejected');
  assert.equal(rejected.update.timeline.at(-1).status, 'Return rejected');

  const exchange = withRequest({ type: 'exchange', status: 'approved', items: [{ line: 0, qty: 1, exchangeSize: 'L' }] });
  assert.throws(() => applyReturnAction(exchange, 'refund'), /mark it exchanged/);
  const done = applyReturnAction(exchange, 'exchange', { note: 'New piece sent, AWB 123' });
  assert.equal(done.request.status, 'exchanged');
  assert.equal(done.update.status, undefined);
  assert.equal(done.update.timeline.at(-1).status, 'Exchange completed');
  assert.throws(() => applyReturnAction(exchange, 'dance'), /Unknown return action/);
  assert.throws(() => applyReturnAction(exchange, '__proto__'), /Unknown return action/);
  assert.throws(() => applyReturnAction(deliveredOrder(), 'approve'), /no return or exchange request/);
});

test('older return requests keep working and are upgraded when the admin acts', () => {
  const legacy = deliveredOrder({ status: 'Refund Requested', returnRequest: { reason: 'Too big for me', at: '2026-09-11T00:00:00.000Z' } });
  const view = normalizeReturnRequest(legacy);
  assert.equal(view.status, 'requested');
  assert.equal(view.details, 'Too big for me');
  assert.equal(isReturnOpen(legacy), true);
  assert.equal(normalizeReturnRequest({ ...legacy, status: 'Refunded' }).status, 'refunded');
  assert.equal(normalizeReturnRequest({ ...legacy, status: 'Delivered' }).status, 'closed');
  assert.equal(isReturnOpen({ ...legacy, status: 'Delivered' }), false);

  const approved = applyReturnAction(legacy, 'approve', { note: 'Please hand it to our courier.', at: 't' });
  assert.equal(approved.update.status, 'Delivered', 'the request now tracks the return; the order goes back to Delivered');
  assert.equal(approved.request.legacy, undefined);
  assert.equal(approved.request.items.length, 2, 'the whole order');
  assert.deepEqual(approved.request.history.map((h) => h.status), ['requested', 'approved']);
  const full = applyReturnAction({ ...legacy, ...approved.update }, 'refund', { at: 't2' });
  assert.equal(full.update.status, 'Refunded');
  assert.throws(() => applyReturnAction({ ...legacy, status: 'Delivered' }, 'approve', { note: 'ok then' }), /already been handled/);

  // Setting the whole order to Refunded closes an open return request too, without the earlier step's note.
  const closed = closeReturnOnRefund(legacy, 't3');
  assert.equal(closed.status, 'refunded');
  assert.equal(closed.history.at(-1).note, 'Order marked Refunded');
  assert.equal(closeReturnOnRefund(withRequest({ status: 'approved', adminNote: 'Pack it with the tags' }), 't4').adminNote, '');
  assert.equal(closeReturnOnRefund(withRequest({ type: 'exchange' })), null, 'exchanges are not refunds');
  assert.equal(closeReturnOnRefund(withRequest({ status: 'rejected' })), null);
  assert.equal(closeReturnOnRefund(deliveredOrder()), null);
});

test('the store alert result is recorded on a return request', async () => {
  const db = createDb(seed);
  db.data.orders = { 'SAG-3': withRequest({}) };
  await recordReturnRequestAlert(db, 'SAG-3', false);
  assert.equal(db.data.orders['SAG-3'].returnRequest.storeNotified, false);
  assert.equal(ownerOrderView(db.data.orders['SAG-3']).returnRequest.storeNotified, undefined, 'admin-only');
  db.data.orders['SAG-4'] = deliveredOrder({ orderNumber: 'SAG-4', status: 'Refund Requested', returnRequest: { reason: 'x', at: 'y' } });
  await recordReturnRequestAlert(db, 'SAG-4', true);
  assert.equal(db.data.orders['SAG-4'].returnRequest.storeNotified, undefined, 'older requests are left alone');
});

test('tracking link and expected date entered by the admin are validated', () => {
  assert.equal(cleanTrackingUrl(''), '');
  assert.equal(cleanTrackingUrl('  https://www.delhivery.com/track-v2/package/123  '), 'https://www.delhivery.com/track-v2/package/123');
  for (const bad of ['http://example.com/t', 'javascript:alert(1)', 'www.example.com', 'https://user:pw@example.com/', 'https://localhost/x', `https://example.com/${'x'.repeat(500)}`]) {
    assert.throws(() => cleanTrackingUrl(bad), /https:\/\//, bad);
  }
  assert.equal(cleanExpectedDate(''), '');
  assert.equal(cleanExpectedDate('2026-10-05'), '2026-10-05');
  for (const bad of ['2026-02-30', '05-10-2026', '2026-10-5', 'tomorrow', '1999-01-01']) assert.throws(() => cleanExpectedDate(bad), /real date/, bad);
});

test('guest tracking view: progress, courier and items only; the owner also sees address, photos and eligibility', () => {
  const order = withRequest({ photos: [photoUrl()], details: 'Too loose', adminNote: 'Keep the tags on', storeNotified: true }, {
    courierPartner: 'Delhivery', trackingNumber: 'AWB1', trackingUrl: 'https://t.example.com/1', expectedDeliveryDate: '2026-09-09',
    estimatedDeliveryDate: 'Wed Sep 08 2026', notes: 'internal', customerNote: 'Delivered to the guard', stockShortfall: [],
  });
  const pub = publicOrderView(order);
  for (const key of ['deliveryAddress', 'customerEmail', 'customerMobile', 'customerName', 'paymentRef', 'paymentMethod', 'giftNote', 'notes', 'emailLog']) {
    assert.equal(pub[key], undefined, key);
  }
  assert.equal(pub.estimatedDeliveryDate, '', 'an old automatic estimate is never shown');
  assert.deepEqual(pub.timeline[1], { status: 'Delivered', at: '2026-09-10T10:00:00.000Z' }, 'timeline notes stay private');
  assert.equal(pub.trackingUrl, 'https://t.example.com/1');
  assert.equal(pub.expectedDeliveryDate, '2026-09-09');
  assert.equal(pub.courierPartner, 'Delhivery');
  assert.deepEqual(Object.keys(pub.items[0]).sort(), ['id', 'product', 'quantity', 'selectedColor', 'selectedSize']);
  assert.equal(pub.items[0].product.images[0], 'a.jpg');
  assert.equal(pub.returnRequest.status, 'requested');
  assert.equal(pub.returnRequest.photos, undefined);
  assert.equal(pub.returnRequest.details, undefined);
  assert.equal(pub.returnRequest.adminNote, undefined);

  const own = ownerOrderView(order);
  assert.equal(own.deliveryAddress.houseFlat, '12 Rose Villa');
  assert.equal(own.customerMobile, '••••••3210');
  assert.equal(own.giftNote, 'Happy birthday');
  assert.equal(own.estimatedDeliveryDate, '', 'the old automatic estimate is never shown');
  assert.deepEqual(own.returnRequest.photos, [photoUrl()]);
  assert.equal(own.returnRequest.adminNote, 'Keep the tags on');
  assert.equal(own.returnRequest.storeNotified, undefined);
  assert.equal(own.returnEligibility.canRequest, false);
  assert.match(own.returnEligibility.reason, /already with our team/);
  const fresh = ownerOrderView(deliveredOrder({ timeline: [] }));
  assert.deepEqual(fresh.returnEligibility, { canRequest: true, reason: '', windowEndsAt: '', remaining: [2, 1] });
  assert.deepEqual(fresh.pastReturnRequests, []);

  // A cancellation reason is free text (it can hold a new phone number or address): the owner only.
  const withCancel = { ...order, cancelRequest: { reason: 'Wrong address, call me on 9123456789', at: 'a', handledAt: 'h', outcome: 'kept', storeNotified: true } };
  assert.deepEqual(publicOrderView(withCancel).cancelRequest, { at: 'a', handledAt: 'h', outcome: 'kept' });
  assert.equal(ownerOrderView(withCancel).cancelRequest.reason, 'Wrong address, call me on 9123456789');
  assert.equal(ownerOrderView(withCancel).cancelRequest.storeNotified, undefined);
});

test('earlier requests: the owner sees them (no photos); pieces already back cannot be asked for again', () => {
  const past = { type: 'return', status: 'refunded', reason: "Size doesn't fit", details: 'Loose', photos: [photoUrl()], at: '2026-09-11T00:00:00.000Z', adminNote: 'Refund sent', history: [{ status: 'requested', at: '2026-09-11T00:00:00.000Z', note: '' }, { status: 'refunded', at: '2026-09-12T00:00:00.000Z', note: 'Refund sent' }], items: [{ line: 0, qty: 1, name: 'Suit One', size: 'M' }] };
  const order = deliveredOrder({ returnRequest: past, timeline: [] }); // no delivery date: the window is left to the admin
  const own = ownerOrderView(order);
  assert.equal(own.returnEligibility.canRequest, true);
  assert.deepEqual(own.returnEligibility.remaining, [1, 1]);
  const opts = { products: catalogue, isPhotoUrl: photoCheck };
  assert.throws(() => validateReturnInput(order, { type: 'return', items: [{ line: 0, qty: 2 }], reason: "Size doesn't fit" }, opts), /between 1 and 1 for Suit One/);
  assert.equal(validateReturnInput(order, { type: 'return', items: [{ line: 0, qty: 1 }], reason: "Size doesn't fit" }, opts).items[0].qty, 1);
  const allOfLine0 = deliveredOrder({ returnRequest: { ...past, items: [{ line: 0, qty: 2 }] } });
  assert.throws(() => validateReturnInput(allOfLine0, { type: 'return', items: [{ line: 0, qty: 1 }], reason: "Size doesn't fit" }, opts), /already been returned or exchanged/);

  // Once the new request is filed, the finished one is kept in pastReturnRequests and shown to the owner without photos.
  const later = ownerOrderView(deliveredOrder({ pastReturnRequests: [past], returnRequest: { ...past, status: 'requested', history: [], adminNote: '' } }));
  assert.equal(later.pastReturnRequests.length, 1);
  assert.equal(later.pastReturnRequests[0].status, 'refunded');
  assert.equal(later.pastReturnRequests[0].photos, undefined);
  assert.equal(later.pastReturnRequests[0].adminNote, 'Refund sent');
  assert.equal(publicOrderView(deliveredOrder({ pastReturnRequests: [past] })).pastReturnRequests, undefined, 'owner only');
});

test('exchange sizes: offered sizes only; a product saved without sizes takes the size shown in the shop; a deleted product none', () => {
  const order = deliveredOrder();
  const exchange = (products, exchangeSize) => validateReturnInput(order, { type: 'exchange', items: [{ line: 0, qty: 1, exchangeSize }], reason: "Size doesn't fit" }, { products, isPhotoUrl: photoCheck });
  assert.equal(exchange(new Map([['p1', { sizes: [] }]]), 'XL').items[0].exchangeSize, 'XL');
  assert.throws(() => exchange(new Map(), 'L'), /Size L is not offered/);
  assert.throws(() => exchange(new Map([['p1', { sizes: ['S'] }]]), 'L'), /Size L is not offered/);
});

test('oldest requests (only the status Refund Requested and a notes line) show up and can be handled', () => {
  const notes = 'Gift wrap please\n[RETURN/EXCHANGE REQUEST] Type: Exchange | Reason: Size does not fit | Note: Need L instead of M';
  assert.deepEqual(legacyNotesRequest(notes), { type: 'exchange', details: 'Size does not fit — Need L instead of M' });
  assert.deepEqual(legacyNotesRequest('[RETURN/EXCHANGE REQUEST] Type: Return | Reason: Not as expected | Note: None'), { type: 'return', details: 'Not as expected' });
  assert.deepEqual(legacyNotesRequest(''), { type: 'return', details: '' });

  const oldest = deliveredOrder({ status: 'Refund Requested', notes });
  const view = normalizeReturnRequest(oldest);
  assert.equal(view.legacy, true);
  assert.equal(view.status, 'requested');
  assert.equal(view.type, 'exchange');
  assert.equal(view.details, 'Size does not fit — Need L instead of M');
  assert.equal(isReturnOpen(oldest), true);
  assert.match(returnBlockReason(oldest, deliveredMs + DAY), /already with our team/);
  assert.equal(ownerOrderView(oldest).returnRequest.status, 'requested');
  assert.equal(ownerOrderView(oldest).returnRequest.type, 'exchange');
  assert.equal(normalizeReturnRequest(deliveredOrder({ notes })), null, 'the notes line alone is not a request once the order moved on');

  const approved = applyReturnAction(oldest, 'approve', { note: 'Send it back with the tags; we will ship size L.', at: 't' });
  assert.equal(approved.update.status, 'Delivered');
  assert.equal(approved.request.type, 'exchange');
  assert.equal(approved.request.items.length, 2);
  const done = applyReturnAction({ ...oldest, ...approved.update }, 'exchange', { at: 't2' });
  assert.equal(done.request.status, 'exchanged');
  assert.equal(done.update.status, undefined);
  assert.equal(closeReturnOnRefund(oldest), null, 'an exchange is not closed by a refund');
});

test('accessories never count towards the combo minimum', async () => {
  const db = createDb({
    ...seed,
    // p1 is a combo here, so its earrings can go with it (accessories are sold only with their outfit)
    products: { ...seed.products, p1: { ...seed.products.p1, setType: '3 piece' }, acc1: { name: 'Earrings', price: 149, stockQuantity: 9, inStock: true, sizes: ['Free Size'], productType: 'accessory' } },
    storefront_settings: { ...seed.storefront_settings, comboOffer: { value_json: JSON.stringify({ enabled: true, percent: 15, minItems: 2 }) } },
  });
  const mixed = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 1 }, { productId: 'acc1', size: 'Free Size', quantity: 1, parentId: 'p1' }], '');
  assert.equal(mixed.comboDiscount, 0);
  const pair = await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 2 }, { productId: 'acc1', size: 'Free Size', quantity: 1, parentId: 'p1' }], '');
  assert.equal(pair.comboDiscount, Math.round((2998 + 149) * 0.15));
});

// "Complete the look": accessories only ever go with their combo outfit
const lookSeed = (relations) => ({
  ...seed,
  products: {
    ...seed.products,
    c1: { name: 'Combo Set', price: 850, stockQuantity: 9, inStock: true, sizes: ['S', 'M'], setType: '3 piece' },
    bag: { name: 'Bag', price: 79, stockQuantity: 9, inStock: true, sizes: ['Free Size'], productType: 'accessory', accessoryType: 'Bag' },
    heels: { name: 'Heels', price: 99, stockQuantity: 9, inStock: true, sizes: ['UK 5', 'UK 6'], productType: 'accessory', accessoryType: 'Heels' },
    gone: { name: 'Hidden', price: 50, stockQuantity: 9, inStock: true, sizes: ['Free Size'], productType: 'accessory', hidden: true },
  },
  storefront_settings: { ...seed.storefront_settings, ...(relations ? { lookRelations: { value_json: JSON.stringify(relations) } } : {}) },
});

test('accessories are sold only with their outfit', async () => {
  const db = createDb(lookSeed());
  // on its own, or claiming an outfit that is not in the bag
  await assert.rejects(priceCart(db, [{ productId: 'bag', size: 'Free Size', quantity: 1 }], ''), /sold only with their outfit/);
  await assert.rejects(priceCart(db, [{ productId: 'bag', size: 'Free Size', quantity: 1, parentId: 'c1' }], ''), /sold only with their outfit/);
  // with an outfit that is not a combo / set
  await assert.rejects(priceCart(db, [{ productId: 'p1', size: 'M', quantity: 1 }, { productId: 'bag', size: 'Free Size', quantity: 1, parentId: 'p1' }], ''), /sold only with their outfit/);
  // with its combo outfit: accepted, and the line remembers the outfit
  const ok = await priceCart(db, [{ productId: 'c1', size: 'M', quantity: 1 }, { productId: 'bag', size: 'Free Size', quantity: 1, parentId: 'c1' }, { productId: 'heels', size: 'UK 6', quantity: 1, parentId: 'c1' }], '');
  const bagLine = ok.lines.find((line) => line.product.id === 'bag');
  assert.equal(bagLine.lookParentId, 'c1');
  assert.equal(bagLine.lookParentName, 'Combo Set');
  assert.ok(bagLine.id.endsWith('-look-c1'));
  assert.equal(ok.lines.find((line) => line.product.id === 'c1').lookParentId, undefined);
  assert.equal(ok.subtotal, 850 + 79 + 99);
  // never more of an accessory than pieces of its outfit (sizes added together)
  await assert.rejects(priceCart(db, [{ productId: 'c1', size: 'M', quantity: 1 }, { productId: 'heels', size: 'UK 5', quantity: 1, parentId: 'c1' }, { productId: 'heels', size: 'UK 6', quantity: 1, parentId: 'c1' }], ''), /up to 1 × Heels/);
  const two = await priceCart(db, [{ productId: 'c1', size: 'M', quantity: 2 }, { productId: 'heels', size: 'UK 5', quantity: 1, parentId: 'c1' }, { productId: 'heels', size: 'UK 6', quantity: 1, parentId: 'c1' }], '');
  assert.equal(two.lines.length, 3);
});

test('the admin\'s picks decide which accessories go with a combo', async () => {
  const picked = createDb(lookSeed({ c1: ['heels'] }));
  await assert.rejects(priceCart(picked, [{ productId: 'c1', size: 'M', quantity: 1 }, { productId: 'bag', size: 'Free Size', quantity: 1, parentId: 'c1' }], ''), /not part of the look/);
  await priceCart(picked, [{ productId: 'c1', size: 'M', quantity: 1 }, { productId: 'heels', size: 'UK 5', quantity: 1, parentId: 'c1' }], '');
  // picks that are all hidden fall back to every published accessory (same as the product page)
  const hiddenPicks = createDb(lookSeed({ c1: ['gone'] }));
  await priceCart(hiddenPicks, [{ productId: 'c1', size: 'M', quantity: 1 }, { productId: 'bag', size: 'Free Size', quantity: 1, parentId: 'c1' }], '');
});

const withStore = (store) => ({
  ...seed,
  storefront_settings: { storeSettings: { value_json: JSON.stringify({ shippingCharge: 99, freeShippingThreshold: 2000, prepaidDiscount: 100, ...store }) } },
});

test('minimum and maximum order value (after discounts, before shipping) are enforced', async () => {
  // p2: 999 − 100 prepaid = 899 before shipping
  await assert.rejects(priceCart(createDb(withStore({ minOrderAmount: 900 })), [{ productId: 'p2', size: '', quantity: 1 }], ''), /Minimum order is ₹900/);
  assert.equal((await priceCart(createDb(withStore({ minOrderAmount: 899 })), [{ productId: 'p2', size: '', quantity: 1 }], '')).finalTotal, 998);
  await assert.rejects(priceCart(createDb(withStore({ maxOrderAmount: 2000 })), [{ productId: 'p1', size: 'M', quantity: 2 }], ''), /Maximum order is ₹2,000/);
  assert.ok(await priceCart(createDb(withStore({ minOrderAmount: 0, maxOrderAmount: 0 })), [{ productId: 'p1', size: 'M', quantity: 3 }], ''));
});

test('coupons switched off by the owner are refused everywhere; orders without a coupon still work', async () => {
  const db = createDb(withStore({ couponsEnabled: false }));
  await assert.rejects(priceCart(db, [{ productId: 'p1', size: 'M', quantity: 2 }], 'SAVE10'), /Coupons are not available right now/);
  await assert.rejects(validateCoupon(db, 'SAVE10', 5000), /Coupons are not available right now/);
  assert.equal((await priceCart(db, [{ productId: 'p1', size: 'M', quantity: 2 }], '')).couponDiscount, 0);
  // Default (not set) keeps coupons on
  assert.equal((await validateCoupon(createDb(seed), 'SAVE10', 5000)).discount, 200);
});

test('cancellation time limit counts from payment; 0 or no payment time = no extra limit', async () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const order = { paymentStatus: 'Paid', status: 'Processing', paidAt: '2026-10-01T10:00:00Z' }; // 26 hours earlier
  assert.match(cancelBlockReason(order, { windowHours: 24, now }), /within 24 hours of payment/);
  assert.equal(cancelBlockReason(order, { windowHours: 48, now }), '');
  assert.equal(cancelBlockReason(order, { windowHours: 0, now }), '');
  assert.equal(cancelBlockReason({ paymentStatus: 'Paid', status: 'Processing' }, { windowHours: 1, now }), '');
  assert.equal(cancelBlockReason({ ...order, status: 'Packed' }, { windowHours: 48, now }), '', 'a packed order inside the window can be asked for');
  assert.match(cancelBlockReason({ ...order, status: 'Packed' }, { windowHours: 24, now }), /within 24 hours of payment/, 'the time limit applies to a packed order too');
  assert.match(cancelBlockReason({ ...order, status: 'Shipped' }, { windowHours: 48, now }), /already been shipped/, 'never after it is shipped');
  // requestCancellation reads the owner's window (no limit until the owner sets one)
  const lateOrders = { 'SAG-9': { orderNumber: 'SAG-9', customerEmail: 'a@b.com', paymentStatus: 'Paid', status: 'Processing', paidAt: '2020-01-01T00:00:00Z', timeline: [] } };
  const limited = createDb({ orders: structuredClone(lateOrders), storefront_settings: { storeSettings: { value_json: JSON.stringify({ cancellationWindowHours: 24 }) } } });
  await assert.rejects(requestCancellation(limited, { orderNumber: 'SAG-9', email: 'a@b.com', reason: 'Changed my mind' }), /within 24 hours/);
  const noLimit = createDb({ orders: structuredClone(lateOrders) });
  const ok = await requestCancellation(noLimit, { orderNumber: 'SAG-9', email: 'a@b.com', reason: 'Changed my mind' });
  assert.ok(ok.cancelRequest);
});

test('delivery estimate: processing + delivery days, Sundays skipped, null when not configured', () => {
  const fmt = (date) => date.toISOString().slice(0, 10);
  // Wed 30 Sep 2026, 10:00 India time
  const from = new Date('2026-09-30T04:30:00Z');
  assert.equal(estimateDelivery({}, from), null);
  assert.equal(estimateDelivery({ processingDays: 2 }, from), null);
  const window = estimateDelivery({ processingDays: 1, deliveryMinDays: 3, deliveryMaxDays: 5 }, from);
  assert.equal(fmt(window.min), '2026-10-05'); // Thu, Fri, Sat, (Sun skipped) Mon
  assert.equal(fmt(window.max), '2026-10-07'); // … Tue, Wed
  const one = estimateDelivery({ deliveryMaxDays: 4 }, from);
  assert.equal(fmt(one.min), fmt(one.max));
  // Late evening in India already counts as the next day
  assert.equal(fmt(estimateDelivery({ deliveryMinDays: 1, deliveryMaxDays: 1 }, new Date('2026-10-03T19:00:00Z')).max), '2026-10-05');
});

test('customer views return the estimate unless the admin set an expected date', () => {
  const base = { orderNumber: 'SAG-1', items: [], timeline: [], estimatedDeliveryDate: '2026-10-07T06:30:00.000Z', deliveryEstimateSource: 'settings' };
  assert.equal(publicOrderView(base).estimatedDeliveryDate, '2026-10-07T06:30:00.000Z');
  assert.equal(ownerOrderView({ ...base, deliveryEstimateSource: undefined }).estimatedDeliveryDate, '', 'only estimates made from the owner\'s delivery days');
  assert.equal(ownerOrderView(base).estimatedDeliveryDate, '2026-10-07T06:30:00.000Z');
  assert.equal(ownerOrderView({ ...base, expectedDeliveryDate: '2026-10-06' }).estimatedDeliveryDate, '');
  assert.equal(ownerOrderView({ ...base, expectedDeliveryDate: '2026-10-06' }).expectedDeliveryDate, '2026-10-06');
});

test('new statuses exist in the right order; the store new-order alert never throws and skips test payments', async () => {
  assert.ok(ORDER_STATUSES.indexOf('In Transit') === ORDER_STATUSES.indexOf('Shipped') + 1);
  assert.ok(ORDER_STATUSES.indexOf('Out for Delivery') === ORDER_STATUSES.indexOf('In Transit') + 1);
  assert.ok(ORDER_STATUSES.includes('Returned'));
  const db = createDb(withStore({ storeEmail: 'owner@shop.in' }));
  const sent = [];
  const send = async (order, to) => { sent.push({ order: order.orderNumber, to }); };
  assert.equal(await alertStoreOfNewOrder(db, { orderNumber: 'SAG-1' }, { send }), true);
  assert.deepEqual(sent, [{ order: 'SAG-1', to: 'owner@shop.in' }]);
  assert.equal(await alertStoreOfNewOrder(db, { orderNumber: 'SAG-2', testPayment: true }, { send }), false);
  assert.equal(sent.length, 1);
  const broken = async () => { throw new Error('EMAIL_DELIVERY_FAILED'); };
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await alertStoreOfNewOrder(db, { orderNumber: 'SAG-3' }, { send: broken }), false);
  } finally {
    console.error = quiet;
  }
});

// ---- online payment discount: flat amount and / or percent on products above the owner's minimum ----

const prepaidSeed = (store, extra = {}) => ({
  products: {
    a: { name: 'Above', price: 1500, stockQuantity: 9, inStock: true, sizes: [] },
    b: { name: 'Below', price: 500, stockQuantity: 9, inStock: true, sizes: [] },
    edge: { name: 'Exactly 700', price: 700, stockQuantity: 9, inStock: true, sizes: [] },
    over: { name: 'Just over', price: 701, stockQuantity: 9, inStock: true, sizes: [] },
    tiny: { name: 'Tiny', price: 50, stockQuantity: 9, inStock: true, sizes: [] },
  },
  coupons: {
    ten: { code: 'TEN', discountType: 'percentage', discountValue: 10, minOrderValue: 0, isActive: true },
  },
  storefront_settings: {
    storeSettings: { value_json: JSON.stringify({ shippingCharge: 0, freeShippingThreshold: 0, ...store }) },
    ...extra,
  },
});
const one = (productId, quantity = 1) => ({ productId, size: '', quantity });

test('prepaid percent only: 10% off a product above the minimum, nothing flat', async () => {
  const db = createDb(prepaidSeed({ prepaidDiscount: 0, prepaidPercent: 10, prepaidMinPrice: 700 }));
  const priced = await priceCart(db, [one('a')], '');
  assert.equal(priced.prepaidDiscount, 150);
  assert.equal(priced.finalTotal, 1350);
  assert.equal(priced.discountAmount, 150);
  // quantity counts: the minimum is checked on the unit price
  assert.equal((await priceCart(db, [one('a', 2)], '')).prepaidDiscount, 300);
  // minimum 0 = every product
  const all = createDb(prepaidSeed({ prepaidPercent: 10, prepaidMinPrice: 0 }));
  assert.equal((await priceCart(all, [one('a'), one('b')], '')).prepaidDiscount, 200);
});

test('prepaid percent: the minimum is strict and a mixed bag discounts only the products above it', async () => {
  const db = createDb(prepaidSeed({ prepaidPercent: 10, prepaidMinPrice: 700 }));
  // exactly ₹700 with minimum 700 gets nothing; ₹701 does
  const edge = await priceCart(db, [one('edge')], '');
  assert.equal(edge.prepaidDiscount, 0);
  assert.equal(edge.finalTotal, 700);
  assert.equal((await priceCart(db, [one('over')], '')).prepaidDiscount, 70); // round(70.1)
  // two cheap pieces together cost more than the minimum, but each unit price is below it
  assert.equal((await priceCart(db, [one('b', 2)], '')).prepaidDiscount, 0);
  // mixed: only the ₹1500 product counts
  const mixed = await priceCart(db, [one('a'), one('b'), one('edge')], '');
  assert.equal(mixed.subtotal, 2700);
  assert.equal(mixed.prepaidDiscount, 150);
  assert.equal(mixed.finalTotal, 2550);
});

test('prepaid percent with a 10% coupon and with the combo offer: taken on what is left of the eligible products', async () => {
  const db = createDb(prepaidSeed({ prepaidPercent: 10, prepaidMinPrice: 700 }));
  // whole bag eligible: 1500 − 150 coupon = 1350, then 10% = 135
  const single = await priceCart(db, [one('a')], 'TEN');
  assert.equal(single.couponDiscount, 150);
  assert.equal(single.prepaidDiscount, 135);
  assert.equal(single.finalTotal, 1215);
  // mixed bag: 2000 − 200 coupon = 1800; the eligible share is 1800 × 1500 / 2000 = 1350, then 10% = 135
  const mixed = await priceCart(db, [one('a'), one('b')], 'TEN');
  assert.equal(mixed.couponDiscount, 200);
  assert.equal(mixed.prepaidDiscount, 135);
  assert.equal(mixed.finalTotal, 1665);
  assert.equal(mixed.discountAmount, 335);
  // combo 20% on 2+ pieces: 2000 − 400 = 1600; eligible share 1200, then 10% = 120
  const combo = createDb(prepaidSeed({ prepaidPercent: 10, prepaidMinPrice: 700 }, { comboOffer: { value_json: JSON.stringify({ enabled: true, percent: 20, minItems: 2 }) } }));
  const withCombo = await priceCart(combo, [one('a'), one('b')], '');
  assert.equal(withCombo.comboDiscount, 400);
  assert.equal(withCombo.prepaidDiscount, 120);
  assert.equal(withCombo.finalTotal, 1480);
});

test('prepaid flat and percent together are added; the flat amount still applies to a bag with no eligible product', async () => {
  const db = createDb(prepaidSeed({ prepaidDiscount: 100, prepaidPercent: 10, prepaidMinPrice: 700 }));
  const both = await priceCart(db, [one('a')], '');
  assert.equal(both.prepaidDiscount, 250);
  assert.equal(both.finalTotal, 1250);
  const flatOnly = await priceCart(db, [one('b')], '');
  assert.equal(flatOnly.prepaidDiscount, 100);
  assert.equal(flatOnly.finalTotal, 400);
  // the minimum order check sees the amount after the whole prepaid discount
  const limited = createDb(prepaidSeed({ prepaidDiscount: 100, prepaidPercent: 10, prepaidMinPrice: 700, minOrderAmount: 1251 }));
  await assert.rejects(priceCart(limited, [one('a')], ''), /Minimum order is ₹1,251/);
});

test('prepaid discount is capped so the order never drops below ₹1; a percent above 50 is treated as 50', async () => {
  const flat = createDb(prepaidSeed({ prepaidDiscount: 100, prepaidPercent: 50, prepaidMinPrice: 0 }));
  const capped = await priceCart(flat, [one('tiny')], '');
  assert.equal(capped.prepaidDiscount, 49); // 100 + 25 would be more than the ₹50 bag
  assert.equal(capped.finalTotal, 1);
  const huge = createDb(prepaidSeed({ prepaidPercent: 95, prepaidMinPrice: 0 }));
  assert.equal((await priceCart(huge, [one('a')], '')).prepaidDiscount, 750);
  // junk values switch the percent off
  const junk = createDb(prepaidSeed({ prepaidPercent: 'abc', prepaidMinPrice: -5 }));
  assert.equal((await priceCart(junk, [one('a')], '')).prepaidDiscount, 0);
});

test('prepaid percent not set = the old flat behaviour, unchanged', async () => {
  const old = createDb(prepaidSeed({ prepaidDiscount: 100 }));
  const priced = await priceCart(old, [one('a'), one('b')], 'TEN');
  assert.equal(priced.couponDiscount, 200);
  assert.equal(priced.prepaidDiscount, 100);
  assert.equal(priced.finalTotal, 1700);
  // a minimum price on its own (percent 0) changes nothing
  const minOnly = createDb(prepaidSeed({ prepaidDiscount: 100, prepaidPercent: 0, prepaidMinPrice: 700 }));
  assert.equal((await priceCart(minOnly, [one('a')], '')).prepaidDiscount, 100);
  const none = createDb(prepaidSeed({}));
  assert.equal((await priceCart(none, [one('a')], '')).prepaidDiscount, 0);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
