// Shared helpers for the local end-to-end checks: a guarded Chrome page, direct reads of the local D1
// file, writes through `wrangler d1 execute --local`, and the Worker's request log.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WORKER_DIR = path.resolve(HERE, '..', '..');

/** Where `wrangler dev` listens. */
export const WORKER_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8799').replace(/\/+$/, '');
// The app treats "localhost" and "127.0.0.1" as a developer machine (no catalogue request, no visitor
// counting, live reads everywhere). Chrome is therefore told that this made-up name is the local Worker,
// so the pages behave exactly as they will on the real domain. Nothing is looked up in DNS.
const SITE_HOST = process.env.E2E_SITE_HOST || 'store.test';
/** The address the browser uses. */
export const BASE_URL = `http://${SITE_HOST}:${new URL(WORKER_URL).port || 80}`;
/** The folder `wrangler dev` keeps its local state in (same value as its --persist-to, if that was used). */
export const PERSIST_DIR = path.resolve(WORKER_DIR, process.env.E2E_PERSIST || '.wrangler/state');
/** The file the output of `wrangler dev` was redirected to; only requests.mjs needs it. */
export const DEV_LOG = process.env.E2E_DEV_LOG ? path.resolve(WORKER_DIR, process.env.E2E_DEV_LOG) : '';
const CHROME = process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME || 'localadmin',
  password: process.env.E2E_ADMIN_PASSWORD || 'Local#Pass123',
  pin: process.env.E2E_ADMIN_PIN || '123456',
};
export const SCREENSHOT_DIR = path.join(WORKER_DIR, '.wrangler', 'e2e-screenshots');

// playwright-core is not a dependency of this project: E2E_PLAYWRIGHT names the folder that holds it.
const loadPlaywright = () => {
  const roots = [process.env.E2E_PLAYWRIGHT, HERE].filter(Boolean);
  for (const root of roots) {
    try {
      return createRequire(path.join(path.resolve(root), 'noop.js'))('playwright-core');
    } catch {
      // try the next place
    }
  }
  throw new Error('playwright-core not found. Set E2E_PLAYWRIGHT to a folder that contains node_modules/playwright-core.');
};

const baseHost = new URL(BASE_URL).host;
// Photos, reels and fonts may load from outside; nothing else leaves this machine.
const ALLOWED_OUTSIDE = new Set(['res.cloudinary.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
// The old backend and the live site: a request to any of these means the build is not on the shims.
const FORBIDDEN = /firestore\.googleapis\.com|identitytoolkit|securetoken\.googleapis|firebaseio\.com|firebaseapp\.com|suitauragirls\.in/i;

export const launch = async () => {
  const { chromium } = loadPlaywright();
  return chromium.launch({
    executablePath: CHROME,
    headless: process.env.E2E_HEADED !== '1',
    args: [
      `--host-resolver-rules=MAP ${SITE_HOST} ${new URL(WORKER_URL).hostname}`,
      // The admin cookie is "Secure" and the app uses crypto.randomUUID: both need a secure origin.
      `--unsafely-treat-insecure-origin-as-secure=${BASE_URL}`,
    ],
  });
};

/**
 * A fresh browser profile with one page. Every request is recorded; requests to other hosts are blocked
 * (except photos and fonts), and the page's console errors and failed /api calls are collected in `watch`.
 */
export const openPage = async (browser, { mobile = false } = {}) => {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  const watch = { api: [], blocked: [], forbidden: [], consoleErrors: [], pageErrors: [], apiFailures: [] };
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (FORBIDDEN.test(url.host)) {
      watch.forbidden.push(request.url());
      return route.abort();
    }
    if (url.host === baseHost) return route.continue();
    if (ALLOWED_OUTSIDE.has(url.host) && request.method() === 'GET') return route.continue();
    watch.blocked.push(url.host);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const source = message.location()?.url || '';
    // A photo the old Cloudinary account no longer has, or a host blocked above, is not the app's fault.
    if (source && !source.startsWith(BASE_URL)) return;
    watch.consoleErrors.push(`${message.text()} @ ${page.url()}`);
  });
  page.on('pageerror', (error) => watch.pageErrors.push(`${error.message} @ ${page.url()}`));
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.host !== baseHost || !url.pathname.startsWith('/api/')) return;
    const request = response.request();
    let ops = '';
    if (url.pathname === '/api/db') {
      try {
        ops = (request.postDataJSON()?.ops || []).map((op) => (op.op === 'watch' ? `watch(${op.targets?.length})` : `${op.op}:${op.collection || op.path}`)).join(',');
      } catch {
        ops = '?';
      }
    }
    const entry = {
      method: request.method(),
      path: url.pathname + (url.searchParams.get('action') ? `?action=${url.searchParams.get('action')}` : ''),
      status: response.status(),
      ops,
      as: tokenKind(request.headers().authorization),
      at: Date.now(),
    };
    watch.api.push(entry);
    if (response.status() >= 400) watch.apiFailures.push(`${entry.method} ${entry.path} -> ${entry.status} @ ${page.url()}`);
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.host === baseHost && url.pathname.startsWith('/api/') && request.failure()?.errorText !== 'net::ERR_ABORTED') {
      watch.apiFailures.push(`${request.method()} ${url.pathname} failed: ${request.failure()?.errorText}`);
    }
  });
  return { context, page, watch };
};

