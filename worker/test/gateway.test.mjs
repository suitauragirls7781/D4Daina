// Gateway tests: transport checks, identity, rules enforcement per operation, watch and commit.
// Run: node --test worker/test/gateway.test.mjs
//
// The gateway's imports of docstore.js, env.js and tokens.js are redirected (module hook below) to stand-ins
// that hand it the store and the token check of the current test. The store is the REAL document store
// (worker/src/docstore.js) over the in-memory D1 of d1-node.mjs; only the tokens are faked, so no secret is
// needed here (tokens.js has its own tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createStore } from '../src/docstore.js';
import { createD1 } from './d1-node.mjs';

const STUBS = {
  './docstore.js': 'export const createStore = () => globalThis.__gatewayTest.store;',
  './env.js': 'export const getDB = () => ({}); export const getEnv = () => ({});',
  './tokens.js': 'export const verifyIdToken = (token, checkRevoked) => globalThis.__gatewayTest.verify(token, checkRevoked);',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/worker/src/gateway.js') && Object.hasOwn(STUBS, specifier)) {
      return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { handleDb } = await import('../src/gateway.js');

// ---- stand-ins ----

/**
 * The real document store over an in-memory SQLite database, wrapped so a test can see what the gateway
 * asked for and can interfere at the two points that matter: a write landing in the middle of a request,
 * and a store that hands back more than the query asked for.
 */
const createTestStore = async (documents) => {
  const real = createStore(createD1());
  // One commit per document, so versions are predictable: 1, 2, 3, ... within a collection.
  const put = (collection, id, data) => real.commit([{ type: 'set', collection, id, data }]);
  for (const [collection, rows] of Object.entries(documents)) {
    for (const [id, data] of Object.entries(rows)) await put(collection, id, data);
  }
  const store = {
    queries: [],
    commits: [],
    ignoreFilters: false,
    beforeCommit: null,
    put,
    getDoc: (collection, id) => real.getDoc(collection, id),
    getMany: (addresses) => real.getMany(addresses),
    collectionVersion: (collection) => real.collectionVersion(collection),
    async query(query) {
      store.queries.push(query);
      return real.query(store.ignoreFilters ? { ...query, where: [] } : query);
    },
    async commit(writes, options) {
      if (store.beforeCommit) await store.beforeCommit();
      store.commits.push({ writes, options });
      return real.commit(writes, options);
    },
  };
  return store;
};

const TOKENS = {
  'admin-token': { uid: 'sag-admin', admin: true },
  'asha-token': { uid: 'c_asha', customerEmail: 'asha@example.com' },
  'meera-token': { uid: 'c_meera', customerEmail: 'meera@example.com' },
  // what tokens.js returns for a Google credential: an email, but none of our claims
  'google-token': { uid: 'google:1', email: 'asha@example.com', email_verified: true },
  'revoked-admin-token': { uid: 'sag-admin', admin: true },
};

// As tokens.js does: a refused token carries an auth/ code; anything else means the check itself failed.
const authError = (code) => Object.assign(new Error(code), { code: `auth/${code}` });
const verify = async (token, checkRevoked) => {
  if (!Object.hasOwn(TOKENS, token)) throw authError('argument-error');
  if (token === 'revoked-admin-token' && checkRevoked) throw authError('id-token-revoked');
  if (token === 'admin-token' && checkRevoked && globalThis.__gatewayTest.revocationCheckFails) throw new Error('D1_ERROR: Network connection lost.');
  return TOKENS[token];
};

const seed = () => ({
  products: {
    p1: { name: 'Lavender suit', stockQuantity: 5, inStock: true, price: 1999 },
    p2: { name: 'Plum kurta', stockQuantity: 0, inStock: false, price: 999 },
  },
  reviews: {
    r1: { productId: 'p1', status: 'approved', rating: 5 },
    r2: { productId: 'p1', status: 'pending', rating: 1 },
    r3: { productId: 'p2', status: 'approved', rating: 4 },
  },
  orders: { 'SAG-1001': { customerEmail: 'asha@example.com', total: 1999, paymentStatus: 'paid' } },
  profiles: { 'asha@example.com': { email: 'asha@example.com', cart: [], wishlist: [] } },
  customers: { 'asha@example.com': { email: 'asha@example.com', name: 'Asha' } },
  storefront_settings: { storeSettings: { shippingCharge: 99 } },
  leads: { l1: { email: 'x@y.co', source: 'newsletter', offerSent: false } },
  product_daily: { '2026-10-01_p1': { day: '2026-10-01', productId: 'p1', views: 12 } },
  admin_credentials: { singleton: { password_hash: 'not-for-browsers' } },
});

/** Fresh store per test; returns it so a test can look at what the gateway asked for. */
const useStore = async () => {
  const store = await createTestStore(seed());
  globalThis.__gatewayTest = { store, verify };
  return store;
};

const ORIGIN = 'https://shop.test';

const post = async (ops, { token, origin = ORIGIN, method = 'POST', rawBody, env = {}, ip } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (ip) headers['cf-connecting-ip'] = ip;
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = method === 'POST' ? rawBody ?? JSON.stringify({ ops }) : undefined;
  const response = await handleDb(new Request(`${ORIGIN}/api/db`, { method, headers, body }), env, {});
  return { status: response.status, headers: response.headers, body: await response.json() };
};

/** Runs one operation and returns its result (or its `{ error }`). */
const run = async (op, token) => {
  const { status, body } = await post([op], { token });
  assert.equal(status, 200);
  assert.equal(body.results.length, 1);
  return body.results[0];
};

const assertDenied = (result) => {
  assert.deepEqual(result, { error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } });
};
const assertCode = (result, code) => assert.equal(result.error?.code, code, JSON.stringify(result));

// ---- transport ----

