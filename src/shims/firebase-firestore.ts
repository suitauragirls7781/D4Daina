/**
 * Stand-in for `firebase/firestore` in the Cloudflare build (see README.md in this folder).
 *
 * Same function names and snapshot shapes as the Firebase SDK, but every call becomes an op in a
 * `POST /api/db` request (BUILD-SPEC section 7). The Worker applies the access rules; this file only
 * carries the request, with the token of the app the Firestore instance was created from.
 */
import { getApp, type FirebaseApp } from './firebase-app.ts';
import { decodeJwtPayload, shimOnTokenChange, shimRejectToken, shimTokenFor } from './firebase-auth.ts';

/* ------------------------------------------------------------------ types */

export type DocumentData = Record<string, any>;
export type WhereFilterOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type OrderByDirection = 'asc' | 'desc';
export type Unsubscribe = () => void;

export interface Firestore {
  readonly type: 'firestore';
  readonly app: FirebaseApp;
}

export interface Query {
  readonly type: 'query' | 'collection';
  readonly firestore: Firestore;
  /** The collection this query reads, plus its filters, in the shape the gateway expects. */
  readonly spec: QuerySpec;
}

export interface CollectionReference extends Query {
  readonly type: 'collection';
  readonly id: string;
  readonly path: string;
}

export interface DocumentReference {
  readonly type: 'document';
  readonly firestore: Firestore;
  readonly id: string;
  readonly path: string;
  readonly parent: CollectionReference;
}

export interface QuerySpec {
  collection: string;
  where?: [string, WhereFilterOp, unknown][];
  orderBy?: [string, OrderByDirection][];
  limit?: number;
}

export type QueryConstraint =
  | { readonly type: 'where'; readonly field: string; readonly op: WhereFilterOp; readonly value: unknown }
  | { readonly type: 'orderBy'; readonly field: string; readonly direction: OrderByDirection }
  | { readonly type: 'limit'; readonly count: number };

export interface SnapshotMetadata {
  readonly fromCache: boolean;
  readonly hasPendingWrites: boolean;
}

export interface DocumentSnapshot {
  readonly id: string;
  readonly ref: DocumentReference;
  readonly metadata: SnapshotMetadata;
  exists(): boolean;
  data(): DocumentData | undefined;
  get(field: string): any;
}

export interface QueryDocumentSnapshot extends DocumentSnapshot {
  data(): DocumentData;
}

export interface QuerySnapshot {
  readonly query: Query;
  readonly docs: QueryDocumentSnapshot[];
  readonly size: number;
  readonly empty: boolean;
  readonly metadata: SnapshotMetadata;
  forEach(callback: (doc: QueryDocumentSnapshot) => void): void;
}

export interface SetOptions {
  merge?: boolean;
}

/** An Error with a Firestore-style `code` ('permission-denied', 'unavailable', ...); the app checks both. */
export class FirestoreError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebaseError';
    this.code = code;
  }
}

/* ------------------------------------------------------------- references */

const instances = new Map<FirebaseApp, Firestore>();

export function getFirestore(app: FirebaseApp = getApp(), _databaseId?: string): Firestore {
  let db = instances.get(app);
  if (!db) {
    db = Object.freeze({ type: 'firestore' as const, app });
    instances.set(app, db);
  }
  return db;
}

/** The connection settings of the Firebase SDK (long polling, undefined handling) have no meaning here. */
export function initializeFirestore(app: FirebaseApp, _settings?: Record<string, unknown>, _databaseId?: string): Firestore {
  return getFirestore(app);
}

const invalid = (message: string) => new FirestoreError('invalid-argument', message);

const cleanSegments = (segments: string[]) =>
  segments.flatMap((segment) => String(segment).split('/')).filter((segment) => segment !== '');

const makeCollection = (firestore: Firestore, name: string): CollectionReference =>
  Object.freeze({ type: 'collection' as const, firestore, id: name, path: name, spec: Object.freeze({ collection: name }) });

