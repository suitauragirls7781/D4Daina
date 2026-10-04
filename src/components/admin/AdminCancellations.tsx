import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { ordersApi } from '../../lib/api';
import { ArrowRight, Check, Clock, ExternalLink, Phone, RefreshCw, X, XCircle } from 'lucide-react';
import { WhatsAppIcon } from '../BrandIcons';
import { AdminPageHeader, tone, ui } from './kidsToysShared';
import { actionRow, ago, cardShell, contactBtn, digits, newBadge, orderLink } from './AdminReturns';
import { CANCELLABLE_STATUSES } from '../OrderProgress';
import type { CancelRequest } from '../OrderProgress';
import { formatOrderDate } from '../../utils/orderDate';
import type { Order } from '../../types';

type Filter = 'waiting' | 'closed' | 'all';

const SEEN_KEY = 'sag_admin_cancellations_seen_v1';
// Cancellations used to share the Returns page; its "seen" mark is the starting point on this device
const OLD_SEEN_KEY = 'sag_admin_returns_seen_v1';

/** Remembered on this device: the newest cancellation request time the admin has already looked at. */
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) || localStorage.getItem(OLD_SEEN_KEY) || ''; } catch { return ''; } };
const writeSeen = (value: string) => { try { localStorage.setItem(SEEN_KEY, value); } catch {} };

/**
 * A customer's request to cancel an order. `open` = still waiting and the order can still be cancelled
 * (pending, processing or packed); `stale` = still waiting but the order has already moved on (shipped,
 * delivered, cancelled...); `closed` = handled.
 */
export interface CancelRow { order: Order; request: CancelRequest; state: 'open' | 'stale' | 'closed'; at: string }

/** Every order with a cancellation request, newest first (shared with the admin bar's live alert). */
export const cancelRows = (orders: Order[]): CancelRow[] =>
  orders
    .map((order) => {
      const request = order.cancelRequest;
      if (!request) return null;
      const state = request.handledAt ? 'closed' : CANCELLABLE_STATUSES.includes(order.status) ? 'open' : 'stale';
      return { order, request, state, at: String(request.at || order.date || '') } as CancelRow;
    })
    .filter((row): row is CancelRow => Boolean(row))
    .sort((a, b) => b.at.localeCompare(a.at));

/** Cancellation requests the admin has not answered yet (counted on the menu badge and the "Waiting" tab). */
export const waitingCancelRows = (orders: Order[]): CancelRow[] => cancelRows(orders).filter((row) => row.state !== 'closed');

/**
 * Admin → Cancellations. Customer cancellation requests arrive here live (the orders list is a live
 * listener). The admin cancels the order or keeps it right on the card; both buttons go through the same
 * server action as the order page. The refund itself is made by the owner in the payment dashboard.
 */
