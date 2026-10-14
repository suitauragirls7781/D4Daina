import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, Copy, IndianRupee, Loader2, XCircle } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { Order } from '../../types';
import { Panel, Pill, adminUi } from './PaymentBadge';
import { SCRIM } from './adminShared';

/**
 * The money side of orders in the admin panel, in one place:
 * - why the store cancelled an order (asked every time an order is cancelled, saved on the order);
 * - refunds still to be made (cancelled orders whose payment is still marked Paid);
 * - why payments did not finish (what the payment window reported, saved on unpaid orders).
 * Every number is counted from the store's own orders. Refunds are made by the owner in the payment
 * dashboard; nothing here moves money.
 */

export const CANCEL_REASONS = [
  'Out of stock',
  'Customer asked on call or WhatsApp',
  'Customer could not be reached',
  'Courier does not deliver to this PIN code',
  'Address or phone number is wrong',
  'Duplicate order',
  'Looks like a fake order',
  'Cash on delivery not possible for this order',
] as const;
const OTHER = 'Other';

const rupees = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const gatewayName = (order: Order) => (order.paymentMethod === 'payu' ? 'PayU' : 'Razorpay');
const DAY = 24 * 60 * 60 * 1000;
const when = (value?: string) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
};

/** What was really paid online for the order: the advance of a cash-on-delivery order, else the whole total. */
export const paidOnline = (order: Order) => (order.payMode === 'cod' ? Number(order.codAdvance) || 0 : Number(order.finalTotal) || 0);

/** Cancelled orders whose payment is still marked Paid: money the store still has to send back. Oldest first. */
export const refundsToDo = (orders: Order[]): Order[] =>
  orders
    .filter((o) => !o.testPayment && o.status === 'Cancelled' && o.paymentStatus === 'Paid' && paidOnline(o) > 0)
    .sort((a, b) => String(a.cancelledAt || a.date).localeCompare(String(b.cancelledAt || b.date)));

/** When the order was cancelled: saved by the server since 2026-10-13, read from the timeline before that. */
const cancelledAtOf = (order: Order) => order.cancelledAt || [...(order.timeline || [])].reverse().find((t) => t.status === 'Cancelled')?.at || '';

// ---------------------------------------------------------------- why an order is cancelled

/**
 * Asks why the order is being cancelled, before any cancel is sent. `ask(order)` resolves with the reason, or
 * null when the owner backs out. Render `dialog` once in the page. A cancellation the customer asked for
 * starts with that as its reason.
 */
