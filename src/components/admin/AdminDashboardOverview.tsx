import React, { useMemo, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { AdminTab } from '../../types';
import { isLowStock } from '../../utils/inventory';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { MetricsDashboard } from './MetricsDashboard';
import { AdminInsights } from './AdminInsights';
import { OrderStatusBadge } from './PaymentBadge';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { AdminPageHeader } from './kidsToysShared';
import { dayLabel, dayRange, istToday, ordersByDay, rupees, shiftDay, totalsFor, useDailyAnalytics } from './adminStats';

type PeriodId = 'today' | 'yesterday' | '7' | '30';
const PERIODS: Array<{ id: PeriodId; label: string; previous: string }> = [
  { id: 'today', label: 'Today', previous: 'yesterday' },
  { id: 'yesterday', label: 'Yesterday', previous: 'the day before' },
  { id: '7', label: 'Last 7 days', previous: 'the 7 days before' },
  { id: '30', label: 'Last 30 days', previous: 'the 30 days before' },
];

const sectionTitle = 'text-[15px] leading-6 font-medium text-ink';
const sectionNote = 'text-[13px] leading-[18px] text-ink-muted';
const panel = 'border border-line bg-surface';
const textLink = 'inline-flex items-center gap-0.5 text-[13px] leading-[18px] font-medium text-ink underline underline-offset-[3px] hover:text-ink-muted cursor-pointer shrink-0';

export const AdminDashboardOverview: React.FC = () => {
  const { products = [], orders = [], ordersLoaded, lowStockThreshold } = useAdmin();
  const { openAdminTab, openAdminProductNew, openAdminProductEdit, openAdminOrderDetails } = useRouter();
  const [period, setPeriod] = useState<PeriodId>('today');

  // 30 days and the 30 before them, plus today's own document
  const analytics = useDailyAnalytics(62);
  const byDay = useMemo(() => ordersByDay(orders), [orders]);

  const today = istToday();
  const { current, previous, days } = useMemo(() => {
    const length = period === '7' ? 7 : period === '30' ? 30 : 1;
    const to = period === 'yesterday' ? shiftDay(today, -1) : today;
    const from = shiftDay(to, 1 - length);
    const list = dayRange(from, to);
    return {
      days: list,
      current: totalsFor(list, analytics.days, byDay),
      previous: totalsFor(dayRange(shiftDay(from, -length), shiftDay(from, -1)), analytics.days, byDay),
    };
  }, [period, today, analytics.days, byDay]);
  const chosen = PERIODS.find((p) => p.id === period)!;
  const periodDates = days.length === 1 ? dayLabel(days[0], true) : `${dayLabel(days[0])} to ${dayLabel(days[days.length - 1], true)}`;

  // Needs your attention: the same counts as the sidebar badges
  const toPack = orders.filter((o) => o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Packed')).length;
  const openReturns = returnRows(orders).filter((r) => r.state === 'requested').length;
  const openCancels = waitingCancelRows(orders).length;
  const lowStockProducts = products.filter((p) => p.productType !== 'accessory' && isLowStock(p, lowStockThreshold));
  const hasStock = (p: (typeof products)[number]) => p.inStock && Number(p.stockQuantity ?? 0) > 0;
  const outOfStock = lowStockProducts.filter((p) => !hasStock(p));
  const runningLow = lowStockProducts.filter(hasStock);

  const attention: Array<{ label: string; note: string; count: number; tab: AdminTab; loaded: boolean }> = [
    { label: 'Orders to pack', note: 'Paid, still Processing or Packed', count: toPack, tab: 'orders', loaded: ordersLoaded },
    { label: 'Return and exchange requests', note: 'Waiting for your answer', count: openReturns, tab: 'returns', loaded: ordersLoaded },
    { label: 'Cancellation requests', note: 'Waiting for your answer', count: openCancels, tab: 'cancellations', loaded: ordersLoaded },
    { label: 'Out of stock', note: 'Products shoppers cannot buy now', count: outOfStock.length, tab: 'products', loaded: true },
    { label: 'Low on stock', note: `At or below the low-stock level (${lowStockThreshold} unless set on the product)`, count: runningLow.length, tab: 'products', loaded: true },
  ];

  const recentOrders = useMemo(() => orders
    .filter((o) => o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')
    .sort((a, b) => String(b.paidAt || b.date).localeCompare(String(a.paidAt || a.date)))
    .slice(0, 6), [orders]);

  // Best sellers by units in paid orders that were not cancelled or refunded
  const topProducts = useMemo(() => {
    const units = new Map<string, number>();
    orders
      .filter((o) => o.paymentStatus === 'Paid' && o.status !== 'Cancelled' && o.status !== 'Refunded' && !o.testPayment)
      .forEach((o) => o.items.forEach((item) => {
        const id = String(item.product?.id || '');
        if (id) units.set(id, (units.get(id) || 0) + (Number(item.quantity) || 0));
      }));
    return products
      .map((product) => ({ product, units: units.get(String(product.id)) || 0 }))
      .filter((row) => row.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [orders, products]);

  const photo = (url?: string) => (url && url.trim()
    ? <img src={getCleanImageUrl(url, 160)} alt="" loading="lazy" className="w-9 aspect-[4/5] shrink-0 object-cover object-top bg-sunken" />
    : <span className="w-9 aspect-[4/5] shrink-0 bg-sunken" aria-hidden="true" />);

  return (
    <div id="admin-dashboard-overview" className="space-y-6">
      <AdminPageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={<>{dayLabel(today, true)}, India time. Sales count only orders whose payment the server verified.</>}
        actions={(
          <>
            <button type="button" onClick={openAdminProductNew} className="sag-btn-outline"><Plus className="w-4 h-4" /> Add product</button>
            <button type="button" onClick={() => openAdminTab('orders')} className="sag-btn-primary">View orders</button>
          </>
        )}
      />

      {/* Key numbers for the chosen period */}
      <section aria-label="Key numbers" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div role="group" aria-label="Period" className="flex flex-wrap border border-line divide-x divide-line">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === period} onClick={() => setPeriod(p.id)}
                className={`h-10 px-3.5 text-sm cursor-pointer transition-colors ${p.id === period ? 'bg-sunken text-ink font-medium' : 'bg-surface text-ink-muted hover:text-ink'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <p className={sectionNote}>{periodDates}</p>
        </div>

        <MetricsDashboard current={current} previous={previous} previousLabel={chosen.previous} ordersLoaded={ordersLoaded} visitsLoaded={analytics.loaded} />

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-xs leading-4 text-ink-muted max-w-3xl">
            {analytics.error ? `${analytics.error} ` : ''}
            Orders and sales are grouped by the day they were paid, India time. Visits are counted by the server in days that run from 5:30 am to 5:30 am India time{period === 'today' ? ', so before 5:30 am today has no visits figure yet' : ''}.
          </p>
          <button type="button" onClick={() => openAdminTab('reports')} className={textLink}>Day-by-day history in Reports <ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </section>

      {/* Needs your attention */}
      <section aria-labelledby="admin-attention-title" className={panel}>
        <div className="px-4 py-3 border-b border-line">
          <h3 id="admin-attention-title" className={sectionTitle}>Needs your attention</h3>
        </div>
        <ul className="divide-y divide-line">
          {attention.map((row) => (
            <li key={row.label}>
              <button type="button" onClick={() => openAdminTab(row.tab)} className="w-full min-h-[52px] px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-sm leading-5 text-ink">{row.label}</span>
                  <span className="block text-xs leading-4 text-ink-muted">{row.note}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {row.loaded && row.count > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sale" aria-hidden="true" />}
                  <span className={`sag-num text-base leading-6 ${row.loaded && row.count > 0 ? 'font-medium text-sale' : 'text-ink-muted'}`}>{row.loaded ? row.count : '…'}</span>
                  <ChevronRight className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent orders and top products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section aria-labelledby="admin-recent-title" className={`lg:col-span-7 ${panel}`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div className="min-w-0">
              <h3 id="admin-recent-title" className={sectionTitle}>Recent orders</h3>
              <p className={sectionNote}>The six newest paid orders</p>
            </div>
            <button type="button" onClick={() => openAdminTab('orders')} className={textLink}>All orders <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">{ordersLoaded ? 'No paid orders yet. They appear here the moment they arrive.' : 'Loading orders…'}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentOrders.map((order) => (
                <li key={order.orderNumber}>
                  <button type="button" onClick={() => openAdminOrderDetails(order.orderNumber)} className="w-full min-h-[56px] px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">
                    <span className="min-w-0">
                      <span className="block text-sm leading-5 text-ink truncate">{order.customerName || 'Customer'}</span>
                      <span className="block text-xs leading-4 text-ink-muted truncate">
                        {order.orderNumber}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}{order.payMode === 'cod' ? ' · Cash on delivery' : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="hidden sm:inline-flex"><OrderStatusBadge status={order.status} /></span>
                      <span className="sag-num text-sm font-medium text-ink">{rupees(order.finalTotal)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="admin-top-title" className={`lg:col-span-5 ${panel}`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div className="min-w-0">
              <h3 id="admin-top-title" className={sectionTitle}>Top products</h3>
              <p className={sectionNote}>Units sold in paid orders, all time</p>
            </div>
            <button type="button" onClick={() => openAdminTab('products')} className={textLink}>All products <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          {topProducts.length === 0 ? (
            <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">{ordersLoaded ? 'Best sellers appear here after the first paid orders.' : 'Loading orders…'}</p>
          ) : (
            <ol className="divide-y divide-line">
              {topProducts.map(({ product, units }, i) => (
                <li key={product.id}>
                  <button type="button" onClick={() => openAdminProductEdit(product.id)} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">
                    <span className="w-4 shrink-0 sag-num text-[13px] text-ink-muted">{i + 1}</span>
                    {photo(product.images?.[0] || product.image)}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5 text-ink truncate">{product.name}</span>
                      <span className="block text-xs leading-4 text-ink-muted truncate sag-num">{product.category} · {rupees(product.price)}</span>
                    </span>
                    <span className="shrink-0 sag-num text-sm text-ink">{units} sold</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Products to restock */}
      {lowStockProducts.length > 0 && (
        <section aria-labelledby="admin-restock-title" className={panel}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div className="min-w-0">
              <h3 id="admin-restock-title" className={sectionTitle}>To restock <span className="sag-num font-normal text-ink-muted">({lowStockProducts.length})</span></h3>
              <p className={sectionNote}>Sold out first, then the lowest stock</p>
            </div>
            <button type="button" onClick={() => openAdminTab('products')} className={textLink}>Products <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
            {[...outOfStock, ...[...runningLow].sort((a, b) => Number(a.stockQuantity ?? 0) - Number(b.stockQuantity ?? 0))].slice(0, 9).map((product) => (
              <li key={product.id} className="bg-surface">
                <button type="button" onClick={() => openAdminProductEdit(product.id)} aria-label={`Restock ${product.name}`} className="w-full h-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">
                  {photo(product.images?.[0] || product.image)}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-5 text-ink truncate">{product.name}</span>
                    <span className={`block text-xs leading-4 sag-num ${hasStock(product) ? 'text-sale' : 'text-danger'}`}>{hasStock(product) ? `${product.stockQuantity} left` : 'Out of stock'}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {lowStockProducts.length > 9 && (
            <p className="px-4 py-2.5 border-t border-line text-xs leading-4 text-ink-muted">Showing 9 of {lowStockProducts.length}. The rest are in Products.</p>
          )}
        </section>
      )}

      <AdminInsights />
    </div>
  );
};