/** Who a request was made as, read from its Bearer token (not verified here: the Worker does that). */
const tokenKind = (authorization = '') => {
  try {
    const claims = JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString());
    return claims.admin === true ? 'admin' : claims.customerEmail ? 'customer' : 'other';
  } catch {
    return 'guest';
  }
};

/** Takes what was collected so far and empties the lists, so each check reports only its own problems. */
export const drain = (watch) => {
  const taken = {
    consoleErrors: watch.consoleErrors.splice(0),
    pageErrors: watch.pageErrors.splice(0),
    apiFailures: watch.apiFailures.splice(0),
    forbidden: watch.forbidden.splice(0),
  };
  return [...taken.consoleErrors, ...taken.pageErrors, ...taken.apiFailures, ...taken.forbidden.map((url) => `FORBIDDEN HOST ${url}`)];
};

export const screenshot = async (page, name) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) }).catch(() => {});
};

// ---- local D1 ----

const d1File = () => {
  const dir = path.join(PERSIST_DIR, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const name = existsSync(dir) && readdirSync(dir).find((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
  if (!name) throw new Error(`No local D1 database under ${dir}. Apply schema.sql and the import first (see README.md).`);
  return path.join(dir, name);
};

/** Read-only query on the local D1 file (the same file `wrangler dev` has open). */
export const d1All = (sql, ...params) => {
  const db = new DatabaseSync(d1File(), { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
};

export const d1Doc = (collection, id) => {
  const [row] = d1All('SELECT data, version FROM docs WHERE collection = ? AND id = ?', collection, id);
  return row ? { data: JSON.parse(row.data), version: row.version } : null;
};

export const d1Docs = (collection) => d1All('SELECT id, data FROM docs WHERE collection = ?', collection)
  .map((row) => ({ id: row.id, data: JSON.parse(row.data) }));

const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** Runs SQL on local D1 the way an operator would: `wrangler d1 execute --local --file`. */
export const d1Execute = (sql) => {
  const dir = path.join(WORKER_DIR, '.wrangler', 'tmp');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `e2e-${Date.now()}.sql`);
  writeFileSync(file, sql);
  // One command line through the shell (npx is a .cmd file on Windows); the paths are quoted because the
  // project folder has spaces in its name.
  const quoted = (value) => `"${path.relative(WORKER_DIR, value)}"`;
  const result = spawnSync(`npx wrangler d1 execute suitauragirls-db --local --persist-to ${quoted(PERSIST_DIR)} --file ${quoted(file)}`, {
    cwd: WORKER_DIR, shell: true, encoding: 'utf8',
  });
  // The file can hold a copy of an order, so it does not stay behind.
  rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(`wrangler d1 execute failed: ${result.stderr || result.stdout}`);
};

/**
 * Inserts or replaces one document from outside the Worker and bumps the collection version, exactly as
 * worker/src/docstore.js does on a write (new row version = collection version + 1), so pollers notice.
 */
export const d1PutDoc = (collection, id, data) => {
  const now = new Date().toISOString();
  const c = sqlText(collection);
  d1Execute([
    `INSERT INTO collection_versions (collection, version, updated_at) VALUES (${c}, 1, ${sqlText(now)})`
      + ` ON CONFLICT (collection) DO UPDATE SET version = version + 1, updated_at = excluded.updated_at;`,
    `INSERT OR REPLACE INTO docs (collection, id, data, version, created_at, updated_at) VALUES (${c}, ${sqlText(id)}, ${sqlText(JSON.stringify(data))},`
      + ` (SELECT version FROM collection_versions WHERE collection = ${c}), ${sqlText(now)}, ${sqlText(now)});`,
  ].join('\n'));
};

export const d1DeleteDoc = (collection, id) => {
  const c = sqlText(collection);
  d1Execute([
    `UPDATE collection_versions SET version = version + 1, updated_at = ${sqlText(new Date().toISOString())} WHERE collection = ${c};`,
    `DELETE FROM docs WHERE collection = ${c} AND id = ${sqlText(id)};`,
  ].join('\n'));
};

// ---- the Worker's own request log (one JSON line per API request, written by worker/src/index.js) ----

/** API requests the Worker logged since `fromLine`. Static files are not in this log; count those in the browser. */
export const workerLog = (fromLine = 0) => {
  if (!DEV_LOG || !existsSync(DEV_LOG)) return { lines: 0, requests: [] };
  const lines = readFileSync(DEV_LOG, 'utf8').split(/\r?\n/);
  const requests = [];
  for (const line of lines.slice(fromLine)) {
    if (!line.startsWith('{"level"') || !line.includes('"message":"api"')) continue;
    try {
      requests.push(JSON.parse(line));
    } catch {
      // a line cut in half by a concurrent write: skip it
    }
  }
  return { lines: lines.length, requests };
};

// ---- reporting ----

export const createReport = (title) => {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };
  /** Passes when the page made no console error, no failed /api call and no call to a forbidden host. */
  const clean = (name, watch) => {
    const problems = drain(watch);
    check(`${name}: no console errors, no failed /api calls`, problems.length === 0, problems.slice(0, 5).join(' | '));
  };
  const finish = () => {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${title}: ${results.length - failed.length} passed, ${failed.length} failed`);
    return failed.length;
  };
  return { check, clean, finish };
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `probe()` returns something truthy; returns it, or the last falsy value after the timeout. */
export const until = async (probe, { timeout = 15000, every = 250 } = {}) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (value || Date.now() >= deadline) return value;
    await sleep(every);
  }
};
