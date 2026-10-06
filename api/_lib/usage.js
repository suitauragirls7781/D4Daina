// Today's real usage of the Cloudflare account against the free plan's daily limits, the photo storage (R2)
// and the emails Brevo still allows today. Read for the admin page "Usage & limits" (api/admin-config.js, action "usage").
// Every number comes from Cloudflare's or Brevo's own API; when one of them cannot be read, that part is
// returned as null with a reason, never as a guess.

// Cloudflare free plan, per account, per UTC day (the day starts at 00:00 UTC = 05:30 IST)
export const WORKER_REQUESTS_PER_DAY = 100000;
export const D1_ROWS_READ_PER_DAY = 5000000;
export const D1_ROWS_WRITTEN_PER_DAY = 100000;
// Workers Paid plan: no daily caps. These are the amounts included each calendar month (UTC) before
// Cloudflare bills extra, so on the paid plan the page shows this month's usage against them.
export const PAID_WORKER_REQUESTS_PER_MONTH = 10000000;
export const PAID_D1_ROWS_READ_PER_MONTH = 25000000000;
export const PAID_D1_ROWS_WRITTEN_PER_MONTH = 50000000;
/** "paid" when CLOUDFLARE_PLAN=paid is set in wrangler.jsonc; anything else is the free plan. */
export const cloudflarePlan = (env = process.env) => (String(env.CLOUDFLARE_PLAN || '').trim().toLowerCase() === 'paid' ? 'paid' : 'free');

// The owner's own switch (Admin -> Usage & limits), kept in a server-only document. Once it has been set it
// decides the plan; until then the wrangler.jsonc variable does. Cloudflare does not tell the Worker which
// plan the account is on, so the owner flips this after buying Workers Paid.
export const planDoc = (db) => db.collection('private_settings').doc('cloudflare_plan');
const PLAN_CACHE_MS = 60 * 1000;
let planCache = null; // { at, plan }
export const clearPlanCache = () => { planCache = null; };

/** The plan in force: the saved switch, else the variable. Never throws (a database error falls back to the variable). */
export const effectivePlan = async (db, env = process.env, fresh = false) => {
  if (!fresh && planCache && Date.now() - planCache.at < PLAN_CACHE_MS && Date.now() >= planCache.at) return planCache.plan;
  let plan = cloudflarePlan(env);
  try {
    const saved = (await planDoc(db).get()).data()?.plan;
    if (saved === 'paid' || saved === 'free') plan = saved;
    planCache = { at: Date.now(), plan };
  } catch {
    // not cached: asked again on the next call
  }
  return plan;
};

/** Saves the owner's switch. */
export const savePlan = async (db, plan) => {
  await planDoc(db).set({ plan, updatedAt: new Date().toISOString() });
  planCache = { at: Date.now(), plan };
  cached = null;
};
// Brevo free plan: emails per day. Brevo reports the emails LEFT today, not the cap.
export const BREVO_FREE_EMAILS_PER_DAY = 300;

const CLOUDFLARE_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const BREVO_ACCOUNT = 'https://api.brevo.com/v3/account';
const UPSTREAM_TIMEOUT_MS = 8000;
// One isolate asks Cloudflare at most once a minute, however often the page is refreshed
const CACHE_MS = 60 * 1000;

const WORKERS_QUERY = 'query($acc:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$acc}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests subrequests errors} quantiles{cpuTimeP50 cpuTimeP99} dimensions{scriptName}}}}}';
const D1_QUERY = 'query($acc:String!,$date:Date!,$db:String!){viewer{accounts(filter:{accountTag:$acc}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$date,databaseId:$db}){sum{readQueries writeQueries rowsRead rowsWritten} dimensions{date}}}}}';

let cached = null; // { at, key, body }

/** Forgets the cached answer (used by the tests). */
export const clearUsageCache = () => { cached = null; };

const count = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);
// Cloudflare reports CPU time in microseconds; the page shows milliseconds with two decimals
// (a missing value stays null: Number(null) would otherwise turn it into a made-up 0 ms)
const microsToMs = (value) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) / 10) / 100);

/** A short reason for the admin. The token is removed in case an upstream message ever repeats it. */
const reason = (error, token) => {
  const text = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    ? 'no answer within 8 seconds'
    : String(error?.message || 'request failed');
  return (token ? text.split(token).join('[token]') : text).replace(/\s+/g, ' ').trim().slice(0, 160);
};

