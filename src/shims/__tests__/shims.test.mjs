// Unit tests for the browser shims, run in Node:  node --test src/shims/__tests__/
// (Node 24 loads the .ts files directly.) The browser pieces the shims touch are faked below.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* ---- fake browser ---- */
const stored = new Map();
const fakeStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => { stored.set(key, String(value)); },
  removeItem: (key) => { stored.delete(key); },
};
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true, writable: true });
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });

const base64Url = (text) => Buffer.from(text, 'utf8').toString('base64url');
const makeToken = (payload) => `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
const inOneDay = () => Math.floor(Date.now() / 1000) + 86400;
const adminToken = (iat = 1) => makeToken({ uid: 'sag-admin', admin: true, iat, exp: inOneDay() });
const customerToken = (email = 'asha@example.com') => makeToken({ uid: 'c_0123456789abcdef', customerEmail: email, iat: 1, exp: inOneDay() });

// A session saved by an earlier page load, present before the shims are loaded
stored.set('sag_auth_token:restored', adminToken());

const { initializeApp, getApps } = await import('../firebase-app.ts');
const authShim = await import('../firebase-auth.ts');
const fs = await import('../firebase-firestore.ts');
const analytics = await import('../firebase-analytics.ts');
const { getAuth, signInWithCustomToken, signInWithCredential, GoogleAuthProvider, onAuthStateChanged, signOut, decodeJwtPayload } = authShim;

/* ---- fake /api/db ---- */
let requests = [];
/** (ops, token) => results array | { status, body } ; throwing means the network failed */
let respond = () => [];
/** What /api/admin-config?action=session answers: { status, body }. The default is "no admin cookie". */
let sessionAnswer = () => ({ status: 401, body: { error: 'Admin session required.' } });
let sessionRequests = [];
globalThis.fetch = async (url, init) => {
  if (url === '/api/admin-config?action=session') {
    sessionRequests.push(init);
    const { status, body } = sessionAnswer();
    return { ok: status === 200, status, json: async () => body };
  }
  const ops = JSON.parse(init.body).ops;
  const token = init.headers.Authorization ? init.headers.Authorization.replace('Bearer ', '') : null;
  requests.push({ url, ops, token, keepalive: init.keepalive });
  const answer = respond(ops, token);
  const status = Array.isArray(answer) ? 200 : answer.status;
  const body = Array.isArray(answer) ? { results: answer } : answer.body;
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

const settle = async () => {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setImmediate(resolve));
};
const advance = async (ms) => {
  mock.timers.tick(ms);
  await settle();
};
/** Attaches the expectation first, then lets the queued request go out (no unhandled rejection in between). */
const rejectsAfterTick = async (promise, expected) => {
  const outcome = assert.rejects(promise, expected);
  await advance(1);
  await outcome;
};
const setVisibility = (state) => {
  document.visibilityState = state;
  document.dispatchEvent(new Event('visibilitychange'));
};

let appCount = 0;
/** A fresh app (and so a fresh sign-in state and listener group) for every test. */
const freshDb = () => {
  appCount += 1;
  const app = initializeApp({ projectId: 'test' }, `app${appCount}`);
  return { app, auth: getAuth(app), db: fs.getFirestore(app) };
};

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  requests = [];
  sessionRequests = [];
  respond = () => [];
  sessionAnswer = () => ({ status: 401, body: { error: 'Admin session required.' } });
  document.visibilityState = 'visible';
});
afterEach(() => {
  mock.timers.reset();
});

/* ------------------------------------------------------------------ app, analytics */

test('initializeApp keeps the config and returns the same app for the same name', () => {
  const first = initializeApp({ projectId: 'p' }, 'named');
  assert.equal(first.name, 'named');
  assert.equal(first.options.projectId, 'p');
  assert.equal(initializeApp({ projectId: 'other' }, 'named'), first);
  assert.ok(getApps().find((app) => app.name === 'named'));
  assert.equal(initializeApp({ projectId: 'p' }).name, '[DEFAULT]');
});

test('analytics reports not supported', async () => {
  assert.equal(await analytics.isSupported(), false);
  assert.ok(analytics.getAnalytics(initializeApp({})));
});

/* ------------------------------------------------------------------ auth */

test('decodeJwtPayload reads the payload, including non-ASCII names, and rejects garbage', () => {
  assert.deepEqual(decodeJwtPayload(makeToken({ uid: 'u1', name: 'आशा', exp: 5 })), { uid: 'u1', name: 'आशा', exp: 5 });
  assert.equal(decodeJwtPayload('not-a-token'), null);
  assert.equal(decodeJwtPayload('a.b.c'), null);
  assert.equal(decodeJwtPayload(`x.${base64Url('[1,2]')}.y`), null);
  assert.equal(decodeJwtPayload(undefined), null);
});

test('a saved session is restored synchronously and announced once', async () => {
  const auth = getAuth(initializeApp({}, 'restored'));
  assert.equal(auth.currentUser?.uid, 'sag-admin');
  const seen = [];
  const stop = onAuthStateChanged(auth, (user) => seen.push(user?.uid ?? null));
  assert.deepEqual(seen, [], 'the first call is asynchronous, like Firebase');
  await settle();
  assert.deepEqual(seen, ['sag-admin']);
  await signOut(auth);
  assert.deepEqual(seen, ['sag-admin', null]);
  assert.equal(stored.has('sag_auth_token:restored'), false);
  stop();
});

test('an expired or unreadable saved token means signed out', () => {
  stored.set('sag_auth_token:expired', makeToken({ uid: 'c_1', exp: Math.floor(Date.now() / 1000) - 10 }));
  stored.set('sag_auth_token:broken', 'garbage');
  assert.equal(getAuth(initializeApp({}, 'expired')).currentUser, null);
  assert.equal(getAuth(initializeApp({}, 'broken')).currentUser, null);
});

test('signInWithCustomToken keeps the token per app and exposes uid and claims', async () => {
  const customer = freshDb();
  const admin = freshDb();
  const seen = [];
  const stop = onAuthStateChanged(customer.auth, (user) => seen.push(user?.uid ?? null));
  await settle();
  const token = customerToken();
  const credential = await signInWithCustomToken(customer.auth, token);
  assert.equal(credential.user.uid, 'c_0123456789abcdef');
  assert.equal((await credential.user.getIdTokenResult()).claims.customerEmail, 'asha@example.com');
  assert.equal(await customer.auth.currentUser.getIdToken(), token);
  assert.equal(stored.get(`sag_auth_token:${customer.app.name}`), token);
  assert.deepEqual(seen, [null, 'c_0123456789abcdef']);
  // The admin app is a separate session
  assert.equal(admin.auth.currentUser, null);
  await signInWithCustomToken(admin.auth, adminToken());
  assert.equal(admin.auth.currentUser.uid, 'sag-admin');
  assert.equal(customer.auth.currentUser.uid, 'c_0123456789abcdef');
  await signOut(admin.auth);
  assert.equal(customer.auth.currentUser.uid, 'c_0123456789abcdef');
  stop();
});

test('a bad or expired custom token is refused', async () => {
  const { auth } = freshDb();
  await assert.rejects(signInWithCustomToken(auth, 'nope'), { code: 'auth/invalid-custom-token' });
  await assert.rejects(signInWithCustomToken(auth, makeToken({ uid: 'c_1', exp: 1 })), { code: 'auth/invalid-custom-token' });
  assert.equal(auth.currentUser, null);
});

test('a token that expires while the page is open signs the user out', async () => {
  const { auth, app } = freshDb();
  await signInWithCustomToken(auth, makeToken({ uid: 'c_9', customerEmail: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 60 }));
  const user = auth.currentUser;
  mock.timers.tick(61000);
  await assert.rejects(user.getIdToken(), { code: 'auth/user-token-expired' });
  assert.equal(auth.currentUser, null);
  assert.equal(stored.has(`sag_auth_token:${app.name}`), false);
});

test('Google credential: getIdToken is the Google credential and nothing is saved', async () => {
  const { auth, app } = freshDb();
  const google = makeToken({ iss: 'https://accounts.google.com', sub: '1234567890', email: 'asha@example.com', exp: inOneDay() });
  const credential = await signInWithCredential(auth, GoogleAuthProvider.credential(google));
  assert.equal(await credential.user.getIdToken(), google);
  assert.equal(credential.user.uid, '1234567890');
  assert.equal(stored.has(`sag_auth_token:${app.name}`), false);
  await signOut(auth);
  assert.equal(auth.currentUser, null);
  await assert.rejects(signInWithCredential(auth, GoogleAuthProvider.credential('junk')), { code: 'auth/invalid-credential' });
});

test('sign-out in another tab is followed here', async () => {
  const { auth, app } = freshDb();
  await signInWithCustomToken(auth, customerToken());
  const seen = [];
  const stop = onAuthStateChanged(auth, (user) => seen.push(user?.uid ?? null));
  await settle();
  const key = `sag_auth_token:${app.name}`;
  stored.delete(key);
  const event = Object.assign(new Event('storage'), { key, storageArea: localStorage });
  window.dispatchEvent(event);
  assert.equal(auth.currentUser, null);
  assert.deepEqual(seen, ['c_0123456789abcdef', null]);
  stop();
});

test('a listener that throws does not break sign-in', async () => {
  const { auth } = freshDb();
  const errors = mock.method(console, 'error', () => {});
  const stop = onAuthStateChanged(auth, () => { throw new Error('boom'); });
  await settle();
  await signInWithCustomToken(auth, customerToken());
  assert.equal(auth.currentUser.uid, 'c_0123456789abcdef');
  assert.ok(errors.mock.callCount() >= 1);
  errors.mock.restore();
  stop();
});

/* ------------------------------------------------------------------ references and queries */

test('references and query serialisation match the gateway protocol', () => {
  const { db } = freshDb();
  assert.equal(fs.doc(db, 'orders', 'SAG-1').path, 'orders/SAG-1');
  assert.equal(fs.doc(db, 'orders/SAG-1').id, 'SAG-1');
  assert.equal(fs.doc(fs.collection(db, 'leads'), 'x').path, 'leads/x');
  assert.match(fs.doc(fs.collection(db, 'leads')).id, /^[A-Za-z0-9]{20}$/);
  assert.throws(() => fs.doc(db, 'orders'), { code: 'invalid-argument' });
  assert.throws(() => fs.doc(db, 'orders', ''), { code: 'invalid-argument' });
  assert.throws(() => fs.collection(db, 'a/b/c'), { code: 'invalid-argument' });

  assert.deepEqual(fs.collection(db, 'orders').spec, { collection: 'orders' });
  const q = fs.query(
    fs.collection(db, 'inventory_log'),
    fs.where('productId', '==', 'p1'),
    fs.where('day', 'in', ['2026-10-01', '2026-10-02']),
    fs.orderBy('at', 'desc'),
    fs.orderBy('name'),
    fs.limit(300),
  );
  assert.deepEqual(q.spec, {
    collection: 'inventory_log',
    where: [['productId', '==', 'p1'], ['day', 'in', ['2026-10-01', '2026-10-02']]],
    orderBy: [['at', 'desc'], ['name', 'asc']],
    limit: 300,
  });
  // Constraints can be added to an existing query without changing it
  const narrower = fs.query(q, fs.limit(5));
  assert.equal(narrower.spec.limit, 5);
  assert.equal(q.spec.limit, 300);
});

/* ------------------------------------------------------------------ one-shot reads */

test('reads of the same tick go out as one request and give Firestore-shaped snapshots', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => {
    if (op.op === 'get' && op.path === 'profiles/a@b.c') return { exists: true, id: 'a@b.c', data: { cart: [1], nested: { deep: 7 } }, version: 3 };
    if (op.op === 'get') return { exists: false, id: 'none', version: 0 };
    return { docs: [{ id: 'r1', data: { rating: 5 }, version: 1 }, { id: 'r2', data: { rating: 4 }, version: 2 }], version: 9 };
  });
  const pending = Promise.all([
    fs.getDoc(fs.doc(db, 'profiles', 'a@b.c')),
    fs.getDoc(fs.doc(db, 'profiles', 'none')),
    fs.getDocs(fs.query(fs.collection(db, 'reviews'), fs.where('status', '==', 'approved'))),
    fs.getDocsFromServer(fs.collection(db, 'customers')),
    fs.getDoc(fs.doc(db, 'profiles', 'a@b.c')),
  ]);
  await advance(1);
  const [profile, missing, reviews, customers, again] = await pending;

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/db');
  assert.equal(requests[0].token, null);
  assert.deepEqual(requests[0].ops, [
    { op: 'get', path: 'profiles/a@b.c' },
    { op: 'get', path: 'profiles/none' },
    { op: 'query', collection: 'reviews', where: [['status', '==', 'approved']] },
    { op: 'query', collection: 'customers' },
  ], 'the repeated read is sent once');

  assert.equal(profile.exists(), true);
  assert.equal(profile.id, 'a@b.c');
  assert.deepEqual(profile.data(), { cart: [1], nested: { deep: 7 } });
  assert.equal(profile.get('nested.deep'), 7);
  assert.equal(profile.ref.path, 'profiles/a@b.c');
  assert.equal(profile.metadata.fromCache, false);
  assert.equal(missing.exists(), false);
  assert.equal(missing.data(), undefined);
  assert.deepEqual(again.data(), profile.data());
  assert.notEqual(again.data(), profile.data(), 'each caller gets its own copy');

  assert.equal(reviews.size, 2);
  assert.equal(reviews.empty, false);
  assert.deepEqual(reviews.docs.map((d) => ({ id: d.id, ...d.data() })), [{ id: 'r1', rating: 5 }, { id: 'r2', rating: 4 }]);
  assert.equal(reviews.docs[0].exists(), true);
  assert.equal(reviews.docs[0].ref.path, 'reviews/r1');
  const visited = [];
  reviews.forEach((d) => visited.push(d.id));
  assert.deepEqual(visited, ['r1', 'r2']);
  assert.equal(reviews.metadata.fromCache, false);
  assert.equal(customers.size, 2);
});

test('more than 20 reads are split into requests of at most 20 ops', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => ({ exists: true, id: op.path, data: { path: op.path }, version: 1 }));
  const pending = Promise.all(Array.from({ length: 45 }, (_, n) => fs.getDoc(fs.doc(db, 'products', `p${n}`))));
  await advance(1);
  const snapshots = await pending;
  assert.deepEqual(requests.map((request) => request.ops.length), [20, 20, 5]);
  assert.equal(snapshots[44].data().path, 'products/p44');
});

test('each Firestore instance sends the token of its own app', async () => {
  const customer = freshDb();
  const admin = freshDb();
  const guest = freshDb();
  const cToken = customerToken();
  const aToken = adminToken();
  await signInWithCustomToken(customer.auth, cToken);
  await signInWithCustomToken(admin.auth, aToken);
  respond = (ops) => ops.map(() => ({ docs: [], version: 0 }));
  const pending = Promise.all([
    fs.getDocs(fs.collection(customer.db, 'coupons')),
    fs.getDocs(fs.collection(admin.db, 'orders')),
    fs.getDocs(fs.collection(guest.db, 'coupons')),
  ]);
  await advance(1);
  await pending;
  assert.deepEqual(requests.map((request) => [request.ops[0].collection, request.token]).sort(), [
    ['coupons', cToken], ['coupons', null], ['orders', aToken],
  ].sort());
});

test('errors carry the Firestore code and a message', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => (op.collection === 'customers' ? { error: { code: 'permission-denied', message: 'Admin only.' } } : { docs: [], version: 0 }));
  const fine = fs.getDocs(fs.collection(db, 'coupons'));
  await rejectsAfterTick(
    fs.getDocs(fs.collection(db, 'customers')),
    (error) => error instanceof Error && error.code === 'permission-denied' && error.message === 'Admin only.',
  );
  assert.equal((await fine).empty, true);
  assert.equal(requests.length, 1);

  respond = () => ({ status: 429, body: { error: 'Too many requests' } });
  await rejectsAfterTick(fs.getDoc(fs.doc(db, 'products', 'p')), { code: 'resource-exhausted', message: 'Too many requests' });

  respond = () => ({ status: 503, body: null });
  await rejectsAfterTick(fs.getDoc(fs.doc(db, 'products', 'p')), { code: 'unavailable' });

  respond = () => { throw new TypeError('Failed to fetch'); };
  await rejectsAfterTick(fs.getDoc(fs.doc(db, 'products', 'p')), { code: 'unavailable' });

  respond = () => ({ status: 200, body: { results: [] } });
  await rejectsAfterTick(fs.getDoc(fs.doc(db, 'products', 'p')), { code: 'unavailable' });
});

/* ------------------------------------------------------------------ writes */

test('writes send the op the gateway expects', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => (op.op === 'add' ? { id: 'newLead1' } : { ok: true }));
  await fs.setDoc(fs.doc(db, 'profiles', 'a@b.c'), { cart: [], skip: undefined, when: new Date('2026-10-02T00:00:00.000Z') }, { merge: true });
  await fs.setDoc(fs.doc(db, 'products', 'p1'), { name: 'Suit' });
  await fs.updateDoc(fs.doc(db, 'leads', 'l1'), { offerSent: true });
  await fs.deleteDoc(fs.doc(db, 'leads', 'l1'));
  const created = await fs.addDoc(fs.collection(db, 'leads'), { email: 'a@b.c', source: 'newsletter' });
  assert.equal(created.id, 'newLead1');
  assert.equal(created.path, 'leads/newLead1');
  assert.deepEqual(requests.map((request) => request.ops), [
    [{ op: 'set', path: 'profiles/a@b.c', data: { cart: [], when: '2026-10-02T00:00:00.000Z' }, merge: true }],
    [{ op: 'set', path: 'products/p1', data: { name: 'Suit' } }],
    [{ op: 'update', path: 'leads/l1', data: { offerSent: true } }],
    [{ op: 'delete', path: 'leads/l1' }],
    [{ op: 'add', collection: 'leads', data: { email: 'a@b.c', source: 'newsletter' } }],
  ]);
  assert.ok(requests.every((request) => request.keepalive === false));
});

test('a refused write rejects with the server code', async () => {
  const { db } = freshDb();
  respond = () => [{ error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } }];
  await assert.rejects(fs.setDoc(fs.doc(db, 'orders', 'o1'), { total: 1 }), { code: 'permission-denied' });
  respond = () => [{ error: { code: 'not-found', message: 'No document to update.' } }];
  await assert.rejects(fs.updateDoc(fs.doc(db, 'leads', 'gone'), { offerSent: true }), { code: 'not-found' });
});

test('a save made while the page is being hidden may outlive the page', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map(() => ({ ok: true }));
  document.visibilityState = 'hidden';
  await fs.setDoc(fs.doc(db, 'profiles', 'a@b.c'), { cart: [] }, { merge: true });
  await fs.addDoc(fs.collection(db, 'leads'), { source: 'contact' });
  assert.deepEqual(requests.map((request) => request.keepalive), [true, false]);
});

/* ------------------------------------------------------------------ transactions */

test('runTransaction commits with the versions it read', async () => {
  const { db, auth } = freshDb();
  await signInWithCustomToken(auth, adminToken());
  respond = (ops) => ops.map((op) => (op.op === 'get' ? { exists: true, id: 'p1', data: { stockQuantity: 4, name: 'Suit' }, version: 12 } : { ok: true }));
  const ref = fs.doc(db, 'products', 'p1');
  const pending = fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    assert.equal(snap.exists(), true);
    const value = snap.data().stockQuantity - 1;
    tx.update(ref, { stockQuantity: value, inStock: value > 0 });
    return { value, name: snap.data().name };
  });
  await advance(1);
  assert.deepEqual(await pending, { value: 3, name: 'Suit' });
  assert.deepEqual(requests[1].ops, [{
    op: 'commit',
    preconditions: [{ path: 'products/p1', version: 12 }],
    writes: [{ type: 'update', path: 'products/p1', data: { stockQuantity: 3, inStock: true } }],
  }]);
});

test('runTransaction runs again on fresh data when the commit is aborted', async () => {
  const { db } = freshDb();
  let stock = 4;
  let version = 1;
  let commits = 0;
  respond = (ops) => ops.map((op) => {
    if (op.op === 'get') return { exists: true, id: 'p1', data: { stockQuantity: stock }, version };
    commits += 1;
    // Someone else sells two pieces before our first two commits
    if (commits <= 2) { stock -= 1; version += 1; return { error: { code: 'aborted', message: 'Document changed.' } }; }
    return { ok: true };
  });
  const ref = fs.doc(db, 'products', 'p1');
  const pending = fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const value = snap.data().stockQuantity + 10;
    tx.set(ref, { stockQuantity: value }, { merge: true }).delete(fs.doc(db, 'inventory_log', 'old'));
    return value;
  });
  for (let round = 0; round < 3; round++) await advance(1);
  assert.equal(await pending, 12);
  const lastCommit = requests.at(-1).ops[0];
  assert.deepEqual(lastCommit.preconditions, [{ path: 'products/p1', version: 3 }]);
  assert.deepEqual(lastCommit.writes, [
    { type: 'set', path: 'products/p1', data: { stockQuantity: 12 }, merge: true },
    { type: 'delete', path: 'inventory_log/old' },
  ]);
});

test('runTransaction gives up after 5 aborted attempts; a missing document is a null precondition', async () => {
  const { db } = freshDb();
  let commits = 0;
  respond = (ops) => ops.map((op) => {
    if (op.op === 'get') return { exists: false, id: 'p1', version: 0 };
    commits += 1;
    return { error: { code: 'aborted', message: 'Document changed.' } };
  });
  const ref = fs.doc(db, 'products', 'p1');
  const pending = fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    assert.equal(snap.exists(), false);
    tx.set(ref, { stockQuantity: 1 });
  });
  const outcome = assert.rejects(pending, { code: 'aborted' });
  for (let round = 0; round < 6; round++) await advance(1);
  await outcome;
  assert.equal(commits, 5);
  assert.deepEqual(requests.at(-1).ops[0].preconditions, [{ path: 'products/p1', version: null }]);
});

test('runTransaction passes on the error thrown by the update function and writes nothing', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map(() => ({ exists: false, id: 'p1', version: 0 }));
  const pending = fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(fs.doc(db, 'products', 'p1'));
    if (!snap.exists()) throw new Error('Product not found.');
  });
  const outcome = assert.rejects(pending, { message: 'Product not found.' });
  await advance(1);
  await outcome;
  assert.equal(requests.length, 1);
});

/* ------------------------------------------------------------------ listeners */

/** A tiny in-memory gateway for watch ops: documents by path with versions, collections with versions. */
const makeWatchServer = () => {
  const docs = new Map();
  const collections = new Map();
  const put = (path, data) => {
    const [name] = path.split('/');
    docs.set(path, { data, version: (docs.get(path)?.version || 0) + 1 });
    collections.set(name, (collections.get(name) || 0) + 1);
  };
  const answer = (target) => {
    if (target.kind === 'doc') {
      const found = docs.get(target.path);
      const version = found ? found.version : 0;
      if (target.since === version) return { key: target.key, unchanged: true };
      return found
        ? { key: target.key, version, exists: true, id: target.path.split('/')[1], data: found.data }
        : { key: target.key, version, exists: false, id: target.path.split('/')[1] };
    }
    const version = collections.get(target.collection) || 0;
    if (target.since === version) return { key: target.key, unchanged: true };
    const rows = [...docs.entries()]
      .filter(([path]) => path.startsWith(`${target.collection}/`))
      .map(([path, row]) => ({ id: path.split('/')[1], data: row.data, version: row.version }));
    return { key: target.key, version, docs: rows };
  };
  const handle = (ops) => ops.map((op) => (op.op === 'watch' ? { targets: op.targets.map(answer) } : { ok: true }));
  return { put, handle };
};

const watchRequests = () => requests.filter((request) => request.ops.some((op) => op.op === 'watch'));

test('listeners of one tick share ONE watch request; later snapshots only when something changed', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('storefront_settings/storeSettings', { value_json: '{"a":1}' });
  server.put('reviews/r1', { status: 'approved' });
  respond = server.handle;

  const settings = [];
  const reviews = [];
  const stopSettings = fs.onSnapshot(fs.doc(db, 'storefront_settings', 'storeSettings'), (snap) => settings.push(snap.exists() ? snap.data().value_json : null));
  const stopReviews = fs.onSnapshot(
    fs.query(fs.collection(db, 'reviews'), fs.where('status', '==', 'approved')),
    (snap) => reviews.push(snap.docs.map((d) => d.id)),
  );
  assert.equal(requests.length, 0, 'nothing is sent synchronously');
  await advance(1);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].ops.length, 1);
  assert.deepEqual(requests[0].ops[0].targets.map(({ key, ...rest }) => rest), [
    { kind: 'doc', path: 'storefront_settings/storeSettings' },
    { kind: 'query', collection: 'reviews', where: [['status', '==', 'approved']] },
  ]);
  assert.deepEqual(settings, ['{"a":1}']);
  assert.deepEqual(reviews, [['r1']]);

  // A shopper (no admin token) is polled every 60 seconds, with the versions already held
  await advance(59000);
  assert.equal(requests.length, 1);
  await advance(1000);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].ops[0].targets.map((target) => target.since), [1, 1]);
  assert.deepEqual(settings, ['{"a":1}'], 'unchanged: no callback');

  server.put('storefront_settings/storeSettings', { value_json: '{"a":2}' });
  await advance(60000);
  assert.deepEqual(settings, ['{"a":1}', '{"a":2}']);
  assert.deepEqual(reviews, [['r1']]);

  stopSettings();
  stopReviews();
  await advance(600000);
  assert.equal(requests.length, 3, 'no polling without listeners');
});

test('more than 50 listeners are split over watch ops of at most 50 targets, still in one request', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => ({ targets: op.targets.map((target) => ({ key: target.key, version: 0, exists: false, id: 'x', data: null })) }));
  let delivered = 0;
  const stops = Array.from({ length: 120 }, (_, n) => fs.onSnapshot(fs.doc(db, 'products', `p${n}`), (snap) => { if (!snap.exists()) delivered += 1; }));
  await advance(1);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].ops.map((op) => op.targets.length), [50, 50, 20]);
  assert.equal(delivered, 120);
  stops.forEach((stop) => stop());
});

test('a query is not handed to the app again when its own documents did not change', async () => {
  const { db } = freshDb();
  let version = 1;
  respond = (ops) => ops.map((op) => ({
    targets: op.targets.map((target) => ({ key: target.key, version, docs: [{ id: 'r1', data: { status: 'approved' }, version: 4 }] })),
  }));
  let calls = 0;
  const stop = fs.onSnapshot(fs.query(fs.collection(db, 'reviews'), fs.where('productId', '==', 'p1')), () => { calls += 1; });
  await advance(1);
  version = 2; // another product's review changed: same result for this query
  await advance(60000);
  assert.equal(watchRequests().length, 2);
  assert.equal(calls, 1);
  stop();
});

test('an admin token is polled every 10 seconds', async () => {
  const { db, auth } = freshDb();
  await signInWithCustomToken(auth, adminToken());
  const server = makeWatchServer();
  server.put('orders/o1', { total: 100 });
  respond = server.handle;
  const seen = [];
  const stop = fs.onSnapshot(fs.collection(db, 'orders'), (snap) => seen.push(snap.size));
  await advance(1);
  assert.equal(requests.length, 1);
  await advance(10000);
  assert.equal(requests.length, 2);
  server.put('orders/o2', { total: 50 });
  await advance(10000);
  assert.deepEqual(seen, [1, 2]);
  stop();
});

test('listeners started at different moments end up in the same request per interval', async () => {
  const { db, auth } = freshDb();
  await signInWithCustomToken(auth, adminToken());
  const server = makeWatchServer();
  server.put('orders/o1', { total: 100 });
  server.put('reviews/r1', { status: 'pending' });
  respond = server.handle;
  const stopOrders = fs.onSnapshot(fs.collection(db, 'orders'), () => {});
  await advance(1);
  // A second part of the page mounts four seconds later
  await advance(4000);
  const stopReviews = fs.onSnapshot(fs.collection(db, 'reviews'), () => {});
  await advance(1);
  assert.deepEqual(watchRequests().map((request) => request.ops[0].targets.length), [1, 2], 'the new listener takes the other one along');

  for (let tick = 0; tick < 3; tick++) await advance(10000);
  assert.deepEqual(watchRequests().slice(2).map((request) => request.ops[0].targets.length), [2, 2, 2], 'one request per 10 seconds, not two');
  stopOrders();
  stopReviews();
});

test('polling pauses while the tab is hidden and resumes at once when it is shown', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('categories/c1', { name: 'Suits' });
  respond = server.handle;
  const seen = [];
  const stop = fs.onSnapshot(fs.collection(db, 'categories'), (snap) => seen.push(snap.size));
  await advance(1);
  setVisibility('hidden');
  server.put('categories/c2', { name: 'Kurtis' });
  await advance(10 * 60000);
  assert.equal(requests.length, 1, 'no requests while hidden');
  setVisibility('visible');
  await advance(1);
  assert.equal(requests.length, 2);
  assert.deepEqual(seen, [1, 2]);
  // focus also refreshes, and several signals in one tick still make one request
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('focus'));
  await advance(1);
  assert.equal(requests.length, 3);
  stop();
});

test('a listener started in a hidden tab still gets its first snapshot', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('categories/c1', { name: 'Suits' });
  respond = server.handle;
  document.visibilityState = 'hidden';
  const seen = [];
  const stop = fs.onSnapshot(fs.collection(db, 'categories'), (snap) => seen.push(snap.size));
  await advance(1);
  assert.deepEqual(seen, [1]);
  await advance(10 * 60000);
  assert.equal(requests.length, 1);
  stop();
});

test('a write through the shim refreshes the listeners immediately', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('leads/l1', { offerSent: false });
  respond = (ops) => {
    ops.forEach((op) => { if (op.op === 'update') server.put(op.path, op.data); });
    return server.handle(ops);
  };
  const seen = [];
  const stop = fs.onSnapshot(fs.collection(db, 'leads'), (snap) => seen.push(snap.docs[0].data().offerSent));
  await advance(1);
  await fs.updateDoc(fs.doc(db, 'leads', 'l1'), { offerSent: true });
  await advance(1);
  assert.deepEqual(seen, [false, true]);
  assert.equal(watchRequests().length, 2);
  stop();
});

test('a failed poll reports once per failure streak and keeps retrying with growing pauses', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('products/p1', { name: 'Suit' });
  let down = true;
  respond = (ops) => { if (down) throw new TypeError('Failed to fetch'); return server.handle(ops); };
  const seen = [];
  const errors = [];
  const stop = fs.onSnapshot(fs.collection(db, 'products'), (snap) => seen.push(snap.size), (error) => errors.push(error.code));
  await advance(1);
  assert.deepEqual(errors, ['unavailable']);
  assert.equal(requests.length, 1);
  await advance(2000);
  assert.equal(requests.length, 2);
  await advance(3999);
  assert.equal(requests.length, 2, 'second retry waits 4 seconds');
  await advance(1);
  assert.equal(requests.length, 3);
  assert.deepEqual(errors, ['unavailable'], 'only the first failure of a streak is reported');

  down = false;
  await advance(8000);
  assert.deepEqual(seen, [1]);

  // A new streak is reported again
  down = true;
  await advance(60000);
  assert.deepEqual(errors, ['unavailable', 'unavailable']);
  // ...and the pause never grows beyond 5 minutes
  for (let minute = 0; minute < 30; minute++) await advance(60000);
  const before = requests.length;
  for (let minute = 0; minute < 60; minute++) await advance(60000);
  assert.ok(requests.length - before >= 10 && requests.length - before <= 12, `retries in an hour: ${requests.length - before}`);
  stop();
});

test('one refused target does not block the other listeners', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('coupons/c1', { code: 'A' });
  // This gateway refuses the whole op when any target is not allowed
  respond = (ops) => ops.map((op) => (
    op.targets.some((target) => target.collection === 'orders')
      ? { error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } }
      : { targets: server.handle([op])[0].targets }
  ));
  const coupons = [];
  const errors = [];
  const stopOrders = fs.onSnapshot(fs.collection(db, 'orders'), () => assert.fail('orders must not be delivered'), (error) => errors.push(error.code));
  const stopCoupons = fs.onSnapshot(fs.collection(db, 'coupons'), (snap) => coupons.push(snap.size));
  await advance(1);
  assert.deepEqual(coupons, [1]);
  assert.deepEqual(errors, ['permission-denied']);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].ops.map((op) => op.targets.length), [1, 1], 'second request asks for each target on its own');
  server.put('coupons/c2', { code: 'B' });
  await advance(60000);
  assert.deepEqual(coupons, [1, 2]);
  assert.deepEqual(errors, ['permission-denied']);
  stopOrders();
  stopCoupons();
});

test('a per-target error from the gateway fails only that listener', async () => {
  const { db } = freshDb();
  respond = (ops) => ops.map((op) => ({
    targets: op.targets.map((target) => (target.kind === 'doc'
      ? { key: target.key, error: { code: 'permission-denied', message: 'no' } }
      : { key: target.key, version: 1, docs: [] })),
  }));
  const errors = [];
  const sizes = [];
  const stopDoc = fs.onSnapshot(fs.doc(db, 'analytics_totals', 'lifetime'), () => assert.fail('must not deliver'), (error) => errors.push(error.code));
  const stopList = fs.onSnapshot(fs.collection(db, 'categories'), (snap) => sizes.push(snap.size));
  await advance(1);
  assert.deepEqual(errors, ['permission-denied']);
  assert.deepEqual(sizes, [0]);
  assert.equal(requests.length, 1);
  stopDoc();
  stopList();
});

test('listener callbacks that throw never break polling, and observers are supported', async () => {
  const { db } = freshDb();
  const server = makeWatchServer();
  server.put('categories/c1', { name: 'Suits' });
  respond = server.handle;
  const logged = mock.method(console, 'error', () => {});
  const seen = [];
  const stopBad = fs.onSnapshot(fs.collection(db, 'categories'), () => { throw new Error('render failed'); });
  const stopGood = fs.onSnapshot(fs.doc(db, 'categories', 'c1'), { next: (snap) => seen.push(snap.data().name) });
  await advance(1);
  assert.deepEqual(seen, ['Suits']);
  server.put('categories/c1', { name: 'Co-ords' });
  await advance(60000);
  assert.deepEqual(seen, ['Suits', 'Co-ords']);
  assert.equal(logged.mock.callCount(), 2);
  logged.mock.restore();
  stopBad();
  stopGood();
});

test('unsubscribing before the answer arrives means no callback', async () => {
  const { db } = freshDb();
  respond = makeWatchServer().handle;
  const stop = fs.onSnapshot(fs.collection(db, 'categories'), () => assert.fail('must not be called'));
  mock.timers.tick(1);
  stop();
  await settle();
  await advance(120000);
  assert.equal(requests.length, 1);
});

test('signing in restarts the listeners with the new token', async () => {
  const { db, auth } = freshDb();
  const aToken = adminToken();
  respond = (ops, token) => ops.map((op) => (
    token === aToken
      ? { targets: op.targets.map((target) => ({ key: target.key, version: 5, docs: [{ id: 'o1', data: {}, version: 1 }] })) }
      : { error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } }
  ));
  const sizes = [];
  const errors = [];
  const stop = fs.onSnapshot(fs.collection(db, 'orders'), (snap) => sizes.push(snap.size), (error) => errors.push(error.code));
  await advance(1);
  assert.deepEqual(errors, ['permission-denied']);
  await signInWithCustomToken(auth, aToken);
  await advance(1);
  assert.deepEqual(sizes, [1]);
  assert.equal(requests.at(-1).token, aToken);
  stop();
});

test('an admin token the server refuses is dropped when the admin cookie is no longer good either', async () => {
  const { db, auth } = freshDb();
  const revoked = adminToken();
  await signInWithCustomToken(auth, revoked);
  const seen = [];
  const stopAuth = onAuthStateChanged(auth, (user) => seen.push(user?.uid ?? null));
  await settle();
  respond = (ops) => ops.map(() => ({ error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } }));
  await rejectsAfterTick(fs.getDocs(fs.collection(db, 'orders')), { code: 'permission-denied' });
  await settle();
  assert.equal(sessionRequests.length, 1);
  assert.equal(sessionRequests[0].credentials, 'same-origin');
  assert.equal(auth.currentUser, null);
  assert.deepEqual(seen, ['sag-admin', null]);
  stopAuth();
});

test('a revoked admin token is replaced through the admin cookie: no sign-out, and the listeners carry on', async () => {
  const { db, auth } = freshDb();
  const revoked = adminToken(1);
  const renewed = adminToken(2);
  await signInWithCustomToken(auth, revoked);
  const seen = [];
  const stopAuth = onAuthStateChanged(auth, (user) => seen.push(user?.uid ?? null));
  const server = makeWatchServer();
  server.put('orders/o1', { total: 1 });
  // the server stops accepting the old token (the owner saved the security settings)
  let revokedNow = false;
  respond = (ops, token) => (revokedNow && token !== renewed
    ? ops.map((op) => ({ targets: op.targets.map((target) => ({ key: target.key, error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } })) }))
    : server.handle(ops));
  sessionAnswer = () => ({ status: 200, body: { success: true, firebaseToken: renewed } });

  const sizes = [];
  const errors = [];
  const stop = fs.onSnapshot(fs.collection(db, 'orders'), (snap) => sizes.push(snap.size), (error) => errors.push(error.code));
  await advance(1);
  assert.deepEqual(sizes, [1]);

  revokedNow = true;
  server.put('orders/o2', { total: 2 });
  await advance(10000);
  await advance(1);
  assert.equal(sessionRequests.length, 1);
  assert.equal(await auth.currentUser.getIdToken(), renewed);
  assert.equal(stored.get(`sag_auth_token:${auth.name}`), renewed);
  // the same admin all along: the app's auth listener heard nothing, and the new order arrived
  assert.deepEqual(seen, ['sag-admin']);
  assert.deepEqual(sizes, [1, 2]);
  assert.equal(requests.at(-1).token, renewed);
  stop();
  stopAuth();
});

test('a renewed admin token that is refused again is not renewed in a loop', async () => {
  const { db, auth } = freshDb();
  await signInWithCustomToken(auth, adminToken(1));
  let minted = 1;
  sessionAnswer = () => { minted += 1; return { status: 200, body: { firebaseToken: adminToken(minted) } }; };
  respond = (ops) => ops.map(() => ({ error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } }));
  await rejectsAfterTick(fs.getDocs(fs.collection(db, 'orders')), { code: 'permission-denied' });
  await settle();
  assert.equal(await auth.currentUser.getIdToken(), adminToken(2));
  await rejectsAfterTick(fs.getDocs(fs.collection(db, 'orders')), { code: 'permission-denied' });
  await settle();
  assert.equal(sessionRequests.length, 1);
  assert.equal(auth.currentUser, null);
});

test('a sign-out while the renewal is on its way stands; a customer token is never renewed', async () => {
  const { db, auth } = freshDb();
  await signInWithCustomToken(auth, adminToken(1));
  sessionAnswer = () => ({ status: 200, body: { firebaseToken: adminToken(2) } });
  respond = (ops) => ops.map(() => ({ error: { code: 'permission-denied', message: 'no' } }));
  const outcome = assert.rejects(fs.getDocs(fs.collection(db, 'orders')), { code: 'permission-denied' });
  mock.timers.tick(1);
  await signOut(auth);
  await settle();
  await outcome;
  assert.equal(auth.currentUser, null);

  const customer = freshDb();
  await signInWithCustomToken(customer.auth, customerToken());
  respond = () => ({ status: 401, body: { error: { code: 'unauthenticated', message: 'Session expired.' } } });
  const before = sessionRequests.length;
  await rejectsAfterTick(fs.getDocs(fs.collection(customer.db, 'coupons')), { code: 'unauthenticated' });
  assert.equal(sessionRequests.length, before);
  assert.equal(customer.auth.currentUser, null);
});

test('a customer token is kept when a read is simply not allowed, and a refused write never signs the admin out', async () => {
  const customer = freshDb();
  await signInWithCustomToken(customer.auth, customerToken());
  respond = (ops) => ops.map(() => ({ error: { code: 'permission-denied', message: 'no' } }));
  await rejectsAfterTick(fs.getDocs(fs.collection(customer.db, 'orders')), { code: 'permission-denied' });
  assert.equal(customer.auth.currentUser.uid, 'c_0123456789abcdef');

  const admin = freshDb();
  await signInWithCustomToken(admin.auth, adminToken());
  await assert.rejects(fs.setDoc(fs.doc(admin.db, 'orders', 'o1'), { total: 1 }), { code: 'permission-denied' });
  assert.equal(admin.auth.currentUser.uid, 'sag-admin');
});

test('HTTP 401 drops the token and the request is repeated as a guest', async () => {
  const { db, auth } = freshDb();
  const token = customerToken();
  await signInWithCustomToken(auth, token);
  respond = (ops, sent) => (sent ? { status: 401, body: { error: { code: 'unauthenticated', message: 'Session expired.' } } } : ops.map(() => ({ docs: [], version: 0 })));
  const pending = fs.getDocs(fs.collection(db, 'coupons'));
  await advance(1);
  assert.equal((await pending).empty, true);
  assert.deepEqual(requests.map((request) => request.token), [token, null]);
  assert.equal(auth.currentUser, null);
});
