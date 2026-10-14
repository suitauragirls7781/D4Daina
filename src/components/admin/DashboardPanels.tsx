import React, { useMemo, useState } from 'react';
import { ChevronRight, Smartphone } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { Order, Product } from '../../types';
import {
  AnalyticsDay, OrderDay, PeriodTotals, dayLabel, istDay, istHourAndWeekday, isSale, num, paidOrdersIn, previousDays, rupees, shareText, shiftDay, dayRange, totalsFor,
} from './adminStats';
import { Delta, FunnelBars, Heatmap, Part, RankBars, Sparkline, SplitBar, TrendChart, TrendPoint, WEEKDAY_NAMES, hourWords } from './adminCharts';
import { categoryRows, salesByProduct, soldCategories, useProductDaily } from './adminProductStats';
import { Panel, Segmented, adminText } from './adminUi';

/**
 * The command-centre panels of Admin → Dashboard: the key numbers for the chosen period against the
 * period before, the trend, the path to an order, when orders come in, how customers pay, categories and
 * the split by device. Everything is read from the store's own records; a figure that is not recorded is
 * "No data", never 0 and never estimated.
 */

export type PeriodId = 'today' | '7' | '30';
export const PERIODS: Array<{ id: PeriodId; label: string; words: string; before: string }> = [
  { id: 'today', label: 'Today', words: 'today', before: 'yesterday' },
  { id: '7', label: '7 days', words: 'the last 7 days', before: 'the 7 days before' },
  { id: '30', label: '30 days', words: 'the last 30 days', before: 'the 30 days before' },
];

export type KpiId = 'sales' | 'orders' | 'average' | 'conversion' | 'visits';

/** One day's value of a key number (null = not recorded that day). */
const dayValue = (metric: KpiId, a: AnalyticsDay | undefined, o: OrderDay | undefined): number | null => {
  const visits = a?.visits ?? null;
  switch (metric) {
    case 'sales': return o?.sales || 0;
    case 'orders': return o?.paid || 0;
    case 'average': return o && o.sold > 0 ? o.sales / o.sold : null;
    case 'visits': return visits;
    case 'conversion': return visits !== null && visits > 0 ? (o?.paid || 0) / visits : null;
    default: return null;
  }
};
const totalValue = (metric: KpiId, t: PeriodTotals): number | null => {
  switch (metric) {
    case 'sales': return t.sales;
    case 'orders': return t.paid;
    case 'average': return t.averageOrder;
    case 'visits': return t.visits;
    case 'conversion': return t.conversion;
    default: return null;
  }
};
export const formatKpi = (metric: KpiId, value: number) => (metric === 'sales' || metric === 'average' ? rupees(value)
  : metric === 'conversion' ? `${(value * 100).toFixed(value * 100 >= 10 ? 1 : 2)}%` : num(value));

export const KPI_INFO: Record<KpiId, { label: string; hint: string }> = {
  sales: { label: 'Sales', hint: 'Paid orders, cancelled and refunded left out' },
  orders: { label: 'Paid orders', hint: 'Cash on delivery included (advance paid online)' },
  average: { label: 'Average order', hint: 'Sales ÷ paid orders not cancelled' },
  conversion: { label: 'Conversion', hint: 'Paid orders out of every 100 visits' },
  visits: { label: 'Visits', hint: 'One person can visit more than once' },
};

/** Orders, sales and sold orders of one day paid up to a moment (to compare today with "yesterday by this time"). */
const ordersUntil = (orders: Order[], day: string, until: number) => {
  const list = paidOrdersIn(orders, [day]).filter((o) => (Date.parse(o.paidAt || o.date) || 0) <= until);
  const paid = list.filter((o) => o.paymentStatus === 'Paid');
  const sold = paid.filter(isSale);
  const sales = sold.reduce((s, o) => s + (Number(o.finalTotal) || 0), 0);
  return { paid: paid.length, sold: sold.length, sales };
};

// ---------------------------------------------------------------- key numbers

