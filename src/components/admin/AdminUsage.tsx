import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, RefreshCw } from 'lucide-react';
import { AdminPageHeader, ui } from './kidsToysShared';

/** What /api/admin-config?action=usage answers (api/_lib/usage.js). */
type UsageView = {
  configured: boolean;
  plan?: 'free' | 'paid';
  period?: 'day' | 'month';
  periodStart?: string;
  fetchedAt: string;
  resetAt: string;
  workers: {
    requests: number; limit: number; scriptName?: string; scriptRequests?: number;
    errors: number; subrequests: number; cpuP50Ms: number | null; cpuP99Ms: number | null;
  } | null;
  d1: { rowsRead: number; rowsReadLimit: number; rowsWritten: number; rowsWrittenLimit: number; readQueries: number; writeQueries: number } | null;
  email: { left: number; dailyCap: number | null } | null;
  cloudinary?: {
    plan: string; creditsUsed: number | null; creditsLimit: number | null;
    storageBytes: number; storageCredits: number | null; bandwidthBytes: number; bandwidthCredits: number | null;
    transformations: number; transformationCredits: number | null; files: number; maxImageBytes: number | null;
  } | null;
  photoCapacity?: {
    measuredDays: number; visits: number; bandwidthBytes: number; bytesPerVisit: number; visitsPerDay: number;
    visitsLeft: number; visitsPer30Days: number; daysLeftAtThisPace: number;
  } | null;
  error?: string;
};

