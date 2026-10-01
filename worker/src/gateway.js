// POST /api/db: the browser's only way to the document store. It takes the place of the Firestore client
// SDK talking to Firestore: every operation is checked against rules.js (the port of firestore.rules) for
// the identity in the Bearer token before anything is read back or written.
import { createStore } from './docstore.js';
import { getDB } from './env.js';
import { allows, allowsQuery } from './rules.js';
import { verifyIdToken } from './tokens.js';

const MAX_BODY_BYTES = 200 * 1024;
const MAX_OPS = 20;
// Shoppers never need more than this from one query; the admin lists whole collections (orders, products).
const MAX_QUERY_DOCS = 500;
const MAX_WATCH_TARGETS = 50;
const MAX_COMMIT_WRITES = 20;
const MAX_WHERE_CLAUSES = 10;
const MAX_ORDER_BY = 3;
// Firestore's own limit for `in` lists
const MAX_IN_VALUES = 30;
// A single write is retried when another write slipped in between the rules check and the commit.
const WRITE_ATTEMPTS = 3;

const QUERY_OPERATORS = ['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'];
const COLLECTION_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// Field names end up inside json_extract(data, '$.field') in the store, so only plain identifiers pass.
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
// Firestore reserves names of the form __name__ (this also keeps "__proto__" out of every object we build).
const RESERVED_NAME = /^__.*__$/;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const ANONYMOUS = { admin: false, email: '', uid: '' };

/** An error whose code and message are safe to show to the browser. */
class GatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalid = (message) => new GatewayError('invalid-argument', message);
const denied = () => new GatewayError('permission-denied', 'Missing or insufficient permissions.');

const STORE_ERROR_MESSAGES = {
  'not-found': 'No document to update.',
  'already-exists': 'Document already exists.',
  aborted: 'The data changed while it was being saved. Please try again.',
  'invalid-argument': 'Invalid request.',
};

/** Only our own messages and the store's well-known codes reach the browser; everything else is logged here. */
const publicError = (error, opName) => {
  if (error instanceof GatewayError) return { code: error.code, message: error.message };
  if (Object.hasOwn(STORE_ERROR_MESSAGES, String(error?.code))) {
    return { code: error.code, message: STORE_ERROR_MESSAGES[error.code] };
  }
  console.error(`[api/db] ${opName} failed:`, error?.message || error);
  return { code: 'unavailable', message: 'The service is temporarily unavailable. Please try again.' };
};

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSentinel = (value) => isMap(value) && typeof value.__op === 'string';
const isScalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' },
});

const requestError = (status, code, message) => json(status, { error: { code, message } });

