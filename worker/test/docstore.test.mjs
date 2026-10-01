// Document store unit tests over node:sqlite.  Run: node --test worker/test/docstore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, buildQuery, StoreError, INDEXED_FIELDS } from '../src/docstore.js';
import { createD1, HOT_QUERIES, queryPlan } from './d1-node.mjs';

const fresh = () => {
  const d1 = createD1();
  return { d1, store: createStore(d1) };
};
const set = (collection, id, data, extra = {}) => ({ type: 'set', collection, id, data, ...extra });
const update = (collection, id, data) => ({ type: 'update', collection, id, data });
const create = (collection, id, data) => ({ type: 'create', collection, id, data });
const del = (collection, id) => ({ type: 'delete', collection, id });
const count = async (d1, table) => d1.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n');
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof StoreError && error.code === code);

// Lets a test slip a competing write in between a commit's read and its batch.
const withRace = (d1, onBatch) => ({
  prepare: (sql) => d1.prepare(sql),
  batch: async (statements) => {
    await onBatch();
    return d1.batch(statements);
  },
});

test('getDoc and getMany: point reads, order kept, null for missing, more ids than one statement holds', async () => {
  const { store } = fresh();
  assert.equal(await store.getDoc('products', 'nope'), null);
  const ids = Array.from({ length: 205 }, (_, i) => `p${i}`);
  await store.commit(ids.map((id, i) => set('products', id, { n: i })));
  assert.deepEqual(await store.getDoc('products', 'p7'), { id: 'p7', data: { n: 7 }, version: 1 });
  const asked = [{ collection: 'products', id: 'p204' }, { collection: 'orders', id: 'missing' }, { collection: 'products', id: 'p0' }, { collection: 'products', id: 'p204' }];
  const got = await store.getMany(asked);
  assert.deepEqual(got.map((doc) => doc && doc.data.n), [204, null, 0, 204]);
  const all = await store.getMany(ids.map((id) => ({ collection: 'products', id })));
  assert.deepEqual(all.map((doc) => doc.data.n), ids.map((_, i) => i));
  assert.deepEqual(await store.getMany([]), []);
});

test('set replaces the document; undefined is dropped; dates become ISO strings', async () => {
  const { store } = fresh();
  await store.commit([set('c', 'a', { x: 1, keep: { y: 2 } })]);
  const when = new Date('2026-10-02T10:00:00.000Z');
  await store.commit([set('c', 'a', { z: 3, gone: undefined, nested: { gone: undefined, at: when }, list: [when, undefined, { d: when }] })]);
  assert.deepEqual((await store.getDoc('c', 'a')).data, {
    z: 3,
    nested: { at: '2026-10-02T10:00:00.000Z' },
    list: ['2026-10-02T10:00:00.000Z', null, { d: '2026-10-02T10:00:00.000Z' }],
  });
});

test('values that cannot round-trip through JSON are refused and nothing is written', async () => {
  const { store, d1 } = fresh();
  await rejectsWith(store.commit([set('c', 'ok', { fine: 1 }), set('c', 'a', { n: NaN })]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a', { n: Infinity })]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a', { f: () => 1 })]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a', { d: new Date('nonsense') })]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a', { m: new Map() })]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a', [1, 2])]), 'invalid-argument');
  await rejectsWith(store.commit([set('c', 'a/b', { x: 1 })]), 'invalid-argument');
  await rejectsWith(store.commit([set('bad name', 'a', { x: 1 })]), 'invalid-argument');
  await rejectsWith(store.commit([{ type: 'upsert', collection: 'c', id: 'a', data: {} }]), 'invalid-argument');
  assert.equal(await count(d1, 'docs'), 0);
});

test('set with merge: maps merge deeply, arrays and scalars are replaced, an empty map replaces', async () => {
  const { store } = fresh();
  await store.commit([set('c', 'a', { name: 'n', address: { city: 'Delhi', pin: '110001', geo: { lat: 1, lng: 2 } }, tags: ['a', 'b'], prefs: { x: 1 } })]);
  await store.commit([set('c', 'a', { address: { pin: '110002', geo: { lat: 9 } }, tags: ['c'], prefs: {}, skipped: undefined, extra: null }, { merge: true })]);
  assert.deepEqual((await store.getDoc('c', 'a')).data, {
    name: 'n',
    address: { city: 'Delhi', pin: '110002', geo: { lat: 9, lng: 2 } },
    tags: ['c'],
    prefs: {},
    extra: null,
  });
  // merge into a document that does not exist creates it
  await store.commit([set('c', 'new', { a: { b: 1 } }, { merge: true })]);
  assert.deepEqual(await store.getDoc('c', 'new'), { id: 'new', data: { a: { b: 1 } }, version: 2 + 1 });
});

