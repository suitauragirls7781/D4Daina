// Scenario: Admin -> Usage & limits (api/admin-config.js action "usage", api/_lib/usage.js): today's real
// Cloudflare usage against the free plan's daily limits and the emails left at Brevo. Cloudflare and Brevo
// are answered locally (the harness refuses any request that is not mocked).
// Run: node --test worker/test/scenarios/admin-usage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { jsonResponse } from '../harness/fetch-mock.mjs';
import { signInAdmin } from '../harness/admin.mjs';

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const BREVO = 'https://api.brevo.com/v3/account';
const TOKEN = 'harness-analytics-token-0001';
const ACCOUNT = 'harnessaccount0001';
const DATABASE = '11111111-2222-3333-4444-555555555555';

// The token must not come from the machine running the tests
delete process.env.CLOUDFLARE_ANALYTICS_TOKEN;
const h = await startHarness({ env: { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_D1_ID: DATABASE, CLOUDFLARE_WORKER_NAME: 'd4daina' } });
const { cookie } = await signInAdmin(h);

const usage = (sessionCookie = cookie) => h.call('/api/admin-config?action=usage', { cookie: sessionCookie });
const upstreamCalls = () => h.net.callsTo(GRAPHQL).length + h.net.callsTo(BREVO).length;

const account = (node) => jsonResponse(200, { data: { viewer: { accounts: [node] } }, errors: null });

// What Cloudflare reports today: two Workers in the account, CPU time in microseconds
const WORKER_ROWS = [
  { sum: { requests: 41250, subrequests: 9000, errors: 12 }, quantiles: { cpuTimeP50: 1840, cpuTimeP99: 9675 }, dimensions: { scriptName: 'd4daina' } },
  { sum: { requests: 750, subrequests: 10, errors: 3 }, quantiles: { cpuTimeP50: 300, cpuTimeP99: 20000 }, dimensions: { scriptName: 'another-worker' } },
];
const D1_ROWS = [{ sum: { readQueries: 5200, writeQueries: 310, rowsRead: 1234567, rowsWritten: 4321 }, dimensions: { date: h.today() } }];

/** Cloudflare's GraphQL API: each of the two queries is answered by `workers` / `d1` (a function of the call). */
const mockCloudflare = ({ workers = () => account({ workersInvocationsAdaptive: WORKER_ROWS }), d1 = () => account({ d1AnalyticsAdaptiveGroups: D1_ROWS }) } = {}) => {
  h.net.on('POST', GRAPHQL, (call) => (JSON.parse(call.body).query.includes('workersInvocationsAdaptive') ? workers(call) : d1(call)));
};
const mockBrevo = (respond = () => jsonResponse(200, { email: 'owner@store.example', plan: [{ type: 'free', creditsType: 'sendLimit', credits: 287 }] })) => {
  h.net.on('GET', BREVO, respond);
};

test('usage: refused without the admin cookie, like every other admin action', async () => {
  process.env.CLOUDFLARE_ANALYTICS_TOKEN = TOKEN;
  const before = upstreamCalls();
  for (const bad of ['', 'sag_admin_session=abc']) {
    const response = await usage(bad);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: 'Admin session required.' });
  }
  assert.equal(upstreamCalls(), before, 'nothing is asked of Cloudflare for a visitor who is not the admin');
  delete process.env.CLOUDFLARE_ANALYTICS_TOKEN;
});

test('usage: without the token it says which secret to add, shows no numbers and calls nobody', async () => {
  const before = upstreamCalls();
  const response = await usage();
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(
    { configured: response.body.configured, workers: response.body.workers, d1: response.body.d1, email: response.body.email },
    { configured: false, workers: null, d1: null, email: null },
  );
  assert.match(response.body.error, /Account Analytics: Read/);
  assert.match(response.body.error, /CLOUDFLARE_ANALYTICS_TOKEN/);
  assert.equal(upstreamCalls(), before);
});

