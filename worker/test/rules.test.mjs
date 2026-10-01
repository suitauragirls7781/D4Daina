// Allow / deny cases taken straight from firestore.rules, one block per `match`.
// Run: node --test worker/test/rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { allows, allowsQuery, OPERATIONS } from '../src/rules.js';

const anon = { admin: false, email: '', uid: '' };
const admin = { admin: true, email: '', uid: 'sag-admin' };
const asha = { admin: false, email: 'asha@example.com', uid: 'c_asha' };
const meera = { admin: false, email: 'meera@example.com', uid: 'c_meera' };
// Signed in, but with none of our claims (for example a raw Google credential)
const noClaims = { admin: false, email: '', uid: 'google:123' };
const everyone = { anon, admin, asha, meera, noClaims };

const WRITES = ['create', 'update', 'delete'];
const READS = ['get', 'list'];

/** Asserts allow/deny for each named role; `expected` maps role name -> boolean. */
const check = (collection, id, operation, expected, docs = {}) => {
  for (const [role, want] of Object.entries(expected)) {
    assert.equal(
      allows(everyone[role], collection, id, operation, docs),
      want,
      `${role} ${operation} ${collection}/${id} should be ${want ? 'allowed' : 'denied'}`,
    );
  }
};

const someDoc = { existing: { name: 'x' }, incoming: { name: 'y' } };

for (const collection of ['products', 'categories', 'hero_slides', 'coupons']) {
  test(`${collection}: public read, admin write`, () => {
    for (const operation of READS) check(collection, 'a1', operation, { anon: true, asha: true, noClaims: true, admin: true }, someDoc);
    for (const operation of WRITES) check(collection, 'a1', operation, { anon: false, asha: false, noClaims: false, admin: true }, someDoc);
    assert.equal(allowsQuery(anon, collection, {}), true);
  });
}

test('reviews: shoppers read approved reviews only, admin reads and writes all', () => {
  const approved = { existing: { status: 'approved', productId: 'p1' } };
  const pending = { existing: { status: 'pending', productId: 'p1' } };
  for (const operation of READS) {
    check('reviews', 'r1', operation, { anon: true, asha: true, admin: true }, approved);
    check('reviews', 'r1', operation, { anon: false, asha: false, noClaims: false, admin: true }, pending);
    // no status field at all
    check('reviews', 'r1', operation, { anon: false, admin: true }, { existing: { productId: 'p1' } });
  }
  // resource is null for a missing document: resource.data errors, so only the admin gets an answer
  check('reviews', 'missing', 'get', { anon: false, asha: false, admin: true });
  for (const operation of WRITES) {
    check('reviews', 'r1', operation, { anon: false, asha: false, noClaims: false, admin: true }, { ...approved, incoming: { status: 'approved' } });
  }
});

test('reviews: a shopper query must filter on status == approved (rules are not filters)', () => {
  assert.equal(allowsQuery(anon, 'reviews', { where: [] }), false);
  assert.equal(allowsQuery(anon, 'reviews', {}), false);
  assert.equal(allowsQuery(anon, 'reviews', { where: [['productId', '==', 'p1']] }), false);
  assert.equal(allowsQuery(anon, 'reviews', { where: [['status', '==', 'pending']] }), false);
  assert.equal(allowsQuery(anon, 'reviews', { where: [['status', '!=', 'approved']] }), false);
  assert.equal(allowsQuery(anon, 'reviews', { where: [['status', 'in', ['approved', 'pending']]] }), false);
  assert.equal(allowsQuery(anon, 'reviews', { where: [['status', '==', 'approved']] }), true);
  assert.equal(allowsQuery(asha, 'reviews', { where: [['productId', '==', 'p1'], ['status', '==', 'approved']] }), true);
  assert.equal(allowsQuery(admin, 'reviews', {}), true);
});

test('orders: admin reads and deletes; nobody creates or updates from the browser', () => {
  const docs = { existing: { customerEmail: 'asha@example.com' }, incoming: { customerEmail: 'asha@example.com' } };
  for (const operation of READS) check('orders', 'SAG-1001', operation, { anon: false, asha: false, noClaims: false, admin: true }, docs);
  check('orders', 'SAG-1001', 'create', { anon: false, asha: false, admin: false }, docs);
  check('orders', 'SAG-1001', 'update', { anon: false, asha: false, admin: false }, docs);
  check('orders', 'SAG-1001', 'delete', { anon: false, asha: false, admin: true }, docs);
  assert.equal(allowsQuery(asha, 'orders', { where: [['customerEmail', '==', 'asha@example.com']] }), false);
  assert.equal(allowsQuery(admin, 'orders', {}), true);
});

