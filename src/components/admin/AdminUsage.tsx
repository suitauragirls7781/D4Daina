import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, Loader2, RefreshCw } from 'lucide-react';
import { AdminPageHeader } from './adminShared';
import { Meter, Panel, Pill, Tile, Tiles, kit } from './AdminPaymentGateways';

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
  /** Photo storage (Cloudflare R2), this month. storageBytes / objects / photos are null until Cloudflare's first report. */
  media?: {
    bucket: string; storageBytes: number | null; storageLimit: number; objects: number | null; photos: number | null;
    writes: number; writesLimit: number; reads: number; readsLimit: number; monthStart: string; resetAt: string;
  } | null;
  photoRoom?: { bytesPerPhoto: number; photosLeft: number } | null;
  /** How many visits the free plan can carry, from measured numbers. */
  capacity?: {
    visitsToday: number; visitsThisMonth: number;
    perDay: Array<{ limit: 'requests' | 'writes' | 'reads'; perVisit: number; visits: number }>;
    perMonth: Array<{ limit: 'photoReads'; perVisit: number; visits: number }>;
    visitsPerDay: number | null; tightestDaily: string | null; visitsPerMonth: number; tightest: string;
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
const ms = (value: number | null) => (value === null ? 'not available' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ms`);

// Calm status: ink normally, a dark rose word from 70%, red from 90% (always with words, never colour alone)
const NEAR = 90;
const CLOSE = 70;
const tone = (percent: number) => (percent >= NEAR
  ? { danger: true, text: 'text-danger', word: 'Almost at the limit' }
  : percent >= CLOSE
    ? { danger: false, text: 'text-sale', word: 'Getting close' }
    : { danger: false, text: 'text-ink', word: '' });

const UsageBar: React.FC<{
  title: string; used: number; limit: number; usedText: string; limitText: string;
  /** The same fact as one sentence, read out by screen readers. */
  detail: string;
  /** What happens, in plain words, if this meter reaches 100%. */
  atLimit?: string;
  note?: string;
}> = ({ title, used, limit, usedText, limitText, detail, atLimit, note }) => {
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  const colours = tone(percent);
  return (
    <div className={`${kit.inset} flex flex-col gap-2.5`}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[15px] leading-[22px] font-semibold text-ink">{title}</h4>
        {colours.word && <Pill tone={colours.danger ? 'problem' : 'soon'}>{colours.word}</Pill>}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 sag-num" title={detail}>
        <span className={`text-[26px] leading-8 font-semibold ${colours.text}`}>{usedText}</span>
        <span className="text-sm leading-5 text-ink-muted">of {limitText}</span>
        <span className={`ml-auto text-sm leading-5 font-semibold ${colours.text}`}>{percentText(percent)}% used</span>
      </p>
      <Meter label={title} percent={percent} danger={colours.danger} valueText={detail} />
      {note && <p className={kit.hint}>{note}</p>}
      {atLimit && <p className={kit.hint}><span className="font-semibold text-ink">If it fills up:</span> {atLimit}</p>}
    </div>
  );
};

const Unavailable: React.FC<{ title: string }> = ({ title }) => (
  <div className={kit.inset}>
    <h4 className="text-[15px] leading-[22px] font-semibold text-ink">{title}</h4>
    <p className="mt-1.5 text-sm leading-5 text-ink-muted">Not available right now.</p>
  </div>
);

const Fact: React.FC<{ label: string; children: React.ReactNode; danger?: boolean }> = ({ label, children, danger }) => (
  <div>
    <dt className="text-[13px] leading-[18px] text-ink-muted">{label}</dt>
    <dd className={`mt-0.5 text-[17px] leading-6 font-semibold sag-num ${danger ? 'text-danger' : 'text-ink'}`}>{children}</dd>
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
  const paid = view?.plan === 'paid';
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const since = monthly
    ? `this month (since ${view?.periodStart ? dayOf(view.periodStart) : 'the 1st'})`
    : sinceTime ? `today (since ${sinceTime})` : 'today';

  const refreshButton = (
    <button type="button" onClick={load} disabled={loading} className={kit.small}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
    </button>
  );

  // What happens when a meter fills up, in plain words. On the paid plan nothing stops: Cloudflare bills the extra.
  const billed = 'Nothing stops. Cloudflare bills the extra use.';
  const untilReset = resetTime ? `until the limits reset at ${resetTime}` : 'until the limits reset';
  const atLimit = {
    requests: paid ? billed : `The store stops opening for shoppers ${untilReset}.`,
    reads: paid ? billed : `The store cannot read products and orders from the database ${untilReset}.`,
    writes: paid ? billed : `Nothing new can be saved, so new orders stop ${untilReset}. Visitor counting pauses before that, so orders keep working.`,
    email: 'Order emails and sign-in codes are not sent until tomorrow.',
    photos: 'Past the free amount, Cloudflare charges for the extra.',
  };

  // Every meter that has a real number right now, to work out the plain answer at the top
  const meters: Array<{ name: string; percent: number }> = [];
  if (view?.configured) {
    const add = (name: string, used: number, limit: number) => { if (limit > 0) meters.push({ name, percent: (used / limit) * 100 }); };
    if (view.workers) add('Worker requests', view.workers.requests, view.workers.limit);
    if (view.d1) {
      add('database reads', view.d1.rowsRead, view.d1.rowsReadLimit);
      add('database writes', view.d1.rowsWritten, view.d1.rowsWrittenLimit);
    }
    if (view.email?.dailyCap) add('emails', Math.max(0, view.email.dailyCap - view.email.left), view.email.dailyCap);
    if (view.media) {
      if (view.media.storageBytes !== null) add('photo storage', view.media.storageBytes, view.media.storageLimit);
      add('photos shown to shoppers', view.media.reads, view.media.readsLimit);
      add('photo uploads', view.media.writes, view.media.writesLimit);
    }
  }
  const namesOf = (rows: typeof meters) => rows.map((row) => row.name).join(', ');
  const near = meters.filter((row) => row.percent >= NEAR);
  const close = meters.filter((row) => row.percent >= CLOSE && row.percent < NEAR);
  const highest = meters.reduce<{ name: string; percent: number } | null>((top, row) => (!top || row.percent > top.percent ? row : top), null);
  const period = monthly ? "this month's" : "today's";

  return (
    <div id="admin-usage-page" className="space-y-5">
      <AdminPageHeader
        eyebrow="System"
        title={<>Usage &amp; limits</>}
        icon={<Gauge />}
        description={<>{monthly ? <>What the store has used of what Cloudflare's paid plan includes, {since}.</> : <>What the store has used of Cloudflare's free daily limits, {since}.</>} These are Cloudflare's own numbers; they run a minute or two behind real time.</>}
      />

      {loadError && (
        <div role="alert" className={kit.alert}>
          <p className="font-semibold">{loadError}</p>
          {view && <p className="mt-1">The numbers below are from {clock(view.fetchedAt, true)}.</p>}
          <button type="button" onClick={load} disabled={loading} className={`mt-3 ${kit.small}`}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {!view && !loadError && (
        <div className={`${kit.panel} flex items-center gap-3 text-sm text-ink-muted`} role="status" aria-busy="true">
          <Loader2 className="w-5 h-5 animate-spin text-ink" /> Loading today's usage…
        </div>
      )}

      {view && !view.configured && (
        <Panel
          title="Connect Cloudflare usage"
          hint="Not connected yet. Until it is, no numbers are shown here."
          action={<Pill tone="off">Not connected yet</Pill>}
        >
          <p className="text-sm leading-5 text-ink-muted">
            In the Cloudflare dashboard create an API token with the permission <strong className="font-semibold text-ink">Account Analytics: Read</strong>, then add it to the Worker as the secret{' '}
            <code className="font-mono text-[13px] break-all text-ink">CLOUDFLARE_ANALYTICS_TOKEN</code>. Until then no numbers are shown here.
          </p>
          {/* The server's "token missing" message repeats the paragraph above; only show other reasons (e.g. no account ID) */}
          {view.error && !view.error.includes('CLOUDFLARE_ANALYTICS_TOKEN') && <p className="mt-2 text-sm leading-5 text-ink-muted break-words">{view.error}</p>}
          <div className="mt-4">{refreshButton}</div>
        </Panel>
      )}

      {view && view.configured && (
        <>
          {view.error && (
            <div role="alert" className={kit.alert}>
              <p className="font-semibold break-words">{view.error}</p>
              <button type="button" onClick={load} disabled={loading} className={`mt-3 ${kit.small}`}>
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}

          {/* The plain answer first */}
          <section id="admin-usage-answer" role="status" className={`sag-glass sag-glass-strong p-4 sm:p-6 flex flex-wrap items-start gap-x-4 gap-y-3 ${near.length ? '!border-danger-line' : ''}`}>
            <span className={`shrink-0 mt-0.5 ${near.length ? 'text-danger' : 'text-brand'}`} aria-hidden="true">
              {near.length || close.length ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <h3 className={`text-xl leading-7 font-semibold ${near.length ? 'text-danger' : 'text-ink'}`}>
                {meters.length === 0
                  ? 'The usage numbers are not available right now'
                  : near.length
                    ? `Close to ${period} limit for ${namesOf(near)}`
                    : close.length
                      ? `Getting close to ${period} limit for ${namesOf(close)}`
                      : `You are well within ${period} limits`}
              </h3>
              <p className="mt-1 text-sm leading-5 text-ink-muted sag-num">
                {meters.length === 0
                  ? 'Cloudflare did not send any numbers this time. Try Refresh in a minute.'
                  : near.length
                    ? `${near.length === 1 ? 'This meter is' : 'These meters are'} at 90% or more. See below what happens if ${near.length === 1 ? 'it fills' : 'they fill'} up.`
                    : close.length
                      ? `${close.length === 1 ? 'This meter has' : 'These meters have'} passed 70%. Nothing has stopped; keep an eye on ${close.length === 1 ? 'it' : 'them'}.`
                      : highest && `The fullest meter is ${highest.name}, at ${percentText(highest.percent)}%. Nothing needs your attention.`}
              </p>
              <p className={`mt-2 ${kit.hint} sag-num`}>
                {monthly
                  ? <>Usage above these amounts is billed by Cloudflare; the count starts again on {dayOf(view.resetAt)}. </>
                  : resetTime && <>The limits reset at {resetTime}. </>}
                Updated {clock(view.fetchedAt, true)}; refreshes every minute while this page is open.
              </p>
            </div>
            {refreshButton}
          </section>

          <Panel
            title={monthly ? 'This month\'s meters' : 'Today\'s meters'}
            hint={monthly ? `What has been used ${since}, against what the paid plan includes.` : `What has been used ${since}, against the free daily limits.`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {view.workers ? (
                <UsageBar
                  title="Worker requests"
                  used={view.workers.requests}
                  limit={view.workers.limit}
                  usedText={num(view.workers.requests)}
                  limitText={num(view.workers.limit)}
                  detail={`${num(view.workers.requests)} of ${num(view.workers.limit)} used ${since}`}
                  atLimit={atLimit.requests}
                  note={`Every time the store answers a shopper or the admin, it counts as one.${view.workers.scriptRequests !== undefined && view.workers.scriptRequests !== view.workers.requests
                    ? ` ${num(view.workers.scriptRequests)} of these are this store (${view.workers.scriptName}); the limit counts every Worker in the account.`
                    : ''}`}
                />
              ) : <Unavailable title="Worker requests" />}
              {view.d1 ? (
                <>
                  <UsageBar
                    title="Database rows read"
                    used={view.d1.rowsRead}
                    limit={view.d1.rowsReadLimit}
                    usedText={num(view.d1.rowsRead)}
                    limitText={num(view.d1.rowsReadLimit)}
                    detail={`${num(view.d1.rowsRead)} of ${num(view.d1.rowsReadLimit)} used ${since}`}
                    atLimit={atLimit.reads}
                    note={`Looking up products, orders and settings. ${num(view.d1.readQueries)} read queries`}
                  />
                  <UsageBar
                    title="Database rows written"
                    used={view.d1.rowsWritten}
                    limit={view.d1.rowsWrittenLimit}
                    usedText={num(view.d1.rowsWritten)}
                    limitText={num(view.d1.rowsWrittenLimit)}
                    detail={`${num(view.d1.rowsWritten)} of ${num(view.d1.rowsWrittenLimit)} used ${since}`}
                    atLimit={atLimit.writes}
                    note={`Saving orders, changes and visitor counts. ${num(view.d1.writeQueries)} write queries`}
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
                  usedText={num(Math.max(0, view.email.dailyCap - view.email.left))}
                  limitText={`${num(view.email.dailyCap)} a day`}
                  detail={`${num(view.email.left)} of ${num(view.email.dailyCap)} emails left today`}
                  atLimit={atLimit.email}
                  note={`Order and sign-in code emails. ${num(view.email.left)} of ${num(view.email.dailyCap)} emails left today.`}
                />
              ) : (
                <div className={kit.inset}>
                  <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Emails (Brevo)</h4>
                  <p className="mt-2 text-[26px] leading-8 font-semibold text-ink sag-num">{num(view.email.left)}</p>
                  <p className="text-sm leading-5 text-ink-muted">email credits left</p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Photo storage: Cloudflare R2's own numbers for this month */}
          {view.media && (
            <Panel id="admin-usage-media" title="Photos and reels" hint="Photos and reels (Cloudflare R2, free plan, this month)">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {view.media.storageBytes !== null ? (
                  <UsageBar
                    title="Photo storage"
                    used={view.media.storageBytes}
                    limit={view.media.storageLimit}
                    usedText={size(view.media.storageBytes)}
                    limitText={size(view.media.storageLimit)}
                    detail={`${size(view.media.storageBytes)} of ${size(view.media.storageLimit)} used`}
                    atLimit={atLimit.photos}
                    note={view.media.photos !== null
                      ? `About ${num(view.media.photos)} photos stored (${num(view.media.objects || 0)} files: every photo is kept in several ready-made sizes).${view.photoRoom ? ` Room for about ${num(view.photoRoom.photosLeft)} more photos.` : ''}`
                      : undefined}
                  />
                ) : (
                  <div className={kit.inset}>
                    <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Photo storage</h4>
                    <p className="mt-1.5 text-sm leading-5 text-ink-muted">Cloudflare reports storage a few hours behind. The first number of the month shows here soon. The free plan stores {size(view.media.storageLimit)}.</p>
                  </div>
                )}
                <UsageBar
                  title="Photos shown to shoppers (reads)"
                  used={view.media.reads}
                  limit={view.media.readsLimit}
                  usedText={num(view.media.reads)}
                  limitText={num(view.media.readsLimit)}
                  detail={`${num(view.media.reads)} of ${num(view.media.readsLimit)} used this month`}
                  atLimit={atLimit.photos}
                  note="A photo Cloudflare already has in its cache near the shopper does not count, so this stays far below the number of photos seen. Sending photos costs nothing: there is no data limit."
                />
                <UsageBar
                  title="Photo uploads (writes)"
                  used={view.media.writes}
                  limit={view.media.writesLimit}
                  usedText={num(view.media.writes)}
                  limitText={num(view.media.writesLimit)}
                  detail={`${num(view.media.writes)} of ${num(view.media.writesLimit)} used this month`}
                  atLimit={atLimit.photos}
                  note="One uploaded photo is nine small files."
                />
              </div>
            </Panel>
          )}

          {/* How many visitors the free plan can carry: an estimate from measured numbers only */}
          {view.capacity ? (() => {
            const capacity = view.capacity;
            const label: Record<string, string> = { requests: 'Worker requests', writes: 'database rows written', reads: 'database rows read', photoReads: 'photo reads' };
            return (
              <Panel
                id="admin-usage-capacity"
                title="How many visitors the store can carry"
                hint={`Worked out from what the ${num(capacity.visitsToday)} visits counted today${capacity.visitsThisMonth ? ` (${num(capacity.visitsThisMonth)} this month)` : ''} really used.`}
              >
                <Tiles>
                  {capacity.visitsPerDay !== null && (
                    <Tile label="Visits a day the free plan can carry" value={`about ${num(capacity.visitsPerDay)}`} />
                  )}
                  <Tile label="Visits a month" value={`about ${num(capacity.visitsPerMonth)}`} />
                  <Tile label="What runs out first" value={<span className="block text-lg leading-7">{label[capacity.tightest] || capacity.tightest}</span>} />
                  {capacity.visitsPerDay !== null && capacity.visitsToday > 0 && (
                    <Tile label="Room left today" value={`about ${num(Math.max(0, capacity.visitsPerDay - capacity.visitsToday))}`} note="more visits" />
                  )}
                </Tiles>
                <ul className="mt-4 space-y-1 text-[13px] leading-[18px] text-ink-muted sag-num">
                  {capacity.perDay.map((row) => <li key={row.limit}>{label[row.limit]}: {decimals(row.perVisit)} a visit, enough for about {num(row.visits)} visits a day</li>)}
                  {capacity.perMonth.map((row) => <li key={row.limit}>{label[row.limit]}: {decimals(row.perVisit)} a visit, enough for about {num(row.visits)} visits a month</li>)}
                </ul>
                <p className={`mt-3 ${kit.hint}`}>An estimate from today's numbers; it settles as more visits are counted. Photos themselves have no data limit.</p>
              </Panel>
            );
          })() : view.media && (
            <Panel
              id="admin-usage-capacity"
              title="How many visitors the store can carry"
              hint="Not enough visits counted yet today to measure. This appears once about 50 visits have been counted."
            />
          )}

          <Panel title="Health details" hint={`More from ${since}. Useful when something looks slow or broken.`}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Fact label="Requests that ended in an error" danger={Boolean(view.workers && view.workers.errors > 0)}>{view.workers ? num(view.workers.errors) : 'not available'}</Fact>
              <Fact label="Calls the store made to other services">{view.workers ? num(view.workers.subrequests) : 'not available'}</Fact>
              <Fact label="CPU time per request, typical (p50)">{view.workers ? ms(view.workers.cpuP50Ms) : 'not available'}</Fact>
              <Fact label="CPU time per request, slowest 1% (p99)">{view.workers ? ms(view.workers.cpuP99Ms) : 'not available'}</Fact>
            </dl>
            <p className={`mt-4 ${kit.hint}`}>{view.plan === 'paid' ? 'The paid plan allows up to 30 seconds of CPU time per request.' : 'The free plan allows about 10 ms of CPU time per request.'}</p>
          </Panel>
        </>
      )}

      {view && (
        <Panel
          id="admin-usage-plan"
          title="Cloudflare plan"
          hint={<>
            {view.plan === 'paid'
              ? 'This page counts the month against what the paid plan includes, and visitor counting does not pause.'
              : 'This page counts each day against the free limits, and visitor counting pauses before the day\'s free writes run out, so orders keep working.'}
            {' '}Cloudflare does not tell the store which plan the account is on, so set it here.
          </>}
          action={<Pill tone="soon">{view.plan === 'paid' ? 'Workers Paid ($5 a month)' : 'Free plan'}</Pill>}
        >
          {planError && <p role="alert" className="mb-3 text-sm leading-5 font-semibold text-danger">{planError}</p>}
          {confirmPaid ? (
            <div className="rounded-[16px] border border-brand-line bg-brand-wash px-4 py-3">
              <p className="text-sm leading-5 font-semibold text-ink">Have you already bought Workers Paid in Cloudflare?</p>
              <p className="mt-1 text-sm leading-5 text-ink">
                Switch only after buying it. On a free account this would let visitor counting use up the day's free writes, and orders would stop until 5:30 am.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => savePlan('paid')} disabled={savingPlan} className="sag-btn-primary h-11 px-5 text-sm gap-2">
                  {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />} Yes, I have bought it
                </button>
                <button type="button" onClick={() => setConfirmPaid(false)} disabled={savingPlan} className={kit.small}>Not yet</button>
              </div>
            </div>
          ) : view.plan === 'paid' ? (
            <button type="button" onClick={() => savePlan('free')} disabled={savingPlan} className={kit.small}>
              {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />} Switch back to the free plan
            </button>
          ) : (
            <button type="button" onClick={() => { setPlanError(''); setConfirmPaid(true); }} className={kit.small}>
              I have bought the paid plan
            </button>
          )}
        </Panel>
      )}
    </div>
  );
};
