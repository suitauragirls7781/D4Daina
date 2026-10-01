// Scenario 6: PayU. The fields and hash the browser posts to PayU, and PayU's return to /api/payu
// (a form post from PayU's site, or its server-to-server webhook) with genuine and forged hashes.
// Run: node --test worker/test/scenarios/payu.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { adminPut, signInAdmin } from '../harness/admin.mjs';
import { createOrder, lineOf, newAttemptKey, payuRequestHash, payuResponseHash, pickOutfit } from '../harness/checkout.mjs';

const h = await startHarness();

const MERCHANT_KEY = 'HarnessKey1';
const SALT = 'HarnessSalt0001';
h.services.payu = { key: MERCHANT_KEY, salt: SALT };

const outfit = pickOutfit(h.exported('products'));
await h.update('products', outfit.id, { stockQuantity: 9, inStock: true });
const stock = async () => (await h.doc('products', outfit.id)).stockQuantity;
const confirmationsFor = (orderNumber) => h.mail.filter((mail) => mail.subject === `Order ${orderNumber} confirmed — payment received`);
const storeAlertsFor = (orderNumber) => h.mail.filter((mail) => mail.subject.startsWith(`New order ${orderNumber} `));

const admin = await signInAdmin(h);

/** What PayU posts back for a transaction, signed the way PayU signs it. */
const payuReturn = (fields, status, { salt = SALT, extra = {} } = {}) => {
  const posted = {
    mihpayid: '403993715531077182', mode: 'UPI', status, unmappedstatus: status === 'success' ? 'captured' : 'failed',
    key: fields.key, txnid: fields.txnid, amount: fields.amount, productinfo: fields.productinfo, firstname: fields.firstname,
    email: fields.email, phone: fields.phone, udf1: fields.udf1, ...extra,
  };
  return { ...posted, hash: payuResponseHash(posted, salt) };
};

/** PayU sends the shopper's browser back with a form post from its own site. */
const browserReturn = (posted) => h.call('/api/payu', { method: 'POST', form: posted, origin: 'https://secure.payu.in' });
const webhook = (posted) => h.call('/api/payu?webhook=1', { method: 'POST', form: posted, origin: null, ua: 'PayU-Webhook' });
const payuSays = (txnid, status, amount, extra = {}) => { h.services.payuTransactions[txnid] = { status, amt: amount, mihpayid: '403993715531077182', mode: 'UPI', ...extra }; };
const verifyCalls = () => h.net.calls.filter((call) => /payu\.in\/merchant\/postservice/.test(call.target)).length;

/** Starts a PayU checkout and returns the answer's body. */
const startPayu = async (email, options = {}) => {
  const response = await createOrder(h, { email, items: [lineOf(outfit, 1)], gateway: 'payu', ...options });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.gateway, 'payu');
  return response.body;
};

test('admin: PayU cannot be switched on without its key and salt, then is saved in test mode', async () => {
  const incomplete = await adminPut(h, admin.cookie, { paymentGateways: { payu: { enabled: true } } });
  assert.equal(incomplete.status, 400);
  const badKey = await adminPut(h, admin.cookie, { paymentGateways: { payu: { enabled: true, merchantKey: 'bad key!', salt: SALT } } });
  assert.equal(badKey.status, 400);

  const saved = await adminPut(h, admin.cookie, { paymentGateways: { payu: { enabled: true, mode: 'test', merchantKey: MERCHANT_KEY, salt: SALT } } });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(saved.body.gateways.payu, { enabled: true, mode: 'test', merchantKey: MERCHANT_KEY, saltSet: true, saltHint: `••••${SALT.slice(-4)}` });
  assert.ok(!saved.text.includes(SALT));
  const stored = await h.doc('private_settings', 'payment_gateways');
  assert.deepEqual(stored.payu, { enabled: true, mode: 'test', merchantKey: MERCHANT_KEY, salt: SALT });
  // The server-only document is closed to browsers, the admin's included
  const direct = await h.post('/api/db', { ops: [{ op: 'get', path: 'private_settings/payment_gateways' }] }, { token: admin.token });
  assert.equal(direct.body.results[0].error.code, 'permission-denied');
});

