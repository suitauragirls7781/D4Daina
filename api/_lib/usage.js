// Today's real usage of the Cloudflare account against the free plan's daily limits, plus the emails Brevo
// still allows today. Read for the admin page "Usage & limits" (api/admin-config.js, action "usage").
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

/** The answer of /api/admin-config?action=usage. Never throws. */
export const readUsage = async (env = process.env, now = new Date(), savedPlan = '') => {
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

  const [workers, d1, email] = await Promise.all([
    readWorkers({ token, accountId, workerName: String(env.CLOUDFLARE_WORKER_NAME || 'd4daina').trim(), start: dayStart.toISOString(), end: now.toISOString(), limit: paid ? PAID_WORKER_REQUESTS_PER_MONTH : WORKER_REQUESTS_PER_DAY })
      .catch((error) => ({ failed: reason(error, token) })),
    readD1({
      token, accountId, databaseId: String(env.CLOUDFLARE_D1_ID || '').trim(), date,
      rowsReadLimit: paid ? PAID_D1_ROWS_READ_PER_MONTH : D1_ROWS_READ_PER_DAY,
      rowsWrittenLimit: paid ? PAID_D1_ROWS_WRITTEN_PER_MONTH : D1_ROWS_WRITTEN_PER_DAY,
    })
      .catch((error) => ({ failed: reason(error, token) })),
    readEmail(brevoKey),
  ]);

  const failures = [workers.failed && `Worker requests: ${workers.failed}`, d1.failed && `Database: ${d1.failed}`].filter(Boolean);
  const body = {
    configured: true,
    ...times,
    workers: workers.failed ? null : workers,
    d1: d1.failed ? null : d1,
    email,
    ...(failures.length ? { error: `Cloudflare did not return all of today's numbers. ${failures.join(' · ')}`.slice(0, 400) } : {}),
  };
  // A failed read is not kept, so "Try again" really asks Cloudflare again
  if (!failures.length) cached = { at: now.getTime(), key, body };
  return body;
};
