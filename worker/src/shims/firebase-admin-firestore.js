// Stand-in for 'firebase-admin/firestore' on the Worker (aliased in worker/wrangler.jsonc).
// It gives the unchanged handlers in api/** the Firestore Admin calls they use, on top of the D1
// document store. Only that surface is implemented (collection/doc paths, no subcollections).
//
// Differences a handler could notice, all checked against api/**:
// - Dates are stored and read back as ISO strings, not Timestamp objects (the app already stores ISO
//   strings everywhere; the only Date written is rate_limits.expiresAt, which is never read).
// - undefined fields are dropped instead of rejected.

import { createStore, StoreError } from '../docstore.js';
import { getDB } from '../env.js';

// gRPC status codes, because the handlers compare error.code with numbers (5, 6, 8, 10, 14).
const GRPC = {
  'invalid-argument': [3, 'INVALID_ARGUMENT'],
  'not-found': [5, 'NOT_FOUND'],
  'already-exists': [6, 'ALREADY_EXISTS'],
  aborted: [10, 'ABORTED'],
};
const INVALID_ARGUMENT = 3;
const ABORTED = 10;

class FirestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FirestoreError';
    this.code = code;
  }
}

const asFirestoreError = (error) => {
  if (!(error instanceof StoreError) || !GRPC[error.code]) return error;
  const [code, label] = GRPC[error.code];
  return new FirestoreError(code, `${code} ${label}: ${error.message}`);
};

const call = async (promise) => {
  try {
    return await promise;
  } catch (error) {
    throw asFirestoreError(error);
  }
};

// ---------------------------------------------------------------------------------------------------
// FieldValue and Timestamp
// ---------------------------------------------------------------------------------------------------

// The sentinels are the plain objects the document store understands.
export class FieldValue {
  static increment(n) { return { __op: 'increment', n }; }

  static arrayUnion(...values) { return { __op: 'arrayUnion', values }; }

  static arrayRemove(...values) { return { __op: 'arrayRemove', values }; }

  static delete() { return { __op: 'delete' }; }

  static serverTimestamp() { return { __op: 'serverTimestamp' }; }
}

// Minimal: enough to create one and to turn it back into a Date. Stored as an ISO string.
export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() { return Timestamp.fromDate(new Date()); }

  static fromDate(date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000 + 1000) % 1000 * 1e6);
  }

  toDate() { return new Date(this.seconds * 1000 + Math.round(this.nanoseconds / 1e6)); }
}

// ---------------------------------------------------------------------------------------------------
// References and snapshots
// ---------------------------------------------------------------------------------------------------

const AUTO_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const autoId = () => {
  let id = '';
  while (id.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(40))) {
      // 248 is the largest multiple of 62 below 256: skipping the rest keeps every character equally likely
      if (byte < 248 && id.length < 20) id += AUTO_ID_ALPHABET[byte % 62];
    }
  }
  return id;
};

const fieldAt = (data, path) => String(path).split('.').reduce((value, part) => (value !== null && typeof value === 'object' ? value[part] : undefined), data);

class DocumentSnapshot {
  #data;

