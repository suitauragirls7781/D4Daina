// Live visitor presence has a daily write budget of its own (PRESENCE_WRITE_BUDGET, rows; 2 rows a signal).
// When it is used up, presence signals are answered and nothing is written, and visit counting carries on.
// Presence also stops while the database itself refuses work.
// A file of its own because the budgets are remembered per isolate for a minute or more.
// Run: node --test worker/test/scenarios/presence-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { signInAdmin } from '../harness/admin.mjs';

const LIMIT = 8;
const h = await startHarness({ env: { PRESENCE_WRITE_BUDGET: String(LIMIT) } });
const admin = await signInAdmin(h);
const IST_MS = 5.5 * 60 * 60 * 1000;
const istDay = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const rows = async () => (await h.d1.prepare('SELECT visitor_id, signals FROM presence ORDER BY visitor_id').all()).results;
const view = (visitorId, path = '/', label = 'Home') => h.post('/api/track', { event: 'presence', kind: 'view', visitorId, path, label }, { ip: h.nextIp() });
const live = () => h.call('/api/admin-config?action=live', { cookie: admin.cookie });

// Two signals were already written today by an earlier isolate (4 rows); a row of yesterday does not count
await h.d1.prepare("INSERT INTO presence (visitor_id, day, first_seen, last_seen, path, label, signals) VALUES ('vis_budget_seed', ?, ?, ?, '/', 'Home', 2)").bind(istDay, Date.now(), Date.now()).run();
await h.d1.prepare("INSERT INTO presence (visitor_id, day, first_seen, last_seen, path, label, signals) VALUES ('vis_budget_old', '2020-01-01', 1, 2, '/', 'Home', 50)").run();

test('signals are written until the day\'s presence budget is used up, then answered and not written', async () => {
  assert.deepEqual((await live()).body.liveBudget, { used: 4, limit: LIMIT });
  assert.equal((await live()).body.livePaused, false);

  // 4 rows used; each accepted signal is counted as 2 more
  assert.deepEqual((await view('vis_budget_one')).body, { ok: true, counted: true });
  assert.deepEqual((await view('vis_budget_two')).body, { ok: true, counted: true });
  const before = await rows();
  const third = await view('vis_budget_three');
  assert.equal(third.status, 200);
  assert.deepEqual(third.body, { ok: true, counted: false, paused: true });
  assert.equal(third.d1Calls, 0, 'a paused signal does not reach the presence table');
  assert.deepEqual(await rows(), before);
  assert.equal(before.some((row) => row.visitor_id === 'vis_budget_three'), false);
});

test('visit counting carries on untouched while presence is paused', async () => {
  const visit = await h.post('/api/track', { event: 'visit', visitorId: 'vis_budget_one', path: '/' }, { ip: h.nextIp() });
  assert.deepEqual(visit.body, { ok: true, counted: true });
  assert.ok(await h.doc('visitor_sessions', 'vis_budget_one'));

  const body = (await live()).body;
  assert.equal(body.paused, false);
  assert.equal(body.livePaused, true);
  assert.deepEqual(body.liveBudget, { used: LIMIT, limit: LIMIT });
  // The list is still shown: what was seen before the pause
  assert.equal(body.todayCount, 3);
});

test('the paid plan raises the presence budget', async () => {
  const { presenceBudget } = await import('../../../api/_lib/presence.js');
  assert.deepEqual(await presenceBudget('paid'), { used: LIMIT, limit: 400000, paused: false });
  assert.deepEqual(await presenceBudget('free'), { used: LIMIT, limit: LIMIT, paused: true });
});