/** Browsers always send Origin on POST, so a missing or foreign Origin is rejected (as api/_lib/http.js does). */
const isSameOrigin = (request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

/**
 * Identity from `Authorization: Bearer <token>`, same shape as getIdentity in api/_lib/http.js.
 * Admin tokens are also checked against revocation (logout / "sign out everywhere").
 * Only our own claims count: a Google credential verifies but carries neither, so it stays a plain visitor.
 */
const resolveIdentity = async (request) => {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return ANONYMOUS;
  try {
    let decoded = await verifyIdToken(match[1], false);
    if (decoded.admin === true) decoded = await verifyIdToken(match[1], true);
    return {
      admin: decoded.admin === true,
      email: typeof decoded.customerEmail === 'string' ? decoded.customerEmail : '',
      uid: typeof decoded.uid === 'string' ? decoded.uid : '',
    };
  } catch {
    return ANONYMOUS;
  }
};

// ---- request parsing (everything from the browser is untrusted) ----

const checkCollection = (name) => {
  if (typeof name !== 'string' || !COLLECTION_NAME.test(name)) throw invalid('Invalid collection name.');
  return name;
};

/** A document path is always `collection/id`; deeper paths have no rule, so they are denied like in Firestore. */
const parsePath = (path) => {
  if (typeof path !== 'string') throw invalid('A document path is required.');
  const parts = path.split('/');
  if (parts.length > 2 && parts.length % 2 === 0 && parts.every(Boolean)) throw denied();
  if (parts.length !== 2) throw invalid('A document path must be "collection/id".');
  const [collection, id] = parts;
  checkCollection(collection);
  if (!id || id.length > 500 || id === '.' || id === '..' || RESERVED_NAME.test(id)) throw invalid('Invalid document id.');
  return { collection, id };
};

const checkFieldNames = (value) => {
  if (Array.isArray(value)) {
    value.forEach(checkFieldNames);
  } else if (isMap(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (!key || RESERVED_NAME.test(key)) throw invalid('Invalid field name.');
      checkFieldNames(child);
    }
  }
};

const parseData = (data, dottedKeys) => {
  if (!isMap(data) || isSentinel(data)) throw invalid('Document data must be an object.');
  checkFieldNames(data);
  // update() keys may be dotted paths: every segment has to be a usable field name too
  if (dottedKeys && Object.keys(data).some((key) => key.split('.').some((part) => !part || RESERVED_NAME.test(part)))) {
    throw invalid('Invalid field path.');
  }
  return data;
};

/**
 * One write as sent by the browser -> our internal form. `kind` is the operation name for a single write
 * and the write's `type` inside a commit (src/shims/firebase-firestore.ts). Only `path` says which document.
 */
const parseWrite = (write, kind) => {
  if (!isMap(write)) throw invalid('Invalid write.');
  const target = parsePath(write.path);
  if (kind === 'delete') return { kind, ...target };
  if (kind === 'update') return { kind, ...target, data: parseData(write.data, true) };
  if (kind === 'set') return { kind, ...target, data: parseData(write.data, false), merge: write.merge === true };
  throw invalid('Unknown write operation.');
};

const parseQuery = (source, identity) => {
  const collection = checkCollection(source.collection);
  const where = source.where ?? [];
  const orderBy = source.orderBy ?? [];
  if (!Array.isArray(where) || where.length > MAX_WHERE_CLAUSES) throw invalid('Invalid query filter.');
  if (!Array.isArray(orderBy) || orderBy.length > MAX_ORDER_BY) throw invalid('Invalid query order.');
  for (const clause of where) {
    if (!Array.isArray(clause) || clause.length !== 3) throw invalid('Invalid query filter.');
    const [field, operator, value] = clause;
    if (typeof field !== 'string' || !FIELD_PATH.test(field) || !QUERY_OPERATORS.includes(operator)) throw invalid('Invalid query filter.');
    const valueOk = operator === 'in'
      ? Array.isArray(value) && value.length >= 1 && value.length <= MAX_IN_VALUES && value.every(isScalar)
      : isScalar(value);
    if (!valueOk) throw invalid('Invalid query filter value.');
  }
  const order = orderBy.map((clause) => {
    if (!Array.isArray(clause)) throw invalid('Invalid query order.');
    const [field, direction = 'asc'] = clause;
    const fieldOk = typeof field === 'string' && (field === '__name__' || FIELD_PATH.test(field));
    if (!fieldOk || !['asc', 'desc'].includes(direction)) throw invalid('Invalid query order.');
    return [field, direction];
  });
  let limit = source.limit ?? undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw invalid('Invalid query limit.');
  if (!identity.admin) limit = Math.min(limit ?? MAX_QUERY_DOCS, MAX_QUERY_DOCS);
  return { collection, where, orderBy: order, ...(limit === undefined ? {} : { limit }) };
};

/** `since` is the version the browser already holds; anything else means "send it to me". */
const sinceOf = (target) => (Number.isInteger(target.since) && target.since >= 0 ? target.since : null);

// ---- what a write would leave behind (rules see the document as it would be after the write) ----

const mergeMaps = (base, patch) => {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isSentinel(value) && value.__op === 'delete') delete merged[key];
    // an empty map is a value of its own and replaces what was there (same as the store)
    else if (isMap(value) && !isSentinel(value) && Object.keys(value).length) merged[key] = mergeMaps(isMap(merged[key]) ? merged[key] : {}, value);
    else merged[key] = value;
  }
  return merged;
};

const setAtPath = (base, segments, value) => {
  const [head, ...rest] = segments;
  const copy = { ...base };
  if (rest.length) copy[head] = setAtPath(isMap(copy[head]) ? copy[head] : {}, rest, value);
  else if (isSentinel(value) && value.__op === 'delete') delete copy[head];
  else copy[head] = value;
  return copy;
};

/**
 * The document as this write would leave it. Transform sentinels (increment, serverTimestamp, ...) are left
 * in place unresolved: a rule that checks such a field's type then denies, which errs on the strict side.
 */
const dataAfter = (write, existing) => {
  if (write.kind === 'update') {
    return Object.entries(write.data).reduce((doc, [path, value]) => setAtPath(doc, path.split('.'), value), existing || {});
  }
  return mergeMaps(write.merge && existing ? existing : {}, write.data);
};

