// Scenario 9: visitor counting (api/track.js). Each visitor, product view and add-to-cart is counted once a
// day, crawlers are not counted, and the counters only move by what was really counted.
// Run: node --test worker/test/scenarios/tracking.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';

const h = await startHarness();

const product = h.exported('products')[0];
const day = h.today();
const track = (body, options) => h.post('/api/track', body, options);
const number = (value) => Number(value) || 0;
const daily = async () => (await h.doc('daily_analytics', day)) || {};
const lifetime = async () => (await h.doc('analytics_totals', 'lifetime')) || {};
/** How much each named counter of a document grew between two readings. */
const growth = (before, after, fields) => Object.fromEntries(fields.map((field) => [field, number(after[field]) - number(before[field])]));
const DAILY_FIELDS = ['totalUniqueVisitors', 'visits', 'otherVisitors', 'instagramVisitors', 'returningVisitors', 'productViews', 'wishlistAdds', 'searches', 'cartAdditions', 'checkoutsInitiated', 'purchases'];
const NOTHING = Object.fromEntries(DAILY_FIELDS.map((field) => [field, 0]));

const visitor = { visitorId: 'vis_harness_one', ip: h.nextIp() };
const visit = (who, extra = {}, options = {}) => track({ event: 'visit', visitorId: who.visitorId, path: '/shop', browser: 'Chrome', deviceModel: 'Pixel 8', ...extra }, { ip: who.ip, ...options });

test('visit: a new visitor is counted once for the day, in the daily and the lifetime totals, with a session record', async () => {
  const [dailyBefore, lifetimeBefore] = [await daily(), await lifetime()];
  const response = await visit(visitor, { utm_source: 'Google', referrer: 'https://www.google.com/' });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body, { ok: true, counted: true });

  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), { ...NOTHING, totalUniqueVisitors: 1, visits: 1, otherVisitors: 1 });
  assert.equal((await daily()).date, day);
  assert.deepEqual(growth(lifetimeBefore, await lifetime(), ['visits', 'uniqueVisitors']), { visits: 1, uniqueVisitors: 1 });

  const session = await h.doc('visitor_sessions', visitor.visitorId);
  assert.deepEqual(
    { id: session.id, date: session.date, deviceType: session.deviceType, deviceModel: session.deviceModel, browser: session.browser, utm: session.utm_source, page: session.page, returning: session.returning, visitCount: session.visitCount },
    { id: visitor.visitorId, date: day, deviceType: 'mobile', deviceModel: 'Pixel 8', browser: 'Chrome', utm: 'google', page: '/shop', returning: false, visitCount: 1 },
  );
  assert.deepEqual(session.actions.map((action) => [action.type, action.path]), [['page_view', '/shop']]);
  // The visitor's address is never stored, only a hash of it in the de-duplication keys
  assert.ok(!JSON.stringify(await h.docs('analytics_dedup')).includes(visitor.ip));
  assert.ok(!JSON.stringify(session).includes(visitor.ip));
});

test('visit: the same visitor again the same day is not counted again', async () => {
  const [dailyBefore, lifetimeBefore, sessionBefore] = [await daily(), await lifetime(), await h.doc('visitor_sessions', visitor.visitorId)];
  for (const path of ['/shop', '/product/x', '/']) {
    const response = await visit(visitor, { path });
    assert.deepEqual(response.body, { ok: true, counted: false });
  }
  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), NOTHING);
  assert.deepEqual(growth(lifetimeBefore, await lifetime(), ['visits', 'uniqueVisitors']), { visits: 0, uniqueVisitors: 0 });
  assert.deepEqual(await h.doc('visitor_sessions', visitor.visitorId), sessionBefore);
});

test('visit: coming back after more than 30 minutes is another visit, not another visitor', async () => {
  const sessions = (await h.docs('analytics_dedup')).filter((row) => row.id.startsWith('sess_'));
  assert.equal(sessions.length, 1);
  await h.update('analytics_dedup', sessions[0].id, { lastSeen: Date.now() - 31 * 60 * 1000 });
  const [dailyBefore, lifetimeBefore] = [await daily(), await lifetime()];

  const response = await visit(visitor, { path: '/category/suits' });
  assert.deepEqual(response.body, { ok: true, counted: true });
  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), { ...NOTHING, visits: 1 });
  assert.deepEqual(growth(lifetimeBefore, await lifetime(), ['visits', 'uniqueVisitors']), { visits: 1, uniqueVisitors: 0 });
  const session = await h.doc('visitor_sessions', visitor.visitorId);
  assert.equal(session.visitCount, 2);
  assert.deepEqual(session.actions.map((action) => action.label), ['Visited /shop', 'Came back · /category/suits']);
});