test('usage: when Cloudflare answers with an error the parts are null with a short reason, and nothing is cached', async () => {
  process.env.CLOUDFLARE_ANALYTICS_TOKEN = TOKEN;
  mockBrevo();

  // The token is refused: both parts fail
  mockCloudflare({
    workers: () => jsonResponse(200, { data: null, errors: [{ message: 'not authorized for that account' }] }),
    d1: () => jsonResponse(403, { success: false }),
  });
  const refused = await usage();
  assert.equal(refused.status, 200, refused.text);
  assert.deepEqual(
    { configured: refused.body.configured, workers: refused.body.workers, d1: refused.body.d1, email: refused.body.email },
    { configured: true, workers: null, d1: null, email: { left: 287, dailyCap: 300 } },
  );
  assert.match(refused.body.error, /not authorized for that account/);
  assert.match(refused.body.error, /HTTP 403/);
  assert.ok(!refused.text.includes(TOKEN), 'the token is never sent to the browser');

  // Only one part fails: the other is still shown
  mockCloudflare({ d1: () => { throw new TypeError('fetch failed'); } });
  const partial = await usage();
  assert.equal(partial.body.workers.requests, 42000);
  assert.equal(partial.body.d1, null);
  assert.match(partial.body.error, /Database: fetch failed/);
  assert.ok(!partial.body.error.includes('Worker requests'));
  // A failed answer was not cached: each of the two calls asked Cloudflare again
  assert.equal(h.net.callsTo(GRAPHQL).length, 4);
});

test('usage: Cloudflare and Brevo numbers with the free-plan limits; CPU time converted to milliseconds', async () => {
  mockCloudflare();
  mockBrevo();
  const cloudflareBefore = h.net.callsTo(GRAPHQL).length;
  const brevoBefore = h.net.callsTo(BREVO).length;
  const started = Date.now();
  const response = await usage();
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  const { fetchedAt, resetAt, plan, period, periodStart, ...numbers } = response.body;
  assert.deepEqual({ plan, period }, { plan: 'free', period: 'day' });
  assert.match(periodStart, /T00:00:00.000Z$/);
  assert.deepEqual(numbers, {
    configured: true,
    // Requests of every Worker in the account count towards the limit; the rest is the store's own Worker
    workers: { requests: 42000, limit: 100000, scriptName: 'd4daina', scriptRequests: 41250, errors: 12, subrequests: 9000, cpuP50Ms: 1.84, cpuP99Ms: 9.68 },
    d1: { rowsRead: 1234567, rowsReadLimit: 5000000, rowsWritten: 4321, rowsWrittenLimit: 100000, readQueries: 5200, writeQueries: 310 },
    email: { left: 287, dailyCap: 300 },
    // No media bucket is named in this test store, and nothing was measured today
    media: null,
    photoRoom: null,
    capacity: null,
  });
  assert.ok(Math.abs(Date.parse(fetchedAt) - started) < 5000);
  // The Cloudflare day ends at the next 00:00 UTC (05:30 in India)
  assert.match(resetAt, /T00:00:00\.000Z$/);
  assert.ok(Date.parse(resetAt) > Date.parse(fetchedAt) && Date.parse(resetAt) - Date.parse(fetchedAt) <= 24 * 60 * 60 * 1000);

  // What was sent: the token as a Bearer header, the day from 00:00 UTC until now, this account and database
  const sent = h.net.callsTo(GRAPHQL).slice(cloudflareBefore);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((call) => call.headers.authorization === `Bearer ${TOKEN}`));
  const workersCall = JSON.parse(sent.find((call) => call.body.includes('workersInvocationsAdaptive')).body);
  const dayStart = `${fetchedAt.slice(0, 10)}T00:00:00.000Z`;
  assert.deepEqual(workersCall.variables, { acc: ACCOUNT, start: dayStart, end: fetchedAt });
  const d1Call = JSON.parse(sent.find((call) => call.body.includes('d1AnalyticsAdaptiveGroups')).body);
  assert.deepEqual(d1Call.variables, { acc: ACCOUNT, date: fetchedAt.slice(0, 10), db: DATABASE });
  const brevoCalls = h.net.callsTo(BREVO).slice(brevoBefore);
  assert.equal(brevoCalls.length, 1);
  assert.equal(brevoCalls[0].headers['api-key'], h.env.BREVO_API_KEY);
  assert.ok(!response.text.includes(TOKEN) && !response.text.includes(h.env.BREVO_API_KEY));
});