const newDocId = () => {
  // 62 symbols: bytes above 247 are skipped so every symbol stays equally likely
  let id = '';
  while (id.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < 248 && id.length < 20) id += ID_ALPHABET[byte % 62];
    }
  }
  return id;
};

// ---- operations ----

const publicDoc = (doc) => ({ id: doc.id, data: doc.data, version: doc.version });

const docResult = (id, doc) => (doc
  ? { exists: true, id, data: doc.data, version: doc.version }
  : { exists: false, id, data: null, version: 0 });

const readDoc = (identity, target, doc) => {
  if (!allows(identity, target.collection, target.id, 'get', { existing: doc ? doc.data : null })) throw denied();
  return docResult(target.id, doc);
};

/** Runs a list query. The whole query is refused if even one returned document may not be read. */
const runQuery = async (store, identity, query) => {
  const docs = await store.query(query);
  for (const doc of docs) {
    if (!allows(identity, query.collection, doc.id, 'list', { existing: doc.data })) throw denied();
  }
  return docs.map(publicDoc);
};

const queryOp = async (store, identity, op) => {
  const query = parseQuery(op, identity);
  if (!allowsQuery(identity, query.collection, query)) throw denied();
  // Version first: a write landing during the query then shows up as a newer version on the next poll.
  const version = await store.collectionVersion(query.collection);
  return { docs: await runQuery(store, identity, query), version };
};

/**
 * Checks every write against the rules using the documents as they are now, then commits all of them
 * atomically. Each document's version at check time goes in as a precondition, so the commit cannot land
 * on a document that changed after its rule was evaluated (the store answers `aborted` instead).
 */
const commitWrites = async (store, identity, writes, clientPreconditions) => {
  const current = await store.getMany(writes.map(({ collection, id }) => ({ collection, id })));
  const storeWrites = [];
  const preconditions = [...clientPreconditions];
  writes.forEach((write, index) => {
    const existing = current[index];
    const operation = write.kind === 'set' ? (existing ? 'update' : 'create') : write.kind;
    const incoming = write.kind === 'delete' ? null : dataAfter(write, existing ? existing.data : null);
    if (!allows(identity, write.collection, write.id, operation, { existing: existing ? existing.data : null, incoming })) throw denied();
    if (write.kind === 'update' && !existing) throw new GatewayError('not-found', 'No document to update.');
    if (!clientPreconditions.some((p) => p.collection === write.collection && p.id === write.id)) {
      preconditions.push({ collection: write.collection, id: write.id, version: existing ? existing.version : null });
    }
    // Deleting a document that is not there is a successful no-op, as in Firestore.
    if (write.kind === 'delete' && !existing) return;
    const { kind, merge, ...rest } = write;
    storeWrites.push({ type: kind, ...rest, ...(merge ? { merge: true } : {}) });
  });
  if (storeWrites.length) await store.commit(storeWrites, { preconditions });
};

const writeOp = async (store, identity, op) => {
  const write = parseWrite(op, op.op);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await commitWrites(store, identity, [write], []);
      return { ok: true };
    } catch (error) {
      if (error?.code !== 'aborted' || attempt >= WRITE_ATTEMPTS) throw error;
    }
  }
};

const addOp = async (store, identity, op) => {
  const collection = checkCollection(op.collection);
  const data = parseData(op.data, false);
  const id = newDocId();
  if (!allows(identity, collection, id, 'create', { incoming: dataAfter({ kind: 'set', data }, null) })) throw denied();
  await store.commit([{ type: 'create', collection, id, data }]);
  return { id };
};

/** The browser's runTransaction: its reads come back as preconditions; a stale one answers `aborted`. */
const commitOp = async (store, identity, op) => {
  const rawWrites = op.writes ?? [];
  const rawPreconditions = op.preconditions ?? [];
  if (!Array.isArray(rawWrites) || rawWrites.length < 1 || rawWrites.length > MAX_COMMIT_WRITES) throw invalid('Invalid writes.');
  if (!Array.isArray(rawPreconditions) || rawPreconditions.length > MAX_COMMIT_WRITES) throw invalid('Invalid preconditions.');
  const writes = rawWrites.map((write) => parseWrite(write, write?.type ?? write?.op));
  const paths = new Set(writes.map(({ collection, id }) => `${collection}/${id}`));
  if (paths.size !== writes.length) throw invalid('A document can be written only once per commit.');
  const preconditions = rawPreconditions.map((precondition) => {
    if (!isMap(precondition)) throw invalid('Invalid precondition.');
    const { version = null } = precondition;
    if (version !== null && (!Number.isInteger(version) || version < 0)) throw invalid('Invalid precondition version.');
    // version 0 is what a read of a missing document returned
    return { ...parsePath(precondition.path), version: version || null };
  });
  await commitWrites(store, identity, writes, preconditions);
  return { ok: true };
};