test('profiles: only the signed-in customer whose email is the document id, or the admin', () => {
  const docs = { existing: { cart: [] }, incoming: { cart: [{ id: 'p1' }] } };
  for (const operation of ['get', 'create', 'update']) {
    check('profiles', 'asha@example.com', operation, { anon: false, asha: true, meera: false, noClaims: false, admin: true }, docs);
  }
  // a missing profile can be read and created by its owner (resource is not touched by the rule)
  check('profiles', 'asha@example.com', 'get', { asha: true, meera: false });
  // the match is exact: the id is the lowercase email
  check('profiles', 'Asha@Example.com', 'get', { asha: false });
  check('profiles', 'asha@example.com', 'list', { anon: false, asha: false, admin: true }, docs);
  check('profiles', 'asha@example.com', 'delete', { anon: false, asha: false, admin: true }, docs);
  assert.equal(allowsQuery(asha, 'profiles', {}), false);
  assert.equal(allowsQuery(admin, 'profiles', {}), true);
});

test('customers: own account readable, never writable from the browser', () => {
  const docs = { existing: { email: 'asha@example.com' }, incoming: { email: 'asha@example.com' } };
  check('customers', 'asha@example.com', 'get', { anon: false, asha: true, meera: false, noClaims: false, admin: true }, docs);
  check('customers', 'asha@example.com', 'list', { anon: false, asha: true, meera: false, admin: true }, docs);
  for (const operation of WRITES) check('customers', 'asha@example.com', operation, { anon: false, asha: false, admin: false }, docs);
  // stricter than Firestore on purpose: only the admin may run a query on this collection
  assert.equal(allowsQuery(asha, 'customers', {}), false);
  assert.equal(allowsQuery(anon, 'customers', {}), false);
  assert.equal(allowsQuery(admin, 'customers', {}), true);
});

test('abandoned_checkouts: anyone creates and updates, only the admin reads and deletes', () => {
  const docs = { existing: { phone: '9' }, incoming: { phone: '98' } };
  for (const operation of ['create', 'update']) check('abandoned_checkouts', 's1', operation, { anon: true, asha: true, noClaims: true, admin: true }, docs);
  for (const operation of ['get', 'list', 'delete']) check('abandoned_checkouts', 's1', operation, { anon: false, asha: false, noClaims: false, admin: true }, docs);
  assert.equal(allowsQuery(anon, 'abandoned_checkouts', {}), false);
});

test('storefront_settings: public read, no browser writes (the API writes them)', () => {
  for (const operation of READS) check('storefront_settings', 'storeSettings', operation, { anon: true, asha: true, admin: true }, someDoc);
  for (const operation of WRITES) check('storefront_settings', 'storeSettings', operation, { anon: false, asha: false, admin: false }, someDoc);
});

for (const collection of ['admin_credentials', 'customer_email_otps', 'rate_limits']) {
  test(`${collection}: server only, denied to everyone including the admin`, () => {
    for (const operation of OPERATIONS) check(collection, 'singleton', operation, { anon: false, asha: false, noClaims: false, admin: false }, someDoc);
    assert.equal(allowsQuery(admin, collection, {}), false);
  });
}

const lead = (overrides = {}) => ({
  incoming: { name: 'Asha', email: 'asha@example.com', phone: null, source: 'contact', message: 'Hello', orderNumber: null, createdAt: '2026-10-01T10:00:00.000Z', offerSent: false, ...overrides },
});

test('leads: the two forms the site sends are accepted from anonymous visitors', () => {
  check('leads', 'l1', 'create', { anon: true, asha: true, noClaims: true, admin: true }, lead());
  // newsletter form (src/components/HomeSections.tsx)
  check('leads', 'l1', 'create', { anon: true }, { incoming: { email: 'a@b.co', phone: null, source: 'newsletter', createdAt: '2026-10-01T10:00:00.000Z', offerSent: false } });
  // offerSent may be left out; only `source` is required
  check('leads', 'l1', 'create', { anon: true }, { incoming: { source: 'newsletter' } });
});

test('leads: field allow-list, types and sizes are enforced on create (for the admin as well)', () => {
  const rejected = [
    lead({ extra: 'x' }),
    lead({ updatedAt: '2026-10-01' }),
    { incoming: { email: 'a@b.co' } }, // source missing
    lead({ source: null }),
    lead({ source: 42 }),
    lead({ source: 's'.repeat(41) }),
    lead({ name: 'n'.repeat(121) }),
    lead({ name: 7 }),
    lead({ email: 'e'.repeat(161) }),
    lead({ phone: '9'.repeat(21) }),
    lead({ phone: 9876543210 }),
    lead({ message: 'm'.repeat(2001) }),
    lead({ message: ['a'] }),
    lead({ orderNumber: 'o'.repeat(41) }),
    lead({ offerSent: true }),
    lead({ offerSent: null }),
    lead({ offerSent: 'false' }),
    { incoming: null },
    { incoming: ['source'] },
  ];
  for (const docs of rejected) check('leads', 'l1', 'create', { anon: false, admin: false }, docs);
  const accepted = [
    lead({ source: 's'.repeat(40) }),
    lead({ name: 'n'.repeat(120) }),
    lead({ email: 'e'.repeat(160) }),
    lead({ phone: '9'.repeat(20) }),
    lead({ message: 'm'.repeat(2000) }),
    lead({ orderNumber: 'o'.repeat(40) }),
    lead({ name: null, message: null }),
  ];
  for (const docs of accepted) check('leads', 'l1', 'create', { anon: true }, docs);
});

