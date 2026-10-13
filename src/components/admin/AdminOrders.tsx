import React, { useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useCancelReason } from './orderMoney';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { AlertCircle, ChevronRight, RotateCcw, Search, ShoppingBag } from 'lucide-react';
import { Order, AdminOrderStatus } from '../../types';
import { RETURN_STATUS_LABEL, isReturnOpen, returnRequestOf, returnStatusOf } from '../OrderProgress';
import { EmptyState, KeyNumbers, PageTitle, PaymentBadge, Pill, adminUi, orderStatusPillTone } from './PaymentBadge';
import { formatOrderDate } from '../../utils/orderDate';

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
/** The first style in the order, and how many more there are. */
const itemsLine = (order: Order) => {
  const first = order.items[0]?.product?.name || '';
  if (!first) return '';
  return order.items.length > 1 ? `${first} + ${order.items.length - 1} more` : first;
};
/** The India day the order was marked delivered ('' when the order's history does not say). */
const deliveredDay = (order: Order): string => {
  const entry = (order.timeline || []).filter((step) => step.status === 'Delivered').slice(-1)[0];
  return entry ? istDay(entry.at) : '';
};

/** The one thing to do next with an order: a status to set with one tap, or a place to go. */
type NextStep = { label: string; to?: AdminOrderStatus; go?: 'order' | 'returns' | 'cancellations' };
const nextStepOf = (order: Order, bucket: Bucket): NextStep | null => {
  if (order.cancelRequest && !order.cancelRequest.handledAt) return { label: 'Answer cancel request', go: 'cancellations' };
  if (isReturnOpen(order)) return { label: 'Handle return', go: 'returns' };
  if (bucket === 'topack') return { label: 'Mark packed', to: 'Packed' };
  if (bucket === 'packed') return { label: 'Add tracking', go: 'order' };
  if (bucket === 'onway') return { label: 'Mark delivered', to: 'Delivered' };
  return null;
};

// The status is a pill you can change: 44px tall on a phone so it is easy to tap, compact in the desktop table
const STATUS_SELECT = 'h-11 md:h-9 max-w-full pl-3 pr-7 rounded-full border text-[13px] leading-5 font-medium cursor-pointer transition-colors';
const STATUS_SELECT_TONE = {
  good: 'border-ok-line bg-ok-tint text-ok',
  plain: 'border-control bg-sunken text-ink',
  muted: 'border-line bg-sunken text-ink-muted',
  danger: 'border-danger-line bg-danger-tint text-danger',
};

