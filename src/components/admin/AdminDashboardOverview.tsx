import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Plus } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { PaymentProblemsPanel, RefundsToDoPanel, refundsToDo } from './orderMoney';
import { useRouter } from '../../context/RouterContext';
import { AdminTab } from '../../types';
import { isLowStock } from '../../utils/inventory';
import { MetricsDashboard } from './MetricsDashboard';
import { AdminInsights } from './AdminInsights';
import { OrderStatusBadge } from './PaymentBadge';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { AdminPageHeader } from './adminShared';
import { AnalyticsDay, OrderDay, dayLabel, dayRange, istDay, istToday, num, ordersByDay, rupees, shiftDay, totalsFor, useDailyAnalytics } from './adminStats';
import { ActivityFeedPanel, FeedEvent, LiveDot, LiveVisitorsPanel, SourcesAndDevices, UpdatedAgo, VisitorsByHourPanel, useLiveVisitors } from './AdminLive';
import { EmptyNote, Panel, Segmented, adminText } from './adminUi';

type PeriodId = 'today' | '7' | '30';
const PERIODS: Array<{ id: PeriodId; label: string; words: string }> = [
  { id: 'today', label: 'Today', words: 'today' },
  { id: '7', label: '7 days', words: 'the last 7 days' },
  { id: '30', label: '30 days', words: 'the last 30 days' },
];

type Metric = 'sales' | 'orders' | 'visits';
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'visits', label: 'Visitors' },
];

// ---------------------------------------------------------------- the path to an order