test('only same-origin POST requests are served', async () => {
  await useStore();
  const op = [{ op: 'get', path: 'products/p1' }];
  assert.equal((await post(op, { method: 'GET' })).status, 405);
  assert.equal((await post(op, { origin: '' })).status, 403);
  assert.equal((await post(op, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(op, { origin: 'https://shop.test.evil.example' })).status, 403);
  assert.equal((await post(op, { origin: 'not a url' })).status, 403);
  const ok = await post(op);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store, max-age=0');
  assert.match(ok.headers.get('content-type'), /application\/json/);
});

test('body cap, JSON shape and the 20-operation limit', async () => {
  const store = await useStore();
  const big = JSON.stringify({ ops: [{ op: 'set', path: 'abandoned_checkouts/s1', data: { note: 'x'.repeat(200 * 1024) } }] });
  const tooBig = await post(null, { rawBody: big });
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.body.error.code, 'invalid-argument');
  assert.equal(store.commits.length, 0);

  assert.equal((await post(null, { rawBody: '{not json' })).status, 400);
  assert.equal((await post(null, { rawBody: '[]' })).status, 400);
  assert.equal((await post(null, { rawBody: 'null' })).status, 400);
  assert.equal((await post([])).status, 400);
  const get = { op: 'get', path: 'products/p1' };
  assert.equal((await post(Array(21).fill(get))).status, 400);
  const twenty = await post(Array(20).fill(get));
  assert.equal(twenty.status, 200);
  assert.equal(twenty.body.results.length, 20);
});

test('one result per operation, in order; a failed operation does not stop the others', async () => {
  await useStore();
  const { body } = await post([
    { op: 'get', path: 'products/p1' },
    { op: 'get', path: 'orders/SAG-1001' },
    { op: 'explode' },
    'nonsense',
    { op: 'get', path: 'products/p2' },
  ]);
  assert.equal(body.results[0].data.name, 'Lavender suit');
  assertDenied(body.results[1]);
  assertCode(body.results[2], 'invalid-argument');
  assertCode(body.results[3], 'invalid-argument');
  assert.equal(body.results[4].id, 'p2');
});

// ---- identity ----

test('identity comes from the bearer token; bad, revoked and claim-less tokens are plain visitors', async () => {
  await useStore();
  const order = { op: 'get', path: 'orders/SAG-1001' };
  const profile = { op: 'get', path: 'profiles/asha@example.com' };
  assert.equal((await run(order, 'admin-token')).exists, true);
  assertDenied(await run(order, 'revoked-admin-token'));
  assertDenied(await run(order, 'forged-token'));
  assertDenied(await run(order, 'asha-token'));
  assertDenied(await run(order));
  assert.equal((await run(profile, 'asha-token')).exists, true);
  assertDenied(await run(profile, 'meera-token'));
  // a verified Google credential for the same address is still not the customer session
  assertDenied(await run(profile, 'google-token'));
  // a visitor with a bad token still gets what any visitor gets
  assert.equal((await run({ op: 'get', path: 'products/p1' }, 'forged-token')).exists, true);
});

test('identity: when the revocation check itself fails the answer is "unavailable", never a silent sign-out', async (t) => {
  await useStore();
  const logged = t.mock.method(console, 'error', () => {});
  globalThis.__gatewayTest.revocationCheckFails = true;
  const { status, body } = await post([{ op: 'get', path: 'orders/SAG-1001' }], { token: 'admin-token' });
  assert.equal(status, 503);
  assert.deepEqual(body, { error: { code: 'unavailable', message: 'The service is temporarily unavailable. Please try again.' } });
  assert.equal(logged.mock.callCount(), 1);
  // shoppers are not affected: their tokens need no database read
  assert.equal((await run({ op: 'get', path: 'profiles/asha@example.com' }, 'asha-token')).exists, true);
  assert.equal((await run({ op: 'get', path: 'products/p1' })).exists, true);
});

// ---- limits for everyone but the admin ----

/** A stand-in for a Cloudflare rate-limit binding that allows `allowed` calls per key. */
const limiter = (allowed) => {
  const seen = [];
  return { seen, limit: async ({ key }) => { seen.push(key); return { success: seen.filter((entry) => entry === key).length <= allowed }; } };
};

test('guests: every document a request writes counts against the write limit', async () => {
  const store = await useStore();
  const save = (id) => ({ op: 'set', path: `abandoned_checkouts/${id}`, data: { firstName: 'A' }, merge: true });
  const read = { op: 'get', path: 'products/p1' };
  const env = { DB_GUEST_REQUESTS: limiter(100), DB_GUEST_WRITES: limiter(5) };
  const ip = '203.0.113.9';

  // 1 + 1 + 2 (a commit counts each document) = 4 of the 5 allowed
  const first = await post([read, save('a'), save('b'), { op: 'commit', writes: [{ op: 'set', path: 'abandoned_checkouts/c', data: {} }, { op: 'set', path: 'abandoned_checkouts/d', data: {} }] }], { env, ip });
  assert.deepEqual([first.status, first.body.results.slice(1)], [200, [{ ok: true }, { ok: true }, { ok: true }]]);
  assert.equal(env.DB_GUEST_WRITES.seen.length, 4);
  // two more would be 6: the whole request is refused and nothing of it is written
  const commits = store.commits.length;
  assert.equal((await post([save('e'), save('f')], { env, ip, token: 'forged-token' })).status, 429);
  assert.equal(store.commits.length, commits);
  // reads take nothing from the write allowance
  assert.equal((await post([read, read], { env, ip })).status, 200);
  assert.equal(env.DB_GUEST_WRITES.seen.length, 6);
});

