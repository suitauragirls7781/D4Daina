import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { ordersApi } from '../../lib/api';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { ArrowRight, Check, Clock, ExternalLink, Phone, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';
import { WhatsAppIcon } from '../BrandIcons';
import { AdminPageHeader } from './kidsToysShared';
import { CANCELLABLE_STATUSES, RETURN_STATUS_LABEL, returnRequestOf, returnStatusOf } from '../OrderProgress';
import type { CancelRequest } from '../OrderProgress';
import { formatOrderDate } from '../../utils/orderDate';
import type { Order, ReturnRequest, ReturnRequestItem, ReturnRequestStatus } from '../../types';

type Action = 'approve' | 'reject' | 'receive' | 'refund' | 'exchange';
type Filter = 'decide' | 'progress' | 'closed' | 'all';

// Same steps as the order page (the server checks them again)
const BUTTONS: Partial<Record<ReturnRequestStatus, Action[]>> = {
  requested: ['approve', 'reject'],
  approved: ['receive', 'refund', 'exchange', 'reject'],
  received: ['refund', 'exchange', 'reject'],
};
const LABEL: Record<Action, string> = { approve: 'Approve', reject: 'Deny', receive: 'Mark received', refund: 'Mark refunded', exchange: 'Mark exchanged' };
const SEEN_KEY = 'sag_admin_returns_seen_v1';

/** Remembered on this device: the newest request time the admin has already looked at. */
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const writeSeen = (value: string) => { try { localStorage.setItem(SEEN_KEY, value); } catch {} };

export interface ReturnRow { order: Order; request: ReturnRequest; state: ReturnRequestStatus; kind: 'return' | 'exchange'; at: string }

/** Every order with a return / exchange request, newest first (shared with the admin bar's live alert). */
export const returnRows = (orders: Order[]): ReturnRow[] =>
  orders
    .map((order) => {
      const request = returnRequestOf(order);
      const state = returnStatusOf(order);
      if (!request || !state) return null;
      return { order, request, state, kind: request.type === 'exchange' ? 'exchange' : 'return', at: String(request.at || order.date || '') } as ReturnRow;
    })
    .filter((row): row is ReturnRow => Boolean(row))
    .sort((a, b) => b.at.localeCompare(a.at));

/**
 * A customer's request to cancel an order. `open` = still waiting and the order can still be cancelled;
 * `stale` = still waiting but the order has already moved on (packed, shipped, cancelled...); `closed` = handled.
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

/** Cancellation requests the admin has not answered yet (counted on the menu badge and "Waiting for you"). */
export const waitingCancelRows = (orders: Order[]): CancelRow[] => cancelRows(orders).filter((row) => row.state !== 'closed');

type Entry = { type: 'return'; row: ReturnRow } | { type: 'cancel'; row: CancelRow };

const ago = (iso: string, now: number) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const when = (iso?: string) => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
};
const digits = (phone: string) => String(phone || '').replace(/\D/g, '').slice(-10);

const statusTone = (state: ReturnRequestStatus) =>
  state === 'requested' ? 'bg-[#F7E4EA] text-[#8A2E55] border-[#8A2E55]/20'
    : state === 'approved' || state === 'received' ? 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15'
      : state === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200';

/**
 * Admin → Returns, exchanges & cancellations. Customer requests arrive here live (the orders list is a
 * live Firestore listener); the admin approves or denies right on the card, then marks the piece received
 * and the refund / exchange done. Cancellation requests are answered here too (cancel or keep the order).
 * Every step goes through the same server action as the order page.
 */