const watchDocTarget = (identity, target, { collection, id, doc }) => {
  const result = readDoc(identity, { collection, id }, doc);
  if (sinceOf(target) === result.version) return { key: target.key, unchanged: true };
  return { key: target.key, ...result };
};

const watchQueryTarget = async (store, identity, target) => {
  const query = parseQuery(target, identity);
  if (!allowsQuery(identity, query.collection, query)) throw denied();
  const version = await store.collectionVersion(query.collection);
  // Nothing in the collection was written since the browser's copy: one row read, no query.
  if (sinceOf(target) === version) return { key: target.key, unchanged: true };
  return { key: target.key, version, docs: await runQuery(store, identity, query) };
};

/**
 * All of a page's listeners in one request. A target that fails (for example a listener the visitor has
 * no right to) reports its own error so the other listeners keep working.
 */
const watchOp = async (store, identity, op) => {
  const targets = op.targets;
  if (!Array.isArray(targets) || targets.length > MAX_WATCH_TARGETS) throw invalid('Invalid watch targets.');
  for (const target of targets) {
    if (!isMap(target) || typeof target.key !== 'string' || target.key.length > 200) throw invalid('Every watch target needs a key.');
    if (target.kind !== 'doc' && target.kind !== 'query') throw invalid('Unknown watch target kind.');
  }

  // Document targets are fetched together: one statement instead of one per listener.
  const docTargets = [];
  const failures = new Map();
  targets.forEach((target, index) => {
    if (target.kind !== 'doc') return;
    try {
      docTargets.push({ index, ...parsePath(target.path) });
    } catch (error) {
      failures.set(index, error);
    }
  });
  const docs = await store.getMany(docTargets.map(({ collection, id }) => ({ collection, id })));
  const located = new Map(docTargets.map((entry, position) => [entry.index, { ...entry, doc: docs[position] }]));

  const results = [];
  for (const [index, target] of targets.entries()) {
    try {
      if (failures.has(index)) throw failures.get(index);
      results.push(target.kind === 'doc'
        ? watchDocTarget(identity, target, located.get(index))
        : await watchQueryTarget(store, identity, target));
    } catch (error) {
      results.push({ key: target.key, error: publicError(error, 'watch') });
    }
  }
  return { targets: results };
};

const getOp = async (store, identity, op) => {
  const target = parsePath(op.path);
  return readDoc(identity, target, await store.getDoc(target.collection, target.id));
};

const OPERATIONS = {
  get: getOp,
  query: queryOp,
  set: writeOp,
  update: writeOp,
  delete: writeOp,
  add: addOp,
  commit: commitOp,
  watch: watchOp,
};

const readBody = async (request) => {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return { tooLarge: true };
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return { tooLarge: true };
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { body: null };
  }
};

/** Entry point for POST /api/db (see migration/BUILD-SPEC.md section 7). Always answers with JSON. */
export const handleDb = async (request, env, ctx) => {
  if (request.method !== 'POST') return requestError(405, 'invalid-argument', 'Method not allowed.');
  if (!isSameOrigin(request)) return requestError(403, 'permission-denied', 'Invalid request origin.');
  const { body, tooLarge } = await readBody(request);
  if (tooLarge) return requestError(413, 'invalid-argument', 'Request is too large.');
  const ops = body?.ops;
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > MAX_OPS) {
    return requestError(400, 'invalid-argument', `Send between 1 and ${MAX_OPS} operations.`);
  }

  try {
    const identity = await resolveIdentity(request);
    const store = createStore(getDB());
    const results = [];
    // In order, one after the other: a later operation may read what an earlier one wrote.
    for (const op of ops) {
      const opName = isMap(op) && Object.hasOwn(OPERATIONS, op.op) ? op.op : '';
      try {
        if (!opName) throw invalid('Unknown operation.');
        results.push(await OPERATIONS[opName](store, identity, op));
      } catch (error) {
        results.push({ error: publicError(error, opName || 'request') });
      }
    }
    return json(200, { results });
  } catch (error) {
    const { code, message } = publicError(error, 'request');
    return requestError(503, code, message);
  }
};
