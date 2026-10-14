import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { AdminPageHeader } from './adminShared';
import {
  PeriodTotals, dayLabel, dayRange, firstOrderDay, istHourAndWeekday, istToday, isSale, monthEnd, monthLabel, monthStart, num, ordersByDay, paidOrdersIn,
  previousDays, rupees, shareText, shiftDay, totalsFor, useDailyAnalytics, weekStart,
} from './adminStats';
import { categoryRows, salesByProduct, soldCategories, useProductDaily } from './adminProductStats';
import { Delta, RankBars, TrendChart, TrendPoint, WEEKDAY_NAMES, downloadCsv } from './adminCharts';
import { Panel, Segmented, Thumb } from './adminUi';

type RangeId = '7' | '30' | '90' | 'month' | 'lastMonth' | 'all' | 'custom';
const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Pick dates' },
];
type Metric = 'sales' | 'orders' | 'visits' | 'average' | 'conversion' | 'productViews' | 'cartAdds' | 'checkouts';
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'average', label: 'Average order' },
  { id: 'visits', label: 'Visits' },
  { id: 'conversion', label: 'Conversion' },
  { id: 'productViews', label: 'Product views' },
  { id: 'cartAdds', label: 'Add to bag' },
  { id: 'checkouts', label: 'Checkouts' },
];
type Group = 'day' | 'week' | 'month';
const GROUPS: Array<{ id: Group; label: string; one: string; many: string }> = [
  { id: 'day', label: 'Day', one: 'day', many: 'days' },
  { id: 'week', label: 'Week', one: 'week', many: 'weeks' },
  { id: 'month', label: 'Month', one: 'month', many: 'months' },
];
/** Table rows shown at first, and added by "Show more". */
const ROW_STEP = 90;
const PRODUCT_ROWS = 25;

interface Row extends PeriodTotals {
  /** The first day of the row: the day itself, the week's Monday or the 1st of the month (cut to the chosen range). */
  key: string;
  from: string;
  to: string;
}

const th = 'py-3 px-3 font-medium text-right whitespace-nowrap';
const td = 'py-3 px-3 text-right sag-num whitespace-nowrap';
const NO_DATA = <span className="text-ink-muted">No data</span>;

const valueOf = (metric: Metric, r: PeriodTotals): number | null => {
  switch (metric) {
    case 'sales': return r.sales;
    case 'orders': return r.paid;
    case 'visits': return r.visits;
    case 'average': return r.averageOrder;
    case 'conversion': return r.conversion;
    case 'productViews': return r.productViews;
    case 'cartAdds': return r.cartAdds;
    case 'checkouts': return r.checkouts;
    default: return null;
  }
};
const show = (metric: Metric, value: number) => (metric === 'sales' || metric === 'average' ? rupees(value)
  : metric === 'conversion' ? `${(value * 100).toFixed(value * 100 >= 10 ? 1 : 2)}%` : num(value));

const bucketRows = (days: string[], group: Group, analytics: Parameters<typeof totalsFor>[1], byDay: Parameters<typeof totalsFor>[2]): Row[] => {
  const buckets = new Map<string, string[]>();
  days.forEach((day) => {
    const key = group === 'week' ? weekStart(day) : group === 'month' ? monthStart(day) : day;
    const list = buckets.get(key);
    if (list) list.push(day); else buckets.set(key, [day]);
  });
  return [...buckets.entries()].map(([key, list]) => ({ ...totalsFor(list, analytics, byDay), key, from: list[0], to: list[list.length - 1] }));
};