test('leads: only the admin reads, updates and deletes', () => {
  const docs = { existing: lead().incoming, incoming: { ...lead().incoming, offerSent: true } };
  for (const operation of ['get', 'list', 'update', 'delete']) check('leads', 'l1', operation, { anon: false, asha: false, noClaims: false, admin: true }, docs);
  assert.equal(allowsQuery(anon, 'leads', {}), false);
  assert.equal(allowsQuery(admin, 'leads', {}), true);
});

for (const collection of ['visitor_sessions', 'daily_analytics', 'search_terms', 'feature_daily']) {
  test(`${collection}: admin reads and deletes, the server writes`, () => {
    for (const operation of ['get', 'list', 'delete']) check(collection, 'd1', operation, { anon: false, asha: false, noClaims: false, admin: true }, someDoc);
    for (const operation of ['create', 'update']) check(collection, 'd1', operation, { anon: false, asha: false, admin: false }, someDoc);
    assert.equal(allowsQuery(asha, collection, {}), false);
    assert.equal(allowsQuery(admin, collection, {}), true);
  });
}

test('product_daily: anyone gets one document, only the admin lists or deletes, nobody writes', () => {
  check('product_daily', '2026-10-01_p1', 'get', { anon: true, asha: true, admin: true }, someDoc);
  check('product_daily', '2026-10-01_p1', 'get', { anon: true });
  check('product_daily', '2026-10-01_p1', 'list', { anon: false, asha: false, admin: true }, someDoc);
  check('product_daily', '2026-10-01_p1', 'delete', { anon: false, asha: false, admin: true }, someDoc);
  for (const operation of ['create', 'update']) check('product_daily', '2026-10-01_p1', operation, { anon: false, admin: false }, someDoc);
  assert.equal(allowsQuery(anon, 'product_daily', { where: [['day', 'in', ['2026-10-01']]] }), false);
});

test('analytics_totals: admin read only, never written or deleted from the browser', () => {
  for (const operation of READS) check('analytics_totals', 'lifetime', operation, { anon: false, asha: false, admin: true }, someDoc);
  for (const operation of WRITES) check('analytics_totals', 'lifetime', operation, { anon: false, asha: false, admin: false }, someDoc);
});

for (const collection of ['inventory_log', 'admin_settings']) {
  test(`${collection}: admin only`, () => {
    for (const operation of OPERATIONS) check(collection, 'inventory', operation, { anon: false, asha: false, noClaims: false, admin: true }, someDoc);
    assert.equal(allowsQuery(asha, collection, {}), false);
    assert.equal(allowsQuery(admin, collection, {}), true);
  });
}

test('default deny: collections without a rule are closed to everyone', () => {
  for (const collection of ['auth_state', 'private_settings', 'stock_alerts', 'shared_wishlists', 'email_events', 'return_photos', 'unknown', 'constructor', '__proto__', 'toString']) {
    for (const operation of OPERATIONS) check(collection, 'x', operation, { anon: false, asha: false, admin: false }, someDoc);
    assert.equal(allowsQuery(admin, collection, {}), false, collection);
  }
});

test('malformed calls are denied', () => {
  assert.equal(allows(admin, 'products', 'p1', 'write', someDoc), false);
  assert.equal(allows(admin, 'products', 'p1', 'read', someDoc), false);
  assert.equal(allows(admin, 'products', 'p1', 'listQuery', someDoc), false);
  assert.equal(allows(admin, 'products', '', 'get', someDoc), false);
  assert.equal(allows(admin, 'products', undefined, 'get', someDoc), false);
  assert.equal(allows(admin, undefined, 'p1', 'get', someDoc), false);
  assert.equal(allows(null, 'orders', 'o1', 'get', someDoc), false);
  assert.equal(allows(undefined, 'products', 'p1', 'get'), true);
});

test('identity: the admin flag must be exactly true and needs a signed-in uid', () => {
  assert.equal(allows({ admin: 'true', email: '', uid: 'sag-admin' }, 'orders', 'o1', 'get', someDoc), false);
  assert.equal(allows({ admin: 1, email: '', uid: 'sag-admin' }, 'orders', 'o1', 'get', someDoc), false);
  assert.equal(allows({ admin: true, email: '' }, 'orders', 'o1', 'get', someDoc), false);
  assert.equal(allows({ admin: true, email: '', uid: '' }, 'orders', 'o1', 'get', someDoc), false);
  // an email without a verified session is not a customer
  assert.equal(allows({ admin: false, email: 'asha@example.com', uid: '' }, 'profiles', 'asha@example.com', 'get'), false);
});
