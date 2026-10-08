// Live visitor presence (api/_lib/presence.js): the storefront says which page a visitor is on, one row per
// visitor in a table of its own, and the admin's "live" action lists who is on the store right now.
// Run: node --test worker/test/scenarios/presence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startHarness } from '../harness/harness.mjs';
import { signInAdmin } from '../harness/admin.mjs';

const h = await startHarness();
// The table is not there yet on the live database: the Worker has to create it by itself on first use
await h.d1.prepare('DROP TABLE presence').run();
const admin = await signInAdmin(h);

const CF = { city: 'Jaipur', region: 'Rajasthan', country: 'IN' };
const who = { visitorId: 'vis_presence_one', ip: h.nextIp() };
const signal = (visitor, body, options = {}) => h.post('/api/track', { event: 'presence', visitorId: visitor.visitorId, ...body }, { ip: visitor.ip, cf: CF, ...options });
const view = (visitor, path, label, extra = {}, options = {}) => signal(visitor, { kind: 'view', path, label, ...extra }, options);
const row = (visitorId) => h.d1.prepare('SELECT * FROM presence WHERE visitor_id = ?').bind(visitorId).first();
const rowCount = () => h.d1.prepare('SELECT COUNT(*) AS n FROM presence').first('n');
/** Moves a visitor's last signal into the past, as if that much time had gone by. */
const age = (visitorId, ms) => h.d1.prepare('UPDATE presence SET last_seen = last_seen - ? WHERE visitor_id = ?').bind(ms, visitorId).run();
const live = (cookie = admin.cookie) => h.call('/api/admin-config?action=live', { cookie });
// "Today" is the day in India (UTC+5:30)
const IST_MS = 5.5 * 60 * 60 * 1000;
const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const istDayStart = (ms = Date.now()) => Date.parse(`${istDay(ms)}T00:00:00.000Z`) - IST_MS;
const publicId = (visitorId) => createHash('sha256').update(visitorId).digest('hex').slice(0, 8);

test('a view creates the missing table and one row with the city, the device and a one-step trail', async () => {
  const response = await view(who, '/', 'Home', { source: 'Instagram' });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body, { ok: true, counted: true });

  assert.equal(await rowCount(), 1);
  const stored = await row(who.visitorId);
  assert.deepEqual(
    { day: stored.day, path: stored.path, label: stored.label, pages: stored.pages, device: stored.device, source: stored.source, city: stored.city, region: stored.region, country: stored.country, signals: stored.signals },
    { day: istDay(), path: '/', label: 'Home', pages: 1, device: 'mobile', source: 'instagram', city: 'Jaipur', region: 'Rajasthan', country: 'IN', signals: 1 },
  );
  assert.equal(stored.first_seen, stored.last_seen);
  assert.deepEqual(JSON.parse(stored.trail), [{ t: stored.last_seen, path: '/', label: 'Home' }]);
  // The visitor's address is stored nowhere
  assert.ok(!JSON.stringify(stored).includes(who.ip));
  // The index the admin reads with exists too
  assert.equal(await h.d1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'presence_last_seen'").first('n'), 1);
});

test('a signal one second later is ignored and writes nothing', async () => {
  await age(who.visitorId, 1000);
  const before = await row(who.visitorId);
  const response = await view(who, '/shop', 'Shop');
  assert.deepEqual(response.body, { ok: true, counted: false });
  assert.deepEqual(await row(who.visitorId), before);
});

test('a second view moves the page, grows the trail and the page count; the source and first_seen stay', async () => {
  await age(who.visitorId, 20_000);
  const before = await row(who.visitorId);
  const response = await view(who, '/category/suits?utm_source=x', 'Shop: Suits', { source: 'somewhere-else' });
  assert.deepEqual(response.body, { ok: true, counted: true });

  const stored = await row(who.visitorId);
  assert.deepEqual(
    { path: stored.path, label: stored.label, pages: stored.pages, source: stored.source, first: stored.first_seen, signals: stored.signals },
    { path: '/category/suits', label: 'Shop: Suits', pages: 2, source: 'instagram', first: before.first_seen, signals: 2 },
  );
  assert.ok(stored.last_seen > before.last_seen);
  assert.deepEqual(JSON.parse(stored.trail).map((step) => [step.path, step.label]), [['/category/suits', 'Shop: Suits'], ['/', 'Home']]);
  assert.equal(await rowCount(), 1);
});

