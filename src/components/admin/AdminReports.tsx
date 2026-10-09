import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { AdminPageHeader } from './kidsToysShared';
import { dayLabel, dayRange, firstOrderDay, istToday, monthLabel, monthStart, num, ordersByDay, rupees, shiftDay, totalsFor, useDailyAnalytics, weekStart } from './adminStats';
import { Panel, Segmented } from './adminUi';

type RangeId = '7' | '30' | '90' | 'all';
const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
];
type Metric = 'sales' | 'visits' | 'orders';
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'visits', label: 'Visits' },
];
type Group = 'day' | 'week' | 'month';
const GROUPS: Array<{ id: Group; label: string; one: string; many: string }> = [
  { id: 'day', label: 'Day', one: 'day', many: 'days' },
  { id: 'week', label: 'Week', one: 'week', many: 'weeks' },
  { id: 'month', label: 'Month', one: 'month', many: 'months' },
];
/** Table rows shown at first, and added by "Show more". */
const ROW_STEP = 90;

interface Row {
  /** The first day of the row: the day itself, the week's Monday or the 1st of the month (cut to the chosen range). */
  key: string;
  from: string;
  to: string;
  days: number;
  visits: number | null;
  /** How many of the row's days have a visits figure. */
  visitDays: number;
  cartAdds: number | null;
  checkouts: number | null;
  paid: number;
  cod: number;
  sales: number;
  cancelled: number;
  refunded: number;
}

const th = 'py-3 px-3 font-medium text-right whitespace-nowrap';
const td = 'py-3 px-3 text-right sag-num whitespace-nowrap';
const NO_DATA = <span className="text-ink-muted">No data</span>;

