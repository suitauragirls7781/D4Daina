import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from './_lib/firebaseAdmin.js';
import { cleanText, clientIp, isSameOrigin, parseBody, reply } from './_lib/http.js';
import { effectivePlan } from './_lib/usage.js';
import { cleanPresencePath, presenceBudget, recordPresence } from './_lib/presence.js';

// Anonymous visitor counting. Browsers can no longer write analytics directly; each count is made here,
// at most once per visitor (IP + browser) per day and event, with a cap per IP so a script can't inflate numbers.
// Purchases are not counted here: they are counted when a payment is verified (api/_lib/orders.js).

const EVENTS = {
  visit: { field: 'totalUniqueVisitors', label: (path) => `Visited ${path}` },
  add_to_cart: { field: 'cartAdditions', label: () => 'Added item to cart' },
  checkout_initiated: { field: 'checkoutsInitiated', label: () => 'Initiated checkout' },
};
const MAX_NEW_VISITORS_PER_IP_PER_DAY = 40;
// A visit = a session. Coming back after 30 minutes away counts as another visit (lifetime and daily).
const SESSION_GAP_MS = 30 * 60 * 1000;
const MAX_VISITS_PER_IP_PER_DAY = 150;
const ITEM_EVENTS = new Set(['product_view', 'wishlist_add', 'search', 'reel_view', 'reel_click', 'feature_use']);
// Feature usage counters (item = feature name): visual search, AI assistant, recommendation clicks, bundles...
const FEATURE_NAMES = new Set(['visual_search', 'assistant', 'reco_click', 'complete_look_add', 'bundle_add', 'gift_finder', 'compare_open']);
const MAX_ITEM_EVENTS_PER_IP_PER_DAY = 300;
const VISITOR_ID = /^vis_[a-z0-9_]{4,40}$/;

const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 24);

// Daily write budget. The database's free plan allows a fixed number of writes a day, shared with orders,
// payments and the admin panel. Visitor counting may use only part of it: once today's counting has used
// its share (or the database is already refusing writes), counting pauses until tomorrow and the rest of
// the day's allowance is kept for orders. The storefront itself is not affected.
const FREE_WRITE_BUDGET = Number(process.env.TRACK_WRITE_BUDGET) || 8000;
// Paid plan: 50 million rows written a month are included, so counting only stops at a very high daily number
const PAID_WRITE_BUDGET = 600000;
// The plan is the owner's switch in Admin -> Usage & limits (api/_lib/usage.js), looked up again once a minute
let TRACK_WRITE_BUDGET = FREE_WRITE_BUDGET;
let plan = 'free';
let budget = { day: '', at: 0, used: 0 };
const isQuotaError = (error) => error?.code === 8 || /RESOURCE_EXHAUSTED|quota/i.test(String(error?.message || ''));
const pauseCounting = (day) => { budget = { day, at: Date.now() + 9 * 60 * 1000, used: Infinity }; }; // checked again in 10 minutes
const countingPaused = async (db, day) => {
  if (budget.day === day && Date.now() - budget.at < 60 * 1000) return budget.used >= TRACK_WRITE_BUDGET;
  try {
    plan = await effectivePlan(db);
    TRACK_WRITE_BUDGET = plan === 'paid' ? PAID_WRITE_BUDGET : FREE_WRITE_BUDGET;
    const d = (await db.collection('daily_analytics').doc(day).get()).data() || {};
    const n = (key) => Number(d[key]) || 0;
    // roughly what today's counting has written so far (6 per visit, 4 per item event, 2-3 for the rest)
    const used = n('visits') * 6 + (n('productViews') + n('wishlistAdds') + n('searches')) * 4 + (n('cartAdditions') + n('checkoutsInitiated')) * 3;
    budget = { day, at: Date.now(), used };
  } catch (error) {
    console.warn('Visitor counting paused, the database is not answering:', error?.message || error);
    pauseCounting(day);
  }
  return budget.used >= TRACK_WRITE_BUDGET;
};

// The database itself is refusing work (pauseCounting), as opposed to the counting budget being used up
const databaseRefusing = () => budget.used === Infinity;

/** For the admin's live view: is visitor counting paused right now, and which plan sets the budgets? */
export const countingState = async (db = firestore()) => ({ paused: await countingPaused(db, new Date().toISOString().slice(0, 10)), plan });

