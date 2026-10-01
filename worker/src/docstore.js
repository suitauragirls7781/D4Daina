// Document store on Cloudflare D1: one row per former Firestore document (worker/schema.sql).
//
// How a commit stays atomic. D1 has no interactive transactions, only batch(), which runs its
// statements as one SQLite transaction. So a commit is:
//   1. read every document the writes depend on (merge, update, create, sentinels, preconditions),
//   2. work out the final documents in JavaScript,
//   3. send ONE batch: guard statements first, then the writes, then the collection version bumps.
// A guard statement inserts a row with ok = 0 into tx_guard only when a document (or collection) is no
// longer at the version read in step 1. That row violates CHECK (ok = 1), the statement fails, and D1
// rolls the whole batch back, so nothing is written. Proven against real local D1 in
// worker/test/real-d1.test.mjs. tx_guard therefore always stays empty.
// After a guard failure the commit starts again from step 1: if a precondition given by the caller no
// longer holds it throws 'aborted' (the caller's transaction re-runs), otherwise it simply retries
// with the fresh data, which is what makes concurrent increments both land.
//
// Versions. A new row gets (collection version + 1) and every later write adds 1, so a document that is
// deleted and created again never repeats a version an older reader may still hold.

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StoreError';
    this.code = code; // 'not-found' | 'already-exists' | 'aborted' | 'invalid-argument'
  }
}

const invalid = (message) => new StoreError('invalid-argument', message);

// Fields that have an index in worker/schema.sql, per collection. The index name is
// docs_<collection>_<field>. A test keeps this list and schema.sql in step.
export const INDEXED_FIELDS = {
  orders: ['customerEmail', 'attemptKey', 'razorpayOrderId', 'couponCode', 'customerMobile'],
  reviews: ['productId'],
  stock_alerts: ['productId'],
  review_photos: ['reviewId'],
  visitor_sessions: ['lastActive'],
  inventory_log: ['productId', 'at'],
  leads: ['createdAt'],
};

const MAX_COMMIT_ATTEMPTS = 8;
const IDS_PER_STATEMENT = 90;       // D1 allows 100 bound parameters per statement
const CONDITIONS_PER_GUARD = 30;    // at most 3 parameters each
const SENTINEL_OPS = ['increment', 'arrayUnion', 'arrayRemove', 'delete', 'serverTimestamp'];
const COLLECTION_NAME = /^[A-Za-z0-9_-]{1,100}$/;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const DOC_ID_FIELD = '__name__';

const keyOf = (collection, id) => `${collection}/${id}`;

const checkDocAddress = (collection, id) => {
  if (typeof collection !== 'string' || !COLLECTION_NAME.test(collection)) throw invalid(`Invalid collection name: ${String(collection)}`);
  if (typeof id !== 'string' || !id || id.includes('/')) throw invalid(`Invalid document id in ${collection}: ${String(id)}`);
};

// ---------------------------------------------------------------------------------------------------
// Values: what may be stored, and how sentinels are resolved
// ---------------------------------------------------------------------------------------------------

const SKIP = Symbol('skip');     // undefined: the field is left out / left alone
const REMOVE = Symbol('remove'); // { __op: 'delete' }: the field is removed

const isSentinel = (value) => value !== null && typeof value === 'object' && typeof value.__op === 'string';
const isTimestampLike = (value) => value instanceof Date || typeof value?.toDate === 'function';
const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isTimestampLike(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const hasSentinel = (value) => {
  if (isSentinel(value)) return true;
  if (!isPlainObject(value)) return false;
  return Object.values(value).some(hasSentinel);
};

// Equality the way Firestore compares array elements: by value, map key order ignored.
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
};

const isoOf = (value) => {
  const date = value instanceof Date ? value : value.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw invalid('Invalid date value.');
  return date.toISOString();
};