test('guests: requests and writes are limited per address; the admin is not; a broken limiter lets requests through', async (t) => {
  const store = await useStore();
  const env = { DB_GUEST_REQUESTS: limiter(3), DB_GUEST_WRITES: limiter(1) };
  const save = [{ op: 'set', path: 'abandoned_checkouts/s1', data: { firstName: 'A' }, merge: true }];
  const read = [{ op: 'get', path: 'products/p1' }];

  assert.equal((await post(save, { env, ip: '203.0.113.5' })).status, 200);
  const second = await post(save, { env, ip: '203.0.113.5' });
  assert.equal(second.status, 429);
  assert.deepEqual(second.body, { error: { code: 'resource-exhausted', message: 'Too many requests. Please wait a minute and try again.' } });
  assert.equal(store.commits.length, 1);
  // reads do not use up the write allowance, and another address has its own
  assert.equal((await post(read, { env, ip: '203.0.113.5' })).status, 200);
  assert.equal((await post(read, { env, ip: '203.0.113.5' })).status, 429);
  assert.equal((await post(save, { env, ip: '203.0.113.6', token: 'asha-token' })).status, 200);
  assert.deepEqual(env.DB_GUEST_WRITES.seen, ['203.0.113.5', '203.0.113.5', '203.0.113.6']);

  // the admin, from the address that is over its limit
  assert.equal((await post(read, { env, ip: '203.0.113.5', token: 'admin-token' })).status, 200);
  assert.equal(env.DB_GUEST_REQUESTS.seen.length, 5);

  const logged = t.mock.method(console, 'error', () => {});
  const broken = { DB_GUEST_REQUESTS: { limit: async () => { throw new Error('binding down'); } }, DB_GUEST_WRITES: 'not a binding' };
  assert.equal((await post(save, { env: broken, ip: '203.0.113.5' })).status, 200);
  assert.equal(logged.mock.callCount(), 1);
});

// ---- get ----

test('get: shape for existing and missing documents', async () => {
  await useStore();
  assert.deepEqual(await run({ op: 'get', path: 'products/p1' }), {
    exists: true, id: 'p1', data: { name: 'Lavender suit', stockQuantity: 5, inStock: true, price: 1999 }, version: 1,
  });
  assert.deepEqual(await run({ op: 'get', path: 'products/nope' }), { exists: false, id: 'nope', data: null, version: 0 });
  assert.equal((await run({ op: 'get', path: 'product_daily/2026-10-01_p1' })).data.views, 12);
  assert.equal((await run({ op: 'get', path: 'storefront_settings/storeSettings' })).data.shippingCharge, 99);
});

test('get: nothing is returned that the identity may not read', async () => {
  await useStore();
  assert.equal((await run({ op: 'get', path: 'reviews/r1' })).data.status, 'approved');
  assertDenied(await run({ op: 'get', path: 'reviews/r2' }));
  assertDenied(await run({ op: 'get', path: 'reviews/missing' }));
  assert.equal((await run({ op: 'get', path: 'reviews/r2' }, 'admin-token')).data.status, 'pending');
  assertDenied(await run({ op: 'get', path: 'customers/asha@example.com' }, 'meera-token'));
  assert.equal((await run({ op: 'get', path: 'customers/asha@example.com' }, 'asha-token')).data.name, 'Asha');
  assertDenied(await run({ op: 'get', path: 'leads/l1' }));
  assertDenied(await run({ op: 'get', path: 'admin_credentials/singleton' }, 'admin-token'));
  assertDenied(await run({ op: 'get', path: 'auth_state/sag-admin' }, 'admin-token'));
});

test('paths: only collection/id; deeper paths are denied, malformed ones are invalid', async () => {
  await useStore();
  assertDenied(await run({ op: 'get', path: 'products/p1/secret/x' }, 'admin-token'));
  for (const path of ['products', 'products/', '/p1', 'products/p1/extra', '', 'products/..', 'products/__name__', 'bad name/p1', '1products/p1', 42, null]) {
    assertCode(await run({ op: 'get', path }, 'admin-token'), 'invalid-argument');
  }
});

// ---- query ----

test('query: returns documents and the collection version', async () => {
  const store = await useStore();
  const result = await run({ op: 'query', collection: 'products', orderBy: [['price', 'desc']], limit: 1 });
  assert.deepEqual(result, { docs: [{ id: 'p1', data: seed().products.p1, version: 1 }], version: 2 });
  assert.deepEqual(store.queries[0], { collection: 'products', where: [], orderBy: [['price', 'desc']], limit: 1 });
});

test('query: role checks before anything is read', async () => {
  const store = await useStore();
  for (const collection of ['orders', 'leads', 'profiles', 'customers', 'product_daily', 'admin_credentials', 'nope']) {
    assertDenied(await run({ op: 'query', collection }));
    assertDenied(await run({ op: 'query', collection }, 'asha-token'));
  }
  assert.equal(store.queries.length, 0);
  assert.equal((await run({ op: 'query', collection: 'orders' }, 'admin-token')).docs.length, 1);
  assert.equal((await run({ op: 'query', collection: 'product_daily', where: [['day', 'in', ['2026-10-01', '2026-09-30']]] }, 'admin-token')).docs.length, 1);
  assertDenied(await run({ op: 'query', collection: 'admin_credentials' }, 'admin-token'));
});

test('query: shoppers must ask for approved reviews; the admin sees all', async () => {
  await useStore();
  assertDenied(await run({ op: 'query', collection: 'reviews' }));
  assertDenied(await run({ op: 'query', collection: 'reviews', where: [['productId', '==', 'p1']] }));
  const mine = await run({ op: 'query', collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] });
  assert.deepEqual(mine.docs.map((doc) => doc.id), ['r1']);
  assert.equal((await run({ op: 'query', collection: 'reviews' }, 'admin-token')).docs.length, 3);
});

