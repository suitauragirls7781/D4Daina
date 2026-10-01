// A D1-compatible database over node:sqlite, for fast unit tests (no wrangler, no network).
// Covers what the Worker code uses: prepare(sql).bind(...).first() / all() / run() / raw(), and
// batch([...]) as one transaction that rolls back when any statement fails. Every call is async and
// yields once, as D1 does, so concurrent callers interleave between statements like in production.
// The real thing is exercised in real-d1.test.mjs.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const SCHEMA_URL = new URL('../schema.sql', import.meta.url);

// schema.sql as single statements (D1's exec() cannot take multi-line statements, prepare() takes one).
export const schemaStatements = () => readFileSync(SCHEMA_URL, 'utf8')
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

// D1 stores booleans as 0/1 and refuses undefined; node:sqlite would refuse both.
const toBindable = (value) => {
  if (value === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  return typeof value === 'boolean' ? Number(value) : value;
};

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params.map(toBindable));
  }

  // Synchronous core shared by the single-statement methods and batch().
  execute() {
    const statement = this.db.prepare(this.sql);
    try {
      if (statement.columns().length > 0) {
        return { success: true, results: statement.all(...this.params).map((row) => ({ ...row })), meta: { changes: 0 } };
      }
      const { changes, lastInsertRowid } = statement.run(...this.params);
      return { success: true, results: [], meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) } };
    } catch (error) {
      throw new Error(`D1_ERROR: ${error.message}`, { cause: error });
    }
  }

  async all() {
    await tick();
    return this.execute();
  }

  async run() {
    await tick();
    return this.execute();
  }

  async first(column) {
    await tick();
    const row = this.execute().results[0];
    if (!row) return null;
    return column === undefined ? row : row[column];
  }

  async raw() {
    await tick();
    return this.execute().results.map((row) => Object.values(row));
  }
}

export const createD1 = ({ schema = true } = {}) => {
  const db = new DatabaseSync(':memory:');
  const d1 = {
    prepare: (sql) => new Statement(db, sql),

    async batch(statements) {
      await tick();
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async exec(sql) {
      await tick();
      db.exec(sql);
      return { count: 1, duration: 0 };
    },

    close: () => db.close(),
  };
  if (schema) for (const statement of schemaStatements()) db.exec(statement);
  return d1;
};

// ---------------------------------------------------------------------------------------------------
// Shared by docstore.test.mjs (node:sqlite) and real-d1.test.mjs (local D1)
// ---------------------------------------------------------------------------------------------------

// The queries that run on every checkout, payment, product page and admin dashboard refresh.
export const HOT_QUERIES = [
  { name: 'orders by customerEmail', index: 'docs_orders_customerEmail', spec: { collection: 'orders', where: [['customerEmail', '==', 'a@example.com']] } },
  { name: 'orders by razorpayOrderId', index: 'docs_orders_razorpayOrderId', spec: { collection: 'orders', where: [['razorpayOrderId', '==', 'order_X']], limit: 1 } },
  { name: 'orders by attemptKey', index: 'docs_orders_attemptKey', spec: { collection: 'orders', where: [['attemptKey', '==', 'k'.repeat(20)]], limit: 1 } },
  { name: 'reviews by productId + status', index: 'docs_reviews_productId', spec: { collection: 'reviews', where: [['productId', '==', 'p1'], ['status', '==', 'approved']] } },
  { name: 'latest 100 visitor sessions', index: 'docs_visitor_sessions_lastActive', spec: { collection: 'visitor_sessions', orderBy: [['lastActive', 'desc']], limit: 100 } },
];

// EXPLAIN QUERY PLAN of a statement, as one line of text.
export const queryPlan = async (d1, sql, params) => {
  const { results } = await d1.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params).all();
  return results.map((row) => row.detail).join(' | ');
};