test('a heartbeat only moves last_seen', async () => {
  await age(who.visitorId, 60_000);
  const before = await row(who.visitorId);
  const response = await signal(who, { kind: 'beat', path: '/category/suits', label: 'Shop: Suits' }, { cf: { city: 'Delhi', region: 'Delhi', country: 'IN' } });
  assert.deepEqual(response.body, { ok: true, counted: true });
  assert.ok(response.d1Calls <= 3, `one signal used ${response.d1Calls} D1 calls`);

  const stored = await row(who.visitorId);
  assert.ok(stored.last_seen > before.last_seen);
  assert.deepEqual({ ...stored, last_seen: 0, signals: 0 }, { ...before, last_seen: 0, signals: 0 });
  assert.equal(stored.signals, before.signals + 1);
});

test('the trail keeps the last 12 views and a visitor is limited to 60 signals a day', async () => {
  const walker = { visitorId: 'vis_presence_walker', ip: h.nextIp() };
  for (let step = 1; step <= 14; step += 1) {
    assert.deepEqual((await view(walker, `/product/p${step}`, `Product: Suit ${step}`)).body, { ok: true, counted: true });
    await age(walker.visitorId, 10_000);
  }
  const stored = await row(walker.visitorId);
  assert.equal(stored.pages, 14);
  const trail = JSON.parse(stored.trail);
  assert.equal(trail.length, 12);
  assert.deepEqual([trail[0].path, trail.at(-1).path], ['/product/p14', '/product/p3']);

  await h.d1.prepare('UPDATE presence SET signals = 60 WHERE visitor_id = ?').bind(walker.visitorId).run();
  const before = await row(walker.visitorId);
  assert.deepEqual((await view(walker, '/cart', 'Bag')).body, { ok: true, counted: false });
  assert.deepEqual((await signal(walker, { kind: 'beat', path: '/cart', label: 'Bag' })).body, { ok: true, counted: false });
  assert.deepEqual(await row(walker.visitorId), before);
});

