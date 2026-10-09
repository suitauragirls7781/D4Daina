import React, { useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, ExternalLink, Phone, XCircle } from 'lucide-react';
import { PackageIcon, ReturnIcon, TruckIcon, UserIcon } from './StoreIcons';
import { Order, ReturnRequest, ReturnRequestStatus } from '../types';
import { trackingLinkFor, findCourier } from '../utils/courier';
import { getCleanImageUrl } from '../utils/imageHelper';
import { formatDeliveryDate } from '../utils/delivery';

/** A customer's cancellation request as stored on the order (see api/orders.js 'request-cancel'). */
export type CancelRequest = {
  /** Not in a guest lookup (free text that can hold a phone number or address). */
  reason?: string;
  at: string;
  handledAt?: string;
  outcome?: 'cancelled' | 'kept';
  /** Admin only: whether the store's email alert went out (never sent to the customer). */
  storeNotified?: boolean;
};
export type OrderWithRequests = Order & { cancelRequest?: CancelRequest | null };

/**
 * Statuses in which a cancellation can still be asked for / acted on: until the parcel is handed to the
 * courier, so a packed order still counts (same list as CANCELLABLE_STATUSES in api/_lib/orders.js).
 */
export const CANCELLABLE_STATUSES: readonly string[] = ['Pending', 'Processing', 'Packed'];

/** True when the owner's cancellation window (hours after payment; 0 = no limit) has run out for this order. */
const cancelWindowPassed = (order: Order, windowHours = 0) => {
  const paid = new Date(order.paidAt || '').getTime();
  return windowHours > 0 && Number.isFinite(paid) && Date.now() - paid > windowHours * 60 * 60 * 1000;
};

/**
 * Same rule as the server (api/_lib/orders.js cancelBlockReason): paid, not shipped yet, no earlier request, and
 * within the owner's cancellation window after payment (Admin → Settings → Checkout; 0 = no time limit).
 */
export const canRequestCancel = (order: OrderWithRequests, windowHours = 0) =>
  order.paymentStatus === 'Paid' && CANCELLABLE_STATUSES.includes(order.status) && !order.cancelRequest && !cancelWindowPassed(order, windowHours);

/**
 * One short line for a paid order that can no longer be cancelled, shown where the "Cancel order" button would be.
 * '' when the button is shown, when a request was already sent (the order's own status lines cover that), and for
 * orders that are delivered, cancelled or refunded (there is nothing left to cancel).
 */
export const cancelClosedNote = (order: OrderWithRequests, windowHours = 0) => {
  if (order.paymentStatus !== 'Paid' || order.cancelRequest) return '';
  if (['Shipped', 'In Transit', 'Out for Delivery'].includes(order.status)) {
    return "This order has been shipped, so it can't be cancelled. You can ask for a return or exchange within 7 days of delivery.";
  }
  if (CANCELLABLE_STATUSES.includes(order.status) && cancelWindowPassed(order, windowHours)) {
    return 'The cancellation time for this order has passed.';
  }
  return '';
};

/** Small letter-spaced emerald label above a title. */
const EYEBROW = 'text-[10.5px] leading-4 font-semibold uppercase tracking-[0.2em] text-sale';

// ---- Dates (only real timestamps from the order; nothing is estimated) ----

export const formatDateTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const formatDay = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * "17 Sept 2026": the last day to ask for a return / exchange. The server's window ends at 11:59 pm India time
 * on that day, so the date is always shown in India time.
 */
export const formatWindowEnd = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
};