test('query: denied as a whole when one returned document is not readable', async () => {
  const store = await useStore();
  // a store that hands back more than was asked for must not leak the pending review
  store.ignoreFilters = true;
  assertDenied(await run({ op: 'query', collection: 'reviews', where: [['status', '==', 'approved']] }));
});

test('query: at most 500 documents unless admin', async () => {
  const store = await useStore();
  await run({ op: 'query', collection: 'products' });
  await run({ op: 'query', collection: 'products', limit: 5000 });
  await run({ op: 'query', collection: 'products', limit: 20 }, 'asha-token');
  await run({ op: 'query', collection: 'products' }, 'admin-token');
  await run({ op: 'query', collection: 'products', limit: 5000 }, 'admin-token');
  assert.deepEqual(store.queries.map((query) => query.limit), [500, 500, 20, undefined, 5000]);
});

test('query: filters, order and limit are validated before they reach the store', async () => {
  const store = await useStore();
  const bad = [
    { where: [["status') OR 1=1 --", '==', 'approved']] },
    { where: [['status', 'like', 'a%']] },
    { where: [['status', '==', { $ne: null }]] },
    { where: [['status', '==']] },
    { where: 'status' },
    { where: [['day', 'in', []]] },
    { where: [['day', 'in', Array(31).fill('d')]] },
    { where: [['day', 'in', 'd']] },
    { where: Array(11).fill(['status', '==', 'approved']) },
    { orderBy: [['price; DROP TABLE docs', 'asc']] },
    { orderBy: [['price', 'sideways']] },
    { orderBy: 'price' },
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { limit: '10' },
  ];
  for (const extra of bad) assertCode(await run({ op: 'query', collection: 'products', ...extra }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'query', collection: 'products; --' }, 'admin-token'), 'invalid-argument');
  assert.equal(store.queries.length, 0);
  const ok = await run({ op: 'query', collection: 'products', where: [['price', '>=', 1000]], orderBy: [['__name__']] }, 'admin-token');
  assert.deepEqual(ok.docs.map((doc) => doc.id), ['p1']);
});

// ---- writes ----

const contactLead = { name: 'Asha', email: 'asha@example.com', phone: null, source: 'contact', message: 'Hi', orderNumber: null, createdAt: '2026-10-01T10:00:00.000Z', offerSent: false };

test('add: a visitor can leave a lead, and only a well-formed one', async () => {
  const store = await useStore();
  const { id } = await run({ op: 'add', collection: 'leads', data: contactLead });
  assert.match(id, /^[A-Za-z0-9]{20}$/);
  assert.deepEqual((await store.getDoc('leads', id)).data, contactLead);
  assert.equal(store.commits.at(-1).writes[0].type, 'create');
  // not readable by the visitor who wrote it
  assertDenied(await run({ op: 'get', path: `leads/${id}` }));

  const before = store.commits.length;
  assertDenied(await run({ op: 'add', collection: 'leads', data: { ...contactLead, isAdmin: true } }));
  assertDenied(await run({ op: 'add', collection: 'leads', data: { ...contactLead, offerSent: true } }));
  assertDenied(await run({ op: 'add', collection: 'leads', data: { ...contactLead, message: 'm'.repeat(2001) } }));
  assertDenied(await run({ op: 'add', collection: 'leads', data: { email: 'a@b.co' } }));
  // a transform cannot stand in for a checked string field
  assertDenied(await run({ op: 'add', collection: 'leads', data: { ...contactLead, source: { __op: 'serverTimestamp' } } }));
  assertDenied(await run({ op: 'add', collection: 'products', data: { name: 'Free suit', price: 0 } }));
  assertDenied(await run({ op: 'add', collection: 'orders', data: { total: 1 } }, 'admin-token'));
  assertCode(await run({ op: 'add', collection: 'leads', data: 'hello' }), 'invalid-argument');
  assertCode(await run({ op: 'add', collection: 'leads', data: [contactLead] }), 'invalid-argument');
  assert.equal(store.commits.length, before);
});

test('set: create or update is decided by what is stored, and each has its own rule', async () => {
  const store = await useStore();
  // leads: a visitor may create, but may not overwrite an existing lead
  assert.deepEqual(await run({ op: 'set', path: 'leads/new1', data: contactLead }), { ok: true });
  assertDenied(await run({ op: 'set', path: 'leads/l1', data: contactLead }));
  assertDenied(await run({ op: 'set', path: 'leads/l1', data: { offerSent: true }, merge: true }));
  assert.equal((await store.getDoc('leads', 'l1')).data.offerSent, false);
  assert.deepEqual(await run({ op: 'update', path: 'leads/l1', data: { offerSent: true } }, 'admin-token'), { ok: true });
  assert.equal((await store.getDoc('leads', 'l1')).data.offerSent, true);

  // abandoned checkout: created, then merged into, by an anonymous shopper; never readable by them
  assert.deepEqual(await run({ op: 'set', path: 'abandoned_checkouts/s1', data: { firstName: 'A' }, merge: true }), { ok: true });
  assert.deepEqual(await run({ op: 'set', path: 'abandoned_checkouts/s1', data: { phone: '98' }, merge: true }), { ok: true });
  assert.deepEqual((await store.getDoc('abandoned_checkouts', 's1')).data, { firstName: 'A', phone: '98' });
  assertDenied(await run({ op: 'get', path: 'abandoned_checkouts/s1' }));
  assertDenied(await run({ op: 'delete', path: 'abandoned_checkouts/s1' }));
});