const makeDoc = (firestore: Firestore, name: string, id: string): DocumentReference =>
  Object.freeze({ type: 'document' as const, firestore, id, path: `${name}/${id}`, parent: makeCollection(firestore, name) });

export function collection(firestore: Firestore, path: string, ...more: string[]): CollectionReference {
  const segments = cleanSegments([path, ...more]);
  // The store has no subcollections: a collection is always one name.
  if (segments.length !== 1) throw invalid(`'${[path, ...more].join('/')}' is not a collection name.`);
  return makeCollection(firestore, segments[0]);
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
};

/** `doc(db, 'orders', id)`, `doc(db, 'orders/id')` or `doc(collectionRef, id?)` (a new id when left out). */
export function doc(parent: Firestore | CollectionReference, ...pathSegments: string[]): DocumentReference {
  if (parent.type === 'collection') {
    const segments = cleanSegments(pathSegments);
    if (pathSegments.length === 0) return makeDoc(parent.firestore, parent.id, newId());
    if (segments.length !== 1) throw invalid(`'${pathSegments.join('/')}' is not a document id.`);
    return makeDoc(parent.firestore, parent.id, segments[0]);
  }
  const segments = cleanSegments(pathSegments);
  if (segments.length !== 2) throw invalid(`'${pathSegments.join('/')}' is not a document path (collection/id).`);
  return makeDoc(parent, segments[0], segments[1]);
}

export function where(field: string, op: WhereFilterOp, value: unknown): QueryConstraint {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction: OrderByDirection = 'asc'): QueryConstraint {
  return { type: 'orderBy', field, direction };
}

export function limit(count: number): QueryConstraint {
  return { type: 'limit', count };
}

export function query(source: Query, ...constraints: QueryConstraint[]): Query {
  const spec: QuerySpec = {
    collection: source.spec.collection,
    where: [...(source.spec.where || [])],
    orderBy: [...(source.spec.orderBy || [])],
    limit: source.spec.limit,
  };
  for (const constraint of constraints) {
    if (constraint.type === 'where') spec.where!.push([constraint.field, constraint.op, constraint.value]);
    else if (constraint.type === 'orderBy') spec.orderBy!.push([constraint.field, constraint.direction]);
    else spec.limit = constraint.count;
  }
  // Empty parts are left out so the request says only what was asked.
  if (spec.where!.length === 0) delete spec.where;
  if (spec.orderBy!.length === 0) delete spec.orderBy;
  if (spec.limit === undefined) delete spec.limit;
  return Object.freeze({ type: 'query' as const, firestore: source.firestore, spec: Object.freeze(spec) });
}

/* -------------------------------------------------------------- snapshots */

const METADATA: SnapshotMetadata = Object.freeze({ fromCache: false, hasPendingWrites: false });

function documentSnapshot(ref: DocumentReference, exists: boolean, data: unknown): DocumentSnapshot {
  const value = exists && data && typeof data === 'object' ? (data as DocumentData) : undefined;
  return {
    id: ref.id,
    ref,
    metadata: METADATA,
    exists: () => value !== undefined,
    data: () => value,
    // Dotted paths read nested fields, as in Firestore.
    get: (field) => String(field).split('.').reduce<any>((current, key) => (current == null ? undefined : current[key]), value),
  };
}

function querySnapshot(source: Query, rows: unknown): QuerySnapshot {
  const list = Array.isArray(rows) ? rows : [];
  const docs = list.map((row) =>
    documentSnapshot(makeDoc(source.firestore, source.spec.collection, String(row.id)), true, row.data || {}) as QueryDocumentSnapshot);
  return {
    query: source,
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: METADATA,
    forEach: (callback) => docs.forEach((snapshot) => callback(snapshot)),
  };
}

/* -------------------------------------------------------------- transport */

type Op = { op: string } & Record<string, unknown>;
type Result = Record<string, any>;

const ENDPOINT = '/api/db';
const MAX_OPS_PER_REQUEST = 20;
const REQUEST_TIMEOUT_MS = 30000;
/** Browsers only let small requests outlive the page. */
const KEEPALIVE_MAX_CHARS = 24000;