/** "5 Oct 2026" for the admin's YYYY-MM-DD expected delivery date ('' when not set). */
export const formatExpectedDate = (value?: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

// ---- Returns / exchanges (same rules as api/_lib/orders.js normalizeReturnRequest) ----

export const RETURN_OPEN: readonly string[] = ['requested', 'approved', 'received'];

/**
 * State of the order's return / exchange request, or null. Older requests take it from the order status; the
 * oldest ones exist only as the status 'Refund Requested' (with a line in the order notes) and count as requested.
 */
export const returnStatusOf = (order: Pick<Order, 'status' | 'returnRequest'>): ReturnRequestStatus | null => {
  const request = order.returnRequest as ReturnRequest | null | undefined;
  if (!request) return order.status === 'Refund Requested' ? 'requested' : null;
  if (request.status) return request.status;
  return order.status === 'Refund Requested' ? 'requested' : order.status === 'Refunded' ? 'refunded' : 'closed';
};

/**
 * The order's return / exchange request for the admin panel, including the oldest kind that was saved only as
 * the status 'Refund Requested' plus a "[RETURN/EXCHANGE REQUEST] Type: … | Reason: … | Note: …" line in the
 * notes (same reading as api/_lib/orders.js legacyNotesRequest). Customers get this from the server instead.
 */
export const returnRequestOf = (order: Pick<Order, 'status' | 'returnRequest' | 'notes'>): ReturnRequest | null => {
  if (order.returnRequest) return order.returnRequest;
  if (order.status !== 'Refund Requested') return null;
  const lines = [...String(order.notes || '').matchAll(/\[RETURN\/EXCHANGE REQUEST\]\s*Type:\s*([^|\n]*?)\s*\|\s*Reason:\s*([^|\n]*?)\s*\|\s*Note:\s*([^\n]*)/g)];
  const last = lines[lines.length - 1];
  const note = last ? last[3].trim() : '';
  return {
    type: last && /exchange/i.test(last[1]) ? 'exchange' : 'return',
    reason: '',
    details: last ? [last[2].trim(), note && note.toLowerCase() !== 'none' ? note : ''].filter(Boolean).join(' — ') : '',
    at: '',
    legacy: true,
  };
};

export const isReturnOpen = (order: Pick<Order, 'status' | 'returnRequest'>) => RETURN_OPEN.includes(returnStatusOf(order) || '');

export const returnKind = (request?: ReturnRequest | null) => (request?.type === 'exchange' ? 'exchange' : 'return');

export const RETURN_STATUS_LABEL: Record<ReturnRequestStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Not approved',
  received: 'Received by us',
  refunded: 'Refunded',
  exchanged: 'Exchanged',
  closed: 'Handled',
};

// ---- Order status in customer words ----

const TIMELINE_LABEL: Record<string, string> = {
  Pending: 'Order placed',
  Processing: 'Order confirmed',
  Packed: 'Packed',
  Shipped: 'Shipped',
  'In Transit': 'In transit',
  'Out for Delivery': 'Out for delivery',
  Delivered: 'Delivered',
  Returned: 'Returned',
  'Payment failed': 'Payment failed',
  Cancelled: 'Order cancelled',
  'Refund Requested': 'Return requested',
  Refunded: 'Refunded',
};

export const timelineLabel = (status: string) => TIMELINE_LABEL[status] || status;

const awaitingPayment = (order: Order) => order.status === 'Pending' || order.paymentStatus === 'Unpaid';

