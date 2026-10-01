// The document store against REAL local D1 (workerd's SQLite through wrangler's getPlatformProxy, local
// mode, nothing persisted, nothing sent to Cloudflare).  Run: node --test worker/test/real-d1.test.mjs
// It proves what the node:sqlite wrapper can only imitate: that a failed guard rolls a D1 batch back,
// that concurrent increments both land, and that D1's planner uses the indexes for the hot queries.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, buildQuery, StoreError } from '../src/docstore.js';
import { setEnv } from '../src/env.js';
import { getFirestore, FieldValue } from '../src/shims/firebase-admin-firestore.js';
import { HOT_QUERIES, queryPlan } from './d1-node.mjs';
import { openLocalD1 } from './harness/local-d1.mjs';

let dispose;
let d1;
let store;

before(async () => {
  ({ d1, dispose } = await openLocalD1());
  store = createStore(d1);
  setEnv({ DB: d1 });
});

after(async () => {
  await dispose?.();
});

beforeEach(async () => {
  await d1.batch([d1.prepare('DELETE FROM docs'), d1.prepare('DELETE FROM collection_versions')]);
});

const dump = async () => ({
  docs: (await d1.prepare('SELECT collection, id, data, version FROM docs ORDER BY collection, id').all()).results,
  versions: (await d1.prepare('SELECT collection, version FROM collection_versions ORDER BY collection').all()).results,
  guard: (await d1.prepare('SELECT COUNT(*) AS n FROM tx_guard').first('n')),
});
const aborted = (error) => error instanceof StoreError && error.code === 'aborted';

test('the mechanism: a guard row that violates the CHECK rolls the whole D1 batch back', async () => {
  const insert = (id) => d1.prepare("INSERT INTO docs (collection, id, data, version, created_at, updated_at) VALUES ('probe', ?, '{}', 1, 'now', 'now')").bind(id);
  await assert.rejects(d1.batch([
    insert('written-before-the-guard'),
    d1.prepare('INSERT INTO tx_guard (ok) SELECT 0 WHERE NOT (EXISTS (SELECT 1 FROM docs WHERE collection = ? AND id = ? AND version = ?))').bind('probe', 'missing', 3),
    insert('written-after-the-guard'),
  ]), /CHECK constraint failed/);
  assert.deepEqual(await dump(), { docs: [], versions: [], guard: 0 });

  // the same batch goes through when the guarded condition holds, and the guard table stays empty
  await d1.batch([
    insert('a'),
    d1.prepare('INSERT INTO tx_guard (ok) SELECT 0 WHERE NOT (EXISTS (SELECT 1 FROM docs WHERE collection = ? AND id = ? AND version = ?))').bind('probe', 'a', 1),
    insert('b'),
  ]);
  const state = await dump();
  assert.deepEqual([state.docs.map((doc) => doc.id), state.guard], [['a', 'b'], 0]);
});

test('a failed precondition leaves the database untouched', async () => {
  await store.commit([
    { type: 'set', collection: 'orders', id: 'SAG-1', data: { paymentStatus: 'Unpaid', status: 'Pending' } },
    { type: 'set', collection: 'products', id: 'p1', data: { stockQuantity: 5 } },
    { type: 'set', collection: 'coupons', id: 'c1', data: { usageCount: 0 } },
  ]);
  const order = await store.getDoc('orders', 'SAG-1');
  const product = await store.getDoc('products', 'p1');
  await store.commit([{ type: 'update', collection: 'products', id: 'p1', data: { stockQuantity: 4 } }]); // someone else
  const before = await dump();

  await assert.rejects(store.commit([
    { type: 'update', collection: 'orders', id: 'SAG-1', data: { paymentStatus: 'Paid', status: 'Processing' } },
    { type: 'update', collection: 'products', id: 'p1', data: { stockQuantity: 3 } },
    { type: 'update', collection: 'coupons', id: 'c1', data: { usageCount: { __op: 'increment', n: 1 } } },
    { type: 'set', collection: 'daily_analytics', id: 'd', data: { purchases: { __op: 'increment', n: 1 } }, merge: true },
  ], { preconditions: [
    { collection: 'orders', id: 'SAG-1', version: order.version },
    { collection: 'products', id: 'p1', version: product.version },
  ] }), aborted);
  assert.deepEqual(await dump(), before);

  await assert.rejects(store.commit([
    { type: 'set', collection: 'orders', id: 'SAG-2', data: {} },
    { type: 'update', collection: 'orders', id: 'nope', data: { x: 1 } },
  ]), (error) => error.code === 'not-found');
  await assert.rejects(store.commit([
    { type: 'set', collection: 'orders', id: 'SAG-2', data: {} },
    { type: 'create', collection: 'orders', id: 'SAG-1', data: {} },
  ]), (error) => error.code === 'already-exists');
  assert.deepEqual(await dump(), before);
});

