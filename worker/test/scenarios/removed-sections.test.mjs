// Kids wear and toys were taken out of the store (2026-10-12). Their saved styles and categories stay in the
// database, but the store no longer hands them out, lists them in the sitemap or sells them.
// Run: node --test worker/test/scenarios/removed-sections.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { createOrder, lineOf, pickOutfit } from '../harness/checkout.mjs';
import { isRemovedCategory, isRemovedSection } from '../../../api/_lib/removedSections.js';

const h = await startHarness();
await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), minOrderAmount: 0, maxOrderAmount: 0 });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });

const photo = 'https://media.suitauragirls.in/i/product-images/harness-toy/w1100.webp';
const base = { price: 499, originalPrice: 799, sizes: ['Free Size'], colors: [{ name: 'Red', hex: '#C4142C' }], images: [photo], inStock: true, stockQuantity: 20, hidden: false, createdAt: '2026-09-01T00:00:00.000Z' };
await h.put('products', 'harness-toy', { ...base, name: 'Harness Toy Car', category: 'Toys', productType: 'toy' });
await h.put('products', 'harness-kids', { ...base, name: 'Harness Party Frock', category: 'Baby Girls', productType: 'kids', sizes: ['3-4 Y'] });
// A row whose type was never saved is still recognised by its category
await h.put('products', 'harness-kids-untyped', { ...base, name: 'Harness Boys Kurta', category: 'Baby Boys', sizes: ['5-6 Y'] });
await h.put('categories', 'harness-cat-toys', { name: 'Toys', title: 'Toys', isActive: true });
await h.put('categories', 'harness-cat-girls', { name: 'Baby Girls', title: 'Baby Girls', isActive: true });
const REMOVED_IDS = ['harness-toy', 'harness-kids', 'harness-kids-untyped'];

test('the rule: by product type or by category, and nothing else', () => {
  assert.equal(isRemovedSection({ productType: 'toy', category: 'Anything' }), true);
  assert.equal(isRemovedSection({ productType: 'kids' }), true);
  assert.equal(isRemovedSection({ category: 'Baby Boys' }), true);
  assert.equal(isRemovedSection({ productType: 'outfit', category: 'Suits' }), false);
  assert.equal(isRemovedSection({ productType: 'accessory', category: 'Accessories' }), false);
  assert.equal(isRemovedSection(null), false);
  assert.equal(isRemovedCategory('Toys'), true);
  assert.equal(isRemovedCategory('Kurtis'), false);
});

test('the catalogue hands out no kids wear, no toys and none of their categories', async () => {
  const response = await h.call('/api/admin-config?action=catalog&v=7');
  assert.equal(response.status, 200);
  const { products, categories } = response.body;
  assert.ok(products.length > 0, 'the women\'s styles are still there');
  assert.deepEqual(products.filter((p) => REMOVED_IDS.includes(p.id) || isRemovedSection(p)).map((p) => p.id), []);
  assert.deepEqual(categories.filter((c) => isRemovedCategory(c.name)).map((c) => c.name), []);
  assert.ok(!/Harness Toy Car|Harness Party Frock|Harness Boys Kurta/.test(response.text));
});

test('the sitemap lists none of them', async () => {
  const response = await h.call('/sitemap.xml');
  assert.equal(response.status, 200);
  for (const id of REMOVED_IDS) assert.ok(!response.text.includes(`/product/${id}`), id);
  for (const slug of ['toys', 'kids', 'baby-girls', 'baby-boys', 'kids-toys']) assert.ok(!response.text.includes(`/category/${slug}<`), slug);
  assert.ok(response.text.includes('/product/'), 'women\'s styles are still listed');
});

test('a bag that still holds one cannot be ordered; a women\'s style still can', async () => {
  for (const [id, size] of [['harness-toy', 'Free Size'], ['harness-kids', '3-4 Y'], ['harness-kids-untyped', '5-6 Y']]) {
    const refused = await createOrder(h, { email: 'removed.sections@gmail.com', items: [{ productId: id, size, quantity: 1 }] });
    assert.equal(refused.status, 409, `${id}: ${refused.text}`);
    assert.match(refused.body.error, /no longer available/);
  }
  const outfit = pickOutfit(h.exported('products').filter((row) => !isRemovedSection(row.data)));
  await h.update('products', outfit.id, { stockQuantity: 40, inStock: true });
  const mixed = await createOrder(h, { email: 'removed.sections@gmail.com', items: [lineOf(outfit, 1), { productId: 'harness-toy', size: 'Free Size', quantity: 1 }] });
  assert.equal(mixed.status, 409, mixed.text);
  const fine = await createOrder(h, { email: 'removed.sections@gmail.com', items: [lineOf(outfit, 1)] });
  assert.equal(fine.status, 200, fine.text);
});

test('nothing was deleted: the saved rows are still in the database', async () => {
  for (const id of REMOVED_IDS) assert.ok(await h.doc('products', id), id);
  assert.ok(await h.doc('categories', 'harness-cat-toys'));
});
