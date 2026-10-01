// What the owner does: sign in, open every admin page, open an order, change a product (written through
// the browser shim), see a new order arrive without reloading, reload, and sign out.
import {
  ADMIN, WORKER_URL, createReport, d1All, d1DeleteDoc, d1Doc, d1Docs, d1PutDoc, drain, launch, openPage, screenshot, sleep, until,
} from './lib.mjs';

const SIDEBAR_PAGES = [
  'Products', 'Add Product', 'Kids Wear', 'Toys', 'Categories', 'Orders', 'Returns & Exchanges', 'Customers', 'Captured Leads',
  'Coupons', 'Deal of the Day', 'Combo Offer', 'Reviews', 'Homepage', 'Hero Slides', 'Discovery features', 'Aura Reels',
  'Complete the Look', 'Banners', 'Instagram Reels', 'Payment Gateways', 'Settings', 'Dashboard',
];
const LIVE_ORDER_ID = 'SAG-E2E-LIVE';
// src/lib/catalog.ts asks for /api/admin-config?action=catalog&v=<5-minute bucket>
const CATALOG_BUCKET_MS = 5 * 60 * 1000;

/** One product as shoppers get it from the catalogue of the given bucket, and whether the Worker cache answered. */
const catalogCopy = async (bucket, productId) => {
  const response = await fetch(`${WORKER_URL}/api/admin-config?action=catalog&v=${bucket}`);
  const product = (await response.json()).products.find((entry) => entry.id === productId);
  return { isNewArrival: product?.isNewArrival, stock: product?.stockQuantity, cache: response.headers.get('cf-cache-status') || 'MISS' };
};

const report = createReport('admin');
const { check, clean } = report;
const browser = await launch();
const { context, page, watch } = await openPage(browser);
const bodyText = () => page.evaluate(() => document.body.innerText);
const mainText = () => page.evaluate(() => (document.querySelector('main') || document.body).innerText);
const sidebar = (label) => page.locator('aside button, nav button').filter({ hasText: new RegExp(`^${label.replace(/[&]/g, '\\$&')}`) }).first();
const signIn = async () => {
  const inputs = page.locator('input:visible');
  await inputs.nth(0).fill(ADMIN.username);
  await inputs.nth(1).fill(ADMIN.password);
  await inputs.nth(2).fill(ADMIN.pin);
  await page.getByRole('button', { name: /unlock admin vault/i }).click();
};