const REFRESH_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (value: number) => value.toLocaleString('en-IN');
const clock = (iso: string, seconds = false) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
};
// Tiny real usage is shown as "<0.1", not as a misleading "0.0"
const percentText = (percent: number) => (percent > 0 && percent < 0.1 ? '<0.1' : percent > 0 && percent < 10 ? percent.toFixed(1) : String(Math.round(percent)));
const decimals = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const size = (bytes: number) => (bytes >= 1e9 ? `${decimals(bytes / 1e9)} GB` : `${decimals(bytes / 1e6)} MB`);
const credits = (value: number | null) => (value === null ? '' : ` · ${decimals(value)} credits`);
const ms = (value: number | null) => (value === null ? 'not available' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ms`);

// Calm status colours: teal normally, marigold from 70%, red from 90% (always with words, never colour alone)
const tone = (percent: number) => (percent >= 90
  ? { bar: 'bg-danger', text: 'text-danger', word: 'Almost at the limit' }
  : percent >= 70
    ? { bar: 'bg-sale', text: 'text-sale', word: 'Getting close' }
    : { bar: 'bg-brand', text: 'text-ink', word: '' });

const UsageBar: React.FC<{ title: string; used: number; limit: number; detail: string; note?: string }> = ({ title, used, limit, detail, note }) => {
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  const colours = tone(percent);
  return (
    <div className={ui.card}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] leading-[22px] font-semibold text-ink">{title}</h4>
        <span className={`shrink-0 text-[17px] leading-6 font-bold sag-num ${colours.text}`}>{percentText(percent)}%</span>
      </div>
      <div
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={detail}
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${colours.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-2.5 text-sm leading-5 text-ink sag-num">{detail}</p>
      {colours.word && <p className={`mt-1 text-[13px] leading-[18px] font-semibold ${colours.text}`}>{colours.word}</p>}
      {note && <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{note}</p>}
    </div>
  );
};

const Unavailable: React.FC<{ title: string }> = ({ title }) => (
  <div className={ui.card}>
    <h4 className="text-[15px] leading-[22px] font-semibold text-ink">{title}</h4>
    <p className="mt-1.5 text-sm leading-5 text-ink-muted">Not available right now.</p>
  </div>
);

/** Admin → Usage & limits: today's real Cloudflare usage against the free plan's daily limits. */
export const AdminUsage: React.FC = () => {
  const [view, setView] = useState<UsageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const inFlight = useRef<AbortController | null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 20000);
    lastLoad.current = Date.now();
    setLoading(true);
    fetch('/api/admin-config?action=usage', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(response.status === 401 ? 'Please sign in again to see the usage.' : 'The usage could not be loaded right now.');
        setView(result as UsageView);
        setLoadError('');
      })
      .catch((error) => {
        // Replaced by a newer request or the page was closed: nothing to report
        if (inFlight.current !== controller) return;
        setLoadError(error?.name === 'AbortError' ? 'The usage is taking too long to load.' : error.message);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (inFlight.current === controller) setLoading(false);
      });
  }, []);

  // Loads on opening, then once a minute, but only while this page is actually on screen
  useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current >= REFRESH_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      const pending = inFlight.current;
      inFlight.current = null;
      pending?.abort();
    };
  }, [load]);

  // The plan switch. Moving to "paid" asks first: on a free account it would let visitor counting use up the day's writes.
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const savePlan = (plan: 'free' | 'paid') => {
    setSavingPlan(true);
    setPlanError('');
    fetch('/api/admin-config', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cloudflarePlan: plan }),
    })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(response.status === 401 ? 'Please sign in again to change the plan.' : result?.error || 'The plan could not be saved right now.');
        // A refresh still on its way would bring back the old plan's numbers
        inFlight.current?.abort();
        inFlight.current = null;
        setLoading(false);
        lastLoad.current = Date.now();
        setView(result as UsageView);
        setLoadError('');
        setConfirmPaid(false);
      })
      .catch((error) => setPlanError(error.message))
      .finally(() => setSavingPlan(false));
  };

  const resetTime = view ? clock(view.resetAt) : '';
  const sinceTime = view ? clock(new Date(new Date(view.resetAt).getTime() - DAY_MS).toISOString()) : '';
  const monthly = view?.period === 'month';
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const since = monthly
    ? `this month (since ${view?.periodStart ? dayOf(view.periodStart) : 'the 1st'})`
    : sinceTime ? `today (since ${sinceTime})` : 'today';

  const refreshButton = (
    <button type="button" onClick={load} disabled={loading} className={ui.outline}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
    </button>
  );

  return (
    <div id="admin-usage-page" className="space-y-4">
      <AdminPageHeader
        eyebrow="System"
        title={<>Usage &amp; limits</>}
        icon={<Gauge />}
        description={<>{monthly ? <>What the store has used of what Cloudflare's paid plan includes, {since}.</> : <>What the store has used of Cloudflare's free daily limits, {since}.</>} These are Cloudflare's own numbers; they run a minute or two behind real time.</>}
      />

      {loadError && (
        <div role="alert" className={ui.alert}>
          <p className="font-semibold">{loadError}</p>
          {view && <p className="mt-1">The numbers below are from {clock(view.fetchedAt, true)}.</p>}
          <button type="button" onClick={load} disabled={loading} className={`mt-3 ${ui.outline}`}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {!view && !loadError && (
        <div className={`${ui.card} flex items-center gap-3 text-sm text-ink-muted`} role="status" aria-busy="true">
          <Loader2 className="w-5 h-5 animate-spin text-ink" /> Loading today's usage…
        </div>
      )}

      {view && !view.configured && (
        <div className={ui.card}>
          <p className={ui.eyebrow}>Not connected yet</p>
          <h4 className="mt-1 font-display text-xl leading-7 text-ink">Connect Cloudflare usage</h4>
          <p className="mt-2 text-sm leading-5 text-ink-muted">
            In the Cloudflare dashboard create an API token with the permission <strong className="font-semibold text-ink">Account Analytics: Read</strong>, then add it to the Worker as the secret{' '}
            <code className="font-mono text-[13px] break-all text-ink">CLOUDFLARE_ANALYTICS_TOKEN</code>. Until then no numbers are shown here.
          </p>
          {/* The server's "token missing" message repeats the paragraph above; only show other reasons (e.g. no account ID) */}
          {view.error && !view.error.includes('CLOUDFLARE_ANALYTICS_TOKEN') && <p className="mt-2 text-sm leading-5 text-ink-muted break-words">{view.error}</p>}
          <div className="mt-4">{refreshButton}</div>
        </div>
      )}

      {view && (
        <div id="admin-usage-plan" className={ui.card}>
          <p className={ui.eyebrow}>Cloudflare plan</p>
          <h4 className="mt-1 text-[15px] leading-[22px] font-semibold text-ink">
            {view.plan === 'paid' ? 'Workers Paid ($5 a month)' : 'Free plan'}
          </h4>
          <p className="mt-1.5 text-sm leading-5 text-ink-muted">
            {view.plan === 'paid'
              ? 'This page counts the month against what the paid plan includes, and visitor counting does not pause.'
              : 'This page counts each day against the free limits, and visitor counting pauses before the day\'s free writes run out, so orders keep working.'}
            {' '}Cloudflare does not tell the store which plan the account is on, so set it here.
          </p>
          {planError && <p role="alert" className="mt-2 text-sm leading-5 font-semibold text-danger">{planError}</p>}
          {confirmPaid ? (
            <div className="mt-3 rounded-xl border border-sale-line bg-sale-tint px-4 py-3">
              <p className="text-sm leading-5 font-semibold text-ink">Have you already bought Workers Paid in Cloudflare?</p>
              <p className="mt-1 text-sm leading-5 text-ink">
                Switch only after buying it. On a free account this would let visitor counting use up the day's free writes, and orders would stop until 5:30 am.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => savePlan('paid')} disabled={savingPlan} className={ui.primary}>
                  {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />} Yes, I have bought it
                </button>
                <button type="button" onClick={() => setConfirmPaid(false)} disabled={savingPlan} className={ui.outline}>Not yet</button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              {view.plan === 'paid' ? (
                <button type="button" onClick={() => savePlan('free')} disabled={savingPlan} className={ui.outline}>
                  {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />} Switch back to the free plan
                </button>
              ) : (
                <button type="button" onClick={() => { setPlanError(''); setConfirmPaid(true); }} className={ui.outline}>
                  I have bought the paid plan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {view && view.configured && (
        <>
          {view.error && (
            <div role="alert" className={ui.alert}>
              <p className="font-semibold break-words">{view.error}</p>
              <button type="button" onClick={load} disabled={loading} className={`mt-3 ${ui.outline}`}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {view.workers ? (
              <UsageBar
                title="Worker requests"
                used={view.workers.requests}
                limit={view.workers.limit}
                detail={`${num(view.workers.requests)} of ${num(view.workers.limit)} used ${since}`}
                note={view.workers.scriptRequests !== undefined && view.workers.scriptRequests !== view.workers.requests
                  ? `${num(view.workers.scriptRequests)} of these are this store (${view.workers.scriptName}); the limit counts every Worker in the account.`
                  : undefined}
              />
            ) : <Unavailable title="Worker requests" />}
            {view.d1 ? (
              <>
                <UsageBar
                  title="Database rows read"
                  used={view.d1.rowsRead}
                  limit={view.d1.rowsReadLimit}
                  detail={`${num(view.d1.rowsRead)} of ${num(view.d1.rowsReadLimit)} used ${since}`}
                  note={`${num(view.d1.readQueries)} read queries`}
                />
                <UsageBar
                  title="Database rows written"
                  used={view.d1.rowsWritten}
                  limit={view.d1.rowsWrittenLimit}
                  detail={`${num(view.d1.rowsWritten)} of ${num(view.d1.rowsWrittenLimit)} used ${since}`}
                  note={`${num(view.d1.writeQueries)} write queries`}
                />
              </>
            ) : (
              <>
                <Unavailable title="Database rows read" />
                <Unavailable title="Database rows written" />
              </>
            )}
            {view.email && (view.email.dailyCap ? (
              <UsageBar
                title="Emails (Brevo)"
                used={Math.max(0, view.email.dailyCap - view.email.left)}
                limit={view.email.dailyCap}
                detail={`${num(view.email.left)} of ${num(view.email.dailyCap)} emails left today`}
                note="Order and sign-in code emails."
              />
            ) : (
              <div className={ui.card}>
                <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Emails (Brevo)</h4>
                <p className="mt-1.5 text-sm leading-5 text-ink sag-num">{num(view.email.left)} email credits left</p>
              </div>
            ))}
          </div>

          <div className={ui.card}>
            <p className={ui.eyebrow}>More from {since}</p>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[13px] leading-[18px] text-ink-muted">Requests that ended in an error</dt>
                <dd className={`text-[15px] leading-[22px] font-semibold sag-num ${view.workers && view.workers.errors > 0 ? 'text-danger' : 'text-ink'}`}>{view.workers ? num(view.workers.errors) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[13px] leading-[18px] text-ink-muted">Calls the store made to other services</dt>
                <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{view.workers ? num(view.workers.subrequests) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[13px] leading-[18px] text-ink-muted">CPU time per request, typical (p50)</dt>
                <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{view.workers ? ms(view.workers.cpuP50Ms) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[13px] leading-[18px] text-ink-muted">CPU time per request, slowest 1% (p99)</dt>
                <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{view.workers ? ms(view.workers.cpuP99Ms) : 'not available'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">{view.plan === 'paid' ? 'The paid plan allows up to 30 seconds of CPU time per request.' : 'The free plan allows about 10 ms of CPU time per request.'}</p>
          </div>

          {/* Photos and reels: Cloudinary's own usage numbers (its free plan counts credits over the last 30 days) */}
          {view.cloudinary && (
            <div id="admin-usage-cloudinary" className="space-y-3">
              <p className={ui.eyebrow}>Photos and reels (Cloudinary{view.cloudinary.plan ? `, ${view.cloudinary.plan} plan` : ''})</p>
              {view.cloudinary.creditsLimit !== null && view.cloudinary.creditsUsed !== null && (
                <UsageBar
                  title="Cloudinary credits"
                  used={view.cloudinary.creditsUsed}
                  limit={view.cloudinary.creditsLimit}
                  detail={`${decimals(view.cloudinary.creditsUsed)} of ${decimals(view.cloudinary.creditsLimit)} credits used in the last 30 days · ${decimals(Math.max(0, view.cloudinary.creditsLimit - view.cloudinary.creditsUsed))} left`}
                  note="1 credit = 1 GB of photos stored, or 1 GB shown to shoppers, or 1,000 photo resizes. If the credits run out, Cloudinary can stop showing photos."
                />
              )}
              <div className={ui.card}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <dt className="text-[13px] leading-[18px] text-ink-muted">Stored photos and videos</dt>
                    <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{num(view.cloudinary.files)} files · {size(view.cloudinary.storageBytes)}{credits(view.cloudinary.storageCredits)}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] leading-[18px] text-ink-muted">Shown to shoppers, last 30 days</dt>
                    <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{size(view.cloudinary.bandwidthBytes)}{credits(view.cloudinary.bandwidthCredits)}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] leading-[18px] text-ink-muted">Photo resizes, last 30 days</dt>
                    <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{num(view.cloudinary.transformations)}{credits(view.cloudinary.transformationCredits)}</dd>
                  </div>
                  {view.cloudinary.maxImageBytes !== null && (
                    <div>
                      <dt className="text-[13px] leading-[18px] text-ink-muted">Largest photo this plan accepts</dt>
                      <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">{size(view.cloudinary.maxImageBytes)}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">Shoppers looking at photos use the most credits, so this grows with visitors more than with the number of products.</p>
              </div>

              {/* An estimate from measured days: Cloudinary's photo data per day against the visits the store counted */}
              {view.photoCapacity ? (() => {
                const capacity = view.photoCapacity;
                const short = capacity.daysLeftAtThisPace < 30;
                return (
                  <div id="admin-usage-capacity" className={ui.card}>
                    <h4 className="text-[15px] leading-[22px] font-semibold text-ink">How many visitors the photo plan can carry</h4>
                    <p className="mt-1.5 text-sm leading-5 text-ink-muted">
                      Measured over the last {capacity.measuredDays === 1 ? 'full day' : `${capacity.measuredDays} full days`}: {num(capacity.visits)} counted visits used {size(capacity.bandwidthBytes)} of photos, about {size(capacity.bytesPerVisit)} a visit.
                    </p>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <dt className="text-[13px] leading-[18px] text-ink-muted">Visits the credits left can still carry</dt>
                        <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">about {num(capacity.visitsLeft)}</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] leading-[18px] text-ink-muted">Visits this plan carries in 30 days</dt>
                        <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">about {num(capacity.visitsPer30Days)} (about {num(Math.floor(capacity.visitsPer30Days / 30))} a day)</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] leading-[18px] text-ink-muted">Visits a day now</dt>
                        <dd className="text-[15px] leading-[22px] font-semibold sag-num text-ink">about {num(capacity.visitsPerDay)}</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] leading-[18px] text-ink-muted">At this pace the credits last</dt>
                        <dd className={`text-[15px] leading-[22px] font-semibold sag-num ${short ? 'text-danger' : 'text-ink'}`}>
                          {short ? `about ${num(capacity.daysLeftAtThisPace)} more ${capacity.daysLeftAtThisPace === 1 ? 'day' : 'days'}` : '30 days or more'}
                        </dd>
                      </div>
                    </dl>
                    {short && (
                      <p role="alert" className="mt-3 text-sm leading-5 font-semibold text-danger">
                        At this pace the free credits run out in about {num(capacity.daysLeftAtThisPace)} {capacity.daysLeftAtThisPace === 1 ? 'day' : 'days'}. After that Cloudinary can stop showing photos until you upgrade its plan or visits drop.
                      </p>
                    )}
                    <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">An estimate from these days only. Visits that were not counted (while visitor counting was paused) make it come out lower than the truth.</p>
                  </div>
                );
              })() : view.cloudinary.creditsLimit !== null && (
                <div id="admin-usage-capacity" className={ui.card}>
                  <h4 className="text-[15px] leading-[22px] font-semibold text-ink">How many visitors the photo plan can carry</h4>
                  <p className="mt-1.5 text-sm leading-5 text-ink-muted">Not enough measured days yet. This appears after a full day with at least 100 counted visits.</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] leading-[18px] text-ink-muted min-w-0 flex-1 basis-60">
              {monthly
                ? <>Usage above these amounts is billed by Cloudflare; the count starts again on {dayOf(view.resetAt)}. </>
                : resetTime && <>The limits reset at {resetTime}. </>}
              Updated {clock(view.fetchedAt, true)}; refreshes every minute while this page is open.
            </p>
            {refreshButton}
          </div>
        </>
      )}
    </div>
  );
};