test('profiles: a customer writes only their own profile', async () => {
  const store = await useStore();
  const cart = [{ id: 'p1', quantity: 1 }];
  assert.deepEqual(await run({ op: 'set', path: 'profiles/asha@example.com', data: { cart }, merge: true }, 'asha-token'), { ok: true });
  assert.deepEqual((await store.getDoc('profiles', 'asha@example.com')).data, { email: 'asha@example.com', cart, wishlist: [] });
  // first save for a customer without a profile document yet
  assert.deepEqual(await run({ op: 'set', path: 'profiles/meera@example.com', data: { wishlist: [] }, merge: true }, 'meera-token'), { ok: true });
  assertDenied(await run({ op: 'set', path: 'profiles/asha@example.com', data: { cart: [] }, merge: true }, 'meera-token'));
  assertDenied(await run({ op: 'set', path: 'profiles/asha@example.com', data: { cart: [] }, merge: true }));
  assertDenied(await run({ op: 'update', path: 'profiles/asha@example.com', data: { cart: [] } }, 'google-token'));
  assertDenied(await run({ op: 'delete', path: 'profiles/asha@example.com' }, 'asha-token'));
  assert.deepEqual((await store.getDoc('profiles', 'asha@example.com')).data.cart, cart);
});

test('catalogue writes: admin only; merge keeps other fields, plain set replaces', async () => {
  const store = await useStore();
  assertDenied(await run({ op: 'set', path: 'products/p1', data: { price: 1 }, merge: true }));
  assertDenied(await run({ op: 'update', path: 'products/p1', data: { price: 1 } }, 'asha-token'));
  assertDenied(await run({ op: 'delete', path: 'products/p1' }, 'asha-token'));
  assert.equal((await store.getDoc('products', 'p1')).data.price, 1999);

  assert.deepEqual(await run({ op: 'set', path: 'products/p1', data: { price: 1799 }, merge: true }, 'admin-token'), { ok: true });
  assert.deepEqual((await store.getDoc('products', 'p1')).data, { name: 'Lavender suit', stockQuantity: 5, inStock: true, price: 1799 });
  assert.deepEqual(await run({ op: 'set', path: 'products/p3', data: { name: 'New', price: 10 } }, 'admin-token'), { ok: true });
  assert.deepEqual(await run({ op: 'set', path: 'products/p3', data: { name: 'Replaced' } }, 'admin-token'), { ok: true });
  assert.deepEqual((await store.getDoc('products', 'p3')).data, { name: 'Replaced' });
  assert.deepEqual(await run({ op: 'delete', path: 'products/p3' }, 'admin-token'), { ok: true });
  assert.equal(await store.getDoc('products', 'p3'), null);
  assert.deepEqual(await run({ op: 'set', path: 'admin_settings/inventory', data: { lowStockThreshold: 3 }, merge: true }, 'admin-token'), { ok: true });
  assert.deepEqual(await run({ op: 'set', path: 'inventory_log/inv-1', data: { productId: 'p1', at: '2026-10-01' }, merge: true }, 'admin-token'), { ok: true });
});

test('update and delete of a missing document', async () => {
  const store = await useStore();
  assertCode(await run({ op: 'update', path: 'products/ghost', data: { price: 1 } }, 'admin-token'), 'not-found');
  // a visitor learns nothing about what exists
  assertDenied(await run({ op: 'update', path: 'products/ghost', data: { price: 1 } }));
  const before = store.commits.length;
  assert.deepEqual(await run({ op: 'delete', path: 'products/ghost' }, 'admin-token'), { ok: true });
  assert.equal(store.commits.length, before);
  assertDenied(await run({ op: 'delete', path: 'products/ghost' }));
});

test('server-owned collections cannot be written from the browser, even by the admin', async () => {
  const store = await useStore();
  const tries = [
    { op: 'set', path: 'orders/SAG-2000', data: { total: 1, paymentStatus: 'paid' } },
    { op: 'update', path: 'orders/SAG-1001', data: { paymentStatus: 'refunded' } },
    { op: 'set', path: 'storefront_settings/storeSettings', data: { shippingCharge: 0 }, merge: true },
    { op: 'set', path: 'customers/asha@example.com', data: { name: 'x' }, merge: true },
    { op: 'set', path: 'admin_credentials/singleton', data: { password_hash: 'x' } },
    { op: 'set', path: 'rate_limits/otp_ip:1', data: { count: 0 } },
    { op: 'set', path: 'customer_email_otps/asha@example.com', data: { code: '000000' } },
    { op: 'set', path: 'auth_state/sag-admin', data: { revokedAt: 0 } },
    { op: 'set', path: 'private_settings/payment_gateways', data: {} },
    { op: 'update', path: 'analytics_totals/lifetime', data: { visitors: 0 } },
    { op: 'set', path: 'product_daily/2026-10-01_p1', data: { views: 999999 } },
  ];
  for (const op of tries) {
    assertDenied(await run(op, 'admin-token'));
    assertDenied(await run(op, 'asha-token'));
  }
  assert.equal(store.commits.length, 0);
  // the admin may still delete an order (Orders tab)
  assert.deepEqual(await run({ op: 'delete', path: 'orders/SAG-1001' }, 'admin-token'), { ok: true });
  assertDenied(await run({ op: 'delete', path: 'orders/SAG-1001' }, 'asha-token'));
});

test('write data is validated: objects only, no reserved field names', async () => {
  const store = await useStore();
  const sendRaw = async (opJson) => (await post(null, { token: 'admin-token', rawBody: `{"ops":[${opJson}]}` })).body.results[0];
  assertCode(await sendRaw('{"op":"set","path":"products/p9","data":{"__proto__":{"admin":true}}}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"set","path":"products/p9","data":{"a":[{"__proto__":{"x":1}}]}}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"set","path":"products/p9","data":{"":1}}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"update","path":"products/p1","data":{"a.__proto__.b":1}}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"update","path":"products/p1","data":{"a..b":1}}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"set","path":"products/p9","data":null}'), 'invalid-argument');
  assertCode(await sendRaw('{"op":"set","path":"products/p9"}'), 'invalid-argument');
  assert.equal(store.commits.length, 0);
  assert.equal({}.admin, undefined);
  // dotted update paths reach the store untouched
  assert.deepEqual(await run({ op: 'update', path: 'products/p1', data: { 'seo.title': 'Suit' } }, 'admin-token'), { ok: true });
  assert.deepEqual((await store.getDoc('products', 'p1')).data.seo, { title: 'Suit' });
});