test('a change that lands between the read and the batch is stopped by the guard inside D1', async () => {
  await store.commit([{ type: 'set', collection: 'counters', id: 'c', data: { n: 0 } }, { type: 'set', collection: 'orders', id: 'o', data: { status: 'Pending' } }]);
  const racing = (onFirstBatch) => {
    let first = true;
    return createStore({
      prepare: (sql) => d1.prepare(sql),
      batch: async (statements) => {
        if (first) { first = false; await onFirstBatch(); }
        return d1.batch(statements);
      },
    });
  };

  // our own read (an increment): rolled back, read again, applied on top of the other write
  await racing(() => store.commit([{ type: 'update', collection: 'counters', id: 'c', data: { n: { __op: 'increment', n: 100 } } }]))
    .commit([{ type: 'update', collection: 'counters', id: 'c', data: { n: { __op: 'increment', n: 1 } } }, { type: 'set', collection: 'side', id: 's', data: { once: true } }]);
  assert.deepEqual(await store.getDoc('counters', 'c'), { id: 'c', data: { n: 101 }, version: 3 });
  assert.equal(await store.collectionVersion('side'), 1, 'the rolled-back attempt left nothing behind');

  // the caller's read (a transaction): aborted, nothing written
  const order = await store.getDoc('orders', 'o');
  const before = (await dump()).docs.filter((doc) => doc.collection !== 'orders');
  await assert.rejects(
    racing(() => store.commit([{ type: 'update', collection: 'orders', id: 'o', data: { status: 'Cancelled' } }])).commit([
      { type: 'update', collection: 'counters', id: 'c', data: { n: { __op: 'increment', n: 1 } } },
      { type: 'update', collection: 'orders', id: 'o', data: { status: 'Paid' } },
    ], { preconditions: [{ collection: 'orders', id: 'o', version: order.version }] }),
    aborted,
  );
  const state = await dump();
  assert.equal((await store.getDoc('orders', 'o')).data.status, 'Cancelled');
  assert.deepEqual(state.docs.filter((doc) => doc.collection !== 'orders'), before);
  assert.equal(state.guard, 0);
});

test('two concurrent increments of the same counter both land (and ten do too)', async () => {
  const bump = () => store.commit([{ type: 'set', collection: 'daily_analytics', id: '2026-10-02', data: { date: '2026-10-02', visits: { __op: 'increment', n: 1 } }, merge: true }]);
  await Promise.all([bump(), bump()]);
  assert.deepEqual(await store.getDoc('daily_analytics', '2026-10-02'), { id: '2026-10-02', data: { date: '2026-10-02', visits: 2 }, version: 2 });
  await Promise.all(Array.from({ length: 10 }, bump));
  assert.equal((await store.getDoc('daily_analytics', '2026-10-02')).data.visits, 12);
  assert.equal(await store.collectionVersion('daily_analytics'), 12);
});

test('through the Firestore shim: concurrent transactions on one order mark it paid exactly once', async () => {
  const db = getFirestore();
  await db.collection('orders').doc('SAG-1').set({ paymentStatus: 'Unpaid', items: [{ product: { id: 'p1' }, quantity: 2 }] });
  await db.collection('products').doc('p1').set({ stockQuantity: 5 });
  const finalize = () => db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc('SAG-1');
    const order = (await tx.get(orderRef)).data();
    if (order.paymentStatus === 'Paid') return { changed: false };
    const [product] = await tx.getAll(db.collection('products').doc('p1'));
    tx.update(product.ref, { stockQuantity: product.data().stockQuantity - 2 });
    tx.update(orderRef, { paymentStatus: 'Paid' });
    tx.set(db.collection('daily_analytics').doc('d'), { purchases: FieldValue.increment(1) }, { merge: true });
    return { changed: true };
  });
  const results = await Promise.all([finalize(), finalize(), finalize()]);
  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal((await db.collection('products').doc('p1').get()).data().stockQuantity, 3);
  assert.equal((await db.collection('daily_analytics').doc('d').get()).data().purchases, 1);

  const counter = db.collection('rate_limits').doc('k');
  await counter.set({ count: 0 });
  const bump = () => db.runTransaction(async (tx) => {
    const snap = await tx.get(counter);
    tx.update(counter, { count: snap.data().count + 1 });
  });
  await Promise.all([bump(), bump()]);
  assert.equal((await counter.get()).data().count, 2);
  await assert.rejects(counter.create({}), (error) => error.code === 6);
  await assert.rejects(db.collection('rate_limits').doc('none').update({ a: 1 }), (error) => error.code === 5);
});

