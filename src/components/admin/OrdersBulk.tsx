import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Download, Loader2, MessageCircle, Package, Printer, Truck, X, XCircle, MinusCircle, Home } from 'lucide-react';
import { Order } from '../../types';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { adminUi } from './PaymentBadge';
import { SCRIM } from './adminShared';
import { printPackingSlips } from './AdminPackingSlip';
import { orderMessage } from './adminAlerts';
import { bucketOf, cancelWaiting, codConfirmMessage, downloadText, inr, ordersCsv, paymentHelpMessage, todayIst, waLink } from './orderOps';

/**
 * Work on many orders at once. Every change is the same server action as the order page (admin-update),
 * sent once per order, one after the other, with each order's own result shown. Orders a step does not fit
 * (already further on, unpaid, a cancellation request waiting) are left out and say why.
 */

type Step = 'Packed' | 'Shipped' | 'Delivered';

/** '' when the step fits the order, else why the order is left out. */
const whyNot = (order: Order, step: Step): string => {
  const bucket = bucketOf(order);
  if (bucket === 'unpaid') return 'Payment never completed';
  if (bucket === 'cancelled') return `Order is ${order.status}`;
  if (bucket === 'returns') return 'A return or exchange is open';
  if (cancelWaiting(order)) return 'Customer asked to cancel: answer that first';
  if (step === 'Packed') return bucket === 'topack' ? '' : `Already ${order.status}`;
  if (step === 'Shipped') return bucket === 'topack' || bucket === 'packed' ? '' : `Already ${order.status}`;
  return bucket === 'onway' ? '' : bucket === 'delivered' ? 'Already delivered' : 'Not shipped yet';
};

type RowState = 'ready' | 'running' | 'done' | 'failed' | 'skipped';
interface Row { order: Order; state: RowState; note: string }

type MessageKind = 'packed' | 'shipped' | 'delivered' | 'cod' | 'payment';
const MESSAGE_KINDS: { id: MessageKind; label: string }[] = [
  { id: 'cod', label: 'Confirm cash on delivery' },
  { id: 'packed', label: 'Order packed' },
  { id: 'shipped', label: 'Order shipped' },
  { id: 'delivered', label: 'Order delivered' },
  { id: 'payment', label: 'Payment did not finish' },
];
const messageFor = (order: Order, kind: MessageKind) =>
  kind === 'cod' ? codConfirmMessage(order) : kind === 'payment' ? paymentHelpMessage(order) : orderMessage(order, kind);
/** The message that fits most of the chosen orders. */
const likelyKind = (orders: Order[]): MessageKind => {
  const count = (test: (o: Order) => boolean) => orders.filter(test).length;
  const options: [MessageKind, number][] = [
    ['payment', count((o) => bucketOf(o) === 'unpaid')],
    ['cod', count((o) => o.payMode === 'cod' && bucketOf(o) === 'topack')],
    ['packed', count((o) => bucketOf(o) === 'packed' || (o.payMode !== 'cod' && bucketOf(o) === 'topack'))],
    ['shipped', count((o) => bucketOf(o) === 'onway')],
    ['delivered', count((o) => bucketOf(o) === 'delivered')],
  ];
  return options.sort((a, b) => b[1] - a[1])[0][0];
};

const STEP_ICON: Record<Step, React.ReactNode> = { Packed: <Package className="w-4 h-4" aria-hidden="true" />, Shipped: <Truck className="w-4 h-4" aria-hidden="true" />, Delivered: <Home className="w-4 h-4" aria-hidden="true" /> };