test('a single write is retried when the document changes under it, then gives up with aborted', async () => {
  const store = await useStore();
  let interruptions = 1;
  store.beforeCommit = async () => {
    if (interruptions > 0) {
      interruptions -= 1;
      await store.put('products', 'p1', { name: 'Lavender suit', stockQuantity: 4, inStock: true, price: 1999 });
    }
  };
  assert.deepEqual(await run({ op: 'set', path: 'products/p1', data: { price: 1500 }, merge: true }, 'admin-token'), { ok: true });
  // the other writer's change survived the merge
  assert.deepEqual((await store.getDoc('products', 'p1')).data, { name: 'Lavender suit', stockQuantity: 4, inStock: true, price: 1500 });
  assert.equal(store.commits.length, 2);

  store.beforeCommit = () => store.put('products', 'p1', { name: 'busy' });
  assertCode(await run({ op: 'set', path: 'products/p1', data: { price: 1 }, merge: true }, 'admin-token'), 'aborted');
  assert.equal(store.commits.length, 5);
  assert.deepEqual((await store.getDoc('products', 'p1')).data, { name: 'busy' });
});

// ---- commit (browser runTransaction) ----

test('commit: writes land when the versions that were read still hold', async () => {
  const store = await useStore();
  const read = await run({ op: 'get', path: 'products/p1' }, 'admin-token');
  const result = await run({
    op: 'commit',
    preconditions: [{ path: 'products/p1', version: read.version }],
    // the shape src/shims/firebase-firestore.ts sends: `type`, plus the address both ways
    writes: [{ type: 'update', path: 'products/p1', collection: 'products', id: 'p1', data: { stockQuantity: 4, inStock: true } }],
  }, 'admin-token');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(await store.getDoc('products', 'p1'), { id: 'p1', data: { name: 'Lavender suit', stockQuantity: 4, inStock: true, price: 1999 }, version: 2 });
});

test('commit: a stale precondition answers aborted and writes nothing', async () => {
  const store = await useStore();
  const read = await run({ op: 'get', path: 'products/p1' }, 'admin-token');
  // someone else (a paid order) changes the stock after the read
  await store.put('products', 'p1', { ...seed().products.p1, stockQuantity: 3 });
  const result = await run({
    op: 'commit',
    preconditions: [{ path: 'products/p1', version: read.version }],
    writes: [
      { type: 'update', path: 'products/p1', data: { stockQuantity: 6 } },
      { type: 'set', path: 'inventory_log/inv-9', data: { productId: 'p1' } },
    ],
  }, 'admin-token');
  assertCode(result, 'aborted');
  assert.equal((await store.getDoc('products', 'p1')).data.stockQuantity, 3);
  assert.equal(await store.getDoc('inventory_log', 'inv-9'), null);

  // "it did not exist when I read it" (version 0 from a get) is stale once the document exists
  const missing = await run({
    op: 'commit',
    preconditions: [{ path: 'products/p1', version: 0 }],
    writes: [{ op: 'set', path: 'products/p1', data: { name: 'clobber' } }],
  }, 'admin-token');
  assertCode(missing, 'aborted');
  assert.equal((await store.getDoc('products', 'p1')).data.name, 'Lavender suit');
});

test('commit: every write is checked; one forbidden write refuses the whole commit', async () => {
  const store = await useStore();
  const mixed = {
    op: 'commit',
    preconditions: [],
    writes: [
      { op: 'update', path: 'products/p1', data: { stockQuantity: 9 } },
      { op: 'update', path: 'orders/SAG-1001', data: { paymentStatus: 'refunded' } },
    ],
  };
  assertDenied(await run(mixed, 'admin-token'));
  assertDenied(await run({ op: 'commit', writes: [{ op: 'update', path: 'products/p1', data: { price: 1 } }] }, 'asha-token'));
  assertDenied(await run({ op: 'commit', writes: [{ op: 'set', path: 'abandoned_checkouts/s1', data: { a: 1 } }, { op: 'delete', path: 'products/p1' }] }));
  assert.equal(store.commits.length, 0);
  assert.equal((await store.getDoc('products', 'p1')).data.stockQuantity, 5);

  assertCode(await run({ op: 'commit', writes: [] }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'commit', writes: Array(21).fill({ op: 'delete', path: 'products/p1' }) }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'commit', writes: [{ op: 'delete', path: 'products/p1' }, { op: 'update', path: 'products/p1', data: { a: 1 } }] }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'commit', writes: [{ op: 'create', path: 'products/p5', data: {} }] }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'commit', preconditions: [{ path: 'products/p1', version: 'x' }], writes: [{ op: 'delete', path: 'products/p1' }] }, 'admin-token'), 'invalid-argument');
  assertCode(await run({ op: 'commit', writes: [{ op: 'update', path: 'products/ghost', data: { a: 1 } }] }, 'admin-token'), 'not-found');
  assert.equal(store.commits.length, 0);
});