export const AdminReturns: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminOrderDetails } = useRouter();
  const rows = useMemo(() => returnRows(orders), [orders]);
  const cancels = useMemo(() => cancelRows(orders), [orders]);
  // Returns, exchanges and cancellations in one list, newest first
  const entries = useMemo<Entry[]>(
    () => [...rows.map((row): Entry => ({ type: 'return', row })), ...cancels.map((row): Entry => ({ type: 'cancel', row }))].sort((a, b) => b.row.at.localeCompare(a.row.at)),
    [rows, cancels],
  );
  const [filter, setFilter] = useState<Filter>('decide');
  const [now, setNow] = useState(() => Date.now());
  // "New" marks: requests newer than what this device last saw; the page counts as seen once opened
  const [seenBefore] = useState(readSeen);
  useEffect(() => { if (entries[0]?.row.at && entries[0].row.at > readSeen()) writeSeen(entries[0].row.at); }, [entries]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);

  const groups = {
    decide: entries.filter((e) => (e.type === 'cancel' ? e.row.state !== 'closed' : e.row.state === 'requested')),
    progress: entries.filter((e) => e.type === 'return' && (e.row.state === 'approved' || e.row.state === 'received')),
    closed: entries.filter((e) => (e.type === 'cancel' ? e.row.state === 'closed' : !['requested', 'approved', 'received'].includes(e.row.state))),
    all: entries,
  };
  const shown = groups[filter];
  const chips: Array<{ id: Filter; label: string }> = [
    { id: 'decide', label: 'Needs your decision' },
    { id: 'progress', label: 'In progress' },
    { id: 'closed', label: 'Closed' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <AdminPageHeader
        eyebrow="Sales"
        title="Returns, exchanges & cancellations"
        icon={<RotateCcw className="w-5 h-5" />}
        description={<>Customer return, exchange and cancellation requests appear here live. Answer them right here; the customer sees your decision in their account and gets an email.</>}
      />

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: 'Waiting for you', value: groups.decide.length, tone: groups.decide.length ? 'text-[#8A2E55]' : 'text-[#2A1A26]' },
          { label: 'In progress', value: groups.progress.length, tone: 'text-[#4B1D3F]' },
          { label: 'Closed', value: groups.closed.length, tone: 'text-[#2A1A26]/70' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white border border-[#4B1D3F]/10 p-3.5 sm:p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/55">{s.label}</dt>
            <dd className={`mt-1 font-serif text-3xl ${s.tone}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2 overflow-x-auto sag-scroll-x pb-0.5" role="tablist" aria-label="Show requests">
        {chips.map((c) => (
          <button key={c.id} role="tab" aria-selected={filter === c.id} onClick={() => setFilter(c.id)}
            className={`shrink-0 h-10 px-4 rounded-full border text-sm font-semibold transition-colors cursor-pointer ${filter === c.id ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
            {c.label} <span className="opacity-70 tabular-nums">({groups[c.id].length})</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#4B1D3F]/10 px-6 py-12 text-center">
          <p className="font-serif text-2xl text-[#2A1A26]">{filter === 'decide' ? 'Nothing waiting for you' : 'No requests here'}</p>
          <p className="mt-1 text-sm text-[#2A1A26]/65">New return, exchange and cancellation requests from customers show up here the moment they are sent.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {shown.map((entry) => (
            <li key={`${entry.type}-${entry.row.order.orderNumber}-${entry.row.at}`}>
              {entry.type === 'cancel'
                ? <CancelCard row={entry.row} now={now} isNew={entry.row.state !== 'closed' && entry.row.at > seenBefore} onOpenOrder={() => openAdminOrderDetails(entry.row.order.orderNumber)} />
                : <ReturnCard row={entry.row} now={now} isNew={entry.row.state === 'requested' && entry.row.at > seenBefore} onOpenOrder={() => openAdminOrderDetails(entry.row.order.orderNumber)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ReturnCard: React.FC<{ row: ReturnRow; now: number; isNew: boolean; onOpenOrder: () => void }> = ({ row, now, isNew, onOpenOrder }) => {
  const { showToast } = useShop();
  const { applyServerOrder } = useAdmin();
  const { order, request, state, kind } = row;
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<Action | ''>('');
  const actions = (BUTTONS[state] || []).filter((a) => !(a === 'refund' && kind !== 'return') && !(a === 'exchange' && kind !== 'exchange'));
  const items: ReturnRequestItem[] = request.items?.length
    ? request.items
    : (order.items || []).map((item, line) => ({ line, name: item.product?.name || 'Item', image: item.product?.images?.[0] || '', size: item.selectedSize || '', qty: item.quantity, price: item.product?.price }));
  const value = items.reduce((sum, item) => sum + (Number(item.price ?? order.items?.[item.line]?.product?.price) || 0) * (Number(item.qty) || 1), 0);
  const phone = digits(order.customerMobile);
  const kindLabel = kind === 'exchange' ? 'Exchange' : 'Return';

  const act = async (action: Action) => {
    const text = note.trim();
    if (action === 'approve' && text.length < 3) { showToast('Write the next steps for the customer first (for example how to send the piece back).', 'error'); return; }
    if (action === 'reject' && text.length < 3) { showToast('Write a short note for the customer explaining why it is denied.', 'error'); return; }
    const question: Record<Action, string> = {
      approve: `Approve this ${kind} request for ${order.orderNumber}?${notify ? ' The customer is emailed your next steps.' : ''}`,
      reject: `Deny this ${kind} request for ${order.orderNumber}?${notify ? ' The customer is emailed your note.' : ''}`,
      receive: 'Mark the returned pieces as received?',
      refund: `Mark this return as refunded?\n\nFirst refund the payment in your Razorpay / PayU dashboard${order.paymentRef ? ` (payment ${order.paymentRef})` : ''}. This button only records it.`,
      exchange: 'Mark this exchange as completed (replacement sent)?',
    };
    if (!window.confirm(question[action])) return;
    setBusy(action);
    try {
      const result = await ordersApi<{ order?: any; customerEmailed: boolean | null }>('admin-return', { orderNumber: order.orderNumber, returnAction: action, note: text, notify });
      // Show the decision on the card now instead of waiting for the next refresh of the orders list
      if (result.order) applyServerOrder(result.order);
      setNote('');
      if (result.customerEmailed === false) showToast('Saved, but the email could not be sent. Please tell the customer on WhatsApp.', 'error');
      else showToast(`${kindLabel} ${action === 'reject' ? 'denied' : action === 'approve' ? 'approved' : 'updated'}${result.customerEmailed ? ' · customer emailed' : ''}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the request. Please try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <article className={`rounded-3xl bg-white border p-4 sm:p-6 ${state === 'requested' ? 'border-[#8A2E55]/25 shadow-[0_18px_40px_-30px_rgba(138,46,85,0.6)]' : 'border-[#4B1D3F]/10'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isNew && <span className="h-6 px-2.5 rounded-full bg-[#8A2E55] text-white text-[11px] font-bold inline-flex items-center">New</span>}
            <span className="h-6 px-2.5 rounded-full bg-[#4B1D3F] text-white text-[11px] font-semibold inline-flex items-center">{kindLabel}</span>
            <span className={`h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center ${statusTone(state)}`}>{RETURN_STATUS_LABEL[state] || state}</span>
            <span className="text-xs text-[#2A1A26]/60 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {ago(row.at, now)}</span>
          </div>
          <button type="button" onClick={onOpenOrder} className="mt-2 font-mono text-sm font-semibold text-[#4B1D3F] underline underline-offset-2 inline-flex items-center gap-1 cursor-pointer">
            {order.orderNumber} <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <p className="mt-1 text-sm text-[#2A1A26]"><span className="font-semibold">{order.customerName || 'Customer'}</span>{order.customerEmail ? <span className="text-[#2A1A26]/60"> · {order.customerEmail}</span> : null}</p>
        </div>
        {phone.length === 10 && (
          <div className="flex gap-2 shrink-0">
            <a href={`tel:+91${phone}`} className="h-10 px-3.5 rounded-full border border-[#4B1D3F]/15 text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8]"><Phone className="w-4 h-4" /> Call</a>
            <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi ${order.customerName || ''}, about your ${kind} request for order ${order.orderNumber} at Suit Aura Girls:`)}`} target="_blank" rel="noopener noreferrer"
              className="h-10 px-3.5 rounded-full border border-[#4B1D3F]/15 text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8]"><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
          </div>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ul className="space-y-2.5">
          {items.map((item, i) => (
            <li key={`${item.line}-${i}`} className="flex gap-3">
              <div className="w-14 h-[70px] shrink-0 rounded-xl overflow-hidden bg-[#F3EEF8] border border-[#4B1D3F]/10">
                {(item.image || order.items?.[item.line]?.product?.images?.[0]) && <img src={getCleanImageUrl(item.image || order.items?.[item.line]?.product?.images?.[0] || '', 160)} alt="" className="w-full h-full object-cover object-top" />}
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#2A1A26] leading-snug line-clamp-2">{item.name}</p>
                <p className="text-[#2A1A26]/70">
                  Size {item.size || 'one size'}{kind === 'exchange' && item.exchangeSize ? <> → <strong className="text-[#4B1D3F]">{item.exchangeSize}</strong></> : null} · Qty {item.qty}
                  {item.price ? ` · ₹${Number(item.price).toLocaleString('en-IN')}` : ''}
                </p>
              </div>
            </li>
          ))}
          {value > 0 && <li className="text-xs text-[#2A1A26]/60">Items value ₹{value.toLocaleString('en-IN')} (prices paid, before order discounts and shipping)</li>}
        </ul>
        <div className="text-sm space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">Reason</p>
          <p className="font-semibold text-[#2A1A26]">{request.reason || 'Not given'}</p>
          {request.details && <p className="text-[#2A1A26]/80 whitespace-pre-line break-words">{request.details}</p>}
          {(request.photos || []).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(request.photos || []).map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Customer photo ${i + 1}`} className="w-14 h-[70px] rounded-xl overflow-hidden border border-[#4B1D3F]/15 bg-white">
                  <img src={getCleanImageUrl(url, 160)} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {request.adminNote && <p className="text-xs text-[#2A1A26]/75 break-words"><strong>Your last note:</strong> {request.adminNote}</p>}
          {(request.history || []).length > 1 && (
            <p className="text-[11px] text-[#2A1A26]/60">{(request.history || []).map((h) => `${RETURN_STATUS_LABEL[h.status as ReturnRequestStatus] || h.status} ${when(h.at)}`).join(' → ')}</p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[#4B1D3F]/10 space-y-3">
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the customer"
            placeholder={state === 'requested'
              ? 'Note to the customer (required): the next steps to approve, e.g. "Please pack it with tags; pickup in 2 days" — or why it is denied.'
              : kind === 'return' ? 'Optional note, e.g. "Refund sent to your UPI today." (required to deny)' : 'Optional note, e.g. "New size shipped, tracking on WhatsApp." (required to deny)'}
            className="w-full px-4 py-3 border border-[#4B1D3F]/15 bg-white rounded-2xl text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-[#2A1A26]/80 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-[#4B1D3F]" /> Email the customer
            </label>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => {
                const primary = action === 'approve' || action === 'refund' || action === 'exchange';
                return (
                  <button key={action} type="button" onClick={() => act(action)} disabled={Boolean(busy)}
                    className={`h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${primary ? 'bg-[#4B1D3F] hover:bg-[#3B1532] text-white' : action === 'reject' ? 'border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700' : 'border border-[#4B1D3F]/20 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F]'}`}>
                    {busy === action ? <RefreshCw className="w-4 h-4 animate-spin" /> : action === 'reject' ? <X className="w-4 h-4" /> : action === 'approve' ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    {busy === action ? 'Saving…' : LABEL[action]}
                  </button>
                );
              })}
            </div>
          </div>
          {kind === 'return' && state !== 'requested' && (
            <p className="text-[11px] text-[#2A1A26]/60">Refund the money in your payment dashboard first{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then mark refunded. Stock is not changed automatically.</p>
          )}
        </div>
      )}
    </article>
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
  const statusClass = state === 'open' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : state === 'stale' ? 'bg-[#F7E4EA] text-[#8A2E55] border-[#8A2E55]/20'
      : request.outcome === 'kept' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15';

  return (
    <article className={`rounded-3xl bg-white border p-4 sm:p-6 ${state !== 'closed' ? 'border-rose-200 shadow-[0_18px_40px_-30px_rgba(138,46,85,0.6)]' : 'border-[#4B1D3F]/10'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isNew && <span className="h-6 px-2.5 rounded-full bg-[#8A2E55] text-white text-[11px] font-bold inline-flex items-center">New</span>}
            <span className="h-6 px-2.5 rounded-full bg-rose-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Cancellation request</span>
            <span className={`h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center ${statusClass}`}>{statusLabel}</span>
            <span className="text-xs text-[#2A1A26]/60 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {ago(row.at, now)}</span>
          </div>
          <button type="button" onClick={onOpenOrder} className="mt-2 max-w-full font-mono text-sm font-semibold text-[#4B1D3F] underline underline-offset-2 inline-flex items-center gap-1 cursor-pointer break-all text-left">
            {order.orderNumber} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>
          <p className="mt-1 text-sm text-[#2A1A26] break-words"><span className="font-semibold">{order.customerName || 'Customer'}</span>{order.customerEmail ? <span className="text-[#2A1A26]/60"> · {order.customerEmail}</span> : null}</p>
        </div>
        {phone.length === 10 && (
          <div className="flex gap-2 shrink-0">
            <a href={`tel:+91${phone}`} className="h-10 px-3.5 rounded-full border border-[#4B1D3F]/15 text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8]"><Phone className="w-4 h-4" /> Call</a>
            <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi ${order.customerName || ''}, about your cancellation request for order ${order.orderNumber} at Suit Aura Girls:`)}`} target="_blank" rel="noopener noreferrer"
              className="h-10 px-3.5 rounded-full border border-[#4B1D3F]/15 text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8]"><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
          </div>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <dl className="text-sm space-y-2 min-w-0">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">{paid ? 'Amount paid' : 'Order total'}</dt>
            <dd className="font-semibold text-[#2A1A26]">{amount}{paid ? '' : ` · payment ${order.paymentStatus}`}{pieces > 0 ? <span className="font-normal text-[#2A1A26]/60"> · {pieces} {pieces === 1 ? 'piece' : 'pieces'}</span> : null}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">Requested</dt>
            <dd className="text-[#2A1A26]">{formatOrderDate(request.at) || 'Date not recorded'}{request.handledAt ? <span className="text-[#2A1A26]/60"> · closed {formatOrderDate(request.handledAt)}</span> : null}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">Order status</dt>
            <dd className="text-[#2A1A26]">{order.status}</dd>
          </div>
        </dl>
        <div className="text-sm space-y-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">Reason</p>
          <p className="font-semibold text-[#2A1A26] whitespace-pre-line break-words">{request.reason || 'Not given'}</p>
          {state !== 'closed' && request.storeNotified === false && (
            <p className="text-sm text-rose-700">
              The email alert for this request could not be sent to the store email (email not set up, or it failed). Check the orders list for new requests.
            </p>
          )}
          {state === 'stale' && (
            <p className="text-sm text-[#2A1A26]/80">
              The customer asked to cancel, but the order is already {order.status}. Close the request so the customer no longer sees it as under review{orderStopped ? '.' : '; they are emailed that the order is going ahead.'}
            </p>
          )}
          {state === 'closed' && request.outcome === 'kept' && (
            <p className="text-sm text-[#2A1A26]/80">
              {!keptEmail
                ? 'The customer was not emailed about this (the email box was unticked). Tell them on WhatsApp if needed.'
                : keptEmail.ok
                  ? `The customer was emailed that the order is going ahead (${formatOrderDate(keptEmail.at)}).`
                  : 'The email to the customer failed. Please tell them on WhatsApp.'}
            </p>
          )}
          {state !== 'open' && order.status === 'Cancelled' && order.paymentStatus === 'Paid' && (
            <p className="text-sm text-[#2A1A26]/80">Payment is still marked Paid. After refunding in {gateway}, set the status to Refunded.</p>
          )}
        </div>
      </div>

      {state !== 'closed' && (
        <div className="mt-5 pt-4 border-t border-[#4B1D3F]/10 space-y-3">
          {!(state === 'stale' && orderStopped) && (
            <textarea rows={2} maxLength={1000} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} aria-label="Message to customer"
              placeholder='Message to customer (optional), e.g. "Your order is already being packed, so it will be delivered."'
              className="w-full px-4 py-3 border border-[#4B1D3F]/15 bg-white rounded-2xl text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {state === 'open' ? (
              <label className="flex items-center gap-2 text-sm text-[#2A1A26]/80 cursor-pointer">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-[#4B1D3F]" /> Email the customer when cancelling
              </label>
            ) : <span />}
            <div className="flex flex-wrap gap-2">
              {state === 'open' && (
                <button type="button" onClick={cancelOrder} disabled={Boolean(busy)}
                  className="h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 bg-[#4B1D3F] hover:bg-[#3B1532] text-white">
                  {busy === 'cancel' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {busy === 'cancel' ? 'Saving…' : 'Cancel order'}
                </button>
              )}
              <button type="button" onClick={keepOrder} disabled={Boolean(busy)}
                className="h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 border border-[#4B1D3F]/20 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F]">
                {busy === 'keep' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {busy === 'keep' ? 'Saving…' : state === 'open' ? 'Keep order' : 'Close request'}
              </button>
              {state === 'stale' && (
                <button type="button" onClick={onOpenOrder}
                  className="h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer bg-[#4B1D3F] hover:bg-[#3B1532] text-white">
                  Open order <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {state === 'open' && (
            <p className="text-sm text-[#2A1A26]/70">
              Cancelling returns the stock automatically and emails the customer (if the email box is ticked). {paid ? <>The money is not refunded automatically: refund {amount} from your {gateway} dashboard{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then set the order status to Refunded.</> : notPaidNote} Keeping the order closes the request and emails the customer that it is going ahead.
            </p>
          )}
        </div>
      )}
    </article>
  );
};
