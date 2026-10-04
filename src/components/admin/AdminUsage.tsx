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