test('commit: a precondition is a read, so it needs read permission (no probing of private documents)', async () => {
  const store = await useStore();
  await store.put('customer_email_otps', 'asha@example.com__login', { hash: 'x' });
  const probe = (path, version, token) => run({
    op: 'commit',
    preconditions: [{ path, version }],
    writes: [{ op: 'set', path: 'abandoned_checkouts/probe', data: { a: 1 }, merge: true }],
  }, token);

  // the same answer whether the document exists or not, and whatever version is guessed
  const privatePaths = [
    'customers/asha@example.com', 'customers/nobody@example.com',
    'orders/SAG-1001', 'orders/SAG-9999',
    'customer_email_otps/asha@example.com__login', 'customer_email_otps/nobody@example.com__login',
    'rate_limits/admin_login:203.0.113.5', 'leads/l1', 'reviews/r2',
  ];
  for (const path of privatePaths) {
    for (const version of [null, 0, 1, 2]) assertDenied(await probe(path, version));
  }
  for (const version of [null, 1, 2, 3]) {
    assertDenied(await probe('admin_credentials/singleton', version));
    assertDenied(await probe('admin_credentials/singleton', version, 'admin-token'));
  }
  assertDenied(await probe('customers/asha@example.com', 1, 'meera-token'));
  // a document the caller writes but may not read gives nothing away either
  for (const version of [null, 1]) assertDenied(await probe('abandoned_checkouts/probe', version));
  assert.equal(store.commits.length, 0);
  assert.equal(await store.getDoc('abandoned_checkouts', 'probe'), null);

  // what the caller may read still works as a precondition: public documents, and a customer's own
  assert.deepEqual(await probe('products/p1', 1), { ok: true });
  assertCode(await probe('products/p1', 7), 'aborted');
  assert.deepEqual(await probe('products/never-existed', null), { ok: true });
  const own = await run({
    op: 'commit',
    preconditions: [{ path: 'profiles/asha@example.com', version: 1 }],
    writes: [{ op: 'set', path: 'profiles/asha@example.com', data: { cart: [{ id: 'p1', quantity: 1 }] }, merge: true }],
  }, 'asha-token');
  assert.deepEqual(own, { ok: true });
});

// ---- watch ----

test('watch: first call sends everything, later calls answer unchanged until something is written', async () => {
  const store = await useStore();
  const targets = (docSince, querySince) => [
    { key: 'd', kind: 'doc', path: 'storefront_settings/storeSettings', since: docSince },
    { key: 'q', kind: 'query', collection: 'products', orderBy: [['price', 'asc']], since: querySince },
  ];
  const first = await run({ op: 'watch', targets: targets() });
  assert.deepEqual(first.targets[0], { key: 'd', exists: true, id: 'storeSettings', data: { shippingCharge: 99 }, version: 1 });
  assert.equal(first.targets[1].key, 'q');
  assert.equal(first.targets[1].version, 2);
  assert.deepEqual(first.targets[1].docs.map((doc) => doc.id), ['p2', 'p1']);

  const queriesSoFar = store.queries.length;
  const second = await run({ op: 'watch', targets: targets(first.targets[0].version, first.targets[1].version) });
  assert.deepEqual(second.targets, [{ key: 'd', unchanged: true }, { key: 'q', unchanged: true }]);
  // an unchanged query costs the version row only
  assert.equal(store.queries.length, queriesSoFar);

  await store.put('products', 'p1', { ...seed().products.p1, price: 1 });
  await store.put('storefront_settings', 'storeSettings', { shippingCharge: 49 });
  const third = await run({ op: 'watch', targets: targets(first.targets[0].version, first.targets[1].version) });
  assert.deepEqual(third.targets[0], { key: 'd', exists: true, id: 'storeSettings', data: { shippingCharge: 49 }, version: 2 });
  assert.equal(third.targets[1].version, 3);
  assert.deepEqual(third.targets[1].docs.map((doc) => doc.id), ['p1', 'p2']);
});

test('watch: missing documents, and a deleted document is reported as gone', async () => {
  const store = await useStore();
  const missing = await run({ op: 'watch', targets: [{ key: 'm', kind: 'doc', path: 'product_daily/2026-10-02_p1' }] });
  assert.deepEqual(missing.targets, [{ key: 'm', exists: false, id: '2026-10-02_p1', data: null, version: 0 }]);
  const still = await run({ op: 'watch', targets: [{ key: 'm', kind: 'doc', path: 'product_daily/2026-10-02_p1', since: 0 }] });
  assert.deepEqual(still.targets, [{ key: 'm', unchanged: true }]);
  await store.commit([{ type: 'delete', collection: 'product_daily', id: '2026-10-01_p1' }]);
  const gone = await run({ op: 'watch', targets: [{ key: 'g', kind: 'doc', path: 'product_daily/2026-10-01_p1', since: 1 }] });
  assert.deepEqual(gone.targets, [{ key: 'g', exists: false, id: '2026-10-01_p1', data: null, version: 0 }]);
});

test('watch: each target is checked on its own; a forbidden one never answers "unchanged"', async () => {
  const store = await useStore();
  const targets = [
    { key: 'orders', kind: 'query', collection: 'orders', since: 1 },
    { key: 'order', kind: 'doc', path: 'orders/SAG-1001', since: 1 },
    { key: 'reviews-all', kind: 'query', collection: 'reviews', since: 3 },
    { key: 'pending', kind: 'doc', path: 'reviews/r2', since: 2 },
    { key: 'bad-path', kind: 'doc', path: 'orders' },
    { key: 'reviews', kind: 'query', collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] },
    { key: 'profile', kind: 'doc', path: 'profiles/asha@example.com' },
  ];
  const asVisitor = await run({ op: 'watch', targets });
  const visitor = Object.fromEntries(asVisitor.targets.map((target) => [target.key, target]));
  for (const key of ['orders', 'order', 'reviews-all', 'pending', 'profile']) assertDenied({ error: visitor[key].error });
  assertCode(visitor['bad-path'], 'invalid-argument');
  assert.deepEqual(visitor.reviews.docs.map((doc) => doc.id), ['r1']);
  assert.deepEqual(asVisitor.targets.map((target) => target.key), targets.map((target) => target.key));

  const asCustomer = await run({ op: 'watch', targets }, 'asha-token');
  assert.equal(asCustomer.targets[6].data.email, 'asha@example.com');
  assertDenied({ error: asCustomer.targets[0].error });

  const asAdmin = await run({ op: 'watch', targets }, 'admin-token');
  assert.deepEqual(asAdmin.targets.slice(0, 4), [
    { key: 'orders', unchanged: true },
    { key: 'order', unchanged: true },
    { key: 'reviews-all', unchanged: true },
    { key: 'pending', unchanged: true },
  ]);

  store.ignoreFilters = true;
  const leaky = await run({ op: 'watch', targets: [targets[5]] });
  assertDenied({ error: leaky.targets[0].error });
});

