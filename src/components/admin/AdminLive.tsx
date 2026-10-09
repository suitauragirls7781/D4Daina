import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Monitor, Smartphone, Tablet } from 'lucide-react';
import { EmptyNote, Panel, Segmented, ShareRow } from './adminUi';

/**
 * The live view of the store: who is on the site right now and what they are doing.
 * Read from GET /api/admin-config?action=live with the admin session. One loop asks every 15 seconds
 * while the tab is visible; nothing here is estimated.
 */

export interface LiveStep { t: number; path: string; label: string }
export interface LiveVisitor {
  id: string;
  city: string;
  region: string;
  country: string;
  device: string;
  source: string;
  path: string;
  label: string;
  pages: number;
  firstSeen: number;
  lastSeen: number;
  /** Newest first. */
  trail: LiveStep[];
}
export interface LiveView {
  /** The server's clock when it answered (ms). */
  now: number;
  windowSeconds: number;
  paused: boolean;
  activeCount: number;
  active: LiveVisitor[];
  recent: LiveVisitor[];
  todayCount: number | null;
  /** Today's visitors per India-time hour (index 0 = the midnight hour); null when the server does not send it. */
  todayByHour: number[] | null;
}
export interface LiveState {
  view: LiveView | null;
  /** 'unavailable' = the live view has never answered (not built yet, or it is failing). */
  status: 'loading' | 'ok' | 'unavailable';
  /** This browser's clock when the last good answer arrived (ms); 0 before the first one. */
  fetchedAt: number;
  /** The last try failed, so `view` is older than one round. */
  stale: boolean;
}

const POLL_MS = 15000;

/** A moment as milliseconds, whether the server sent milliseconds, seconds or an ISO date (0 when it is none). */
const toMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e11 ? value * 1000 : value;
  if (typeof value === 'string' && value) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber < 1e11 ? asNumber * 1000 : asNumber;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value));

const toVisitor = (raw: any, index: number): LiveVisitor => {
  const trail: LiveStep[] = (Array.isArray(raw?.trail) ? raw.trail : [])
    .map((s: any) => ({ t: toMs(s?.t), path: text(s?.path), label: text(s?.label) || text(s?.path) || 'A page' }))
    .filter((s: LiveStep) => s.t > 0)
    .sort((a: LiveStep, b: LiveStep) => b.t - a.t);
  const lastSeen = toMs(raw?.lastSeen) || trail[0]?.t || 0;
  return {
    id: text(raw?.id) || `visitor-${index}`,
    city: text(raw?.city), region: text(raw?.region), country: text(raw?.country),
    device: text(raw?.device), source: text(raw?.source),
    path: text(raw?.path) || trail[0]?.path || '',
    label: text(raw?.label) || trail[0]?.label || text(raw?.path) || 'A page',
    pages: Math.max(Number(raw?.pages) || 0, trail.length ? 1 : 0),
    firstSeen: toMs(raw?.firstSeen) || trail[trail.length - 1]?.t || lastSeen,
    lastSeen,
    trail,
  };
};

const toView = (raw: any): LiveView | null => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.active)) return null;
  const active = raw.active.map(toVisitor);
  const today = Number(raw.todayCount);
  return {
    now: toMs(raw.now) || Date.now(),
    windowSeconds: Number(raw.windowSeconds) || 150,
    paused: raw.paused === true,
    activeCount: Number.isFinite(Number(raw.activeCount)) ? Number(raw.activeCount) : active.length,
    active,
    recent: (Array.isArray(raw.recent) ? raw.recent : []).map(toVisitor),
    todayCount: raw.todayCount === null || raw.todayCount === undefined || !Number.isFinite(today) ? null : today,
    todayByHour: Array.isArray(raw.todayByHour) && raw.todayByHour.length === 24
      ? raw.todayByHour.map((n: unknown) => Math.max(0, Math.round(Number(n) || 0)))
      : null,
  };
};

