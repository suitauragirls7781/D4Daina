// Scenario 9, the budget: once today's visitor counting has used its share of the day's database writes,
// counting pauses and writes nothing more, and the storefront keeps answering.
// A file of its own because api/track.js reads TRACK_WRITE_BUDGET when it is loaded and remembers the
// day's usage for a minute.
// Run: node --test worker/test/scenarios/tracking-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { lineOf, pickOutfit } from '../harness/checkout.mjs';

const BUDGET = 60;
const h = await startHarness({ env: { TRACK_WRITE_BUDGET: String(BUDGET) } });

const day = h.today();
const product = h.exported('products')[0];
const track = (body, ip) => h.post('/api/track', body, { ip });

// Today's counting so far, as the handler estimates it: 6 writes per visit, 4 per product view.
await h.put('daily_analytics', day, { date: day, visits: 7, totalUniqueVisitors: 7, productViews: 5 });

test('with the day\'s budget used up, visits and item events are answered as paused and nothing is written', async () => {
  assert.ok(7 * 6 + 5 * 4 >= BUDGET);
  const before = { daily: await h.doc('daily_analytics', day), lifetime: await h.doc('analytics_totals', 'lifetime'), dedup: (await h.docs('analytics_dedup')).length };

  const visit = await track({ event: 'visit', visitorId: 'vis_budget_one', path: '/' }, h.nextIp());
  assert.equal(visit.status, 200);
  assert.deepEqual(visit.body, { ok: true, counted: false, paused: true });
  const view = await track({ event: 'product_view', productId: product.id }, h.nextIp());
  assert.deepEqual(view.body, { ok: true, counted: false, paused: true });
  const cart = await track({ event: 'add_to_cart', visitorId: 'vis_budget_one' }, h.nextIp());
  assert.deepEqual(cart.body, { ok: true, counted: false, paused: true });

  assert.deepEqual(await h.doc('daily_analytics', day), before.daily);
  assert.deepEqual(await h.doc('analytics_totals', 'lifetime'), before.lifetime);
  assert.equal((await h.docs('analytics_dedup')).length, before.dedup);
  assert.equal(await h.doc('visitor_sessions', 'vis_budget_one'), null);
});

test('the pause is only for counting: the catalogue and the checkout quote still answer', async () => {
  const catalogue = await h.call('/api/admin-config?action=catalog&v=budget');
  assert.equal(catalogue.status, 200);
  assert.ok(catalogue.body.products.length > 0);
  const outfit = pickOutfit(h.exported('products'));
  await h.update('products', outfit.id, { stockQuantity: 3, inStock: true });
  const quote = await h.post('/api/orders', { action: 'quote', items: [lineOf(outfit, 1)] });
  assert.equal(quote.status, 200, quote.text);
});