test('test mode: shoppers are not offered PayU; the admin can make a sandbox payment that is flagged and sends no email', async () => {
  const offered = await h.post('/api/orders', { action: 'gateways' });
  assert.deepEqual(offered.body.gateways, { razorpay: true, payu: false });
  const shopper = await createOrder(h, { email: 'sandbox-shopper@example.test', items: [lineOf(outfit, 1)], gateway: 'payu' });
  assert.equal(shopper.body.gateway, 'razorpay');

  const session = await startPayu('sandbox-admin@example.test', { token: admin.token });
  assert.equal(session.payuAction, 'https://test.payu.in/_payment');
  payuSays(session.payuFields.txnid, 'success', session.payuFields.amount);
  const stockBefore = await stock();
  const back = await browserReturn(payuReturn(session.payuFields, 'success'));
  assert.equal(back.status, 303);
  assert.match(back.headers.get('location'), /^\/checkout\?payment=done&order=/);
  assert.equal(h.net.calls.at(-1).target, 'https://test.payu.in/merchant/postservice.php');

  const stored = await h.doc('orders', session.orderNumber);
  assert.equal(stored.paymentStatus, 'Paid');
  assert.equal(stored.testPayment, true);
  assert.match(stored.notes, /PayU TEST mode payment/);
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(confirmationsFor(session.orderNumber).length, 0);
  assert.equal(storeAlertsFor(session.orderNumber).length, 0);
});

