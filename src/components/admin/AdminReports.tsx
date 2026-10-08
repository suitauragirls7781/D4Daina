import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { AdminPageHeader } from './kidsToysShared';
import { dayLabel, dayRange, firstOrderDay, istToday, num, ordersByDay, rupees, shiftDay, totalsFor, useDailyAnalytics } from './adminStats';

type RangeId = '7' | '30' | '90' | 'all';
const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All' },
];
type Metric = 'sales' | 'visits' | 'orders';
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'visits', label: 'Visits' },
  { id: 'orders', label: 'Orders' },
];
/** Table rows shown at first, and added by "Show more". */
const ROW_STEP = 90;

interface Row {
  day: string;
  visits: number | null;
  cartAdds: number | null;
  checkouts: number | null;
  paid: number;
  cod: number;
  sales: number;
  cancelled: number;
  refunded: number;
}

const eyebrow = 'text-[11px] leading-4 font-medium uppercase tracking-[0.12em] text-ink-muted';
const segment = (on: boolean) => `h-10 px-3.5 text-sm cursor-pointer transition-colors ${on ? 'bg-sunken text-ink font-medium' : 'bg-surface text-ink-muted hover:text-ink'}`;
const th = 'py-2.5 px-3 font-medium text-right whitespace-nowrap';
const td = 'py-2.5 px-3 text-right sag-num whitespace-nowrap';
const NO_DATA = <span className="text-ink-muted">No data</span>;