/** Admin → Reports: the store's history by day, week or month for any dates, against the period before, with products and categories and CSV files. */
export const AdminReports: React.FC = () => {
  const { orders = [], ordersLoaded, products = [] } = useAdmin();
  const { openAdminProductEdit } = useRouter();
  const analytics = useDailyAnalytics();
  const byDay = useMemo(() => ordersByDay(orders), [orders]);

  const today = istToday();
  const [range, setRange] = useState<RangeId>('30');
  const [group, setGroup] = useState<Group>('day');
  const [metric, setMetric] = useState<Metric>('sales');
  const [compare, setCompare] = useState<'on' | 'off'>('on');
  const [from, setFrom] = useState(shiftDay(today, -29));
  const [to, setTo] = useState(today);
  const [shown, setShown] = useState(ROW_STEP);
  useEffect(() => { setShown(ROW_STEP); }, [range, group, from, to]);

  // "All time" starts at the first day the store has anything for: an order or a counted visit
  const firstDay = useMemo(() => [firstOrderDay(byDay), analytics.firstVisitDay].filter(Boolean).sort()[0] || '', [byDay, analytics.firstVisitDay]);

  const days = useMemo(() => {
    switch (range) {
      case 'all': return firstDay && firstDay <= today ? dayRange(firstDay, today) : [];
      case 'month': return dayRange(monthStart(today), today);
      case 'lastMonth': { const first = monthStart(shiftDay(monthStart(today), -1)); return dayRange(first, monthEnd(first)); }
      case 'custom': {
        const a = from <= to ? from : to;
        const b = from <= to ? to : from;
        return /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) ? dayRange(a, b > today ? today : b) : [];
      }
      default: return dayRange(shiftDay(today, 1 - Number(range)), today);
    }
  }, [range, today, firstDay, from, to]);
  const earlier = useMemo(() => previousDays(days), [days]);
  const comparing = compare === 'on' && range !== 'all' && days.length > 0;

  /** Oldest first (the chart); the table shows it reversed. */
  const rows = useMemo(() => bucketRows(days, group, analytics.days, byDay), [days, group, analytics.days, byDay]);
  const beforeRows = useMemo(() => (comparing ? bucketRows(earlier, group, analytics.days, byDay) : []), [comparing, earlier, group, analytics.days, byDay]);
  const totals = useMemo(() => totalsFor(days, analytics.days, byDay), [days, analytics.days, byDay]);
  const beforeTotals = useMemo(() => totalsFor(earlier, analytics.days, byDay), [earlier, analytics.days, byDay]);

  const groupInfo = GROUPS.find((g) => g.id === group)!;
  const rowLabel = (r: Pick<Row, 'key' | 'from' | 'to' | 'days'>, withYear = true) => (group === 'month'
    ? `${monthLabel(r.key)}${r.days < 28 && (r.from !== monthStart(r.from) || r.to === today) ? ` (${r.days} ${r.days === 1 ? 'day' : 'days'})` : ''}`
    : group === 'week'
      ? (r.from === r.to ? dayLabel(r.from, withYear) : `${dayLabel(r.from)} to ${dayLabel(r.to, withYear)}`)
      : dayLabel(r.key, withYear));

  // A funnel column is shown only when the store has recorded that count on at least one day of the range
  const hasCart = rows.some((r) => r.cartAdds !== null);
  const hasCheckout = rows.some((r) => r.checkouts !== null);
  const hasViews = rows.some((r) => r.productViews !== null);

  const loading = !ordersLoaded || !analytics.loaded;
  const orderCell = (value: number, money = false) => (ordersLoaded ? (money ? rupees(value) : num(value)) : '…');
  const visitCell = (value: number | null) => (!analytics.loaded ? '…' : value === null ? NO_DATA : num(value));

  const needsVisits = ['visits', 'conversion', 'productViews', 'cartAdds', 'checkouts'].includes(metric);
  const metricReady = needsVisits ? analytics.loaded && (metric !== 'conversion' || ordersLoaded) : ordersLoaded;
  const metricLabel = METRICS.find((m) => m.id === metric)!.label;
  const points: TrendPoint[] = rows.map((r, i) => ({
    key: r.key,
    label: rowLabel(r, false),
    value: metricReady ? valueOf(metric, r) : null,
    before: comparing && beforeRows[i] ? valueOf(metric, beforeRows[i]) : undefined,
    beforeLabel: comparing && beforeRows[i] ? rowLabel(beforeRows[i], false) : undefined,
    note: r.to === today ? 'so far' : undefined,
  }));
  const rangeWords = days.length ? `${dayLabel(days[0], true)} to ${dayLabel(days[days.length - 1], true)}` : '';
  const beforeWords = earlier.length ? `${dayLabel(earlier[0])} to ${dayLabel(earlier[earlier.length - 1])}` : '';
  const fileRange = `${days[0] || today}-to-${days[days.length - 1] || today}`;

  // ---- products and categories in the range
  const counts = useProductDaily(days, today);
  const sold = useMemo(() => salesByProduct(orders, days), [orders, days]);
  const productRows = useMemo(() => {
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const ids = new Set([...sold.keys(), ...counts.views.keys()]);
    return [...ids].map((id) => {
      const p = byId.get(id);
      const s = sold.get(id);
      return {
        id, product: p, name: p?.name || 'Removed product', category: p ? String(p.category || '') : '',
        views: counts.views.get(id) || 0, saves: counts.wishlists.get(id) || 0, units: s?.units || 0, sales: s?.sales || 0,
      };
    }).filter((r) => r.views > 0 || r.units > 0).sort((a, b) => b.sales - a.sales || b.views - a.views);
  }, [products, sold, counts.views, counts.wishlists]);
  const categories = useMemo(() => categoryRows(products, counts.views, sold, soldCategories(orders)).sort((a, b) => b.sales - a.sales || b.views - a.views), [products, counts.views, sold, orders]);
  const weekdays = useMemo(() => {
    const sums = Array.from({ length: 7 }, () => ({ orders: 0, sales: 0 }));
    paidOrdersIn(orders, days).filter(isSale).forEach((o) => {
      const at = istHourAndWeekday(o.paidAt || o.date);
      if (!at) return;
      sums[at.weekday].orders += 1;
      sums[at.weekday].sales += Number(o.finalTotal) || 0;
    });
    return sums;
  }, [orders, days]);

  // ---- CSV files (built in the browser from the same rows as the tables)
  const cell = (value: number | null) => (value === null ? 'No data' : String(Math.round(value)));
  const rate = (value: number | null) => (value === null ? 'No data' : (value * 100).toFixed(2));
  const csvHistory = () => {
    const first = group === 'day' ? ['Date'] : [group === 'week' ? 'Week from' : 'Month from', 'To', 'Days'];
    const head = [...first, 'Visits', ...(group === 'day' ? [] : ['Days with a visit count']), 'Instagram visitors', 'Other visitors', ...(hasViews ? ['Product views'] : []), ...(hasCart ? ['Add to bag'] : []), ...(hasCheckout ? ['Checkouts started'] : []),
      'Paid orders', 'Of which cash on delivery', 'Sales (INR)', 'Cash on delivery sales (INR)', 'Average order (INR)', 'Conversion (%)', 'Cancelled', 'Refunded'];
    const lines = [...rows].reverse().map((r) => [
      ...(group === 'day' ? [r.key] : [r.from, r.to, String(r.days)]),
      cell(r.visits), ...(group === 'day' ? [] : [String(r.visitDays)]), cell(r.instagramVisitors), cell(r.otherVisitors), ...(hasViews ? [cell(r.productViews)] : []), ...(hasCart ? [cell(r.cartAdds)] : []), ...(hasCheckout ? [cell(r.checkouts)] : []),
      cell(r.paid), cell(r.cod), cell(r.sales), cell(r.codSales), cell(r.averageOrder), rate(r.conversion), cell(r.cancelled), cell(r.refunded),
    ]);
    downloadCsv(`suit-aura-girls-report-by-${group}-${fileRange}.csv`, [head, ...lines]);
  };
  const csvProducts = () => downloadCsv(`suit-aura-girls-products-${fileRange}.csv`, [
    ['Product', 'Category', 'Product page views', 'Saved to wishlist', 'Pieces sold', 'Sales before order discounts (INR)', 'Pieces sold per 100 views'],
    ...productRows.map((r) => [r.name, r.category, r.views, r.saves, r.units, Math.round(r.sales), r.views > 0 ? ((r.units / r.views) * 100).toFixed(1) : '']),
  ]);
  const csvCategories = () => downloadCsv(`suit-aura-girls-categories-${fileRange}.csv`, [
    ['Category', 'Products in the catalogue', 'Product page views', 'Pieces sold', 'Sales before order discounts (INR)'],
    ...categories.map((r) => [r.category, r.products, r.views, r.units, Math.round(r.sales)]),
  ]);

  const tile = (label: string, value: number | null, ready: boolean, format: (v: number) => string, note: string, before: number | null, opts: { points?: boolean; upIsBad?: boolean; noCompare?: boolean } = {}) => ({
    label, note,
    value: !ready ? '…' : value === null ? NO_DATA : format(value),
    delta: comparing && ready && !opts.noCompare ? <Delta now={value} before={before} than="the period before" points={opts.points} upIsBad={opts.upIsBad} /> : null,
  });
  const visitsComparable = totals.visitDays === totals.days && beforeTotals.visitDays === beforeTotals.days;
  const totalTiles = [
    tile('Sales', totals.sales, ordersLoaded, rupees, 'Paid orders, cancelled and refunded left out', beforeTotals.sales),
    tile('Paid orders', totals.paid, ordersLoaded, num, ordersLoaded ? `${num(totals.cod)} of them cash on delivery` : 'Loading orders…', beforeTotals.paid),
    tile('Average order', totals.averageOrder, ordersLoaded, rupees, 'Sales ÷ paid orders not cancelled', beforeTotals.averageOrder),
    tile('Visits', totals.visits, analytics.loaded, num, totals.visits === null ? 'No visits were counted in this range' : totals.visitDays < totals.days ? `Counted on ${totals.visitDays} of ${totals.days} days` : `Counted on all ${totals.days} days`, beforeTotals.visits, { noCompare: !visitsComparable }),
    tile('Conversion', totals.conversion, ordersLoaded && analytics.loaded, (v) => `${(v * 100).toFixed(2)}%`, 'Paid orders out of every 100 visits', beforeTotals.conversion, { points: true, noCompare: !visitsComparable }),
    tile('Cancelled orders', totals.cancelled, ordersLoaded, num, 'By the day the order was placed', beforeTotals.cancelled, { upIsBad: true }),
    tile('Refunded orders', totals.refunded, ordersLoaded, num, 'By the day the order was paid', beforeTotals.refunded, { upIsBad: true }),
    tile('Cash on delivery sales', totals.codSales, ordersLoaded, rupees, totals.sales > 0 ? `${shareText(totals.codSales / totals.sales)} of the sales` : 'Of the sales', beforeTotals.codSales),
  ];

  const tableRows = [...rows].reverse();
  const head = 'text-[11px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted';

  return (
    <div id="admin-reports-page" className="space-y-5">
      <AdminPageHeader
        eyebrow="Overview"
        title="Reports"
        description="The store's history for any dates: visits, orders and sales, the products and categories behind them, and how it compares with the period before. Every figure is read from the store's own records; days are India time."
        actions={(
          <button type="button" onClick={csvHistory} disabled={loading || rows.length === 0} className="sag-btn-outline">
            <Download className="w-4 h-4" /> Download CSV
          </button>
        )}
      />

      <div id="admin-reports-filters" className="sag-glass p-4 sm:p-5 space-y-4">
        <div>
          <p className="mb-1.5 text-xs leading-4 text-ink-muted">Dates</p>
          <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs leading-4 text-ink-muted">
              From
              <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="sag-input !h-11 !w-auto !text-base" />
            </label>
            <label className="flex flex-col gap-1 text-xs leading-4 text-ink-muted">
              To
              <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="sag-input !h-11 !w-auto !text-base" />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <p className="mb-1.5 text-xs leading-4 text-ink-muted">Show one row for each</p>
              <Segmented label="Group by" value={group} options={GROUPS} onChange={setGroup} />
            </div>
            {range !== 'all' && (
              <div>
                <p className="mb-1.5 text-xs leading-4 text-ink-muted">Compare with the period before</p>
                <Segmented label="Compare with the period before" value={compare} options={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} onChange={setCompare} />
              </div>
            )}
          </div>
          {days.length > 0 && (
            <p className="text-[13px] leading-[18px] text-ink-muted">
              {rangeWords} · {num(days.length)} {days.length === 1 ? 'day' : 'days'}{group !== 'day' ? ` in ${rows.length} ${rows.length === 1 ? groupInfo.one : groupInfo.many}` : ''}
              {comparing && beforeWords ? <><br />Compared with {beforeWords}</> : null}
            </p>
          )}
        </div>
      </div>

      {analytics.error && <p role="alert" className="sag-glass px-4 py-3 text-sm leading-5 text-danger">{analytics.error} Orders and sales below are not affected.</p>}

      {rows.length === 0 ? (
        <p className="sag-glass px-4 py-10 text-sm leading-5 text-ink-muted text-center">{loading ? 'Loading…' : range === 'custom' ? 'Pick a start and an end date.' : 'No data yet: the store has no orders and no counted visits.'}</p>
      ) : (
        <>
          {/* Totals for the range */}
          <dl aria-label="Totals for the range" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {totalTiles.map((t) => (
              <div key={t.label} className="sag-glass min-w-0 px-4 py-4">
                <dt className="text-xs leading-4 text-ink-muted">{t.label}</dt>
                <dd className="mt-1 text-2xl leading-8 font-semibold text-ink sag-num truncate">{t.value}</dd>
                {t.delta && <dd className="mt-0.5">{t.delta}</dd>}
                <dd className="mt-1 text-xs leading-4 text-ink-muted">{t.note}</dd>
              </div>
            ))}
          </dl>

          {/* The chart */}
          <Panel
            id="admin-reports-chart"
            title={`${metricLabel} for each ${groupInfo.one}`}
            note={`Hover, tap or use the arrow keys for the exact figure.${comparing ? ' The dashed line is the period before.' : ''} Every row is also in the table below.`}
            action={<Segmented label="Show in the chart" value={metric} options={METRICS} onChange={setMetric} />}
          >
            <TrendChart
              points={points}
              format={(v) => show(metric, v)}
              label={`${metricLabel} for each ${groupInfo.one}, ${rangeWords}`}
              name={rangeWords}
              beforeName={comparing ? `The period before (${beforeWords})` : undefined}
              showTrend={rows.length >= 14}
              height={220}
            />
            {needsVisits && <p className="mt-3 text-xs leading-4 text-ink-muted">A gap in the line is a {groupInfo.one} without that count ("No data" in the table).</p>}
          </Panel>

          {/* The table, newest first */}
          <Panel id="admin-reports-table" title={`${groupInfo.label} by ${groupInfo.one}`} note={`Newest ${groupInfo.one} first${group === 'week' ? '. A week runs Monday to Sunday' : ''}`} flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] leading-[18px] text-ink border-collapse">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th scope="col" className="py-3 pl-4 sm:pl-5 pr-3 font-medium text-left whitespace-nowrap">{group === 'day' ? 'Date' : groupInfo.label}</th>
                    <th scope="col" className={th}>Visits</th>
                    {hasViews && <th scope="col" className={th}>Product views</th>}
                    {hasCart && <th scope="col" className={th}>Add to bag</th>}
                    {hasCheckout && <th scope="col" className={th}>Checkouts started</th>}
                    <th scope="col" className={th}>Paid orders</th>
                    <th scope="col" className={th}>Of which cash on delivery</th>
                    <th scope="col" className={th}>Sales (₹)</th>
                    <th scope="col" className={th}>Conversion</th>
                    <th scope="col" className={th}>Cancelled</th>
                    <th scope="col" className={`${th} pr-4 sm:pr-5`}>Refunded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tableRows.slice(0, shown).map((r) => (
                    <tr key={r.key} className="hover:bg-sunken">
                      <th scope="row" className="py-3 pl-4 sm:pl-5 pr-3 font-normal text-left whitespace-nowrap">{rowLabel(r)}{r.to === today ? <span className="text-ink-muted"> · {group === 'day' ? 'today so far' : 'so far'}</span> : null}</th>
                      <td className={td}>
                        {visitCell(r.visits)}
                        {analytics.loaded && group !== 'day' && r.visits !== null && r.visitDays < r.days ? <span className="text-ink-muted"> ({r.visitDays} of {r.days} days)</span> : null}
                      </td>
                      {hasViews && <td className={td}>{visitCell(r.productViews)}</td>}
                      {hasCart && <td className={td}>{visitCell(r.cartAdds)}</td>}
                      {hasCheckout && <td className={td}>{visitCell(r.checkouts)}</td>}
                      <td className={td}>{orderCell(r.paid)}</td>
                      <td className={td}>{orderCell(r.cod)}</td>
                      <td className={`${td} ${r.sales > 0 ? 'font-semibold text-ok' : ''}`}>{orderCell(r.sales, true)}</td>
                      <td className={td}>{loading ? '…' : r.conversion === null ? NO_DATA : `${(r.conversion * 100).toFixed(2)}%`}</td>
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

          {/* Products and categories in the range */}
          <Panel
            id="admin-reports-products"
            title="Products in these dates"
            note={`Views, wishlist saves, pieces sold and sales per product, ${rangeWords}`}
            action={<button type="button" onClick={csvProducts} disabled={counts.loading || !ordersLoaded || productRows.length === 0} className="sag-btn-outline"><Download className="w-4 h-4" /> Products CSV</button>}
            flush
          >
            {counts.loading || !ordersLoaded ? <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">Loading…</p> : productRows.length === 0 ? (
              <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">{counts.failed ? 'The view counts could not be read right now.' : 'No product was viewed or sold in these dates.'}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] leading-[18px] text-ink border-collapse">
                    <thead>
                      <tr className="border-b border-line text-xs text-ink-muted">
                        <th scope="col" className="py-3 pl-4 sm:pl-5 pr-3 font-medium text-left">Product</th>
                        <th scope="col" className={th}>Views</th>
                        <th scope="col" className={th}>Saved</th>
                        <th scope="col" className={th}>Sold</th>
                        <th scope="col" className={th}>Sales (₹)</th>
                        <th scope="col" className={`${th} pr-4 sm:pr-5`}>Sold per 100 views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {productRows.slice(0, PRODUCT_ROWS).map((r) => (
                        <tr key={r.id} className="hover:bg-sunken">
                          <th scope="row" className="py-2 pl-4 sm:pl-5 pr-3 font-normal text-left">
                            {r.product ? (
                              <button type="button" onClick={() => openAdminProductEdit(r.id)} className="flex items-center gap-3 text-left cursor-pointer min-w-[200px]">
                                <Thumb url={r.product.images?.[0] || r.product.image} />
                                <span className="min-w-0"><span className="block line-clamp-2">{r.name}</span><span className="block text-xs text-ink-muted">{r.category}</span></span>
                              </button>
                            ) : <span className="text-ink-muted">{r.name}</span>}
                          </th>
                          <td className={td}>{num(r.views)}</td>
                          <td className={td}>{num(r.saves)}</td>
                          <td className={td}>{num(r.units)}</td>
                          <td className={`${td} ${r.sales > 0 ? 'font-semibold' : ''}`}>{rupees(r.sales)}</td>
                          <td className={`${td} pr-4 sm:pr-5`}>{r.views > 0 ? ((r.units / r.views) * 100).toFixed(1) : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 sm:px-5 py-3 border-t border-line rounded-none text-xs leading-4 text-ink-muted">
                  {productRows.length > PRODUCT_ROWS ? `The ${PRODUCT_ROWS} products with the most sales are shown; the CSV holds all ${num(productRows.length)}. ` : ''}
                  Sales here are piece prices × pieces, before coupons and the online payment discount. A view counts once per visitor per product per day. The store does not record which product was added to the bag, so that is not shown per product.
                </p>
              </>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel
              id="admin-reports-categories"
              title="Categories"
              note="Views, pieces sold and sales per category"
              action={<button type="button" onClick={csvCategories} disabled={counts.loading || !ordersLoaded || categories.length === 0} className="sag-btn-outline"><Download className="w-4 h-4" /> CSV</button>}
            >
              {counts.loading || !ordersLoaded ? <p className="py-6 text-sm leading-5 text-ink-muted">Loading…</p> : (
                <RankBars
                  empty="No category was viewed or sold in these dates."
                  rows={categories.slice(0, 12).map((r, i) => ({
                    key: r.category, label: r.category, value: r.sales, text: rupees(r.sales), highlight: i === 0,
                    sub: <span className="sag-num">{num(r.units)} sold · {num(r.views)} views · {num(r.products)} {r.products === 1 ? 'product' : 'products'} in the catalogue</span>,
                  }))}
                />
              )}
            </Panel>
            <Panel id="admin-reports-weekdays" title="Sales by weekday" note="Paid orders not cancelled, by the weekday they were paid (India time)">
              {!ordersLoaded ? <p className="py-6 text-sm leading-5 text-ink-muted">Loading…</p> : (
                <RankBars
                  empty="No sales in these dates."
                  rows={weekdays.some((w) => w.orders > 0) ? weekdays.map((w, i) => ({
                    key: WEEKDAY_NAMES[i], label: WEEKDAY_NAMES[i], value: w.sales, text: rupees(w.sales),
                    highlight: w.sales > 0 && w.sales === Math.max(...weekdays.map((x) => x.sales)),
                    sub: <span className="sag-num">{num(w.orders)} {w.orders === 1 ? 'order' : 'orders'}</span>,
                  })) : []}
                />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* Where the numbers come from */}
      <div className="sag-glass p-4 sm:p-5 space-y-1.5 text-[13px] leading-[18px] text-ink-muted">
        <p className={head}>Where the numbers come from</p>
        <p className="text-ink">
          {!analytics.loaded
            ? 'Checking since when visits have been counted…'
            : analytics.firstVisitDay
              ? `Visit counting exists from ${dayLabel(analytics.firstVisitDay, true)}. Days before that, and any day the counter did not run, show "No data".`
              : 'No visit count has been recorded yet, so every day shows "No data" for visits.'}
        </p>
        <p>Visits, product views, add to bag and checkouts started are the server's own daily counts. The server closes a visit day at 5:30 am India time, so a visit between midnight and 5:30 am is counted under the day before.</p>
        <p>Paid orders are orders whose payment the server verified, cash on delivery included (its advance is paid online), on the day they were paid. Sales add up the order totals of those not cancelled. A refunded order leaves Paid orders and Sales and is counted under Refunded. Sandbox test payments are not counted.</p>
        <p>"The period before" is the same number of days just before the chosen dates. A week or a month at the start of the chosen range holds only the days inside the range.</p>
      </div>
    </div>
  );
};
