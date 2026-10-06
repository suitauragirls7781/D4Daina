// Smoke run of the REAL Worker in local workerd (wrangler dev --local) on real local D1: the unchanged
// api/** handlers, the shims, the adapter and the gateway, bundled as they will be deployed.
// The Node scenario tests (worker/test/scenarios) cover the behaviour in depth; this run proves that the
// same code also starts and works inside the Workers runtime. Outbound calls are answered inside the
// Worker (entry.js), so nothing leaves the machine.
// Run: node worker/test/workerd-smoke/check.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 8795 is the one port local wrangler dev may use on this machine; SMOKE_PORT picks another if it is busy.
const PORT = Number(process.env.SMOKE_PORT) || 8795;
const BASE = `http://127.0.0.1:${PORT}`;
const here = dirname(fileURLToPath(import.meta.url));
// A short path: local D1 fails with "internal error" when its state folder path is very long (Windows).
const stateDir = mkdtempSync(join(tmpdir(), 'sag-smoke-'));
// The made-up values of wrangler.jsonc in this folder
const RAZORPAY_KEY_SECRET = 'SmokeRazorpaySecret01';
const RAZORPAY_WEBHOOK_SECRET = 'smoke-webhook-secret';

const wrangler = spawn(`npx wrangler dev --local --port ${PORT} --ip 127.0.0.1 --persist-to "${stateDir}"`, {
  cwd: here,
  shell: true,
  stdio: 'ignore',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});

const stop = () => {
  // On Windows the shell wrapper does not pass signals on, so the whole process tree is ended
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' });
  else wrangler.kill('SIGTERM');
};

const request = async (path, { method = 'GET', json, raw, headers = {}, token, cookie } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(method === 'GET' ? {} : { origin: BASE }),
      ...(json !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36',
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : raw,
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, headers: response.headers, text, body };
};

