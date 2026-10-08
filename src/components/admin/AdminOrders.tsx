import React, { useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { AlertCircle, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Order, AdminOrderStatus } from '../../types';
import { RETURN_STATUS_LABEL, isReturnOpen, returnRequestOf, returnStatusOf } from '../OrderProgress';
import { PaymentBadge } from './PaymentBadge';
import { formatOrderDate } from '../../utils/orderDate';
import { AdminPageHeader } from './kidsToysShared';

const ORDER_STATUSES: AdminOrderStatus[] = [
  'Pending',
  'Processing',
  'Packed',
  'Shipped',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'Returned',
  'Cancelled',
  'Refund Requested',
  'Refunded',
];

/** The seven groups every order belongs to (exactly one each), plus "All". */
type Bucket = 'topack' | 'packed' | 'onway' | 'delivered' | 'returns' | 'cancelled' | 'unpaid';
type TabKey = Bucket | 'all';

const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: 'topack', label: 'To pack', empty: 'No orders to pack' },
  { key: 'packed', label: 'Packed', empty: 'No packed orders waiting for the courier' },
  { key: 'onway', label: 'On the way', empty: 'No orders on the way' },
  { key: 'delivered', label: 'Delivered', empty: 'No delivered orders' },
  { key: 'returns', label: 'Returns', empty: 'No returns or exchanges' },
  { key: 'cancelled', label: 'Cancelled & refunded', empty: 'No cancelled or refunded orders' },
  { key: 'unpaid', label: 'Unpaid attempts', empty: 'No unpaid checkout attempts' },
  { key: 'all', label: 'All', empty: 'No orders yet' },
];

/** Tabs whose total is money actually earned; the others show it as "value". */
const SALES_TABS: TabKey[] = ['topack', 'packed', 'onway', 'delivered'];

/**
 * The one group an order belongs to. Checked in this order, first match wins:
 * unpaid attempt, cancelled, return / exchange, refunded, delivered, on the way, packed, and the rest is "to pack".
 */
const bucketOf = (order: Order): Bucket => {
  const status = String(order.status);
  if (order.paymentStatus === 'Unpaid' && status === 'Pending') return 'unpaid';
  if (status === 'Cancelled') return 'cancelled';
  if (isReturnOpen(order) || status === 'Returned' || status === 'Refund Requested') return 'returns';
  if (status === 'Refunded' || order.paymentStatus === 'Refunded') return 'cancelled';
  if (status === 'Delivered') return 'delivered';
  if (status === 'Shipped' || status === 'In Transit' || status === 'Out for Delivery') return 'onway';
  if (status === 'Packed') return 'packed';
  return 'topack';
};

type RangeKey = 'today' | '7' | '30' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_MS = 24 * 60 * 60 * 1000;
/** The order's calendar day in India ("2026-10-08"); '' when the saved date cannot be read. */
const istDay = (value: unknown): string => {
  const raw = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return !raw || Number.isNaN(date.getTime()) ? '' : IST_DAY.format(date);
};
/** First India day of a range ('' for all time). "Last 7 days" is today and the six days before it. */
const rangeStart = (range: RangeKey): string => {
  if (range === 'all') return '';
  const daysBack = range === 'today' ? 0 : Number(range) - 1;
  return IST_DAY.format(new Date(Date.now() - daysBack * DAY_MS));
};

const inr = (value: unknown) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;
const itemsLabel = (order: Order) => `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'}`;
const paymentLine = (order: Order) => `${order.paymentMethod || ''}${order.paymentRef ? ` · ${order.paymentRef}` : ''}`;

const FLAG = 'mt-1.5 w-fit inline-flex items-center px-1.5 py-0.5 border text-[11px] leading-[14px] font-medium whitespace-nowrap';
const FIELD = 'border border-control bg-white text-ink placeholder:text-ink-faint focus:border-ink transition-colors';
// 44px tall on a phone so the status is easy to change with a thumb; compact in the desktop table
const STATUS_SELECT = `h-11 md:h-9 max-w-full pl-2.5 pr-7 text-[13px] font-medium cursor-pointer ${FIELD}`;

