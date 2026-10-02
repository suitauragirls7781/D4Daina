// Scenario-test harness: the REAL api/** handlers, reached through the REAL Worker entry (worker/src/index.js,
// so also the router, the Node adapter and the /api/db gateway), on the D1 document store over node:sqlite,
// seeded with the real exported data. Only the outside world is replaced (fetch-mock.mjs).
//
// One harness per test file. `node --test` runs each file in its own process, so the handlers' module-level
// state (gateway cache, last catalogue, tracking budget) starts fresh in every file.
import './firebase-admin-alias.mjs';
import { after, afterEach } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createD1 } from '../d1-node.mjs';
import { openLocalD1 } from './local-d1.mjs';
import { createStore } from '../../src/docstore.js';
import { setEnv } from '../../src/env.js';
import { createFetchMock, mockServices } from './fetch-mock.mjs';

export const SITE = 'https://www.suitauragirls.in';
export const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

// Test-only values. None of them is a real credential.
export const TEST_ENV = Object.freeze({
  ADMIN_SESSION_SECRET: 'harness-admin-session-secret',
  AUTH_TOKEN_SECRET: 'harness-auth-token-secret',
  // A "live" key id: shoppers are offered Razorpay only when the key is a live one (api/_lib/payu.js).
  RAZORPAY_KEY_ID: 'rzp_live_HarnessKey0001',
  RAZORPAY_KEY_SECRET: 'HarnessRazorpaySecret01',
  RAZORPAY_WEBHOOK_SECRET: 'harness-webhook-secret',
  BREVO_API_KEY: 'harness-brevo-key',
  BREVO_SENDER_EMAIL: 'sender@store.example',
  CLOUDINARY_CLOUD_NAME: 'harnesscloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'harness-cloudinary-secret',
  ADMIN_INITIAL_USERNAME: 'owner',
  ADMIN_INITIAL_PASSWORD: 'Harness-Passw0rd',
  ADMIN_INITIAL_PIN: '246810',
  GOOGLE_CLIENT_ID: 'harness-client-id.apps.googleusercontent.com',
  SECURE_COOKIES: '1',
});

// Settings the handlers read that must not leak in from the machine running the tests.
const CLEARED_ENV = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_ID', 'GEMINI_API_KEY', 'TRACK_WRITE_BUDGET', 'VITE_RAZORPAY_KEY_ID'];

// D1's free plan allows this many queries in one Worker invocation; a request that needs more fails there.
export const D1_CALLS_PER_REQUEST = 50;

// Taken before any test can mock the timers (admin-slow-request.test.mjs does).
const realSetTimeout = globalThis.setTimeout;

const DATA_DIR = new URL('../../../migration/data/', import.meta.url);

/** The newest export, as { collection: [{ id, data }] }. Customer data: read here, never copied anywhere. */
const readExport = () => {
  let folders = [];
  try {
    folders = readdirSync(DATA_DIR).filter((name) => name.startsWith('export-')).sort();
  } catch {
    folders = [];
  }
  if (!folders.length) throw new Error('The scenario tests run on the real export: no migration/data/export-* folder was found.');
  const dir = new URL(`${folders.at(-1)}/`, DATA_DIR);
  const collections = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    collections[file.slice(0, -'.json'.length)] = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  }
  return collections;
};

// The export marks Firestore timestamps as { __type: 'timestamp', iso }; the document store keeps ISO
// strings (same conversion as migration/scripts/build-d1-import.cjs).
const plain = (value) => {
  if (Array.isArray(value)) return value.map(plain);
  if (value === null || typeof value !== 'object') return value;
  if (value.__type === 'timestamp' && typeof value.iso === 'string') return value.iso;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]));
};

const SEED_BATCH = 200;

