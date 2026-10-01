// Unit tests for price-drop / back-in-stock alerts. No real emails: fetch is replaced by a recorder.
// Run: node api/_lib/alerts.test.mjs
import assert from 'node:assert/strict';

process.env.BREVO_API_KEY = 'test-key';
const sent = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('brevo')) sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({}) };
};
const { checkProduct } = await import('../alerts.js');

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const createDb = (seed) => {
  const data = clone(seed);
  const ref = (c, id) => ({
    id,
    get: async () => ({ id, exists: Boolean(data[c]?.[id]), data: () => clone(data[c]?.[id]), ref: ref(c, id) }),
    set: async (v) => { (data[c] ||= {})[id] = clone(v); },
    update: async (v) => { Object.assign(data[c][id], clone(v)); },
  });
  const query = (c, filters = []) => ({
    where: (f, _op, v) => query(c, [...filters, [f, v]]),
    limit: () => query(c, filters),
    get: async () => ({ docs: Object.keys(data[c] || {}).filter((id) => filters.every(([f, v]) => data[c][id][f] === v)).map((id) => ({ id, data: () => clone(data[c][id]), ref: ref(c, id) })) }),
  });
  return { data, collection: (c) => ({ doc: (id) => ref(c, id), ...query(c) }) };
};

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`PASS  ${name}`); } catch (e) { results.push(false); console.log(`FAIL  ${name}\n      ${e.message}`); }
};

const product = { name: 'Rose Suit', price: 999, stockQuantity: 5, inStock: true, images: ['https://res.cloudinary.com/x.jpg'] };
const seed = () => ({
  products: { p1: clone(product) },
  profiles: {
    'a@x.com': { email: 'a@x.com', wishlist: [{ id: 'p1' }] },
    'b@x.com': { email: 'b@x.com', wishlist: [{ id: 'other' }] },
  },
  stock_alerts: {},
});

await test('first check only records the state (no emails)', async () => {
  const db = createDb(seed()); sent.length = 0;
  await checkProduct(db, 'p1');
  assert.equal(sent.length, 0);
  assert.equal(db.data.alert_state.p1.price, 999);
});

await test('price drop emails only wishlist holders, with real old and new price', async () => {
  const db = createDb(seed()); sent.length = 0;
  await checkProduct(db, 'p1');
  db.data.products.p1.price = 899;
  const r = await checkProduct(db, 'p1');
  assert.equal(r.sent.priceDrop, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, 'a@x.com');
  assert.match(sent[0].htmlContent, /₹999/);
  assert.match(sent[0].htmlContent, /₹899/);
});

await test('same price drop is never emailed twice', async () => {
  const db = createDb(seed()); sent.length = 0;
  await checkProduct(db, 'p1');
  db.data.products.p1.price = 899;
  await checkProduct(db, 'p1');
  db.data.alert_state.p1.price = 999; // even if the state were reset
  await checkProduct(db, 'p1');
  assert.equal(sent.length, 1);
});

await test('price increase sends nothing', async () => {
  const db = createDb(seed()); sent.length = 0;
  await checkProduct(db, 'p1');
  db.data.products.p1.price = 1299;
  await checkProduct(db, 'p1');
  assert.equal(sent.length, 0);
});

await test('back in stock emails waiting subscribers once, respecting size', async () => {
  const s = seed();
  s.products.p1.stockQuantity = 0; s.products.p1.inStock = false; s.products.p1.sizes = ['M', 'L'];
  s.stock_alerts = {
    k1: { email: 'c@x.com', productId: 'p1', size: 'M', status: 'waiting' },
    k2: { email: 'd@x.com', productId: 'p1', size: '4XL', status: 'waiting' },
  };
  const db = createDb(s); sent.length = 0;
  await checkProduct(db, 'p1');
  db.data.products.p1.stockQuantity = 3; db.data.products.p1.inStock = true;
  const r = await checkProduct(db, 'p1');
  assert.equal(r.sent.restock, 1);
  assert.equal(sent[0].to[0].email, 'c@x.com');
  assert.equal(db.data.stock_alerts.k1.status, 'sent');
  assert.equal(db.data.stock_alerts.k2.status, 'waiting');
  await checkProduct(db, 'p1');
  assert.equal(sent.length, 1);
});

await test('disabled feature sends nothing', async () => {
  const s = seed();
  s.storefront_settings = { discovery: { value_json: JSON.stringify({ features: { priceDropAlerts: false } }) } };
  const db = createDb(s); sent.length = 0;
  await checkProduct(db, 'p1');
  db.data.products.p1.price = 799;
  await checkProduct(db, 'p1');
  assert.equal(sent.length, 0);
});

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
