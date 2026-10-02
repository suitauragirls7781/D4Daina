// firebase-admin/firestore shim tests over node:sqlite.  Run: node --test worker/test/firestore-shim.test.mjs
// Every call shape below is one the handlers in api/** use.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setEnv, getEnv, getDB } from '../src/env.js';
import { getFirestore, FieldValue, Timestamp } from '../src/shims/firebase-admin-firestore.js';
import { cert, getApps, initializeApp } from '../src/shims/firebase-admin-app.js';
import { createD1 } from './d1-node.mjs';

let d1;
let db;
beforeEach(() => {
  d1 = createD1();
  setEnv({ DB: d1 });
  db = getFirestore();
});

const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;
const ABORTED = 10;
const withCode = (code) => (error) => error instanceof Error && error.code === code;
const collectionVersion = (name) => d1.prepare('SELECT version FROM collection_versions WHERE collection = ?').bind(name).first('version');

test('env: getDB explains what is missing', () => {
  assert.equal(getEnv().DB, d1);
  assert.equal(getDB(), d1);
  setEnv({});
  assert.throws(() => getDB(), /D1 binding "DB" is missing/);
  setEnv(null);
  assert.throws(() => getEnv(), /setEnv/);
});

test('firebase-admin/app shim: api/_lib/firebaseAdmin.js initialises once', () => {
  assert.deepEqual(getApps(), []);
  const app = initializeApp({ credential: cert({}) });
  assert.equal(getApps().length, 1);
  assert.equal(getApps()[0], app);
  assert.equal(getFirestore(app, '(default)'), db);
});

test('references: id, path, auto ids', () => {
  const ref = db.collection('orders').doc('SAG-261002-ABCDE');
  assert.equal(ref.id, 'SAG-261002-ABCDE');
  assert.equal(ref.path, 'orders/SAG-261002-ABCDE');
  assert.equal(db.collection('orders').id, 'orders');
  assert.equal(db.doc('orders/x').path, 'orders/x');
  const auto = new Set(Array.from({ length: 200 }, () => db.collection('reviews').doc().id));
  assert.equal(auto.size, 200);
  for (const id of auto) assert.match(id, /^[A-Za-z0-9]{20}$/);
  assert.throws(() => db.collection('orders').doc(''), withCode(3));
  assert.throws(() => db.collection('orders').doc('a/b'), withCode(3));
  assert.throws(() => db.doc('orders/a/items/b'), withCode(3));
});

test('get: a missing document has exists false and data() undefined', async () => {
  const snap = await db.collection('daily_analytics').doc('2026-10-02').get();
  assert.equal(snap.exists, false);
  assert.equal(snap.id, '2026-10-02');
  assert.equal(snap.data(), undefined);
  assert.equal(snap.get('visits'), undefined);
  assert.deepEqual(snap.data() || {}, {});
});

test('set, merge, update, delete and what the snapshot gives back', async () => {
  const ref = db.collection('customers').doc('a@example.com');
  await ref.set({ email: 'a@example.com', name: '', address: { city: 'Jaipur' }, createdAt: '2026-10-02T00:00:00.000Z' });
  await ref.set({ name: 'Asha', address: { pin: '302001' }, lastLoginAt: 'now' }, { merge: true });
  let snap = await ref.get();
  assert.equal(snap.exists, true);
  assert.equal(snap.ref.path, ref.path);
  assert.deepEqual(snap.data(), { email: 'a@example.com', name: 'Asha', address: { city: 'Jaipur', pin: '302001' }, createdAt: '2026-10-02T00:00:00.000Z', lastLoginAt: 'now' });
  assert.equal(snap.get('address.city'), 'Jaipur');
  assert.equal(snap.get('nope.deeper'), undefined);

  // data() is a copy: changing it must not change the snapshot
  const first = snap.data();
  first.address.city = 'changed';
  assert.equal(snap.data().address.city, 'Jaipur');

  await ref.update({ name: 'Asha K', 'address.city': 'Delhi' });
  await ref.set({ only: true });
  snap = await ref.get();
  assert.deepEqual(snap.data(), { only: true });
  await ref.delete();
  assert.equal((await ref.get()).exists, false);
  await ref.delete(); // deleting again is not an error
});