test('query plans on D1: the hot queries use their index, no sort, no scan', async () => {
  for (const { name, index, spec } of HOT_QUERIES) {
    const { sql, params } = buildQuery(spec);
    const plan = await queryPlan(d1, sql, params);
    assert.match(plan, new RegExp(`USING (COVERING )?INDEX ${index} \\(collection=\\?`), `${name}: ${plan}`);
    assert.doesNotMatch(plan, /SCAN|TEMP B-TREE/, `${name}: ${plan}`);
  }
  assert.match(await queryPlan(d1, 'SELECT data, version FROM docs WHERE collection = ? AND id = ?', ['orders', 'x']), /USING PRIMARY KEY \(collection=\? AND id=\?\)/);
  assert.match(await queryPlan(d1, 'SELECT id, data, version FROM docs WHERE collection = ? AND id IN (?, ?)', ['products', 'a', 'b']), /USING PRIMARY KEY \(collection=\? AND id=\?\)/);
});

test('queries on D1 return the right rows and count only the rows they need', async () => {
  await store.commit([
    ...Array.from({ length: 40 }, (_, i) => ({ type: 'set', collection: 'orders', id: `o${String(i).padStart(2, '0')}`, data: { customerEmail: i % 10 === 0 ? 'a@x.in' : `c${i}@x.in`, razorpayOrderId: `order_${i}`, attemptKey: `key-${i}`, paid: i % 2 === 0 } })),
    { type: 'set', collection: 'reviews', id: 'r1', data: { productId: 'p1', status: 'approved' } },
    { type: 'set', collection: 'reviews', id: 'r2', data: { productId: 'p1', status: 'pending' } },
    { type: 'set', collection: 'reviews', id: 'r3', data: { productId: 'p2', status: 'approved' } },
    ...Array.from({ length: 30 }, (_, i) => ({ type: 'set', collection: 'visitor_sessions', id: `v${String(i).padStart(2, '0')}`, data: { lastActive: `2026-10-02T00:00:${String(i).padStart(2, '0')}.000Z` } })),
  ]);
  const ids = async (spec) => (await store.query(spec)).map((doc) => doc.id);
  assert.deepEqual(await ids({ collection: 'orders', where: [['customerEmail', '==', 'a@x.in']] }), ['o00', 'o10', 'o20', 'o30']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['customerEmail', '==', 'a@x.in'], ['paid', '==', true]], limit: 2 }), ['o00', 'o10']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['razorpayOrderId', '==', 'order_17']], limit: 1 }), ['o17']);
  assert.deepEqual(await ids({ collection: 'orders', where: [['attemptKey', '==', 'key-3']], limit: 1 }), ['o03']);
  assert.deepEqual(await ids({ collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] }), ['r1']);
  assert.deepEqual(await ids({ collection: 'visitor_sessions', orderBy: [['lastActive', 'desc']], limit: 3 }), ['v29', 'v28', 'v27']);

  // rows D1 bills for: a handful through the index, not the 40 orders or 30 sessions of the collection
  const rowsRead = async (spec) => {
    const { sql, params } = buildQuery(spec);
    return (await d1.prepare(sql).bind(...params).all()).meta.rows_read;
  };
  assert.ok(await rowsRead({ collection: 'orders', where: [['customerEmail', '==', 'a@x.in']] }) <= 8);
  assert.ok(await rowsRead({ collection: 'orders', where: [['razorpayOrderId', '==', 'order_17']], limit: 1 }) <= 2);
  assert.ok(await rowsRead({ collection: 'visitor_sessions', orderBy: [['lastActive', 'desc']], limit: 3 }) <= 6);
  const many = await store.getMany(Array.from({ length: 40 }, (_, i) => ({ collection: 'orders', id: `o${String(i).padStart(2, '0')}` })));
  assert.equal(many.filter(Boolean).length, 40);
});