const applySentinel = (sentinel, existing, now) => {
  switch (sentinel.__op) {
    case 'increment': {
      const n = sentinel.n;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw invalid('increment needs a finite number.');
      return typeof existing === 'number' ? existing + n : n;
    }
    case 'arrayUnion': {
      const next = Array.isArray(existing) ? [...existing] : [];
      for (const value of storedList(sentinel.values, now)) {
        if (!next.some((item) => deepEqual(item, value))) next.push(value);
      }
      return next;
    }
    case 'arrayRemove': {
      const values = storedList(sentinel.values, now);
      return Array.isArray(existing) ? existing.filter((item) => !values.some((value) => deepEqual(item, value))) : [];
    }
    case 'serverTimestamp':
      return now;
    default:
      throw invalid(`Unknown sentinel: ${sentinel.__op}`);
  }
};

// Turns a caller value into what is stored (plain JSON), resolving sentinels against the value that is
// stored now at the same place. Returns SKIP for undefined and REMOVE for the delete sentinel.
const resolve = (value, existing, now) => {
  if (value === undefined) return SKIP;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid('NaN and Infinity cannot be stored.');
    return value;
  }
  if (typeof value !== 'object') throw invalid(`A ${typeof value} cannot be stored.`);
  if (isTimestampLike(value)) return isoOf(value);
  if (Array.isArray(value)) return storedList(value, now);
  if (isSentinel(value)) {
    if (!SENTINEL_OPS.includes(value.__op)) throw invalid(`Unknown sentinel: ${value.__op}`);
    return value.__op === 'delete' ? REMOVE : applySentinel(value, existing, now);
  }
  if (!isPlainObject(value)) throw invalid('Only plain objects, arrays, strings, numbers, booleans, null and dates can be stored.');
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const stored = resolve(child, isPlainObject(existing) ? existing[key] : undefined, now);
    if (stored !== SKIP && stored !== REMOVE) out[key] = stored;
  }
  return out;
};

function storedList(values, now) {
  if (!Array.isArray(values)) throw invalid('Expected an array.');
  return values.map((item) => {
    if (isSentinel(item)) throw invalid('Sentinels are not allowed inside arrays.');
    const stored = resolve(item, undefined, now);
    return stored === SKIP ? null : stored;
  });
}

const splitPath = (path) => {
  const parts = String(path).split('.');
  if (parts.some((part) => !part)) throw invalid(`Invalid field path: ${path}`);
  return parts;
};

const getPath = (object, parts) => parts.reduce((value, part) => (isPlainObject(value) ? value[part] : undefined), object);

// Writes one resolved value at a (dotted) path. Parents that are not maps are replaced by maps, as
// Firestore does.
const putPath = (object, parts, stored) => {
  if (stored === SKIP) return;
  let parent = object;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(parent[part])) {
      if (stored === REMOVE) return;
      parent[part] = {};
    }
    parent = parent[part];
  }
  const leaf = parts[parts.length - 1];
  if (stored === REMOVE) delete parent[leaf];
  else parent[leaf] = stored;
};

// set(..., { merge: true }): maps are merged key by key, everything else (arrays included) is replaced.
// An empty map is a value of its own and replaces what was there.
const mergeInto = (target, patch, now) => {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && !isSentinel(value) && Object.keys(value).length > 0) {
      target[key] = mergeInto(isPlainObject(target[key]) ? target[key] : {}, value, now);
    } else {
      putPath(target, [key], resolve(value, target[key], now));
    }
  }
  return target;
};