export const AdminOrders: React.FC = () => {
  const { orders = [], updateOrderStatus } = useAdmin();
  const { showToast } = useShop();
  const { openAdminOrderDetails, openAdminTab } = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<TabKey>('topack');
  const [range, setRange] = useState<RangeKey>('all');

  const cancelReason = useCancelReason();
  const changeStatus = async (order: Order, next: AdminOrderStatus) => {
    // Cancelling always asks why first (orderMoney.tsx); backing out changes nothing
    const reason = next === 'Cancelled' ? await cancelReason.ask(order) : '';
    if (reason === null) return;
    try {
      await updateOrderStatus(order.orderNumber, next, undefined, undefined, reason ? { cancelReason: reason } : undefined);
      showToast(`Order ${order.orderNumber} updated to ${next}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the order.', 'error');
    }
  };

  // The ink button in each row. A one-tap status change asks first, so a slip of the thumb changes nothing.
  const runNextStep = (order: Order, step: NextStep) => {
    if (step.go === 'returns') { openAdminTab('returns'); return; }
    if (step.go === 'cancellations') { openAdminTab('cancellations'); return; }
    if (step.go === 'order' || !step.to) { openAdminOrderDetails(order.orderNumber); return; }
    if (!window.confirm(`Mark order ${order.orderNumber} as ${step.to}?`)) return;
    void changeStatus(order, step.to);
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

  // The key numbers: all from the live orders list, sandbox test payments left out of the cash figure
  const keyNumbers = useMemo(() => {
    const weekStart = rangeStart('7');
    let deliveredWeek = 0;
    let cash = 0;
    let cashOrders = 0;
    grouped.forEach(({ order, bucket }) => {
      if (bucket === 'delivered' && deliveredDay(order) >= weekStart && deliveredDay(order)) deliveredWeek += 1;
      if (order.payMode === 'cod' && !order.testPayment && (bucket === 'topack' || bucket === 'packed' || bucket === 'onway')) {
        cash += Number(order.codDue) || 0;
        cashOrders += 1;
      }
    });
    return { deliveredWeek, cash, cashOrders };
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
      {order.testPayment && <Pill tone="muted">Test payment</Pill>}
      {order.cancelRequest && !order.cancelRequest.handledAt && <Pill tone="danger">Cancel requested</Pill>}
      {(() => {
        const state = returnStatusOf(order);
        if (!state) return null;
        const kind = returnRequestOf(order)?.type === 'exchange' ? 'Exchange' : 'Return';
        return <Pill tone={isReturnOpen(order) ? 'good' : 'muted'}>{kind}: {RETURN_STATUS_LABEL[state].toLowerCase()}</Pill>;
      })()}
    </>
  );

  /** What was paid and how: the payment pill, then the cash still to collect or the payment method. */
  const paymentCell = (order: Order, withRef: boolean) => (
    <>
      <PaymentBadge order={order} />
      {order.payMode === 'cod' && (
        <span className="block mt-1.5 text-[13px] leading-[18px] font-medium text-sale sag-num whitespace-nowrap">COD · collect {inr(order.codDue)}</span>
      )}
      {withRef && paymentLine(order) && <span className="block mt-1 text-xs leading-4 text-ink-muted break-all">{paymentLine(order)}</span>}
    </>
  );

  const statusSelect = (order: Order) => (
    <select
      value={order.status}
      onChange={(e) => changeStatus(order, e.target.value as AdminOrderStatus)}
      className={`${STATUS_SELECT} ${STATUS_SELECT_TONE[orderStatusPillTone(String(order.status))]}`}
      aria-label={`Order status for ${order.orderNumber}`}
      title="Change the status"
    >
      {/* A saved status outside the list (older orders) still shows as it is */}
      {!ORDER_STATUSES.includes(order.status) && <option value={order.status}>{order.status}</option>}
      {ORDER_STATUSES.map((st) => (
        <option key={st} value={st}>{st}</option>
      ))}
    </select>
  );

  const actionButtons = (order: Order, wide: boolean) => {
    const step = nextStepOf(order, bucketOf(order));
    return (
      <>
        {step && (
          <button type="button" onClick={() => runNextStep(order, step)} className={`${adminUi.primarySmall} ${wide ? 'flex-1' : ''}`}>
            {step.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => openAdminOrderDetails(order.orderNumber)}
          className={`${adminUi.outlineSmall} ${wide && !step ? 'flex-1' : ''}`}
          title="View full order details"
        >
          {wide ? 'Open' : 'View'} <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </>
    );
  };

  const noticeClass = 'sag-card w-full min-h-12 px-4 py-3 text-sm leading-5 text-ink flex items-center gap-3 text-left cursor-pointer transition-colors hover:bg-sunken-deep';

  return (
    <div id="admin-orders-page" className="space-y-5">

      <PageTitle
        title={<>Orders <span className="font-sans text-ink-muted font-normal text-lg sag-num">({counts.all})</span></>}
        line="Every order sits in one tab, from “To pack” to “Delivered”. Tap the black button to move an order one step on, or open it to add tracking and message the customer."
      />

      <KeyNumbers
        label="Orders at a glance"
        items={[
          { label: 'To pack now', value: counts.topack, highlight: counts.topack > 0, note: counts.packed > 0 ? `${counts.packed} packed, waiting for the courier` : 'Paid orders waiting for you' },
          { label: 'On the way', value: counts.onway, note: 'With the courier' },
          { label: 'Delivered this week', value: keyNumbers.deliveredWeek, note: 'Marked delivered in the last 7 days' },
          { label: 'Cash to collect', value: inr(keyNumbers.cash), note: keyNumbers.cashOrders > 0 ? `From ${keyNumbers.cashOrders} cash-on-delivery ${keyNumbers.cashOrders === 1 ? 'order' : 'orders'} not delivered yet` : 'No cash-on-delivery orders on the way' },
        ]}
      />

      {(cancelRequestCount > 0 || openReturnCount > 0) && (
        <div className="space-y-2">
          {cancelRequestCount > 0 && (
            <button type="button" role="status" onClick={() => openAdminTab('cancellations')} className={`${noticeClass} border-danger-line`}>
              <AlertCircle className="w-[18px] h-[18px] shrink-0 text-danger" aria-hidden="true" />
              <span className="flex-1">
                <span className="font-medium text-danger sag-num">{cancelRequestCount} cancellation {cancelRequestCount === 1 ? 'request' : 'requests'} waiting.</span> Open cancellations to cancel or keep each order.
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          )}
          {openReturnCount > 0 && (
            <button type="button" onClick={() => openAdminTab('returns')} className={`${noticeClass} border-brand-line`}>
              <RotateCcw className="w-[18px] h-[18px] shrink-0 text-sale" aria-hidden="true" />
              <span className="flex-1">
                <span className="font-medium text-sale sag-num">{openReturnCount} return / exchange {openReturnCount === 1 ? 'request' : 'requests'} open.</span> Open returns to handle them.
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Tabs, date range and search in one panel */}
      <div className="sag-glass px-3 sm:px-4 pt-3 pb-3.5 space-y-3">
        <div role="tablist" aria-label="Order groups" className="flex gap-1 overflow-x-auto sag-scroll-x pb-3 border-b border-line">
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
                className={`shrink-0 h-11 pl-4 pr-2.5 rounded-full text-sm whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors ${on ? 'bg-brand font-bold' : 'text-ink-muted font-medium hover:bg-sunken hover:text-ink'}`}
              >
                {t.label}
                <span className={`sag-num min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-xs font-semibold ${on ? 'bg-page text-[color:var(--aura-ink)]' : 'bg-sunken text-ink-muted'}`}>{counts[t.key]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
          <div role="group" aria-label="Order date (India time)" className="flex gap-2 shrink-0 overflow-x-auto sag-scroll-x">
            {RANGES.map((r) => {
              const on = r.key === range;
              return (
                <button key={r.key} type="button" aria-pressed={on} onClick={() => setRange(r.key)} className={adminUi.chip}>
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
              className={adminUi.search}
            />
            <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          </div>
        </div>

        <p className="text-[13px] leading-[18px] text-ink-muted sag-num px-1" aria-live="polite">
          Showing <span className="font-medium text-ink">{listed.length} {listed.length === 1 ? 'order' : 'orders'}</span>
          {' · '}
          <span className="font-medium text-ink">{inr(listedTotal)}</span> {SALES_TABS.includes(tab) ? 'sales' : 'value'}
          {tab === 'unpaid' && ' · checkouts where the payment was never completed'}
        </p>
      </div>

      <div id="orders-list" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
        {listed.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag />}
            title={counts[tab] === 0 || !narrowed ? currentTab.empty : `No orders match in "${currentTab.label}"`}
            line={counts[tab] > 0 && narrowed ? 'Try another date range or search.' : undefined}
          >
            {counts[tab] > 0 && narrowed && (
              <button type="button" onClick={() => { setSearchQuery(''); setRange('all'); }} className={adminUi.outline}>
                Clear date and search
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Phone: one card per order */}
            <ul className="md:hidden space-y-2.5">
              {listed.map((order) => (
                <li
                  key={order.orderNumber}
                  className="sag-card p-3.5 cursor-pointer"
                  onClick={() => openAdminOrderDetails(order.orderNumber)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] leading-5 font-semibold text-ink sag-num truncate">{order.orderNumber}</p>
                      <p className="text-xs leading-4 text-ink-muted truncate">{formatOrderDate(order.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg leading-6 font-semibold text-ink sag-num">{inr(order.finalTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-line">
                    <p className="text-sm leading-5 font-medium text-ink truncate">{order.customerName}</p>
                    <p className="text-xs leading-4 text-ink-muted truncate">+91 {order.customerMobile}</p>
                    <p className="mt-1 text-[13px] leading-[18px] text-ink-muted truncate">
                      <span className="text-ink sag-num">{itemsLabel(order)}</span>{itemsLine(order) ? ` · ${itemsLine(order)}` : ''}
                    </p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5" onClick={(e) => e.stopPropagation()}>
                    {statusSelect(order)}
                    <span>{paymentCell(order, false)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden">{renderFlags(order)}</div>
                  <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {actionButtons(order, true)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet / desktop: table */}
            <div className={`hidden md:block ${adminUi.panelFlush}`}>
              <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
                <table className="w-full text-left text-[13px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={`${adminUi.th} pl-5`}>Order</th>
                      <th className={adminUi.th}>Customer</th>
                      <th className={adminUi.th}>Items</th>
                      <th className={`${adminUi.th} text-right`}>Amount</th>
                      <th className={adminUi.th}>Payment</th>
                      <th className={adminUi.th}>Status</th>
                      <th className={`${adminUi.th} pr-5 text-right`}>Next step</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td]:border-b [&>tr>td]:border-line [&>tr:last-child>td]:border-b-0">
                    {listed.map((order) => (
                      <tr
                        key={order.orderNumber}
                        className={`${adminUi.row} cursor-pointer`}
                        onClick={() => openAdminOrderDetails(order.orderNumber)}
                      >
                        <td className={`${adminUi.td} pl-5 whitespace-nowrap`}>
                          <span className="block text-sm font-semibold text-ink sag-num underline underline-offset-[3px] decoration-line">{order.orderNumber}</span>
                          <span className="block mt-0.5 text-xs text-ink-muted">{formatOrderDate(order.date)}</span>
                        </td>
                        <td className={`${adminUi.td} max-w-[220px]`}>
                          <p className="text-sm font-medium text-ink truncate">{order.customerName}</p>
                          <p className="text-xs text-ink-muted">+91 {order.customerMobile}</p>
                          <p className="text-xs text-ink-muted truncate">{order.customerEmail}</p>
                        </td>
                        <td className={`${adminUi.td} max-w-[200px]`}>
                          <p className="text-ink sag-num whitespace-nowrap">{itemsLabel(order)}</p>
                          {itemsLine(order) && <p className="text-xs text-ink-muted truncate">{itemsLine(order)}</p>}
                        </td>
                        <td className={`${adminUi.td} text-right text-[15px] font-semibold text-ink sag-num whitespace-nowrap`}>
                          {inr(order.finalTotal)}
                        </td>
                        <td className={adminUi.td} onClick={(e) => e.stopPropagation()}>
                          {paymentCell(order, true)}
                        </td>
                        <td className={adminUi.td} onClick={(e) => e.stopPropagation()}>
                          {statusSelect(order)}
                          <span className="mt-1.5 flex flex-col items-start gap-1 empty:hidden">{renderFlags(order)}</span>
                        </td>
                        <td className={`${adminUi.td} pr-5`} onClick={(e) => e.stopPropagation()}>
                          <span className="flex flex-wrap justify-end gap-2">{actionButtons(order, false)}</span>
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

      {cancelReason.dialog}
    </div>
  );
};