/** Admin → Reports: the store's day-by-day history, from the server's daily visit counts and the orders list. */
export const AdminReports: React.FC = () => {
  const { orders = [], ordersLoaded } = useAdmin();
  const analytics = useDailyAnalytics();
  const byDay = useMemo(() => ordersByDay(orders), [orders]);

  const [range, setRange] = useState<RangeId>('30');
  const [metric, setMetric] = useState<Metric>('sales');
  const [focusDay, setFocusDay] = useState('');
  const [shown, setShown] = useState(ROW_STEP);
  useEffect(() => { setShown(ROW_STEP); setFocusDay(''); }, [range]);

  const today = istToday();
  // "All" starts at the first day the store has anything for: an order or a counted visit
  const firstDay = useMemo(() => {
    const candidates = [firstOrderDay(byDay), analytics.firstVisitDay].filter(Boolean).sort();
    return candidates[0] || '';
  }, [byDay, analytics.firstVisitDay]);

  const days = useMemo(() => {
    if (range === 'all') return firstDay && firstDay <= today ? dayRange(firstDay, today) : [];
    return dayRange(shiftDay(today, 1 - Number(range)), today);
  }, [range, today, firstDay]);

  /** Oldest first (the chart); the table shows it reversed. */
  const rows: Row[] = useMemo(() => days.map((day) => {
    const a = analytics.days.get(day);
    const o = byDay.get(day);
    return {
      day,
      visits: a?.visits ?? null,
      cartAdds: a?.cartAdds ?? null,
      checkouts: a?.checkouts ?? null,
      paid: o?.paid || 0,
      cod: o?.cod || 0,
      sales: o?.sales || 0,
      cancelled: o?.cancelled || 0,
      refunded: o?.refunded || 0,
    };
  }), [days, analytics.days, byDay]);
  const totals = useMemo(() => totalsFor(days, analytics.days, byDay), [days, analytics.days, byDay]);

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
  const focused = rows.find((r) => r.day === focusDay) || rows[rows.length - 1];
  const metricLabel = METRICS.find((m) => m.id === metric)!.label;

  // ---- CSV (built in the browser from the same rows as the table)
  const downloadCsv = () => {
    const head = ['Date', 'Visits', ...(hasCart ? ['Add to bag'] : []), ...(hasCheckout ? ['Checkouts started'] : []), 'Paid orders', 'Of which cash on delivery', 'Sales (INR)', 'Cancelled', 'Refunded'];
    const cell = (value: number | null) => (value === null ? 'No data' : String(Math.round(value)));
    const lines = [...rows].reverse().map((r) => [
      r.day, cell(r.visits), ...(hasCart ? [cell(r.cartAdds)] : []), ...(hasCheckout ? [cell(r.checkouts)] : []),
      cell(r.paid), cell(r.cod), cell(r.sales), cell(r.cancelled), cell(r.refunded),
    ]);
    const csv = [head, ...lines].map((line) => line.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `suit-aura-girls-report-${rows[0]?.day || today}-to-${rows[rows.length - 1]?.day || today}.csv`;
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
    { label: 'Average order value', value: !ordersLoaded ? '…' : totals.averageOrder === null ? NO_DATA : rupees(totals.averageOrder), note: totals.averageOrder === null && ordersLoaded ? 'No paid order in this range' : 'Sales ÷ paid orders not cancelled' },
    { label: 'Cancelled orders', value: orderCell(totals.cancelled), note: 'By the day the order was placed' },
    { label: 'Refunded orders', value: orderCell(totals.refunded), note: 'By the day the order was paid' },
  ];

  const tableRows = [...rows].reverse();

  return (
    <div id="admin-reports-page" className="space-y-6">
      <AdminPageHeader
        eyebrow="Overview"
        title="Reports"
        description="Day by day: how many visits came and how much was sold. Every figure is read from the store's own records; days are India time."
        actions={(
          <button type="button" onClick={downloadCsv} disabled={loading || rows.length === 0} className="sag-btn-outline">
            <Download className="w-4 h-4" /> Download CSV
          </button>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Range" className="flex flex-wrap border border-line divide-x divide-line">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={r.id === range} onClick={() => setRange(r.id)} className={segment(r.id === range)}>{r.label}</button>
          ))}
        </div>
        {rows.length > 0 && (
          <p className="text-[13px] leading-[18px] text-ink-muted">{dayLabel(rows[0].day, true)} to {dayLabel(rows[rows.length - 1].day, true)} · {rows.length} {rows.length === 1 ? 'day' : 'days'}</p>
        )}
      </div>

      {analytics.error && <p role="alert" className="border border-line px-4 py-3 text-sm leading-5 text-danger">{analytics.error} Orders and sales below are not affected.</p>}

      {rows.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-10 text-sm leading-5 text-ink-muted text-center">{loading ? 'Loading…' : 'No data yet: the store has no orders and no counted visits.'}</p>
      ) : (
        <>
          {/* Totals for the range */}
          <dl aria-label="Totals for the range" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-line border border-line">
            {totalTiles.map((tile) => (
              <div key={tile.label} className="min-w-0 bg-surface px-4 py-4">
                <dt className={eyebrow}>{tile.label}</dt>
                <dd className="mt-2 text-xl leading-7 font-medium text-ink sag-num truncate">{tile.value}</dd>
                <dd className="mt-1 text-xs leading-4 text-ink-muted">{tile.note}</dd>
              </div>
            ))}
          </dl>

          {/* One bar per day */}
          <section aria-labelledby="admin-reports-chart-title" className="border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-line">
              <h3 id="admin-reports-chart-title" className="text-[15px] leading-6 font-medium text-ink">{metricLabel} per day</h3>
              <div role="group" aria-label="Show in the chart" className="flex border border-line divide-x divide-line">
                {METRICS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={m.id === metric} onClick={() => setMetric(m.id)} className={segment(m.id === metric)}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="px-4 pt-3 pb-4">
              <p className="text-sm leading-5 text-ink" aria-live="polite">
                <span className="text-ink-muted">{dayLabel(focused.day, true)}:</span>{' '}
                <span className="font-medium sag-num">{metricReady ? show(valueOf(focused)) : '…'}</span>
              </p>
              <div className="mt-3 flex gap-3">
                <div className="shrink-0 h-40 flex flex-col justify-between text-right text-[11px] leading-4 text-ink-muted sag-num" aria-hidden="true">
                  <span>{metricReady ? show(peak) : '…'}</span>
                  <span>0</span>
                </div>
                <div className="min-w-0 flex-1 overflow-x-auto sag-scroll-x">
                  <div className="h-40 flex items-end gap-px border-b border-line" style={{ minWidth: `${rows.length * 7}px` }} role="list" aria-label={`${metricLabel} per day, oldest first`}>
                    {rows.map((r) => {
                      const value = metricReady ? valueOf(r) : null;
                      const height = value !== null && peak > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / peak) * 100) : 0;
                      const on = r.day === focused.day;
                      const text = `${dayLabel(r.day, true)}: ${metricReady ? show(valueOf(r)) : 'loading'}`;
                      return (
                        <div key={r.day} role="listitem" tabIndex={0} title={text} aria-label={text}
                          onMouseEnter={() => setFocusDay(r.day)} onFocus={() => setFocusDay(r.day)}
                          className={`group relative flex-1 min-w-[6px] h-full flex items-end cursor-default focus:outline-none ${on ? 'bg-sunken' : ''}`}>
                          <div className={`w-full transition-colors ${on ? 'bg-sale' : 'bg-ink'}`} style={{ height: `${height}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] leading-4 text-ink-muted" style={{ minWidth: `${rows.length * 7}px` }} aria-hidden="true">
                    <span>{dayLabel(rows[0].day)}</span>
                    {rows.length > 1 && <span>{dayLabel(rows[rows.length - 1].day)}</span>}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-4 text-ink-muted">
                Point at a bar, or move to it with the Tab key, for that day's exact figure. {metric === 'visits' ? 'A day with no bar and "No data" in the table has no visit count. ' : ''}Every day is also listed in the table below.
              </p>
            </div>
          </section>

          {/* Day-by-day table, newest first */}
          <section aria-labelledby="admin-reports-table-title" className="border border-line bg-surface">
            <div className="px-4 py-3 border-b border-line">
              <h3 id="admin-reports-table-title" className="text-[15px] leading-6 font-medium text-ink">Day by day</h3>
              <p className="text-[13px] leading-[18px] text-ink-muted">Newest day first</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] leading-[18px] text-ink border-collapse">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th scope="col" className="py-2.5 pl-4 pr-3 font-medium text-left whitespace-nowrap">Date</th>
                    <th scope="col" className={th}>Visits</th>
                    {hasCart && <th scope="col" className={th}>Add to bag</th>}
                    {hasCheckout && <th scope="col" className={th}>Checkouts started</th>}
                    <th scope="col" className={th}>Paid orders</th>
                    <th scope="col" className={th}>Of which cash on delivery</th>
                    <th scope="col" className={th}>Sales (₹)</th>
                    <th scope="col" className={th}>Cancelled</th>
                    <th scope="col" className={`${th} pr-4`}>Refunded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tableRows.slice(0, shown).map((r) => (
                    <tr key={r.day} className={r.day === focused.day && focusDay ? 'bg-sunken' : 'hover:bg-sunken'}>
                      <th scope="row" className="py-2.5 pl-4 pr-3 font-normal text-left whitespace-nowrap">{dayLabel(r.day, true)}{r.day === today ? <span className="text-ink-muted"> · today so far</span> : null}</th>
                      <td className={td}>{visitCell(r.visits)}</td>
                      {hasCart && <td className={td}>{visitCell(r.cartAdds)}</td>}
                      {hasCheckout && <td className={td}>{visitCell(r.checkouts)}</td>}
                      <td className={td}>{orderCell(r.paid)}</td>
                      <td className={td}>{orderCell(r.cod)}</td>
                      <td className={`${td} ${r.sales > 0 ? 'font-medium' : ''}`}>{orderCell(r.sales, true)}</td>
                      <td className={td}>{orderCell(r.cancelled)}</td>
                      <td className={`${td} pr-4`}>{orderCell(r.refunded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows.length > shown && (
              <div className="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-4 text-ink-muted">Showing {shown} of {tableRows.length} days. The CSV holds all of them.</p>
                <button type="button" onClick={() => setShown((n) => n + ROW_STEP)} className="sag-btn-outline">Show {Math.min(ROW_STEP, tableRows.length - shown)} more days</button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Where the numbers come from */}
      <div className="border-t border-line pt-4 space-y-1.5 text-[13px] leading-[18px] text-ink-muted max-w-3xl">
        <p className="text-ink">
          {!analytics.loaded
            ? 'Checking since when visits have been counted…'
            : analytics.firstVisitDay
              ? `Visit counting exists from ${dayLabel(analytics.firstVisitDay, true)}. Days before that, and any day the counter did not run, show "No data".`
              : 'No visit count has been recorded yet, so every day shows "No data" for visits.'}
        </p>
        <p>Visits{hasCart || hasCheckout ? ', add to bag and checkouts started' : ''} are the server's own daily counts. The server closes a visit day at 5:30 am India time, so a visit between midnight and 5:30 am is counted under the day before.</p>
        <p>Paid orders are orders whose payment the server verified, cash on delivery included (its advance is paid online), on the day they were paid. Sales add up the order totals of those not cancelled. A refunded order leaves Paid orders and Sales and is counted under Refunded. Sandbox test payments are not counted.</p>
      </div>
    </div>
  );
};