const READ_OPS = new Set(['get', 'query', 'watch']);

const STATUS_CODES: Record<number, string> = {
  400: 'invalid-argument',
  401: 'unauthenticated',
  403: 'permission-denied',
  413: 'invalid-argument',
  429: 'resource-exhausted',
};

const DEFAULT_MESSAGES: Record<string, string> = {
  'permission-denied': 'Missing or insufficient permissions.',
  'resource-exhausted': 'Quota exceeded.',
  unavailable: 'The store database could not be reached. Please try again.',
};

function toError(raw: unknown, fallbackCode = 'unavailable'): FirestoreError {
  const detail = raw && typeof raw === 'object' ? (raw as { code?: unknown; message?: unknown }) : {};
  const code = typeof detail.code === 'string' && detail.code ? detail.code : fallbackCode;
  const text = typeof raw === 'string' ? raw : typeof detail.message === 'string' ? detail.message : '';
  return new FirestoreError(code, text || DEFAULT_MESSAGES[code] || `Database request failed (${code}).`);
}

const isAdminToken = (token: string | null) => Boolean(token && decodeJwtPayload(token)?.admin === true);

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

async function post(ops: Op[], token: string | null, keepalive: boolean): Promise<unknown[]> {
  const body = JSON.stringify({ ops });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  let payload: any;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body,
      signal: controller.signal,
      keepalive: keepalive && body.length <= KEEPALIVE_MAX_CHARS,
    });
    payload = await response.json().catch(() => null);
  } catch {
    throw toError(null, 'unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw toError(payload?.error, STATUS_CODES[response.status] || 'unavailable');
  if (!Array.isArray(payload?.results) || payload.results.length !== ops.length) {
    throw new FirestoreError('unavailable', 'Unexpected answer from the store database.');
  }
  return payload.results;
}

/**
 * A token the server no longer accepts must not stay "signed in" here. `unauthenticated` says so directly.
 * The admin may read every collection the app reads, so a denied READ with an admin token also means the
 * token was revoked (signed out on another device, security settings changed).
 */
function dropTokenIfRefused(app: FirebaseApp, token: string | null, op: Op, error: FirestoreError) {
  if (!token) return;
  const refused = error.code === 'unauthenticated'
    || (error.code === 'permission-denied' && READ_OPS.has(op.op) && isAdminToken(token));
  if (refused) shimRejectToken(app, token);
}

/**
 * Sends ops with the app's token. Resolves to one entry per op: the result, or a FirestoreError for an op
 * the server refused. Rejects when the request as a whole failed.
 */
async function exchange(app: FirebaseApp, ops: Op[], keepalive = false): Promise<(Result | FirestoreError)[]> {
  const token = shimTokenFor(app);
  let results: unknown[];
  try {
    results = await post(ops, token, keepalive);
  } catch (error) {
    if (!token || (error as FirestoreError).code !== 'unauthenticated') throw error;
    // The whole request was refused because of the token: drop it and ask again as a guest.
    shimRejectToken(app, token);
    results = await post(ops, null, keepalive);
  }
  return results.map((result, index) => {
    const failure = (result as Result | null)?.error;
    if (!failure) return (result || {}) as Result;
    const error = toError(failure);
    dropTokenIfRefused(app, token, ops[index], error);
    return error;
  });
}

/* --------------------------------------------------------- one-shot reads */

interface Waiter {
  op: Op;
  resolve: (result: Result) => void;
  reject: (error: unknown) => void;
}

const readQueues = new Map<FirebaseApp, Waiter[]>();

/** Reads asked for in the same tick travel in one request (page load asks for several at once). */
function read(app: FirebaseApp, op: Op): Promise<Result> {
  return new Promise((resolve, reject) => {
    let queue = readQueues.get(app);
    if (!queue) {
      queue = [];
      readQueues.set(app, queue);
      setTimeout(() => flushReads(app), 0);
    }
    queue.push({ op, resolve, reject });
  });
}

function flushReads(app: FirebaseApp) {
  const queue = readQueues.get(app) || [];
  readQueues.delete(app);
  // The same read asked twice (cart and wishlist both load the profile) is sent once.
  const slots = new Map<string, Waiter[]>();
  for (const waiter of queue) {
    const key = JSON.stringify(waiter.op);
    const slot = slots.get(key);
    if (slot) slot.push(waiter);
    else slots.set(key, [waiter]);
  }
  const all = Array.from(slots.values());
  for (let start = 0; start < all.length; start += MAX_OPS_PER_REQUEST) {
    void sendReads(app, all.slice(start, start + MAX_OPS_PER_REQUEST));
  }
}

async function sendReads(app: FirebaseApp, slots: Waiter[][]) {
  let results: (Result | FirestoreError)[];
  try {
    results = await exchange(app, slots.map((slot) => slot[0].op));
  } catch (error) {
    slots.forEach((slot) => slot.forEach((waiter) => waiter.reject(error)));
    return;
  }
  slots.forEach((slot, index) => {
    const result = results[index];
    slot.forEach((waiter, position) => {
      if (result instanceof FirestoreError) waiter.reject(result);
      // Each caller gets its own copy, so one changing the data cannot surprise the other.
      else waiter.resolve(position === 0 ? result : JSON.parse(JSON.stringify(result)));
    });
  });
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const result = await read(ref.firestore.app, { op: 'get', path: ref.path });
  return documentSnapshot(ref, result.exists === true, result.data);
}

export async function getDocs(source: Query): Promise<QuerySnapshot> {
  const result = await read(source.firestore.app, { op: 'query', ...source.spec });
  return querySnapshot(source, result.docs);
}

/** Every read already comes from the server: there is no local cache. */
export const getDocsFromServer = getDocs;

/* ----------------------------------------------------------------- writes */

async function write(app: FirebaseApp, op: Op): Promise<Result> {
  // A save made while the page is being hidden or closed (cart, wishlist) is allowed to finish. Not for
  // 'add': if such a request were cut off and repeated, it would create a second document.
  const [result] = await exchange(app, [op], op.op !== 'add' && isHidden());
  if (result instanceof FirestoreError) throw result;
  refreshListeners();
  return result;
}

export async function setDoc(ref: DocumentReference, data: DocumentData, options?: SetOptions): Promise<void> {
  const op: Op = { op: 'set', path: ref.path, data };
  if (options?.merge) op.merge = true;
  await write(ref.firestore.app, op);
}

export async function updateDoc(ref: DocumentReference, data: DocumentData): Promise<void> {
  await write(ref.firestore.app, { op: 'update', path: ref.path, data });
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await write(ref.firestore.app, { op: 'delete', path: ref.path });
}

export async function addDoc(target: CollectionReference, data: DocumentData): Promise<DocumentReference> {
  const result = await write(target.firestore.app, { op: 'add', collection: target.id, data });
  return makeDoc(target.firestore, target.id, String(result.id));
}

/* ----------------------------------------------------------- transactions */

const MAX_TRANSACTION_ATTEMPTS = 5;

type TransactionWrite = { type: 'set' | 'update' | 'delete'; path: string; data?: DocumentData; merge?: boolean };

export class Transaction {
  /** Version of every document read (null = it did not exist): the commit fails if one changed since. */
  readonly preconditions: { path: string; version: number | null }[] = [];
  readonly writes: TransactionWrite[] = [];
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    if (this.writes.length > 0) throw invalid('Transactions require all reads to be executed before all writes.');
    const result = await read(this.firestore.app, { op: 'get', path: ref.path });
    const exists = result.exists === true;
    this.preconditions.push({ path: ref.path, version: exists ? Number(result.version) : null });
    return documentSnapshot(ref, exists, result.data);
  }

  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): this {
    this.writes.push({ type: 'set', path: ref.path, data, ...(options?.merge ? { merge: true } : {}) });
    return this;
  }

  update(ref: DocumentReference, data: DocumentData): this {
    this.writes.push({ type: 'update', path: ref.path, data });
    return this;
  }

  delete(ref: DocumentReference): this {
    this.writes.push({ type: 'delete', path: ref.path });
    return this;
  }
}