// The document after one write. `current` is the stored data (or null) and is not modified.
const applyWrite = (current, write, now) => {
  const where = `${write.collection}/${write.id}`;
  if (write.type === 'delete') return null;
  if (!isPlainObject(write.data)) throw invalid(`Document data for ${where} must be a plain object.`);
  switch (write.type) {
    case 'create':
      if (current) throw new StoreError('already-exists', `Document already exists: ${where}`);
      return resolve(write.data, undefined, now);
    case 'update': {
      if (!current) throw new StoreError('not-found', `No document to update: ${where}`);
      const next = structuredClone(current);
      for (const [path, value] of Object.entries(write.data)) {
        const parts = splitPath(path);
        putPath(next, parts, resolve(value, getPath(current, parts), now));
      }
      return next;
    }
    case 'set': {
      const mergeFields = Array.isArray(write.merge) ? write.merge : write.mergeFields;
      if (Array.isArray(mergeFields)) {
        const next = structuredClone(current || {});
        for (const path of mergeFields) {
          const parts = splitPath(path);
          const value = getPath(write.data, parts);
          if (value === undefined) throw invalid(`mergeFields names "${path}" but the data has no such field.`);
          putPath(next, parts, resolve(value, getPath(next, parts), now));
        }
        return next;
      }
      if (write.merge === true) return mergeInto(structuredClone(current || {}), write.data, now);
      return resolve(write.data, current || undefined, now);
    }
    default:
      throw invalid(`Unknown write type: ${String(write.type)}`);
  }
};

// A plain set or a delete needs nothing from the stored document; everything else does.
const dependsOnStored = (write) => {
  if (write.type === 'delete') return false;
  if (write.type !== 'set') return true;
  return Boolean(write.merge) || Array.isArray(write.mergeFields) || hasSentinel(write.data);
};

// ---------------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------------

const fieldExpr = (field) => {
  if (field === DOC_ID_FIELD) return 'id';
  if (typeof field !== 'string' || !FIELD_PATH.test(field)) throw invalid(`Invalid field name: ${String(field)}`);
  return `json_extract(data, '$.${field}')`; // exactly the expression the indexes are built on
};

const jsonType = (field) => `json_type(data, '$.${field}')`;
const JSON_TYPES = { string: "= 'text'", number: "IN ('integer', 'real')" };
const isPrimitive = (value) => ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value));
const bindable = (value) => (typeof value === 'boolean' ? Number(value) : value);
const RANGE_OPS = ['<', '<=', '>', '>='];

// One filter as SQL. Firestore never matches across types (the string "5" is not the number 5, true is
// not 1, a list is not its JSON text), which json_extract alone would blur, so every comparison also
// pins the JSON type of the stored value. The comparison comes first so the index can do the search.
const filterSql = (field, op, value, params) => {
  const expr = fieldExpr(field);
  const isId = field === DOC_ID_FIELD;
  const compare = (operator, operand) => {
    if (isId && typeof operand !== 'string') throw invalid('Document ids are compared with strings.');
    params.push(bindable(operand));
    if (isId) return `${expr} ${operator} ?`;
    const type = typeof operand === 'boolean' ? `= '${operand}'` : JSON_TYPES[typeof operand];
    return `(${expr} ${operator} ? AND ${jsonType(field)} ${type})`;
  };

  if (op === '==' || op === '!=') {
    if (value !== null && !isPrimitive(value)) throw invalid(`Unsupported value for ${field} ${op}.`);
    if (value === null && isId) throw invalid('Document ids are compared with strings.');
    const equal = value === null ? `${jsonType(field)} = 'null'` : compare('=', value);
    if (op === '==') return equal;
    // "not equal" in Firestore still needs the field to be there and not null
    return isId ? `NOT (${equal})` : `(${jsonType(field)} <> 'null' AND NOT ${equal})`;
  }
  if (RANGE_OPS.includes(op)) {
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) throw invalid(`Unsupported value for ${field} ${op}.`);
    return compare(op, value);
  }
  if (op === 'in') {
    if (!Array.isArray(value) || value.length === 0 || value.length > 30 || !value.every(isPrimitive)) throw invalid(`"in" needs 1 to 30 plain values (${field}).`);
    return `(${value.map((item) => compare('=', item)).join(' OR ')})`;
  }
  if (op === 'array-contains') {
    if (isId || !isPrimitive(value)) throw invalid(`Unsupported value for ${field} array-contains.`);
    params.push(bindable(value));
    const elementType = typeof value === 'boolean' ? ` AND json_each.type = '${value}'` : '';
    return `(${jsonType(field)} = 'array' AND EXISTS (SELECT 1 FROM json_each(data, '$.${field}') WHERE json_each.value = ?${elementType}))`;
  }
  throw invalid(`Unsupported query operator: ${String(op)}`);
};