test('admin: switching PayU to live keeps the saved key and salt', async () => {
  const saved = await adminPut(h, admin.cookie, { paymentGateways: { payu: { mode: 'live' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual((await h.doc('private_settings', 'payment_gateways')).payu, { enabled: true, mode: 'live', merchantKey: MERCHANT_KEY, salt: SALT });
  const offered = await h.post('/api/orders', { action: 'gateways' });
  assert.deepEqual(offered.body.gateways, { razorpay: true, payu: true });
});

let paid = null; // the session of the order paid in the success test

test('create with PayU: the form fields and the request hash are what PayU expects; no Razorpay order is made', async () => {
  const razorpayOrdersBefore = h.services.razorpayOrders.length;
  const session = await startPayu('payu-buyer@example.test');
  const stored = await h.doc('orders', session.orderNumber);

  assert.equal(session.payuAction, 'https://secure.payu.in/_payment');
  const { hash, ...fields } = session.payuFields;
  assert.deepEqual(fields, {
    key: MERCHANT_KEY,
    txnid: `${session.orderNumber}-1`,
    amount: stored.finalTotal.toFixed(2),
    productinfo: `Order ${session.orderNumber}`,
    firstname: 'Harness Customer',
    email: 'payu-buyer@example.test',
    phone: '9876543210',
    udf1: session.orderNumber,
    surl: 'https://www.suitauragirls.in/api/payu',
    furl: 'https://www.suitauragirls.in/api/payu',
  });
  assert.equal(hash, payuRequestHash(fields, SALT));
  assert.match(hash, /^[a-f0-9]{128}$/);
  assert.ok(!JSON.stringify(session).includes(SALT));

  assert.deepEqual(
    { paymentMethod: stored.paymentMethod, payuTxnId: stored.payuTxnId, payuTxnIds: stored.payuTxnIds, razorpayOrderId: stored.razorpayOrderId, paymentStatus: stored.paymentStatus },
    { paymentMethod: 'payu', payuTxnId: `${session.orderNumber}-1`, payuTxnIds: [`${session.orderNumber}-1`], razorpayOrderId: '', paymentStatus: 'Unpaid' },
  );
  assert.equal(h.services.razorpayOrders.length, razorpayOrdersBefore);
  paid = session;
});

test('return with a forged hash, a foreign merchant key or a changed amount: redirected to "failed", nothing changes, PayU is not asked', async () => {
  const genuine = payuReturn(paid.payuFields, 'success');
  const callsBefore = verifyCalls();
  const forged = {
    'hash made with a guessed salt': payuReturn(paid.payuFields, 'success', { salt: 'GuessedSalt' }),
    'amount changed after signing': { ...genuine, amount: '1.00' },
    'status changed after signing': { ...payuReturn(paid.payuFields, 'failure'), status: 'success' },
    'another merchant': payuReturn({ ...paid.payuFields, key: 'OtherKey' }, 'success'),
    'no hash': { ...genuine, hash: '' },
  };
  for (const [name, posted] of Object.entries(forged)) {
    const back = await browserReturn(posted);
    assert.equal(back.status, 303, name);
    // No signed result link for an unverified post
    assert.equal(back.headers.get('location'), '/checkout?payment=failed', name);
    const hook = await webhook(posted);
    assert.equal(hook.status, 401, name);
  }
  assert.equal(verifyCalls(), callsBefore);
  assert.equal((await h.doc('orders', paid.orderNumber)).paymentStatus, 'Unpaid');
  assert.equal(confirmationsFor(paid.orderNumber).length, 0);
});

test('return with a genuine hash but PayU says it failed: the order stays unpaid and the failure is on its timeline', async () => {
  payuSays(paid.payuFields.txnid, 'failure', paid.payuFields.amount, { error_Message: 'Bank declined' });
  const stockBefore = await stock();
  const back = await browserReturn(payuReturn(paid.payuFields, 'failure'));
  assert.equal(back.status, 303);
  const location = new URL(back.headers.get('location'), 'https://www.suitauragirls.in');
  assert.equal(location.pathname, '/checkout');
  assert.deepEqual([location.searchParams.get('payment'), location.searchParams.get('order'), location.searchParams.get('reason')], ['failed', paid.orderNumber, 'Bank declined']);

  const stored = await h.doc('orders', paid.orderNumber);
  assert.equal(stored.paymentStatus, 'Unpaid');
  assert.equal(stored.timeline.at(-1).status, 'Payment failed');
  assert.equal(await stock(), stockBefore);
});

test('return saying "success" while PayU\'s own record shows a smaller amount: not paid', async () => {
  payuSays(paid.payuFields.txnid, 'success', '1.00');
  const back = await browserReturn(payuReturn(paid.payuFields, 'success'));
  assert.equal(back.status, 303);
  assert.match(back.headers.get('location'), /payment=failed/);
  assert.equal((await h.doc('orders', paid.orderNumber)).paymentStatus, 'Unpaid');
});

let resultLink = null;

test('return with a genuine hash and PayU confirming the full amount: paid once, stock taken, emails sent, signed result link', async () => {
  payuSays(paid.payuFields.txnid, 'success', paid.payuFields.amount);
  const stockBefore = await stock();
  const back = await browserReturn(payuReturn(paid.payuFields, 'success'));
  assert.equal(back.status, 303);
  assert.equal(back.headers.get('cache-control'), 'no-store');
  resultLink = new URL(back.headers.get('location'), 'https://www.suitauragirls.in');
  assert.deepEqual([resultLink.pathname, resultLink.searchParams.get('payment'), resultLink.searchParams.get('order')], ['/checkout', 'done', paid.orderNumber]);

  const stored = await h.doc('orders', paid.orderNumber);
  assert.deepEqual(
    { paymentStatus: stored.paymentStatus, status: stored.status, paidVia: stored.paidVia, paymentRef: stored.paymentRef, deducted: stored.deductedQuantities, testPayment: stored.testPayment },
    { paymentStatus: 'Paid', status: 'Processing', paidVia: 'payu', paymentRef: '403993715531077182', deducted: { [outfit.id]: 1 }, testPayment: undefined },
  );
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(confirmationsFor(paid.orderNumber).length, 1);
  assert.equal(storeAlertsFor(paid.orderNumber).length, 1);

  // PayU repeats itself (browser refresh, then its webhook): nothing more happens
  const repeat = await browserReturn(payuReturn(paid.payuFields, 'success'));
  assert.match(repeat.headers.get('location'), /payment=done/);
  const hook = await webhook(payuReturn(paid.payuFields, 'success'));
  assert.deepEqual(hook.body, { ok: true, changed: false });
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(confirmationsFor(paid.orderNumber).length, 1);
});

test('payment-result: the signed link shows the paid order without sign-in; a wrong or missing token does not', async () => {
  const token = resultLink.searchParams.get('t');
  const result = await h.post('/api/orders', { action: 'payment-result', orderNumber: paid.orderNumber, token });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.paid, true);
  assert.equal(result.body.order.orderNumber, paid.orderNumber);
  assert.equal(result.body.order.deliveryAddress.pincode, '713301');

  const [stamp, mac] = token.split('.');
  const refused = { missing: '', 'changed signature': `${stamp}.${'0'.repeat(mac.length)}`, 'changed time': `${Number(stamp) + 1}.${mac}` };
  for (const [name, bad] of Object.entries(refused)) {
    const response = await h.post('/api/orders', { action: 'payment-result', orderNumber: paid.orderNumber, token: bad });
    assert.equal(response.status, 401, name);
  }
  // A token is for one order only
  const other = await startPayu('payu-other@example.test');
  const crossed = await h.post('/api/orders', { action: 'payment-result', orderNumber: other.orderNumber, token });
  assert.equal(crossed.status, 401);
});

test('webhook: PayU\'s server-to-server call pays an order whose browser never came back', async () => {
  const session = await startPayu('payu-hook@example.test');
  payuSays(session.payuFields.txnid, 'success', session.payuFields.amount);
  const stockBefore = await stock();
  const hook = await webhook(payuReturn(session.payuFields, 'success'));
  assert.equal(hook.status, 200, hook.text);
  assert.deepEqual(hook.body, { ok: true, changed: true });
  const stored = await h.doc('orders', session.orderNumber);
  assert.deepEqual([stored.paymentStatus, stored.paidVia], ['Paid', 'payu-webhook']);
  assert.equal(await stock(), stockBefore - 1);
  assert.equal(confirmationsFor(session.orderNumber).length, 1);
});

test('a transaction id that does not belong to the order is refused even with a genuine hash', async () => {
  const session = await startPayu('payu-txn@example.test');
  const foreignTxn = { ...session.payuFields, txnid: `${session.orderNumber}-9` };
  payuSays(foreignTxn.txnid, 'success', session.payuFields.amount);
  const back = await browserReturn(payuReturn(foreignTxn, 'success'));
  assert.match(back.headers.get('location'), /payment=failed.*reason=order/);
  assert.equal((await h.doc('orders', session.orderNumber)).paymentStatus, 'Unpaid');
  const missing = await browserReturn({ status: 'success' });
  assert.equal(missing.headers.get('location'), '/checkout?payment=failed');
});

test('a second attempt of the same checkout gets a new transaction id; either transaction can pay the order', async () => {
  const attemptKey = newAttemptKey();
  const ip = h.nextIp();
  const first = await startPayu('payu-retry@example.test', { attemptKey, ip });
  const second = await startPayu('payu-retry@example.test', { attemptKey, ip });
  assert.equal(second.orderNumber, first.orderNumber);
  assert.equal(second.payuFields.txnid, `${first.orderNumber}-2`);
  assert.equal(second.payuFields.hash, payuRequestHash(second.payuFields, SALT));
  assert.deepEqual((await h.doc('orders', first.orderNumber)).payuTxnIds, [`${first.orderNumber}-1`, `${first.orderNumber}-2`]);

  // The customer finished the first window after all
  payuSays(first.payuFields.txnid, 'success', first.payuFields.amount);
  const back = await browserReturn(payuReturn(first.payuFields, 'success'));
  assert.match(back.headers.get('location'), /payment=done/);
  assert.equal((await h.doc('orders', first.orderNumber)).paymentStatus, 'Paid');
});

test('opening /api/payu directly sends the shopper back to checkout', async () => {
  const response = await h.call('/api/payu');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/checkout');
  const hook = await h.call('/api/payu?webhook=1');
  assert.equal(hook.status, 405);
});