try {
  // ---- d. the private entry and sign-in ----
  await page.goto('/admin', { waitUntil: 'load' });
  check('/admin shows the store\'s 404 page, not a sign-in form', await until(async () => /This page does not exist/.test(await bodyText())) && !/Unlock Admin Vault/i.test(await bodyText()));
  await page.goto('/drdaina', { waitUntil: 'load' });
  check('/drdaina shows the sign-in form', await until(async () => /Unlock Admin Vault/i.test(await bodyText())));
  // Before sign-in the session check answers 401 by design; that one is not a fault.
  await sleep(1500);
  drain(watch);

  await signIn();
  await page.getByText('EXECUTIVE STORE OVERVIEW').waitFor({ timeout: 20000 });
  check('sign-in with the bootstrap credentials opens the dashboard', true, new URL(page.url()).pathname);
  const cookie = (await context.cookies()).find((entry) => entry.name === 'sag_admin_session');
  check('admin cookie is HttpOnly, Secure and SameSite=Strict', cookie?.httpOnly && cookie?.secure && cookie?.sameSite === 'Strict');
  check('admin token is kept in localStorage for the admin app only', await page.evaluate(() => Boolean(localStorage.getItem('sag_auth_token:sag-admin')) && !localStorage.getItem('sag_auth_token:[DEFAULT]')));

  const orders = d1Docs('orders');
  const paid = orders.filter(({ data }) => data.paymentStatus === 'paid' || data.paymentStatus === 'Paid');
  await sidebar('Orders').click();
  const ordersText = await until(async () => {
    const text = await mainText();
    return /Order Management \(\d+\)/.test(text) ? text : '';
  });
  const listed = Number(ordersText.match(/Order Management \((\d+)\)/)?.[1]);
  const unpaid = Number(ordersText.match(/unpaid checkout attempts \((\d+)\)/)?.[1] || 0);
  check('orders page: listed + unpaid attempts = orders in local D1', listed + unpaid === orders.length, `${listed} + ${unpaid} of ${orders.length} (paid in D1: ${paid.length})`);

  // ---- d. one order's details ----
  await page.locator('main button[title="View Full Order Details"]').first().click();
  const orderId = await until(async () => (new URL(page.url()).pathname.match(/\/orders\/([^/]+)$/) || [])[1]);
  const orderDoc = orderId && d1Doc('orders', decodeURIComponent(orderId));
  check('order details open for a real order', Boolean(orderDoc) && await until(async () => (await mainText()).includes(orderDoc.data.customerName || orderId)), orderId);
  check('order details listen to that order through the shim', await until(() => watch.api.some((call) => call.as === 'admin' && /watch/.test(call.ops))));
  clean('sign-in, orders, order details', watch);

  // ---- d. every sidebar page ----
  for (const label of SIDEBAR_PAGES) {
    await sidebar(label).click();
    await sleep(1800);
    const text = await mainText();
    const problems = drain(watch);
    const broken = /Something went wrong|Unexpected Application Error/i.test(text) || text.trim().length < 40;
    check(`admin page "${label}" opens cleanly`, !broken && problems.length === 0, [new URL(page.url()).pathname, ...problems.slice(0, 3)].join(' | '));
    if (broken || problems.length) await screenshot(page, `admin-${label.replace(/\W+/g, '_')}`);
  }

  // ---- f. a new order appears on the open dashboard without a reload ----
  await page.getByText('EXECUTIVE STORE OVERVIEW').waitFor();
  const template = paid[0] || orders[0];
  const now = new Date().toISOString();
  const liveOrder = { ...template.data, orderNumber: LIVE_ORDER_ID, id: LIVE_ORDER_ID, customerName: 'E2E Live Listener', date: now, createdAt: now, updatedAt: now };
  const insertedAt = Date.now();
  d1PutDoc('orders', LIVE_ORDER_ID, liveOrder);
  const seen = await until(async () => (await mainText()).includes('E2E Live Listener'), { timeout: 30000, every: 500 });
  check('live listener: an order inserted straight into D1 shows on the dashboard without reload', seen, `${Math.round((Date.now() - insertedAt) / 1000)} s after the insert started`);
  d1DeleteDoc('orders', LIVE_ORDER_ID);
  check('live listener: the order disappears again after it is deleted in D1', await until(async () => !(await mainText()).includes('E2E Live Listener'), { timeout: 30000, every: 500 }));
  clean('live listener', watch);

  // ---- e. admin writes through the shim ----
  await sidebar('Products').click();
  await page.locator('main button[title*="toggle New Arrival"]').first().waitFor();
  const productId = await page.evaluate(() => {
    const row = document.querySelector('main tbody tr');
    return row?.getAttribute('data-product-id') || row?.id || '';
  });
  const firstName = (await page.locator('main tbody tr').first().innerText()).split('\n').map((line) => line.trim()).filter(Boolean)[0];
  const target = d1Docs('products').find(({ id, data }) => id === productId || data.name === firstName);
  check('products page lists a D1 product first', Boolean(target), firstName);
  const before = d1Doc('products', target.id);
  // Make sure the current 5-minute catalogue copy exists before the change, as it would on a busy day.
  const bucket = Math.floor(Date.now() / CATALOG_BUCKET_MS);
  await catalogCopy(bucket, target.id);
  await page.locator('main button[title*="toggle New Arrival"]').first().click();
  const toggled = await until(() => {
    const current = d1Doc('products', target.id);
    return current.version > before.version && current.data.isNewArrival !== before.data.isNewArrival ? current : null;
  }, { timeout: 8000 });
  check('toggle "New arrival": saved in local D1', Boolean(toggled), `isNewArrival ${before.data.isNewArrival} -> ${toggled?.data.isNewArrival}, version ${before.version} -> ${toggled?.version}`);

  const stockBefore = d1Doc('products', target.id);
  const logBefore = d1All("SELECT count(*) AS n FROM docs WHERE collection = 'inventory_log'")[0].n;
  await page.getByRole('button', { name: /^Increase stock of/i }).first().click();
  const stockAfter = await until(() => {
    const current = d1Doc('products', target.id);
    return Number(current.data.stockQuantity) === Number(stockBefore.data.stockQuantity) + 1 ? current : null;
  }, { timeout: 8000 });
  check('stock +1 (a browser transaction): saved in local D1', Boolean(stockAfter), `${stockBefore.data.stockQuantity} -> ${stockAfter?.data.stockQuantity}`);
  check('stock +1: written to the stock history', await until(() => d1All("SELECT count(*) AS n FROM docs WHERE collection = 'inventory_log'")[0].n === logBefore + 1, { timeout: 8000 }));
  clean('admin writes', watch);

  // What shoppers see, and when. The catalogue URL carries a 5-minute bucket and the Worker keeps each
  // answer in its cache, so: same bucket = the old copy, next bucket = the new data.
  const sameBucket = await catalogCopy(bucket, target.id);
  const bucketRolled = Math.floor(Date.now() / CATALOG_BUCKET_MS) !== bucket;
  check('shoppers: within the same 5 minutes they still get the copy made before the change (from the Worker cache)',
    bucketRolled || (sameBucket.isNewArrival === before.data.isNewArrival && sameBucket.cache === 'HIT'), JSON.stringify(sameBucket));
  // Any other value of `v` is a cache key nobody has asked for yet, like the next bucket will be.
  const nextBucket = await catalogCopy(`${bucket + 1}-${Date.now()}`, target.id);
  check('shoppers: the next 5-minute catalogue has the change', nextBucket.isNewArrival === toggled?.data.isNewArrival && nextBucket.stock === stockAfter?.data.stockQuantity, JSON.stringify(nextBucket));

  // The admin's own browser reads live, so the storefront shows the change at once after a reload.
  await page.goto('/shop', { waitUntil: 'load' });
  await page.waitForSelector(`#product-card-${target.id}`);
  const badge = await until(async () => /(^|\n)NEW(\n|$)/.test(await page.locator(`#product-card-${target.id}`).innerText()) === Boolean(toggled?.data.isNewArrival), { timeout: 8000 });
  check('admin browser: the storefront shows the change after a reload', badge, `NEW badge expected: ${Boolean(toggled?.data.isNewArrival)}`);
  check('admin browser: the storefront was read live, as the admin', watch.api.some((call) => /watch/.test(call.ops)));
  clean('storefront as admin', watch);

  // Put the product back as it was (through the UI again).
  await page.goto('/drdaina/products', { waitUntil: 'load' });
  await page.locator('main button[title*="toggle New Arrival"]').first().waitFor();
  await page.locator('main button[title*="toggle New Arrival"]').first().click();
  await page.getByRole('button', { name: /^Decrease stock of/i }).first().click();
  const restored = await until(() => {
    const current = d1Doc('products', target.id).data;
    return current.isNewArrival === before.data.isNewArrival && Number(current.stockQuantity) === Number(stockBefore.data.stockQuantity);
  }, { timeout: 10000 });
  check('product restored to its original flag and stock', restored);

  // ---- g. reload, sign out ----
  await page.goto('/drdaina/orders', { waitUntil: 'load' });
  check('reload on an admin sub-page keeps the admin signed in', await until(async () => /Order Management \(\d+\)/.test(await mainText()), { timeout: 15000 }), new URL(page.url()).pathname);
  clean('reload', watch);

  const oldToken = await page.evaluate(() => localStorage.getItem('sag_auth_token:sag-admin'));
  await sidebar('Logout').click();
  check('sign out leaves the admin panel for the storefront', await until(() => new URL(page.url()).pathname === '/', { timeout: 10000 })
    && await until(async () => !/ADMIN STUDIO/.test(await bodyText())));
  // The server-side sign-out (cookie cleared, tokens revoked) is a request of its own: wait for it.
  await until(() => watch.api.some((call) => call.path === '/api/admin-config?action=logout'), { timeout: 8000 });
  check('sign out removes the token and the cookie', await page.evaluate(() => !localStorage.getItem('sag_auth_token:sag-admin'))
    && !(await context.cookies()).some((entry) => entry.name === 'sag_admin_session' && entry.value));
  const replay = await fetch(`${WORKER_URL}/api/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WORKER_URL, Authorization: `Bearer ${oldToken}` },
    body: JSON.stringify({ ops: [{ op: 'query', collection: 'orders', limit: 1 }] }),
  });
  const replayResult = (await replay.json()).results?.[0];
  check('the signed-out admin token no longer reads orders', replayResult?.error?.code === 'permission-denied', JSON.stringify(replayResult?.error || 'ALLOWED'));
  await page.goto('/drdaina/orders', { waitUntil: 'load' });
  check('after sign out an admin sub-page asks to sign in again', await until(async () => /Unlock Admin Vault/i.test(await bodyText())));
} catch (error) {
  await screenshot(page, 'admin-failure');
  check('admin run completed', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  if (d1Doc('orders', LIVE_ORDER_ID)) d1DeleteDoc('orders', LIVE_ORDER_ID);
}

process.exitCode = report.finish() ? 1 : 0;