// Names the index to use, if this collection has one for a field of the query. Without statistics the
// SQLite planner often prefers walking the whole collection by primary key, and D1 bills rows scanned,
// so the choice is made here instead: an equality first, then "in", then a range or the leading sort.
const pickIndex = (collection, where, orderBy) => {
  const indexed = INDEXED_FIELDS[collection] || [];
  const withOp = (test) => where.find(([field, op]) => test(op) && indexed.includes(field))?.[0];
  const field = withOp((op) => op === '==') || withOp((op) => op === 'in') || withOp((op) => RANGE_OPS.includes(op))
    || (orderBy.length && indexed.includes(orderBy[0][0]) ? orderBy[0][0] : null);
  return field ? `docs_${collection}_${field}` : null;
};

// Exported so the tests can check the query plans of the hot queries.
export const buildQuery = ({ collection, where = [], orderBy = [], limit, select } = {}) => {
  if (typeof collection !== 'string' || !COLLECTION_NAME.test(collection)) throw invalid(`Invalid collection name: ${String(collection)}`);
  if (!Array.isArray(where) || !Array.isArray(orderBy)) throw invalid('where and orderBy must be arrays.');
  const params = [];
  // The collection is a checked literal (not a parameter) so SQLite can match the per-collection indexes.
  const conditions = [`collection = '${collection}'`];
  for (const filter of where) {
    if (!Array.isArray(filter) || filter.length !== 3) throw invalid('A filter is [field, op, value].');
    conditions.push(filterSql(filter[0], filter[1], filter[2], params));
  }

  // Firestore sorts by the inequality field when no order is given, returns only documents that have
  // every sort field, and breaks ties by document id in the direction of the last sort.
  let sorts = orderBy.map((entry) => {
    if (!Array.isArray(entry)) throw invalid('A sort is [field, direction].');
    const direction = entry[1] === undefined ? 'asc' : entry[1];
    if (direction !== 'asc' && direction !== 'desc') throw invalid(`Invalid sort direction: ${String(direction)}`);
    return [entry[0], direction];
  });
  if (sorts.length === 0) {
    const ranged = where.find(([field, op]) => (RANGE_OPS.includes(op) || op === '!=') && field !== DOC_ID_FIELD);
    if (ranged) sorts = [[ranged[0], 'asc']];
  }
  for (const [field] of sorts) {
    if (field !== DOC_ID_FIELD) conditions.push(`${fieldExpr(field)} IS NOT NULL`);
  }
  if (!sorts.some(([field]) => field === DOC_ID_FIELD)) sorts.push([DOC_ID_FIELD, sorts.length ? sorts[sorts.length - 1][1] : 'asc']);

  const index = pickIndex(collection, where, sorts);
  // select() with no fields asks for ids only: do not ship the JSON at all.
  const columns = Array.isArray(select) && select.length === 0 ? 'id, version' : 'id, data, version';
  let sql = `SELECT ${columns} FROM docs${index ? ` INDEXED BY ${index}` : ''} WHERE ${conditions.join(' AND ')}`
    + ` ORDER BY ${sorts.map(([field, direction]) => `${fieldExpr(field)} ${direction.toUpperCase()}`).join(', ')}`;
  if (limit !== undefined && limit !== null) {
    if (!Number.isInteger(limit) || limit < 1) throw invalid('limit must be a positive whole number.');
    sql += ' LIMIT ?';
    params.push(limit);
  }
  return { sql, params };
};

