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
  const { fetchedAt, resetAt, ...numbers } = response.body;
  assert.deepEqual(numbers, {
    configured: true,
    // Requests of every Worker in the account count towards the limit; the rest is the store's own Worker
    workers: { requests: 42000, limit: 100000, scriptName: 'd4daina', scriptRequests: 41250, errors: 12, subrequests: 9000, cpuP50Ms: 1.84, cpuP99Ms: 9.68 },
    d1: { rowsRead: 1234567, rowsReadLimit: 5000000, rowsWritten: 4321, rowsWrittenLimit: 100000, readQueries: 5200, writeQueries: 310 },
    email: { left: 287, dailyCap: 300 },
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