test('set with mergeFields writes only the named fields', async () => {
  const { store } = fresh();
  await store.commit([set('c', 'a', { a: 1, b: { x: 1, y: 2 }, c: 3 })]);
  await store.commit([set('c', 'a', { a: 10, b: { x: 11, y: 12 }, c: 13 }, { mergeFields: ['a', 'b.x'] })]);
  assert.deepEqual((await store.getDoc('c', 'a')).data, { a: 10, b: { x: 11, y: 2 }, c: 3 });
  await rejectsWith(store.commit([set('c', 'a', { a: 1 }, { mergeFields: ['zzz'] })]), 'invalid-argument');
});

test('update: replaces the value at each path (dotted paths reach into maps), needs the document', async () => {
  const { store, d1 } = fresh();
  await store.commit([set('orders', 'o1', { status: 'Pending', returnRequest: { status: 'requested', items: [1], note: 'n' }, a: 1 })]);
  await store.commit([update('orders', 'o1', {
    status: 'Paid',
    'returnRequest.status': 'approved',
    'deep.er.value': 5,
    a: { replaced: true },
    untouched: undefined,
  })]);
  assert.deepEqual((await store.getDoc('orders', 'o1')).data, {
    status: 'Paid',
    returnRequest: { status: 'approved', items: [1], note: 'n' },
    a: { replaced: true },
    deep: { er: { value: 5 } },
  });
  // a map value replaces the old map, it is not merged
  await store.commit([update('orders', 'o1', { returnRequest: { status: 'x' } })]);
  assert.deepEqual((await store.getDoc('orders', 'o1')).data.returnRequest, { status: 'x' });

  const before = await count(d1, 'docs');
  await rejectsWith(store.commit([set('orders', 'o2', { x: 1 }), update('orders', 'missing', { x: 1 })]), 'not-found');
  assert.equal(await count(d1, 'docs'), before, 'the set in the same commit must not be written');
  await rejectsWith(store.commit([update('orders', 'o1', { 'a..b': 1 })]), 'invalid-argument');
});

test('create fails on an existing document and leaves it alone', async () => {
  const { store } = fresh();
  await store.commit([create('orders', 'SAG-1', { n: 1 })]);
  await rejectsWith(store.commit([set('orders', 'other', { n: 1 }), create('orders', 'SAG-1', { n: 2 })]), 'already-exists');
  assert.deepEqual(await store.getDoc('orders', 'SAG-1'), { id: 'SAG-1', data: { n: 1 }, version: 1 });
  assert.equal(await store.getDoc('orders', 'other'), null);
});

test('versions: +1 per write, collection version bumped once per commit, a recreated document never reuses a version', async () => {
  const { store, d1 } = fresh();
  assert.equal(await store.collectionVersion('c'), 0);
  await store.commit([set('c', 'a', { n: 1 }), set('c', 'b', { n: 1 }), set('other', 'x', {})]);
  assert.equal(await store.collectionVersion('c'), 1);
  assert.equal(await store.collectionVersion('other'), 1);
  await store.commit([update('c', 'a', { n: 2 })]);
  await store.commit([update('c', 'a', { n: 3 })]);
  assert.equal((await store.getDoc('c', 'a')).version, 3);
  assert.equal((await store.getDoc('c', 'b')).version, 1);
  assert.equal(await store.collectionVersion('c'), 3);

  await store.commit([del('c', 'a')]);
  assert.equal(await store.getDoc('c', 'a'), null);
  assert.equal(await store.collectionVersion('c'), 4);
  await store.commit([del('c', 'never-existed')]); // deleting nothing is fine, as in Firestore
  await store.commit([set('c', 'a', { n: 'again' })]);
  assert.equal((await store.getDoc('c', 'a')).version, 6, 'higher than any version the old document had');

  const row = await d1.prepare("SELECT created_at, updated_at FROM docs WHERE collection = 'c' AND id = 'b'").first();
  assert.match(row.created_at, /^\d{4}-\d\d-\d\dT/);
  assert.equal(await count(d1, 'tx_guard'), 0);
});