const project = (data, select) => {
  if (!Array.isArray(select)) return data;
  const out = {};
  for (const field of select) {
    const parts = splitPath(field);
    const value = getPath(data, parts);
    if (value !== undefined) putPath(out, parts, value);
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------------

const UPSERT_SQL = `INSERT INTO docs (collection, id, data, version, created_at, updated_at)
VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(version), 0) + 1 FROM collection_versions WHERE collection = ?1), ?4, ?4)
ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, version = docs.version + 1, updated_at = excluded.updated_at`;
const DELETE_SQL = 'DELETE FROM docs WHERE collection = ?1 AND id = ?2';
const BUMP_SQL = `INSERT INTO collection_versions (collection, version, updated_at) VALUES (?1, 1, ?2)
ON CONFLICT (collection) DO UPDATE SET version = collection_versions.version + 1, updated_at = excluded.updated_at`;

const isGuardFailure = (error) => /CHECK constraint failed/i.test(String(error?.message || ''));
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));
// Wait before retry number `attempt` (2..8): random, and doubling (up to 20, 40, ... 640 ms), so writers
// that collided on one document spread out instead of colliding again.
const pause = (attempt) => new Promise((done) => { setTimeout(done, Math.random() * 20 * 2 ** Math.min(attempt - 2, 5)); });