test('usage: a second call within 60 seconds is served from memory, with no new upstream call', async () => {
  const before = upstreamCalls();
  const first = await usage();
  const second = await usage();
  assert.equal(second.status, 200);
  assert.equal(upstreamCalls(), before);
  assert.deepEqual(second.body, first.body);
  assert.equal(first.body.workers.requests, 42000);
  // Still only for the admin
  assert.equal((await usage('')).status, 401);
});

test('usage: a day without traffic is zero, a paid Brevo plan has no daily cap, and a Brevo failure does not fail the page', async () => {
  const { clearUsageCache } = await import('../../../api/_lib/usage.js');

  clearUsageCache();
  mockCloudflare({ workers: () => account({ workersInvocationsAdaptive: [] }), d1: () => account({ d1AnalyticsAdaptiveGroups: [] }) });
  mockBrevo(() => jsonResponse(200, { plan: [{ type: 'subscription', creditsType: 'sendLimit', credits: 18500 }] }));
  const quiet = await usage();
  assert.equal(quiet.body.error, undefined);
  assert.deepEqual(quiet.body.workers, { requests: 0, limit: 100000, scriptName: 'd4daina', scriptRequests: 0, errors: 0, subrequests: 0, cpuP50Ms: null, cpuP99Ms: null });
  assert.deepEqual(quiet.body.d1, { rowsRead: 0, rowsReadLimit: 5000000, rowsWritten: 0, rowsWrittenLimit: 100000, readQueries: 0, writeQueries: 0 });
  assert.deepEqual(quiet.body.email, { left: 18500, dailyCap: null });

  for (const brevoDown of [() => jsonResponse(401, { code: 'unauthorized' }), () => { throw new TypeError('fetch failed'); }, () => jsonResponse(200, { plan: [] })]) {
    clearUsageCache();
    mockCloudflare();
    mockBrevo(brevoDown);
    const response = await usage();
    assert.equal(response.status, 200, response.text);
    assert.equal(response.body.email, null);
    assert.equal(response.body.error, undefined);
    assert.equal(response.body.workers.requests, 42000);
    assert.equal(response.body.d1.rowsRead, 1234567);
  }

  // Brevo comes back within the cached minute: only Brevo is asked again, Cloudflare stays cached
  const cloudflareBefore = h.net.callsTo(GRAPHQL).length;
  mockBrevo();
  const recovered = await usage();
  assert.deepEqual(recovered.body.email, { left: 287, dailyCap: 300 });
  assert.equal(recovered.body.workers.requests, 42000);
  assert.equal(h.net.callsTo(GRAPHQL).length, cloudflareBefore);
  const brevoBefore = h.net.callsTo(BREVO).length;
  assert.deepEqual((await usage()).body.email, { left: 287, dailyCap: 300 });
  assert.equal(h.net.callsTo(BREVO).length, brevoBefore, 'once Brevo answered, it is cached too');

  // A CPU figure Cloudflare leaves out is "not available", never 0 ms
  clearUsageCache();
  mockCloudflare({ workers: () => account({ workersInvocationsAdaptive: [{ sum: { requests: 5, subrequests: 0, errors: 0 }, quantiles: { cpuTimeP50: null, cpuTimeP99: 2500 }, dimensions: { scriptName: 'd4daina' } }] }) });
  const noCpu = await usage();
  assert.equal(noCpu.body.workers.cpuP50Ms, null);
  assert.equal(noCpu.body.workers.cpuP99Ms, 2.5);
});