interface KpiBoardProps {
  period: PeriodId;
  days: string[];
  today: string;
  analytics: Map<string, AnalyticsDay>;
  byDay: Map<string, OrderDay>;
  orders: Order[];
  ordersLoaded: boolean;
  visitsLoaded: boolean;
  selected: KpiId;
  onSelect: (id: KpiId) => void;
}

/** Five big numbers for the chosen period, each against the period before, with a small trend line. Tap one to draw it below. */
export const KpiBoard: React.FC<KpiBoardProps> = ({ period, days, today, analytics, byDay, orders, ordersLoaded, visitsLoaded, selected, onSelect }) => {
  const info = PERIODS.find((p) => p.id === period)!;
  const current = useMemo(() => totalsFor(days, analytics, byDay), [days, analytics, byDay]);
  const before = useMemo(() => totalsFor(previousDays(days), analytics, byDay), [days, analytics, byDay]);
  // Today is compared with yesterday up to the same time of day (orders only: visits are counted per whole day)
  const yesterdaySoFar = useMemo(() => (period === 'today' ? ordersUntil(orders, shiftDay(today, -1), Date.now() - 86400000) : null), [period, orders, today]);
  const sparkDays = useMemo(() => (period === 'today' ? dayRange(shiftDay(today, -13), today) : days), [period, days, today]);

  const tiles: KpiId[] = ['sales', 'orders', 'average', 'conversion', 'visits'];
  return (
    <section id="admin-kpis" aria-label={`Key numbers for ${info.words}`} className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {tiles.map((id, i) => {
        const needsVisits = id === 'visits' || id === 'conversion';
        const ready = ordersLoaded && (!needsVisits || visitsLoaded);
        const value = totalValue(id, current);
        let delta: React.ReactNode;
        if (!ready) delta = <span className="text-xs leading-4 text-ink-muted">Loading…</span>;
        else if (period === 'today' && yesterdaySoFar && (id === 'sales' || id === 'orders' || id === 'average')) {
          const prev = id === 'sales' ? yesterdaySoFar.sales : id === 'orders' ? yesterdaySoFar.paid : yesterdaySoFar.sold > 0 ? yesterdaySoFar.sales / yesterdaySoFar.sold : null;
          delta = <Delta now={value} before={prev} than="yesterday by now" />;
        } else if (period === 'today' && needsVisits) {
          const prev = totalValue(id, before);
          delta = <span className="text-xs leading-4 text-ink-muted">Yesterday, whole day: {prev === null ? 'No data' : formatKpi(id, prev)}</span>;
        } else if (needsVisits && (current.visitDays < current.days || before.visitDays < before.days)) {
          delta = <span className="text-xs leading-4 text-ink-muted">Not counted on every day, so not compared</span>;
        } else {
          delta = <Delta now={value} before={totalValue(id, before)} than={info.before} points={id === 'conversion'} />;
        }
        const on = selected === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(id)}
            className={`sag-glass min-w-0 p-4 text-left cursor-pointer transition-transform duration-200 motion-safe:hover:-translate-y-0.5 ${i === 0 ? 'col-span-2 lg:col-span-1' : ''} ${on ? 'ring-2 ring-brand' : ''}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs leading-4 text-ink-muted">{KPI_INFO[id].label}</span>
              {on && <span className="text-[10px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted">In the chart</span>}
            </span>
            <span className={`mt-1 block sag-num truncate ${value === null && ready ? 'text-base leading-8 text-ink-muted' : 'text-[26px] leading-8 font-extrabold tracking-[-0.02em] text-ink'}`}>
              {!ready ? '…' : value === null ? 'No data' : formatKpi(id, value)}
            </span>
            <span className="mt-1 block min-h-4">{delta}</span>
            <Sparkline className="mt-2" values={ready ? sparkDays.map((d) => dayValue(id, analytics.get(d), byDay.get(d))) : []} />
            <span className="mt-1 block text-[11px] leading-4 text-ink-muted">{period === 'today' ? 'Line: the last 14 days' : `Line: ${info.words}`}</span>
          </button>
        );
      })}
    </section>
  );
};

// ---------------------------------------------------------------- trend

export const TrendPanel: React.FC<{
  period: PeriodId; days: string[]; today: string; metric: KpiId; onMetric: (id: KpiId) => void;
  analytics: Map<string, AnalyticsDay>; byDay: Map<string, OrderDay>; ready: boolean; onReports: () => void;
}> = ({ period, days, today, metric, onMetric, analytics, byDay, ready, onReports }) => {
  const shownDays = useMemo(() => (period === 'today' ? dayRange(shiftDay(today, -13), today) : days), [period, days, today]);
  const earlier = useMemo(() => previousDays(shownDays), [shownDays]);
  const points: TrendPoint[] = useMemo(() => shownDays.map((day, i) => ({
    key: day,
    label: dayLabel(day),
    value: ready ? dayValue(metric, analytics.get(day), byDay.get(day)) : null,
    before: ready ? dayValue(metric, analytics.get(earlier[i]), byDay.get(earlier[i])) : null,
    beforeLabel: dayLabel(earlier[i]),
    note: day === today ? 'so far' : undefined,
  })), [shownDays, earlier, metric, analytics, byDay, ready, today]);
  const options = (Object.keys(KPI_INFO) as KpiId[]).map((id) => ({ id, label: KPI_INFO[id].label }));
  const n = shownDays.length;

  return (
    <Panel
      id="admin-last-30"
      title="Trend"
      note={`${KPI_INFO[metric].label} for each day of the last ${n} days, with the ${n} days before as a dashed line. Hover, tap or use the arrow keys for a day's figure.`}
      action={<Segmented label="Show in the chart" value={metric} options={options} onChange={onMetric} />}
    >
      <TrendChart
        points={points}
        format={(v) => formatKpi(metric, v)}
        label={`${KPI_INFO[metric].label} per day, ${dayLabel(shownDays[0])} to ${dayLabel(shownDays[n - 1])}`}
        name={`Last ${n} days`}
        beforeName={`The ${n} days before`}
        showTrend={n >= 14}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs leading-4 text-ink-muted">{metric === 'visits' || metric === 'conversion' ? 'A gap in the line is a day without a visit count.' : KPI_INFO[metric].hint}.</p>
        <button type="button" onClick={onReports} className={adminText.link}>Every day in Reports <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------- the path to an order

export const FunnelPanel: React.FC<{
  days: string[]; words: string; analytics: Map<string, AnalyticsDay>; byDay: Map<string, OrderDay>; ready: boolean;
}> = ({ days, words, analytics, byDay, ready }) => {
  const totals = useMemo(() => totalsFor(days, analytics, byDay), [days, analytics, byDay]);
  const steps = [
    { label: 'Visits', value: totals.visits, leave: '' },
    { label: 'Product views', value: totals.productViews, leave: 'arriving and opening a product' },
    { label: 'Added to bag', value: totals.cartAdds, leave: 'opening a product and adding it to the bag' },
    { label: 'Checkout started', value: totals.checkouts, leave: 'the bag and checkout' },
    { label: 'Paid orders', value: totals.paid, leave: 'checkout and payment' },
  ];
  let worst: { leave: string; lost: number } | null = null;
  steps.forEach((step, i) => {
    const before = i > 0 ? steps[i - 1].value : null;
    if (step.value === null || before === null || before <= 0 || step.value > before) return;
    const lost = 1 - step.value / before;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { leave: step.leave, lost };
  });
  const found = worst as { leave: string; lost: number } | null;
  const sentence = !ready ? 'Loading…'
    : totals.visits === null ? `No visits were counted for ${words}, so the path cannot be drawn yet.`
    : found ? `Most people leave between ${found.leave} (${shareText(found.lost)} of them stop there).`
    : 'There is not enough movement yet to say where people leave.';
  const checkoutToPaid = totals.checkouts !== null && totals.checkouts > 0 ? totals.paid / totals.checkouts : null;

  const from: Part[] = [
    { label: 'Instagram', value: totals.instagramVisitors ?? 0, tone: 'rose', detail: 'the app, a link or an ad' },
    { label: 'Everywhere else', value: totals.otherVisitors ?? 0, tone: 'ink' },
  ];

  return (
    <Panel id="admin-funnel" title="The path to an order" note={`From a visit to a paid order, in ${words}`}>
      <FunnelBars steps={steps} ready={ready} />
      <p className="mt-4 pt-3 border-t border-line rounded-none text-sm leading-5 text-ink">{sentence}</p>
      {ready && checkoutToPaid !== null && checkoutToPaid <= 1 && (
        <p className="mt-1 text-sm leading-5 text-ink-muted sag-num">{shareText(checkoutToPaid)} of the checkouts started became a paid order.</p>
      )}
      <div className="mt-4">
        <p className={adminText.eyebrow}>Where the visitors came from</p>
        <div className="mt-2">
          {ready && (totals.instagramVisitors !== null || totals.otherVisitors !== null)
            ? <SplitBar label="Visitors by where they came from" parts={from} />
            : <p className="py-2 text-sm leading-5 text-ink-muted">{ready ? 'No data' : 'Loading…'}</p>}
        </div>
        {ready && totals.returningVisitors !== null && totals.visitors !== null && totals.visitors > 0 && (
          <p className="mt-2 text-xs leading-4 text-ink-muted sag-num">{num(totals.returningVisitors)} of {num(totals.visitors)} visitors ({shareText(totals.returningVisitors / totals.visitors)}) had been on the store before.</p>
        )}
      </div>
      <p className="mt-3 text-xs leading-4 text-ink-muted">Visitors and product views count once per device per day; visits count again after 30 minutes away.</p>
    </Panel>
  );
};

// ---------------------------------------------------------------- when orders come in

type HeatRange = '30' | '90';
export const SalesHeatmapPanel: React.FC<{ orders: Order[]; today: string; ordersLoaded: boolean }> = ({ orders, today, ordersLoaded }) => {
  const [range, setRange] = useState<HeatRange>('30');
  const { grid, total, sentence } = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    const list = paidOrdersIn(orders, dayRange(shiftDay(today, 1 - Number(range)), today)).filter(isSale);
    list.forEach((o) => {
      const at = istHourAndWeekday(o.paidAt || o.date);
      if (at) cells[at.weekday][at.hour] += 1;
    });
    const byWeekday = cells.map((row) => row.reduce((s, v) => s + v, 0));
    const byHour = Array.from({ length: 24 }, (_, h) => cells.reduce((s, row) => s + row[h], 0));
    // The busiest three hours in a row (across all weekdays)
    let bestStart = -1; let bestSum = 0;
    for (let h = 0; h < 24; h += 1) {
      const sum = byHour[h] + byHour[(h + 1) % 24] + byHour[(h + 2) % 24];
      if (sum > bestSum) { bestSum = sum; bestStart = h; }
    }
    const topDay = Math.max(...byWeekday);
    const dayIndex = topDay > 0 ? byWeekday.indexOf(topDay) : -1;
    const n = list.length;
    const words = n === 0 ? `No paid orders in the last ${range} days yet.`
      : n < 10 ? `Only ${num(n)} paid ${n === 1 ? 'order' : 'orders'} in the last ${range} days: too few to show a pattern yet.`
      : `Most orders come in between ${hourWords(bestStart)} and ${hourWords(bestStart + 3)} (${num(bestSum)} of ${num(n)}). The busiest day is ${WEEKDAY_NAMES[dayIndex]}.`;
    return { grid: cells, total: n, sentence: words };
  }, [orders, today, range]);

  return (
    <Panel
      id="admin-sales-heatmap"
      title="When orders come in"
      note="Paid orders by weekday and hour of payment, India time. Good times for posts, stories and offers."
      action={<Segmented label="Going back" value={range} options={[{ id: '30', label: '30 days' }, { id: '90', label: '90 days' }]} onChange={setRange} />}
    >
      {!ordersLoaded ? <p className="py-6 text-sm leading-5 text-ink-muted">Loading orders…</p> : (
        <>
          <p className="text-sm leading-5 text-ink">{sentence}</p>
          {total > 0 && <div className="mt-3"><Heatmap grid={grid} unit={(n) => `${num(n)} ${n === 1 ? 'order' : 'orders'}`} label={`Paid orders by weekday and hour, last ${range} days`} /></div>}
        </>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- how customers pay, cancellations

const methodLabel = (method: string) => ({ razorpay: 'Razorpay', payu: 'PayU', upi: 'UPI', card: 'Card', netbanking: 'Net banking' } as Record<string, string>)[method] || 'Other';

export const MoneyMixPanel: React.FC<{ orders: Order[]; days: string[]; words: string; ordersLoaded: boolean; onCancellations: () => void }> = ({ orders, days, words, ordersLoaded, onCancellations }) => {
  const mix = useMemo(() => {
    const paid = paidOrdersIn(orders, days);
    const sold = paid.filter(isSale);
    const cod = sold.filter((o) => o.payMode === 'cod');
    const prepaid = sold.filter((o) => o.payMode !== 'cod');
    const sum = (list: Order[]) => list.reduce((s, o) => s + (Number(o.finalTotal) || 0), 0);
    const gateways = new Map<string, number>();
    sold.forEach((o) => { const m = methodLabel(String(o.paymentMethod || '')); gateways.set(m, (gateways.get(m) || 0) + 1); });
    const withCoupon = sold.filter((o) => o.couponCode);
    const discount = sold.reduce((s, o) => s + (Number(o.couponDiscount) || 0) + (Number(o.prepaidDiscount) || 0) + (Number(o.comboDiscount) || 0), 0);
    const cancelled = paid.filter((o) => o.status === 'Cancelled');
    const refunded = paid.filter((o) => o.status === 'Refunded' || o.paymentStatus === 'Refunded');
    const reasons = new Map<string, number>();
    cancelled.forEach((o) => { const r = (o.cancelReason || '').trim() || 'No reason saved'; reasons.set(r, (reasons.get(r) || 0) + 1); });
    return {
      paidCount: paid.length, soldCount: sold.length, cod, prepaid, codSales: sum(cod), prepaidSales: sum(prepaid),
      gateways: [...gateways.entries()].sort((a, b) => b[1] - a[1]), withCoupon: withCoupon.length, discount,
      cancelled: cancelled.length, refunded: refunded.length, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [orders, days]);
  const tones: Part['tone'][] = ['ink', 'rose', 'sand', 'blush', 'forest'];

  return (
    <Panel id="admin-money-mix" title="How customers pay" note={`Paid orders in ${words}`}>
      {!ordersLoaded ? <p className="py-6 text-sm leading-5 text-ink-muted">Loading orders…</p> : mix.paidCount === 0 ? (
        <p className="py-6 text-sm leading-5 text-ink-muted">No paid orders in {words}.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className={adminText.eyebrow}>Prepaid or cash on delivery</p>
            <div className="mt-2">
              <SplitBar
                label="Sales by payment type"
                format={rupees}
                parts={[
                  { label: 'Paid online', value: mix.prepaidSales, tone: 'ink', detail: `${num(mix.prepaid.length)} ${mix.prepaid.length === 1 ? 'order' : 'orders'}` },
                  { label: 'Cash on delivery', value: mix.codSales, tone: 'rose', detail: `${num(mix.cod.length)} ${mix.cod.length === 1 ? 'order' : 'orders'}` },
                ]}
                empty="Every paid order in this period was cancelled or refunded."
              />
            </div>
          </div>
          {mix.gateways.length > 0 && (
            <div>
              <p className={adminText.eyebrow}>Payment gateway</p>
              <div className="mt-2">
                <SplitBar label="Orders by payment gateway" parts={mix.gateways.map(([label, value], i) => ({ label, value, tone: tones[i] || 'sand' }))} />
              </div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-sunken px-3 py-2.5">
              <dt className="text-xs leading-4 text-ink-muted">Orders with a coupon</dt>
              <dd className="mt-0.5 sag-num text-lg leading-6 font-semibold text-ink">{num(mix.withCoupon)} <span className="text-sm font-normal text-ink-muted">of {num(mix.soldCount)}</span></dd>
            </div>
            <div className="rounded-[16px] bg-sunken px-3 py-2.5">
              <dt className="text-xs leading-4 text-ink-muted">Discounts given</dt>
              <dd className="mt-0.5 sag-num text-lg leading-6 font-semibold text-sale">{rupees(mix.discount)}</dd>
            </div>
          </dl>
          <div className="pt-4 border-t border-line rounded-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={adminText.eyebrow}>Cancelled and refunded</p>
              <button type="button" onClick={onCancellations} className={adminText.link}>Cancellations <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            <p className="mt-1 text-sm leading-5 text-ink sag-num">
              {mix.cancelled === 0 && mix.refunded === 0
                ? `No paid order from ${words} was cancelled or refunded.`
                : `${num(mix.cancelled)} cancelled and ${num(mix.refunded)} refunded of ${num(mix.paidCount)} paid ${mix.paidCount === 1 ? 'order' : 'orders'} (${shareText(mix.cancelled / mix.paidCount)} cancelled).`}
            </p>
            {mix.reasons.length > 0 && (
              <ul className="mt-2 space-y-1">
                {mix.reasons.map(([reason, n]) => (
                  <li key={reason} className="flex items-baseline justify-between gap-3 text-[13px] leading-[18px]"><span className="min-w-0 truncate text-ink-muted">{reason}</span><span className="sag-num text-ink">{num(n)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- categories

type CategorySort = 'sales' | 'views';
export const CategoryPanel: React.FC<{ products: Product[]; orders: Order[]; days: string[]; today: string; words: string; ordersLoaded: boolean }> = ({ products, orders, days, today, words, ordersLoaded }) => {
  const [sort, setSort] = useState<CategorySort>('sales');
  const counts = useProductDaily(days, today);
  const rows = useMemo(() => {
    const sold = salesByProduct(orders, days);
    return categoryRows(products, counts.views, sold, soldCategories(orders))
      .sort((a, b) => (sort === 'sales' ? b.sales - a.sales || b.views - a.views : b.views - a.views || b.sales - a.sales))
      .slice(0, 8);
  }, [products, orders, days, counts.views, sort]);
  const ready = ordersLoaded && !counts.loading;

  return (
    <Panel
      id="admin-categories-perf"
      title="Categories"
      note={`Which categories people look at and buy, in ${words}`}
      action={<Segmented label="Sort by" value={sort} options={[{ id: 'sales', label: 'Sales' }, { id: 'views', label: 'Views' }]} onChange={setSort} />}
    >
      {!ready ? <p className="py-6 text-sm leading-5 text-ink-muted">Loading…</p> : (
        <RankBars
          empty={counts.failed ? 'The view counts could not be read right now.' : `No views or sales in ${words}.`}
          rows={rows.map((r, i) => ({
            key: r.category,
            label: r.category,
            value: sort === 'sales' ? r.sales : r.views,
            text: sort === 'sales' ? rupees(r.sales) : `${num(r.views)} ${r.views === 1 ? 'view' : 'views'}`,
            highlight: i === 0,
            sub: <span className="sag-num">{num(r.units)} sold · {num(r.views)} {r.views === 1 ? 'view' : 'views'}{r.views > 0 && r.units > 0 ? ` · ${shareText(Math.min(1, r.units / r.views))} bought after a view` : ''}</span>,
          }))}
        />
      )}
      <p className="mt-3 text-xs leading-4 text-ink-muted">Sales here are piece prices × pieces, before coupons and the online payment discount.</p>
    </Panel>
  );
};

// ---------------------------------------------------------------- the split by device (read on request)

interface DeviceRow { key: string; label: string; people: number; bag: number; checkout: number }
const DEVICE_ORDER = ['instagram_webview', 'mobile', 'desktop', 'tablet', 'other'];
const deviceName = (key: string) => ({ instagram_webview: 'Inside the Instagram / Facebook app', mobile: 'Phone browser', desktop: 'Computer', tablet: 'Tablet', other: 'Unknown device' } as Record<string, string>)[key] || 'Unknown device';
const MAX_SESSIONS = 2000;

/**
 * Visitors, bag adds and checkouts split by device, from the visitor records (`visitor_sessions`). Read only
 * when the owner asks (it reads one record per visitor). Each record holds a visitor's latest day on the
 * store, so over several days a person is counted once. Paid orders do not record the device.
 */
export const DeviceFunnelPanel: React.FC<{ days: string[]; words: string }> = ({ days, words }) => {
  const [state, setState] = useState<{ key: string; rows: DeviceRow[]; total: number; capped: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = `${days[0]}_${days[days.length - 1]}`;

  const load = () => {
    setLoading(true);
    setError('');
    // The first day's start in India time, as the ISO moment the records store
    const since = new Date(new Date(`${days[0]}T00:00:00Z`).getTime() - 5.5 * 3600000).toISOString();
    getDocs(query(collection(db, 'visitor_sessions'), where('lastActive', '>=', since), orderBy('lastActive', 'desc'), limit(MAX_SESSIONS)))
      .then((snap) => {
        const map = new Map<string, DeviceRow>();
        snap.docs.forEach((d) => {
          const x = d.data() as { deviceType?: string; actions?: Array<{ type?: string }>; lastActive?: string };
          if (!days.includes(istDay(x.lastActive))) return;
          const k = DEVICE_ORDER.includes(String(x.deviceType)) ? String(x.deviceType) : 'other';
          const row = map.get(k) || { key: k, label: deviceName(k), people: 0, bag: 0, checkout: 0 };
          const types = new Set((x.actions || []).map((a) => a?.type));
          row.people += 1;
          if (types.has('add_to_cart')) row.bag += 1;
          if (types.has('checkout_initiated')) row.checkout += 1;
          map.set(k, row);
        });
        const rows = DEVICE_ORDER.map((k) => map.get(k)).filter((r): r is DeviceRow => Boolean(r));
        setState({ key, rows, total: rows.reduce((s, r) => s + r.people, 0), capped: snap.docs.length >= MAX_SESSIONS });
      })
      .catch(() => setError('The visitor records could not be read right now.'))
      .finally(() => setLoading(false));
  };
  const current = state && state.key === key ? state : null;

  return (
    <Panel id="admin-device-funnel" title="Phones, Instagram app or computers" note={`Who adds to the bag and starts checkout, by device, in ${words}`}>
      {!current ? (
        <div className="py-2">
          <p className="text-sm leading-5 text-ink-muted">This reads one record per visitor, so it loads only when you ask.</p>
          <button type="button" onClick={load} disabled={loading} className="mt-3 sag-btn-outline">
            <Smartphone className="w-4 h-4" /> {loading ? 'Loading…' : 'Show the split by device'}
          </button>
          {error && <p role="alert" className="mt-2 text-sm leading-5 text-danger">{error}</p>}
        </div>
      ) : current.rows.length === 0 ? (
        <p className="py-4 text-sm leading-5 text-ink-muted">No visitor records for {words}.</p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[420px] text-[13px] leading-[18px] text-ink border-collapse">
              <thead>
                <tr className="text-xs text-ink-muted border-b border-line">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Device</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">People</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">Added to bag</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">Started checkout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {current.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">{r.label}<span className="block text-xs text-ink-muted sag-num">{shareText(r.people / current.total)} of the people</span></th>
                    <td className="py-2.5 px-2 text-right sag-num">{num(r.people)}</td>
                    <td className="py-2.5 px-2 text-right sag-num">{num(r.bag)}<span className="block text-xs text-ink-muted">{shareText(r.bag / r.people)}</span></td>
                    <td className="py-2.5 pl-2 text-right sag-num">{num(r.checkout)}<span className="block text-xs text-ink-muted">{shareText(r.checkout / r.people)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-4 text-ink-muted">
            Each person is counted once, by their latest day on the store. Paid orders are not split: an order does not record the device.
            {current.capped ? ` Only the newest ${num(MAX_SESSIONS)} visitors were read.` : ''}
          </p>
          <button type="button" onClick={load} disabled={loading} className={`mt-1 ${adminText.link}`}>{loading ? 'Loading…' : 'Read again'}</button>
        </>
      )}
    </Panel>
  );
};