export const createStore = (d1) => {
  const runAll = async (statements) => {
    if (statements.length === 0) return [];
    if (statements.length === 1) return [await statements[0].all()];
    return d1.batch(statements);
  };

  // Reads documents by primary key and collection versions, all in one round trip.
  // -> { docs: Map 'collection/id' -> { id, data, version }, versions: Map collection -> integer }
  const readState = async (addresses, collections = []) => {
    const idsByCollection = new Map();
    for (const { collection, id } of addresses) {
      checkDocAddress(collection, id);
      if (!idsByCollection.has(collection)) idsByCollection.set(collection, new Set());
      idsByCollection.get(collection).add(id);
    }
    const statements = [];
    const owners = []; // which collection each document statement reads
    for (const [collection, ids] of idsByCollection) {
      for (const part of chunk([...ids], IDS_PER_STATEMENT)) {
        statements.push(d1.prepare(`SELECT id, data, version FROM docs WHERE collection = ? AND id IN (${part.map(() => '?').join(', ')})`).bind(collection, ...part));
        owners.push(collection);
      }
    }
    for (const part of chunk([...new Set(collections)], IDS_PER_STATEMENT)) {
      statements.push(d1.prepare(`SELECT collection, version FROM collection_versions WHERE collection IN (${part.map(() => '?').join(', ')})`).bind(...part));
    }
    const results = await runAll(statements);
    const docs = new Map();
    const versions = new Map(collections.map((collection) => [collection, 0]));
    results.forEach((result, index) => {
      for (const row of result.results) {
        if (index < owners.length) docs.set(keyOf(owners[index], row.id), { id: row.id, data: JSON.parse(row.data), version: row.version });
        else versions.set(row.collection, row.version);
      }
    });
    return { docs, versions };
  };

  const guardStatements = (conditions) => chunk(conditions, CONDITIONS_PER_GUARD).map((part) => d1
    .prepare(`INSERT INTO tx_guard (ok) SELECT 0 WHERE NOT (${part.map((condition) => condition.sql).join(' AND ')})`)
    .bind(...part.flatMap((condition) => condition.params)));

  return {
    async getDoc(collection, id) {
      checkDocAddress(collection, id);
      const row = await d1.prepare('SELECT data, version FROM docs WHERE collection = ? AND id = ?').bind(collection, id).first();
      return row ? { id, data: JSON.parse(row.data), version: row.version } : null;
    },

    async getMany(addresses) {
      const { docs } = await readState(addresses);
      return addresses.map(({ collection, id }) => docs.get(keyOf(collection, id)) || null);
    },

    async query(spec) {
      const { sql, params } = buildQuery(spec);
      const { results } = await d1.prepare(sql).bind(...params).all();
      return results.map((row) => ({
        id: row.id,
        data: row.data === undefined ? {} : project(JSON.parse(row.data), spec.select),
        version: row.version,
      }));
    },

    async collectionVersion(collection) {
      if (typeof collection !== 'string' || !COLLECTION_NAME.test(collection)) throw invalid(`Invalid collection name: ${String(collection)}`);
      const version = await d1.prepare('SELECT version FROM collection_versions WHERE collection = ?').bind(collection).first('version');
      return version ?? 0;
    },

    // preconditions: { collection, id, version } (version null = "did not exist when read"), or
    // { collection, collectionVersion } = "nothing in this collection was written since that version".
    async commit(writes, { preconditions = [] } = {}) {
      if (!Array.isArray(writes) || !Array.isArray(preconditions)) throw invalid('writes and preconditions must be arrays.');
      if (writes.length === 0) return;
      for (const write of writes) checkDocAddress(write?.collection, write?.id);
      const docPreconditions = preconditions.filter((p) => p.collectionVersion === undefined);
      const collectionPreconditions = preconditions.filter((p) => p.collectionVersion !== undefined);

      const toRead = new Map();
      for (const { collection, id } of [...docPreconditions, ...writes.filter(dependsOnStored)]) toRead.set(keyOf(collection, id), { collection, id });
      const watchedCollections = collectionPreconditions.map((p) => p.collection);

      for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
        if (attempt > 1) await pause(attempt);
        const state = await readState([...toRead.values()], watchedCollections);

        for (const p of docPreconditions) {
          const found = state.docs.get(keyOf(p.collection, p.id));
          if ((found ? found.version : null) !== p.version) throw new StoreError('aborted', `Document changed since it was read: ${p.collection}/${p.id}`);
        }
        for (const p of collectionPreconditions) {
          if (state.versions.get(p.collection) !== p.collectionVersion) throw new StoreError('aborted', `Collection changed since it was read: ${p.collection}`);
        }

        // Work out the final documents, write by write, so later writes see earlier ones.
        const now = new Date().toISOString();
        const final = new Map(); // key -> { collection, id, data | null }
        for (const write of writes) {
          const key = keyOf(write.collection, write.id);
          const current = final.has(key) ? final.get(key).data : (state.docs.get(key)?.data ?? null);
          final.set(key, { collection: write.collection, id: write.id, data: applyWrite(current, write, now) });
        }

        const conditions = [...toRead.entries()].map(([key, { collection, id }]) => {
          const found = state.docs.get(key);
          return found
            ? { sql: 'EXISTS (SELECT 1 FROM docs WHERE collection = ? AND id = ? AND version = ?)', params: [collection, id, found.version] }
            : { sql: 'NOT EXISTS (SELECT 1 FROM docs WHERE collection = ? AND id = ?)', params: [collection, id] };
        });
        for (const p of collectionPreconditions) {
          conditions.push({ sql: 'COALESCE((SELECT version FROM collection_versions WHERE collection = ?), 0) = ?', params: [p.collection, p.collectionVersion] });
        }

        const statements = guardStatements(conditions);
        for (const { collection, id, data } of final.values()) {
          statements.push(data === null
            ? d1.prepare(DELETE_SQL).bind(collection, id)
            : d1.prepare(UPSERT_SQL).bind(collection, id, JSON.stringify(data), now));
        }
        for (const collection of new Set([...final.values()].map((doc) => doc.collection))) {
          statements.push(d1.prepare(BUMP_SQL).bind(collection, now));
        }

        try {
          await d1.batch(statements);
          return;
        } catch (error) {
          if (!isGuardFailure(error)) throw error;
          // Something we read was changed in between. Nothing was written; read again and retry.
        }
      }
      throw new StoreError('aborted', 'Too much contention on these documents; nothing was written.');
    },
  };
};