const Sheet: React.FC<{ title: string; titleId: string; onClose?: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, titleId, onClose, children, footer }) => (
  <div className={`fixed inset-0 z-[70] ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
      className="bg-surface w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh] flex flex-col shadow-[var(--sag-shadow-pop)]">
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-line">
        <h3 id={titleId} className={adminUi.h2}>{title}</h3>
        {onClose && <button type="button" onClick={onClose} className={`${adminUi.iconBtn} -mr-2 -mt-2`} aria-label="Close"><X className="w-5 h-5" /></button>}
      </div>
      <div className="px-5 sm:px-6 py-4 overflow-y-auto min-h-0 flex-1">{children}</div>
      <div className="px-5 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-line flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>
    </div>
  </div>
);

const STATE_ICON: Record<RowState, React.ReactNode> = {
  ready: <span className="w-4 h-4 rounded-full border-2 border-control" aria-hidden="true" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-ink" aria-hidden="true" />,
  done: <CheckCircle2 className="w-4 h-4 text-ok" aria-hidden="true" />,
  failed: <XCircle className="w-4 h-4 text-danger" aria-hidden="true" />,
  skipped: <MinusCircle className="w-4 h-4 text-ink-muted" aria-hidden="true" />,
};
const STATE_WORD: Record<RowState, string> = { ready: 'Ready', running: 'Saving', done: 'Done', failed: 'Failed', skipped: 'Left out' };

export const OrdersBulkBar: React.FC<{ selected: Order[]; onClear: () => void; onUnselect: (orderNumbers: string[]) => void }> = ({ selected, onClear, onUnselect }) => {
  const { updateOrderStatus, storeSettings, orders } = useAdmin();
  const { showToast } = useShop();
  const [step, setStep] = useState<Step | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [notify, setNotify] = useState(true);
  const [courier, setCourier] = useState('');
  const [awb, setAwb] = useState<Record<string, string>>({});
  const [waOpen, setWaOpen] = useState(false);
  const [waKind, setWaKind] = useState<MessageKind>('packed');
  const [waSent, setWaSent] = useState<Record<string, boolean>>({});

  // The courier used most recently, so shipping a batch usually needs no typing
  const lastCourier = useMemo(() => {
    const shipped = orders.filter((o) => String(o.courierPartner || '').trim()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return String(shipped[0]?.courierPartner || '').trim();
  }, [orders]);

  const open = (next: Step) => {
    setStep(next);
    setPhase('confirm');
    setNotify(true);
    setCourier(lastCourier);
    setAwb(Object.fromEntries(selected.map((o) => [o.orderNumber, o.trackingNumber || ''])));
    setRows(selected.map((order) => {
      const reason = whyNot(order, next);
      return { order, state: reason ? 'skipped' : 'ready', note: reason };
    }));
  };
  const close = () => {
    if (phase === 'running') return;
    if (phase === 'done') onUnselect(rows.filter((r) => r.state === 'done').map((r) => r.order.orderNumber));
    setStep(null);
  };

  const ready = rows.filter((r) => r.state === 'ready');
  const shippingWithoutCourier = step === 'Shipped' && !courier.trim();

  const run = async () => {
    if (!step) return;
    if (shippingWithoutCourier) { showToast('Type the courier name first.', 'error'); return; }
    setPhase('running');
    const list = rows.map((r) => ({ ...r }));
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].state !== 'ready') continue;
      list[i] = { ...list[i], state: 'running', note: '' };
      setRows([...list]);
      const order = list[i].order;
      try {
        if (step === 'Shipped') {
          const number = (awb[order.orderNumber] || '').trim();
          await updateOrderStatus(order.orderNumber, 'Shipped', number || undefined, undefined, { courierPartner: courier.trim(), notify });
        } else {
          await updateOrderStatus(order.orderNumber, step, undefined, undefined, { notify });
        }
        list[i] = { ...list[i], state: 'done', note: notify ? `Saved as ${step} · customer emailed` : `Saved as ${step}` };
      } catch (err: any) {
        list[i] = { ...list[i], state: 'failed', note: err?.message || 'Could not save' };
      }
      setRows([...list]);
    }
    setPhase('done');
    const done = list.filter((r) => r.state === 'done').length;
    const failed = list.filter((r) => r.state === 'failed').length;
    showToast(failed ? `${done} saved, ${failed} failed. See the list.` : `${done} ${done === 1 ? 'order' : 'orders'} saved as ${step}.`, failed ? 'error' : 'success');
  };

  const printSlips = () => {
    const ok = printPackingSlips(selected, { name: storeSettings?.storeName, address: storeSettings?.address, phone: storeSettings?.phone });
    if (!ok) showToast('The browser did not allow printing. Please try again.', 'error');
  };
  const exportCsv = () => {
    downloadText(`orders-${todayIst()}-${selected.length}.csv`, ordersCsv(selected));
    showToast(`${selected.length} ${selected.length === 1 ? 'order' : 'orders'} saved as a CSV file.`, 'success');
  };
  const openWhatsApp = () => { setWaKind(likelyKind(selected)); setWaSent({}); setWaOpen(true); };

  const done = rows.filter((r) => r.state === 'done').length;
  const failed = rows.filter((r) => r.state === 'failed').length;
  const total = rows.filter((r) => r.state !== 'skipped').length;
  const processed = rows.filter((r) => r.state === 'done' || r.state === 'failed').length;
  const barBtn = 'h-10 px-3.5 rounded-full border border-white/25 text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:bg-white/10';

  if (selected.length === 0) return null;
  return (
    <>
      <div id="orders-bulk-bar" role="toolbar" aria-label="Work on the selected orders"
        className="sticky bottom-3 z-30 rounded-[22px] bg-brand text-[color:var(--sag-on-gold)] shadow-[var(--sag-shadow-pop)] px-3 py-2.5 flex items-center gap-2 min-w-0 animate-in fade-in slide-in-from-bottom-2">
        <span className="shrink-0 pl-1 pr-1 text-sm font-bold sag-num" aria-live="polite">{selected.length} selected</span>
        <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto sag-scroll-x">
          <button type="button" onClick={() => open('Packed')} className={barBtn}>{STEP_ICON.Packed} Mark packed</button>
          <button type="button" onClick={() => open('Shipped')} className={barBtn}>{STEP_ICON.Shipped} Mark shipped</button>
          <button type="button" onClick={() => open('Delivered')} className={barBtn}>{STEP_ICON.Delivered} Mark delivered</button>
          <button type="button" onClick={printSlips} className={barBtn}><Printer className="w-4 h-4" aria-hidden="true" /> Packing slips</button>
          <button type="button" onClick={openWhatsApp} className={barBtn}><MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp</button>
          <button type="button" onClick={exportCsv} className={barBtn}><Download className="w-4 h-4" aria-hidden="true" /> CSV</button>
        </div>
        <button type="button" onClick={onClear} className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center hover:bg-white/10 cursor-pointer" aria-label="Clear the selection" title="Clear the selection">
          <X className="w-5 h-5" />
        </button>
      </div>

      {step && (
        <Sheet
          titleId="orders-bulk-title"
          title={phase === 'done' ? `Done: ${done} of ${total} saved` : `Mark ${total} ${total === 1 ? 'order' : 'orders'} ${step.toLowerCase()}`}
          onClose={phase === 'running' ? undefined : close}
          footer={phase === 'confirm' ? (
            <>
              <button type="button" onClick={close} className={adminUi.outline}>Back</button>
              <button type="button" id="orders-bulk-start" onClick={run} disabled={ready.length === 0 || shippingWithoutCourier} className={`${adminUi.primary} disabled:opacity-50`}>
                {STEP_ICON[step]} Mark {ready.length} {step.toLowerCase()}
              </button>
            </>
          ) : (
            <button type="button" id="orders-bulk-close" onClick={close} disabled={phase === 'running'} className={`${adminUi.primary} disabled:opacity-50`}>
              {phase === 'running' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving {processed + 1} of {total}…</> : 'Close'}
            </button>
          )}
        >
          {phase === 'confirm' && (
            <div className="space-y-3 mb-4">
              <p className="text-sm leading-5 text-ink-muted">
                Each order is saved one by one, exactly as if you changed it on its own page.
                {rows.some((r) => r.state === 'skipped') && ' Orders this step does not fit are left out and say why.'}
              </p>
              {step === 'Shipped' && (
                <label className="block">
                  <span className={adminUi.label}>Courier for all of them <span className="text-danger">*</span></span>
                  <input id="orders-bulk-courier" value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={80} placeholder="e.g. Delhivery, DTDC, India Post" className={`${adminUi.field} w-full`} />
                  <span className={`block ${adminUi.hint}`}>Type each tracking (AWB) number below if you have it; a known courier gets its tracking link by itself.</span>
                </label>
              )}
              <label className={adminUi.checkRow}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className={adminUi.check} />
                Email each customer about it
              </label>
            </div>
          )}
          {phase !== 'confirm' && (
            <div className="mb-4">
              <div className="h-2 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed} aria-label="Orders saved">
                <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${total ? (processed / total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted sag-num">{processed} of {total} done{failed ? ` · ${failed} failed` : ''}</p>
            </div>
          )}
          <ul id="orders-bulk-results" className="divide-y divide-line -my-1">
            {rows.map((row) => (
              <li key={row.order.orderNumber} data-state={row.state} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="shrink-0 w-4 flex justify-center">{STATE_ICON[row.state]}</span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-sm leading-5 font-semibold text-ink sag-num">{row.order.orderNumber} <span className="font-normal text-ink-muted">· {row.order.customerName}</span></span>
                  <span className={`block text-xs leading-4 ${row.state === 'failed' ? 'text-danger font-medium' : 'text-ink-muted'}`}>
                    <span className="sr-only">{STATE_WORD[row.state]}: </span>{row.note || `${row.order.status} · ${inr(row.order.finalTotal)}`}
                  </span>
                </span>
                {step === 'Shipped' && phase === 'confirm' && row.state === 'ready' && (
                  <input value={awb[row.order.orderNumber] || ''} onChange={(e) => setAwb((s) => ({ ...s, [row.order.orderNumber]: e.target.value }))} maxLength={80}
                    placeholder="AWB (optional)" aria-label={`Tracking number for ${row.order.orderNumber}`} className={`${adminUi.field} w-full sm:w-44 font-mono`} />
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {waOpen && (
        <Sheet titleId="orders-wa-title" title="WhatsApp, one by one" onClose={() => setWaOpen(false)}
          footer={<button type="button" onClick={() => setWaOpen(false)} className={adminUi.primary}>Done</button>}>
          <p className="text-sm leading-5 text-ink-muted">Tap each customer to open WhatsApp with the message typed in, then send it from your phone. Nothing is sent by itself.</p>
          <label className="block mt-3">
            <span className={adminUi.label}>Message</span>
            <select id="orders-wa-kind" value={waKind} onChange={(e) => setWaKind(e.target.value as MessageKind)} className={`${adminUi.select} w-full`}>
              {MESSAGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          {selected[0] && <p className={`${adminUi.inset} mt-3 text-[13px] leading-[18px] text-ink whitespace-pre-line break-words`}>{messageFor(selected[0], waKind)}</p>}
          <ul className="mt-3 divide-y divide-line">
            {selected.map((order) => {
              const link = waLink(order, messageFor(order, waKind));
              const sent = waSent[order.orderNumber];
              return (
                <li key={order.orderNumber} className="py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-5 font-semibold text-ink truncate">{order.customerName || 'Customer'}</span>
                    <span className="block text-xs leading-4 text-ink-muted sag-num truncate">{order.orderNumber} · {order.status}</span>
                  </span>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setWaSent((s) => ({ ...s, [order.orderNumber]: true }))}
                      className={`${sent ? adminUi.outlineSmall : adminUi.primarySmall} shrink-0`}>
                      {sent ? <><Check className="w-4 h-4" aria-hidden="true" /> Opened</> : <><MessageCircle className="w-4 h-4" aria-hidden="true" /> Open</>}
                    </a>
                  ) : <span className="text-xs leading-4 text-ink-muted shrink-0">No valid mobile</span>}
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}
    </>
  );
};
