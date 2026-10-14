import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { refundsToDo, useCancelReason } from './orderMoney';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { AlertCircle, Bookmark, ChevronRight, Columns3, List, RotateCcw, Search, ShoppingBag, SlidersHorizontal, X } from 'lucide-react';
import { Order, AdminOrderStatus } from '../../types';
import { RETURN_STATUS_LABEL, isReturnOpen, returnRequestOf, returnStatusOf } from '../OrderProgress';
import { EmptyState, KeyNumbers, PageTitle, PaymentBadge, Pill, adminUi, orderStatusPillTone } from './PaymentBadge';
import { formatOrderDate } from '../../utils/orderDate';
import { Bucket, ageOf, bucketOf, buildCustomerIndex, cancelWaiting, codConfirmation, daysSince, inr, istDay, istDayBack, needsCodCheck, orderFacts, otherOrdersOf } from './orderOps';
import { OrdersBulkBar } from './OrdersBulk';

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

type RangeKey = 'today' | '7' | '30' | 'all' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Pick dates' },
];
/** First India day of a range ('' for all time). "Last 7 days" is today and the six days before it. */
const rangeStart = (range: RangeKey): string => {
  if (range === 'all' || range === 'custom') return '';
  return istDayBack(range === 'today' ? 0 : Number(range) - 1);
};

/** Everything the list can be narrowed by. A quick view is a saved copy of these. */
interface Filters {
  tab: TabKey;
  range: RangeKey;
  from: string;
  to: string;
  pay: 'any' | 'prepaid' | 'cod';
  place: string;
  coupon: string;
  min: string;
  max: string;
  /** Cash-on-delivery orders not shipped yet and not confirmed with the customer. */
  codCheck: boolean;
  /** Placed more than two days ago (for "waiting too long"). */
  waiting: boolean;
}
const BLANK: Filters = { tab: 'topack', range: 'all', from: '', to: '', pay: 'any', place: '', coupon: '', min: '', max: '', codCheck: false, waiting: false };

interface QuickView { id: string; name: string; filters: Filters; builtIn?: boolean }
const BUILT_IN_VIEWS: QuickView[] = [
  { id: 'cod-check', name: 'COD to confirm', filters: { ...BLANK, tab: 'all', codCheck: true }, builtIn: true },
  { id: 'late', name: 'Waiting over 2 days', filters: { ...BLANK, tab: 'topack', waiting: true }, builtIn: true },
  { id: 'today', name: 'Placed today', filters: { ...BLANK, tab: 'all', range: 'today' }, builtIn: true },
];
const VIEWS_KEY = 'sag_admin_order_views_v1';
const MODE_KEY = 'sag_admin_orders_mode_v1';
const readViews = (): QuickView[] => {
  try {
    const list = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((v) => v && typeof v.name === 'string' && v.filters).map((v) => ({ id: String(v.id), name: String(v.name).slice(0, 30), filters: { ...BLANK, ...v.filters } })) : [];
  } catch { return []; }
};
const writeViews = (views: QuickView[]) => { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* this device keeps nothing */ } };
const readMode = (): 'list' | 'board' => { try { return localStorage.getItem(MODE_KEY) === 'board' ? 'board' : 'list'; } catch { return 'list'; } };
const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);

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
const nextStepOf = (order: Order, bucket: Bucket, refundDue: boolean): NextStep | null => {
  if (cancelWaiting(order)) return { label: 'Answer cancel request', go: 'cancellations' };
  if (isReturnOpen(order)) return { label: 'Handle return', go: 'returns' };
  if (refundDue) return { label: 'Refund to do', go: 'cancellations' };
  if (bucket === 'topack') return { label: 'Mark packed', to: 'Packed' };
  if (bucket === 'packed') return { label: 'Add tracking', go: 'order' };
  if (bucket === 'onway') return { label: 'Mark delivered', to: 'Delivered' };
  return null;
};