/** An unpaid order whose latest update is a failed payment attempt (the gateway said so). */
export const paymentFailed = (order: Order) => {
  if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded') return false;
  const entries = (order.timeline || [])
    .filter((entry) => entry?.status && !Number.isNaN(new Date(entry.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries[entries.length - 1]?.status === 'Payment failed';
};

/** The newest real update on the order (timeline entry), for "Latest update" lines. */
export const latestUpdate = (order: Order): { label: string; at: string } | null => {
  const entries = (order.timeline || [])
    .filter((entry) => entry?.status && !Number.isNaN(new Date(entry.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const last = entries[entries.length - 1];
  if (last) return { label: timelineLabel(last.status), at: last.at };
  return order.date ? { label: 'Order placed', at: order.date } : null;
};

/** The status pill for an order: customer wording in the brand colours. */
export const StatusPill: React.FC<{ order: Order; className?: string }> = ({ order, className = '' }) => {
  let text: string = order.status;
  // Outline badges: placed and confirmed carry the thin line; on the way and delivered are emerald; cancelled is red.
  let tone = 'border-line text-ink';
  if (awaitingPayment(order) && order.status !== 'Cancelled') {
    text = paymentFailed(order) ? 'Payment failed' : 'Awaiting payment';
    tone = 'border-sale-line text-sale';
  } else if (order.status === 'Processing') {
    text = 'Confirmed';
  } else if (order.status === 'Packed' || order.status === 'Shipped' || order.status === 'In Transit' || order.status === 'Out for Delivery') {
    tone = 'border-sale-line text-sale';
  } else if (order.status === 'Delivered') {
    tone = 'border-brand-line text-sale';
  } else if (order.status === 'Returned') {
    tone = 'border-line text-ink-muted';
  } else if (order.status === 'Cancelled') {
    tone = 'border-danger-line text-danger';
  } else if (order.status === 'Refund Requested') {
    text = 'Return requested';
    tone = 'border-sale-line text-sale';
  } else if (order.status === 'Refunded') {
    tone = 'border-line text-ink-muted';
  }
  return (
    <span className={`sag-badge border bg-surface font-semibold ${tone} ${className}`}>
      <span className="sr-only">Order status: </span>{text}
    </span>
  );
};

// ---- Stepper: Ordered → Confirmed → Packed → Shipped → In transit → Out for delivery → Delivered ----

const STEPS = [{ label: 'Ordered' }, { label: 'Confirmed' }, { label: 'Packed' }, { label: 'Shipped' }, { label: 'In transit' }, { label: 'Out for delivery' }, { label: 'Delivered' }] as const;
const DELIVERED_STEP = STEPS.length - 1;
// The current stage said in words (in the order of STEPS)
const STATE_HEADING = ['Your order is placed', 'Your order is confirmed', 'Your order is packed', 'Your order is shipped', 'Your order is in transit', 'Your order is out for delivery', 'Your order is delivered'] as const;

/** Where each order status sits on the tracker (an older 'Refund Requested' order, and a 'Returned' one, had been delivered). */
const STATUS_STEP: Record<string, number> = { Pending: 0, Processing: 1, Packed: 2, Shipped: 3, 'In Transit': 4, 'Out for Delivery': 5, Delivered: 6, 'Refund Requested': 6, Returned: 6 };

/** Timeline entries that give a step its time: only real fulfilment updates (never a return request). */
const ENTRY_STEP: Record<string, number> = { Pending: 0, Processing: 1, Packed: 2, Shipped: 3, 'In Transit': 4, 'Out for Delivery': 5, Delivered: 6 };

/**
 * Real time the order reached each step, replayed from its timeline in order. A step keeps the time it was
 * first reached; a step the admin undid (e.g. Delivered picked by mistake, then Shipped) loses its time.
 * The order date and payment time stand in for the first two steps when the timeline has no entry for them.
 */
const stepTimes = (order: Order) => {
  const times: string[] = STEPS.map(() => '');
  const entries = (order.timeline || [])
    .filter((entry) => ENTRY_STEP[entry?.status] !== undefined && !Number.isNaN(new Date(entry.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const entry of entries) {
    const step = ENTRY_STEP[entry.status];
    if (!times[step]) times[step] = entry.at;
    for (let later = step + 1; later < times.length; later += 1) times[later] = '';
  }
  if (!times[0]) times[0] = order.date || '';
  if (!times[1]) times[1] = order.paidAt || '';
  return times;
};

/** Furthest step the order has really reached: its current status decides; end states (e.g. Refunded) use the timeline. */
const reachedStep = (order: Order, times: string[]) => {
  if (awaitingPayment(order)) return 0;
  const fromStatus = STATUS_STEP[order.status];
  if (fromStatus !== undefined) return fromStatus;
  let reached = -1;
  times.forEach((at, index) => { if (at) reached = index; });
  return reached;
};

/** Whether the order has really been delivered (a Delivered update later undone by the admin does not count). */
const wasDelivered = (order: Order) => {
  const fromStatus = STATUS_STEP[order.status];
  if (fromStatus !== undefined) return fromStatus === DELIVERED_STEP;
  return Boolean(stepTimes(order)[DELIVERED_STEP]);
};

const Stepper: React.FC<{ order: Order; compact?: boolean }> = ({ order, compact }) => {
  const times = stepTimes(order);
  const current = reachedStep(order, times);
  const waiting = awaitingPayment(order);

  // In a list of orders: one slim bar and a line of text, so several orders fit on a phone screen.
  if (compact) {
    const step = STEPS[Math.max(0, current)];
    const when = current >= 0 ? formatDateTime(times[current]) : '';
    const next = !waiting && current < DELIVERED_STEP ? STEPS[current + 1] : null;
    return (
      <div>
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span key={item.label} className={`h-[2px] flex-1 ${index <= current ? 'bg-brand' : 'bg-line'}`} />
          ))}
        </div>
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm leading-5" aria-hidden="true">
          <span className="font-semibold text-ink">{step.label}{when ? <span className="font-normal text-ink-muted"> · {when}</span> : null}</span>
          {next && <span className="text-[13px] text-ink-muted">Next: {next.label}</span>}
        </p>
        <ol className="sr-only" aria-label="Order progress">
          {STEPS.map((item, index) => (
            <li key={item.label} aria-current={index === current ? 'step' : undefined}>
              {item.label}{index <= current ? ' (done)' : ' (not yet)'}{index <= current && formatDateTime(times[index]) ? `, ${formatDateTime(times[index])}` : ''}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // One white panel at every width: the state in words as a serif title, then every stage as a vertical timeline:
  // reached stages on an emerald circle with a tick and their real time, the current one an emerald ring, later ones grey.
  const eyebrow = waiting ? 'Order placed' : STEPS[Math.max(0, current)].label;
  const heading = waiting
    ? (paymentFailed(order) ? 'Payment failed' : 'Awaiting payment')
    : ['Refund Requested', 'Returned', 'Refunded'].includes(order.status)
      ? timelineLabel(order.status)
      : STATE_HEADING[Math.max(0, current)];
  const rows = STEPS.map((step, index) => ({ label: step.label, index, when: index <= current ? formatDateTime(times[index]) : '' }));

  return (
    <div className="sag-glass px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className={EYEBROW}>{eyebrow}</span>
        <span className="sag-num min-w-0 text-xs leading-4 text-ink-muted break-all">#{order.orderNumber}</span>
      </div>
      <p className="mt-2 font-display text-[26px] leading-[1.1] text-ink sm:text-[30px]">{heading}</p>
      <ol className="sag-tl mt-5" aria-label="Order progress">
        {rows.map((item) => {
          const reached = item.index <= current;
          const done = item.index < current || (reached && current >= DELIVERED_STEP);
          const isCurrent = reached && !done;
          return (
            <li
              key={item.label}
              className={done ? 'is-done' : isCurrent ? 'is-current' : ''}
              style={{ '--i': item.index } as React.CSSProperties}
              aria-current={item.index === current ? 'step' : undefined}
            >
              <span className="sag-tl-dot" aria-hidden="true">
                {done && <Check className="h-3 w-3" strokeWidth={2.2} />}
              </span>
              <p className={`text-[15px] leading-6 ${reached ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}`}>
                {item.label}<span className="sr-only">{reached ? ' (done)' : ' (not yet)'}</span>
              </p>
              {item.when && <p className="sag-num text-[13px] leading-[18px] text-ink-muted">{item.when}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
// ---- Return / exchange progress (customer side) ----

const RETURN_STEPS: Record<'return' | 'exchange', ReturnRequestStatus[]> = {
  return: ['requested', 'approved', 'received', 'refunded'],
  exchange: ['requested', 'approved', 'received', 'exchanged'],
};

const RETURN_MESSAGE: Record<ReturnRequestStatus, (kind: string) => string> = {
  requested: () => 'Our team is reviewing your request and will email you.',
  approved: () => 'Your request is approved. Please follow the steps from our team.',
  received: (kind) => (kind === 'exchange' ? 'We have received the pieces you sent back and are arranging your exchange.' : 'We have received the pieces you sent back.'),
  refunded: () => 'Your refund has been issued to your original payment method. Banks usually take 5–7 working days to show it.',
  exchanged: () => 'Your exchange is complete.',
  rejected: () => 'Your request was not approved.',
  closed: () => 'Your earlier return request was handled by our team.',
};

/**
 * The steps to show for a request, and which of them really happened. Only steps in the request's history (or
 * its current state) are ticked: a return refunded straight after approval never shows "Received by us", and an
 * older request without history shows just "Requested" and where it ended. Open requests also list what is still to come.
 */
export const returnSteps = (request: ReturnRequest, status: ReturnRequestStatus): Array<{ state: ReturnRequestStatus; done: boolean }> => {
  const flow = RETURN_STEPS[returnKind(request)];
  const happened = new Set<string>(['requested', status, ...(request.history || []).map((entry) => entry.status)]);
  if (RETURN_OPEN.includes(status)) {
    const at = flow.indexOf(status);
    return flow.filter((state, index) => happened.has(state) || index > at).map((state) => ({ state, done: happened.has(state) }));
  }
  const final = flow[flow.length - 1];
  const before = flow.filter((state) => state !== final && state !== status && happened.has(state));
  return [...before, status].map((state) => ({ state, done: true }));
};

export const ReturnProgress: React.FC<{ order: Order }> = ({ order }) => {
  const request = order.returnRequest as ReturnRequest | null | undefined;
  const status = returnStatusOf(order);
  if (!request || !status) return null;
  const kind = returnKind(request);
  const title = kind === 'exchange' ? 'Exchange' : 'Return';
  const history = request.history || [];
  const timeOf = (state: ReturnRequestStatus) => {
    if (state === 'requested') return request.at;
    const found = history.filter((entry) => entry.status === state).map((entry) => entry.at).sort();
    return found[found.length - 1] || '';
  };
  const steps = status === 'closed' ? [] : returnSteps(request, status);
  const earlier = (order.pastReturnRequests || []).filter((past) => past?.status);
  const settled = status === 'refunded' || status === 'exchanged';
  const tone = status === 'rejected' ? 'border-danger-line' : settled ? 'border-brand-line' : 'border-line';
  return (
    <section className={`rounded-[10px] border bg-surface ${tone} p-4 space-y-3`} aria-label={`${title} request`}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 flex mt-0.5 text-ink"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5 font-semibold text-ink">
            {title} request · <span className={status === 'rejected' ? 'text-danger' : settled ? 'text-ink' : 'text-sale'}>{RETURN_STATUS_LABEL[status]}</span>
          </p>
          <p className="mt-0.5 text-sm leading-5 text-ink-muted">{RETURN_MESSAGE[status](kind)}</p>
          {request.adminNote && (status === 'approved' || status === 'rejected' || status === 'received' || status === 'refunded' || status === 'exchanged') && (
            <p className="mt-2 sag-glass sag-glass-strong px-3 py-2 text-sm leading-5 text-ink break-words">
              <span className="text-ink-muted">{status === 'rejected' ? 'Reason: ' : 'From our team: '}</span>{request.adminNote}
            </p>
          )}
        </div>
      </div>
      {steps.length > 0 && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] leading-[18px]" aria-label={`${title} progress`}>
          {steps.map(({ state, done }) => {
            const when = done ? formatDay(timeOf(state)) : '';
            return (
              <li key={state} className={`inline-flex items-center gap-1.5 ${done ? 'text-ink' : 'text-ink-muted'}`}>
                <span className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${done ? (state === 'rejected' ? 'bg-danger' : 'bg-brand') : 'border border-control bg-surface'}`}>
                  {done && (state === 'rejected' ? <XCircle className="w-3 h-3 text-[color:var(--sag-on-gold)]" aria-hidden="true" /> : <Check className="w-2.5 h-2.5 text-[color:var(--sag-on-gold)]" strokeWidth={3} aria-hidden="true" />)}
                </span>
                {RETURN_STATUS_LABEL[state]}{when ? ` · ${when}` : ''}
                <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
              </li>
            );
          })}
        </ol>
      )}
      {(request.items || []).length > 0 && (
        <ul className="space-y-1 text-sm leading-5 text-ink" aria-label={`Items in this ${kind}`}>
          {(request.items || []).map((item) => (
            <li key={item.line} className="flex flex-col sm:flex-row sm:gap-2">
              <span className="min-w-0 sm:truncate">{item.name}</span>
              <span className="shrink-0 text-[13px] text-ink-muted">
                {item.size ? `Size ${item.size}` : 'One size'}{item.exchangeSize ? ` → ${item.exchangeSize}` : ''} · Qty {item.qty}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(request.photos || []).length > 0 && (
        <div className="flex gap-2" aria-label="Photos you sent">
          {(request.photos || []).map((url) => (
            <a key={url} href={getCleanImageUrl(url, 1200)} target="_blank" rel="noopener noreferrer" className="w-12 aspect-[4/5] overflow-hidden rounded-lg border border-line bg-sunken">
              <img src={getCleanImageUrl(url, 160)} alt="Photo you sent" className="w-full h-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {earlier.length > 0 && (
        <div className="border-t border-line pt-3 space-y-1.5">
          <p className={EYEBROW}>Earlier requests on this order</p>
          <ul className="space-y-1.5 text-sm leading-5 text-ink-muted">
            {earlier.map((past, index) => {
              const pastStatus = past.status as ReturnRequestStatus;
              const pastKind = returnKind(past) === 'exchange' ? 'Exchange' : 'Return';
              const when = formatDay(past.updatedAt || past.at);
              const pieces = (past.items || []).map((item) => `${item.name}${item.qty > 1 ? ` × ${item.qty}` : ''}`).join(', ');
              return (
                <li key={`${past.at}-${index}`} className="break-words">
                  <span className="font-medium text-ink">{pastKind} · {RETURN_STATUS_LABEL[pastStatus] || pastStatus}</span>
                  {when ? <span> · {when}</span> : null}
                  {pieces ? <span className="block text-[13px]">{pieces}</span> : null}
                  {past.adminNote ? <span className="block text-[13px]">{pastStatus === 'rejected' ? 'Reason: ' : 'From our team: '}{past.adminNote}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

// ---- Courier card ----

/** Copies text and briefly says so (falls back to a hint when the clipboard is not available). */
const useCopy = () => {
  const [copied, setCopied] = useState('');
  const copy = (text: string) => {
    if (!text) return;
    if (!navigator.clipboard) {
      setCopied('hint');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(text);
        window.setTimeout(() => setCopied(''), 1800);
      })
      .catch(() => setCopied('hint'));
  };
  return { copied, copy };
};

const SHIPPING_STATUSES = ['Processing', 'Packed', 'Shipped', 'In Transit', 'Out for Delivery'];

/**
 * Delivery date to show while the order is on its way: the admin's expected date, else the estimate the server
 * made from the owner's configured delivery days when the order was placed (labelled "Estimated").
 */
export const deliveryDateOf = (order: Order): { text: string; estimated: boolean } | null => {
  if (!SHIPPING_STATUSES.includes(order.status)) return null;
  const expected = formatExpectedDate(order.expectedDeliveryDate);
  if (expected) return { text: expected, estimated: false };
  const estimated = formatDeliveryDate(order.estimatedDeliveryDate);
  return estimated ? { text: estimated, estimated: true } : null;
};

export const hasCourierInfo = (order: Order) =>
  Boolean(order.courierPartner || order.trackingNumber || order.trackingUrl || deliveryDateOf(order));

/** Courier name, AWB with copy, "Track on <courier> website" and the admin's expected date (or the labelled estimate). */
export const CourierCard: React.FC<{ order: Order }> = ({ order }) => {
  const { copied, copy } = useCopy();
  if (!hasCourierInfo(order)) return null;
  const awb = (order.trackingNumber || '').trim();
  const courier = findCourier(order.courierPartner);
  const link = trackingLinkFor(order);
  const delivery = deliveryDateOf(order);
  return (
    <section className="sag-glass p-4 space-y-3" aria-label="Shipment">
      <div className="flex items-center gap-3">
        <span className="shrink-0 flex text-sale"><TruckIcon className="w-5 h-5" mono live={false} /></span>
        <div className="min-w-0 flex-1">
          <p className={EYEBROW}>{order.courierPartner || awb ? 'Courier partner' : 'Delivery'}</p>
          {(order.courierPartner || awb) && <p className="font-display text-[20px] leading-6 text-ink break-words">{courier?.name || order.courierPartner || 'Courier partner'}</p>}
          {!order.courierPartner && !awb && delivery && <p className="font-display text-[20px] leading-6 text-ink">On its way to you</p>}
        </div>
      </div>
      {awb && (
        <div className="flex items-center justify-between gap-2 border-y border-line">
          <p className="min-w-0 py-2 text-sm leading-5 text-ink-muted">
            <span className="mr-2">Tracking no. (AWB)</span>
            <span className="sag-num font-semibold text-ink break-all select-all">{awb}</span>
          </p>
          <button
            type="button"
            onClick={() => copy(awb)}
            className="sag-link shrink-0 gap-1.5 px-2"
            aria-label="Copy AWB number"
          >
            {copied === awb ? <CheckCircle2 className="w-4 h-4 text-ok" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            {copied === awb ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {delivery && (
        <p className={`text-sm leading-5 flex items-center gap-2 ${delivery.estimated ? 'text-ink-muted' : 'text-ink font-medium'}`}>
          <PackageIcon className="w-5 h-5 shrink-0" mono live={false} /> {delivery.estimated ? `Estimated delivery by ${delivery.text}` : `Expected by ${delivery.text}`}
        </p>
      )}
      {link && (
        <div className="space-y-1.5">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { if (!link.hasAwb && awb) copy(awb); }}
            className="sag-btn-outline w-full sm:w-auto h-auto min-h-12 py-2.5 px-4 gap-2 text-center"
          >
            {link.label} <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
          </a>
          {!link.hasAwb && awb && <p className="text-[13px] leading-[18px] text-ink-muted">We copy your AWB number when you tap; paste it on the courier's page.</p>}
        </div>
      )}
      {copied === 'hint' && <p className="text-[13px] leading-[18px] text-ink-muted">Copy is not available here. Press and hold the AWB number to copy it.</p>}
    </section>
  );
};

// ---- Order filters (Account → Orders) ----

export type OrderFilter = 'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returns';

export const ORDER_FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returns', label: 'Returns / Refunds' },
];

/** Out for delivery / in transit (matched by wording). */
const IN_TRANSIT = /out for delivery|in transit/i;
export const isOutForDelivery = (order: Order) => /out for delivery/i.test(String(order.status || ''));

/** Whether an order belongs under a filter chip (an order can sit under Delivered and Returns at once). */
export const matchesOrderFilter = (order: Order, filter: OrderFilter) => {
  const status = String(order.status || '');
  switch (filter) {
    case 'processing': return ['Pending', 'Paid', 'Processing', 'Packed'].includes(status);
    case 'shipped': return status === 'Shipped' || IN_TRANSIT.test(status);
    case 'delivered': return status === 'Delivered';
    case 'cancelled': return status === 'Cancelled';
    case 'returns': return Boolean(order.returnRequest) || status === 'Refund Requested' || status === 'Refunded' || status === 'Returned';
    default: return true;
  }
};

/** Whether the order has really reached "Delivered" (used for "Rate product"). */
export const isDelivered = (order: Order) => wasDelivered(order);

// ---- Full status history ("See all updates") ----

/** Every real update on the order, newest first. Renders nothing when the order has no timeline. */
export const StatusHistory: React.FC<{ order: Order }> = ({ order }) => {
  const [open, setOpen] = useState(false);
  const entries = (order.timeline || [])
    .filter((entry) => entry?.status && !Number.isNaN(new Date(entry.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (entries.length === 0) return null;
  const listId = `status-history-${order.orderNumber}`;
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="w-full min-h-14 py-2 flex items-center justify-between gap-3 text-left text-sm leading-5 font-medium text-ink cursor-pointer"
      >
        <span>{open ? 'Hide updates' : `See all updates (${entries.length})`}</span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ol id={listId} className="pb-2 space-y-3.5 sag-fade" aria-label="All order updates">
          {entries.map((entry, index) => (
            <li key={`${entry.status}-${entry.at}-${index}`} className="relative flex gap-3">
              {index < entries.length - 1 && <span aria-hidden="true" className="absolute left-[4.5px] top-4 -bottom-3.5 w-px bg-line" />}
              <span className={`relative mt-1.5 w-2.5 h-2.5 shrink-0 rounded-full ${index === 0 ? 'bg-brand' : 'bg-control'}`} aria-hidden="true" />
              <div className="min-w-0 text-sm leading-5">
                <p className={index === 0 ? 'font-semibold text-ink' : 'text-ink'}>{timelineLabel(entry.status)}</p>
                <p className="text-[13px] leading-[18px] text-ink-muted">{formatDateTime(entry.at)}</p>
                {entry.note && <p className="text-[13px] leading-[18px] text-ink-muted break-words">{entry.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

// ---- Delivery executive (only when the store has entered one and the order is out for delivery) ----

export const DeliveryAgentCard: React.FC<{ order: Order }> = ({ order }) => {
  const name = String(order.deliveryAgentName || '').trim();
  const phone = String(order.deliveryAgentPhone || '').replace(/[^\d+]/g, '');
  if (!isOutForDelivery(order) || (!name && !phone)) return null;
  return (
    <section className="sag-glass p-4 flex items-center gap-3" aria-label="Delivery executive">
      <span className="shrink-0 flex text-sale"><UserIcon className="w-5 h-5" mono live={false} /></span>
      <div className="min-w-0 flex-1">
        <p className={EYEBROW}>Delivery executive</p>
        {name ? <p className="text-[15px] leading-[22px] font-medium text-ink break-words">{name}</p> : <p className="text-sm leading-5 text-ink-muted">Out for delivery today</p>}
      </div>
      {phone && (
        <a href={`tel:${phone}`} aria-label={`Call ${name || 'the delivery executive'}`} className="sag-btn-outline shrink-0 h-11 px-4 gap-2">
          <Phone className="w-4 h-4" aria-hidden="true" /> Call
        </a>
      )}
    </section>
  );
};

// ---- Order progress: stepper plus clear notices for every state ----

export const OrderProgress: React.FC<{ order: OrderWithRequests; compact?: boolean }> = ({ order, compact }) => {
  const request = order.cancelRequest;
  const delivered = wasDelivered(order);
  const paidOrRefunded = order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded';

  const note = 'rounded-[10px] px-4 py-3 text-sm leading-5';

  if (order.status === 'Cancelled') {
    const at = latestUpdate(order)?.at;
    return (
      <div className="space-y-3">
        <div className={`${note} border border-danger-line bg-surface flex items-start gap-2.5`}>
          <XCircle className="w-[18px] h-[18px] shrink-0 text-danger mt-px" aria-hidden="true" />
          <div className="text-ink space-y-0.5">
            <p className="font-semibold text-danger">This order was cancelled{at ? ` · ${formatDateTime(at)}` : ''}</p>
            {order.paymentStatus === 'Refunded' && <p>The payment has been refunded to your original payment method.</p>}
            {order.paymentStatus === 'Paid' && <p>The amount paid will be refunded to your original payment method.</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {awaitingPayment(order) && (
        <p className={`${note} border border-sale-line bg-surface text-ink`}>
          {paymentFailed(order) ? 'Your last payment attempt for this order failed. ' : ''}We have not received payment for this order yet. If money was deducted, it is usually confirmed within a few minutes — or contact us and we will check it for you.
        </p>
      )}
      {order.status === 'Returned' && (
        <p className={`${note} border border-line bg-surface text-ink-muted`}>
          This order was returned to us{latestUpdate(order) ? ` · ${formatDateTime(latestUpdate(order)?.at)}` : ''}.
        </p>
      )}
      {(order.status !== 'Refunded' || delivered) && <Stepper order={order} compact={compact} />}
      {order.status === 'Refunded' && !order.returnRequest && (
        <p className={`${note} border border-line bg-surface text-ink-muted`}>
          This order was refunded to your original payment method{paidOrRefunded && latestUpdate(order) ? ` · ${formatDateTime(latestUpdate(order)?.at)}` : ''}.
        </p>
      )}
      {request && !request.handledAt && CANCELLABLE_STATUSES.includes(order.status) && (
        <p className={`${note} border border-sale-line bg-surface text-ink`}>
          You asked to cancel this order{formatDay(request.at) ? ` on ${formatDay(request.at)}` : ''}. Our team is reviewing it and will email you.
        </p>
      )}
      {request?.handledAt && request.outcome === 'kept' && !delivered && (
        <p className={`${note} border border-line bg-surface text-ink-muted`}>
          Your cancellation request was reviewed and this order is going ahead. Contact us on WhatsApp if you still need help.
        </p>
      )}
      <ReturnProgress order={order} />
    </div>
  );
};