test('visit: Instagram visitors are counted as such; a known device on a new network is a returning visitor', async () => {
  const dailyBefore = await daily();
  const instagram = { visitorId: 'vis_harness_insta', ip: h.nextIp() };
  await visit(instagram, {}, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0' });
  await visit({ visitorId: 'vis_harness_utm', ip: h.nextIp() }, { utm_source: 'instagram' });
  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), { ...NOTHING, totalUniqueVisitors: 2, visits: 2, instagramVisitors: 2 });
  assert.equal((await h.doc('visitor_sessions', instagram.visitorId)).deviceType, 'instagram_webview');

  const [again, lifetimeBefore] = [await daily(), await lifetime()];
  await visit({ visitorId: visitor.visitorId, ip: h.nextIp() });
  assert.deepEqual(growth(again, await daily(), DAILY_FIELDS), { ...NOTHING, totalUniqueVisitors: 1, visits: 1, otherVisitors: 1, returningVisitors: 1 });
  // A returning device is not a new lifetime visitor
  assert.deepEqual(growth(lifetimeBefore, await lifetime(), ['visits', 'uniqueVisitors']), { visits: 1, uniqueVisitors: 0 });
});

test('product_view: once per visitor per product per day; unknown products are refused', async () => {
  const dailyBefore = await daily();
  const key = `${day}_${product.id}`;
  const viewsBefore = number((await h.doc('product_daily', key))?.views);
  const view = (who, productId = product.id) => track({ event: 'product_view', productId }, { ip: who.ip });

  assert.deepEqual((await view(visitor)).body, { ok: true, counted: true });
  assert.deepEqual((await view(visitor)).body, { ok: true, counted: false });
  assert.deepEqual((await view(visitor)).body, { ok: true, counted: false });
  assert.deepEqual((await view({ ip: h.nextIp() })).body, { ok: true, counted: true });

  const stored = await h.doc('product_daily', key);
  assert.deepEqual({ day: stored.day, productId: stored.productId, views: stored.views - viewsBefore }, { day, productId: product.id, views: 2 });
  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), { ...NOTHING, productViews: 2 });

  const unknown = await view(visitor, 'no-such-product');
  assert.equal(unknown.status, 404);
  assert.equal(await h.doc('product_daily', `${day}_no-such-product`), null);
  // The public counter a product page reads is open to shoppers through the data gateway
  const publicRead = await h.post('/api/db', { ops: [{ op: 'get', path: `product_daily/${key}` }] });
  assert.equal(publicRead.body.results[0].data.views, stored.views);
});

test('wishlist_add and search are counted per item; add_to_cart and checkout once per visitor per day', async () => {
  const dailyBefore = await daily();
  const who = { ip: visitor.ip };
  assert.equal((await track({ event: 'wishlist_add', productId: product.id }, who)).body.counted, true);
  assert.equal((await track({ event: 'wishlist_add', productId: product.id }, who)).body.counted, false);
  assert.equal((await track({ event: 'search', term: '  Anarkali   SUIT ' }, who)).body.counted, true);
  assert.equal((await track({ event: 'search', term: 'anarkali suit' }, who)).body.counted, false);
  assert.equal((await track({ event: 'search', term: 'a' }, who)).status, 400);

  for (const event of ['add_to_cart', 'checkout_initiated']) {
    assert.deepEqual((await track({ event, visitorId: visitor.visitorId, path: '/cart' }, who)).body, { ok: true, counted: true });
    assert.deepEqual((await track({ event, visitorId: visitor.visitorId, path: '/cart' }, who)).body, { ok: true, counted: false });
  }
  assert.deepEqual(growth(dailyBefore, await daily(), DAILY_FIELDS), { ...NOTHING, wishlistAdds: 1, searches: 1, cartAdditions: 1, checkoutsInitiated: 1 });

  const terms = (await h.docs('search_terms')).filter((row) => row.data.day === day && row.data.term === 'anarkali suit');
  assert.deepEqual(terms.map((row) => row.data.count), [1]);
  assert.equal((await h.doc('product_daily', `${day}_${product.id}`)).wishlists, 1);
  // The actions were added to the visitor's session, each once
  const session = await h.doc('visitor_sessions', visitor.visitorId);
  assert.deepEqual(session.actions.slice(-2).map((action) => action.type), ['add_to_cart', 'checkout_initiated']);
});