const deviceType = (ua) => {
  if (/Instagram|FBAV|FBAN|FB_IAB/i.test(ua)) return 'instagram_webview';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Forbidden.' });

  const ua = String(req.headers['user-agent'] || '').slice(0, 300);
  // Crawlers and link previews are not visitors
  if (!ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i.test(ua)) return reply(res, 200, { ok: true });

  const body = parseBody(req);
  const day = new Date().toISOString().slice(0, 10);
  const ip = clientIp(req);
  const db = firestore();
  const now = new Date().toISOString();
  const visitCountingPaused = await countingPaused(db, day);

  // Live presence (api/_lib/presence.js): "this visitor is on this page now". A view on each page change and a
  // heartbeat every two minutes; one row write per accepted signal, limited per visitor from the row itself.
  // It has a daily budget of its own: it neither uses nor waits for the visit counting budget. It stops only
  // when its own budget is used up or the database itself is refusing work.
  if (body.event === 'presence') {
    const visitorId = String(body.visitorId || '');
    const path = cleanPresencePath(body.path);
    if (!VISITOR_ID.test(visitorId) || !path) return reply(res, 400, { error: 'Invalid event.' });
    // A browser that asks not to be tracked is not followed, even if the page sent the signal
    if (req.headers.dnt === '1' || req.headers['sec-gpc'] === '1') return reply(res, 200, { ok: true });
    if (databaseRefusing() || (await presenceBudget(plan)).paused) return reply(res, 200, { ok: true, counted: false, paused: true });
    try {
      const counted = await recordPresence({
        visitorId,
        kind: body.kind === 'beat' ? 'beat' : 'view',
        path,
        label: body.label,
        source: body.source,
        device: deviceType(ua),
        cf: req.cf,
      });
      return reply(res, 200, { ok: true, counted });
    } catch (error) {
      console.error('Presence signal failed:', error?.message || error);
      if (isQuotaError(error)) pauseCounting(day);
      // Never an error for the page: presence is only a view for the owner
      return reply(res, 200, { ok: true, counted: false });
    }
  }

  if (visitCountingPaused) return reply(res, 200, { ok: true, counted: false, paused: true });

  // Product views, wishlist saves and search terms: once per visitor per item per day.
  // product_daily powers honest social proof ("N people saved this today") and admin insights.
  if (ITEM_EVENTS.has(body.event)) {
    const event = body.event;
    const item = event === 'search'
      ? cleanText(body.term, 60).toLowerCase().replace(/\s+/g, ' ')
      : cleanText(body.productId || body.reelId || body.feature, 60).replace(/[^A-Za-z0-9_-]/g, '');
    if (!item || (event === 'search' && item.length < 2)) return reply(res, 400, { error: 'Invalid event.' });
    if (event === 'feature_use' && !FEATURE_NAMES.has(item)) return reply(res, 400, { error: 'Invalid event.' });
    try {
      if ((event === 'product_view' || event === 'wishlist_add') && !(await db.collection('products').doc(item).get()).exists) return reply(res, 404, { error: 'Unknown product.' });
      const counted = await db.runTransaction(async (tx) => {
        const dedupRef = db.collection('analytics_dedup').doc(`${day}_${event}_${hash(`${ip}|${ua}|${item}`)}`);
        const ipRef = db.collection('analytics_dedup').doc(`${day}_ipitems_${hash(ip)}`);
        const [dedupSnap, ipSnap] = await tx.getAll(dedupRef, ipRef);
        if (dedupSnap.exists || (Number(ipSnap.data()?.count) || 0) >= MAX_ITEM_EVENTS_PER_IP_PER_DAY) return false;
        tx.set(dedupRef, { day, createdAt: now });
        tx.set(ipRef, { day, count: FieldValue.increment(1) }, { merge: true });
        if (event === 'search') {
          tx.set(db.collection('search_terms').doc(`${day}_${hash(item)}`), { day, term: item, count: FieldValue.increment(1) }, { merge: true });
          tx.set(db.collection('daily_analytics').doc(day), { date: day, searches: FieldValue.increment(1) }, { merge: true });
        } else if (event === 'reel_view' || event === 'reel_click' || event === 'feature_use') {
          const field = event === 'reel_view' ? 'views' : event === 'reel_click' ? 'productClicks' : 'uses';
          tx.set(db.collection('feature_daily').doc(`${day}_${event}_${item}`), { day, event, item, [field]: FieldValue.increment(1) }, { merge: true });
        } else {
          const field = event === 'product_view' ? 'views' : 'wishlists';
          tx.set(db.collection('product_daily').doc(`${day}_${item}`), { day, productId: item, [field]: FieldValue.increment(1) }, { merge: true });
          tx.set(db.collection('daily_analytics').doc(day), { date: day, [event === 'product_view' ? 'productViews' : 'wishlistAdds']: FieldValue.increment(1) }, { merge: true });
        }
        return true;
      });
      return reply(res, 200, { ok: true, counted });
    } catch (error) {
      console.error('Item tracking failed:', error?.message || error);
      if (isQuotaError(error)) { pauseCounting(day); return reply(res, 200, { ok: true, counted: false, paused: true }); }
      return reply(res, 500, { error: 'Could not record the event.' });
    }
  }

  const event = EVENTS[body.event] ? body.event : '';
  const visitorId = String(body.visitorId || '');
  if (!event || !VISITOR_ID.test(visitorId)) return reply(res, 400, { error: 'Invalid event.' });
  const path = cleanText(body.path, 120) || '/';
  const utmSource = cleanText(body.utm_source, 40).toLowerCase();
  const fbclid = cleanText(body.fbclid, 200);

  try {
    const sessionRef = db.collection('visitor_sessions').doc(visitorId);
    const result = await db.runTransaction(async (tx) => {
      const dedupRef = db.collection('analytics_dedup').doc(`${day}_${event}_${hash(`${ip}|${ua}`)}`);
      const ipRef = db.collection('analytics_dedup').doc(`${day}_ip_${hash(ip)}`);
      if (event !== 'visit') {
        const [dedupSnap] = await tx.getAll(dedupRef);
        if (dedupSnap.exists) return { daily: false };
        tx.set(dedupRef, { day, createdAt: now });
        tx.set(db.collection('daily_analytics').doc(day), { date: day, [EVENTS[event].field]: FieldValue.increment(1) }, { merge: true });
        return { daily: true };
      }

      // Visits: one "unique visitor" per device per day, plus one visit per session (repeat visits count again).
      // Lifetime totals only ever go up (analytics_totals/lifetime); nothing resets them.
      const sessRef = db.collection('analytics_dedup').doc(`sess_${hash(`${ip}|${ua}`)}`);
      const [dedupSnap, ipSnap, sessSnap, knownSnap] = await tx.getAll(dedupRef, ipRef, sessRef, sessionRef);
      const ipData = ipSnap.data() || {};
      const nowMs = Date.parse(now);
      const newDaily = !dedupSnap.exists && (Number(ipData.visits) || 0) < MAX_NEW_VISITORS_PER_IP_PER_DAY;
      const newSession = nowMs - (Number(sessSnap.data()?.lastSeen) || 0) > SESSION_GAP_MS
        && (Number(ipData.sessions) || 0) < MAX_VISITS_PER_IP_PER_DAY;
      const returning = knownSnap.exists;
      if (!newDaily && !newSession) return { daily: false, visit: false, returning };

      tx.set(sessRef, { lastSeen: nowMs, day });
      tx.set(ipRef, { day, ...(newDaily ? { visits: FieldValue.increment(1) } : {}), ...(newSession ? { sessions: FieldValue.increment(1) } : {}) }, { merge: true });
      const daily = { date: day };
      if (newDaily) {
        tx.set(dedupRef, { day, createdAt: now });
        const isInstagram = utmSource === 'instagram' || Boolean(fbclid) || deviceType(ua) === 'instagram_webview';
        daily.totalUniqueVisitors = FieldValue.increment(1);
        daily[isInstagram ? 'instagramVisitors' : 'otherVisitors'] = FieldValue.increment(1);
        if (returning) daily.returningVisitors = FieldValue.increment(1);
      }
      if (newSession) daily.visits = FieldValue.increment(1);
      tx.set(db.collection('daily_analytics').doc(day), daily, { merge: true });
      // A device seen for the first time ever (no visitor record yet) is a new lifetime visitor
      const totals = { updatedAt: now };
      if (newSession) totals.visits = FieldValue.increment(1);
      if (newDaily && !returning) totals.uniqueVisitors = FieldValue.increment(1);
      tx.set(db.collection('analytics_totals').doc('lifetime'), totals, { merge: true });
      return { daily: newDaily, visit: newSession, returning };
    });
    if (!result.daily && !result.visit) return reply(res, 200, { ok: true, counted: false });

    const action = { time: now, type: event === 'visit' ? 'page_view' : event, path, label: EVENTS[event].label(path) };
    if (event === 'visit' && !result.daily) {
      // Same device came back later today: add to its record instead of starting a new one
      await sessionRef.update({ lastActive: now, page: path, visitCount: FieldValue.increment(1), actions: FieldValue.arrayUnion({ ...action, label: `Came back · ${path}` }) }).catch((error) => {
        if (error?.code !== 5) throw error;
      });
    } else if (event === 'visit') {
      await sessionRef.set({
        id: visitorId,
        sessionId: visitorId,
        date: day,
        firstSeen: now,
        lastActive: now,
        deviceType: deviceType(ua),
        deviceModel: cleanText(body.deviceModel, 60),
        browser: cleanText(body.browser, 40),
        userAgent: ua,
        utm_source: utmSource || (fbclid ? 'meta_ads' : 'direct'),
        utm_medium: cleanText(body.utm_medium, 40),
        utm_campaign: cleanText(body.utm_campaign, 80),
        fbclid,
        referrer: cleanText(body.referrer, 200),
        page: path,
        returning: Boolean(result.returning),
        visitCount: 1,
        actions: [action],
      });
    } else {
      // Only adds to a session that was recorded as a visit; never creates a half-empty one
      await sessionRef.update({ lastActive: now, actions: FieldValue.arrayUnion(action) }).catch((error) => {
        if (error?.code !== 5) throw error;
      });
    }
    return reply(res, 200, { ok: true, counted: true });
  } catch (error) {
    console.error('Visitor tracking failed:', error?.message || error);
    if (isQuotaError(error)) { pauseCounting(day); return reply(res, 200, { ok: true, counted: false, paused: true }); }
    return reply(res, 500, { error: 'Could not record the visit.' });
  }
}