test('watch: query targets run side by side, and answers keep their order and their own errors', async () => {
  const store = await useStore();
  // The earlier a target is in the list, the later its version read finishes: answers arrive in reverse.
  const delays = { products: 40, leads: 25, reviews: 10 };
  const versionRead = store.collectionVersion;
  let running = 0;
  let mostAtOnce = 0;
  store.collectionVersion = async (collection) => {
    running += 1;
    mostAtOnce = Math.max(mostAtOnce, running);
    try {
      await new Promise((resolve) => setTimeout(resolve, delays[collection] || 0));
      if (collection === 'leads') throw new Error('D1_ERROR: Network connection lost.');
      return await versionRead(collection);
    } finally {
      running -= 1;
    }
  };
  const targets = [
    { key: 'products', kind: 'query', collection: 'products', orderBy: [['price', 'asc']] },
    { key: 'orders', kind: 'query', collection: 'orders' },
    { key: 'settings', kind: 'doc', path: 'storefront_settings/storeSettings' },
    { key: 'leads', kind: 'query', collection: 'leads' },
    { key: 'bad-path', kind: 'doc', path: 'orders' },
    { key: 'reviews', kind: 'query', collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] },
  ];

  const asVisitor = await run({ op: 'watch', targets });
  assert.deepEqual(asVisitor.targets.map((target) => target.key), targets.map((target) => target.key));
  assert.deepEqual(asVisitor.targets[0].docs.map((doc) => doc.id), ['p2', 'p1']);
  assertDenied({ error: asVisitor.targets[1].error });
  assert.deepEqual(asVisitor.targets[2].data, { shippingCharge: 99 });
  assertDenied({ error: asVisitor.targets[3].error });
  assertCode(asVisitor.targets[4], 'invalid-argument');
  assert.deepEqual(asVisitor.targets[5].docs.map((doc) => doc.id), ['r1']);
  // a refused target never reaches the database: only the two allowed queries read a version
  assert.equal(mostAtOnce, 2);

  // For the admin the leads read fails in the database; only that target reports it, without details.
  mostAtOnce = 0;
  const asAdmin = await run({ op: 'watch', targets }, 'admin-token');
  assert.deepEqual(asAdmin.targets.map((target) => target.key), targets.map((target) => target.key));
  assert.deepEqual(asAdmin.targets[1].docs.map((doc) => doc.id), ['SAG-1001']);
  assertCode(asAdmin.targets[3], 'unavailable');
  assert.ok(!JSON.stringify(asAdmin.targets[3]).includes('D1_ERROR'));
  assertCode(asAdmin.targets[4], 'invalid-argument');
  assert.deepEqual(asAdmin.targets[5].docs.map((doc) => doc.id), ['r1']);
  assert.equal(mostAtOnce, 4);
});

test('watch: target list is validated', async () => {
  await useStore();
  assertCode(await run({ op: 'watch' }), 'invalid-argument');
  assertCode(await run({ op: 'watch', targets: Array(51).fill({ key: 'k', kind: 'doc', path: 'products/p1' }) }), 'invalid-argument');
  assertCode(await run({ op: 'watch', targets: [{ kind: 'doc', path: 'products/p1' }] }), 'invalid-argument');
  assertCode(await run({ op: 'watch', targets: [{ key: 'k', kind: 'stream', path: 'products/p1' }] }), 'invalid-argument');
  assert.deepEqual(await run({ op: 'watch', targets: [] }), { targets: [] });
});

// ---- errors ----

test('errors are sanitised: store failures become "unavailable" without internal details', async (t) => {
  const store = await useStore();
  const logged = t.mock.method(console, 'error', () => {});
  store.getDoc = async () => { throw new Error('D1_ERROR: no such table: docs (SELECT data FROM docs WHERE ...)'); };
  store.query = async () => { throw new Error('D1_ERROR: boom'); };
  store.commit = async () => { throw Object.assign(new Error('internal detail'), { code: 'SQLITE_BUSY' }); };
  const { status, body } = await post([
    { op: 'get', path: 'products/p1' },
    { op: 'query', collection: 'products' },
    { op: 'add', collection: 'leads', data: contactLead },
  ]);
  assert.equal(status, 200);
  for (const result of body.results) {
    assert.deepEqual(result, { error: { code: 'unavailable', message: 'The service is temporarily unavailable. Please try again.' } });
  }
  assert.equal(logged.mock.callCount(), 3);
  assert.doesNotMatch(JSON.stringify(body), /D1_ERROR|SQLITE|internal detail|docs/);

  // the store's own well-known codes pass through, with our wording
  store.commit = async () => { throw Object.assign(new Error('docs.id collision at row 7'), { code: 'already-exists' }); };
  const clash = await run({ op: 'add', collection: 'leads', data: contactLead });
  assert.deepEqual(clash, { error: { code: 'already-exists', message: 'Document already exists.' } });
});