// The board: the day's work as columns, each card one tap from its next step
type ColumnKey = 'topack' | 'packed' | 'onway' | 'delivered' | 'issues';
const COLUMNS: { key: ColumnKey; label: string; hint: string; tab: TabKey }[] = [
  { key: 'issues', label: 'Needs a decision', hint: 'Cancel requests, returns, refunds', tab: 'all' },
  { key: 'topack', label: 'To pack', hint: 'Paid, waiting for you', tab: 'topack' },
  { key: 'packed', label: 'Packed', hint: 'Waiting for the courier', tab: 'packed' },
  { key: 'onway', label: 'On the way', hint: 'With the courier', tab: 'onway' },
  { key: 'delivered', label: 'Delivered', hint: 'In the last 7 days', tab: 'delivered' },
];
const BOARD_LIMIT = 40;

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
  const [filters, setFilters] = useState<Filters>(BLANK);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'board'>(readMode);
  const [views, setViews] = useState<QuickView[]>(readViews);
  const [viewName, setViewName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const { tab, range } = filters;
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const setTab = (next: TabKey) => set({ tab: next });
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* nothing kept */ } }, [mode]);

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
  const customerIndex = useMemo(() => buildCustomerIndex(orders), [orders]);
  const refundDue = useMemo(() => new Set(refundsToDo(orders).map((o) => o.orderNumber)), [orders]);
  const couponCodes = useMemo(() => [...new Set(orders.map((o) => String(o.couponCode || '').trim().toUpperCase()).filter(Boolean))].sort(), [orders]);

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
    let codToCheck = 0;
    grouped.forEach(({ order, bucket }) => {
      if (bucket === 'delivered' && deliveredDay(order) >= weekStart && deliveredDay(order)) deliveredWeek += 1;
      if (order.payMode === 'cod' && !order.testPayment && (bucket === 'topack' || bucket === 'packed' || bucket === 'onway')) {
        cash += Number(order.codDue) || 0;
        cashOrders += 1;
      }
      if (needsCodCheck(order)) codToCheck += 1;
    });
    return { deliveredWeek, cash, cashOrders, codToCheck };
  }, [grouped]);

  // Every filter except the tab: the list adds the tab, the board splits into columns instead
  const startDay = range === 'custom' ? filters.from : rangeStart(range);
  const endDay = range === 'custom' ? filters.to : '';
  const narrowed = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const place = filters.place.trim().toLowerCase();
    const min = Number(filters.min) || 0;
    const max = Number(filters.max) || 0;
    return grouped.filter(({ order }) => {
      if (startDay || endDay) {
        const day = istDay(order.date);
        if (!day || (startDay && day < startDay) || (endDay && day > endDay)) return false;
      }
      if (filters.pay === 'cod' && order.payMode !== 'cod') return false;
      if (filters.pay === 'prepaid' && order.payMode === 'cod') return false;
      if (place) {
        const a = order.deliveryAddress || ({} as Order['deliveryAddress']);
        if (![a.city, a.pincode, a.state, a.district].some((v) => String(v || '').toLowerCase().includes(place))) return false;
      }
      if (filters.coupon === '-' && order.couponCode) return false;
      if (filters.coupon === '*' && !order.couponCode) return false;
      if (filters.coupon && filters.coupon !== '-' && filters.coupon !== '*' && String(order.couponCode || '').toUpperCase() !== filters.coupon) return false;
      const total = Number(order.finalTotal) || 0;
      if (min && total < min) return false;
      if (max && total > max) return false;
      if (filters.codCheck && !needsCodCheck(order)) return false;
      if (filters.waiting && daysSince(order.date) < 2) return false;
      if (!needle) return true;
      const a = order.deliveryAddress || ({} as Order['deliveryAddress']);
      return [order.orderNumber, order.customerName, order.customerEmail, order.couponCode, order.trackingNumber, a.city, a.pincode]
        .some((v) => String(v || '').toLowerCase().includes(needle))
        || String(order.customerMobile || '').includes(needle)
        || (order.items || []).some((item) => String(item.product?.name || '').toLowerCase().includes(needle));
    });
  }, [grouped, startDay, endDay, filters, searchQuery]);

  const listed = useMemo(
    () => narrowed.filter(({ bucket }) => (tab === 'all' ? bucket !== 'unpaid' : bucket === tab)).map(({ order }) => order),
    [narrowed, tab],
  );

  const board = useMemo(() => {
    const out: Record<ColumnKey, Order[]> = { issues: [], topack: [], packed: [], onway: [], delivered: [] };
    const weekStart = rangeStart('7');
    narrowed.forEach(({ order, bucket }) => {
      if (cancelWaiting(order) || isReturnOpen(order) || refundDue.has(order.orderNumber)) out.issues.push(order);
      else if (bucket === 'topack' || bucket === 'packed' || bucket === 'onway') out[bucket].push(order);
      else if (bucket === 'delivered' && deliveredDay(order) >= weekStart) out.delivered.push(order);
    });
    // Oldest first where waiting matters: the order that has waited longest is on top
    out.topack.reverse();
    out.packed.reverse();
    return out;
  }, [narrowed, refundDue]);

  const listedTotal = listed.reduce((sum, order) => sum + (Number(order.finalTotal) || 0), 0);
  const cancelRequestCount = orders.filter((order) => cancelWaiting(order)).length;
  const openReturnCount = orders.filter((order) => isReturnOpen(order)).length;
  const currentTab = TABS.find((t) => t.key === tab) || TABS[0];
  const extraFilters = [filters.pay !== 'any', Boolean(filters.place.trim()), Boolean(filters.coupon), Boolean(filters.min), Boolean(filters.max), filters.codCheck, filters.waiting].filter(Boolean).length;
  const isNarrowed = Boolean(searchQuery.trim()) || range !== 'all' || extraFilters > 0;
  const allViews = [...BUILT_IN_VIEWS, ...views];
  const activeView = allViews.find((v) => sameFilters(v.filters, filters));

  const clearFilters = () => { setSearchQuery(''); setFilters((f) => ({ ...BLANK, tab: f.tab })); };
  const saveView = () => {
    const name = viewName.trim().slice(0, 30);
    if (!name) { showToast('Give the view a short name first.', 'error'); return; }
    const next = [...views.filter((v) => v.name.toLowerCase() !== name.toLowerCase()), { id: `v${Date.now().toString(36)}`, name, filters }];
    setViews(next); writeViews(next); setViewName('');
    showToast(`Saved "${name}" as a quick view on this device.`, 'success');
  };
  const removeView = (id: string) => { const next = views.filter((v) => v.id !== id); setViews(next); writeViews(next); };

  // Selection for the bulk actions
  const selectedOrders = useMemo(() => orders.filter((o) => selected.has(o.orderNumber)), [orders, selected]);
  const toggle = (orderNumber: string) => setSelected((s) => { const n = new Set(s); if (n.has(orderNumber)) n.delete(orderNumber); else n.add(orderNumber); return n; });
  const allListedSelected = listed.length > 0 && listed.every((o) => selected.has(o.orderNumber));
  const toggleAllListed = () => setSelected((s) => {
    const n = new Set(s);
    if (allListedSelected) listed.forEach((o) => n.delete(o.orderNumber)); else listed.forEach((o) => n.add(o.orderNumber));
    return n;
  });
  const unselect = (numbers: string[]) => setSelected((s) => { const n = new Set(s); numbers.forEach((x) => n.delete(x)); return n; });

  const selectBox = (order: Order, extra = '') => (
    <input type="checkbox" checked={selected.has(order.orderNumber)} onChange={() => toggle(order.orderNumber)} onClick={(e) => e.stopPropagation()}
      aria-label={`Select order ${order.orderNumber}`} className={`${adminUi.check} cursor-pointer ${extra}`} />
  );

  const renderFlags = (order: Order) => (
    <>
      {order.testPayment && <Pill tone="muted">Test payment</Pill>}
      {cancelWaiting(order) && <Pill tone="danger">Cancel requested</Pill>}
      {refundDue.has(order.orderNumber) && <Pill tone="danger">Refund to do</Pill>}
      {(() => {
        const state = returnStatusOf(order);
        if (!state) return null;
        const kind = returnRequestOf(order)?.type === 'exchange' ? 'Exchange' : 'Return';
        return <Pill tone={isReturnOpen(order) ? 'good' : 'muted'}>{kind}: {RETURN_STATUS_LABEL[state].toLowerCase()}</Pill>;
      })()}
      {needsCodCheck(order) && <Pill tone="danger" dot>COD not confirmed</Pill>}
      {order.payMode === 'cod' && codConfirmation(order) && ['topack', 'packed'].includes(bucketOf(order)) && <Pill tone="good" dot>COD confirmed</Pill>}
    </>
  );

  /** Facts worth a glance before packing: problems always, "First order" only on cash on delivery. */
  const renderFacts = (order: Order) => {
    const bucket = bucketOf(order);
    if (bucket === 'unpaid' || bucket === 'cancelled') return null;
    const facts = orderFacts(order, otherOrdersOf(order, customerIndex))
      .filter((f) => f.tone === 'danger' || (f.key === 'first' && order.payMode === 'cod') || f.key === 'delivered');
    return facts.map((f) => <Pill key={f.key} tone={f.tone}>{f.label}</Pill>);
  };

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
    const step = nextStepOf(order, bucketOf(order), refundDue.has(order.orderNumber));
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
  const segBtn = (on: boolean) => `h-9 px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${on ? 'bg-brand text-[color:var(--sag-on-gold)]' : 'text-ink-muted hover:text-ink'}`;

  const boardCard = (order: Order) => {
    const step = nextStepOf(order, bucketOf(order), refundDue.has(order.orderNumber));
    const a = order.deliveryAddress;
    return (
      <li key={order.orderNumber} className={`sag-card p-3 cursor-pointer transition-shadow hover:shadow-[var(--sag-shadow-pop)] ${selected.has(order.orderNumber) ? 'ring-2 ring-brand' : ''}`} onClick={() => openAdminOrderDetails(order.orderNumber)}>
        <div className="flex items-start gap-2.5">
          {selectBox(order, 'mt-0.5')}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm leading-5 font-semibold text-ink sag-num truncate">{order.orderNumber}</p>
              <p className="text-[15px] leading-5 font-bold text-ink sag-num shrink-0">{inr(order.finalTotal)}</p>
            </div>
            <p className="text-[13px] leading-[18px] text-ink truncate">{order.customerName}{a?.city ? <span className="text-ink-muted"> · {a.city}</span> : null}</p>
            <p className="text-xs leading-4 text-ink-muted sag-num">{ageOf(order.date)}{order.payMode === 'cod' ? ` · COD, collect ${inr(order.codDue)}` : ' · prepaid'}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden">{renderFlags(order)}{renderFacts(order)}</div>
        {step && (
          <button type="button" onClick={(e) => { e.stopPropagation(); runNextStep(order, step); }} className={`${adminUi.primarySmall} mt-2.5 w-full !h-10`}>
            {step.label}
          </button>
        )}
      </li>
    );
  };

  return (
    <div id="admin-orders-page" className="space-y-5">

      <PageTitle
        title={<>Orders <span className="font-sans text-ink-muted font-normal text-lg sag-num">({counts.all})</span></>}
        line="Every order sits in one group, from “To pack” to “Delivered”. Tap the black button to move an order one step on, tick several to pack, ship, print or message them together, or open one to add tracking."
      />

      <KeyNumbers
        label="Orders at a glance"
        items={[
          { label: 'To pack now', value: counts.topack, highlight: counts.topack > 0, note: counts.packed > 0 ? `${counts.packed} packed, waiting for the courier` : 'Paid orders waiting for you' },
          { label: 'COD to confirm', value: keyNumbers.codToCheck, highlight: keyNumbers.codToCheck > 0, note: keyNumbers.codToCheck > 0 ? 'Call or WhatsApp before shipping' : 'Every COD order is confirmed' },
          { label: 'On the way', value: counts.onway, note: `${keyNumbers.deliveredWeek} delivered in the last 7 days` },
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

      {/* List or board, and the quick views */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
        <div role="group" aria-label="How to show the orders" className="shrink-0 self-start inline-flex p-1 rounded-full bg-surface">
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={segBtn(mode === 'list')}><List className="w-4 h-4" aria-hidden="true" /> List</button>
          <button type="button" id="orders-board-toggle" aria-pressed={mode === 'board'} onClick={() => setMode('board')} className={segBtn(mode === 'board')}><Columns3 className="w-4 h-4" aria-hidden="true" /> Board</button>
        </div>
        <div role="group" aria-label="Quick views" className="flex gap-2 overflow-x-auto sag-scroll-x min-w-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          {allViews.map((v) => (
            <span key={v.id} className="shrink-0 inline-flex items-center">
              <button type="button" aria-pressed={activeView?.id === v.id} onClick={() => setFilters(v.filters)} className={adminUi.chip}>
                <Bookmark className="w-3.5 h-3.5" aria-hidden="true" /> {v.name}
                {v.id === 'cod-check' && keyNumbers.codToCheck > 0 && <span className="sag-num font-normal opacity-70">{keyNumbers.codToCheck}</span>}
              </button>
              {!v.builtIn && (
                <button type="button" onClick={() => removeView(v.id)} className="w-8 h-8 -ml-1 rounded-full inline-flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer" aria-label={`Remove quick view ${v.name}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs, date range, search and the other filters in one panel */}
      <div className="sag-glass px-3 sm:px-4 pt-3 pb-3.5 space-y-3">
        {mode === 'list' && (
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
        )}

        <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
          <div role="group" aria-label="Order date (India time)" className="flex gap-2 shrink-0 overflow-x-auto sag-scroll-x">
            {RANGES.map((r) => {
              const on = r.key === range;
              return (
                <button key={r.key} type="button" aria-pressed={on} onClick={() => set({ range: r.key, ...(r.key === 'custom' && !filters.from ? { from: istDayBack(6), to: istDayBack(0) } : {}) })} className={adminUi.chip}>
                  {r.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                inputMode="search"
                aria-label="Search orders"
                placeholder="Order ID, name, mobile, city, PIN, product…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={adminUi.search}
              />
              <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
            <button type="button" id="orders-more-filters" aria-expanded={moreOpen} aria-controls="orders-filters" onClick={() => setMoreOpen((o) => !o)} className={`${adminUi.outline} px-4 shrink-0`}>
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Filters</span>
              {extraFilters > 0 && <span className="sag-num min-w-5 h-5 px-1 rounded-full bg-brand text-[color:var(--sag-on-gold)] text-[11px] inline-flex items-center justify-center">{extraFilters}</span>}
            </button>
          </div>
        </div>

        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
            <label className="min-w-0"><span className={adminUi.label}>From</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={`${adminUi.field} w-full`} aria-label="Placed from" /></label>
            <label className="min-w-0"><span className={adminUi.label}>To</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={`${adminUi.field} w-full`} aria-label="Placed until" /></label>
          </div>
        )}

        {moreOpen && (
          <div id="orders-filters" className="pt-3 border-t border-line grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in">
            <div className="min-w-0">
              <span className={adminUi.label}>Payment</span>
              <div role="group" aria-label="Payment type" className="flex flex-wrap gap-1.5">
                {([['any', 'Any'], ['prepaid', 'Prepaid'], ['cod', 'Cash on delivery']] as const).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={filters.pay === id} onClick={() => set({ pay: id })} className={`${adminUi.chip} !h-9`}>{label}</button>
                ))}
              </div>
            </div>
            <label className="min-w-0">
              <span className={adminUi.label}>City, state or PIN code</span>
              <input value={filters.place} onChange={(e) => set({ place: e.target.value })} maxLength={40} placeholder="e.g. Jaipur or 302" className={`${adminUi.field} w-full`} />
            </label>
            <label className="min-w-0">
              <span className={adminUi.label}>Coupon</span>
              <select value={filters.coupon} onChange={(e) => set({ coupon: e.target.value })} className={`${adminUi.select} w-full`}>
                <option value="">Any</option>
                <option value="*">Any coupon used</option>
                <option value="-">No coupon</option>
                {couponCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="min-w-0">
              <span className={adminUi.label}>Order total (₹)</span>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" inputMode="numeric" min={0} value={filters.min} onChange={(e) => set({ min: e.target.value })} placeholder="From" aria-label="Order total from" className={`${adminUi.field} w-full`} />
                <input type="number" inputMode="numeric" min={0} value={filters.max} onChange={(e) => set({ max: e.target.value })} placeholder="To" aria-label="Order total up to" className={`${adminUi.field} w-full`} />
              </div>
            </div>
            <label className={`${adminUi.checkRow} sm:col-span-1 lg:col-span-2`}>
              <input type="checkbox" checked={filters.codCheck} onChange={(e) => set({ codCheck: e.target.checked })} className={adminUi.check} />
              Only cash-on-delivery orders not confirmed yet
            </label>
            <label className={`${adminUi.checkRow} sm:col-span-1 lg:col-span-2`}>
              <input type="checkbox" checked={filters.waiting} onChange={(e) => set({ waiting: e.target.checked })} className={adminUi.check} />
              Only orders placed more than 2 days ago
            </label>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 pt-1">
              <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={30} placeholder="Name this view, e.g. Jaipur COD" aria-label="Quick view name" className={`${adminUi.field} flex-1 min-w-0 basis-48`} />
              <button type="button" onClick={saveView} className={adminUi.outline}><Bookmark className="w-4 h-4" aria-hidden="true" /> Save as quick view</button>
              {isNarrowed && <button type="button" onClick={clearFilters} className={`${adminUi.link} min-h-11 px-2 text-sm`}>Clear filters</button>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <p className="text-[13px] leading-[18px] text-ink-muted sag-num" aria-live="polite">
            {mode === 'list' ? (
              <>
                Showing <span className="font-medium text-ink">{listed.length} {listed.length === 1 ? 'order' : 'orders'}</span>
                {' · '}
                <span className="font-medium text-ink">{inr(listedTotal)}</span> {SALES_TABS.includes(tab) ? 'sales' : 'value'}
                {tab === 'unpaid' && ' · checkouts where the payment was never completed'}
              </>
            ) : (
              <>Board: {COLUMNS.map((c) => `${board[c.key].length} ${c.label.toLowerCase()}`).join(' · ')}</>
            )}
          </p>
          {mode === 'list' && listed.length > 0 && (
            <label className="min-h-11 inline-flex items-center gap-2 text-[13px] font-medium text-ink cursor-pointer">
              <input type="checkbox" id="orders-select-all" checked={allListedSelected} onChange={toggleAllListed} className={adminUi.check} />
              Select all {listed.length}
            </label>
          )}
        </div>
      </div>

      {mode === 'board' ? (
        <div id="orders-board" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sag-scroll-x snap-x snap-mandatory lg:snap-none">
          <div className="grid grid-flow-col auto-cols-[minmax(260px,82vw)] sm:auto-cols-[minmax(260px,1fr)] lg:grid-flow-row lg:grid-cols-5 gap-3 items-start pb-2">
            {COLUMNS.map((col) => {
              const list = board[col.key];
              return (
                <section key={col.key} aria-labelledby={`orders-col-${col.key}`} className="snap-start min-w-0 rounded-[22px] bg-sunken/60 p-2.5">
                  <header className="px-1.5 pt-1 pb-2.5">
                    <h3 id={`orders-col-${col.key}`} className="flex items-center justify-between gap-2 text-sm leading-5 font-extrabold text-ink">
                      {col.label}
                      <span className={`sag-num min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-xs font-bold ${list.length && (col.key === 'issues' || col.key === 'topack') ? 'bg-brand text-[color:var(--sag-on-gold)]' : 'bg-surface text-ink-muted'}`}>{list.length}</span>
                    </h3>
                    <p className="text-xs leading-4 text-ink-muted">{col.hint}</p>
                  </header>
                  {list.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[13px] leading-[18px] text-ink-muted">Nothing here</p>
                  ) : (
                    <ul className="space-y-2">{list.slice(0, BOARD_LIMIT).map(boardCard)}</ul>
                  )}
                  {list.length > BOARD_LIMIT && (
                    <button type="button" onClick={() => { setMode('list'); setTab(col.tab); }} className={`${adminUi.link} mt-2 min-h-11 w-full text-sm`}>
                      See all {list.length} in the list
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div id="orders-list" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
          {listed.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag />}
              title={counts[tab] === 0 || !isNarrowed ? currentTab.empty : `No orders match in "${currentTab.label}"`}
              line={counts[tab] > 0 && isNarrowed ? 'Try another date range, search or filter.' : undefined}
            >
              {counts[tab] > 0 && isNarrowed && (
                <button type="button" onClick={clearFilters} className={adminUi.outline}>
                  Clear date, search and filters
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
                    className={`sag-card p-3.5 cursor-pointer ${selected.has(order.orderNumber) ? 'ring-2 ring-brand' : ''}`}
                    onClick={() => openAdminOrderDetails(order.orderNumber)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2.5">
                        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>{selectBox(order)}</span>
                        <div className="min-w-0">
                          <p className="text-[15px] leading-5 font-semibold text-ink sag-num truncate">{order.orderNumber}</p>
                          <p className="text-xs leading-4 text-ink-muted truncate">{formatOrderDate(order.date)} · {ageOf(order.date)}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg leading-6 font-semibold text-ink sag-num">{inr(order.finalTotal)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-line">
                      <p className="text-sm leading-5 font-medium text-ink truncate">{order.customerName}</p>
                      <p className="text-xs leading-4 text-ink-muted truncate">+91 {order.customerMobile}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}</p>
                      <p className="mt-1 text-[13px] leading-[18px] text-ink-muted truncate">
                        <span className="text-ink sag-num">{itemsLabel(order)}</span>{itemsLine(order) ? ` · ${itemsLine(order)}` : ''}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5" onClick={(e) => e.stopPropagation()}>
                      {statusSelect(order)}
                      <span>{paymentCell(order, false)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden">{renderFlags(order)}{renderFacts(order)}</div>
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
                        <th className={`${adminUi.th} pl-5 w-10`}>
                          <input type="checkbox" checked={allListedSelected} onChange={toggleAllListed} aria-label="Select every order shown" className={`${adminUi.check} cursor-pointer`} />
                        </th>
                        <th className={adminUi.th}>Order</th>
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
                          className={`${adminUi.row} cursor-pointer ${selected.has(order.orderNumber) ? 'bg-sunken' : ''}`}
                          onClick={() => openAdminOrderDetails(order.orderNumber)}
                        >
                          <td className={`${adminUi.td} pl-5`} onClick={(e) => e.stopPropagation()}>{selectBox(order)}</td>
                          <td className={`${adminUi.td} whitespace-nowrap`}>
                            <span className="block text-sm font-semibold text-ink sag-num underline underline-offset-[3px] decoration-line">{order.orderNumber}</span>
                            <span className="block mt-0.5 text-xs text-ink-muted">{formatOrderDate(order.date)}</span>
                            <span className="block text-xs text-ink-muted">{ageOf(order.date)}</span>
                          </td>
                          <td className={`${adminUi.td} max-w-[240px]`}>
                            <p className="text-sm font-medium text-ink truncate">{order.customerName}</p>
                            <p className="text-xs text-ink-muted">+91 {order.customerMobile}</p>
                            <p className="text-xs text-ink-muted truncate">{[order.deliveryAddress?.city, order.deliveryAddress?.pincode].filter(Boolean).join(' · ') || order.customerEmail}</p>
                            <span className="mt-1 flex flex-wrap gap-1 empty:hidden">{renderFacts(order)}</span>
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
      )}

      <OrdersBulkBar selected={selectedOrders} onClear={() => setSelected(new Set())} onUnselect={unselect} />

      {cancelReason.dialog}
    </div>
  );
};