const FunnelPanel: React.FC<{
  days: string[]; words: string; analytics: Map<string, AnalyticsDay>; orders: Map<string, OrderDay>; ready: boolean; action: React.ReactNode;
}> = ({ days, words, analytics, orders, ready, action }) => {
  const totals = useMemo(() => totalsFor(days, analytics, orders), [days, analytics, orders]);
  const steps: Array<{ label: string; value: number | null; leave: string }> = [
    { label: 'Visits', value: totals.visits, leave: '' },
    { label: 'Product views', value: totals.productViews, leave: 'arriving and opening a product' },
    { label: 'Added to bag', value: totals.cartAdds, leave: 'opening a product and adding it to the bag' },
    { label: 'Checkout started', value: totals.checkouts, leave: 'the bag and checkout' },
    { label: 'Paid orders', value: totals.paid, leave: 'checkout and payment' },
  ];
  const peak = steps.reduce((max, s) => Math.max(max, s.value ?? 0), 0);

  // The step where the largest share of people stopped (only between two counted steps)
  let worst: { leave: string; lost: number } | null = null;
  steps.forEach((step, i) => {
    const before = i > 0 ? steps[i - 1].value : null;
    if (step.value === null || before === null || before <= 0 || step.value > before) return;
    const lost = 1 - step.value / before;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { leave: step.leave, lost };
  });
  const sentence = !ready ? 'Loading…'
    : totals.visits === null ? `No visits were counted for ${words}, so the path cannot be drawn yet.`
    : worst ? `Most people leave between ${(worst as { leave: string }).leave}.`
    : 'There is not enough movement yet to say where people leave.';

  return (
    <Panel id="admin-funnel" title="The path to an order" note={`From a visit to a paid order, in ${words}`} action={action}>
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const before = i > 0 ? steps[i - 1].value : null;
          const moved = step.value !== null && before !== null && before > 0 && step.value <= before ? Math.round((step.value / before) * 100) : null;
          const width = step.value !== null && peak > 0 ? Math.max((step.value / peak) * 100, step.value > 0 ? 1.5 : 0) : 0;
          return (
            <li key={step.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm leading-5 text-ink">{step.label}</span>
                <span className="shrink-0 text-right">
                  <span className={`sag-num ${step.value === null ? 'text-sm text-ink-muted' : 'text-base font-semibold text-ink'}`}>{!ready ? '…' : step.value === null ? 'No data' : num(step.value)}</span>
                  {ready && moved !== null && <span className="ml-2 sag-num text-xs leading-4 text-ink-muted">{moved}% moved on</span>}
                </span>
              </div>
              <div className="mt-1.5 h-3 rounded-full bg-line overflow-hidden" aria-hidden="true">
                <div className={`h-full rounded-full ${i === steps.length - 1 ? 'bg-accent' : 'bg-brand'}`} style={{ width: `${ready ? width : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 pt-3 border-t border-line rounded-none text-sm leading-5 text-ink">{sentence}</p>
      <p className="mt-1 text-xs leading-4 text-ink-muted">Product views and searches count once per visitor per product per day.</p>
    </Panel>
  );
};

// ---------------------------------------------------------------- last 30 days

const DailyChart: React.FC<{
  today: string; analytics: Map<string, AnalyticsDay>; orders: Map<string, OrderDay>; ordersLoaded: boolean; visitsLoaded: boolean; onReports: () => void;
}> = ({ today, analytics, orders, ordersLoaded, visitsLoaded, onReports }) => {
  const [metric, setMetric] = useState<Metric>('sales');
  const [picked, setPicked] = useState('');
  const rows = useMemo(() => dayRange(shiftDay(today, -29), today).map((day) => {
    const o = orders.get(day);
    return { day, sales: o?.sales || 0, orders: o?.paid || 0, visits: analytics.get(day)?.visits ?? null };
  }), [today, analytics, orders]);

  const ready = metric === 'visits' ? visitsLoaded : ordersLoaded;
  const valueOf = (r: (typeof rows)[number]): number | null => r[metric];
  const show = (value: number | null) => (value === null ? 'No data' : metric === 'sales' ? rupees(value) : num(value));
  const peak = rows.reduce((max, r) => Math.max(max, valueOf(r) ?? 0), 0);
  const best = peak > 0 ? rows.find((r) => valueOf(r) === peak) : undefined;
  const focused = rows.find((r) => r.day === picked) || rows[rows.length - 1];
  const label = METRICS.find((m) => m.id === metric)!.label;

  return (
    <Panel
      id="admin-last-30"
      title="Last 30 days"
      note={`${label} for each day. Tap a bar for that day's exact figure.`}
      action={<Segmented label="Show in the chart" value={metric} options={METRICS} onChange={setMetric} />}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-sm leading-5 text-ink-muted" aria-live="polite">
          {dayLabel(focused.day)}{focused.day === today ? ' (today so far)' : ''}:{' '}
          <span className="sag-num text-xl leading-7 font-semibold text-ink">{ready ? show(valueOf(focused)) : '…'}</span>
        </p>
        {ready && (
          <p className="text-[13px] leading-[18px] text-star">
            {best ? <>Best day: {dayLabel(best.day)} with <span className="sag-num font-medium">{show(valueOf(best))}</span></> : <span className="text-ink-muted">Nothing to show in these 30 days yet.</span>}
          </p>
        )}
      </div>
      <div className="mt-3 h-40 flex items-end gap-[2px] border-b border-line rounded-none" role="group" aria-label={`${label} per day, oldest first`}>
        {rows.map((r) => {
          const value = ready ? valueOf(r) : null;
          const height = value !== null && peak > 0 ? Math.max((value / peak) * 100, value > 0 ? 2 : 0) : 0;
          const on = r.day === focused.day;
          const words = `${dayLabel(r.day)}: ${ready ? show(valueOf(r)) : 'loading'}`;
          return (
            <button key={r.day} type="button" title={words} aria-label={words} aria-pressed={on}
              onClick={() => setPicked(r.day)} onMouseEnter={() => setPicked(r.day)} onFocus={() => setPicked(r.day)}
              className={`flex-1 min-w-0 h-full flex items-end cursor-pointer rounded-t-[4px] ${on ? 'bg-sunken' : 'hover:bg-sunken'}`}>
              <span className={`block w-full rounded-t-[4px] ${on ? 'bg-accent' : r.day === best?.day ? 'bg-star' : 'bg-brand'}`} style={{ height: `${height}%` }} />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] leading-4 text-ink-muted" aria-hidden="true">
        <span>{dayLabel(rows[0].day)}</span>
        <span>Today</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs leading-4 text-ink-muted">{metric === 'visits' ? 'A day without a bar may have no count ("No data").' : 'Sales count paid orders that were not cancelled.'}</p>
        <button type="button" onClick={onReports} className={adminText.link}>Every day in Reports <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------- the page

export const AdminDashboardOverview: React.FC = () => {
  const { products = [], orders = [], ordersLoaded, lowStockThreshold, reviews = [] } = useAdmin();
  const { openAdminTab, openAdminProductNew, openAdminOrderDetails } = useRouter();
  const [period, setPeriod] = useState<PeriodId>('7');

  const live = useLiveVisitors();
  // This month, the same days of last month, and the last 30 days
  const analytics = useDailyAnalytics(70);
  const byDay = useMemo(() => ordersByDay(orders), [orders]);

  const today = istToday();
  const chosen = PERIODS.find((p) => p.id === period)!;
  const periodDays = useMemo(() => dayRange(shiftDay(today, period === 'today' ? 0 : 1 - Number(period)), today), [period, today]);
  const periodSwitch = <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />;

  const todayOrders = byDay.get(today);
  const todayVisits = analytics.days.get(today)?.visits ?? null;
  const view = live.view;

  // Needs your attention: the same counts as the menu badges
  const attention = useMemo(() => {
    const toPack = orders.filter((o) => o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Packed')).length;
    const openReturns = returnRows(orders).filter((r) => r.state === 'requested').length;
    const openCancels = waitingCancelRows(orders).length;
    const unpaidToday = orders.filter((o) => !o.testPayment && o.paymentStatus === 'Unpaid' && o.status !== 'Cancelled' && istDay(o.date) === today).length;
    const low = products.filter((p) => p.productType !== 'accessory' && isLowStock(p, lowStockThreshold));
    const out = low.filter((p) => !(p.inStock && Number(p.stockQuantity ?? 0) > 0)).length;
    const rows: Array<{ label: string; note: string; count: number; tab: AdminTab; loaded: boolean; problem?: boolean }> = [
      { label: 'Orders to pack', note: 'Paid and waiting to be packed or shipped', count: toPack, tab: 'orders', loaded: ordersLoaded },
      { label: 'Return and exchange requests', note: 'Waiting for your answer', count: openReturns, tab: 'returns', loaded: ordersLoaded },
      { label: 'Cancellation requests', note: 'Waiting for your answer', count: openCancels, tab: 'cancellations', loaded: ordersLoaded },
      { label: 'Unpaid attempts today', note: 'Reached payment today but did not pay', count: unpaidToday, tab: 'orders', loaded: ordersLoaded },
      { label: 'Out of stock', note: 'Products shoppers cannot buy now', count: out, tab: 'products', loaded: true, problem: true },
      { label: 'Low on stock', note: `At or below the low-stock level (${lowStockThreshold} unless set on the product)`, count: low.length - out, tab: 'products', loaded: true },
    ];
    return rows;
  }, [orders, products, lowStockThreshold, ordersLoaded, today]);

  // Today's to-do: only the jobs that are really waiting, each one a link to its page
  const todo = useMemo(() => {
    const count = (label: string) => attention.find((row) => row.label === label)?.count || 0;
    const toPack = count('Orders to pack');
    const returns = count('Return and exchange requests');
    const cancels = count('Cancellation requests');
    const out = count('Out of stock');
    const low = count('Low on stock');
    const waitingReviews = reviews.filter((r) => r.status === 'pending').length;
    // Cancelled orders whose payment is still with the store (orderMoney.tsx)
    const refunds = refundsToDo(orders).length;
    const lines: Array<{ text: string; count: number; tab: AdminTab; problem?: boolean }> = [
      { text: `Pack ${num(toPack)} ${toPack === 1 ? 'order' : 'orders'}`, count: toPack, tab: 'orders' },
      { text: `Reply to ${num(returns)} return ${returns === 1 ? 'request' : 'requests'}`, count: returns, tab: 'returns' },
      { text: `Reply to ${num(cancels)} cancellation ${cancels === 1 ? 'request' : 'requests'}`, count: cancels, tab: 'cancellations' },
      { text: `Refund ${num(refunds)} cancelled ${refunds === 1 ? 'order' : 'orders'} that ${refunds === 1 ? 'is' : 'are'} still paid`, count: refunds, tab: 'cancellations', problem: true },
      { text: out === 1 ? '1 product is out of stock' : `${num(out)} products are out of stock`, count: out, tab: 'products', problem: true },
      { text: low === 1 ? '1 product is low on stock' : `${num(low)} products are low on stock`, count: low, tab: 'products' },
      { text: waitingReviews === 1 ? '1 review waiting for approval' : `${num(waitingReviews)} reviews waiting for approval`, count: waitingReviews, tab: 'reviews' },
    ];
    return lines.filter((line) => line.count > 0);
  }, [attention, reviews, orders]);

  // Cash still to be collected at the door: paid cash-on-delivery orders that are not delivered, cancelled or returned
  const cashToCollect = useMemo(() => {
    const open = orders.filter((o) => !o.testPayment && o.paymentStatus === 'Paid' && o.payMode === 'cod'
      && !['Delivered', 'Cancelled', 'Returned', 'Refunded'].includes(o.status));
    return { count: open.length, total: open.reduce((sum, o) => sum + (Number(o.codDue) || 0), 0) };
  }, [orders]);

  // Today's order events for the activity feed
  const orderEvents = useMemo(() => {
    const list: FeedEvent[] = [];
    const time = (value?: string) => (value ? Date.parse(value) || 0 : 0);
    orders.forEach((o) => {
      if (o.testPayment) return;
      const open = () => openAdminOrderDetails(o.orderNumber);
      if (o.paymentStatus === 'Paid' && istDay(o.paidAt || o.date) === today) {
        const cod = o.payMode === 'cod';
        list.push({
          key: `paid-${o.orderNumber}`, t: time(o.paidAt || o.date), who: 'New order', kind: 'order', gold: true, onOpen: open,
          what: cod
            ? `${o.orderNumber} for ${rupees(o.finalTotal)}, cash on delivery (${rupees(Number(o.codAdvance) || 0)} paid online, ${rupees(Number(o.codDue) || 0)} to collect)`
            : `${o.orderNumber} paid ${rupees(o.finalTotal)} online`,
        });
      } else if (o.paymentStatus === 'Unpaid' && istDay(o.date) === today) {
        list.push({ key: `unpaid-${o.orderNumber}`, t: time(o.date), who: 'Payment not finished', kind: 'order', onOpen: open, what: `${o.orderNumber} for ${rupees(o.finalTotal)}` });
      }
    });
    returnRows(orders).forEach((r) => {
      if (r.state === 'requested' && istDay(r.at) === today) list.push({ key: `return-${r.order.orderNumber}-${r.at}`, t: time(r.at), who: r.kind === 'exchange' ? 'Exchange request' : 'Return request', kind: 'order', onOpen: () => openAdminTab('returns'), what: `on ${r.order.orderNumber}` });
    });
    waitingCancelRows(orders).forEach((r) => {
      if (istDay(r.at) === today) list.push({ key: `cancel-${r.order.orderNumber}-${r.at}`, t: time(r.at), who: 'Cancellation request', kind: 'order', onOpen: () => openAdminTab('cancellations'), what: `on ${r.order.orderNumber}` });
    });
    return list.filter((e) => e.t > 0);
  }, [orders, today, openAdminOrderDetails, openAdminTab]);

  const recentOrders = useMemo(() => orders
    .filter((o) => o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')
    .sort((a, b) => String(b.paidAt || b.date).localeCompare(String(a.paidAt || a.date)))
    .slice(0, 6), [orders]);

  const small = 'text-xs leading-4 text-ink-muted';
  const figure = 'mt-1 sag-num text-2xl leading-8 font-semibold text-ink truncate';

  return (
    <div id="admin-dashboard-overview" className="space-y-5">
      <AdminPageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={<>{dayLabel(today, true)}, India time.</>}
        actions={(
          <>
            <button type="button" onClick={openAdminProductNew} className="sag-btn-outline"><Plus className="w-4 h-4" /> Add product</button>
            <button type="button" onClick={() => openAdminTab('orders')} className="sag-btn-primary">View orders</button>
          </>
        )}
      />

      {/* 1. Right now */}
      <section aria-labelledby="admin-now-title" className="sag-glass sag-glass-strong p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 id="admin-now-title" className="inline-flex items-center gap-2 text-[11px] leading-4 font-bold uppercase tracking-[0.14em] text-sale">
            <LiveDot on={live.status === 'ok'} /> Right now
          </h3>
          <p className={small}>{live.status === 'ok' ? <UpdatedAgo at={live.fetchedAt} stale={live.stale} /> : live.status === 'loading' ? 'Connecting…' : ''}</p>
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 lg:gap-8 lg:items-center">
          <div className="min-w-0" aria-live="polite">
            {view ? (
              <p className="flex items-end gap-3">
                <span className="sag-num text-[64px] leading-[64px] sm:text-[80px] sm:leading-[80px] font-semibold text-ink">{num(view.activeCount)}</span>
                <span className="pb-1.5 text-base leading-6 text-ink">{view.activeCount === 1 ? 'person' : 'people'} on the site<br />right now</span>
              </p>
            ) : (
              <p className="text-base leading-6 text-ink-muted">{live.status === 'loading' ? 'Looking who is on the site…' : 'Live view is not available yet.'}</p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-3 sm:gap-5 lg:border-l lg:border-line lg:pl-8 lg:rounded-none">
            <div className="min-w-0">
              <dt className={small}>Visitors today</dt>
              <dd className={figure}>
                {view && view.todayCount !== null ? num(view.todayCount) : !analytics.loaded && live.status !== 'unavailable' ? '…' : todayVisits !== null ? num(todayVisits) : <span className="text-base font-normal text-ink-muted">No data</span>}
              </dd>
              <dd className={small}>
                {view && view.todayCount !== null
                  ? (todayVisits !== null && todayVisits !== view.todayCount ? `People, counted live. Visits by the daily counter: ${num(todayVisits)}` : 'People, counted live')
                  : todayVisits !== null ? 'Visits, by the daily counter' : ''}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={small}>Orders today</dt>
              <dd className={figure}>{ordersLoaded ? num(todayOrders?.paid || 0) : '…'}</dd>
              <dd className={small}>{ordersLoaded && (todayOrders?.cod || 0) > 0 ? `${num(todayOrders!.cod)} cash on delivery` : 'Paid orders'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={small}>Sales today</dt>
              <dd className={`${figure} ${ordersLoaded && (todayOrders?.sales || 0) > 0 ? '!text-ok' : ''}`}>{ordersLoaded ? rupees(todayOrders?.sales || 0) : '…'}</dd>
              <dd className={small}>From paid orders</dd>
            </div>
          </dl>
        </div>

        {view?.paused && (
          <p className="mt-4 px-4 py-3 rounded-[16px] bg-surface text-sm leading-5 text-ink">Visitor counting is paused for today to keep orders safe (free plan limit).</p>
        )}
        {analytics.error && <p className={`mt-3 ${small}`}>{analytics.error}</p>}
      </section>

      {/* Today's to-do, and the cash still to be collected */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <Panel id="admin-todo" title="Today's to-do" note="What is waiting for you right now. Tap a line to open it." flush>
          {!ordersLoaded ? (
            <EmptyNote>Loading…</EmptyNote>
          ) : todo.length === 0 ? (
            <p className="px-4 py-8 flex items-center justify-center gap-2 text-sm leading-5 text-ink">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-ok" strokeWidth={1.5} aria-hidden="true" /> Nothing waiting. All caught up.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {todo.map((line) => (
                <li key={line.text}>
                  <button type="button" onClick={() => openAdminTab(line.tab)} className={adminText.row}>
                    <span className={`w-5 h-5 shrink-0 rounded-full border ${line.problem ? 'border-danger' : 'border-brand-line'}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 sag-num text-[15px] leading-[22px] text-ink">{line.text}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="admin-cod-due" title="Cash to collect (COD)" note="Still to be collected in cash at the door">
          <p className={`sag-num text-[32px] leading-10 font-semibold ${ordersLoaded && cashToCollect.total > 0 ? 'text-sale' : 'text-ink'}`}>{ordersLoaded ? rupees(cashToCollect.total) : '…'}</p>
          <p className={`mt-1 ${small}`}>
            {!ordersLoaded ? 'Loading orders…'
              : cashToCollect.count === 0 ? 'No cash-on-delivery order is waiting for its cash.'
              : `From ${num(cashToCollect.count)} cash-on-delivery ${cashToCollect.count === 1 ? 'order' : 'orders'} not delivered yet. The advance paid online is not counted.`}
          </p>
          <button type="button" onClick={() => openAdminTab('orders')} className={`mt-2 ${adminText.link}`}>Open orders <ChevronRight className="w-3.5 h-3.5" /></button>
        </Panel>
      </div>

      {/* Money that needs a look: refunds still to be made, and payments that did not finish */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RefundsToDoPanel id="admin-dashboard-refunds" limit={4} />
        <PaymentProblemsPanel />
      </div>

      {/* 2 and 3. Who is here and what they are doing */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <LiveVisitorsPanel live={live} />
        <ActivityFeedPanel live={live} orderEvents={orderEvents} />
      </div>

      {/* Visitors hour by hour (drawn only when the live view sends the hourly counts) */}
      <VisitorsByHourPanel live={live} />

      {/* 4. Today, this week, this month */}
      <MetricsDashboard today={today} analytics={analytics.days} orders={byDay} ordersLoaded={ordersLoaded} visitsLoaded={analytics.loaded} />
      <p className={`${small} max-w-3xl`}>Orders and sales are counted on the day they were paid, India time. A week runs Monday to Sunday. The daily visit counter closes its day at 5:30 am India time, so before 5:30 am today has no visits figure yet.</p>

      {/* 5 and 6. The path to an order, and the last 30 days */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <FunnelPanel days={periodDays} words={chosen.words} analytics={analytics.days} orders={byDay} ready={ordersLoaded && analytics.loaded} action={periodSwitch} />
        <DailyChart today={today} analytics={analytics.days} orders={byDay} ordersLoaded={ordersLoaded} visitsLoaded={analytics.loaded} onReports={() => openAdminTab('reports')} />
      </div>

      {/* 7. Needs your attention, with the newest orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel id="admin-attention" title="Needs your attention" flush>
          <ul className="divide-y divide-line">
            {attention.map((row) => {
              const hot = row.loaded && row.count > 0;
              return (
                <li key={row.label}>
                  <button type="button" onClick={() => openAdminTab(row.tab)} className={adminText.row}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5 text-ink">{row.label}</span>
                      <span className="block text-xs leading-4 text-ink-muted">{row.note}</span>
                    </span>
                    <span className={`sag-num text-xl leading-7 ${hot ? `font-semibold ${row.problem ? 'text-danger' : 'text-sale'}` : 'text-ink-muted'}`}>{row.loaded ? num(row.count) : '…'}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel id="admin-recent" title="Newest orders" note="The six newest paid orders" flush
          action={<button type="button" onClick={() => openAdminTab('orders')} className={adminText.link}>All orders <ChevronRight className="w-3.5 h-3.5" /></button>}>
          {recentOrders.length === 0 ? (
            <EmptyNote>{ordersLoaded ? 'No paid orders yet. They appear here the moment they arrive.' : 'Loading orders…'}</EmptyNote>
          ) : (
            <ul className="divide-y divide-line">
              {recentOrders.map((order) => (
                <li key={order.orderNumber}>
                  <button type="button" onClick={() => openAdminOrderDetails(order.orderNumber)} className={adminText.row}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5 text-ink truncate">{order.customerName || 'Customer'}</span>
                      <span className="block text-xs leading-4 text-ink-muted truncate">
                        {order.orderNumber}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}{order.payMode === 'cod' ? ' · Cash on delivery' : ''}
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex shrink-0"><OrderStatusBadge status={order.status} /></span>
                    <span className="shrink-0 sag-num text-sm font-semibold text-ink">{rupees(order.finalTotal)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* 8. Top products, searches, sources and devices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <AdminInsights days={periodDays} periodWords={chosen.words} action={periodSwitch} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SourcesAndDevices live={live} />
      </div>
    </div>
  );
};