/** One GraphQL query; returns the account node or throws with a short message. */
const cloudflareQuery = async (token, query, variables) => {
  const response = await fetch(CLOUDFLARE_GRAPHQL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => null);
  const firstError = result?.errors?.[0]?.message;
  if (!response.ok || firstError) throw new Error(firstError || `HTTP ${response.status}`);
  const account = result?.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('the account was not found for this token');
  return account;
};

const readWorkers = async ({ token, accountId, workerName, start, end, limit }) => {
  const account = await cloudflareQuery(token, WORKERS_QUERY, { acc: accountId, start, end });
  const rows = Array.isArray(account.workersInvocationsAdaptive) ? account.workersInvocationsAdaptive : [];
  // The daily limit counts every Worker of the account, so the requests of all scripts are added up
  const requests = rows.reduce((total, row) => total + count(row?.sum?.requests), 0);
  // Errors, subrequests and CPU time are the store's own Worker (CPU percentiles cannot be added across scripts)
  const own = rows.filter((row) => row?.dimensions?.scriptName === workerName);
  const highest = (name) => {
    const values = own.map((row) => microsToMs(row?.quantiles?.[name])).filter((value) => value !== null);
    return values.length ? Math.max(...values) : null;
  };
  return {
    requests,
    limit,
    scriptName: workerName,
    scriptRequests: own.reduce((total, row) => total + count(row?.sum?.requests), 0),
    errors: own.reduce((total, row) => total + count(row?.sum?.errors), 0),
    subrequests: own.reduce((total, row) => total + count(row?.sum?.subrequests), 0),
    cpuP50Ms: highest('cpuTimeP50'),
    cpuP99Ms: highest('cpuTimeP99'),
  };
};

const readD1 = async ({ token, accountId, databaseId, date, rowsReadLimit, rowsWrittenLimit }) => {
  if (!databaseId) throw new Error('CLOUDFLARE_D1_ID is not set on the Worker');
  const account = await cloudflareQuery(token, D1_QUERY, { acc: accountId, date, db: databaseId });
  const rows = (Array.isArray(account.d1AnalyticsAdaptiveGroups) ? account.d1AnalyticsAdaptiveGroups : [])
    .filter((row) => !row?.dimensions?.date || row.dimensions.date >= date);
  const sum = (name) => rows.reduce((total, row) => total + count(row?.sum?.[name]), 0);
  return {
    rowsRead: sum('rowsRead'),
    rowsReadLimit,
    rowsWritten: sum('rowsWritten'),
    rowsWrittenLimit,
    readQueries: sum('readQueries'),
    writeQueries: sum('writeQueries'),
  };
};