test('usage: the admin\'s plan switch is saved, changes the limits shown, and can be switched back', async () => {
  const { clearUsageCache, PAID_WORKER_REQUESTS_PER_MONTH } = await import('../../../api/_lib/usage.js');
  const put = (body, sessionCookie = cookie) => h.call('/api/admin-config', { method: 'PUT', json: body, cookie: sessionCookie });
  clearUsageCache();
  mockCloudflare();
  mockBrevo();

  // Only the admin, only the two plans
  assert.equal((await put({ cloudflarePlan: 'paid' }, '')).status, 401);
  assert.equal((await put({ cloudflarePlan: 'business' })).status, 400);
  assert.equal(await h.doc('private_settings', 'cloudflare_plan'), null);
  assert.equal((await usage()).body.plan, 'free');

  const paid = await put({ cloudflarePlan: 'paid' });
  assert.equal(paid.status, 200, paid.text);
  assert.deepEqual({ plan: paid.body.plan, period: paid.body.period, limit: paid.body.workers.limit }, { plan: 'paid', period: 'month', limit: PAID_WORKER_REQUESTS_PER_MONTH });
  assert.equal((await h.doc('private_settings', 'cloudflare_plan')).plan, 'paid');
  const shown = await usage();
  assert.deepEqual({ plan: shown.body.plan, period: shown.body.period }, { plan: 'paid', period: 'month' });

  const free = await put({ cloudflarePlan: 'free' });
  assert.deepEqual({ plan: free.body.plan, period: free.body.period, limit: free.body.workers.limit }, { plan: 'free', period: 'day', limit: 100000 });
  assert.equal((await usage()).body.plan, 'free');
  clearUsageCache();
});