test('a bad visitor id or path is refused; crawlers, Do Not Track, other sites and the label are handled safely', async () => {
  const count = await rowCount();
  assert.equal((await signal({ visitorId: 'not a visitor id', ip: h.nextIp() }, { kind: 'view', path: '/', label: 'Home' })).status, 400);
  const stranger = { visitorId: 'vis_presence_stranger', ip: h.nextIp() };
  for (const path of ['shop', '', 'https://evil.example/', '//evil.example', '/a b', '/<script>']) {
    assert.equal((await view(stranger, path, 'Home')).status, 400, path);
  }
  assert.deepEqual((await view(stranger, '/', 'Home', {}, { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).body, { ok: true });
  assert.deepEqual((await view(stranger, '/', 'Home', {}, { headers: { dnt: '1' } })).body, { ok: true });
  assert.equal((await view(stranger, '/', 'Home', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal(await rowCount(), count);
  assert.equal(await row(stranger.visitorId), null);

  // The label is plain text of at most 80 characters; a request without Cloudflare's data still counts
  const response = await view(stranger, '/search', `Search: <b>${'silk '.repeat(40)}</b>`, {}, { cf: undefined });
  assert.deepEqual(response.body, { ok: true, counted: true });
  const stored = await row(stranger.visitorId);
  assert.ok(stored.label.length <= 80 && !/[<>]/.test(stored.label) && stored.label.startsWith('Search: bsilk'), stored.label);
  assert.deepEqual([stored.city, stored.region, stored.country, stored.source], ['', '', '', '']);
});

test('admin "live": needs the admin session, lists the visitor as active and never shows the raw visitor id', async () => {
  assert.equal((await live('')).status, 401);
  assert.equal((await live('sag_admin_session=forged')).status, 401);

  const response = await live();
  assert.equal(response.status, 200, response.text);
  const body = response.body;
  assert.deepEqual(Object.keys(body).sort(), ['active', 'activeCount', 'liveBudget', 'livePaused', 'now', 'paused', 'recent', 'todayByHour', 'todayCount', 'windowSeconds']);
  assert.equal(body.windowSeconds, 210);
  assert.equal(body.livePaused, false);
  assert.equal(body.liveBudget.limit, 30000);
  assert.ok(body.liveBudget.used > 0 && body.liveBudget.used % 2 === 0);
  assert.equal(body.paused, false);
  assert.ok(Math.abs(Date.parse(body.now) - Date.now()) < 5000);
  assert.equal(body.todayCount, 3);

  // The walker and the stranger have just been seen; the first visitor's last signal has not been aged since
  assert.equal(body.activeCount, body.active.length);
  const one = body.active.find((visitor) => visitor.id === publicId(who.visitorId));
  assert.ok(one, 'the first visitor is active');
  const stored = await row(who.visitorId);
  assert.deepEqual({ ...one, trail: one.trail.length }, {
    id: publicId(who.visitorId), city: 'Jaipur', region: 'Rajasthan', country: 'IN', device: 'mobile', source: 'instagram',
    path: '/category/suits', label: 'Shop: Suits', pages: 2,
    firstSeen: new Date(stored.first_seen).toISOString(), lastSeen: new Date(stored.last_seen).toISOString(), trail: 2,
  });
  assert.deepEqual(Object.keys(one.trail[0]).sort(), ['label', 'path', 't']);
  assert.equal(one.trail[0].t, new Date(JSON.parse(stored.trail)[0].t).toISOString());
  assert.ok(!response.text.includes('vis_presence'), 'the raw visitor id is never sent');
  assert.ok(!response.text.includes(who.ip));
  // Newest first, and read with two queries beside the session check
  assert.deepEqual(body.active.map((visitor) => visitor.lastSeen), body.active.map((visitor) => visitor.lastSeen).sort().reverse());
  const session = await h.call('/api/admin-config?action=session', { cookie: admin.cookie });
  assert.ok(response.d1Calls <= session.d1Calls + 3, `live used ${response.d1Calls} D1 calls, the session check ${session.d1Calls}`);
});

test('a visitor not seen for more than 210 seconds moves from "active" to "recent"', async () => {
  const before = (await live()).body;
  await age(who.visitorId, 150_000);
  assert.ok((await live()).body.active.some((visitor) => visitor.id === publicId(who.visitorId)), 'still active after 150 seconds');
  await age(who.visitorId, 61_000);
  const body = (await live()).body;
  assert.equal(body.activeCount, before.activeCount - 1);
  assert.ok(!body.active.some((visitor) => visitor.id === publicId(who.visitorId)));
  assert.equal(body.recent.filter((visitor) => visitor.id === publicId(who.visitorId)).length, 1);
  assert.equal(body.todayCount, before.todayCount);
  assert.ok(body.recent.length <= 40);
});

test('todayByHour: 24 numbers, today\'s visitors by the India-time hour they were first seen in', async () => {
  const start = istDayStart();
  const thisHour = Math.floor((Date.now() - start) / 3_600_000);
  const before = (await live()).body;
  assert.equal(before.todayByHour.length, 24);
  assert.ok(before.todayByHour.every((count) => Number.isInteger(count) && count >= 0));
  assert.equal(before.todayByHour.reduce((sum, count) => sum + count, 0), before.todayCount);
  assert.equal(before.todayCount, 3);
  // Everybody so far arrived during this test: this hour (or the one before, if the hour has just turned)
  assert.equal(before.todayByHour[thisHour] + (thisHour ? before.todayByHour[thisHour - 1] : 0), 3);

  // One of them first arrived just after midnight in India: that visitor moves to the first hour
  await h.d1.prepare('UPDATE presence SET first_seen = ? WHERE visitor_id = ?').bind(start + 60_000, who.visitorId).run();
  const moved = (await live()).body;
  assert.equal(moved.todayCount, 3);
  assert.equal(moved.todayByHour.reduce((sum, count) => sum + count, 0), 3);
  if (thisHour > 1) {
    assert.equal(moved.todayByHour[0], 1);
    assert.equal(moved.todayByHour[thisHour] + moved.todayByHour[thisHour - 1], 2);
  }
  // A visitor whose row is from yesterday (last seen before today began) is in no hour of today
  await h.d1.prepare("INSERT INTO presence (visitor_id, day, first_seen, last_seen, path, label) VALUES ('vis_presence_before', ?, ?, ?, '/', 'Home')")
    .bind(istDay(start - 1), start - 7_200_000, start - 3_600_000).run();
  const after = (await live()).body;
  assert.deepEqual(after.todayByHour, moved.todayByHour);
  assert.equal(after.todayCount, 3);
  await h.d1.prepare("DELETE FROM presence WHERE visitor_id = 'vis_presence_before'").run();
});

test('the read uses the last_seen index', async () => {
  const plan = await h.d1.prepare('EXPLAIN QUERY PLAN SELECT * FROM presence WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT ?').bind(0, 10).all();
  assert.match(plan.results.map((line) => line.detail).join(' | '), /presence_last_seen/);
  const byHour = await h.d1.prepare('EXPLAIN QUERY PLAN SELECT CAST((first_seen - ?) / 3600000 AS INTEGER) AS hour, COUNT(*) AS visitors FROM presence WHERE last_seen >= ? AND first_seen >= ? GROUP BY hour').bind(0, 0, 0).all();
  assert.match(byHour.results.map((line) => line.detail).join(' | '), /presence_last_seen/);
});

test('the hourly run deletes rows not seen for 48 hours and keeps the rest', async () => {
  const old = { visitorId: 'vis_presence_old', ip: h.nextIp() };
  await view(old, '/', 'Home');
  await age(old.visitorId, 3 * 24 * 60 * 60 * 1000);
  const yesterday = { visitorId: 'vis_presence_yesterday', ip: h.nextIp() };
  await view(yesterday, '/', 'Home');
  await age(yesterday.visitorId, 30 * 60 * 60 * 1000);
  const count = await rowCount();
  // Neither counts for today
  assert.equal((await live()).body.todayCount, count - 2);

  await h.worker.scheduled({ cron: '17 * * * *', scheduledTime: Date.now() }, h.workerEnv, { waitUntil() {} });
  assert.equal(await row(old.visitorId), null);
  assert.ok(await row(yesterday.visitorId));
  assert.equal(await rowCount(), count - 1);
  assert.ok(await row(who.visitorId));
});

// Last: it leaves counting paused for the rest of this file's life.
test('while the database itself refuses work, presence signals are answered and nothing is written', async () => {
  const db = h.workerEnv.DB;
  const realBatch = db.batch;
  // The next write batch fails as D1 does when it is overloaded (reads keep working): visit counting steps aside
  db.batch = async (statements) => {
    if (/^\s*SELECT/i.test(statements[0].statement.sql)) return realBatch(statements);
    throw new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.');
  };
  try {
    const visit = await h.post('/api/track', { event: 'visit', visitorId: 'vis_presence_refused', path: '/' }, { ip: h.nextIp() });
    assert.deepEqual(visit.body, { ok: true, counted: false, paused: true });
  } finally {
    db.batch = realBatch;
  }
  const count = await rowCount();
  const response = await view({ visitorId: 'vis_presence_refused', ip: h.nextIp() }, '/', 'Home');
  assert.deepEqual([response.status, response.body, response.d1Calls], [200, { ok: true, counted: false, paused: true }, 0]);
  assert.equal(await rowCount(), count);
  assert.equal((await live()).body.paused, true);
});