// ---- the active count, shared with the admin menu (so the menu needs no loop of its own)
let sharedCount: number | null = null;
const listeners = new Set<() => void>();
const setSharedCount = (value: number | null) => {
  if (sharedCount === value) return;
  sharedCount = value;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** How many people are on the site right now, while the dashboard is open and has the figure; else null. */
export const useLiveCount = () => useSyncExternalStore(subscribe, () => sharedCount, () => null);

/** The one live loop: asks every 15 seconds while the tab is visible, waits while it is hidden, stops on unmount. */
export const useLiveVisitors = (): LiveState => {
  const [state, setState] = useState<LiveState>({ view: null, status: 'loading', fetchedAt: 0, stale: false });

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let controller: AbortController | null = null;

    const load = () => {
      window.clearTimeout(timer);
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const giveUp = window.setTimeout(() => mine.abort(), 12000);
      fetch('/api/admin-config?action=live', { credentials: 'same-origin', signal: mine.signal })
        .then(async (response) => {
          const view = response.ok ? toView(await response.json().catch(() => null)) : null;
          if (!view) throw new Error('no live view');
          if (stopped || controller !== mine) return;
          setSharedCount(view.activeCount);
          setState({ view, status: 'ok', fetchedAt: Date.now(), stale: false });
        })
        .catch(() => {
          if (stopped || controller !== mine) return;
          setState((old) => {
            // A figure older than two minutes is no longer "right now"
            const keep = old.view && Date.now() - old.fetchedAt < 120000;
            if (!keep) setSharedCount(null);
            return keep ? { ...old, stale: true } : { view: null, status: 'unavailable', fetchedAt: 0, stale: false };
          });
        })
        .finally(() => {
          window.clearTimeout(giveUp);
          if (stopped || controller !== mine) return;
          if (document.visibilityState === 'visible') timer = window.setTimeout(load, POLL_MS);
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
      else { window.clearTimeout(timer); controller?.abort(); controller = null; }
    };
    if (document.visibilityState === 'visible') load();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      setSharedCount(null);
    };
  }, []);

  return state;
};

// ---------------------------------------------------------------- plain words

export const placeLabel = (v: Pick<LiveVisitor, 'city' | 'region' | 'country'>) => {
  const parts = [v.city, v.region].filter(Boolean).filter((part, i, all) => all.indexOf(part) === i);
  if (parts.length) return parts.join(', ');
  if (!v.country) return 'Location unknown';
  if (v.country.length !== 2) return v.country;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(v.country.toUpperCase()) || 'Location unknown'; } catch { return 'Location unknown'; }
};
const shortPlace = (v: LiveVisitor) => v.city || v.region || (placeLabel(v) === 'Location unknown' ? 'Someone' : placeLabel(v));

export const deviceLabel = (device: string) => {
  const d = device.toLowerCase();
  if (d === 'instagram_webview') return 'Phone (inside the Instagram or Facebook app)';
  if (d === 'mobile' || d === 'phone') return 'Phone';
  if (d === 'tablet') return 'Tablet';
  if (d === 'desktop' || d === 'computer') return 'Computer';
  return 'Device unknown';
};
/** Phone, tablet or computer, for the "Phones or computers" split. */
export const deviceGroup = (device: string) => {
  const d = device.toLowerCase();
  if (d === 'instagram_webview' || d === 'mobile' || d === 'phone') return 'Phone';
  if (d === 'tablet') return 'Tablet';
  if (d === 'desktop' || d === 'computer') return 'Computer';
  return 'Unknown';
};
const DeviceIcon: React.FC<{ device: string }> = ({ device }) => {
  const group = deviceGroup(device);
  const Icon = group === 'Computer' ? Monitor : group === 'Tablet' ? Tablet : Smartphone;
  return <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />;
};