test('several writes to one document in one commit apply in order and count as one write', async () => {
  const { store } = fresh();
  await store.commit([
    set('daily_analytics', 'd', { date: 'd', searches: { __op: 'increment', n: 1 } }, { merge: true }),
    set('daily_analytics', 'd', { date: 'd', productViews: { __op: 'increment', n: 1 } }, { merge: true }),
    update('daily_analytics', 'd', { searches: { __op: 'increment', n: 5 } }),
  ]);
  assert.deepEqual(await store.getDoc('daily_analytics', 'd'), { id: 'd', data: { date: 'd', searches: 6, productViews: 1 }, version: 1 });
  await store.commit([set('c', 'a', { n: 1 }), del('c', 'a'), create('c', 'a', { n: 2 })]);
  assert.deepEqual((await store.getDoc('c', 'a')).data, { n: 2 });
  await store.commit([set('c', 'b', { n: 1 }), del('c', 'b')]);
  assert.equal(await store.getDoc('c', 'b'), null);
});

test('sentinels: increment, arrayUnion, arrayRemove, delete, serverTimestamp', async () => {
  const { store } = fresh();
  await store.commit([set('c', 'a', { count: 5, text: 'x', actions: [{ type: 'view', path: '/' }], tags: ['a', 'b', 'a'], nested: { n: 1, drop: 1 }, drop: 1 })]);
  await store.commit([update('c', 'a', {
    count: { __op: 'increment', n: 2 },
    text: { __op: 'increment', n: 3 },                 // not a number: becomes the operand
    fresh: { __op: 'increment', n: -1 },               // missing: becomes the operand
    actions: { __op: 'arrayUnion', values: [{ path: '/', type: 'view' }, { type: 'cart', path: '/cart' }] },
    tags: { __op: 'arrayRemove', values: ['a'] },
    newList: { __op: 'arrayUnion', values: [1, 1, 2] },
    'nested.n': { __op: 'increment', n: 10 },
    'nested.drop': { __op: 'delete' },
    drop: { __op: 'delete' },
    stamped: { __op: 'serverTimestamp' },
  })]);
  const { data } = await store.getDoc('c', 'a');
  assert.match(data.stamped, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  delete data.stamped;
  assert.deepEqual(data, {
    count: 7,
    text: 3,
    fresh: -1,
    actions: [{ type: 'view', path: '/' }, { type: 'cart', path: '/cart' }],
    tags: ['b'],
    newList: [1, 2],
    nested: { n: 11 },
  });

  // inside set + merge, at depth, and on a document that does not exist yet
  await store.commit([set('c', 'm', { day: 'd', count: { __op: 'increment', n: 1 }, per: { ip: { __op: 'increment', n: 1 } }, gone: { __op: 'delete' } }, { merge: true })]);
  await store.commit([set('c', 'm', { count: { __op: 'increment', n: 1 }, per: { ip: { __op: 'increment', n: 1 } }, day: { __op: 'delete' } }, { merge: true })]);
  assert.deepEqual((await store.getDoc('c', 'm')).data, { count: 2, per: { ip: 2 } });

  // plain set: other fields are replaced, the transform still sees the stored value
  await store.commit([set('c', 'm', { count: { __op: 'increment', n: 1 }, only: true })]);
  assert.deepEqual((await store.getDoc('c', 'm')).data, { count: 3, only: true });

  await rejectsWith(store.commit([update('c', 'a', { count: { __op: 'increment', n: 'x' } })]), 'invalid-argument');
  await rejectsWith(store.commit([update('c', 'a', { count: { __op: 'multiply', n: 2 } })]), 'invalid-argument');
  await rejectsWith(store.commit([update('c', 'a', { list: [{ __op: 'increment', n: 1 }] })]), 'invalid-argument');
});

test('preconditions: a commit goes through only if every document read is unchanged', async () => {
  const { store, d1 } = fresh();
  await store.commit([set('orders', 'o1', { paymentStatus: 'Unpaid' }), set('products', 'p1', { stockQuantity: 5 })]);
  const order = await store.getDoc('orders', 'o1');
  const product = await store.getDoc('products', 'p1');

  // someone else changes the product first
  await store.commit([update('products', 'p1', { stockQuantity: 4 })]);
  const stale = [{ collection: 'orders', id: 'o1', version: order.version }, { collection: 'products', id: 'p1', version: product.version }];
  const before = await d1.prepare('SELECT collection, id, data, version FROM docs ORDER BY collection, id').all();
  const versionsBefore = await d1.prepare('SELECT * FROM collection_versions ORDER BY collection').all();
  await rejectsWith(store.commit([
    update('orders', 'o1', { paymentStatus: 'Paid' }),
    update('products', 'p1', { stockQuantity: 3 }),
    set('daily_analytics', 'd', { purchases: { __op: 'increment', n: 1 } }, { merge: true }),
  ], { preconditions: stale }), 'aborted');
  assert.deepEqual((await d1.prepare('SELECT collection, id, data, version FROM docs ORDER BY collection, id').all()).results, before.results);
  assert.deepEqual((await d1.prepare('SELECT * FROM collection_versions ORDER BY collection').all()).results, versionsBefore.results);

  // with fresh versions it goes through, including a precondition on a document that is only read
  const fresh2 = [{ collection: 'orders', id: 'o1', version: 1 }, { collection: 'products', id: 'p1', version: 2 }, { collection: 'coupons', id: 'none', version: null }];
  await store.commit([update('orders', 'o1', { paymentStatus: 'Paid' })], { preconditions: fresh2 });
  assert.equal((await store.getDoc('orders', 'o1')).data.paymentStatus, 'Paid');

  // "did not exist when read" fails once the document exists
  await store.commit([set('coupons', 'none', { code: 'X' })]);
  await rejectsWith(store.commit([set('c', 'x', { a: 1 })], { preconditions: [{ collection: 'coupons', id: 'none', version: null }] }), 'aborted');
  // a version for a document that has been deleted fails too
  await store.commit([del('coupons', 'none')]);
  await rejectsWith(store.commit([set('c', 'x', { a: 1 })], { preconditions: [{ collection: 'coupons', id: 'none', version: 1 }] }), 'aborted');
  assert.equal(await store.getDoc('c', 'x'), null);
  assert.equal(await count(d1, 'tx_guard'), 0);
});

test('collection precondition: any write to the collection since the query aborts the commit', async () => {
  const { store } = fresh();
  await store.commit([set('reviews', 'r1', { productId: 'p' })]);
  const seen = await store.collectionVersion('reviews');
  await store.commit([set('products', 'p', { rating: 4 })], { preconditions: [{ collection: 'reviews', collectionVersion: seen }] });
  await store.commit([set('reviews', 'r2', { productId: 'p' })]); // a concurrent insert
  await rejectsWith(store.commit([set('products', 'p', { rating: 5 })], { preconditions: [{ collection: 'reviews', collectionVersion: seen }] }), 'aborted');
  assert.equal((await store.getDoc('products', 'p')).data.rating, 4);
  // a collection never written has version 0
  await store.commit([set('products', 'q', {})], { preconditions: [{ collection: 'empty', collectionVersion: 0 }] });
  await rejectsWith(store.commit([set('products', 'q', {})], { preconditions: [{ collection: 'empty', collectionVersion: 1 }] }), 'aborted');
});

test('a commit without writes touches nothing, even with stale preconditions', async () => {
  const { store, d1 } = fresh();
  await store.commit([], { preconditions: [{ collection: 'c', id: 'a', version: 9 }] });
  assert.equal(await count(d1, 'docs'), 0);
  assert.equal(await count(d1, 'collection_versions'), 0);
});

test('a change between read and write is caught by the guard: retried when it is our own read, aborted when it is the caller\'s', async () => {
  const d1 = createD1();
  const plain = createStore(d1);
  await plain.commit([set('counters', 'c', { n: 0 }), set('orders', 'o', { status: 'Pending' })]);

  // 1. sentinel write: the competing increment lands first, ours is retried on top of it
  let raced = 0;
  const racing = createStore(withRace(d1, async () => {
    if (raced++ === 0) await plain.commit([update('counters', 'c', { n: { __op: 'increment', n: 100 } })]);
  }));
  await racing.commit([update('counters', 'c', { n: { __op: 'increment', n: 1 } }), set('orders', 'side', { written: 'once' })]);
  assert.equal((await plain.getDoc('counters', 'c')).data.n, 101);
  assert.equal(raced, 2, 'one failed batch, one retry');
  assert.equal(await plain.collectionVersion('orders'), 2, 'the failed attempt wrote nothing: one bump only');

  // 2. caller precondition: the same race must abort and leave everything as the competitor left it
  const order = await plain.getDoc('orders', 'o');
  let once = true;
  const racing2 = createStore(withRace(d1, async () => {
    if (once) { once = false; await plain.commit([update('orders', 'o', { status: 'Cancelled' })]); }
  }));
  await rejectsWith(racing2.commit(
    [update('orders', 'o', { status: 'Paid' }), update('counters', 'c', { n: { __op: 'increment', n: 1 } })],
    { preconditions: [{ collection: 'orders', id: 'o', version: order.version }] },
  ), 'aborted');
  assert.equal((await plain.getDoc('orders', 'o')).data.status, 'Cancelled');
  assert.equal((await plain.getDoc('counters', 'c')).data.n, 101);

  // 3. a document created by someone else between our read ("missing") and our create
  let once3 = true;
  const racing3 = createStore(withRace(d1, async () => {
    if (once3) { once3 = false; await plain.commit([set('orders', 'SAG-9', { owner: 'other' })]); }
  }));
  await rejectsWith(racing3.commit([create('orders', 'SAG-9', { owner: 'me' })]), 'already-exists');
  assert.equal((await plain.getDoc('orders', 'SAG-9')).data.owner, 'other');
  assert.equal(await count(d1, 'tx_guard'), 0);
});

test('endless contention gives up with aborted after 8 attempts and writes nothing', async () => {
  const d1 = createD1();
  const plain = createStore(d1);
  await plain.commit([set('counters', 'c', { n: 0, ours: 0 })]);
  let batches = 0;
  const racing = createStore(withRace(d1, async () => {
    batches += 1;
    await plain.commit([update('counters', 'c', { n: { __op: 'increment', n: 1 } })]);
  }));
  await rejectsWith(racing.commit([update('counters', 'c', { ours: { __op: 'increment', n: 1 } })]), 'aborted');
  assert.equal(batches, 8);
  assert.deepEqual((await plain.getDoc('counters', 'c')).data, { n: 8, ours: 0 });
});

test('concurrent increments of one counter all land', async () => {
  const { store } = fresh();
  await Promise.all(Array.from({ length: 6 }, () => store.commit([set('daily_analytics', 'day', { visits: { __op: 'increment', n: 1 } }, { merge: true })])));
  assert.equal((await store.getDoc('daily_analytics', 'day')).data.visits, 6);
  await Promise.all([
    store.commit([update('daily_analytics', 'day', { visits: { __op: 'increment', n: 1 } })]),
    store.commit([update('daily_analytics', 'day', { visits: { __op: 'increment', n: 1 } })]),
  ]);
  assert.deepEqual(await store.getDoc('daily_analytics', 'day'), { id: 'day', data: { visits: 8 }, version: 8 });
});

test('query: filters, sorting, limit, select', async () => {
  const { store } = fresh();
  await store.commit([
    set('items', 'a', { n: 1, s: 'x', flag: true, tags: ['red', 'blue'], nested: { k: 'v' }, nul: null }),
    set('items', 'b', { n: 2, s: 'y', flag: false, tags: ['blue'], nested: { k: 'w' } }),
    set('items', 'c', { n: 3, s: 'x', flag: 1, tags: 'red' }),
    set('items', 'd', { n: '2', s: 'z' }),
    set('items', 'e', { s: 'x', n: 2.5 }),
    set('other', 'a', { n: 1, s: 'x' }),
  ]);
  const ids = async (spec) => (await store.query({ collection: 'items', ...spec })).map((doc) => doc.id);

  assert.deepEqual(await ids({}), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(await ids({ where: [['s', '==', 'x']] }), ['a', 'c', 'e']);
  assert.deepEqual(await ids({ where: [['s', '==', 'x'], ['n', '>=', 2]] }), ['e', 'c'], 'sorted by the inequality field');
  assert.deepEqual(await ids({ where: [['n', '==', 2]] }), ['b'], 'the string "2" is not the number 2');
  assert.deepEqual(await ids({ where: [['n', '==', '2']] }), ['d']);
  assert.deepEqual(await ids({ where: [['flag', '==', true]] }), ['a'], 'the number 1 is not true');
  assert.deepEqual(await ids({ where: [['flag', '==', false]] }), ['b']);
  assert.deepEqual(await ids({ where: [['flag', '==', 1]] }), ['c'], 'true is not the number 1');
  assert.deepEqual(await ids({ where: [['flag', '!=', 1]] }), ['b', 'a'], 'sorted by the field: false before true');
  assert.deepEqual(await ids({ where: [['tags', '==', '["blue"]']] }), [], 'a list is not its JSON text');
  assert.deepEqual(await ids({ where: [['nul', '==', null]] }), ['a'], 'a missing field is not null');
  assert.deepEqual(await ids({ where: [['s', '!=', 'x']] }), ['b', 'd']);
  assert.deepEqual(await ids({ where: [['n', '>', 1], ['n', '<', 3]] }), ['b', 'e'], 'numbers only, the string "2" is left out');
  assert.deepEqual(await ids({ where: [['n', '<=', 2]] }), ['a', 'b']);
  assert.deepEqual(await ids({ where: [['s', '>', 'x']] }), ['b', 'd']);
  assert.deepEqual(await ids({ where: [['s', 'in', ['y', 'z']]] }), ['b', 'd']);
  assert.deepEqual(await ids({ where: [['tags', 'array-contains', 'red']] }), ['a'], 'a plain string field is not an array');
  assert.deepEqual(await ids({ where: [['tags', 'array-contains', 'blue']] }), ['a', 'b']);
  assert.deepEqual(await ids({ where: [['nested.k', '==', 'w']] }), ['b']);
  assert.deepEqual(await ids({ where: [['__name__', '==', 'c']] }), ['c']);
  assert.deepEqual(await ids({ where: [['__name__', 'in', ['a', 'e', 'zz']]] }), ['a', 'e']);

  assert.deepEqual(await ids({ orderBy: [['n', 'desc']] }), ['d', 'c', 'e', 'b', 'a'], 'text sorts after numbers');
  assert.deepEqual(await ids({ orderBy: [['nested.k', 'asc']] }), ['a', 'b'], 'documents without the sort field are left out');
  assert.deepEqual(await ids({ orderBy: [['s', 'asc']] }), ['a', 'c', 'e', 'b', 'd'], 'ties broken by id');
  assert.deepEqual(await ids({ orderBy: [['s', 'desc']] }), ['d', 'b', 'e', 'c', 'a'], 'ties broken by id, same direction');
  assert.deepEqual(await ids({ orderBy: [['s', 'asc'], ['n', 'desc']] }), ['c', 'e', 'a', 'b', 'd']);
  assert.deepEqual(await ids({ orderBy: [['__name__', 'desc']], limit: 2 }), ['e', 'd']);
  assert.deepEqual(await ids({ where: [['s', '==', 'x']], limit: 1 }), ['a']);

  assert.deepEqual(await store.query({ collection: 'items', where: [['__name__', '==', 'a']], select: ['n', 'nested.k', 'missing'] }),
    [{ id: 'a', data: { n: 1, nested: { k: 'v' } }, version: 1 }]);
  assert.deepEqual(await store.query({ collection: 'items', where: [['__name__', '==', 'a']], select: [] }), [{ id: 'a', data: {}, version: 1 }]);
  assert.deepEqual(await store.query({ collection: 'nothing-here' }), []);
});

test('query: bad input is refused before any SQL runs', async () => {
  const { store } = fresh();
  const bad = (spec) => rejectsWith(store.query(spec), 'invalid-argument');
  await bad({ collection: "x' OR 1=1 --" });
  await bad({ collection: 'c', where: [["a') OR 1=1 --", '==', 1]] });
  await bad({ collection: 'c', where: [['a', 'LIKE', 'x']] });
  await bad({ collection: 'c', where: [['a', '==', { x: 1 }]] });
  await bad({ collection: 'c', where: [['a', '<', true]] });
  await bad({ collection: 'c', where: [['a', 'in', []]] });
  await bad({ collection: 'c', where: [['a', '==']] });
  await bad({ collection: 'c', orderBy: [['a', 'sideways']] });
  await bad({ collection: 'c', orderBy: [['a b', 'asc']] });
  await bad({ collection: 'c', limit: 0 });
  await bad({ collection: 'c', limit: '5; DROP TABLE docs' });
});

test('the query builder emits exactly the indexed expression', () => {
  const { sql, params } = buildQuery({ collection: 'orders', where: [['customerEmail', '==', 'a@b.c']], limit: 5 });
  assert.equal(sql, "SELECT id, data, version FROM docs INDEXED BY docs_orders_customerEmail WHERE collection = 'orders' AND (json_extract(data, '$.customerEmail') = ? AND json_type(data, '$.customerEmail') = 'text') ORDER BY id ASC LIMIT ?");
  assert.deepEqual(params, ['a@b.c', 5]);
});

test('INDEXED_FIELDS and schema.sql name the same indexes', () => {
  const inSchema = [...readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
    .matchAll(/CREATE INDEX IF NOT EXISTS (\w+)\s+ON docs \(collection, json_extract\(data, '\$\.(\w+)'\)\)\s+WHERE collection = '(\w+)';/g)]
    .map(([, name, field, collection]) => { assert.equal(name, `docs_${collection}_${field}`); return name; });
  const inCode = Object.entries(INDEXED_FIELDS).flatMap(([collection, fields]) => fields.map((field) => `docs_${collection}_${field}`));
  assert.deepEqual(inSchema.sort(), inCode.sort());
  assert.ok(inSchema.length > 0);
});

test('query plans: the hot queries use their index and never sort or scan the collection', async () => {
  const { d1, store } = fresh();
  for (const { name, index, spec } of HOT_QUERIES) {
    const { sql, params } = buildQuery(spec);
    const plan = await queryPlan(d1, sql, params);
    assert.match(plan, new RegExp(`USING (COVERING )?INDEX ${index} \\(collection=\\?`), `${name}: ${plan}`);
    assert.doesNotMatch(plan, /SCAN|TEMP B-TREE/, `${name}: ${plan}`);
    await store.query(spec); // and the statement really runs
  }
  // point reads and whole-collection reads go through the primary key
  assert.match(await queryPlan(d1, 'SELECT data, version FROM docs WHERE collection = ? AND id = ?', ['orders', 'x']), /USING PRIMARY KEY \(collection=\? AND id=\?\)/);
  assert.match(await queryPlan(d1, 'SELECT id, data, version FROM docs WHERE collection = ? AND id IN (?, ?)', ['products', 'a', 'b']), /USING PRIMARY KEY \(collection=\? AND id=\?\)/);
  const whole = buildQuery({ collection: 'products' });
  const wholePlan = await queryPlan(d1, whole.sql, whole.params);
  assert.match(wholePlan, /USING PRIMARY KEY \(collection=\?\)/);
  assert.doesNotMatch(wholePlan, /TEMP B-TREE/);
});

test('indexed queries return the right rows (index used with other filters, sorts and limits)', async () => {
  const { store } = fresh();
  await store.commit([
    set('orders', 'o1', { customerEmail: 'a@x.in', couponCode: 'SAVE', paymentStatus: 'Paid', date: '2026-01-02' }),
    set('orders', 'o2', { customerEmail: 'a@x.in', couponCode: 'SAVE', paymentStatus: 'Unpaid', date: '2026-01-03' }),
    set('orders', 'o3', { customerEmail: 'b@x.in', couponCode: 'SAVE', paymentStatus: 'Paid', date: '2026-01-01' }),
    set('reviews', 'r1', { productId: 'p1', status: 'approved' }),
    set('reviews', 'r2', { productId: 'p1', status: 'pending' }),
    set('reviews', 'r3', { productId: 'p2', status: 'approved' }),
    ...Array.from({ length: 5 }, (_, i) => set('visitor_sessions', `v${i}`, { lastActive: `2026-10-0${i + 1}T00:00:00.000Z` })),
    set('visitor_sessions', 'never-active', { page: '/' }),
  ]);
  const ids = async (spec) => (await store.query(spec)).map((doc) => doc.id);
  assert.deepEqual(await ids({ collection: 'orders', where: [['customerEmail', '==', 'a@x.in']] }), ['o1', 'o2']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['couponCode', '==', 'SAVE'], ['paymentStatus', '==', 'Paid'], ['customerEmail', '==', 'a@x.in']], limit: 3 }), ['o1']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['customerEmail', '==', 'a@x.in']], orderBy: [['date', 'desc']] }), ['o2', 'o1']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['customerEmail', 'in', ['b@x.in', 'zz']]] }), ['o3']);
  assert.deepEqual(await ids({ collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] }), ['r1']);
  assert.deepEqual(await ids({ collection: 'visitor_sessions', orderBy: [['lastActive', 'desc']], limit: 3 }), ['v4', 'v3', 'v2']);
  assert.deepEqual(await ids({ collection: 'visitor_sessions', where: [['lastActive', '>', '2026-10-03T00:00:00.000Z']] }), ['v3', 'v4']);
});