test('error codes the handlers check: 5 on update of a missing document, 6 on create of an existing one', async () => {
  const session = db.collection('visitor_sessions').doc('vis_abcd');
  // api/track.js: update, and create the session when the update says NOT_FOUND
  await assert.rejects(session.update({ lastActive: 'now', visitCount: FieldValue.increment(1) }), withCode(NOT_FOUND));
  let created = false;
  await session.update({ lastActive: 'now' }).catch((error) => {
    if (error?.code !== 5) throw error;
    created = true;
    return session.set({ id: 'vis_abcd', visitCount: 1, actions: [] });
  });
  assert.equal(created, true);
  await session.update({ visitCount: FieldValue.increment(1), actions: FieldValue.arrayUnion({ type: 'visit', path: '/' }) });
  assert.deepEqual((await session.get()).data(), { id: 'vis_abcd', visitCount: 2, actions: [{ type: 'visit', path: '/' }] });

  // api/orders.js: create, and pick another order number on ALREADY_EXISTS
  const order = db.collection('orders').doc('SAG-1');
  await order.create({ orderNumber: 'SAG-1' });
  await assert.rejects(order.create({ orderNumber: 'SAG-1', other: true }), withCode(ALREADY_EXISTS));
  assert.deepEqual((await order.get()).data(), { orderNumber: 'SAG-1' });
  await assert.rejects(order.create({ orderNumber: 'SAG-1' }), /ALREADY_EXISTS/);
});

test('FieldValue and Timestamp', async () => {
  const ref = db.collection('reviews').doc('rv_1');
  await ref.set({ helpfulCount: 1, imageUrl: 'u', photoId: 'p', tags: ['a'] });
  await ref.set({ helpfulCount: FieldValue.increment(2), imageUrl: FieldValue.delete(), tags: FieldValue.arrayRemove('a'), seen: FieldValue.serverTimestamp() }, { merge: true });
  await ref.update({ photoId: FieldValue.delete(), tags: FieldValue.arrayUnion('b', 'c', 'b') });
  const data = (await ref.get()).data();
  assert.match(data.seen, /^\d{4}-\d\d-\d\dT/);
  delete data.seen;
  assert.deepEqual(data, { helpfulCount: 3, tags: ['b', 'c'] });

  // Dates and Timestamps are stored as ISO strings
  const when = new Date('2026-10-02T12:34:56.789Z');
  await db.collection('rate_limits').doc('k').set({ windowStart: when.getTime(), count: 1, expiresAt: when, stamp: Timestamp.fromDate(when) });
  assert.deepEqual((await db.collection('rate_limits').doc('k').get()).data(), {
    windowStart: when.getTime(), count: 1, expiresAt: '2026-10-02T12:34:56.789Z', stamp: '2026-10-02T12:34:56.789Z',
  });
  assert.equal(Timestamp.fromDate(when).toDate().getTime(), when.getTime());
  assert.ok(Math.abs(Timestamp.now().toDate().getTime() - Date.now()) < 5000);
});

test('collections and queries: get, where, orderBy, limit, select, add, snapshot fields', async () => {
  const orders = db.collection('orders');
  await orders.doc('o1').set({ customerEmail: 'a@x.in', couponCode: 'SAVE', paymentStatus: 'Paid', attemptKey: 'k1', date: '2026-01-01' });
  await orders.doc('o2').set({ customerEmail: 'a@x.in', couponCode: 'SAVE', paymentStatus: 'Unpaid', attemptKey: 'k2', date: '2026-01-03' });
  await orders.doc('o3').set({ customerEmail: 'b@x.in', couponCode: '', paymentStatus: 'Paid', attemptKey: 'k3', date: '2026-01-02' });

  const all = await orders.get();
  assert.equal(all.size, 3);
  assert.equal(all.empty, false);
  assert.deepEqual(all.docs.map((doc) => doc.id), ['o1', 'o2', 'o3']);
  assert.equal(all.docs[0].exists, true);
  assert.deepEqual(all.docs.map((d) => ({ id: d.id, ...d.data() }))[2].customerEmail, 'b@x.in');
  const seen = [];
  all.forEach((doc) => seen.push(doc.id));
  assert.deepEqual(seen, ['o1', 'o2', 'o3']);
  assert.equal(all.docs.find((doc) => doc.data().attemptKey === 'k2').ref.path, 'orders/o2');

  const earlier = await orders.where('attemptKey', '==', 'k2').limit(1).get();
  assert.equal(earlier.empty, false);
  assert.equal(earlier.docs[0].data().paymentStatus, 'Unpaid');
  assert.equal((await orders.where('attemptKey', '==', 'none').limit(1).get()).empty, true);

  // api/_lib/orders.js couponUsesByCustomer: a base query reused for two chains
  const base = () => orders.where('couponCode', '==', 'SAVE').where('paymentStatus', '==', 'Paid');
  assert.deepEqual((await base().where('customerEmail', '==', 'a@x.in').limit(5).get()).docs.map((doc) => doc.id), ['o1']);
  const chained = orders.where('couponCode', '==', 'SAVE');
  chained.where('paymentStatus', '==', 'Paid'); // must not change `chained`
  assert.equal((await chained.get()).size, 2);

  assert.deepEqual((await orders.orderBy('date', 'desc').limit(2).get()).docs.map((doc) => doc.id), ['o2', 'o3']);
  assert.deepEqual((await orders.orderBy('date').get()).docs.map((doc) => doc.id), ['o1', 'o3', 'o2']);

  // api/sitemap.js
  const picked = await db.collection('orders').select('date', 'missing').get();
  assert.deepEqual(picked.docs.map((d) => ({ ...d.data(), id: d.id })), [{ date: '2026-01-01', id: 'o1' }, { date: '2026-01-03', id: 'o2' }, { date: '2026-01-02', id: 'o3' }]);

  // a matching document can be updated through its ref (api/alerts.js)
  const waiting = await orders.where('customerEmail', '==', 'b@x.in').limit(1000).get();
  for (const doc of waiting.docs) await doc.ref.update({ status: 'sent' });
  assert.equal((await orders.doc('o3').get()).data().status, 'sent');

  const added = await db.collection('leads').add({ name: 'N', createdAt: 'now' });
  assert.match(added.id, /^[A-Za-z0-9]{20}$/);
  assert.deepEqual((await added.get()).data(), { name: 'N', createdAt: 'now' });

  const none = await db.collection('profiles').limit(5000).get();
  assert.deepEqual([none.size, none.empty, none.docs], [0, true, []]);
});