/** Where a visitor came from, in plain words. */
export const sourceLabel = (source: string) => {
  const s = source.toLowerCase().trim();
  if (!s || /^\(?(direct|none|null|unknown)\)?$/.test(s)) return 'Direct (typed the address or a saved link)';
  const paid = /(^|[^a-z])(ad|ads|paid|cpc|ppc|sponsored)([^a-z]|$)/.test(s);
  const meta = /instagram|facebook|meta|(^|[^a-z])(ig|fb)([^a-z]|$)/.test(s);
  if (meta && paid) return 'Facebook / Instagram ad';
  if (/google/.test(s)) return paid ? 'Google ad' : 'Google';
  if (/instagram|(^|[^a-z])ig([^a-z]|$)/.test(s)) return 'Instagram';
  if (/facebook|(^|[^a-z])fb([^a-z]|$)|meta/.test(s)) return 'Facebook';
  if (/whatsapp|wa\.me/.test(s)) return 'WhatsApp';
  if (/youtube|youtu\.be/.test(s)) return 'YouTube';
  if (/bing|yahoo|duckduckgo/.test(s)) return 'Other search engine';
  if (/mail|brevo|newsletter/.test(s)) return 'Email';
  if (/pinterest/.test(s)) return 'Pinterest';
  if (/telegram|t\.me/.test(s)) return 'Telegram';
  return `Another site (${source.replace(/^https?:\/\//, '').slice(0, 40)})`;
};
const shortSource = (source: string) => sourceLabel(source).replace(/ \(typed.*$/, '');

const span = (ms: number) => {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
};
const clock = (t: number) => new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
export const agoLabel = (t: number, now: number) => {
  const gap = now - t;
  if (gap < 45000) return 'just now';
  if (gap < 3600000) return `${Math.max(1, Math.round(gap / 60000))} min ago`;
  if (gap < 6 * 3600000) return `${Math.floor(gap / 3600000)} hr ago`;
  return clock(t);
};

type Stage = 'checkout' | 'bag' | 'product' | 'other';
export const stageOf = (step: { path: string; label: string }): Stage => {
  const both = `${step.path} ${step.label}`.toLowerCase();
  if (/checkout|payment/.test(both)) return 'checkout';
  if (/(^|[^a-z])(bag|cart)([^a-z]|$)/.test(both)) return 'bag';
  if (/^product\b/.test(step.label.toLowerCase()) || /^\/(product|p)\//.test(step.path.toLowerCase())) return 'product';
  return 'other';
};

/** "Updated N seconds ago", counting by itself between two rounds. */
export const UpdatedAgo: React.FC<{ at: number; stale?: boolean }> = ({ at, stale }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') tick((n) => n + 1); }, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!at) return null;
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  const words = seconds < 2 ? 'Updated just now' : seconds < 90 ? `Updated ${seconds} seconds ago` : `Updated ${Math.round(seconds / 60)} minutes ago`;
  return <span className="sag-num">{words}{stale ? ' · trying again' : ''}</span>;
};

/** The small rose dot that pulses beside a live number (still with reduced motion). */
export const LiveDot: React.FC<{ on?: boolean }> = ({ on = true }) => (
  <span className="relative inline-flex w-2.5 h-2.5 shrink-0" aria-hidden="true">
    {on && <span className="absolute inset-0 rounded-full bg-accent opacity-60 motion-safe:animate-ping" />}
    <span className={`relative w-2.5 h-2.5 rounded-full ${on ? 'bg-accent' : 'bg-control'}`} />
  </span>
);

const UNAVAILABLE = 'Live view is not available yet.';

// ---------------------------------------------------------------- live visitors

export const LiveVisitorsPanel: React.FC<{ live: LiveState }> = ({ live }) => {
  const [open, setOpen] = useState('');
  const view = live.view;
  // People in checkout first, then in the bag, then the newest movement
  const rows = useMemo(() => {
    const rank = (v: LiveVisitor) => ({ checkout: 0, bag: 1, product: 2, other: 2 }[stageOf(v)]);
    return [...(view?.active || [])].sort((a, b) => rank(a) - rank(b) || b.lastSeen - a.lastSeen);
  }, [view]);

  return (
    <Panel
      id="admin-live-visitors"
      title={<span className="inline-flex items-center gap-2"><LiveDot on={!!view && view.activeCount > 0} /> Live visitors</span>}
      note={view ? `People who moved on the site in the last ${Math.round(view.windowSeconds / 60 * 10) / 10} minutes. Tap a person to see every page they opened.` : undefined}
      action={view ? <span className="text-xs leading-4 text-ink-muted"><UpdatedAgo at={live.fetchedAt} stale={live.stale} /></span> : undefined}
      flush
    >
      {!view ? (
        <EmptyNote>{live.status === 'loading' ? 'Looking who is on the site…' : UNAVAILABLE}</EmptyNote>
      ) : rows.length === 0 ? (
        <EmptyNote>Nobody is on the site right now.</EmptyNote>
      ) : (
        <ul className="divide-y divide-line max-h-[560px] overflow-y-auto overscroll-contain">
          {rows.map((v) => {
            const stage = stageOf(v);
            const isOpen = open === v.id;
            return (
              <li key={v.id} className={stage === 'checkout' ? 'bg-brand-wash' : ''}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : v.id)} className="w-full px-4 sm:px-5 py-3 flex items-start gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">
                  <span className="mt-0.5 text-ink-muted"><DeviceIcon device={v.device} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm leading-5 font-medium text-ink">{placeLabel(v)}</span>
                      {stage === 'checkout' && <span className="inline-flex items-center h-5 px-2 rounded-full bg-brand text-[11px] leading-4 font-bold text-[color:var(--sag-on-gold)]">At checkout</span>}
                      {stage === 'bag' && <span className="inline-flex items-center h-5 px-2 rounded-full border border-brand-line text-[11px] leading-4 font-medium text-sale">In the bag</span>}
                    </span>
                    <span className={`mt-0.5 block text-sm leading-5 break-words ${stage === 'checkout' || stage === 'bag' ? 'text-sale' : 'text-ink'}`}>Now on: {v.label}</span>
                    <span className="mt-1 block text-xs leading-4 text-ink-muted">
                      {deviceLabel(v.device)} · Came from: {shortSource(v.source)}
                    </span>
                    <span className="block text-xs leading-4 text-ink-muted sag-num">
                      On the site for {span(view.now - v.firstSeen)} · {v.pages} {v.pages === 1 ? 'page' : 'pages'} seen
                    </span>
                  </span>
                  <ChevronDown className={`mt-1 w-4 h-4 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 pl-11 sm:pl-12">
                    <p className="text-[11px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted">Their path, newest first</p>
                    {v.trail.length === 0 ? (
                      <p className="mt-2 text-[13px] leading-[18px] text-ink-muted">No pages recorded yet.</p>
                    ) : (
                      <ol className="mt-2 space-y-2 border-l border-line pl-4 rounded-none">
                        {v.trail.map((step, i) => (
                          <li key={`${step.t}-${i}`} className="relative text-[13px] leading-[18px]">
                            <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full ${i === 0 ? 'bg-brand' : 'bg-control'}`} aria-hidden="true" />
                            <span className="sag-num text-ink-muted">{clock(step.t)}</span>{' '}
                            <span className={stageOf(step) === 'checkout' || stageOf(step) === 'bag' ? 'text-sale' : 'text-ink'}>{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- activity feed

export interface FeedEvent {
  key: string;
  t: number;
  /** Who: a place, or "Order". */
  who: string;
  what: string;
  kind: 'product' | 'buying' | 'order' | 'other';
  /** Good news is written in dark rose (the field's name is from an earlier look). */
  gold?: boolean;
  onOpen?: () => void;
}
type FeedFilter = 'all' | 'product' | 'buying';
const FEED_FILTERS: Array<{ id: FeedFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'product', label: 'Products' },
  { id: 'buying', label: 'Bag & checkout' },
];
const FEED_LINES = 30;

/** Every page opened by today's live and recent visitors, plus the day's order events, newest first. */
export const ActivityFeedPanel: React.FC<{ live: LiveState; orderEvents: FeedEvent[] }> = ({ live, orderEvents }) => {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const view = live.view;

  const events = useMemo(() => {
    const seen = new Set<string>();
    const list: FeedEvent[] = [];
    [...(view?.active || []), ...(view?.recent || [])].forEach((v) => {
      if (seen.has(v.id)) return;
      seen.add(v.id);
      v.trail.forEach((step, i) => {
        const stage = stageOf(step);
        list.push({
          key: `${v.id}-${step.t}-${i}`,
          t: step.t,
          who: shortPlace(v),
          what: `${stage === 'product' ? 'viewed' : 'opened'} ${step.label}`,
          kind: stage === 'product' ? 'product' : stage === 'other' ? 'other' : 'buying',
          gold: stage === 'checkout',
        });
      });
    });
    return [...list, ...orderEvents].sort((a, b) => b.t - a.t);
  }, [view, orderEvents]);

  const shown = events.filter((e) => filter === 'all' || e.kind === filter || (filter === 'buying' && e.kind === 'order')).slice(0, FEED_LINES);
  // The server's clock for the visitors' steps, so a wrong clock on this device does not bend the times
  const now = view ? view.now : Date.now();

  return (
    <Panel
      id="admin-activity"
      title="What customers are doing"
      note="Every page opened today by the people above and the ones who just left, with today's orders. Newest first."
      action={<Segmented label="Show" value={filter} options={FEED_FILTERS} onChange={setFilter} />}
      flush
    >
      {!view && orderEvents.length === 0 ? (
        <EmptyNote>{live.status === 'loading' ? 'Loading…' : UNAVAILABLE}</EmptyNote>
      ) : shown.length === 0 ? (
        <EmptyNote>{filter === 'all' ? 'Nothing has happened yet today.' : 'Nothing of this kind yet today.'}</EmptyNote>
      ) : (
        <>
          <ol className="divide-y divide-line max-h-[560px] overflow-y-auto overscroll-contain" aria-live="off">
            {shown.map((e) => {
              const line = (
                <>
                  <span className="w-[68px] shrink-0 sag-num text-xs leading-5 text-ink-muted">{agoLabel(e.t, now)}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-5 break-words">
                    <span className="font-medium text-ink">{e.who}</span>{' '}
                    <span className={e.gold ? 'text-sale' : 'text-ink-muted'}>{e.what}</span>
                  </span>
                </>
              );
              return (
                <li key={e.key}>
                  {e.onOpen
                    ? <button type="button" onClick={e.onOpen} className="w-full px-4 sm:px-5 py-2.5 flex items-start gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">{line}</button>
                    : <div className="px-4 sm:px-5 py-2.5 flex items-start gap-3">{line}</div>}
                </li>
              );
            })}
          </ol>
          {!view && <p className="px-4 sm:px-5 py-2.5 border-t border-line rounded-none text-xs leading-4 text-ink-muted">{live.status === 'loading' ? 'Loading the visitors…' : `${UNAVAILABLE} Only the orders are listed.`}</p>}
        </>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- visitors by hour

const hourWord = (hour: number) => `${hour % 12 || 12} ${hour % 24 < 12 ? 'am' : 'pm'}`;
const visitorWord = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'visitor' : 'visitors'}`;

/** Today's visitors hour by hour (India time). Draws nothing until the server sends the hourly counts. */
export const VisitorsByHourPanel: React.FC<{ live: LiveState }> = ({ live }) => {
  const view = live.view;
  const hours = view?.todayByHour;
  if (!view || !hours) return null;

  const nowHour = new Date(view.now + 5.5 * 3600000).getUTCHours();
  const peak = Math.max(...hours);
  const busiest = peak > 0 ? hours.indexOf(peak) : -1;
  const sentence = busiest >= 0
    ? `Busiest so far: ${hourWord(busiest)} to ${hourWord(busiest + 1)}, ${visitorWord(peak)}`
    : 'No visitors counted yet today.';

  return (
    <Panel id="admin-by-hour" title="Visitors by hour today" note="One bar for each hour of today, India time.">
      <p className={`text-sm leading-5 ${busiest >= 0 ? 'text-star' : 'text-ink-muted'}`}>{sentence}</p>
      <div className="mt-3 h-28 flex items-end gap-[3px] border-b border-line rounded-none" role="img" aria-label={`Visitors for each hour of today. ${sentence}`}>
        {hours.map((count, hour) => {
          const height = hour <= nowHour && peak > 0 ? Math.max((count / peak) * 100, count > 0 ? 4 : 0) : 0;
          const words = hour > nowHour ? `${hourWord(hour)} to ${hourWord(hour + 1)}: not yet` : `${hourWord(hour)} to ${hourWord(hour + 1)}: ${visitorWord(count)}${hour === nowHour ? ' so far' : ''}`;
          return (
            <span key={hour} title={words} className="flex-1 min-w-0 h-full flex items-end">
              <span className={`block w-full rounded-t-[4px] ${hour === busiest ? 'bg-star' : hour === nowHour ? 'bg-accent' : 'bg-brand'}`} style={{ height: `${height}%` }} />
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-4 text-[11px] leading-4 text-ink-muted" aria-hidden="true">
        <span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span>
      </div>
      <p className="mt-3 text-xs leading-4 text-ink-muted">
        The brown bar is the busiest hour, the pink bar is this hour ({hourWord(nowHour)} to {hourWord(nowHour + 1)}: <span className="sag-num">{visitorWord(hours[nowHour])}</span> so far).
      </p>
    </Panel>
  );
};

// ---------------------------------------------------------------- sources and devices

const tally = (visitors: LiveVisitor[], keyOf: (v: LiveVisitor) => string) => {
  const map = new Map<string, number>();
  visitors.forEach((v) => map.set(keyOf(v), (map.get(keyOf(v)) || 0) + 1));
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

/** "Where visitors come from" and "Phones or computers", from the live and recent visitors the server lists. */
export const SourcesAndDevices: React.FC<{ live: LiveState }> = ({ live }) => {
  const view = live.view;
  const visitors = useMemo(() => {
    const seen = new Set<string>();
    return [...(view?.active || []), ...(view?.recent || [])].filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  }, [view]);
  const sources = useMemo(() => tally(visitors, (v) => shortSource(v.source)), [visitors]);
  const devices = useMemo(() => tally(visitors, (v) => deviceGroup(v.device)), [visitors]);
  const note = visitors.length ? `Today's latest ${visitors.length} ${visitors.length === 1 ? 'visitor' : 'visitors'}` : "Today's visitors";
  const empty = <p className="py-6 text-sm leading-5 text-ink-muted text-center">{!view ? (live.status === 'loading' ? 'Loading…' : UNAVAILABLE) : 'No visitors yet today.'}</p>;

  return (
    <>
      <Panel id="admin-sources" title="Where visitors come from" note={note}>
        {sources.length ? <ul className="divide-y divide-line">{sources.slice(0, 7).map((s) => <ShareRow key={s.label} label={s.label} count={s.count} total={visitors.length} />)}</ul> : empty}
      </Panel>
      <Panel id="admin-devices" title="Phones or computers" note={note}>
        {devices.length ? <ul className="divide-y divide-line">{devices.map((d) => <ShareRow key={d.label} label={d.label} count={d.count} total={visitors.length} />)}</ul> : empty}
      </Panel>
    </>
  );
};