/** Loads the export the way the import does: one row per document, every collection at version 1. */
const seed = async (d1, collections) => {
  const stamp = new Date().toISOString();
  const statements = [];
  for (const [collection, rows] of Object.entries(collections)) {
    for (const row of rows) {
      statements.push(d1.prepare('INSERT INTO docs (collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
        .bind(collection, row.id, JSON.stringify(plain(row.data)), stamp, stamp));
    }
    if (rows.length) statements.push(d1.prepare('INSERT INTO collection_versions (collection, version, updated_at) VALUES (?, 1, ?)').bind(collection, stamp));
  }
  // In chunks: one batch is one transaction, and real D1 limits how much a single one may carry.
  for (let start = 0; start < statements.length; start += SEED_BATCH) await d1.batch(statements.slice(start, start + SEED_BATCH));
};

// What index.js uses of caches.default: enough to prove the catalogue is served from the edge cache.
const createEdgeCache = () => {
  const entries = new Map();
  return {
    entries,
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, response); },
  };
};

/**
 * The database as the Worker gets it, counting every call a request makes: D1 allows a limited number of
 * queries per Worker invocation (50 on the free plan), so the scenarios report how many each request used.
 * A batch() is one call. The harness's own reads and writes use the database directly and are not counted.
 */
const countingD1 = (d1, onCall) => {
  const counted = (statement) => ({
    statement,
    bind: (...params) => counted(statement.bind(...params)),
    first: (...args) => { onCall(); return statement.first(...args); },
    all: () => { onCall(); return statement.all(); },
    run: () => { onCall(); return statement.run(); },
    raw: (...args) => { onCall(); return statement.raw(...args); },
  });
  return {
    prepare: (sql) => counted(d1.prepare(sql)),
    batch: (statements) => { onCall(); return d1.batch(statements.map((entry) => entry.statement)); },
  };
};

/** The handlers log what goes wrong on purpose in these tests; kept here instead of flooding the output. */
const captureConsole = () => {
  const logs = [];
  if (process.env.SAG_TEST_LOGS === '1') return logs;
  for (const level of ['log', 'warn', 'error']) {
    console[level] = (...parts) => { logs.push({ level, text: parts.map(String).join(' ') }); };
  }
  return logs;
};

/**
 * @param options.env     extra env values, set before the handlers are loaded (api/track.js reads its budget on load)
 * @param options.realD1  run on real local D1 (workerd) instead of the node:sqlite stand-in
 */