/**
 * Runs `update`, then commits its writes only if the documents it read are unchanged. When someone else
 * changed one in between ('aborted'), the function runs again on fresh data, up to 5 times like Firestore.
 */
export async function runTransaction<T>(firestore: Firestore, update: (transaction: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const transaction = new Transaction(firestore);
    const value = await update(transaction);
    if (transaction.writes.length === 0) return value;
    const [result] = await exchange(firestore.app, [{ op: 'commit', preconditions: transaction.preconditions, writes: transaction.writes }]);
    if (!(result instanceof FirestoreError)) {
      refreshListeners();
      return value;
    }
    if (result.code !== 'aborted' || attempt >= MAX_TRANSACTION_ATTEMPTS) throw result;
  }
}

/* -------------------------------------------------------------- listeners */

const ADMIN_POLL_MS = 10000;
const SHOPPER_POLL_MS = 60000;
const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const MAX_TARGETS_PER_WATCH = 50;

interface Listener {
  key: string;
  /** What to watch, in the gateway's shape (without `since`). */
  target: Record<string, unknown>;
  /** Version the listener already has; the server answers "unchanged" (one row read) when it still matches. */
  since: number | undefined;
  /** What was last handed to the app; undefined until the first snapshot. */
  fingerprint: string | undefined;
  /** Failed polls in a row. The app hears about the first one only. */
  failures: number;
  dueAt: number;
  /** Polled in its own op, because it made a shared watch op fail (e.g. this one target is not allowed). */
  alone: boolean;
  deliver: (answer: Result) => void;
  report: (error: FirestoreError) => void;
}

