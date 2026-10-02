// Scenario 1: the catalogue and the public settings, served by the real api/admin-config.js from the exported data.
// Run: node --test worker/test/scenarios/catalogue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';

const h = await startHarness();

const PUBLIC_SETTINGS = ['homepageSections', 'heroConfig', 'storeSettings', 'banners', 'dealOfTheDay', 'paymentSettings', 'instagramReels', 'comboOffer', 'discovery', 'auraReels', 'lookRelations'];
const REVIEW_FIELDS = ['id', 'productId', 'productName', 'userName', 'rating', 'comment', 'adminReply', 'date', 'verifiedPurchase', 'sizePurchased', 'location', 'imageUrl', 'helpfulCount', 'createdAt', 'status'];
const COUPON_FIELDS = ['id', 'code', 'discountType', 'discountValue', 'minOrderValue', 'maxDiscount', 'startDate', 'expiryDate', 'usageLimit', 'usageCount', 'isActive', 'perUserLimit', 'allowedCategories', 'allowedProductIds'];

const products = h.exported('products');
const hiddenProduct = products[0];
const byId = (rows) => Object.fromEntries(rows.map((row) => [row.id, row]));

// What a shopper must never get: a hidden product, unapproved reviews, a reviewer's email, a switched-off
// coupon, a coupon's internal fields and a setting that is not on the public list.
await h.update('products', hiddenProduct.id, { hidden: true });
await h.put('reviews', 'harness-pending', { productId: products[1].id, userName: 'Pending Person', rating: 1, comment: 'not approved yet', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' });
await h.put('reviews', 'harness-approved', { productId: products[1].id, userName: 'Approved Person', rating: 5, comment: 'approved review text', status: 'approved', email: 'reviewer@example.test', createdAt: '2099-01-01T00:00:00.000Z' });
await h.put('coupons', 'harness-off', { code: 'HARNESSOFF', discountType: 'fixed', discountValue: 10, isActive: false });
await h.put('coupons', 'harness-on', { code: 'HARNESSON', discountType: 'fixed', discountValue: 10, isActive: true, internalNote: 'for staff only' });
await h.put('storefront_settings', 'internalNotes', { value_json: JSON.stringify({ secret: 'not public' }) });

test('catalogue: every visible product, the categories, approved reviews, active coupons and public settings', async () => {
  const response = await h.call('/api/admin-config?action=catalog&v=1');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /s-maxage=600/);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const catalogue = response.body;

  // Products: all but the hidden one, each exactly as stored
  const expected = products.filter((row) => row.id !== hiddenProduct.id);
  assert.equal(catalogue.products.length, expected.length);
  const served = byId(catalogue.products);
  for (const row of expected) assert.deepEqual(served[row.id], { id: row.id, ...row.data });
  assert.equal(served[hiddenProduct.id], undefined);

  // Categories: as stored
  const categories = h.exported('categories');
  assert.equal(catalogue.categories.length, categories.length);
  for (const row of categories) assert.deepEqual(byId(catalogue.categories)[row.id], { id: row.id, ...row.data });

  // Reviews: approved only, newest first, public fields only
  const approved = h.exported('reviews').filter((row) => row.data.status === 'approved');
  assert.equal(catalogue.reviews.length, approved.length + 1);
  assert.equal(catalogue.reviews[0].id, 'harness-approved');
  assert.ok(catalogue.reviews.every((review) => review.status === 'approved'));
  assert.ok(!catalogue.reviews.some((review) => review.id === 'harness-pending'));
  for (const review of catalogue.reviews) assert.deepEqual(Object.keys(review).filter((key) => !REVIEW_FIELDS.includes(key)), []);
  assert.ok(!response.text.includes('reviewer@example.test'));

  // Coupons: active ones, public fields only
  const activeCoupons = h.exported('coupons').filter((row) => row.data.isActive !== false);
  assert.equal(catalogue.coupons.length, activeCoupons.length + 1);
  assert.ok(catalogue.coupons.some((coupon) => coupon.code === 'HARNESSON'));
  assert.ok(!catalogue.coupons.some((coupon) => coupon.code === 'HARNESSOFF'));
  for (const coupon of catalogue.coupons) assert.deepEqual(Object.keys(coupon).filter((key) => !COUPON_FIELDS.includes(key)), []);

  // Settings: the public ones that exist, parsed
  const storedKeys = h.exported('storefront_settings').map((row) => row.id).filter((key) => PUBLIC_SETTINGS.includes(key)).sort();
  assert.deepEqual(Object.keys(catalogue.settings).sort(), storedKeys);
  assert.equal(catalogue.settings.internalNotes, undefined);
  assert.equal(typeof catalogue.settings.storeSettings.shippingCharge, 'number');
  assert.ok(!Number.isNaN(Date.parse(catalogue.generatedAt)));
});

test('catalogue: the second request for the same URL is served from the edge cache, a new URL is built again', async () => {
  const first = await h.call('/api/admin-config?action=catalog&v=cache');
  await h.update('products', products[1].id, { name: 'Renamed after the first request' });
  const second = await h.call('/api/admin-config?action=catalog&v=cache');
  assert.equal(second.status, 200);
  assert.equal(second.body.generatedAt, first.body.generatedAt);
  assert.notEqual(second.body.products.find((p) => p.id === products[1].id).name, 'Renamed after the first request');

  const fresh = await h.call('/api/admin-config?action=catalog&v=cache2');
  assert.equal(fresh.body.products.find((p) => p.id === products[1].id).name, 'Renamed after the first request');
});

test('public settings: same settings as the catalogue, never cached', async () => {
  const response = await h.call('/api/admin-config');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const catalogue = await h.call('/api/admin-config?action=catalog&v=settings');
  assert.deepEqual(response.body.settings, catalogue.body.settings);
  assert.equal(response.body.settings.internalNotes, undefined);
  assert.ok(![...h.edgeCache.entries.keys()].some((url) => url.endsWith('/api/admin-config')));
});

test('Worker responses carry the security headers', async () => {
  const response = await h.call('/api/admin-config');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('a path that is not an API route goes to the static assets', async () => {
  const response = await h.call('/product/anything');
  assert.equal(response.status, 200);
  assert.match(response.text, /app shell/);
  assert.deepEqual(h.assetRequests, ['/product/anything']);
});

test('admin-only reads are refused without the admin cookie', async () => {
  for (const action of ['session', 'security', 'payment-gateways', 'ai-assistant', 'razorpay-payments']) {
    const response = await h.call(`/api/admin-config?action=${action}`);
    assert.equal(response.status, 401, action);
  }
});