test('getAll keeps the order of the refs and includes missing documents', async () => {
  await db.collection('products').doc('p1').set({ name: 'One', hidden: false });
  await db.collection('products').doc('p3').set({ name: 'Three', hidden: true });
  const ids = ['p3', 'p2', 'p1'];
  const snaps = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));
  assert.deepEqual(snaps.map((snap) => [snap.id, snap.exists, snap.data()?.name]), [['p3', true, 'Three'], ['p2', false, undefined], ['p1', true, 'One']]);
  assert.deepEqual(snaps.filter((snap) => snap.exists && snap.data().hidden !== true).map((snap) => snap.id), ['p1']);
  assert.equal(snaps[0].ref.path, 'products/p3');
});

test('batch: all writes land together, or none', async () => {
  const settings = db.collection('storefront_settings');
  const batch = db.batch();
  batch.set(settings.doc('storeSettings'), { value_json: '{"shippingCharge":99}', updated_at: 'now' });
  batch.set(settings.doc('comboOffer'), { value_json: '{}', updated_at: 'now' });
  await batch.commit();
  assert.equal((await settings.get()).size, 2);
  assert.equal(await collectionVersion('storefront_settings'), 1);

  const failing = db.batch();
  failing.set(settings.doc('heroConfig'), { value_json: '{}' }).delete(settings.doc('comboOffer')).create(settings.doc('banners'), {}).update(settings.doc('does-not-exist'), { x: 1 });
  await assert.rejects(failing.commit(), withCode(NOT_FOUND));
  assert.deepEqual((await settings.get()).docs.map((doc) => doc.id), ['comboOffer', 'storeSettings']);
});

test('transaction: returns the function result; reads see committed data; writes are held until the end', async () => {
  const ref = db.collection('rate_limits').doc('order:1.2.3.4');
  // the rate limiter of api/orders.js
  const rateLimit = (limit) => db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data) {
      tx.set(ref, { windowStart: 1, count: 1, expiresAt: new Date(60000) });
      return true;
    }
    if (data.count >= limit) return false;
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
  assert.deepEqual([await rateLimit(3), await rateLimit(3), await rateLimit(3), await rateLimit(3)], [true, true, true, false]);
  assert.equal((await ref.get()).data().count, 3);

  const result = await db.runTransaction(async (tx) => {
    tx.set(ref, { count: 100 });
    assert.equal((await ref.get()).data().count, 3, 'not written before the commit');
    return { order: 'x', changed: true };
  });
  assert.deepEqual(result, { order: 'x', changed: true });
  assert.equal((await ref.get()).data().count, 100);
});