interface Group {
  app: FirebaseApp;
  listeners: Map<string, Listener>;
  timer: ReturnType<typeof setTimeout> | undefined;
  wake: ReturnType<typeof setTimeout> | undefined;
  /** The next poll includes listeners that are not due yet (after a write, on focus, on sign-in). */
  pollEveryone: boolean;
  busy: boolean;
  rerun: boolean;
  /** Bumped when the app's token changes, so an answer fetched with the old token is thrown away. */
  epoch: number;
}

/** One group per app, because one request can carry only one token. */
const groups = new Map<FirebaseApp, Group>();
let listenerCount = 0;
let pageEventsBound = false;

function groupFor(app: FirebaseApp): Group {
  let group = groups.get(app);
  if (!group) {
    group = { app, listeners: new Map(), timer: undefined, wake: undefined, pollEveryone: false, busy: false, rerun: false, epoch: 0 };
    groups.set(app, group);
  }
  return group;
}

const pollInterval = (app: FirebaseApp) => (isAdminToken(shimTokenFor(app)) ? ADMIN_POLL_MS : SHOPPER_POLL_MS);

/** Listeners added (or refreshes asked for) in the same tick end up in ONE watch request. */
function requestPoll(group: Group, everyone: boolean) {
  group.pollEveryone = group.pollEveryone || everyone;
  if (group.wake !== undefined) return;
  group.wake = setTimeout(() => {
    group.wake = undefined;
    void poll(group);
  }, 0);
}

/** After a write through the shim, on focus and when the tab is shown again: look for changes now. */
function refreshListeners() {
  groups.forEach((group) => {
    if (group.listeners.size > 0) requestPoll(group, true);
  });
}

/**
 * While the tab is hidden nothing is polled, except a listener still waiting for its first snapshot
 * (a page opened in a background tab must still load).
 */
const isDue = (listener: Listener, everyone: boolean, now: number, hidden: boolean) =>
  (everyone || listener.dueAt <= now) && (!hidden || listener.fingerprint === undefined);