export const AdminCancellations: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminOrderDetails } = useRouter();
  const rows = useMemo(() => cancelRows(orders), [orders]);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [now, setNow] = useState(() => Date.now());
  // "New" marks: requests newer than what this device last saw; the page counts as seen once opened
  const [seenBefore] = useState(readSeen);
  useEffect(() => { if (rows[0]?.at && rows[0].at > readSeen()) writeSeen(rows[0].at); }, [rows]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);

  const groups: Record<Filter, CancelRow[]> = {
    waiting: rows.filter((row) => row.state !== 'closed'),
    closed: rows.filter((row) => row.state === 'closed'),
    all: rows,
  };
  const shown = groups[filter];
  const chips: Array<{ id: Filter; label: string }> = [
    { id: 'waiting', label: 'Waiting' },
    { id: 'closed', label: 'Closed' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <AdminPageHeader
        eyebrow="Sales"
        title="Cancellations"
        icon={<XCircle className="w-5 h-5" />}
        description={<>Customers can ask to cancel a paid order until it is shipped. Their requests appear here live. Cancel the order or keep it right here; the customer sees your decision in their account and gets an email. Refunds are made by you in your payment dashboard.</>}
      />

      <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Show cancellation requests">
        {chips.map((c) => (
          <button key={c.id} role="tab" aria-selected={filter === c.id} onClick={() => setFilter(c.id)}
            className={`${ui.chip(filter === c.id)} shrink-0 whitespace-nowrap`}>
            {c.label} <span className={`tabular-nums font-normal ${filter === c.id ? 'text-on-dark-muted' : 'text-ink-muted'}`}>{groups[c.id].length}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className={ui.empty}>
          <p className="text-base font-semibold text-ink">
            {filter === 'waiting' ? 'No cancellation requests waiting' : filter === 'closed' ? 'No closed cancellation requests' : 'No cancellation requests yet'}
          </p>
          <p className="mt-1 text-sm leading-5 text-ink-muted max-w-md mx-auto">A new cancellation request from a customer shows up here the moment it is sent.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <li key={`${row.order.orderNumber}-${row.at}`}>
              <CancelCard row={row} now={now} isNew={row.state !== 'closed' && row.at > seenBefore} onOpenOrder={() => openAdminOrderDetails(row.order.orderNumber)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * A customer's cancellation request. "Cancel order" and "Keep order" send exactly what the same buttons
 * on the order page send (admin-update), so the server does the same work: stock back and email on cancel,
 * "order is going ahead" email on keep. The refund itself is made by the owner in the payment dashboard.
 */
const CancelCard: React.FC<{ row: CancelRow; now: number; isNew: boolean; onOpenOrder: () => void }> = ({ row, now, isNew, onOpenOrder }) => {
  const { showToast } = useShop();
  const { applyServerOrder, updateOrderStatus } = useAdmin();
  const { order, request, state } = row;
  // Same starting values as the order page's form: the saved "Message to customer" and a ticked email box
  const [customerNote, setCustomerNote] = useState(order.customerNote || '');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<'' | 'cancel' | 'keep'>('');
  const phone = digits(order.customerMobile);
  const paid = order.paymentStatus === 'Paid';
  const amount = `₹${Number(order.finalTotal || 0).toLocaleString('en-IN')}`;
  // The refund is made by hand in the dashboard of the gateway that took the payment
  const gateway = order.paymentMethod === 'payu' ? 'PayU' : order.paymentMethod === 'razorpay' ? 'Razorpay' : 'Razorpay / PayU';
  // Only a paid order has money to send back; otherwise say what the payment status is instead of asking for a refund
  const notPaidNote = `Payment is marked ${order.paymentStatus || 'not paid'}, so no refund is due unless your payment dashboard shows money received.`;
  const orderStopped = ['Cancelled', 'Refund Requested', 'Refunded'].includes(order.status);
  const keptEmail = (order.emailLog || []).filter((entry) => entry.kind === 'cancelKept').slice(-1)[0];
  const pieces = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // Same cancel as the order page's "Cancel order now": stock goes back and the request is closed by the server.
  const cancelOrder = async () => {
    if (!window.confirm(`Cancel order ${order.orderNumber}? Its stock will be returned to inventory. ${paid ? `Refund ${amount} from your ${gateway} dashboard.` : notPaidNote}`)) return;
    setBusy('cancel');
    try {
      // updateOrderStatus applies the order the server returns, so the card moves to Closed at once
      await updateOrderStatus(order.orderNumber, 'Cancelled', order.trackingNumber || '', order.notes || '', { courierPartner: order.courierPartner || '', customerNote, notify });
      showToast(paid ? `Order ${order.orderNumber} cancelled. Remember to refund it in ${gateway}.` : `Order ${order.orderNumber} cancelled.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not cancel the order. Please try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  // Same as the order page's "Keep order (close request)": closes the request without cancelling.
  // The server emails the customer that the order is going ahead, with the message typed on this card.
  const keepOrder = async () => {
    const note = customerNote.trim();
    const question = orderStopped
      ? `Close this cancellation request? The order is already ${order.status}.`
      : `Keep this order and close the cancellation request?\n\nThe customer will be emailed that the order is going ahead${note ? ', with your "Message to customer".' : '. To tell them why, first write it in "Message to customer" on this card; it is included in the email.'}`;
    if (!window.confirm(question)) return;
    setBusy('keep');
    try {
      const result = await ordersApi<{ order?: any; cancelKeptEmailSent?: boolean }>('admin-update', { orderNumber: order.orderNumber, cancelRequestHandled: true, customerNote });
      if (result.order) applyServerOrder(result.order);
      if (result.cancelKeptEmailSent === false) {
        showToast('Request closed, but the email to the customer could not be sent. Please tell them on WhatsApp.', 'error');
      } else {
        showToast(result.cancelKeptEmailSent ? 'Request closed. The customer was emailed that the order is going ahead.' : 'Cancellation request closed.', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not update the request. Please try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const statusLabel = state === 'open' ? 'Waiting for you'
    : state === 'stale' ? `Order already ${order.status}`
      : request.outcome === 'kept' ? 'Closed · order kept' : 'Closed · order cancelled';
  const statusClass = state === 'open' || state === 'stale' ? tone.warn
    : request.outcome === 'kept' ? tone.ok : tone.neutral;

  return (
    <article className={`${cardShell} ${state !== 'closed' ? 'border-sale-line' : 'border-line'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isNew && <span className={newBadge}>New</span>}
            <span className={`${ui.badge} ${tone.danger}`}><XCircle className="w-3.5 h-3.5" /> Cancellation</span>
            <span className={`${ui.badge} ${statusClass}`}>{statusLabel}</span>
            <span className="text-xs text-ink-muted inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {ago(row.at, now)}</span>
          </div>
          <button type="button" onClick={onOpenOrder} className={orderLink}>
            {order.orderNumber} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>
          <p className="text-sm leading-5 text-ink break-words"><span className="font-semibold">{order.customerName || 'Customer'}</span>{order.customerEmail ? <span className="text-ink-muted"> · {order.customerEmail}</span> : null}</p>
        </div>
        {phone.length === 10 && (
          <div className="flex gap-2 w-full sm:w-auto shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">
            <a href={`tel:+91${phone}`} className={contactBtn}><Phone className="w-4 h-4" /> Call</a>
            <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi ${order.customerName || ''}, about your cancellation request for order ${order.orderNumber} at Suit Aura Girls:`)}`} target="_blank" rel="noopener noreferrer"
              className={contactBtn}><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
          </div>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <dl className="text-sm space-y-2 min-w-0">
          <div>
            <dt className={ui.eyebrow}>{paid ? 'Amount paid' : 'Order total'}</dt>
            <dd className="font-semibold text-ink">{amount}{paid ? '' : ` · payment ${order.paymentStatus}`}{pieces > 0 ? <span className="font-normal text-ink-muted"> · {pieces} {pieces === 1 ? 'piece' : 'pieces'}</span> : null}</dd>
          </div>
          <div>
            <dt className={ui.eyebrow}>Requested</dt>
            <dd className="text-ink">{formatOrderDate(request.at) || 'Date not recorded'}{request.handledAt ? <span className="text-ink-muted"> · closed {formatOrderDate(request.handledAt)}</span> : null}</dd>
          </div>
          <div>
            <dt className={ui.eyebrow}>Order status</dt>
            <dd className="text-ink">{order.status}</dd>
          </div>
        </dl>
        <div className="text-sm space-y-2 min-w-0">
          <p className={ui.eyebrow}>Reason</p>
          <p className="font-semibold text-ink whitespace-pre-line break-words">{request.reason || 'Not given'}</p>
          {state !== 'closed' && request.storeNotified === false && (
            <p className="text-sm leading-5 text-danger font-medium">
              The email alert for this request could not be sent to the store email (email not set up, or it failed). Check the orders list for new requests.
            </p>
          )}
          {state === 'stale' && (
            <p className="text-sm text-ink-muted">
              The customer asked to cancel, but the order is already {order.status}. Close the request so the customer no longer sees it as under review{orderStopped ? '.' : '; they are emailed that the order is going ahead.'}
            </p>
          )}
          {state === 'closed' && request.outcome === 'kept' && (
            <p className="text-sm text-ink-muted">
              {!keptEmail
                ? 'The customer was not emailed about this (the email box was unticked). Tell them on WhatsApp if needed.'
                : keptEmail.ok
                  ? `The customer was emailed that the order is going ahead (${formatOrderDate(keptEmail.at)}).`
                  : 'The email to the customer failed. Please tell them on WhatsApp.'}
            </p>
          )}
          {state !== 'open' && order.status === 'Cancelled' && order.paymentStatus === 'Paid' && (
            <p className="text-sm text-ink-muted">Payment is still marked Paid. After refunding in {gateway}, set the status to Refunded.</p>
          )}
        </div>
      </div>

      {state !== 'closed' && (
        <div className="mt-4 pt-3.5 border-t border-line space-y-3">
          {!(state === 'stale' && orderStopped) && (
            <textarea rows={2} maxLength={1000} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} aria-label="Message to customer"
              placeholder='Message to customer (optional), e.g. "Your order is already being packed, so it will be delivered."'
              className={ui.textarea} />
          )}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5">
            {state === 'open' ? (
              <label className="min-h-11 flex items-center gap-2.5 text-sm leading-5 text-ink cursor-pointer">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-[22px] h-[22px] shrink-0 accent-brand" /> Email the customer when cancelling
              </label>
            ) : <span className="hidden sm:block" />}
            <div className={actionRow}>
              {state === 'open' && (
                <button type="button" onClick={cancelOrder} disabled={Boolean(busy)}
                  className={ui.danger}>
                  {busy === 'cancel' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {busy === 'cancel' ? 'Saving…' : 'Cancel order'}
                </button>
              )}
              <button type="button" onClick={keepOrder} disabled={Boolean(busy)}
                className={ui.outline}>
                {busy === 'keep' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {busy === 'keep' ? 'Saving…' : state === 'open' ? 'Keep order' : 'Close request'}
              </button>
              {state === 'stale' && (
                <button type="button" onClick={onOpenOrder}
                  className={ui.primary}>
                  Open order <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {state === 'open' && (
            <p className="text-sm text-ink-muted">
              Cancelling returns the stock automatically and emails the customer (if the email box is ticked). {paid ? <>The money is not refunded automatically: refund {amount} from your {gateway} dashboard{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then set the order status to Refunded.</> : notPaidNote} Keeping the order closes the request and emails the customer that it is going ahead.
            </p>
          )}
        </div>
      )}
    </article>
  );
};