test('transaction: one that only reads writes nothing', async () => {
  await db.collection('orders').doc('o1').set({ paymentStatus: 'Paid' });
  const rows = async () => (await d1.prepare('SELECT * FROM docs').all()).results.concat((await d1.prepare('SELECT * FROM collection_versions').all()).results);
  const before = await rows();
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('orders').doc('o1'));
    await tx.get(db.collection('orders').doc('missing'));
    await tx.get(db.collection('orders').where('paymentStatus', '==', 'Paid'));
    return snap.data().paymentStatus === 'Paid' ? { changed: false } : null;
  });
  assert.deepEqual(out, { changed: false });
  assert.deepEqual(await rows(), before);
});

test('transaction: a read after a write throws, as in Firestore', async () => {
  const ref = db.collection('c').doc('a');
  await assert.rejects(db.runTransaction(async (tx) => {
    tx.set(ref, { x: 1 });
    await tx.get(ref);
  }), /all reads to be executed before all writes/);
  await assert.rejects(db.runTransaction(async (tx) => {
    tx.delete(ref);
    await tx.getAll(ref);
  }), /all reads to be executed before all writes/);
  assert.equal((await ref.get()).exists, false);
});

test('transaction: an error from the function is passed on at once and nothing is written', async () => {
  const ref = db.collection('orders').doc('o1');
  let runs = 0;
  class UserError extends Error {}
  await assert.rejects(db.runTransaction(async (tx) => {
    runs += 1;
    const snap = await tx.get(ref);
    tx.set(db.collection('products').doc('p'), { stockQuantity: 0 });
    if (!snap.exists) throw new UserError('Order not found.');
  }), UserError);
  assert.equal(runs, 1);
  assert.equal((await db.collection('products').doc('p').get()).exists, false);

  // update of a document that was read as missing: NOT_FOUND, not retried
  runs = 0;
  await assert.rejects(db.runTransaction(async (tx) => {
    runs += 1;
    await tx.get(ref);
    tx.update(ref, { x: 1 });
  }), withCode(NOT_FOUND));
  assert.equal(runs, 1);
});

test('transaction: re-run when a document it read was changed, with the fresh data', async () => {
  const ref = db.collection('products').doc('p1');
  await ref.set({ stockQuantity: 5 });
  let runs = 0;
  const left = await db.runTransaction(async (tx) => {
    runs += 1;
    const stock = (await tx.get(ref)).data().stockQuantity;
    if (runs === 1) await ref.update({ stockQuantity: 2 }); // another buyer gets in first
    tx.update(ref, { stockQuantity: stock - 1 });
    return stock - 1;
  });
  assert.equal(runs, 2);
  assert.equal(left, 1);
  assert.equal((await ref.get()).data().stockQuantity, 1);
});

test('transaction: a document read as missing must still be missing at commit', async () => {
  const dedup = db.collection('analytics_dedup').doc('2026-10-02_visit_abc');
  const daily = db.collection('daily_analytics').doc('2026-10-02');
  let runs = 0;
  const counted = await db.runTransaction(async (tx) => {
    runs += 1;
    const [snap] = await tx.getAll(dedup);
    if (snap.exists) return false;
    if (runs === 1) await dedup.set({ day: '2026-10-02', by: 'the other request' });
    tx.set(dedup, { day: '2026-10-02', by: 'me' });
    tx.set(daily, { date: '2026-10-02', visits: FieldValue.increment(1) }, { merge: true });
    return true;
  });
  assert.equal(counted, false, 'the second run sees the other request\'s marker');
  assert.equal(runs, 2);
  assert.equal((await dedup.get()).data().by, 'the other request');
  assert.equal((await daily.get()).exists, false, 'the visit is not counted twice');
});

test('transaction: a query read aborts when a document is inserted into that collection', async () => {
  const reviews = db.collection('reviews');
  await reviews.doc('r1').set({ productId: 'p1', status: 'approved', rating: 4 });
  let runs = 0;
  const average = await db.runTransaction(async (tx) => {
    runs += 1;
    const snapshot = await tx.get(reviews.where('productId', '==', 'p1').where('status', '==', 'approved'));
    if (runs === 1) await reviews.doc('r2').set({ productId: 'p1', status: 'approved', rating: 2 });
    const rating = snapshot.docs.reduce((sum, doc) => sum + doc.data().rating, 0) / snapshot.size;
    tx.set(db.collection('products').doc('p1'), { rating, reviewCount: snapshot.size }, { merge: true });
    return rating;
  });
  assert.equal(runs, 2);
  assert.equal(average, 3);
  assert.deepEqual((await db.collection('products').doc('p1').get()).data(), { rating: 3, reviewCount: 2 });
});

