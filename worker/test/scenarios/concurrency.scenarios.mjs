// Scenario 11: requests that arrive at the same moment. Counters must be exact, a payment must be applied
// once, stock must never be taken twice, and limits must hold when several requests race for them.
// The same scenarios run twice: on the node:sqlite stand-in (concurrency.test.mjs) and on real local D1
// (concurrency-real-d1.test.mjs), where statements of parallel requests really interleave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, lineOf, pickOutfit, sendRazorpayWebhook, verifyPayment } from '../harness/checkout.mjs';

/** Registers the scenarios on a started harness. */
export const concurrencyScenarios = async (h) => {
  const outfit = pickOutfit(h.exported('products'));
  const day = h.today();
  const number = (value) => Number(value) || 0;
  const daily = async () => (await h.doc('daily_analytics', day)) || {};
  const lifetime = async () => (await h.doc('analytics_totals', 'lifetime')) || {};
  const stock = async () => (await h.doc('products', outfit.id)).stockQuantity;
  const confirmationsFor = (orderNumber) => h.mail.filter((mail) => mail.subject === `Order ${orderNumber} confirmed — payment received`);
  const statuses = (responses) => responses.map((response) => response.status);

  await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
  await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), minOrderAmount: 0, maxOrderAmount: 0, couponsEnabled: true });
  await h.put('coupons', 'harness10', { code: 'HARNESS10', discountType: 'percentage', discountValue: 10, minOrderValue: 0, isActive: true, usageLimit: 0, usageCount: 0 });

  const unpaidOrder = async (email, quantity = 1, couponCode) => {
    const created = await createOrder(h, { email, items: [lineOf(outfit, quantity)], couponCode });
    assert.equal(created.status, 200, created.text);
    return { orderNumber: created.body.orderNumber, razorpayOrderId: created.body.razorpayOrderId };
  };

  // ---- counters ----

  test('20 visitors arriving together are each counted exactly once', async () => {
    const [dailyBefore, lifetimeBefore] = [await daily(), await lifetime()];
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => h.post(
      '/api/track',
      { event: 'visit', visitorId: `vis_parallel_${index}`, path: '/' },
      { ip: h.nextIp() },
    )));
    for (const response of responses) assert.deepEqual(response.body, { ok: true, counted: true });

    const [dailyAfter, lifetimeAfter] = [await daily(), await lifetime()];
    assert.equal(number(dailyAfter.totalUniqueVisitors) - number(dailyBefore.totalUniqueVisitors), 20);
    assert.equal(number(dailyAfter.visits) - number(dailyBefore.visits), 20);
    assert.equal(number(dailyAfter.otherVisitors) - number(dailyBefore.otherVisitors), 20);
    assert.equal(number(lifetimeAfter.visits) - number(lifetimeBefore.visits), 20);
    assert.equal(number(lifetimeAfter.uniqueVisitors) - number(lifetimeBefore.uniqueVisitors), 20);
    const sessions = await h.store.getMany(Array.from({ length: 20 }, (_, index) => ({ collection: 'visitor_sessions', id: `vis_parallel_${index}` })));
    assert.ok(sessions.every((session) => session?.data.visitCount === 1));
  });

  test('10 visitors viewing one product together: the product\'s counter is exactly 10 higher', async () => {
    const key = `${day}_${outfit.id}`;
    const before = { views: number((await h.doc('product_daily', key))?.views), productViews: number((await daily()).productViews) };
    const responses = await Promise.all(Array.from({ length: 10 }, () => h.post('/api/track', { event: 'product_view', productId: outfit.id }, { ip: h.nextIp() })));
    for (const response of responses) assert.deepEqual(response.body, { ok: true, counted: true });
    assert.equal(number((await h.doc('product_daily', key)).views) - before.views, 10);
    assert.equal(number((await daily()).productViews) - before.productViews, 10);
  });

  test('one visitor firing the same view 10 times at once is counted once', async () => {
    const key = `${day}_${outfit.id}`;
    const before = number((await h.doc('product_daily', key)).views);
    const ip = h.nextIp();
    const responses = await Promise.all(Array.from({ length: 10 }, () => h.post('/api/track', { event: 'product_view', productId: outfit.id }, { ip })));
    assert.deepEqual(statuses(responses), Array(10).fill(200));
    assert.equal(responses.filter((response) => response.body.counted).length, 1);
    assert.equal(number((await h.doc('product_daily', key)).views) - before, 1);
  });

  test('visits and views mixed with other events at the same time all land', async () => {
    const before = await daily();
    const visits = Array.from({ length: 8 }, (_, index) => h.post('/api/track', { event: 'visit', visitorId: `vis_mixed_${index}`, path: '/' }, { ip: h.nextIp() }));
    const views = Array.from({ length: 8 }, () => h.post('/api/track', { event: 'product_view', productId: outfit.id }, { ip: h.nextIp() }));
    const searches = Array.from({ length: 8 }, () => h.post('/api/track', { event: 'search', term: 'cotton suit' }, { ip: h.nextIp() }));
    const responses = await Promise.all([...visits, ...views, ...searches]);
    for (const response of responses) assert.deepEqual(response.body, { ok: true, counted: true });
    const after = await daily();
    assert.deepEqual(
      [number(after.visits) - number(before.visits), number(after.productViews) - number(before.productViews), number(after.searches) - number(before.searches)],
      [8, 8, 8],
    );
    const terms = (await h.docs('search_terms')).filter((row) => row.data.day === day && row.data.term === 'cotton suit');
    assert.deepEqual(terms.map((row) => row.data.count), [8]);
  });

  // ---- payments ----

  test('two verifications of the same payment at once: paid once, stock taken once, one confirmation email', async () => {
    await h.update('products', outfit.id, { stockQuantity: 10, inStock: true });
    const order = await unpaidOrder('twice@example.test', 2, 'HARNESS10');
    const purchasesBefore = number((await daily()).purchases);

    const responses = await Promise.all([1, 2].map(() => verifyPayment(h, { ...order, paymentId: 'pay_Parallel001' })));
    assert.deepEqual(statuses(responses), [200, 200]);
    for (const response of responses) assert.equal(response.body.order.paymentStatus, 'Paid');

    const stored = await h.doc('orders', order.orderNumber);
    assert.deepEqual([stored.paymentStatus, stored.deductedQuantities], ['Paid', { [outfit.id]: 2 }]);
    assert.deepEqual(stored.timeline.map((entry) => entry.status), ['Pending', 'Processing']);
    assert.equal(await stock(), 8);
    assert.equal((await h.doc('coupons', 'harness10')).usageCount, 1);
    assert.equal(number((await daily()).purchases) - purchasesBefore, 1);
    assert.equal(confirmationsFor(order.orderNumber).length, 1);
  });

  test('the browser\'s verification, a repeat of it and Razorpay\'s webhook all at once: still paid once', async () => {
    await h.update('products', outfit.id, { stockQuantity: 10, inStock: true });
    const order = await unpaidOrder('thrice@example.test', 3);
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Parallel002', order_id: order.razorpayOrderId, notes: { order_number: order.orderNumber } } } } };

    const responses = await Promise.all([
      verifyPayment(h, { ...order, paymentId: 'pay_Parallel002' }),
      sendRazorpayWebhook(h, event),
      verifyPayment(h, { ...order, paymentId: 'pay_Parallel002' }),
      sendRazorpayWebhook(h, event),
    ]);
    assert.deepEqual(statuses(responses), [200, 200, 200, 200]);
    assert.equal(responses.filter((response) => response.body.changed === true).length <= 1, true);

    const stored = await h.doc('orders', order.orderNumber);
    assert.deepEqual([stored.paymentStatus, stored.deductedQuantities], ['Paid', { [outfit.id]: 3 }]);
    assert.equal(await stock(), 7);
    assert.equal(confirmationsFor(order.orderNumber).length, 1);
    assert.deepEqual(stored.emailLog.map((entry) => entry.kind), ['confirmed']);
  });

  test('two different orders paying for the last piece at once: both are paid, stock stops at zero, one is flagged short', async () => {
    await h.update('products', outfit.id, { stockQuantity: 1, inStock: true });
    const first = await unpaidOrder('last-a@example.test');
    const second = await unpaidOrder('last-b@example.test');

    const responses = await Promise.all([
      verifyPayment(h, { ...first, paymentId: 'pay_LastPiece_A' }),
      verifyPayment(h, { ...second, paymentId: 'pay_LastPiece_B' }),
    ]);
    assert.deepEqual(statuses(responses), [200, 200]);

    const stored = [await h.doc('orders', first.orderNumber), await h.doc('orders', second.orderNumber)];
    assert.deepEqual(stored.map((order) => order.paymentStatus), ['Paid', 'Paid']);
    const product = await h.doc('products', outfit.id);
    assert.deepEqual([product.stockQuantity, product.inStock], [0, false]);
    // Exactly one piece left the shelf, and exactly one order carries the shortfall note for the owner
    assert.equal(stored.reduce((sum, order) => sum + order.deductedQuantities[outfit.id], 0), 1);
    assert.equal(stored.filter((order) => order.stockShortfall.length === 1).length, 1);
  });

  test('five orders for the same product paid at once: every piece is accounted for', async () => {
    await h.update('products', outfit.id, { stockQuantity: 20, inStock: true });
    const placed = [];
    for (let index = 0; index < 5; index += 1) placed.push(await unpaidOrder(`batch-${index}@example.test`, 2));
    const purchasesBefore = number((await daily()).purchases);

    const responses = await Promise.all(placed.map((order, index) => verifyPayment(h, { ...order, paymentId: `pay_Batch_${index}` })));
    assert.deepEqual(statuses(responses), Array(5).fill(200));
    assert.equal(await stock(), 10);
    assert.equal(number((await daily()).purchases) - purchasesBefore, 5);
    for (const order of placed) assert.equal(confirmationsFor(order.orderNumber).length, 1);
  });

  // ---- limits under a race ----

  test('ten requests for a sign-in code for one address at once: one code is sent', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => h.post('/api/customer-auth', { action: 'send', email: 'race@example.test' }, { ip: h.nextIp() })));
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.ok(responses.every((response) => [200, 429].includes(response.status)), JSON.stringify(statuses(responses)));
    assert.equal(h.mailTo('race@example.test').length, 1);
    assert.equal((await h.doc('customer_email_otps', 'race@example.test__login')).sends.length, 1);
  });

  test('five guesses of a sign-in code at once: none gets in, and they are all counted', async () => {
    const code = h.mailTo('race@example.test')[0].subject.slice(0, 6);
    const wrong = code === '111111' ? '222222' : '111111';
    const responses = await Promise.all(Array.from({ length: 5 }, () => h.post('/api/customer-auth', { action: 'verify', email: 'race@example.test', code: wrong })));
    assert.ok(responses.every((response) => response.status !== 200));
    const stored = await h.doc('customer_email_otps', 'race@example.test__login');
    assert.equal(stored.attempts, 5);
    assert.ok(stored.locked_until > Date.now());
    assert.equal(await h.doc('customers', 'race@example.test'), null);
  });

  test('the same visitor voting a review helpful five times at once: one vote', async () => {
    await h.put('reviews', 'harness-approved', { productId: outfit.id, userName: 'Riya', rating: 5, comment: 'An approved review.', status: 'approved', helpfulCount: 0 });
    const ip = h.nextIp();
    const responses = await Promise.all(Array.from({ length: 5 }, () => h.post('/api/reviews', { action: 'helpful', reviewId: 'harness-approved' }, { ip })));
    assert.deepEqual(statuses(responses), Array(5).fill(200));
    assert.equal(responses.filter((response) => response.body.counted).length, 1);
    assert.equal((await h.doc('reviews', 'harness-approved')).helpfulCount, 1);
  });

  test('eight different visitors voting at once: eight votes', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => h.post('/api/reviews', { action: 'helpful', reviewId: 'harness-approved' }, { ip: h.nextIp() })));
    assert.deepEqual(statuses(responses), Array(8).fill(200));
    assert.equal((await h.doc('reviews', 'harness-approved')).helpfulCount, 9);
  });

  test('admin sign-in: 15 guesses at once from one address: none gets in, and at most 10 are counted as tries', async () => {
    const ip = h.nextIp();
    const responses = await Promise.all(Array.from({ length: 15 }, (_, index) => h.post('/api/admin-config?action=login', { username: 'owner', password: `guess-${index}`, pin: '000000' }, { ip })));
    assert.ok(responses.every((response) => [401, 429].includes(response.status)), JSON.stringify(statuses(responses)));
    assert.ok(responses.every((response) => response.cookies.length === 0 && !response.body.firebaseToken));
    // The handler gives the database 2.5 s; guesses that wait longer than that for their turn fall to its
    // in-memory limiter, so the number of 401s can be above 10 on a slow database. The stored counter cannot.
    assert.ok((await h.doc('rate_limits', `admin_login:${ip}`)).count <= 10);
  });
};
