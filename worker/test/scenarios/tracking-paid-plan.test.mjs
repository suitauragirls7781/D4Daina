// Scenario: the owner has set the plan switch (Admin -> Usage & limits) to "paid". Visitor counting then no
// longer pauses at the free plan's daily budget.
// A file of its own because api/track.js remembers the plan and the day's usage for a minute.
// Run: node --test worker/test/scenarios/tracking-paid-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';

const BUDGET = 60;
const h = await startHarness({ env: { TRACK_WRITE_BUDGET: String(BUDGET) } });
const day = h.today();

// The same day as in tracking-budget.test.mjs: the free budget is already used up
await h.put('daily_analytics', day, { date: day, visits: 7, totalUniqueVisitors: 7, productViews: 5 });
await h.put('private_settings', 'cloudflare_plan', { plan: 'paid', updatedAt: new Date().toISOString() });

test('on the paid plan a visit is still counted after the free budget is used up', async () => {
  assert.ok(7 * 6 + 5 * 4 >= BUDGET);
  const visit = await h.post('/api/track', { event: 'visit', visitorId: 'vis_paid_one', path: '/' }, { ip: h.nextIp() });
  assert.equal(visit.status, 200, visit.text);
  assert.notEqual(visit.body.paused, true);
  assert.equal((await h.doc('daily_analytics', day)).visits, 8);
});
