import { createHash } from 'node:crypto';
import { cleanText } from './http.js';

// Live visitor presence: who is on the store right now and what they are looking at.
// One small table of its own in D1 (not the document store, which would also bump a collection version):
// one row per visitor, rewritten by one statement per accepted signal. The visitor's address is never stored;
// the city comes from Cloudflare's own request data.

/** Kept in step with worker/schema.sql and migration/presence-table.sql. */
export const PRESENCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS presence (visitor_id TEXT PRIMARY KEY, day TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 1, trail TEXT NOT NULL DEFAULT '[]', device TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', signals INTEGER NOT NULL DEFAULT 1)`,
  'CREATE INDEX IF NOT EXISTS presence_last_seen ON presence (last_seen)',
];

// The storefront sends a heartbeat every 120 seconds (src/utils/presence.ts): one may be late or lost
export const ACTIVE_WINDOW_SECONDS = 210;
const MIN_GAP_MS = 5 * 1000;
const MAX_SIGNALS_PER_DAY = 60;
const TRAIL_LENGTH = 12;
const KEEP_MS = 48 * 60 * 60 * 1000;
const MAX_ACTIVE_LISTED = 200;
const MAX_RECENT_LISTED = 40;

// The Worker hands its D1 binding over at the start of each request (worker/src/index.js)
let db = null;
let ready = null;
export const setPresenceDb = (value) => { db = value || null; };

/** Creates the table if it is missing: once per isolate, tried again after a failure. */
const ensureTable = () => {
  if (!ready) {
    ready = db.batch(PRESENCE_SCHEMA.map((sql) => db.prepare(sql))).catch((error) => { ready = null; throw error; });
  }
  return ready;
};

// "Today" is the owner's day: India time (UTC+5:30, no summer time)
const IST_MS = 5.5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const dayOf = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const dayStart = (ms) => Date.parse(`${dayOf(ms)}T00:00:00.000Z`) - IST_MS;
const plain = (value, max) => cleanText(String(value ?? '').replace(/[<>]/g, ''), max);

