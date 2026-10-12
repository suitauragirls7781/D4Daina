// Scenario 10: product reviews (api/reviews.js), price-drop / back-in-stock alerts and shared wishlists
// (api/alerts.js), and the sitemap (api/sitemap.js).
// Run: node --test worker/test/scenarios/reviews-alerts-sitemap.test.mjs
import test from 'node:test';
import { readMediaGrant, setMediaBucket } from '../../../api/_lib/media.js';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { startHarness, SITE } from '../harness/harness.mjs';
import { lineOf, pickOutfit, placePaidOrder } from '../harness/checkout.mjs';

const h = await startHarness();

const ASHA = 'asha@example.test';
const MEERA = 'meera@example.test';
const products = h.exported('products');
const outfit = pickOutfit(products);
const other = pickOutfit(products, 1);
const ashaToken = await h.customerToken(ASHA);
const meeraToken = await h.customerToken(MEERA);
const adminToken = await h.adminToken();

const discovery = await h.setting('discovery');
await h.putSetting('discovery', { ...discovery, features: { ...discovery.features, reviewPhotos: true, priceDropAlerts: true, backInStockAlerts: true } });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 10, inStock: true });

const reviews = (body, options = {}) => h.post('/api/reviews', body, { ip: h.nextIp(), ...options });
const alerts = (body, options) => h.post('/api/alerts', body, options);
const GOOD_REVIEW = { action: 'submit', productId: outfit.id, rating: 5, userName: 'Asha  Rao', comment: 'Lovely fabric and the fit is just right.' };
// With no service-account key on the Worker, api/reviews.js keys customer review ids with its fixed fallback
const customerReviewId = (email, productId) => `rv_${createHmac('sha256', 'suitauragirls-reviews').update(`${email}|${productId}`).digest('hex').slice(0, 32)}`;
const reviewsOf = (productId) => h.docs('reviews', [['productId', '==', productId]]);

// ---- reviews ----

// A stand-in for the R2 bucket: remembers what it is asked to delete
const fakeBucket = (keys) => {
  const deleted = [];
  return { deleted, list: async ({ prefix }) => ({ objects: keys.filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }), delete: async (list) => { deleted.push(...list); } };
};

test('submit: a guest\'s review is stored as pending under a new id and is not public yet', async () => {
  const before = (await reviewsOf(outfit.id)).map((row) => row.id);
  const response = await reviews(GOOD_REVIEW);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body, { ok: true, verifiedPurchase: false, updated: false });

  const added = (await reviewsOf(outfit.id)).filter((row) => !before.includes(row.id));
  assert.equal(added.length, 1);
  assert.match(added[0].id, /^[A-Za-z0-9]{20}$/);
  const { data } = added[0];
  assert.deepEqual(
    { productId: data.productId, productName: data.productName, userName: data.userName, rating: data.rating, comment: data.comment, status: data.status, verifiedPurchase: data.verifiedPurchase, helpfulCount: data.helpfulCount, source: data.source },
    { productId: outfit.id, productName: outfit.data.name, userName: 'Asha Rao', rating: 5, comment: GOOD_REVIEW.comment, status: 'pending', verifiedPurchase: false, helpfulCount: 0, source: 'storefront' },
  );
  const catalogue = await h.call('/api/admin-config?action=catalog&v=pending-review');
  assert.ok(!catalogue.body.reviews.some((review) => review.id === added[0].id));
  // A shopper's browser cannot read the pending review either, and cannot write reviews at all
  const direct = await h.post('/api/db', { ops: [
    { op: 'get', path: `reviews/${added[0].id}` },
    { op: 'query', collection: 'reviews', where: [['productId', '==', outfit.id]] },
    { op: 'set', path: `reviews/${added[0].id}`, data: { status: 'approved' }, merge: true },
  ] });
  assert.deepEqual(direct.body.results.map((result) => result.error?.code), ['permission-denied', 'permission-denied', 'permission-denied']);
});