function schedule(group: Group) {
  clearTimeout(group.timer);
  group.timer = undefined;
  const hidden = isHidden();
  let next = Infinity;
  group.listeners.forEach((listener) => {
    if (!hidden || listener.fingerprint === undefined) next = Math.min(next, listener.dueAt);
  });
  if (next === Infinity) return;
  group.timer = setTimeout(() => void poll(group), Math.max(0, next - Date.now()));
}

function fail(listener: Listener, error: FirestoreError) {
  listener.failures += 1;
  listener.dueAt = Date.now() + Math.min(RETRY_FIRST_MS * 2 ** (listener.failures - 1), RETRY_MAX_MS);
  if (listener.failures === 1) listener.report(error);
}

const fingerprintOf = (answer: Result) =>
  Array.isArray(answer.docs)
    ? answer.docs.map((row: Result) => `${row.id}@${row.version}`).join('|')
    : answer.exists === true ? `@${answer.version}` : 'missing';

function succeed(group: Group, listener: Listener, answer: Result) {
  listener.failures = 0;
  listener.alone = false;
  listener.dueAt = Date.now() + pollInterval(group.app);
  if (answer.unchanged === true) return;
  listener.since = typeof answer.version === 'number' ? answer.version : undefined;
  // A query is sent again whenever its collection changed; hand it to the app only if ITS documents did.
  const fingerprint = fingerprintOf(answer);
  if (fingerprint === listener.fingerprint) return;
  listener.fingerprint = fingerprint;
  listener.deliver(answer);
}

const watchOp = (listeners: Listener[]): Op => ({
  op: 'watch',
  targets: listeners.map((listener) => ({
    key: listener.key,
    ...listener.target,
    ...(listener.since === undefined ? {} : { since: listener.since }),
  })),
});

function applyWatchResult(group: Group, listeners: Listener[], result: Result | FirestoreError, token: string | null) {
  // Every listener of this op was unsubscribed while the request was on its way.
  if (listeners.length === 0) return;
  if (result instanceof FirestoreError) {
    if (listeners.length === 1) {
      listeners[0].alone = true;
      fail(listeners[0], result);
      return;
    }
    // One target spoiled the shared op and the answer does not say which: ask for each on its own, now.
    listeners.forEach((listener) => {
      listener.alone = true;
      listener.dueAt = 0;
    });
    group.rerun = true;
    return;
  }
  const answers = new Map<string, Result>();
  if (Array.isArray(result.targets)) result.targets.forEach((answer: Result) => answers.set(String(answer?.key), answer));
  for (const listener of listeners) {
    const answer = answers.get(listener.key);
    if (!answer) {
      fail(listener, new FirestoreError('unavailable', 'The store database did not answer for this listener.'));
    } else if (answer.error) {
      const error = toError(answer.error);
      dropTokenIfRefused(group.app, token, { op: 'watch' }, error);
      fail(listener, error);
    } else {
      succeed(group, listener, answer);
    }
  }
}

async function poll(group: Group) {
  if (group.busy) {
    group.rerun = true;
    return;
  }
  const everyone = group.pollEveryone;
  group.pollEveryone = false;
  const now = Date.now();
  const hidden = isHidden();
  const all = Array.from(group.listeners.values());
  const due = all.filter((listener) => isDue(listener, everyone, now, hidden));
  if (due.length === 0) {
    schedule(group);
    return;
  }
  // Listeners start at different moments (the admin dashboard adds some a few seconds after the others) and
  // would each keep their own rhythm: two requests per interval instead of one. So whenever a poll goes out,
  // every healthy listener rides along (an unchanged target costs the server one row read) and they all come
  // due together from then on. A listener backing off after a failure keeps its own, slower retry time.
  const chosen = hidden ? due : all.filter((listener) => listener.failures === 0 || due.includes(listener));

  // Normally a single op with every target (the gateway takes 50 per op); listeners that broke a shared op
  // go one per op.
  const shared = chosen.filter((listener) => !listener.alone);
  const batches: Listener[][] = [];
  for (let start = 0; start < shared.length; start += MAX_TARGETS_PER_WATCH) batches.push(shared.slice(start, start + MAX_TARGETS_PER_WATCH));
  chosen.filter((listener) => listener.alone).forEach((listener) => batches.push([listener]));

  group.busy = true;
  const epoch = group.epoch;
  const token = shimTokenFor(group.app);
  try {
    for (let start = 0; start < batches.length; start += MAX_OPS_PER_REQUEST) {
      const slice = batches.slice(start, start + MAX_OPS_PER_REQUEST);
      let results: (Result | FirestoreError)[];
      try {
        results = await exchange(group.app, slice.map(watchOp));
      } catch (error) {
        if (epoch === group.epoch) slice.flat().forEach((listener) => fail(listener, error as FirestoreError));
        continue;
      }
      // Signed in or out while the request was on its way: this answer belongs to the old session.
      if (epoch !== group.epoch) break;
      slice.forEach((listeners, index) => applyWatchResult(group, listeners.filter((listener) => group.listeners.has(listener.key)), results[index], token));
    }
  } finally {
    group.busy = false;
    if (group.rerun) {
      group.rerun = false;
      void poll(group);
    } else {
      schedule(group);
    }
  }
}

