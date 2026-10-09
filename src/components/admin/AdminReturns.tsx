import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { ordersApi } from '../../lib/api';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { ArrowRight, Check, Clock, ExternalLink, Phone, RefreshCw, RotateCcw, X } from 'lucide-react';
import { WhatsAppIcon } from '../BrandIcons';
import { EmptyState, KeyNumbers, PageTitle, Pill, adminUi } from './PaymentBadge';
import type { PillTone } from './PaymentBadge';
import { RETURN_STATUS_LABEL, returnRequestOf, returnStatusOf } from '../OrderProgress';
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

// The pieces below are shared with the cancellation cards (AdminCancellations.tsx)
export const ago = (iso: string, now: number) => {
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
export const digits = (phone: string) => String(phone || '').replace(/\D/g, '').slice(-10);

// Gold while the request waits or is moving, red (with the word) when it was denied, muted once finished
const statusTone = (state: ReturnRequestStatus): PillTone =>
  state === 'requested' || state === 'approved' || state === 'received' ? 'good'
    : state === 'rejected' ? 'danger'
      : 'muted';
/** Waiting requests first, then the ones in progress, then the closed ones. */
const stateRank = (state: ReturnRequestStatus) => (state === 'requested' ? 0 : state === 'approved' || state === 'received' ? 1 : 2);

// Shared pieces of the request cards (returns here, cancellations in AdminCancellations.tsx)
export const cardShell = adminUi.card;
/** "New" mark: a gold fill, so it carries dark text. */
export const newBadge = 'inline-flex items-center min-h-6 px-2.5 py-0.5 rounded-lg bg-brand text-[color:var(--sag-on-gold)] text-xs leading-4 font-semibold whitespace-nowrap';
export const contactBtn = `${adminUi.outline} px-4`;
export const orderLink = `${adminUi.link} mt-2.5 min-h-11 max-w-full text-[15px] font-semibold sag-num inline-flex items-center gap-1.5 break-all text-left`;
export const actionRow = 'flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none';
/** Small muted capitals above a value inside a request card. */
export const cardEyebrow = 'text-[11px] leading-4 font-medium uppercase tracking-[0.08em] text-ink-muted';

/**
 * Admin → Returns & exchanges. Customer requests arrive here live (the orders list is a live listener);
 * the admin approves or denies right on the card, then marks the piece received and the refund / exchange
 * done. Every step goes through the same server action as the order page.
 * Cancellation requests have their own page (AdminCancellations.tsx).
 */
export const AdminReturns: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminOrderDetails } = useRouter();
  const rows = useMemo(() => returnRows(orders), [orders]);
  const [filter, setFilter] = useState<Filter>('decide');
  const [now, setNow] = useState(() => Date.now());
  // "New" marks: requests newer than what this device last saw; the page counts as seen once opened
  const [seenBefore] = useState(readSeen);
  useEffect(() => { if (rows[0]?.at && rows[0].at > readSeen()) writeSeen(rows[0].at); }, [rows]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);

  const groups: Record<Filter, ReturnRow[]> = {
    decide: rows.filter((row) => row.state === 'requested'),
    progress: rows.filter((row) => row.state === 'approved' || row.state === 'received'),
    closed: rows.filter((row) => !['requested', 'approved', 'received'].includes(row.state)),
    // The waiting ones come first; each group keeps its newest-first order
    all: [...rows].sort((a, b) => stateRank(a.state) - stateRank(b.state)),
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
      <PageTitle
        title="Returns & exchanges"
        line={<>Customer return and exchange requests appear here live. Answer them right here; the customer sees your decision in their account and gets an email.</>}
      />

      <KeyNumbers
        label="Returns at a glance"
        items={[
          { label: 'Waiting for you', value: groups.decide.length, highlight: groups.decide.length > 0, note: groups.decide.length ? 'Approve or deny each one' : 'Nothing to decide' },
          { label: 'In progress', value: groups.progress.length, note: 'Approved, not finished yet' },
          { label: 'Closed', value: groups.closed.length, note: 'Refunded, exchanged or denied' },
        ]}
      />

      <div className={adminUi.chipRow} role="tablist" aria-label="Show requests">
        {chips.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} data-selected={filter === c.id} onClick={() => setFilter(c.id)} className={adminUi.chip}>
            {c.label} <span className="sag-num font-normal opacity-70">{groups[c.id].length}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<RotateCcw />}
          title={filter === 'decide' ? 'No returns waiting' : 'No requests here'}
          line="New return and exchange requests from customers show up here the moment they are sent. Cancellation requests are on the Cancellations page."
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <li key={`${row.order.orderNumber}-${row.at}`}>
              <ReturnCard row={row} now={now} isNew={row.state === 'requested' && row.at > seenBefore} onOpenOrder={() => openAdminOrderDetails(row.order.orderNumber)} />
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
    <article className={cardShell}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isNew && <span className={newBadge}>New</span>}
            <Pill>{kindLabel}</Pill>
            <Pill tone={statusTone(state)} dot>{RETURN_STATUS_LABEL[state] || state}</Pill>
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
            <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi ${order.customerName || ''}, about your ${kind} request for order ${order.orderNumber} at Suit Aura Girls:`)}`} target="_blank" rel="noopener noreferrer"
              className={contactBtn}><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
          </div>
        )}
      </header>

      <div className="mt-4 pt-4 border-t border-line grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <p className={`${cardEyebrow} mb-2`}>{kind === 'exchange' ? 'Pieces to exchange' : 'Pieces coming back'}</p>
          <ul className="space-y-2.5">
            {items.map((item, i) => (
              <li key={`${item.line}-${i}`} className="flex gap-3">
                <div className="w-14 aspect-[4/5] shrink-0 rounded-lg overflow-hidden bg-sunken">
                  {(item.image || order.items?.[item.line]?.product?.images?.[0]) && <img src={getCleanImageUrl(item.image || order.items?.[item.line]?.product?.images?.[0] || '', 160)} alt="" className="w-full h-full object-cover object-top" />}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink leading-snug line-clamp-2">{item.name}</p>
                  <p className="text-ink-muted sag-num">
                    Size {item.size || 'one size'}{kind === 'exchange' && item.exchangeSize ? <> → <strong className="text-ink">{item.exchangeSize}</strong></> : null} · Qty {item.qty}
                    {item.price ? ` · ₹${Number(item.price).toLocaleString('en-IN')}` : ''}
                  </p>
                </div>
              </li>
            ))}
            {value > 0 && <li className="text-xs text-ink-muted sag-num">Items value ₹{value.toLocaleString('en-IN')} (prices paid, before order discounts and shipping)</li>}
          </ul>
        </div>
        <div className="text-sm space-y-2 min-w-0">
          <p className={cardEyebrow}>Reason</p>
          <p className="font-semibold text-ink">{request.reason || 'Not given'}</p>
          {request.details && <p className="text-ink-muted whitespace-pre-line break-words">{request.details}</p>}
          {request.refundUpi && <p className="font-semibold text-ink break-all">Refund to UPI ID (cash on delivery order): {request.refundUpi}</p>}
          {(request.photos || []).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(request.photos || []).map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Customer photo ${i + 1}`} className="w-14 aspect-[4/5] rounded-lg overflow-hidden bg-sunken">
                  <img src={getCleanImageUrl(url, 160)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {request.adminNote && <p className="text-[13px] leading-[18px] text-ink-muted break-words"><strong className="font-semibold text-ink">Your last note:</strong> {request.adminNote}</p>}
          {(request.history || []).length > 1 && (
            <p className="text-xs leading-4 text-ink-muted">{(request.history || []).map((h) => `${RETURN_STATUS_LABEL[h.status as ReturnRequestStatus] || h.status} ${when(h.at)}`).join(' → ')}</p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line space-y-3">
          <p className={cardEyebrow}>Your answer</p>
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the customer"
            placeholder={state === 'requested'
              ? 'Note to the customer (required): the next steps to approve, e.g. "Please pack it with tags; pickup in 2 days" — or why it is denied.'
              : kind === 'return' ? 'Optional note, e.g. "Refund sent to your UPI today." (required to deny)' : 'Optional note, e.g. "New size shipped, tracking on WhatsApp." (required to deny)'}
            className={adminUi.textarea} />
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5">
            <label className={adminUi.checkRow}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className={adminUi.check} /> Email the customer
            </label>
            <div className={actionRow}>
              {/* "Deny" sits first, apart from the gold main action at the end */}
              {[...actions].sort((a, b) => Number(b === 'reject') - Number(a === 'reject')).map((action) => {
                const primary = action === 'approve' || action === 'refund' || action === 'exchange';
                return (
                  <button key={action} type="button" onClick={() => act(action)} disabled={Boolean(busy)}
                    className={primary ? adminUi.primary : action === 'reject' ? adminUi.danger : adminUi.outline}>
                    {busy === action ? <RefreshCw className="w-4 h-4 animate-spin" /> : action === 'reject' ? <X className="w-4 h-4" /> : action === 'approve' ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    {busy === action ? 'Saving…' : LABEL[action]}
                  </button>
                );
              })}
            </div>
          </div>
          {kind === 'return' && state !== 'requested' && (
            <p className="text-[13px] leading-[18px] text-ink-muted">Refund the money in your payment dashboard first{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then mark refunded. Stock is not changed automatically.</p>
          )}
        </div>
      )}
    </article>
  );
};
