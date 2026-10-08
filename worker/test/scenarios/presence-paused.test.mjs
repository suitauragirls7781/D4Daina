// Live visitor presence and the visit counting budget are separate: with the day's visit counting budget used
// up, visits are answered as paused and presence carries on with its own budget.
// A file of its own because api/track.js reads TRACK_WRITE_BUDGET when it is loaded and remembers the day's
// usage for a minute.
// Run: node --test worker/test/scenarios/presence-paused.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { signInAdmin } from '../harness/admin.mjs';

const BUDGET = 60;
const h = await startHarness({ env: { TRACK_WRITE_BUDGET: String(BUDGET) } });
const admin = await signInAdmin(h);
const day = h.today();
const rowCount = () => h.d1.prepare('SELECT COUNT(*) AS n FROM presence').first('n');

// Today's visit counting so far, as the handler estimates it: 6 writes per visit
await h.put('daily_analytics', day, { date: day, visits: 10, totalUniqueVisitors: 10 });

test('visit counting is paused by its budget; presence signals are still written and do not add to that budget', async () => {
  const visit = await h.post('/api/track', { event: 'visit', visitorId: 'vis_paused_one', path: '/' }, { ip: h.nextIp() });
  assert.deepEqual(visit.body, { ok: true, counted: false, paused: true });

  const response = await h.post('/api/track', { event: 'presence', kind: 'view', visitorId: 'vis_paused_one', path: '/shop', label: 'Shop' }, { ip: h.nextIp(), cf: { city: 'Jaipur' } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, counted: true });
  assert.equal(await rowCount(), 1);
  assert.equal(await h.doc('visitor_sessions', 'vis_paused_one'), null);
  assert.equal((await h.doc('daily_analytics', day)).visits, 10);
});

test('admin "live": "paused" is the visit counting, "livePaused" and "liveBudget" are presence\'s own', async () => {
  const response = await h.call('/api/admin-config?action=live', { cookie: admin.cookie });
  assert.equal(response.status, 200, response.text);
  const body = response.body;
  assert.equal(body.paused, true);
  assert.equal(body.livePaused, false);
  // One signal so far, estimated at 2 rows, against the default 30,000 rows a day
  assert.deepEqual(body.liveBudget, { used: 2, limit: 30000 });
  assert.equal(body.windowSeconds, 210);
  assert.equal(body.activeCount, 1);
  assert.equal(body.todayCount, 1);
  assert.equal(body.todayByHour.length, 24);
  assert.equal(body.todayByHour.reduce((sum, count) => sum + count, 0), 1);
});