/** A storefront path ("/shop"), without query or fragment; '' when it is not one. */
export const cleanPresencePath = (value) => {
  const path = cleanText(String(value ?? '').split(/[?#]/)[0], 160);
  return /^\/(?!\/)[^\s<>"'\\]*$/.test(path) ? path : '';
};

const readTrail = (text) => {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((step) => step && typeof step.path === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * One signal from a browser. kind 'beat' only moves last_seen; anything else is a page view.
 * Returns true when it was written (one statement), false when it was ignored: too soon after this visitor's
 * last signal, or past the visitor's daily cap. The limits are read from the row itself.
 */
export const recordPresence = async ({ visitorId, kind, path, label, source, device, cf }, now = Date.now()) => {
  if (!db) return false;
  await ensureTable();
  const day = dayOf(now);
  const row = await db.prepare('SELECT day, first_seen, last_seen, pages, trail, source, signals FROM presence WHERE visitor_id = ?').bind(visitorId).first();
  if (row && now - Number(row.last_seen) < MIN_GAP_MS) return false;
  const sameDay = Boolean(row) && row.day === day;
  if (sameDay && Number(row.signals) >= MAX_SIGNALS_PER_DAY) return false;

  const written = () => {
    if (spent.day === day) spent.used += ROWS_PER_SIGNAL;
    return true;
  };
  if (kind === 'beat' && sameDay) {
    await db.prepare('UPDATE presence SET last_seen = ?, signals = signals + 1 WHERE visitor_id = ?').bind(now, visitorId).run();
    return written();
  }

  const text = plain(label, 80) || path;
  const trail = [{ t: now, path, label: text }, ...(sameDay ? readTrail(row.trail) : [])].slice(0, TRAIL_LENGTH);
  await db.prepare(`INSERT INTO presence (visitor_id, day, first_seen, last_seen, path, label, pages, trail, device, source, city, region, country, signals)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(visitor_id) DO UPDATE SET day = excluded.day, first_seen = excluded.first_seen, last_seen = excluded.last_seen, path = excluded.path,
      label = excluded.label, pages = excluded.pages, trail = excluded.trail, device = excluded.device, source = excluded.source,
      city = excluded.city, region = excluded.region, country = excluded.country, signals = excluded.signals`)
    .bind(
      visitorId, day, sameDay ? Number(row.first_seen) : now, now, path, text,
      sameDay ? Number(row.pages) + 1 : 1,
      JSON.stringify(trail),
      plain(device, 30),
      (sameDay && row.source) || plain(source, 40).toLowerCase(),
      plain(cf?.city, 60), plain(cf?.region, 60), plain(cf?.country, 8),
      sameDay ? Number(row.signals) + 1 : 1,
    ).run();
  return written();
};

// Presence has a daily write budget of its own (rows a day, India day), apart from the visit counting budget in
// api/track.js: when it is used up presence stops until tomorrow and visit counting carries on untouched.
const ROWS_PER_SIGNAL = 2; // measured on local D1: the row and its last_seen index entry
const PAID_PRESENCE_BUDGET = 400000;
const freeBudget = () => Number(process.env.PRESENCE_WRITE_BUDGET) || 30000;
const BUDGET_CACHE_MS = 60 * 1000;
// Far from the limit the table is asked less often: every accepted signal is added to the remembered number anyway
const BUDGET_CACHE_FAR_MS = 5 * 60 * 1000;
let spent = { day: '', at: 0, used: 0 };

/**
 * { used, limit, paused } in rows for today. Measured from the table itself (today's signals x 2), remembered
 * per isolate for a minute (five while less than 80% is used). Never throws: a table that is not there yet
 * means nothing has been written.
 */
export const presenceBudget = async (plan = 'free', now = Date.now()) => {
  const limit = plan === 'paid' ? PAID_PRESENCE_BUDGET : freeBudget();
  const day = dayOf(now);
  const age = now - spent.at;
  const fresh = spent.day === day && age >= 0 && age < (spent.used >= limit * 0.8 ? BUDGET_CACHE_MS : BUDGET_CACHE_FAR_MS);
  if (!fresh && db) {
    try {
      // last_seen narrows it to today's rows through the index; `day` leaves out a row whose day has not begun again
      const signals = Number(await db.prepare('SELECT COALESCE(SUM(signals), 0) AS n FROM presence WHERE last_seen >= ? AND day = ?').bind(dayStart(now), day).first('n')) || 0;
      spent = { day, at: now, used: signals * ROWS_PER_SIGNAL };
    } catch {
      if (spent.day !== day) spent = { day, at: 0, used: 0 };
    }
  }
  const used = spent.day === day ? spent.used : 0;
  return { used, limit, paused: used >= limit };
};

const iso = (ms) => new Date(Number(ms) || 0).toISOString();
const toVisitor = (row) => ({
  // Never the visitor id itself: a short hash is enough to tell two visitors apart
  id: createHash('sha256').update(String(row.visitor_id)).digest('hex').slice(0, 8),
  city: row.city || '',
  region: row.region || '',
  country: row.country || '',
  device: row.device || '',
  source: row.source || '',
  path: row.path,
  label: row.label,
  pages: Number(row.pages) || 0,
  firstSeen: iso(row.first_seen),
  lastSeen: iso(row.last_seen),
  trail: readTrail(row.trail).map((step) => ({ t: iso(step.t), path: step.path, label: String(step.label || '') })),
});

/** What the admin dashboard shows. Two queries, both on the last_seen index. */
export const readLive = async ({ paused = false, plan = 'free' } = {}, now = Date.now()) => {
  const budget = await presenceBudget(plan, now);
  const answer = {
    now: iso(now), windowSeconds: ACTIVE_WINDOW_SECONDS, paused: Boolean(paused), activeCount: 0, active: [], recent: [], todayCount: 0, todayByHour: Array(24).fill(0),
    // paused = visit counting is paused; livePaused = presence has used its own budget for today
    livePaused: budget.paused, liveBudget: { used: budget.used, limit: budget.limit },
  };
  if (!db) return answer;
  await ensureTable();
  const since = dayStart(now);
  const cutoff = now - ACTIVE_WINDOW_SECONDS * 1000;
  // Query 1: today's visitors by the hour (India time) they were first seen in, and how many of them are active.
  // A row seen today always has last_seen >= first_seen >= the start of today, so the index narrows it.
  const hours = await db.prepare(`SELECT CAST((first_seen - ?) / ${HOUR_MS} AS INTEGER) AS hour, COUNT(*) AS visitors, COALESCE(SUM(last_seen >= ?), 0) AS active
    FROM presence WHERE last_seen >= ? AND first_seen >= ? GROUP BY hour`).bind(since, cutoff, since, since).all();
  let activeToday = 0;
  for (const row of hours.results || []) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour < 24) answer.todayByHour[hour] += Number(row.visitors) || 0;
    answer.todayCount += Number(row.visitors) || 0;
    activeToday += Number(row.active) || 0;
  }
  // Query 2: the rows themselves. A visitor active just after midnight is still active, though the day's count starts again
  const from = Math.min(since, cutoff);
  const listed = Math.min(activeToday, MAX_ACTIVE_LISTED) + MAX_RECENT_LISTED + 20;
  const { results } = await db.prepare('SELECT * FROM presence WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT ?').bind(from, listed).all();
  const rows = results || [];
  const active = rows.filter((row) => Number(row.last_seen) >= cutoff);
  answer.activeCount = Math.max(activeToday, active.length);
  answer.active = active.slice(0, MAX_ACTIVE_LISTED).map(toVisitor);
  answer.recent = rows.filter((row) => Number(row.last_seen) < cutoff && Number(row.last_seen) >= since).slice(0, MAX_RECENT_LISTED).map(toVisitor);
  return answer;
};

/** Hourly: rows not seen for 48 hours are removed (one statement). Returns how many. */
export const cleanupPresence = async (now = Date.now()) => {
  if (!db) return 0;
  await ensureTable();
  const result = await db.prepare('DELETE FROM presence WHERE last_seen < ?').bind(now - KEEP_MS).run();
  return Number(result?.meta?.changes) || 0;
};