export const AdminOrders: React.FC = () => {
  const { orders = [], updateOrderStatus } = useAdmin();
  const { showToast } = useShop();
  const { openAdminOrderDetails, openAdminTab } = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<TabKey>('topack');
  const [range, setRange] = useState<RangeKey>('all');

  const changeStatus = async (order: Order, next: AdminOrderStatus) => {
    if (next === 'Cancelled' && !window.confirm(`Cancel order ${order.orderNumber}? Its stock will be returned to inventory.`)) return;
    try {
      await updateOrderStatus(order.orderNumber, next);
      showToast(`Order ${order.orderNumber} updated to ${next}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the order.', 'error');
    }
  };

  // Every order with its group, newest first
  const grouped = useMemo(
    () => orders
      .map((order) => ({ order, bucket: bucketOf(order) }))
      .sort((a, b) => String(b.order.date).localeCompare(String(a.order.date))),
    [orders],
  );

  const counts = useMemo(() => {
    const out: Record<TabKey, number> = { topack: 0, packed: 0, onway: 0, delivered: 0, returns: 0, cancelled: 0, unpaid: 0, all: 0 };
    grouped.forEach(({ bucket }) => {
      out[bucket] += 1;
      if (bucket !== 'unpaid') out.all += 1;
    });
    return out;
  }, [grouped]);

  const startDay = rangeStart(range);
  const listed = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return grouped
      .filter(({ order, bucket }) => {
        if (tab === 'all' ? bucket === 'unpaid' : bucket !== tab) return false;
        if (startDay) {
          const day = istDay(order.date);
          if (!day || day < startDay) return false;
        }
        if (!needle) return true;
        return String(order.orderNumber || '').toLowerCase().includes(needle)
          || String(order.customerName || '').toLowerCase().includes(needle)
          || String(order.customerEmail || '').toLowerCase().includes(needle)
          || String(order.customerMobile || '').includes(needle);
      })
      .map(({ order }) => order);
  }, [grouped, tab, startDay, searchQuery]);

  const listedTotal = listed.reduce((sum, order) => sum + (Number(order.finalTotal) || 0), 0);
  const cancelRequestCount = orders.filter((order) => order.cancelRequest && !order.cancelRequest.handledAt).length;
  const openReturnCount = orders.filter((order) => isReturnOpen(order)).length;
  const currentTab = TABS.find((t) => t.key === tab) || TABS[0];
  const narrowed = Boolean(searchQuery.trim()) || range !== 'all';

  const renderFlags = (order: Order) => (
    <>
      {order.testPayment && <span className={`${FLAG} border-line text-ink-muted`}>Test payment</span>}
      {order.cancelRequest && !order.cancelRequest.handledAt && (
        <span className={`${FLAG} border-danger-line text-danger`}>Cancel requested</span>
      )}
      {(() => {
        const state = returnStatusOf(order);
        if (!state) return null;
        const kind = returnRequestOf(order)?.type === 'exchange' ? 'Exchange' : 'Return';
        return (
          <span className={`${FLAG} border-line ${isReturnOpen(order) ? 'text-sale' : 'text-ink-muted'}`}>
            {kind}: {RETURN_STATUS_LABEL[state].toLowerCase()}
          </span>
        );
      })()}
    </>
  );

  const codLine = (order: Order) => order.payMode === 'cod' && (
    <span className="block text-xs leading-4 font-medium text-sale sag-num whitespace-nowrap">COD · collect {inr(order.codDue)}</span>
  );

  const statusSelect = (order: Order) => (
    <select
      value={order.status}
      onChange={(e) => changeStatus(order, e.target.value as AdminOrderStatus)}
      className={STATUS_SELECT}
      aria-label={`Order status for ${order.orderNumber}`}
    >
      {/* A saved status outside the list (older orders) still shows as it is */}
      {!ORDER_STATUSES.includes(order.status) && <option value={order.status}>{order.status}</option>}
      {ORDER_STATUSES.map((st) => (
        <option key={st} value={st}>{st}</option>
      ))}
    </select>
  );

  const noticeClass = 'w-full min-h-11 px-3 py-2.5 border border-line bg-white text-sm leading-5 text-ink flex items-center gap-2.5 text-left cursor-pointer hover:bg-sunken transition-colors';

  return (
    <div id="admin-orders-page" className="space-y-4">

      <AdminPageHeader
        eyebrow="Sales"
        title={<>Orders <span className="font-sans text-ink-muted font-normal sag-num">({counts.all})</span></>}
        description="Each order sits in one tab. Change a status here, or open an order to add tracking and message the customer."
      />

      {(cancelRequestCount > 0 || openReturnCount > 0) && (
        <div className="space-y-2">
          {cancelRequestCount > 0 && (
            <button type="button" role="status" onClick={() => openAdminTab('cancellations')} className={noticeClass}>
              <AlertCircle className="w-[18px] h-[18px] shrink-0 text-danger" aria-hidden="true" />
              <span className="flex-1">
                <span className="font-medium text-danger sag-num">{cancelRequestCount} cancellation {cancelRequestCount === 1 ? 'request' : 'requests'} waiting.</span> Open cancellations to cancel or keep each order.
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          )}
          {openReturnCount > 0 && (
            <button type="button" onClick={() => openAdminTab('returns')} className={noticeClass}>
              <RotateCcw className="w-[18px] h-[18px] shrink-0 text-sale" aria-hidden="true" />
              <span className="flex-1">
                <span className="font-medium text-sale sag-num">{openReturnCount} return / exchange {openReturnCount === 1 ? 'request' : 'requests'} open.</span> Open returns to handle them.
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Tabs: one group at a time */}
      <div role="tablist" aria-label="Order groups" className="flex overflow-x-auto sag-scroll-x border-b border-line -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`orders-tab-${t.key}`}
              aria-selected={on}
              aria-controls="orders-list"
              onClick={() => setTab(t.key)}
              className={`shrink-0 h-11 px-3 -mb-px border-b-2 text-sm whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${on ? 'border-ink text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {t.label}
              <span className={`sag-num text-xs ${on ? 'text-ink' : 'text-ink-faint'}`}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {/* Date range and search, both inside the selected tab */}
      <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
        <div role="group" aria-label="Order date (India time)" className="flex shrink-0 overflow-x-auto sag-scroll-x">
          {RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                onClick={() => setRange(r.key)}
                className={`shrink-0 h-11 px-3 -ml-px first:ml-0 border text-[13px] whitespace-nowrap cursor-pointer transition-colors ${on ? 'relative border-ink bg-sunken text-ink font-medium' : 'border-line bg-white text-ink-muted hover:text-ink'}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            inputMode="search"
            aria-label="Search orders"
            placeholder="Order ID, name, email or mobile"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full h-11 pl-10 pr-3 text-base sm:text-sm ${FIELD}`}
          />
          <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      <p className="text-[13px] leading-[18px] text-ink-muted sag-num" aria-live="polite">
        <span className="font-medium text-ink">{listed.length} {listed.length === 1 ? 'order' : 'orders'}</span>
        {' · '}
        <span className="font-medium text-ink">{inr(listedTotal)}</span> {SALES_TABS.includes(tab) ? 'sales' : 'value'}
        {tab === 'unpaid' && ' · checkouts where the payment was never completed'}
      </p>

      <div id="orders-list" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
        {listed.length === 0 ? (
          <div className="border border-line bg-white px-5 py-10 text-center">
            <p className="text-base font-medium text-ink">{counts[tab] === 0 || !narrowed ? currentTab.empty : `No orders match in "${currentTab.label}"`}</p>
            {counts[tab] > 0 && narrowed && (
              <>
                <p className="text-sm leading-5 text-ink-muted mt-0.5">Try another date range or search.</p>
                <button type="button" onClick={() => { setSearchQuery(''); setRange('all'); }} className="mt-4 sag-btn-outline">
                  Clear date and search
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Phone: compact rows */}
            <ul className="md:hidden border-y border-line divide-y divide-line bg-white -mx-4 sm:mx-0 sm:border-x">
              {listed.map((order) => (
                <li
                  key={order.orderNumber}
                  className="px-4 py-3 cursor-pointer active:bg-sunken"
                  onClick={() => openAdminOrderDetails(order.orderNumber)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-5 font-medium text-ink sag-num truncate">{order.orderNumber}</p>
                      <p className="text-xs leading-4 text-ink-muted truncate">{formatOrderDate(order.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] leading-5 font-medium text-ink sag-num">{inr(order.finalTotal)}</p>
                      {codLine(order)}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-[18px] text-ink truncate">
                    {order.customerName} <span className="text-ink-muted">· {itemsLabel(order)}</span>
                  </p>
                  <p className="text-xs leading-4 text-ink-muted truncate">+91 {order.customerMobile}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {statusSelect(order)}
                    <PaymentBadge order={order} />
                    <button
                      type="button"
                      onClick={() => openAdminOrderDetails(order.orderNumber)}
                      className="ml-auto h-11 pl-2 text-[13px] font-medium text-ink underline underline-offset-[3px] inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      Open <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-2">{renderFlags(order)}</div>
                </li>
              ))}
            </ul>

            {/* Tablet / desktop: table */}
            <div className="hidden md:block border border-line bg-white">
              <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-xs text-ink-muted [&>th]:font-medium [&>th]:border-b [&>th]:border-line">
                      <th className="py-2.5 pl-4 pr-3">Order</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Items</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Payment</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 pl-3 pr-4 text-right"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {listed.map((order) => (
                      <tr
                        key={order.orderNumber}
                        className="hover:bg-sunken transition-colors cursor-pointer align-top"
                        onClick={() => openAdminOrderDetails(order.orderNumber)}
                      >
                        <td className="py-3 pl-4 pr-3 font-medium text-ink sag-num whitespace-nowrap">
                          <span className="underline underline-offset-[3px]">{order.orderNumber}</span>
                        </td>
                        <td className="py-3 px-3 text-ink-muted whitespace-nowrap">{formatOrderDate(order.date)}</td>
                        <td className="py-3 px-3 max-w-[220px]">
                          <p className="font-medium text-ink truncate">{order.customerName}</p>
                          <p className="text-xs text-ink-muted truncate">{order.customerEmail}</p>
                          <p className="text-xs text-ink-muted">+91 {order.customerMobile}</p>
                        </td>
                        <td className="py-3 px-3 text-ink-muted sag-num whitespace-nowrap">{itemsLabel(order)}</td>
                        <td className="py-3 px-3 text-right text-sm font-medium text-ink sag-num whitespace-nowrap">
                          {inr(order.finalTotal)}
                          {codLine(order)}
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <PaymentBadge order={order} />
                          <span className="block text-[11px] text-ink-muted mt-1.5 break-all">{paymentLine(order)}</span>
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          {statusSelect(order)}
                          <span className="flex flex-col">{renderFlags(order)}</span>
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openAdminOrderDetails(order.orderNumber)}
                            className="h-9 px-3 border border-control bg-white text-[13px] font-medium text-ink hover:bg-sunken cursor-pointer transition-colors"
                            title="View full order details"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
};