export const useCancelReason = () => {
  const [order, setOrder] = useState<Order | null>(null);
  const [picked, setPicked] = useState('');
  const [other, setOther] = useState('');
  const answer = useRef<((reason: string | null) => void) | null>(null);

  const ask = (target: Order): Promise<string | null> => new Promise((resolve) => {
    answer.current?.(null);
    answer.current = resolve;
    const asked = target.cancelRequest && !target.cancelRequest.handledAt;
    setPicked(asked ? 'Customer asked to cancel' : '');
    setOther('');
    setOrder(target);
  });
  const close = (reason: string | null) => { answer.current?.(reason); answer.current = null; setOrder(null); };

  const reason = picked === OTHER ? other.trim() : picked;
  const paid = order?.paymentStatus === 'Paid';
  const choices = order?.cancelRequest && !order.cancelRequest.handledAt ? ['Customer asked to cancel', ...CANCEL_REASONS] : [...CANCEL_REASONS];

  const dialog = order ? (
    <div className={`fixed inset-0 z-[70] ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`} onClick={() => close(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-reason-title" onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 max-h-[92vh] overflow-y-auto shadow-[var(--sag-shadow-pop)]">
        <h3 id="cancel-reason-title" className={adminUi.h2}>Cancel order {order.orderNumber}?</h3>
        <p className="mt-1.5 text-sm leading-5 text-ink-muted">
          Its stock goes back to inventory.{' '}
          {paid
            ? <>This order is <span className="font-semibold text-ink">paid</span>: after cancelling, refund <span className="font-semibold text-ink sag-num">{rupees(paidOnline(order))}</span> from your {gatewayName(order)} dashboard. It stays in “Refunds to do” until you mark it refunded.</>
            : 'No payment was received, so there is nothing to refund.'}
        </p>
        <fieldset className="mt-4">
          <legend className={adminUi.label}>Why is it being cancelled? <span className="text-danger">*</span></legend>
          <div className="mt-1 grid gap-1">
            {[...choices, OTHER].map((choice) => (
              <label key={choice} className={`${adminUi.checkRow} rounded-[14px] px-3 ${picked === choice ? 'bg-sunken' : ''}`}>
                <input type="radio" name="cancel-reason" value={choice} checked={picked === choice} onChange={() => setPicked(choice)} className={adminUi.check} />
                <span className="min-w-0">{choice}</span>
              </label>
            ))}
          </div>
          {picked === OTHER && (
            <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} maxLength={140} placeholder="Write the reason in a few words" aria-label="Other reason" className={`${adminUi.field} mt-2 w-full`} />
          )}
        </fieldset>
        <p className={adminUi.hint}>Only you see this reason. It is kept on the order and counted in Cancellations.</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={() => close(null)} className={adminUi.outline}>Keep the order</button>
          <button type="button" id="cancel-reason-confirm" disabled={!reason} onClick={() => close(reason)} className={`${adminUi.danger} disabled:opacity-50`}>
            <XCircle className="w-4 h-4" aria-hidden="true" /> Cancel the order
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, dialog };
};

// ---------------------------------------------------------------- refunds still to be made

/**
 * Cancelled orders whose payment is still marked Paid. The owner refunds in the payment dashboard, then
 * presses "Mark refunded" here (the same server action as setting the order to Refunded on its page).
 */
export const RefundsToDoPanel: React.FC<{ id?: string; limit?: number }> = ({ id = 'admin-refunds-todo', limit }) => {
  const { orders = [], updateOrderStatus, ordersLoaded } = useAdmin() as ReturnType<typeof useAdmin> & { ordersLoaded?: boolean };
  const { showToast } = useShop();
  const { openAdminOrderDetails, openAdminTab } = useRouter();
  const rows = useMemo(() => refundsToDo(orders), [orders]);
  const [busy, setBusy] = useState('');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const total = rows.reduce((sum, o) => sum + paidOnline(o), 0);
  const shown = limit ? rows.slice(0, limit) : rows;

  const markRefunded = async (order: Order) => {
    const amount = rupees(paidOnline(order));
    if (!window.confirm(`Have you already refunded ${amount} for order ${order.orderNumber} in your ${gatewayName(order)} dashboard?\n\nOK marks the order Refunded and emails the customer. Press Cancel if the money has not been sent yet.`)) return;
    setBusy(order.orderNumber);
    try {
      await updateOrderStatus(order.orderNumber, 'Refunded', order.trackingNumber || '', order.notes || '', { courierPartner: order.courierPartner || '', refundRef: (refs[order.orderNumber] || '').trim() });
      showToast(`Order ${order.orderNumber} marked refunded.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not mark the order refunded. Please try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Panel
      id={id}
      icon={<IndianRupee />}
      title={<>Refunds to do {rows.length > 0 && <span className="sag-num font-normal text-ink-muted">({rows.length})</span>}</>}
      hint="Cancelled orders whose payment is still with you. Refund each one in your payment dashboard, then mark it here."
      action={rows.length > 0 ? <p className="sag-num text-[22px] leading-7 font-extrabold text-sale">{rupees(total)}</p> : undefined}
    >
      {ordersLoaded === false ? (
        <p className="text-sm leading-5 text-ink-muted">Loading orders…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm leading-5 text-ink">No refund is waiting. Every cancelled order is either unpaid or already marked refunded.</p>
      ) : (
        <>
          <ul className="divide-y divide-line -my-1">
            {shown.map((order) => {
              const cancelled = cancelledAtOf(order);
              const days = cancelled ? Math.floor((Date.now() - new Date(cancelled).getTime()) / DAY) : 0;
              return (
                <li key={order.orderNumber} className="py-3.5 flex flex-wrap items-start gap-x-4 gap-y-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
                      <button type="button" onClick={() => openAdminOrderDetails(order.orderNumber)} className={`${adminUi.link} sag-num`}>{order.orderNumber}</button>
                      <span className="sag-num font-extrabold text-ink">{rupees(paidOnline(order))}</span>
                      {order.payMode === 'cod' && <Pill tone="muted">COD advance</Pill>}
                      {cancelled && <Pill tone={days >= 3 ? 'danger' : 'muted'}>{days === 0 ? 'Cancelled today' : `Waiting ${days} ${days === 1 ? 'day' : 'days'}`}</Pill>}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted break-words">
                      {order.customerName || order.customerEmail}{order.customerMobile ? ` · ${order.customerMobile}` : ''}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted break-words">
                      Cancelled {when(cancelled) || 'date not recorded'}{order.cancelReason ? ` · ${order.cancelReason}` : ''}{order.paymentRef ? ` · payment ${order.paymentRef}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.paymentRef && (
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(order.paymentRef).then(() => showToast('Payment ID copied. Paste it in the payment dashboard to find the payment.', 'success'), () => showToast('Could not copy the payment ID.', 'error')); }}
                        className={`${adminUi.outlineSmall} px-3`} title="Copy the payment ID to find it in the payment dashboard">
                        <Copy className="w-4 h-4" aria-hidden="true" /> Payment ID
                      </button>
                    )}
                    <input value={refs[order.orderNumber] || ''} onChange={(e) => setRefs((state) => ({ ...state, [order.orderNumber]: e.target.value }))} maxLength={60}
                      placeholder="Refund ID (optional)" aria-label={`Refund ID for ${order.orderNumber}`} className={`${adminUi.field} w-44`} />
                    <button type="button" onClick={() => markRefunded(order)} disabled={busy === order.orderNumber} className={adminUi.primarySmall}>
                      {busy === order.orderNumber && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Mark refunded
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {limit && rows.length > limit && (
            <button type="button" onClick={() => openAdminTab('cancellations')} className={`mt-3 inline-flex items-center gap-1 ${adminUi.link}`}>See all {rows.length} refunds <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></button>
          )}
        </>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- why orders were cancelled

/** Cancelled orders of the last 30 days, counted by reason. Orders cancelled before reasons were asked say so. */
export const CancelReasonsPanel: React.FC = () => {
  const { orders = [] } = useAdmin();
  const data = useMemo(() => {
    const since = Date.now() - 30 * DAY;
    const recent = orders.filter((o) => !o.testPayment && o.status === 'Cancelled' && new Date(cancelledAtOf(o) || o.date).getTime() >= since);
    // An unpaid checkout attempt that was cancelled is not a lost sale: only orders that were paid are counted
    const paid = recent.filter((o) => Boolean(o.paidAt) || o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded');
    const counts = new Map<string, { count: number; value: number }>();
    paid.forEach((o) => {
      const key = o.cancelReason || (o.cancelRequest ? 'Customer asked to cancel' : 'No reason recorded');
      const entry = counts.get(key) || { count: 0, value: 0 };
      entry.count += 1; entry.value += Number(o.finalTotal) || 0;
      counts.set(key, entry);
    });
    return { paid: paid.length, value: paid.reduce((sum, o) => sum + (Number(o.finalTotal) || 0), 0), rows: [...counts.entries()].sort((a, b) => b[1].count - a[1].count) };
  }, [orders]);

  return (
    <Panel id="admin-cancel-reasons" icon={<XCircle />} title="Why paid orders were cancelled" hint="The last 30 days. Only orders whose payment was received are counted.">
      {data.paid === 0 ? (
        <p className="text-sm leading-5 text-ink">No paid order was cancelled in the last 30 days.</p>
      ) : (
        <>
          <p className="text-sm leading-5 text-ink"><span className="sag-num font-extrabold">{data.paid}</span> paid {data.paid === 1 ? 'order' : 'orders'} cancelled, worth <span className="sag-num font-extrabold">{rupees(data.value)}</span>.</p>
          <ul className="mt-3 space-y-2">
            {data.rows.map(([reason, entry]) => (
              <li key={reason} className="text-sm leading-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 break-words ${reason === 'No reason recorded' ? 'text-ink-muted' : 'text-ink'}`}>{reason}</span>
                  <span className="shrink-0 sag-num text-ink-muted"><span className="font-bold text-ink">{entry.count}</span> · {rupees(entry.value)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-sunken overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, Math.round((entry.count / data.paid) * 100))}%` }} /></div>
              </li>
            ))}
          </ul>
          {data.rows.some(([reason]) => reason === 'No reason recorded') && (
            <p className={adminUi.hint}>“No reason recorded” are orders cancelled before the panel started asking for a reason (13 Oct 2026).</p>
          )}
        </>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------- why payments did not finish

/**
 * Checkout attempts of the last 7 days that reached the payment window and were not paid, with what the
 * payment window reported. The report is saved from 12 Oct 2026; older attempts carry none.
 */
export const PaymentProblemsPanel: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminTab } = useRouter();
  const data = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    const recent = orders.filter((o) => !o.testPayment && new Date(o.date).getTime() >= since);
    const paid = recent.filter((o) => Boolean(o.paidAt) || o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded');
    const unpaid = recent.filter((o) => !paid.includes(o));
    const shoppers = new Set(unpaid.map((o) => o.customerMobile || o.customerEmail)).size;
    const tries = unpaid.flatMap((o) => (o.payTries || []).map((t) => ({ ...t, cod: o.payMode === 'cod' })));
    const noted = unpaid.filter((o) => (o.payTries || []).length > 0).length;
    const count = <T,>(list: T[], key: (item: T) => string) => {
      const map = new Map<string, number>();
      list.forEach((item) => { const k = key(item); if (k) map.set(k, (map.get(k) || 0) + 1); });
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };
    const failed = tries.filter((t) => t.kind === 'failed');
    return {
      started: recent.length, paid: paid.length, unpaid: unpaid.length, shoppers, noted,
      cod: unpaid.filter((o) => o.payMode === 'cod').length,
      closed: tries.filter((t) => t.kind === 'closed').length,
      failed: failed.length,
      reasons: count(failed, (t) => t.reason || t.code || 'No reason given').slice(0, 5),
      browsers: count(tries, (t) => t.browser || ''),
    };
  }, [orders]);

  return (
    <Panel id="admin-payment-problems" icon={<AlertCircle />} title="Payments that did not finish" hint="The last 7 days: shoppers who pressed Pay and did not complete the payment."
      action={<button type="button" onClick={() => openAdminTab('orders')} className={`inline-flex items-center gap-1 ${adminUi.link}`}>Open orders <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></button>}>
      {data.started === 0 ? (
        <p className="text-sm leading-5 text-ink">No checkout reached the payment window in the last 7 days.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Pressed Pay', value: data.started, note: 'orders started' },
              { label: 'Paid', value: data.paid, note: `${Math.round((data.paid / data.started) * 100)}% of them` },
              { label: 'Did not pay', value: data.unpaid, note: `${data.shoppers} ${data.shoppers === 1 ? 'shopper' : 'shoppers'}`, bad: data.unpaid > data.paid },
            ].map((item) => (
              <div key={item.label} className={adminUi.inset}>
                <dt className="text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted">{item.label}</dt>
                <dd className={`mt-0.5 sag-num text-[24px] leading-7 font-extrabold ${item.bad ? 'text-sale' : 'text-ink'}`}>{item.value}</dd>
                <dd className="text-xs leading-4 text-ink-muted sag-num">{item.note}</dd>
              </div>
            ))}
          </dl>
          {data.unpaid > 0 && (
            <p className="mt-3 text-sm leading-5 text-ink sag-num">
              Of the unpaid ones, {data.cod} {data.cod === 1 ? 'was the advance of a cash-on-delivery order' : 'were advances of cash-on-delivery orders'} and {data.unpaid - data.cod} {data.unpaid - data.cod === 1 ? 'was a full online payment' : 'were full online payments'}.
            </p>
          )}
          {data.noted === 0 ? (
            <p className={adminUi.hint}>What the payment window reported is saved for new attempts from 12 Oct 2026. None of these attempts has a report yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className={adminUi.label}>What happened ({data.noted} of {data.unpaid} attempts have a report)</p>
                <ul className="space-y-1.5 text-sm leading-5 text-ink sag-num">
                  <li className="flex justify-between gap-3"><span>Shopper closed the payment window</span><span className="font-bold">{data.closed}</span></li>
                  <li className="flex justify-between gap-3"><span>Payment failed</span><span className="font-bold">{data.failed}</span></li>
                </ul>
                {data.browsers.length > 0 && (
                  <>
                    <p className={`${adminUi.label} mt-4`}>Where they were</p>
                    <ul className="space-y-1.5 text-sm leading-5 text-ink sag-num">
                      {data.browsers.map(([browser, n]) => <li key={browser} className="flex justify-between gap-3"><span className="first-letter:uppercase">{browser}</span><span className="font-bold">{n}</span></li>)}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <p className={adminUi.label}>Why payments failed</p>
                {data.reasons.length === 0 ? <p className="text-sm leading-5 text-ink-muted">No failed payment was reported.</p> : (
                  <ul className="space-y-1.5 text-sm leading-5 text-ink">
                    {data.reasons.map(([reason, n]) => <li key={reason} className="flex justify-between gap-3"><span className="min-w-0 break-words">{reason}</span><span className="shrink-0 sag-num font-bold">{n}</span></li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};