/** Admin → Reports: the store's history by day, week or month, from the server's daily visit counts and the orders list. */
export const AdminReports: React.FC = () => {
  const { orders = [], ordersLoaded } = useAdmin();
  const analytics = useDailyAnalytics();
  const byDay = useMemo(() => ordersByDay(orders), [orders]);

  const [range, setRange] = useState<RangeId>('30');
  const [group, setGroup] = useState<Group>('day');
  const [metric, setMetric] = useState<Metric>('sales');
  const [focusKey, setFocusKey] = useState('');
  const [shown, setShown] = useState(ROW_STEP);
  useEffect(() => { setShown(ROW_STEP); setFocusKey(''); }, [range, group]);

  const today = istToday();
  // "All time" starts at the first day the store has anything for: an order or a counted visit
  const firstDay = useMemo(() => {
    const candidates = [firstOrderDay(byDay), analytics.firstVisitDay].filter(Boolean).sort();
    return candidates[0] || '';
  }, [byDay, analytics.firstVisitDay]);

  const days = useMemo(() => {
    if (range === 'all') return firstDay && firstDay <= today ? dayRange(firstDay, today) : [];
    return dayRange(shiftDay(today, 1 - Number(range)), today);
  }, [range, today, firstDay]);

  /** Oldest first (the chart); the table shows it reversed. */
  const rows: Row[] = useMemo(() => {
    const buckets = new Map<string, string[]>();
    days.forEach((day) => {
      const key = group === 'week' ? weekStart(day) : group === 'month' ? monthStart(day) : day;
      const list = buckets.get(key);
      if (list) list.push(day); else buckets.set(key, [day]);
    });
    return [...buckets.entries()].map(([key, list]) => {
      const t = totalsFor(list, analytics.days, byDay);
      return {
        key, from: list[0], to: list[list.length - 1], days: list.length,
        visits: t.visits, visitDays: t.visitDays, cartAdds: t.cartAdds, checkouts: t.checkouts,
        paid: t.paid, cod: t.cod, sales: t.sales, cancelled: t.cancelled, refunded: t.refunded,
      };
    });
  }, [days, group, analytics.days, byDay]);
  const totals = useMemo(() => totalsFor(days, analytics.days, byDay), [days, analytics.days, byDay]);

  const groupInfo = GROUPS.find((g) => g.id === group)!;
  const rowLabel = (r: Row, withYear = true) => (group === 'month'
    ? `${monthLabel(r.key)}${r.days < 28 && (r.from !== monthStart(r.from) || r.to === today) ? ` (${r.days} ${r.days === 1 ? 'day' : 'days'})` : ''}`
    : group === 'week'
      ? (r.from === r.to ? dayLabel(r.from, withYear) : `${dayLabel(r.from)} to ${dayLabel(r.to, withYear)}`)
      : dayLabel(r.key, withYear));
  const holdsToday = (r: Row) => r.to === today;

  // A funnel column is shown only when the store has recorded that count on at least one day of the range
  const hasCart = rows.some((r) => r.cartAdds !== null);
  const hasCheckout = rows.some((r) => r.checkouts !== null);

  const loading = !ordersLoaded || !analytics.loaded;
  const orderCell = (value: number, money = false) => (ordersLoaded ? (money ? rupees(value) : num(value)) : '…');
  const visitCell = (value: number | null) => (!analytics.loaded ? '…' : value === null ? NO_DATA : num(value));

  // ---- chart
  const valueOf = (r: Row): number | null => (metric === 'sales' ? r.sales : metric === 'orders' ? r.paid : r.visits);
  const metricReady = metric === 'visits' ? analytics.loaded : ordersLoaded;
  const peak = rows.reduce((max, r) => Math.max(max, valueOf(r) ?? 0), 0);
  const show = (value: number | null) => (value === null ? 'No data' : metric === 'sales' ? rupees(value) : num(value));
  const focused = rows.find((r) => r.key === focusKey) || rows[rows.length - 1];
  const best = metricReady && peak > 0 ? rows.find((r) => valueOf(r) === peak) : undefined;
  const metricLabel = METRICS.find((m) => m.id === metric)!.label;

  // ---- CSV (built in the browser from the same rows as the table)
  const downloadCsv = () => {
    const first = group === 'day' ? ['Date'] : [group === 'week' ? 'Week from' : 'Month from', 'To', 'Days'];
    const head = [...first, 'Visits', ...(group === 'day' ? [] : ['Days with a visit count']), ...(hasCart ? ['Add to bag'] : []), ...(hasCheckout ? ['Checkouts started'] : []), 'Paid orders', 'Of which cash on delivery', 'Sales (INR)', 'Cancelled', 'Refunded'];
    const cell = (value: number | null) => (value === null ? 'No data' : String(Math.round(value)));
    const lines = [...rows].reverse().map((r) => [
      ...(group === 'day' ? [r.key] : [r.from, r.to, String(r.days)]),
      cell(r.visits), ...(group === 'day' ? [] : [String(r.visitDays)]), ...(hasCart ? [cell(r.cartAdds)] : []), ...(hasCheckout ? [cell(r.checkouts)] : []),
      cell(r.paid), cell(r.cod), cell(r.sales), cell(r.cancelled), cell(r.refunded),
    ]);
    const csv = [head, ...lines].map((line) => line.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `suit-aura-girls-report-by-${group}-${days[0] || today}-to-${days[days.length - 1] || today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const totalTiles: Array<{ label: string; value: React.ReactNode; note: string }> = [
    {
      label: 'Visits',
      value: !analytics.loaded ? '…' : totals.visits === null ? NO_DATA : num(totals.visits),
      note: !analytics.loaded ? 'Loading visits…' : totals.visits === null ? 'No visits were counted in this range' : totals.visitDays < totals.days ? `Counted on ${totals.visitDays} of ${totals.days} days` : `Counted on all ${totals.days} days`,
    },
    { label: 'Paid orders', value: orderCell(totals.paid), note: ordersLoaded ? `${num(totals.cod)} of them cash on delivery` : 'Loading orders…' },
    { label: 'Sales', value: orderCell(totals.sales, true), note: 'Paid orders, cancelled and refunded left out' },
    { label: 'Average order', value: !ordersLoaded ? '…' : totals.averageOrder === null ? NO_DATA : rupees(totals.averageOrder), note: totals.averageOrder === null && ordersLoaded ? 'No paid order in this range' : 'Sales ÷ paid orders not cancelled' },
    { label: 'Cancelled orders', value: orderCell(totals.cancelled), note: 'By the day the order was placed' },
    { label: 'Refunded orders', value: orderCell(totals.refunded), note: 'By the day the order was paid' },
  ];

  const tableRows = [...rows].reverse();
  const barWidth = group === 'day' ? 9 : 22;

  return (
    <div id="admin-reports-page" className="space-y-5">
      <AdminPageHeader
        eyebrow="Overview"
        title="Reports"
        description="The store's history by day, week or month: how many visits came and how much was sold. Every figure is read from the store's own records; days are India time."
        actions={(
          <button type="button" onClick={downloadCsv} disabled={loading || rows.length === 0} className="sag-btn-outline">
            <Download className="w-4 h-4" /> Download CSV
          </button>
        )}
      />

      <div className="sag-glass p-4 sm:p-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <p className="mb-1.5 text-xs leading-4 text-ink-muted">Show one row for each</p>
            <Segmented label="Group by" value={group} options={GROUPS} onChange={setGroup} />
          </div>
          <div>
            <p className="mb-1.5 text-xs leading-4 text-ink-muted">Going back</p>
            <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
          </div>
        </div>
        {days.length > 0 && (
          <p className="text-[13px] leading-[18px] text-ink-muted">{dayLabel(days[0], true)} to {dayLabel(days[days.length - 1], true)} · {num(days.length)} {days.length === 1 ? 'day' : 'days'}{group !== 'day' ? ` in ${rows.length} ${rows.length === 1 ? groupInfo.one : groupInfo.many}` : ''}</p>
        )}
      </div>

      {analytics.error && <p role="alert" className="sag-glass px-4 py-3 text-sm leading-5 text-danger">{analytics.error} Orders and sales below are not affected.</p>}

      {rows.length === 0 ? (
        <p className="sag-glass px-4 py-10 text-sm leading-5 text-ink-muted text-center">{loading ? 'Loading…' : 'No data yet: the store has no orders and no counted visits.'}</p>
      ) : (
        <>
          {/* Totals for the range */}
          <dl aria-label="Totals for the range" className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
            {totalTiles.map((tile) => (
              <div key={tile.label} className="sag-glass min-w-0 px-4 py-4">
                <dt className="text-xs leading-4 text-ink-muted">{tile.label}</dt>
                <dd className="mt-1 text-2xl leading-8 font-semibold text-ink sag-num truncate">{tile.value}</dd>
                <dd className="mt-1 text-xs leading-4 text-ink-muted">{tile.note}</dd>
              </div>
            ))}
          </dl>

          {/* One bar per day, week or month */}
          <Panel
            id="admin-reports-chart"
            title={`${metricLabel} for each ${groupInfo.one}`}
            note="Tap a bar for the exact figure. Every row is also in the table below."
            action={<Segmented label="Show in the chart" value={metric} options={METRICS} onChange={setMetric} />}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-sm leading-5 text-ink-muted" aria-live="polite">
                {rowLabel(focused)}{holdsToday(focused) ? ' (so far)' : ''}:{' '}
                <span className="sag-num text-xl leading-7 font-semibold text-ink">{metricReady ? show(valueOf(focused)) : '…'}</span>
              </p>
              {best && <p className="text-[13px] leading-[18px] text-ink-muted">Best {groupInfo.one}: {rowLabel(best, false)} with <span className="sag-num font-medium">{show(valueOf(best))}</span></p>}
            </div>
            <div className="mt-3 flex gap-3">
              <div className="shrink-0 h-40 flex flex-col justify-between text-right text-[11px] leading-4 text-ink-muted sag-num" aria-hidden="true">
                <span>{metricReady ? show(peak) : '…'}</span>
                <span>0</span>
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="h-40 flex items-end gap-[2px] border-b border-line rounded-none" style={{ minWidth: `${rows.length * barWidth}px` }} role="group" aria-label={`${metricLabel} for each ${groupInfo.one}, oldest first`}>
                  {rows.map((r) => {
                    const value = metricReady ? valueOf(r) : null;
                    const height = value !== null && peak > 0 ? Math.max(value > 0 ? 2 : 0, (value / peak) * 100) : 0;
                    const on = r.key === focused.key;
                    const words = `${rowLabel(r)}: ${metricReady ? show(valueOf(r)) : 'loading'}`;
                    return (
                      <button key={r.key} type="button" title={words} aria-label={words} aria-pressed={on}
                        onClick={() => setFocusKey(r.key)} onMouseEnter={() => setFocusKey(r.key)} onFocus={() => setFocusKey(r.key)}
                        className={`flex-1 min-w-0 max-w-16 h-full flex items-end cursor-pointer rounded-t-[4px] ${on ? 'bg-sunken' : 'hover:bg-sunken'}`}>
                        <span className={`block w-full rounded-t-[4px] ${on ? 'bg-accent' : 'bg-brand'}`} style={{ height: `${height}%` }} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between gap-3 text-[11px] leading-4 text-ink-muted" style={{ minWidth: `${rows.length * barWidth}px` }} aria-hidden="true">
                  <span>{rowLabel(rows[0], false)}</span>
                  {rows.length > 1 && <span>{rowLabel(rows[rows.length - 1], false)}</span>}
                </div>
              </div>
            </div>
            {metric === 'visits' && <p className="mt-3 text-xs leading-4 text-ink-muted">A {groupInfo.one} with no bar and "No data" in the table has no visit count.</p>}
          </Panel>

          {/* The table, newest first */}
          <Panel id="admin-reports-table" title={`${groupInfo.label} by ${groupInfo.one}`} note={`Newest ${groupInfo.one} first${group === 'week' ? '. A week runs Monday to Sunday' : ''}`} flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] leading-[18px] text-ink border-collapse">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th scope="col" className="py-3 pl-4 sm:pl-5 pr-3 font-medium text-left whitespace-nowrap">{group === 'day' ? 'Date' : groupInfo.label}</th>
                    <th scope="col" className={th}>Visits</th>
                    {hasCart && <th scope="col" className={th}>Add to bag</th>}
                    {hasCheckout && <th scope="col" className={th}>Checkouts started</th>}
                    <th scope="col" className={th}>Paid orders</th>
                    <th scope="col" className={th}>Of which cash on delivery</th>
                    <th scope="col" className={th}>Sales (₹)</th>
                    <th scope="col" className={th}>Cancelled</th>
                    <th scope="col" className={`${th} pr-4 sm:pr-5`}>Refunded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tableRows.slice(0, shown).map((r) => (
                    <tr key={r.key} className={r.key === focusKey ? 'bg-sunken' : 'hover:bg-sunken'}>
                      <th scope="row" className="py-3 pl-4 sm:pl-5 pr-3 font-normal text-left whitespace-nowrap">{rowLabel(r)}{holdsToday(r) ? <span className="text-ink-muted"> · {group === 'day' ? 'today so far' : 'so far'}</span> : null}</th>
                      <td className={td}>
                        {visitCell(r.visits)}
                        {analytics.loaded && group !== 'day' && r.visits !== null && r.visitDays < r.days ? <span className="text-ink-muted"> ({r.visitDays} of {r.days} days)</span> : null}
                      </td>
                      {hasCart && <td className={td}>{visitCell(r.cartAdds)}</td>}
                      {hasCheckout && <td className={td}>{visitCell(r.checkouts)}</td>}
                      <td className={td}>{orderCell(r.paid)}</td>
                      <td className={td}>{orderCell(r.cod)}</td>
                      <td className={`${td} ${r.sales > 0 ? 'font-semibold text-ok' : ''}`}>{orderCell(r.sales, true)}</td>
                      <td className={td}>{orderCell(r.cancelled)}</td>
                      <td className={`${td} pr-4 sm:pr-5`}>{orderCell(r.refunded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows.length > shown && (
              <div className="px-4 sm:px-5 py-3 border-t border-line rounded-none flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-4 text-ink-muted">Showing {shown} of {tableRows.length} {groupInfo.many}. The CSV holds all of them.</p>
                <button type="button" onClick={() => setShown((n) => n + ROW_STEP)} className="sag-btn-outline">Show {Math.min(ROW_STEP, tableRows.length - shown)} more {groupInfo.many}</button>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* Where the numbers come from */}
      <div className="sag-glass p-4 sm:p-5 space-y-1.5 text-[13px] leading-[18px] text-ink-muted">
        <p className="text-ink">
          {!analytics.loaded
            ? 'Checking since when visits have been counted…'
            : analytics.firstVisitDay
              ? `Visit counting exists from ${dayLabel(analytics.firstVisitDay, true)}. Days before that, and any day the counter did not run, show "No data".`
              : 'No visit count has been recorded yet, so every day shows "No data" for visits.'}
        </p>
        <p>Visits{hasCart || hasCheckout ? ', add to bag and checkouts started' : ''} are the server's own daily counts. The server closes a visit day at 5:30 am India time, so a visit between midnight and 5:30 am is counted under the day before.</p>
        <p>Paid orders are orders whose payment the server verified, cash on delivery included (its advance is paid online), on the day they were paid. Sales add up the order totals of those not cancelled. A refunded order leaves Paid orders and Sales and is counted under Refunded. Sandbox test payments are not counted.</p>
        <p>A week or a month at the start of the chosen range holds only the days inside the range.</p>
      </div>
    </div>
  );
};