test('usage: photo storage (R2) and the visitor capacity are worked out from measured numbers only', async () => {
  const { readUsage, clearUsageCache } = await import('../../../api/_lib/usage.js');
  clearUsageCache();
  const now = new Date('2026-10-07T10:00:00.000Z');
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (String(url).includes('brevo')) return new Response('{}', { status: 500 });
    const query = String(body.query || '');
    asked.push(query.includes('r2StorageAdaptiveGroups') ? { r2: body.variables } : null);
    const account = query.includes('r2StorageAdaptiveGroups')
      ? { storage: [{ max: { payloadSize: 2000000000, objectCount: 1000, metadataSize: 0 } }], ops: [['PutObject', 900], ['ListObjects', 100], ['GetObject', 40000], ['HeadObject', 10000], ['DeleteObject', 5]].map(([actionType, requests]) => ({ sum: { requests }, dimensions: { actionType } })) }
      : query.includes('workersInvocationsAdaptive')
        ? { workersInvocationsAdaptive: [{ sum: { requests: 20000, subrequests: 0, errors: 0 }, quantiles: { cpuTimeP50: 2000, cpuTimeP99: 9000 }, dimensions: { scriptName: 'd4daina' } }] }
        : { d1AnalyticsAdaptiveGroups: [{ sum: { readQueries: 1, writeQueries: 1, rowsRead: 300000, rowsWritten: 12000 }, dimensions: { date: '2026-10-07' } }] };
    return new Response(JSON.stringify({ data: { viewer: { accounts: [account] } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const env = { CLOUDFLARE_ANALYTICS_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_D1_ID: 'db', MEDIA_BUCKET_NAME: 'store-media' };
  const visits = async (dates) => Object.fromEntries(dates.map((date) => [date, date === '2026-10-07' || date === '2026-10-06' ? 1000 : 0]));
  try {
    const body = await readUsage(env, now, 'free', visits);
    // Storage and this month's requests of the named bucket; deletes are free and are not counted
    assert.deepEqual(asked.find(Boolean).r2, { acc: 'acc', bucket: 'store-media', start: '2026-10-01T00:00:00.000Z', end: now.toISOString() });
    assert.deepEqual(body.media, {
      bucket: 'store-media', storageBytes: 2000000000, storageLimit: 10000000000, objects: 1000, photos: 100,
      writes: 1000, writesLimit: 1000000, reads: 50000, readsLimit: 10000000, monthStart: '2026-10-01T00:00:00.000Z', resetAt: '2026-11-01T00:00:00.000Z',
    });
    // 100 photos take 2 GB, so 8 GB more holds about 400 photos of that size
    assert.deepEqual(body.photoRoom, { bytesPerPhoto: 20000000, photosLeft: 400 });
    // Today: 1,000 visits used 20,000 requests (20 a visit, room for 5,000 visits a day), 12 rows written a visit
    // (8,333) and 300 rows read a visit (16,666). This month: 2,000 visits read 50,000 photo files (25 a visit).
    assert.deepEqual(body.capacity, {
      visitsToday: 1000, visitsThisMonth: 2000,
      perDay: [{ limit: 'requests', perVisit: 20, visits: 5000 }, { limit: 'writes', perVisit: 12, visits: 8333 }, { limit: 'reads', perVisit: 300, visits: 16666 }],
      perMonth: [{ limit: 'photoReads', perVisit: 25, visits: 400000 }],
      visitsPerDay: 5000, tightestDaily: 'requests', visitsPerMonth: 150000, tightest: 'requests',
    });

    // Too few visits counted: no estimate is made up
    clearUsageCache();
    assert.equal((await readUsage(env, now, 'free', async (dates) => Object.fromEntries(dates.map((date) => [date, 3])))).capacity, null);
    // Storage not reported yet this month: shown as unknown, never as zero
    clearUsageCache();
    const realAnswer = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const response = await realAnswer(url, init);
      if (!String(init?.body || '').includes('r2StorageAdaptiveGroups')) return response;
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{ storage: [], ops: [] }] } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const early = await readUsage(env, now, 'free', visits);
    assert.deepEqual([early.media.storageBytes, early.media.objects, early.media.photos, early.photoRoom], [null, null, null, null]);
  } finally {
    globalThis.fetch = realFetch;
    clearUsageCache();
  }
});

test('usage: on the paid plan the month is counted against what the plan includes', async () => {
  const { readUsage, clearUsageCache, PAID_WORKER_REQUESTS_PER_MONTH, PAID_D1_ROWS_WRITTEN_PER_MONTH } = await import('../../../api/_lib/usage.js');
  clearUsageCache();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push(body.variables || {});
    if (String(url).includes('brevo')) return new Response('{}', { status: 500 });
    const data = String(body.query || '').includes('workersInvocationsAdaptive')
      ? { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 250000, subrequests: 0, errors: 0 }, quantiles: { cpuTimeP50: 2000, cpuTimeP99: 9000 }, dimensions: { scriptName: 'd4daina' } }] }] } }
      : { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [
        { sum: { readQueries: 1, writeQueries: 1, rowsRead: 100, rowsWritten: 40 }, dimensions: { date: '2026-10-01' } },
        { sum: { readQueries: 2, writeQueries: 2, rowsRead: 200, rowsWritten: 60 }, dimensions: { date: '2026-10-04' } },
      ] }] } };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const now = new Date('2026-10-04T10:00:00.000Z');
    const body = await readUsage({ CLOUDFLARE_ANALYTICS_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_D1_ID: 'db', CLOUDFLARE_PLAN: 'paid' }, now);
    assert.equal(body.plan, 'paid');
    assert.equal(body.period, 'month');
    assert.equal(body.periodStart, '2026-10-01T00:00:00.000Z');
    assert.equal(body.resetAt, '2026-11-01T00:00:00.000Z');
    assert.equal(body.workers.limit, PAID_WORKER_REQUESTS_PER_MONTH);
    assert.equal(body.workers.requests, 250000);
    assert.equal(body.d1.rowsWritten, 100);
    assert.equal(body.d1.rowsWrittenLimit, PAID_D1_ROWS_WRITTEN_PER_MONTH);
    assert.ok(calls.some((v) => v.start === '2026-10-01T00:00:00.000Z') && calls.some((v) => v.date === '2026-10-01'));
  } finally {
    globalThis.fetch = realFetch;
    clearUsageCache();
  }
});