const waitUntilUp = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/__smoke/state`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The local worker did not start within 120 seconds.');
};

const readState = (path = '') => request(`/__smoke/state?path=${encodeURIComponent(path)}`).then((response) => response.body);
const orders = (body, options) => request('/api/orders', { method: 'POST', json: body, ...options });

let passed = 0;
const step = async (name, run) => {
  await run();
  passed += 1;
  console.log(`ok  ${name}`);
};

const PRODUCT = {
  name: 'Smoke Cotton Suit', price: 1200, originalPrice: 1500, sizes: ['M', 'L'], stockQuantity: 5, inStock: true, category: 'Suits',
  images: ['https://media.suitauragirls.in/i/product-images/smoke001/w1100.webp'], createdAt: '2026-09-01T00:00:00.000Z',
};
const ADDRESS = { fullName: 'Smoke Customer', mobile: '9876543210', email: 'smoke@example.test', houseFlat: '1 Smoke Lane', city: 'Asansol', state: 'West Bengal', pincode: '713301' };

try {
  await waitUntilUp();

  await step('setup: schema and documents are written to local D1', async () => {
    const response = await request('/__smoke/setup', { method: 'POST', json: { docs: [
      { collection: 'products', id: 'smoke-suit', data: PRODUCT },
      { collection: 'products', id: 'smoke-hidden', data: { ...PRODUCT, hidden: true } },
      { collection: 'storefront_settings', id: 'storeSettings', data: { value_json: JSON.stringify({ storeEmail: 'owner@store.example', shippingCharge: 60, freeShippingThreshold: 0, prepaidDiscount: 40 }) } },
    ] } });
    assert.equal(response.status, 200, response.text);
    const { envAtLoad } = await readState();
    assert.deepEqual(envAtLoad, { SECURE_COOKIES: '1', TRACK_WRITE_BUDGET: '7000' }, 'process.env must hold the Worker vars while api/** modules load');
  });

  await step('catalogue: served by the real handler, cached on the second request, with the security headers', async () => {
    const first = await request('/api/admin-config?action=catalog&v=1');
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.body.products.map((product) => product.id), ['smoke-suit']);
    assert.equal(first.body.settings.storeSettings.shippingCharge, 60);
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    const second = await request('/api/admin-config?action=catalog&v=1');
    assert.equal(second.body.generatedAt, first.body.generatedAt);
  });

  await step('tracking: a visit is counted once (transaction with increments on D1)', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const visit = () => request('/api/track', { method: 'POST', json: { event: 'visit', visitorId: 'vis_smoke_1', path: '/' } });
    assert.deepEqual((await visit()).body, { ok: true, counted: true });
    assert.deepEqual((await visit()).body, { ok: true, counted: false });
    const { doc } = await readState(`daily_analytics/${day}`);
    assert.deepEqual([doc.totalUniqueVisitors, doc.visits], [1, 1]);
  });

  let customerToken = '';
  await step('customer sign-in: code by email, wrong code refused, right code gives a working token', async () => {
    const sent = await request('/api/customer-auth', { method: 'POST', json: { action: 'send', email: 'smoke@example.test' } });
    assert.equal(sent.status, 200, sent.text);
    const { outbound } = await readState();
    const mail = JSON.parse(outbound.findLast((call) => call.target.includes('brevo')).body);
    const code = mail.subject.slice(0, 6);
    const wrong = await request('/api/customer-auth', { method: 'POST', json: { action: 'verify', email: 'smoke@example.test', code: code === '111111' ? '222222' : '111111' } });
    assert.equal(wrong.status, 400);
    const right = await request('/api/customer-auth', { method: 'POST', json: { action: 'verify', email: 'smoke@example.test', code } });
    assert.equal(right.status, 200, right.text);
    customerToken = right.body.firebaseToken;
    assert.deepEqual((await orders({ action: 'my-orders' }, { token: customerToken })).body, { orders: [] });
    assert.equal((await orders({ action: 'my-orders' }, { token: `${customerToken}x` })).status, 401);
  });

  let order = null;
  await step('checkout: the order is priced on the server and a Razorpay order is created for that amount', async () => {
    const created = await orders({ action: 'create', items: [{ productId: 'smoke-suit', size: 'M', quantity: 2, price: 1 }], attemptKey: 'smoke-attempt-key-0001', address: ADDRESS }, { token: customerToken });
    assert.equal(created.status, 200, created.text);
    // 2 x 1200 - 40 prepaid + 60 shipping
    assert.equal(created.body.amount, 242000);
    order = { orderNumber: created.body.orderNumber, razorpayOrderId: created.body.razorpayOrderId };
    const again = await orders({ action: 'create', items: [{ productId: 'smoke-suit', size: 'M', quantity: 2 }], attemptKey: 'smoke-attempt-key-0001', address: ADDRESS }, { token: customerToken });
    assert.equal(again.body.orderNumber, order.orderNumber);
    const hidden = await orders({ action: 'create', items: [{ productId: 'smoke-hidden', size: 'M', quantity: 1 }], address: ADDRESS });
    assert.equal(hidden.status, 409);
  });

  await step('payment: wrong signature refused; right signature pays once and takes the stock once, also when repeated and with the webhook', async () => {
    const verify = (signature) => orders({ action: 'verify', orderNumber: order.orderNumber, razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_Smoke1', razorpay_signature: signature });
    assert.equal((await verify('0'.repeat(64))).status, 400);
    assert.equal((await readState('products/smoke-suit')).doc.stockQuantity, 5);

    const signature = createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${order.razorpayOrderId}|pay_Smoke1`).digest('hex');
    const [first, second] = await Promise.all([verify(signature), verify(signature)]);
    assert.deepEqual([first.status, second.status], [200, 200]);
    const raw = `{ "event":"payment.captured", "payload":{"payment":{"entity":{"id":"pay_Smoke1","order_id":"${order.razorpayOrderId}","notes":{"order_number":"${order.orderNumber}"}}}} }`;
    const hook = await request('/api/webhooks/razorpay', { method: 'POST', raw, headers: { 'x-razorpay-signature': createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex') } });
    assert.deepEqual(hook.body, { ok: true, changed: false });
    const forged = await request('/api/webhooks/razorpay', { method: 'POST', raw, headers: { 'x-razorpay-signature': 'f'.repeat(64) } });
    assert.equal(forged.status, 401);

    const stored = (await readState(`orders/${order.orderNumber}`)).doc;
    assert.deepEqual([stored.paymentStatus, stored.status, stored.deductedQuantities], ['Paid', 'Processing', { 'smoke-suit': 2 }]);
    assert.equal((await readState('products/smoke-suit')).doc.stockQuantity, 3);
    const { outbound } = await readState();
    const confirmations = outbound.filter((call) => call.target.includes('brevo') && JSON.parse(call.body).subject.includes('confirmed'));
    assert.equal(confirmations.length, 1);
    const mine = await orders({ action: 'my-orders' }, { token: customerToken });
    assert.deepEqual(mine.body.orders.map((entry) => [entry.orderNumber, entry.paymentStatus]), [[order.orderNumber, 'Paid']]);
  });

  await step('admin: sign-in (password hashing inside workerd), session cookie, settings save, admin read through the gateway', async () => {
    const wrong = await request('/api/admin-config?action=login', { method: 'POST', json: { username: 'owner', password: 'nope', pin: '246810' } });
    assert.equal(wrong.status, 401);
    const login = await request('/api/admin-config?action=login', { method: 'POST', json: { username: 'owner', password: 'Smoke-Passw0rd', pin: '246810' } });
    assert.equal(login.status, 200, login.text);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    assert.match(login.headers.getSetCookie()[0], /HttpOnly; SameSite=Strict; Path=\/api\/admin-config; Max-Age=34560000; Secure/);
    assert.equal((await request('/api/admin-config?action=session', { cookie })).status, 200);
    const saved = await request('/api/admin-config', { method: 'PUT', cookie, json: { settings: { storeSettings: { shippingCharge: 75 } } } });
    assert.equal(saved.status, 200, saved.text);
    assert.equal((await request('/api/admin-config')).body.settings.storeSettings.shippingCharge, 75);
    const adminRead = await request('/api/db', { method: 'POST', token: login.body.firebaseToken, json: { ops: [{ op: 'query', collection: 'orders' }] } });
    assert.equal(adminRead.body.results[0].docs.length, 1);
  });

  await step('data gateway: a customer reads only their own profile; orders are closed to browsers', async () => {
    const response = await request('/api/db', { method: 'POST', token: customerToken, json: { ops: [{ op: 'get', path: 'profiles/smoke@example.test' }, { op: 'get', path: `orders/${order.orderNumber}` }] } });
    assert.equal(response.body.results[0].exists, true);
    assert.equal(response.body.results[1].error.code, 'permission-denied');
  });

  await step('sitemap and nothing sent to an unmocked service', async () => {
    const sitemap = await request('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.ok(sitemap.text.includes('<loc>https://www.suitauragirls.in/product/smoke-suit</loc>'));
    assert.ok(!sitemap.text.includes('smoke-hidden'));
    assert.deepEqual((await readState()).unexpected, []);
  });

  console.log(`All ${passed} smoke steps passed in local workerd.`);
} finally {
  stop();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  rmSync(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  rmSync(join(here, '.wrangler'), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