test('feature_use and reel events count known names only', async () => {
  const who = { ip: visitor.ip };
  assert.equal((await track({ event: 'feature_use', feature: 'visual_search' }, who)).body.counted, true);
  assert.equal((await track({ event: 'feature_use', feature: 'visual_search' }, who)).body.counted, false);
  assert.equal((await track({ event: 'feature_use', feature: 'made_up_feature' }, who)).status, 400);
  assert.equal((await track({ event: 'reel_view', reelId: 'reel-1' }, who)).body.counted, true);
  assert.equal((await h.doc('feature_daily', `${day}_feature_use_visual_search`)).uses, 1);
  assert.equal((await h.doc('feature_daily', `${day}_reel_view_reel-1`)).views, 1);
});

test('crawlers, link previews and requests without a user agent are answered but never counted', async () => {
  const before = { daily: await daily(), lifetime: await lifetime(), sessions: (await h.docs('visitor_sessions')).length, dedup: (await h.docs('analytics_dedup')).length };
  const agents = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/140.0.0.0 Safari/537.36',
    'WhatsApp/2.23 Preview',
    null,
  ];
  for (const ua of agents) {
    const ip = h.nextIp();
    const visited = await track({ event: 'visit', visitorId: 'vis_harness_bot', path: '/' }, { ip, ua });
    assert.deepEqual(visited.body, { ok: true }, String(ua));
    const viewed = await track({ event: 'product_view', productId: product.id }, { ip, ua });
    assert.deepEqual(viewed.body, { ok: true }, String(ua));
  }
  assert.deepEqual(await daily(), before.daily);
  assert.deepEqual(await lifetime(), before.lifetime);
  assert.equal((await h.docs('visitor_sessions')).length, before.sessions);
  assert.equal((await h.docs('analytics_dedup')).length, before.dedup);
  assert.equal(await h.doc('visitor_sessions', 'vis_harness_bot'), null);
});

test('invalid events, other sites and other methods are refused; browsers cannot write the counters themselves', async () => {
  const before = await daily();
  assert.equal((await track({ event: 'visit', visitorId: 'not a visitor id' })).status, 400);
  assert.equal((await track({ event: 'purchase', visitorId: 'vis_harness_one' })).status, 400);
  assert.equal((await track({ event: 'visit', visitorId: 'vis_harness_x' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await track({ event: 'visit', visitorId: 'vis_harness_x' }, { origin: null })).status, 403);
  assert.equal((await h.call('/api/track')).status, 405);
  const direct = await h.post('/api/db', { ops: [
    { op: 'set', path: `daily_analytics/${day}`, data: { purchases: 999 }, merge: true },
    { op: 'set', path: `product_daily/${day}_${product.id}`, data: { views: 999 }, merge: true },
    { op: 'get', path: `daily_analytics/${day}` },
  ] });
  assert.deepEqual(direct.body.results.map((result) => result.error?.code), ['permission-denied', 'permission-denied', 'permission-denied']);
  assert.deepEqual(await daily(), before);
});

test('one network: at most 40 new visitors a day are counted from the same address', async () => {
  const ip = h.nextIp();
  const before = await daily();
  // 40 different browsers behind one address are counted ...
  for (let index = 1; index <= 40; index += 1) {
    const response = await track({ event: 'visit', visitorId: `vis_harness_nat_${index}`, path: '/' }, { ip, ua: `Mozilla/5.0 Chrome/140 Device/${index}` });
    assert.deepEqual(response.body, { ok: true, counted: true }, `visitor ${index}`);
  }
  // ... the 41st still gets a visit, but no longer counts as a new visitor
  const extra = await track({ event: 'visit', visitorId: 'vis_harness_nat_41', path: '/' }, { ip, ua: 'Mozilla/5.0 Chrome/140 Device/41' });
  assert.equal(extra.status, 200);
  assert.deepEqual(growth(before, await daily(), ['totalUniqueVisitors', 'visits']), { totalUniqueVisitors: 40, visits: 41 });
});