function bindPageEvents() {
  if (pageEventsBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  pageEventsBound = true;
  document.addEventListener('visibilitychange', () => {
    if (isHidden()) groups.forEach(schedule);
    else refreshListeners();
  });
  window.addEventListener('focus', refreshListeners);
  window.addEventListener('online', refreshListeners);
}

// A different token can see different data: start every listener of that app from scratch, at once.
shimOnTokenChange((app) => {
  const group = groups.get(app);
  if (!group) return;
  group.epoch += 1;
  group.listeners.forEach((listener) => {
    listener.since = undefined;
    listener.failures = 0;
    listener.alone = false;
    listener.dueAt = 0;
  });
  if (group.busy) group.rerun = true;
  else if (group.listeners.size > 0) requestPoll(group, true);
});

type Observer<T> = { next?: (snapshot: T) => void; error?: (error: FirestoreError) => void };

/** The app's callbacks run inside a guard: a listener must never throw into the polling loop. */
const guarded = <T>(callback: ((value: T) => void) | undefined, what: string) => (value: T) => {
  try {
    callback?.(value);
  } catch (error) {
    console.error(`Live ${what} handler failed:`, error);
  }
};

/**
 * Live updates by polling: the first snapshot arrives as soon as possible, later ones only when something
 * changed. A failed poll reports once through `onError` and keeps retrying with growing pauses.
 * Returns the unsubscribe function.
 */
export function onSnapshot(source: DocumentReference, onNext: ((snapshot: DocumentSnapshot) => void) | Observer<DocumentSnapshot>, onError?: (error: FirestoreError) => void): Unsubscribe;
export function onSnapshot(source: Query, onNext: ((snapshot: QuerySnapshot) => void) | Observer<QuerySnapshot>, onError?: (error: FirestoreError) => void): Unsubscribe;
export function onSnapshot(
  source: DocumentReference | Query,
  onNext: ((snapshot: any) => void) | Observer<any>,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const observer: Observer<any> = typeof onNext === 'function' ? { next: onNext, error: onError } : onNext;
  const next = guarded(observer.next?.bind(observer), 'data');
  const group = groupFor(source.firestore.app);
  listenerCount += 1;
  const key = `l${listenerCount}`;
  group.listeners.set(key, {
    key,
    target: source.type === 'document' ? { kind: 'doc', path: source.path } : { kind: 'query', ...source.spec },
    since: undefined,
    fingerprint: undefined,
    failures: 0,
    dueAt: 0,
    alone: false,
    deliver: source.type === 'document'
      ? (answer) => next(documentSnapshot(source, answer.exists === true, answer.data))
      : (answer) => next(querySnapshot(source, answer.docs)),
    report: guarded(observer.error?.bind(observer), 'error'),
  });
  bindPageEvents();
  requestPoll(group, false);
  return () => {
    group.listeners.delete(key);
    if (group.listeners.size === 0) schedule(group);
  };
}