test('submit: the rating, name, text and product are checked', async () => {
  const before = (await h.docs('reviews')).length;
  const invalid = {
    'rating 0': { rating: 0 },
    'rating 6': { rating: 6 },
    'rating 4.5': { rating: 4.5 },
    'one-letter name': { userName: 'A' },
    'too short': { comment: 'Nice' },
    'too long': { comment: 'x'.repeat(1001) },
    'unknown product': { productId: 'no-such-product' },
    'product id with a slash': { productId: 'products/x' },
  };
  for (const [name, change] of Object.entries(invalid)) {
    const response = await reviews({ ...GOOD_REVIEW, ...change });
    assert.ok([400, 404].includes(response.status), `${name}: ${response.status}`);
  }
  assert.equal((await reviews(GOOD_REVIEW, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await reviews({ ...GOOD_REVIEW, action: 'approve' })).status, 400);
  assert.equal((await h.docs('reviews')).length, before);
});

test('submit: a signed-in customer has one review per product; "verified purchase" needs a paid order with that product', async () => {
  const id = customerReviewId(ASHA, outfit.id);
  const first = await reviews(GOOD_REVIEW, { token: ashaToken });
  assert.deepEqual(first.body, { ok: true, verifiedPurchase: false, updated: false });
  const stored = await h.doc('reviews', id);
  assert.deepEqual([stored.status, stored.verifiedPurchase, stored.helpfulCount], ['pending', false, 0]);
  // No email on the public document, and the optional fields are absent rather than empty
  assert.ok(!JSON.stringify(stored).includes(ASHA));
  assert.deepEqual(['imageUrl', 'photoId', 'sizePurchased'].filter((field) => field in stored), []);

  // An unpaid order is not a purchase; a paid one is
  await placePaidOrder(h, { email: ASHA, items: [lineOf(other, 1)] });
  await h.post('/api/orders', { action: 'create', items: [lineOf(outfit, 1)], address: { fullName: 'Asha Rao', mobile: '9876543210', email: ASHA, houseFlat: '12 Test Lane', city: 'Asansol', state: 'West Bengal', pincode: '713301' } }, { token: ashaToken, ip: h.nextIp() });
  const stillUnverified = await reviews({ ...GOOD_REVIEW, rating: 4 }, { token: ashaToken });
  assert.deepEqual(stillUnverified.body, { ok: true, verifiedPurchase: false, updated: true });

  await placePaidOrder(h, { email: ASHA, items: [lineOf(outfit, 1)] });
  const verified = await reviews({ ...GOOD_REVIEW, rating: 3, comment: 'Updated after wearing it a few times.' }, { token: ashaToken });
  assert.deepEqual(verified.body, { ok: true, verifiedPurchase: true, updated: true });
  const updated = await h.doc('reviews', id);
  assert.deepEqual(
    [updated.rating, updated.comment, updated.verifiedPurchase, updated.sizePurchased, updated.status, updated.createdAt],
    [3, 'Updated after wearing it a few times.', true, outfit.data.sizes[0], 'pending', stored.createdAt],
  );
  // Still one review by this customer for this product; another customer gets her own
  assert.equal((await reviewsOf(outfit.id)).filter((row) => row.id.startsWith('rv_')).length, 1);
  await reviews(GOOD_REVIEW, { token: meeraToken });
  assert.notEqual(await h.doc('reviews', customerReviewId(MEERA, outfit.id)), null);
});

test('an approved review that its author edits goes back to pending and the product rating is recalculated', async () => {
  const id = customerReviewId(ASHA, outfit.id);
  // The admin approves it from the admin panel (a browser write through the data gateway)
  const approved = await h.post('/api/db', { ops: [{ op: 'update', path: `reviews/${id}`, data: { status: 'approved', helpfulCount: 4, adminReply: 'Thank you!' } }] }, { token: adminToken });
  assert.equal(approved.body.results[0].error, undefined);
  await h.update('products', outfit.id, { rating: 3, reviewCount: 99 });

  const edited = await reviews({ ...GOOD_REVIEW, rating: 1, comment: 'Changed my mind about this one.' }, { token: ashaToken });
  assert.equal(edited.status, 200, edited.text);
  const stored = await h.doc('reviews', id);
  // Back in moderation, keeping its votes and the store's reply
  assert.deepEqual([stored.status, stored.rating, stored.helpfulCount, stored.adminReply], ['pending', 1, 4, 'Thank you!']);

  const stillApproved = (await reviewsOf(outfit.id)).filter((row) => row.data.status === 'approved').map((row) => Number(row.data.rating) || 0);
  const average = stillApproved.length ? Math.round((stillApproved.reduce((sum, rating) => sum + rating, 0) / stillApproved.length) * 10) / 10 : 0;
  const product = await h.doc('products', outfit.id);
  assert.deepEqual([product.rating, product.reviewCount], [average, stillApproved.length]);
});

test('helpful: one vote per visitor on an approved review; pending reviews and crawlers get none', async () => {
  await h.put('reviews', 'harness-approved', { productId: outfit.id, userName: 'Riya', rating: 5, comment: 'An approved review.', status: 'approved', helpfulCount: 2, createdAt: '2026-09-01T00:00:00.000Z' });
  const voter = { ip: h.nextIp() };
  const vote = (reviewId, options = voter) => reviews({ action: 'helpful', reviewId }, options);

  assert.deepEqual((await vote('harness-approved')).body, { ok: true, counted: true, helpfulCount: 3 });
  assert.deepEqual((await vote('harness-approved')).body, { ok: true, counted: false, helpfulCount: 3 });
  assert.deepEqual((await vote('harness-approved', { ip: h.nextIp() })).body, { ok: true, counted: true, helpfulCount: 4 });
  assert.equal((await h.doc('reviews', 'harness-approved')).helpfulCount, 4);

  assert.equal((await vote(customerReviewId(ASHA, outfit.id))).status, 404, 'a pending review');
  assert.equal((await vote('no-such-review')).status, 404);
  assert.equal((await vote('harness-approved', { ip: h.nextIp(), ua: 'Googlebot/2.1' })).status, 403);
  assert.equal((await h.doc('reviews', 'harness-approved')).helpfulCount, 4);
});

test('review photos: signed for one signed-in customer, attached only to that customer\'s review, removed by the admin after the review is deleted', async () => {
  assert.equal((await reviews({ action: 'photo-sign' })).status, 401);
  const signed = await reviews({ action: 'photo-sign' }, { token: meeraToken });
  assert.equal(signed.status, 200, signed.text);
  // A permission for exactly one photo, under an id the server chose, in the "reviews" folder
  const grant = signed.body;
  assert.match(grant.id, /^rv_[a-f0-9]{24}$/);
  assert.deepEqual([grant.kind, grant.folder], ['image', 'reviews']);
  assert.deepEqual(readMediaGrant(grant.grant), { kind: 'image', folder: 'reviews', id: grant.id });
  const photoUrl = grant.url;
  assert.equal(photoUrl, `https://media.suitauragirls.in/i/reviews/${grant.id}/w1100.webp`);

  // Guests cannot add photos; Asha cannot use the photo signed for Meera; a photo from elsewhere is refused
  assert.equal((await reviews({ ...GOOD_REVIEW, photoUrl })).status, 401);
  assert.equal((await reviews({ ...GOOD_REVIEW, productId: other.id, photoUrl }, { token: ashaToken })).status, 400);
  assert.equal((await reviews({ ...GOOD_REVIEW, photoUrl: 'https://evil.example/x.jpg' }, { token: meeraToken })).status, 400);
  assert.equal(await h.doc('reviews', customerReviewId(ASHA, other.id)), null);

  const withPhoto = await reviews({ ...GOOD_REVIEW, photoUrl }, { token: meeraToken });
  assert.equal(withPhoto.status, 200, withPhoto.text);
  const reviewId = customerReviewId(MEERA, outfit.id);
  const stored = await h.doc('reviews', reviewId);
  assert.deepEqual([stored.imageUrl, stored.photoId], [photoUrl, `suitauragirls/reviews/${grant.id}`]);
  const record = await h.doc('review_photos', grant.id);
  assert.deepEqual([record.reviewId, record.url], [reviewId, photoUrl]);
  // The same photo cannot be moved to another review
  assert.equal((await reviews({ ...GOOD_REVIEW, productId: other.id, photoUrl }, { token: meeraToken })).status, 400);

  // Removing photos: admin only, and only once the review itself is gone. Every stored size goes.
  const bucket = fakeBucket([`i/reviews/${grant.id}/w160.webp`, `i/reviews/${grant.id}/w1100.webp`, `i/reviews/${grant.id}/j480.jpg`, 'i/reviews/rv_someoneelse000000000000/w1100.webp']);
  setMediaBucket(bucket);
  const remove = (token) => reviews({ action: 'remove-photos', reviewId }, { token });
  assert.equal((await remove(meeraToken)).status, 401);
  assert.equal((await remove(adminToken)).status, 409);
  const deleted = await h.post('/api/db', { ops: [{ op: 'delete', path: `reviews/${reviewId}` }] }, { token: adminToken });
  assert.equal(deleted.body.results[0].error, undefined);
  const removed = await remove(adminToken);
  assert.deepEqual(removed.body, { ok: true, removed: 1 });
  assert.deepEqual(bucket.deleted.sort(), [`i/reviews/${grant.id}/j480.jpg`, `i/reviews/${grant.id}/w1100.webp`, `i/reviews/${grant.id}/w160.webp`]);
  assert.equal(await h.doc('review_photos', grant.id), null);
  setMediaBucket(null);
});

test('submit: at most 12 reviews a day from one address', async () => {
  const ip = h.nextIp();
  for (let index = 1; index <= 12; index += 1) {
    const response = await reviews(GOOD_REVIEW, { ip });
    assert.equal(response.status, 200, `review ${index}`);
  }
  const before = (await h.docs('reviews')).length;
  const blocked = await reviews(GOOD_REVIEW, { ip });
  assert.equal(blocked.status, 429);
  assert.equal((await h.docs('reviews')).length, before);
});

// ---- alerts ----

const checkProduct = (productId, token = adminToken) => alerts({ action: 'check-product', productId }, { token });

test('back in stock: a subscriber is emailed once when a sold-out product is available again', async () => {
  await h.update('products', other.id, { stockQuantity: 0, inStock: false });
  const subscribed = await alerts({ action: 'restock-subscribe', productId: other.id, email: 'Waiting@Example.test', size: other.data.sizes[0] });
  assert.equal(subscribed.status, 200, subscribed.text);
  // A subscriber waiting for a size the product is not sold in is not told
  await alerts({ action: 'restock-subscribe', productId: other.id, email: 'wrongsize@example.test', size: 'NO-SIZE' });
  const waiting = await h.docs('stock_alerts', [['productId', '==', other.id]]);
  assert.deepEqual(waiting.map((row) => [row.data.email, row.data.status]).sort(), [['waiting@example.test', 'waiting'], ['wrongsize@example.test', 'waiting']]);
  assert.deepEqual({ available: (await h.doc('alert_state', other.id)).available }, { available: false });

  assert.equal((await alerts({ action: 'restock-subscribe', productId: other.id, email: 'not-an-email' })).status, 400);
  assert.equal((await alerts({ action: 'restock-subscribe', productId: 'no-such-product', email: 'a@example.test' })).status, 404);
  for (const token of ['', ashaToken]) assert.equal((await checkProduct(other.id, token)).status, 401);

  // Still sold out: nothing is sent
  assert.deepEqual((await checkProduct(other.id)).body, { ok: true, sent: { priceDrop: 0, restock: 0 } });
  assert.equal(h.mailTo('waiting@example.test').length, 0);

  await h.update('products', other.id, { stockQuantity: 6, inStock: true });
  const restocked = await checkProduct(other.id);
  assert.deepEqual(restocked.body, { ok: true, sent: { priceDrop: 0, restock: 1 } });
  const [mail] = h.mailTo('waiting@example.test');
  assert.equal(mail.subject, `Back in stock: ${other.data.name}`);
  assert.match(mail.html, new RegExp(`${SITE}/product/${other.id}`));
  assert.equal(h.mailTo('wrongsize@example.test').length, 0);
  const after = await h.docs('stock_alerts', [['productId', '==', other.id]]);
  assert.deepEqual(after.map((row) => [row.data.email, row.data.status]).sort(), [['waiting@example.test', 'sent'], ['wrongsize@example.test', 'waiting']]);

  assert.deepEqual((await checkProduct(other.id)).body.sent, { priceDrop: 0, restock: 0 });
  assert.equal(h.mailTo('waiting@example.test').length, 1);
});

test('price drop: customers who saved the product are emailed once per new price, and never for an increase', async () => {
  const price = Math.round(Number(outfit.data.price));
  await h.put('profiles', 'saver@example.test', { email: 'saver@example.test', fullName: 'Saver', wishlist: [{ id: outfit.id }] });
  await h.put('profiles', 'browser@example.test', { email: 'browser@example.test', wishlist: [{ id: other.id }] });
  const alsoSaved = h.exported('profiles').filter((row) => (row.data.wishlist || []).some((item) => String(item?.id) === outfit.id)).length;

  assert.deepEqual((await checkProduct(outfit.id)).body, { ok: true, initialised: true });
  await h.update('products', outfit.id, { price: price + 100 });
  assert.deepEqual((await checkProduct(outfit.id)).body.sent, { priceDrop: 0, restock: 0 });

  await h.update('products', outfit.id, { price: price - 100 });
  const dropped = await checkProduct(outfit.id);
  assert.deepEqual(dropped.body.sent, { priceDrop: 1 + alsoSaved, restock: 0 });
  const [mail] = h.mailTo('saver@example.test');
  assert.match(mail.subject, /^Price drop: /);
  assert.equal(h.mailTo('browser@example.test').length, 0);

  // The same price again sends nothing more
  await h.put('alert_state', outfit.id, { price: price + 100, available: true });
  assert.deepEqual((await checkProduct(outfit.id)).body.sent, { priceDrop: 0, restock: 0 });
  assert.equal(h.mailTo('saver@example.test').length, 1);
  await h.update('products', outfit.id, { price });
});

test('shared wishlist: a link holds product ids only and anyone with it can read them', async () => {
  const shared = await alerts({ action: 'share-wishlist', productIds: [outfit.id, other.id, 'no-such-product', outfit.id] });
  assert.equal(shared.status, 200, shared.text);
  assert.match(shared.body.id, /^[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(await h.doc('shared_wishlists', shared.body.id)).sort(), ['createdAt', 'productIds']);

  const opened = await h.call(`/api/alerts?wishlist=${shared.body.id}`);
  assert.equal(opened.status, 200);
  assert.deepEqual(opened.body, { productIds: [outfit.id, other.id] });
  assert.equal((await h.call('/api/alerts?wishlist=0000000000000000')).status, 404);
  assert.equal((await h.call('/api/alerts')).status, 400);
  assert.equal((await alerts({ action: 'share-wishlist', productIds: [] })).status, 400);
  assert.equal((await alerts({ action: 'share-wishlist', productIds: ['no-such-product'] })).status, 400);
});

// ---- sitemap ----

test('sitemap: one URL per visible product, none for hidden products or accessories', async () => {
  const hidden = pickOutfit(products, 2);
  await h.update('products', hidden.id, { hidden: true });
  const response = await h.call('/sitemap.xml');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/xml/);
  assert.match(response.headers.get('cache-control'), /s-maxage=3600/);
  assert.ok(response.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(response.text.endsWith('</urlset>\n'));

  const locs = [...response.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const hasPhoto = (row) => (row.data.images || []).some((url) => typeof url === 'string' && url.trim() && !url.startsWith('data:image/svg+xml') && !url.includes('placeholder.com'));
  // Kids wear and toys are no longer part of the store (removed-sections.test.mjs)
  const removed = (row) => ['kids', 'toy'].includes(row.data.productType) || ['Baby Girls', 'Baby Boys', 'Toys'].includes(row.data.category);
  const visible = products.filter((row) => row.id !== hidden.id && row.data.productType !== 'accessory' && !removed(row) && hasPhoto(row));
  assert.ok(visible.length > 10);
  assert.deepEqual(locs.filter((loc) => loc.startsWith(`${SITE}/product/`)).sort(), visible.map((row) => `${SITE}/product/${encodeURIComponent(row.id)}`).sort());
  for (const accessory of products.filter((row) => row.data.productType === 'accessory')) assert.ok(!response.text.includes(`/product/${accessory.id}<`));
  assert.ok(locs.includes(`${SITE}/`) && locs.includes(`${SITE}/shop`) && locs.includes(`${SITE}/return-policy`));
  assert.ok(locs.some((loc) => loc.startsWith(`${SITE}/category/`)));
  assert.ok([...response.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((match) => /^\d{4}-\d{2}-\d{2}$/.test(match[1]) && match[1] <= h.today()));

  // The same document under the API path; HEAD has no body; other methods are refused
  const api = await h.call('/api/sitemap');
  assert.deepEqual([...api.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), locs);
  const head = await h.call('/sitemap.xml', { method: 'HEAD' });
  assert.deepEqual([head.status, head.text], [200, '']);
  const post = await h.call('/sitemap.xml', { method: 'POST', json: {} });
  assert.deepEqual([post.status, post.headers.get('allow')], [405, 'GET, HEAD']);
});

test('sitemap: served from the edge cache for the next visitor', async () => {
  await h.update('products', outfit.id, { hidden: true });
  const cached = await h.call('/sitemap.xml');
  assert.ok(cached.text.includes(`/product/${outfit.id}<`));
  await h.update('products', outfit.id, { hidden: false });
});