  constructor(ref, stored) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = Boolean(stored);
    this.#data = stored ? stored.data : undefined;
  }

  // A fresh copy each time, as Firestore gives: handlers change what they get back.
  data() { return this.exists ? structuredClone(this.#data) : undefined; }

  get(field) {
    const value = this.exists ? fieldAt(this.#data, field) : undefined;
    return value !== null && typeof value === 'object' ? structuredClone(value) : value;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(callback, thisArg) { this.docs.forEach((doc) => callback.call(thisArg, doc)); }
}

class DocumentReference {
  constructor(firestore, collection, id) {
    if (typeof id !== 'string' || !id || id.includes('/')) {
      throw new FirestoreError(INVALID_ARGUMENT, `3 INVALID_ARGUMENT: Invalid document id in ${collection}: ${String(id)}`);
    }
    this.firestore = firestore;
    this.id = id;
    this.path = `${collection}/${id}`;
    this.collectionId = collection; // not part of Firestore's API; the store addresses documents this way
  }

  async get() { return new DocumentSnapshot(this, await call(this.firestore.store.getDoc(this.collectionId, this.id))); }

  async set(data, options) { await call(this.firestore.store.commit([setWrite(this, data, options)])); }

  async update(data) { await call(this.firestore.store.commit([write('update', this, data)])); }

  async create(data) { await call(this.firestore.store.commit([write('create', this, data)])); }

  async delete() { await call(this.firestore.store.commit([write('delete', this)])); }
}

const write = (type, ref, data) => ({ type, collection: ref.collectionId, id: ref.id, ...(type === 'delete' ? {} : { data }) });

const setWrite = (ref, data, options = {}) => ({
  ...write('set', ref, data),
  ...(options.merge ? { merge: true } : {}),
  ...(Array.isArray(options.mergeFields) ? { mergeFields: options.mergeFields } : {}),
});

class Query {
  constructor(firestore, spec) {
    this.firestore = firestore;
    this.spec = spec; // { collection, where, orderBy, limit?, select? } as the document store takes it
  }

  where(field, op, value) { return new Query(this.firestore, { ...this.spec, where: [...this.spec.where, [field, op, value]] }); }

  orderBy(field, direction = 'asc') { return new Query(this.firestore, { ...this.spec, orderBy: [...this.spec.orderBy, [field, direction]] }); }

  limit(n) { return new Query(this.firestore, { ...this.spec, limit: n }); }

  select(...fields) { return new Query(this.firestore, { ...this.spec, select: fields }); }

  async get() {
    const rows = await call(this.firestore.store.query(this.spec));
    return new QuerySnapshot(rows.map((row) => new DocumentSnapshot(new DocumentReference(this.firestore, this.spec.collection, row.id), row)));
  }
}

class CollectionReference extends Query {
  constructor(firestore, name) {
    if (typeof name !== 'string' || !name || name.includes('/')) {
      throw new FirestoreError(INVALID_ARGUMENT, `3 INVALID_ARGUMENT: Invalid collection name: ${String(name)}`);
    }
    super(firestore, { collection: name, where: [], orderBy: [] });
    this.id = name;
    this.path = name;
  }

  doc(id) { return new DocumentReference(this.firestore, this.id, id === undefined ? autoId() : id); }

  async add(data) {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

// ---------------------------------------------------------------------------------------------------
// Batches and transactions
// ---------------------------------------------------------------------------------------------------

class WriteBatch {
  #writes = [];

  constructor(firestore) { this.firestore = firestore; }

  set(ref, data, options) { this.#writes.push(setWrite(ref, data, options)); return this; }

  update(ref, data) { this.#writes.push(write('update', ref, data)); return this; }

  create(ref, data) { this.#writes.push(write('create', ref, data)); return this; }

  delete(ref) { this.#writes.push(write('delete', ref)); return this; }

  async commit() { await call(this.firestore.store.commit(this.#writes)); }
}

// Reads are remembered with the version they saw, writes are kept back, and commit() hands both to the
// store, which writes everything or nothing.
class Transaction {
  #writes = [];
  #docVersions = new Map();        // 'collection/id' -> { collection, id, version | null }
  #collectionVersions = new Map(); // collection -> version seen by a query

  constructor(firestore) { this.firestore = firestore; }

  #assertNoWrites() {
    if (this.#writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
  }

  #remember(ref, stored) {
    // The first read wins: if the document changed between two reads, the commit must fail.
    if (!this.#docVersions.has(ref.path)) this.#docVersions.set(ref.path, { collection: ref.collectionId, id: ref.id, version: stored ? stored.version : null });
  }

  async get(refOrQuery) {
    this.#assertNoWrites();
    if (refOrQuery instanceof DocumentReference) return (await this.getAll(refOrQuery))[0];
    if (!(refOrQuery instanceof Query)) throw new FirestoreError(INVALID_ARGUMENT, '3 INVALID_ARGUMENT: Transaction.get() needs a document reference or a query.');
    // Version first, rows second: a write landing in between makes the remembered version too old,
    // which aborts the commit instead of letting a missed document through.
    const { store } = this.firestore;
    const { collection } = refOrQuery.spec;
    const version = await call(store.collectionVersion(collection));
    const snapshot = await refOrQuery.get();
    if (!this.#collectionVersions.has(collection)) this.#collectionVersions.set(collection, version);
    return snapshot;
  }

  async getAll(...refs) {
    this.#assertNoWrites();
    const stored = await call(this.firestore.store.getMany(refs.map((ref) => ({ collection: ref.collectionId, id: ref.id }))));
    return refs.map((ref, index) => {
      this.#remember(ref, stored[index]);
      return new DocumentSnapshot(ref, stored[index]);
    });
  }

  set(ref, data, options) { this.#writes.push(setWrite(ref, data, options)); return this; }

  update(ref, data) { this.#writes.push(write('update', ref, data)); return this; }

  create(ref, data) { this.#writes.push(write('create', ref, data)); return this; }

  delete(ref) { this.#writes.push(write('delete', ref)); return this; }

  // A transaction that only read has nothing to commit and touches nothing.
  async commit() {
    if (this.#writes.length === 0) return;
    const preconditions = [
      ...this.#docVersions.values(),
      ...[...this.#collectionVersions].map(([collection, collectionVersion]) => ({ collection, collectionVersion })),
    ];
    await call(this.firestore.store.commit(this.#writes, { preconditions }));
  }
}

// Firestore's server SDK locks the documents a transaction reads, so transactions on the same document
// wait for each other. Here they race and the loser runs again; of N requests racing for one document
// only one can win each round. So there are more attempts than Firestore's 5, and the wait before each
// one is random and doubles (up to 50, 100, 200 ... 1000 ms): retries spread out instead of colliding
// again in step. Measured on local D1 (worker/test/scenarios/concurrency-real-d1.test.mjs).
const TRANSACTION_ATTEMPTS = 10;
const retryDelayMs = (attempt) => Math.random() * Math.min(1000, 25 * 2 ** attempt);

class Firestore {
  constructor(store) { this.store = store; }

  collection(name) { return new CollectionReference(this, name); }

  doc(path) {
    const [collection, id, ...rest] = String(path).split('/');
    if (rest.length) throw new FirestoreError(INVALID_ARGUMENT, `3 INVALID_ARGUMENT: Subcollections are not supported: ${path}`);
    return new DocumentReference(this, collection, id);
  }

  async getAll(...refs) {
    const stored = await call(this.store.getMany(refs.map((ref) => ({ collection: ref.collectionId, id: ref.id }))));
    return refs.map((ref, index) => new DocumentSnapshot(ref, stored[index]));
  }

  batch() { return new WriteBatch(this); }

  // Runs the function again when another writer got in first (ABORTED). Any other error, including one
  // thrown by the function itself, is passed on at once.
  async runTransaction(updateFunction, { maxAttempts = TRANSACTION_ATTEMPTS } = {}) {
    for (let attempt = 1; ; attempt += 1) {
      const transaction = new Transaction(this);
      try {
        const result = await updateFunction(transaction);
        await transaction.commit();
        return result;
      } catch (error) {
        if (error?.code !== ABORTED || attempt >= maxAttempts) throw error;
        await new Promise((done) => { setTimeout(done, retryDelayMs(attempt)); });
      }
    }
  }
}

// The D1 binding is looked up at the moment of each query, so a handler that keeps the Firestore object
// in a module variable still uses the bindings of the request being served.
const d1 = {
  prepare: (sql) => getDB().prepare(sql),
  batch: (statements) => getDB().batch(statements),
};
const firestore = new Firestore(createStore(d1));

// The app and database id arguments of the real getFirestore() are accepted and ignored: one database.
export const getFirestore = () => firestore;