test('transaction: gives up with ABORTED after its last attempt and leaves the data alone', async () => {
  const ref = db.collection('products').doc('p1');
  await ref.set({ stockQuantity: 100, touched: 0 });
  let runs = 0;
  await assert.rejects(db.runTransaction(async (tx) => {
    runs += 1;
    const data = (await tx.get(ref)).data();
    await ref.update({ touched: FieldValue.increment(1) }); // always beaten
    tx.update(ref, { stockQuantity: data.stockQuantity - 1 });
    tx.set(db.collection('daily_analytics').doc('d'), { purchases: FieldValue.increment(1) }, { merge: true });
  }, { maxAttempts: 4 }), withCode(ABORTED)); // the default is higher; four keep the waits between attempts short
  assert.equal(runs, 4);
  assert.deepEqual((await ref.get()).data(), { stockQuantity: 100, touched: 4 });
  assert.equal((await db.collection('daily_analytics').doc('d').get()).exists, false);
});

// A database whose next batch() calls fail the way D1 does. `afterCommit` loses the answer of a batch
// that did go through (the connection dropped on the way back).
const failingD1 = (failures, { afterCommit = false } = {}) => {
  const state = { batches: 0 };
  setEnv({
    DB: {
      prepare: (sql) => d1.prepare(sql),
      batch: async (statements) => {
        state.batches += 1;
        const message = failures.shift();
        if (!message) return d1.batch(statements);
        if (afterCommit) await d1.batch(statements);
        throw new Error(message);
      },
    },
  });
  return state;
};
const UNAVAILABLE = 14;
const RESOURCE_EXHAUSTED = 8;
const markPaid = (ref) => db.runTransaction(async (tx) => {
  const order = (await tx.get(ref)).data();
  if (order.paymentStatus === 'Paid') return { changed: false };
  tx.update(ref, { paymentStatus: 'Paid' });
  tx.set(db.collection('daily_analytics').doc('d'), { date: 'd', purchases: FieldValue.increment(1) }, { merge: true });
  return { changed: true };
});

test('D1 failures: a dropped call re-runs the transaction; one that did commit is not applied twice', async () => {
  const ref = db.collection('orders').doc('SAG-1');
  await ref.set({ paymentStatus: 'Unpaid' });
  let state = failingD1(['D1_ERROR: Network connection lost.', 'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.']);
  assert.deepEqual(await markPaid(ref), { changed: true });
  assert.equal(state.batches, 3);
  assert.equal((await ref.get()).data().paymentStatus, 'Paid');
  assert.deepEqual((await db.collection('daily_analytics').doc('d').get()).data(), { date: 'd', purchases: 1 });

  // the batch went through but its answer was lost: the re-run finds the order Paid and writes nothing more
  await ref.set({ paymentStatus: 'Unpaid' });
  state = failingD1(['Network connection lost.'], { afterCommit: true });
  assert.deepEqual(await markPaid(ref), { changed: false });
  assert.equal(state.batches, 1);
  assert.equal((await ref.get()).data().paymentStatus, 'Paid');
  assert.equal((await db.collection('daily_analytics').doc('d').get()).data().purchases, 2);
});

test('D1 failures: the codes the handlers act on, and no blind retry outside a transaction', async () => {
  const ref = db.collection('orders').doc('SAG-1');
  await ref.set({ paymentStatus: 'Unpaid', n: 0 });

  // refused work is not retried: the handler answers "busy" (orders) or pauses counting (tracking)
  for (const message of ['D1_ERROR: D1 DB is overloaded. Requests queued for too long.', 'D1_ERROR: Too many API requests by single worker invocation.', 'Too many subrequests.']) {
    const state = failingD1([message]);
    await assert.rejects(markPaid(ref), (error) => error.code === RESOURCE_EXHAUSTED && /RESOURCE_EXHAUSTED/.test(error.message));
    assert.equal(state.batches, 1);
  }
  // a reset is "unavailable" even when its text mentions a limit
  failingD1(["D1_ERROR: D1 DB's isolate exceeded its memory limit and was reset."]);
  await assert.rejects(ref.update({ n: 1 }), withCode(UNAVAILABLE));

  // a single write is passed on at once: repeating an increment that did land would count twice
  const state = failingD1(['D1_ERROR: Network connection lost.'], { afterCommit: true });
  await assert.rejects(ref.update({ n: FieldValue.increment(1) }), withCode(UNAVAILABLE));
  assert.equal(state.batches, 1);
  assert.equal((await ref.get()).data().n, 1);

  // a transaction that keeps losing the database gives up with the same code
  failingD1(Array(5).fill('D1_ERROR: Network connection lost.'));
  await assert.rejects(db.runTransaction(async (tx) => { tx.update(ref, { n: 9 }); }, { maxAttempts: 3 }), withCode(UNAVAILABLE));

  // anything else keeps its own shape: a bug must not look like a busy database
  failingD1(['D1_ERROR: no such table: docs']);
  await assert.rejects(ref.update({ n: 2 }), (error) => error.code === undefined && /no such table/.test(error.message));
  assert.equal((await ref.get()).data().paymentStatus, 'Unpaid');
});

