import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, RefreshCw } from 'lucide-react';

/** What /api/admin-config?action=usage answers (api/_lib/usage.js). */
type UsageView = {
  configured: boolean;
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

// Calm status colours: plum normally, champagne gold from 70%, rose from 90%
const tone = (percent: number) => (percent >= 90
  ? { bar: 'bg-rose-700', text: 'text-rose-700', word: 'Almost at the limit' }
  : percent >= 70
    ? { bar: 'bg-[#C5A46D]', text: 'text-[#9C7A45]', word: 'Getting close' }
    : { bar: 'bg-[#4B1D3F]', text: 'text-[#4B1D3F]', word: '' });

const UsageBar: React.FC<{ title: string; used: number; limit: number; detail: string; note?: string }> = ({ title, used, limit, detail, note }) => {
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  const colours = tone(percent);
  return (
    <div className="sag-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#2A1A26]">{title}</h4>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${colours.text}`}>{percentText(percent)}%</span>
      </div>
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#F3EEF8]"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={detail}
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${colours.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-2.5 text-sm text-[#2A1A26]/75 tabular-nums">{detail}</p>
      {colours.word && <p className={`mt-1 text-sm font-semibold ${colours.text}`}>{colours.word}</p>}
      {note && <p className="mt-1 text-sm text-[#2A1A26]/55">{note}</p>}
    </div>
  );
};

const Unavailable: React.FC<{ title: string }> = ({ title }) => (
  <div className="sag-card p-4 sm:p-5">
    <h4 className="text-sm font-semibold text-[#2A1A26]">{title}</h4>
    <p className="mt-2 text-sm text-[#2A1A26]/60">Not available right now.</p>
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
  const since = sinceTime ? `today (since ${sinceTime})` : 'today';

  const refreshButton = (
    <button type="button" onClick={load} disabled={loading} className="sag-btn-outline h-10 px-5 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 bg-white">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
    </button>
  );

  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-3xl bg-[#4B1D3F] p-5 sm:p-7 text-white">
        <h3 className="font-serif text-2xl sm:text-3xl font-semibold flex items-center gap-2.5"><Gauge className="h-5 w-5 shrink-0" /> Usage &amp; limits</h3>
        <p className="text-sm text-white/75 mt-1.5 max-w-xl leading-relaxed">
          What the store has used of Cloudflare's free daily limits, {since}. These are Cloudflare's own numbers; they run a minute or two behind real time.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-700">
          <p className="font-semibold">{loadError}</p>
          {view && <p className="mt-1 text-sm">The numbers below are from {clock(view.fetchedAt, true)}.</p>}
          <button type="button" onClick={load} disabled={loading} className="mt-3 h-10 px-4 rounded-full bg-white border border-rose-200 text-sm font-semibold text-rose-700 inline-flex items-center gap-2 hover:bg-rose-100 cursor-pointer disabled:opacity-60">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {!view && !loadError && (
        <div className="sag-card p-5 flex items-center gap-3 text-[#2A1A26]/70" role="status" aria-busy="true">
          <Loader2 className="w-5 h-5 animate-spin text-[#4B1D3F]" /> Loading today's usage…
        </div>
      )}

      {view && !view.configured && (
        <div className="sag-card p-5 sm:p-6">
          <p className="sag-eyebrow font-semibold">Not connected yet</p>
          <h4 className="mt-2 font-serif text-2xl font-semibold text-[#4B1D3F]">Connect Cloudflare usage</h4>
          <p className="mt-2 text-sm text-[#2A1A26]/75 leading-relaxed">
            In the Cloudflare dashboard create an API token with the permission <strong>Account Analytics: Read</strong>, then add it to the Worker as the secret{' '}
            <code className="font-mono text-[13px] break-all text-[#4B1D3F]">CLOUDFLARE_ANALYTICS_TOKEN</code>. Until then no numbers are shown here.
          </p>
          {view.error && <p className="mt-2 text-sm text-[#2A1A26]/55 break-words">{view.error}</p>}
          <div className="mt-4">{refreshButton}</div>
        </div>
      )}

      {view && view.configured && (
        <>
          {view.error && (
            <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-700">
              <p className="font-semibold break-words">{view.error}</p>
              <button type="button" onClick={load} disabled={loading} className="mt-3 h-10 px-4 rounded-full bg-white border border-rose-200 text-sm font-semibold text-rose-700 inline-flex items-center gap-2 hover:bg-rose-100 cursor-pointer disabled:opacity-60">
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              <div className="sag-card p-4 sm:p-5">
                <h4 className="text-sm font-semibold text-[#2A1A26]">Emails (Brevo)</h4>
                <p className="mt-2 text-sm text-[#2A1A26]/75 tabular-nums">{num(view.email.left)} email credits left</p>
              </div>
            ))}
          </div>

          <div className="sag-card p-4 sm:p-5">
            <p className="sag-eyebrow font-semibold">More from {since}</p>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[12px] text-[#2A1A26]/55">Requests that ended in an error</dt>
                <dd className={`text-sm font-semibold tabular-nums ${view.workers && view.workers.errors > 0 ? 'text-rose-700' : 'text-[#2A1A26]'}`}>{view.workers ? num(view.workers.errors) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#2A1A26]/55">Calls the store made to other services</dt>
                <dd className="text-sm font-semibold tabular-nums text-[#2A1A26]">{view.workers ? num(view.workers.subrequests) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#2A1A26]/55">CPU time per request, typical (p50)</dt>
                <dd className="text-sm font-semibold tabular-nums text-[#2A1A26]">{view.workers ? ms(view.workers.cpuP50Ms) : 'not available'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#2A1A26]/55">CPU time per request, slowest 1% (p99)</dt>
                <dd className="text-sm font-semibold tabular-nums text-[#2A1A26]">{view.workers ? ms(view.workers.cpuP99Ms) : 'not available'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-[#2A1A26]/60 leading-relaxed">The free plan allows about 10 ms of CPU time per request.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#2A1A26]/65">
              {resetTime && <>The limits reset at {resetTime}. </>}
              Updated {clock(view.fetchedAt, true)}; refreshes every minute while this page is open.
            </p>
            {refreshButton}
          </div>
        </>
      )}
    </div>
  );
};