/** Emails Brevo still allows today, or null when Brevo is not set up or does not answer. */
const readEmail = async (apiKey) => {
  if (!apiKey) return null;
  try {
    const response = await fetch(BREVO_ACCOUNT, {
      headers: { accept: 'application/json', 'api-key': apiKey },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const account = await response.json();
    const plan = (Array.isArray(account?.plan) ? account.plan : []).find((entry) => entry?.creditsType === 'sendLimit');
    if (!plan || !Number.isFinite(Number(plan.credits))) return null;
    return { left: count(plan.credits), dailyCap: plan.type === 'free' ? BREVO_FREE_EMAILS_PER_DAY : null };
  } catch {
    return null;
  }
};

// ---- Photo storage (Cloudflare R2) ----------------------------------------------------------------------
// The photos and reel videos live in one R2 bucket and are read through Cloudflare's CDN. R2's free amounts
// are per calendar month (UTC): 10 GB stored, 1 million writes ("Class A"), 10 million reads ("Class B").
// Sending a photo to a shopper costs nothing, so there is no bandwidth limit to run out of.
export const R2_FREE_STORAGE_BYTES = 10 * 1000 * 1000 * 1000;
export const R2_FREE_WRITES_PER_MONTH = 1000000;
export const R2_FREE_READS_PER_MONTH = 10000000;
// Every photo is kept in nine ready-made files (seven WebP widths and two JPEGs); migrated photos also keep their original
export const FILES_PER_PHOTO = 9;

const R2_QUERY = 'query($acc:String!,$bucket:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$acc}){storage:r2StorageAdaptiveGroups(limit:1,filter:{bucketName:$bucket,datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]){max{payloadSize objectCount metadataSize} dimensions{datetime}} ops:r2OperationsAdaptiveGroups(limit:1000,filter:{bucketName:$bucket,datetime_geq:$start,datetime_leq:$end}){sum{requests} dimensions{actionType}}}}}';
// How R2 bills each action: writes and listings are Class A, reads are Class B, deletes are free
const isWrite = (action) => /^(Put|Copy|List|Create|Complete|Upload)/.test(action);
const isRead = (action) => /^(Get|Head)/.test(action);

/** This month's storage and request counts of the media bucket, or null when it cannot be read. */
const readMedia = async ({ token, accountId, bucket, now }) => {
  if (!bucket) return null;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  try {
    const account = await cloudflareQuery(token, R2_QUERY, { acc: accountId, bucket, start: monthStart.toISOString(), end: now.toISOString() });
    const ops = Array.isArray(account.ops) ? account.ops : [];
    const total = (test) => ops.reduce((sum, row) => sum + (test(String(row?.dimensions?.actionType || '')) ? count(row?.sum?.requests) : 0), 0);
    const stored = account.storage?.[0]?.max;
    const objects = stored ? count(stored.objectCount) : null;
    return {
      bucket,
      // Cloudflare reports storage a few hours behind; null until its first report of the month
      storageBytes: stored ? count(stored.payloadSize) + count(stored.metadataSize) : null,
      storageLimit: R2_FREE_STORAGE_BYTES,
      objects,
      photos: objects === null ? null : Math.round(objects / (FILES_PER_PHOTO + 1)),
      writes: total(isWrite),
      writesLimit: R2_FREE_WRITES_PER_MONTH,
      reads: total(isRead),
      readsLimit: R2_FREE_READS_PER_MONTH,
      monthStart: monthStart.toISOString(),
      resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    };
  } catch {
    return null;
  }
};

const CAPACITY_MIN_VISITS = 50;

/**
 * How many visitors the free plan can carry, worked out from real numbers only: what today's counted visits
 * used of each daily limit (Worker requests, database rows written), and what this month's visits used of the
 * photo reads. The smallest of them is the store's ceiling. null when there are too few visits to measure.
 */
const visitCapacity = ({ plan, workers, d1, media, visitsToday, visitsThisMonth }) => {
  const out = { visitsToday, visitsThisMonth, perDay: [], perMonth: [] };
  if (plan === 'free' && visitsToday >= CAPACITY_MIN_VISITS) {
    if (workers && workers.requests > 0) out.perDay.push({ limit: 'requests', perVisit: Math.round((workers.requests / visitsToday) * 10) / 10, visits: Math.floor(workers.limit / (workers.requests / visitsToday)) });
    if (d1 && d1.rowsWritten > 0) out.perDay.push({ limit: 'writes', perVisit: Math.round((d1.rowsWritten / visitsToday) * 10) / 10, visits: Math.floor(d1.rowsWrittenLimit / (d1.rowsWritten / visitsToday)) });
    if (d1 && d1.rowsRead > 0) out.perDay.push({ limit: 'reads', perVisit: Math.round((d1.rowsRead / visitsToday) * 10) / 10, visits: Math.floor(d1.rowsReadLimit / (d1.rowsRead / visitsToday)) });
  }
  if (media && media.reads > 0 && visitsThisMonth >= CAPACITY_MIN_VISITS) {
    out.perMonth.push({ limit: 'photoReads', perVisit: Math.round((media.reads / visitsThisMonth) * 10) / 10, visits: Math.floor(media.readsLimit / (media.reads / visitsThisMonth)) });
  }
  if (!out.perDay.length && !out.perMonth.length) return null;
  const day = out.perDay.length ? out.perDay.reduce((low, row) => (row.visits < low.visits ? row : low)) : null;
  const month = out.perMonth.length ? out.perMonth.reduce((low, row) => (row.visits < low.visits ? row : low)) : null;
  // The month's ceiling: thirty days of the daily ceiling, or the photo-read ceiling, whichever is lower
  const candidates = [day ? { limit: day.limit, visits: day.visits * 30 } : null, month].filter(Boolean);
  const tightest = candidates.reduce((low, row) => (row.visits < low.visits ? row : low));
  return { ...out, visitsPerDay: day ? day.visits : null, tightestDaily: day ? day.limit : null, visitsPerMonth: tightest.visits, tightest: tightest.limit };
};

/** Photos that still fit in the free storage, from the average size of the photos stored so far. */
const photoRoom = (media) => {
  if (!media || media.storageBytes === null || !media.photos) return null;
  const perPhoto = media.storageBytes / media.photos;
  return { bytesPerPhoto: Math.round(perPhoto), photosLeft: Math.max(0, Math.floor((media.storageLimit - media.storageBytes) / perPhoto)) };
};

/** The answer of /api/admin-config?action=usage. Never throws. */
export const readUsage = async (env = process.env, now = new Date(), savedPlan = '', loadVisits = null) => {
  const token = String(env.CLOUDFLARE_ANALYTICS_TOKEN || '').trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  // Free plan: the UTC day. Paid plan: the UTC calendar month (what the plan's included amounts are counted over).
  const plan = savedPlan === 'paid' || savedPlan === 'free' ? savedPlan : cloudflarePlan(env);
  const paid = plan === 'paid';
  const dayStart = paid
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const times = {
    plan,
    period: paid ? 'month' : 'day',
    fetchedAt: now.toISOString(),
    periodStart: dayStart.toISOString(),
    resetAt: paid
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
      : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };

  if (!token || !accountId) {
    return {
      configured: false,
      ...times,
      workers: null,
      d1: null,
      email: null,
      media: null,
      photoRoom: null,
      capacity: null,
      error: !token
        ? 'Cloudflare usage is not connected yet. Create a Cloudflare API token with "Account Analytics: Read" and add it to the Worker as the secret CLOUDFLARE_ANALYTICS_TOKEN.'
        : 'CLOUDFLARE_ACCOUNT_ID is not set on the Worker (it is a plain variable in wrangler.jsonc).',
    };
  }

  const date = dayStart.toISOString().slice(0, 10);
  const key = `${accountId}|${plan}|${date}`;
  const brevoKey = String(env.BREVO_API_KEY || '').trim();
  const hit = cached;
  if (hit && hit.key === key && now.getTime() - hit.at < CACHE_MS && now.getTime() >= hit.at) {
    // Brevo did not answer when this was cached: ask Brevo alone again, the Cloudflare numbers stay cached
    if (!hit.body.email && brevoKey) {
      const retried = await readEmail(brevoKey);
      if (retried) hit.body = { ...hit.body, email: retried };
    }
    return hit.body;
  }

  const monthDates = Array.from({ length: now.getUTCDate() }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), index + 1)).toISOString().slice(0, 10));
  const [workers, d1, email, media, visits] = await Promise.all([
    readWorkers({ token, accountId, workerName: String(env.CLOUDFLARE_WORKER_NAME || 'd4daina').trim(), start: dayStart.toISOString(), end: now.toISOString(), limit: paid ? PAID_WORKER_REQUESTS_PER_MONTH : WORKER_REQUESTS_PER_DAY })
      .catch((error) => ({ failed: reason(error, token) })),
    readD1({
      token, accountId, databaseId: String(env.CLOUDFLARE_D1_ID || '').trim(), date,
      rowsReadLimit: paid ? PAID_D1_ROWS_READ_PER_MONTH : D1_ROWS_READ_PER_DAY,
      rowsWrittenLimit: paid ? PAID_D1_ROWS_WRITTEN_PER_MONTH : D1_ROWS_WRITTEN_PER_DAY,
    })
      .catch((error) => ({ failed: reason(error, token) })),
    readEmail(brevoKey),
    readMedia({ token, accountId, bucket: String(env.MEDIA_BUCKET_NAME || '').trim(), now }),
    // Visits the store counted on each day of this month (api/track.js), for the capacity estimate
    typeof loadVisits === 'function' ? loadVisits(monthDates).catch(() => null) : null,
  ]);

  const failures = [workers.failed && `Worker requests: ${workers.failed}`, d1.failed && `Database: ${d1.failed}`].filter(Boolean);
  const body = {
    configured: true,
    ...times,
    workers: workers.failed ? null : workers,
    d1: d1.failed ? null : d1,
    email,
    media,
    photoRoom: photoRoom(media),
    capacity: visits ? visitCapacity({
      plan,
      workers: workers.failed ? null : workers,
      d1: d1.failed ? null : d1,
      media,
      visitsToday: count(visits[now.toISOString().slice(0, 10)]),
      visitsThisMonth: monthDates.reduce((sum, day) => sum + count(visits[day]), 0),
    }) : null,
    ...(failures.length ? { error: `Cloudflare did not return all of today's numbers. ${failures.join(' · ')}`.slice(0, 400) } : {}),
  };
  // A failed read is not kept, so "Try again" really asks Cloudflare again
  if (!failures.length) cached = { at: now.getTime(), key, body };
  return body;
};
