// A product link shared on WhatsApp shows that product: the preview text is built only from the product's own
// data, and a product the store does not show gets no preview of its own.
// Run: node --test worker/test/scenarios/link-preview.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { productPreview } from '../../src/linkPreview.js';

const PHOTO = 'https://media.suitauragirls.in/i/product-images/fcfd9addb9ed80ad19d7/w1100.webp';
const base = { name: 'Vibrant Orange Punjabi Suit with Multicolour Beadwork and Dupatta', price: 1399, originalPrice: 2499, category: 'Suits', sizes: ['S', 'M', 'L', 'XL', '5XL'], inStock: true, stockQuantity: 4, images: [PHOTO] };

test('the preview carries the real name, price, discount, sizes and a WhatsApp-sized photo', () => {
  const p = productPreview('pmuyxwrlu5a6vz9', { ...base, seoDescription: 'A bright festive set.' });
  assert.equal(p.url, 'https://www.suitauragirls.in/product/pmuyxwrlu5a6vz9');
  assert.equal(p.title, 'Vibrant Orange Punjabi Suit with Multicolour Beadwork and Dupatta · ₹1,399 | Suit Aura Girls');
  assert.equal(p.description, '₹1,399 · 44% off (MRP ₹2,499) · Suits · Sizes S to 5XL. A bright festive set.');
  assert.equal(p.image, PHOTO.replace('w1100.webp', 'j480.jpg'));
  assert.equal(p.largeImage, PHOTO.replace('w1100.webp', 'j1200.jpg'));
  assert.equal(p.soldOut, false);
});

test('no discount, one size, sold out and no stored photo are said as they are', () => {
  const p = productPreview('x1', { ...base, originalPrice: 1399, sizes: ['Free Size'], inStock: false, images: ['https://example.com/a.jpg'] });
  assert.equal(p.description, '₹1,399 · Suits · Sold out right now');
  assert.equal(p.image, '');
});

test('hidden styles, accessories, kids wear and toys, and broken rows get no preview of their own', () => {
  assert.equal(productPreview('a', { ...base, hidden: true }), null);
  assert.equal(productPreview('b', { ...base, productType: 'accessory' }), null);
  assert.equal(productPreview('c', { ...base, category: 'Toys' }), null);
  assert.equal(productPreview('d', { ...base, productType: 'kids' }), null);
  assert.equal(productPreview('e', { ...base, price: 0 }), null);
  assert.equal(productPreview('f', null), null);
});