export const startHarness = async ({ env: extraEnv = {}, realD1 = false } = {}) => {
  for (const name of CLEARED_ENV) delete process.env[name];
  const settings = { ...TEST_ENV, ...extraEnv };
  Object.assign(process.env, settings);

  const exported = readExport();
  const local = realD1 ? await openLocalD1() : null;
  const d1 = local ? local.d1 : createD1();
  await seed(d1, exported);
  const store = createStore(d1);

  const net = createFetchMock();
  const services = mockServices(net, settings);
  globalThis.fetch = net.fetch;
  const edgeCache = createEdgeCache();
  globalThis.caches = { default: edgeCache };
  const logs = captureConsole();

  // Each request's D1 calls are counted in its own async context, so parallel requests do not mix.
  const requests = new AsyncLocalStorage();
  const assetRequests = [];
  const env = {
    ...settings,
    DB: countingD1(d1, () => { const request = requests.getStore(); if (request) request.d1Calls += 1; }),
    ASSETS: { fetch: async (request) => { assetRequests.push(new URL(request.url).pathname); return new Response('<!doctype html><title>app shell</title>', { headers: { 'content-type': 'text/html' } }); } },
  };
  setEnv(env);

  // Loaded only now: the alias hook is registered and process.env is ready.
  const worker = (await import('../../src/index.js')).default;
  const { ADMIN_UID, customerUid } = await import('../../../api/_lib/firebaseAdmin.js');
  const { getAuth } = await import('../../src/shims/firebase-admin-auth.js');

  const overD1Limit = [];
  afterEach(() => {
    const leaked = net.unexpected.splice(0);
    assert.deepEqual(leaked, [], 'a handler tried to reach a service that is not mocked');
    assert.deepEqual(overD1Limit.splice(0), [], `a request made more than ${D1_CALLS_PER_REQUEST} D1 calls`);
  });
  after(async () => {
    // The guard table only ever receives a row inside a batch that is rolled back.
    assert.equal(await d1.prepare('SELECT COUNT(*) AS n FROM tx_guard').first('n'), 0);
    await local?.dispose();
  });

  let ipCounter = 0;

  /**
   * One request through the Worker, as a browser (or a payment gateway) would send it.
   * json / form / raw choose the body; token becomes `Authorization: Bearer`; ip is what Cloudflare reports
   * as the client; origin defaults to the store itself for anything but GET and HEAD (null = send none).
   * The answer carries d1Calls: how many D1 calls the Worker made for this request.
   */
  const call = async (path, { method, json, form, raw, contentType, token, cookie, ip = '198.51.100.10', ua = BROWSER_UA, origin, headers = {} } = {}) => {
    const hasBody = json !== undefined || form !== undefined || raw !== undefined;
    const verb = method || (hasBody ? 'POST' : 'GET');
    const sent = new Headers(headers);
    let body;
    if (json !== undefined) {
      body = JSON.stringify(json);
      sent.set('content-type', 'application/json');
    } else if (form !== undefined) {
      body = new URLSearchParams(form).toString();
      sent.set('content-type', 'application/x-www-form-urlencoded');
    } else if (raw !== undefined) {
      body = raw;
      if (contentType) sent.set('content-type', contentType);
    }
    const sameOrigin = origin === undefined ? (verb === 'GET' || verb === 'HEAD' ? null : SITE) : origin;
    if (sameOrigin) sent.set('origin', sameOrigin);
    if (token) sent.set('authorization', `Bearer ${token}`);
    if (cookie) sent.set('cookie', cookie);
    if (ua) sent.set('user-agent', ua);
    if (ip) sent.set('cf-connecting-ip', ip);

    const usage = { d1Calls: 0 };
    const response = await requests.run(usage, async () => {
      const background = [];
      const answer = await worker.fetch(new Request(`${SITE}${path}`, { method: verb, headers: sent, body }), env, {
        waitUntil: (promise) => { background.push(promise); },
        passThroughOnException() {},
      });
      await Promise.all(background);
      return answer;
    });
    if (usage.d1Calls > D1_CALLS_PER_REQUEST) overD1Limit.push(`${verb} ${path}: ${usage.d1Calls} calls`);
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: response.status, headers: response.headers, cookies: response.headers.getSetCookie(), text, body: parsed, d1Calls: usage.d1Calls };
  };

  const doc = async (collection, id) => (await store.getDoc(collection, id))?.data ?? null;

  return {
    env: settings,
    d1,
    store,
    net,
    services,
    mail: services.mail,
    logs,
    edgeCache,
    assetRequests,
    call,
    /** The Worker entry and the env it is given, for a test that has to see the request's own ctx. */
    worker,
    workerEnv: env,
    /** POST with a JSON body. */
    post: (path, json, options = {}) => call(path, { ...options, json }),

    // ---- the stored documents ----
    doc,
    docs: (collection, where = []) => store.query({ collection, where }),
    put: (collection, id, data) => store.commit([{ type: 'set', collection, id, data }]),
    update: (collection, id, data) => store.commit([{ type: 'update', collection, id, data }]),
    remove: (collection, id) => store.commit([{ type: 'delete', collection, id }]),
    /** A storefront setting as the app reads it (the documents hold JSON text). */
    setting: async (key) => JSON.parse((await doc('storefront_settings', key))?.value_json ?? 'null'),
    putSetting: (key, value) => store.commit([{ type: 'set', collection: 'storefront_settings', id: key, data: { value_json: JSON.stringify(value), updated_at: new Date().toISOString() } }]),
    /** Rows of the export as they were loaded: [{ id, data }]. */
    exported: (collection) => structuredClone(exported[collection] || []).map((row) => ({ id: row.id, data: plain(row.data) })),

    // ---- session tokens with the uid and claims api/_lib/firebaseAdmin.js gives them ----
    customerToken: (email) => getAuth().createCustomToken(customerUid(email), { customerEmail: email.toLowerCase() }),
    adminToken: () => getAuth().createCustomToken(ADMIN_UID, { admin: true }),

    /** A client address nobody has used yet in this file (rate limits are per address). */
    nextIp: () => { ipCounter += 1; return `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`; },
    today: () => new Date().toISOString().slice(0, 10),
    /** Real waiting, also while a test has mocked the timers. */
    sleep: (ms) => new Promise((resolve) => { realSetTimeout(resolve, ms); }),
    mailTo: (address) => services.mail.filter((mail) => mail.to === address),
  };
};