test('transaction: the "mark paid once" flow of api/_lib/orders.js, run twice at the same time', async () => {
  await db.collection('orders').doc('SAG-1').set({ paymentStatus: 'Unpaid', status: 'Pending', couponId: 'c1', items: [{ product: { id: 'p1' }, quantity: 2 }, { product: { id: 'p2' }, quantity: 1 }], timeline: [] });
  await db.collection('products').doc('p1').set({ stockQuantity: 5, inStock: true });
  await db.collection('products').doc('p2').set({ stockQuantity: 1, inStock: true });
  await db.collection('coupons').doc('c1').set({ code: 'SAVE', usageCount: 7 });

  const finalize = (source) => db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc('SAG-1');
    const orderSnap = await tx.get(orderRef);
    const order = orderSnap.data();
    if (order.paymentStatus === 'Paid') return { changed: false };
    const productSnaps = await tx.getAll(...order.items.map((item) => db.collection('products').doc(item.product.id)));
    const couponRef = db.collection('coupons').doc(order.couponId);
    const couponSnap = await tx.get(couponRef);
    productSnaps.forEach((snap, index) => {
      const next = Math.max(0, snap.data().stockQuantity - order.items[index].quantity);
      tx.update(snap.ref, { stockQuantity: next, inStock: next > 0 });
    });
    if (couponSnap?.exists) tx.update(couponRef, { usageCount: FieldValue.increment(1) });
    tx.update(orderRef, { paymentStatus: 'Paid', status: 'Processing', paidVia: source, stockDeducted: true, timeline: [...order.timeline, { status: 'Processing' }] });
    tx.set(db.collection('daily_analytics').doc('2026-10-02'), { date: '2026-10-02', purchases: FieldValue.increment(1) }, { merge: true });
    return { changed: true };
  });

  // browser callback, webhook and the result page all confirm the same payment
  const results = await Promise.all([finalize('checkout'), finalize('webhook'), finalize('reconcile')]);
  assert.equal(results.filter((result) => result.changed).length, 1, 'exactly one of them marks the order paid');
  assert.deepEqual((await db.collection('products').doc('p1').get()).data(), { stockQuantity: 3, inStock: true });
  assert.deepEqual((await db.collection('products').doc('p2').get()).data(), { stockQuantity: 0, inStock: false });
  assert.equal((await db.collection('coupons').doc('c1').get()).data().usageCount, 8);
  assert.equal((await db.collection('daily_analytics').doc('2026-10-02').get()).data().purchases, 1);
  const order = (await db.collection('orders').doc('SAG-1').get()).data();
  assert.deepEqual([order.paymentStatus, order.status, order.timeline.length], ['Paid', 'Processing', 1]);
});

test('transaction: concurrent counters all land (read-modify-write and increment)', async () => {
  const ref = db.collection('rate_limits').doc('k');
  await ref.set({ count: 0 });
  const bump = () => db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.update(ref, { count: snap.data().count + 1 });
  });
  await Promise.all([bump(), bump(), bump()]);
  assert.equal((await ref.get()).data().count, 3);

  const day = db.collection('daily_analytics').doc('d');
  const track = (visitor) => db.runTransaction(async (tx) => {
    const marker = db.collection('analytics_dedup').doc(`d_${visitor}`);
    const [seen] = await tx.getAll(marker);
    if (seen.exists) return;
    tx.set(marker, { day: 'd' });
    tx.set(day, { date: 'd', visits: FieldValue.increment(1) }, { merge: true });
    tx.set(day, { date: 'd', totalUniqueVisitors: FieldValue.increment(1) }, { merge: true });
  });
  await Promise.all(['a', 'b', 'c', 'd', 'a', 'b'].map(track));
  assert.deepEqual((await day.get()).data(), { date: 'd', visits: 4, totalUniqueVisitors: 4 });
});
