import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LucideIcon, Bell, CheckCheck, ChevronRight, PackageOpen, RotateCcw, ShoppingBag, Wallet, X, XCircle } from 'lucide-react';
import type { Order, Product } from '../../types';
import { rupees } from './adminStats';
import { refundsToDo } from './orderMoney';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { isLowStock } from '../../utils/inventory';

/**
 * The notification centre: everything that is waiting for the owner, built only from the live orders and the
 * catalogue (paid orders to pack, cancellation and return requests, refunds still to send, styles low on stock).
 * "Read" is remembered in this browser; an item leaves the list by itself once it is handled.
 */

export type NoteKind = 'order' | 'cancel' | 'return' | 'refund' | 'stock';

export interface AdminNote {
  key: string;
  kind: NoteKind;
  title: string;
  line: string;
  /** When it happened (ISO), for "5 min ago". */
  at: string;
  side?: string;
  /** Where a tap goes. */
  target: { tab?: string; order?: string; product?: string };
}

const KIND: Record<NoteKind, { label: string; icon: LucideIcon; tone: string }> = {
  order: { label: 'Orders to pack', icon: ShoppingBag, tone: 'bg-ok-tint text-ok' },
  cancel: { label: 'Cancellation requests', icon: XCircle, tone: 'bg-highlight text-sale' },
  return: { label: 'Return and exchange requests', icon: RotateCcw, tone: 'bg-highlight text-sale' },
  refund: { label: 'Refunds to send', icon: Wallet, tone: 'bg-danger-tint text-danger' },
  stock: { label: 'Low on stock', icon: PackageOpen, tone: 'bg-sunken text-ink' },
};
const ORDER_OF: NoteKind[] = ['cancel', 'return', 'refund', 'order', 'stock'];

const SEEN_KEY = 'sag_admin_seen_notes';
const readSeen = (): Set<string> => {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
};

/** "just now", "12 min ago", "3 h ago", "2 days ago" (never a time in the future). */
export const timeAgo = (iso: string) => {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

const toPack = (o: Order) => !o.testPayment && o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Pending' || String(o.status) === 'Paid');

/** Every waiting item, newest first inside each kind. */
export const buildNotes = (orders: Order[], products: Product[], lowStockThreshold: number): AdminNote[] => {
  const notes: AdminNote[] = [];
  waitingCancelRows(orders).forEach((r) => notes.push({
    key: `cancel|${r.order.orderNumber}|${r.at}`, kind: 'cancel', at: r.at,
    title: `Cancel request · ${r.order.orderNumber}`,
    line: `${r.order.customerName || 'Customer'} asked to cancel. Cancel it or keep the order.`,
    side: rupees(Number(r.order.finalTotal) || 0), target: { tab: 'cancellations' },
  }));
  returnRows(orders).filter((r) => r.state === 'requested').forEach((r) => notes.push({
    key: `return|${r.order.orderNumber}|${r.at}`, kind: 'return', at: r.at,
    title: `${r.kind === 'exchange' ? 'Exchange' : 'Return'} request · ${r.order.orderNumber}`,
    line: `${r.order.customerName || 'Customer'} is waiting for your answer.`,
    target: { tab: 'returns' },
  }));
  refundsToDo(orders).forEach((o) => notes.push({
    key: `refund|${o.orderNumber}`, kind: 'refund', at: String(o.cancelledAt || o.date || ''),
    title: `Refund to send · ${o.orderNumber}`,
    line: `Cancelled but still marked paid. Send the money back, then press "Mark refunded".`,
    side: rupees(Number(o.finalTotal) || 0), target: { tab: 'cancellations' },
  }));
  orders.filter(toPack).forEach((o) => notes.push({
    key: `order|${o.orderNumber}`, kind: 'order', at: String(o.paidAt || o.date || ''),
    title: `New order · ${o.orderNumber}`,
    line: [o.customerName || 'Customer', o.deliveryAddress?.city, o.payMode === 'cod' ? `COD · collect ${rupees(Number(o.codDue) || 0)}` : 'Paid online'].filter(Boolean).join(' · '),
    side: rupees(Number(o.finalTotal) || 0), target: { order: o.orderNumber },
  }));
  products
    .filter((p) => !p.hidden && p.productType !== 'accessory' && isLowStock(p, lowStockThreshold))
    .sort((a, b) => Number(a.stockQuantity ?? 0) - Number(b.stockQuantity ?? 0))
    .forEach((p) => {
      const left = Math.max(0, Number(p.stockQuantity ?? 0));
      notes.push({
        key: `stock|${p.id}|${left}`, kind: 'stock', at: '',
        title: p.name,
        line: !p.inStock || left === 0 ? 'Sold out on the store' : `Only ${left} left`,
        target: { product: p.id },
      });
    });
  return notes.sort((a, b) => ORDER_OF.indexOf(a.kind) - ORDER_OF.indexOf(b.kind) || String(b.at).localeCompare(String(a.at)));
};

/** The notes, which of them are unread, and "mark as read". Stock never counts as unread (it is a standing list). */
export const useAdminNotes = (orders: Order[], products: Product[], lowStockThreshold: number) => {
  const notes = useMemo(() => buildNotes(orders, products, lowStockThreshold), [orders, products, lowStockThreshold]);
  const [seen, setSeen] = useState<Set<string>>(readSeen);
  const unread = notes.filter((n) => n.kind !== 'stock' && !seen.has(n.key));
  const markRead = useCallback((keys: string[]) => {
    setSeen((old) => {
      const next = new Set(old);
      keys.forEach((k) => next.add(k));
      // Only keys of items still waiting are kept, so the list never grows without end
      const live = new Set(notes.map((n) => n.key));
      const kept = [...next].filter((k) => live.has(k));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(kept)); } catch { /* fine for this visit */ }
      return new Set(kept);
    });
  }, [notes]);
  return { notes, unread, seen, markRead };
};

type Filter = 'all' | 'orders' | 'requests' | 'stock';
const FILTERS: { id: Filter; label: string; kinds: NoteKind[] }[] = [
  { id: 'all', label: 'All', kinds: ORDER_OF },
  { id: 'requests', label: 'Requests', kinds: ['cancel', 'return', 'refund'] },
  { id: 'orders', label: 'Orders', kinds: ['order'] },
  { id: 'stock', label: 'Stock', kinds: ['stock'] },
];
const PER_KIND = 6;

interface CentreProps {
  open: boolean;
  onClose: () => void;
  notes: AdminNote[];
  seen: Set<string>;
  markRead: (keys: string[]) => void;
  onGo: (target: AdminNote['target']) => void;
  loaded: boolean;
}

/** The panel itself: a popover under the bell on a computer, a bottom sheet on a phone. */
export const NotificationCentre: React.FC<CentreProps> = ({ open, onClose, notes, seen, markRead, onGo, loaded }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const shown = notes.filter((n) => kinds.includes(n.kind));
  const unreadKeys = notes.filter((n) => n.kind !== 'stock' && !seen.has(n.key)).map((n) => n.key);
  const countOf = (f: typeof FILTERS[number]) => notes.filter((n) => f.kinds.includes(n.kind)).length;

  return (
    <div className="fixed inset-0 z-[65] lg:bg-transparent bg-[color:var(--sag-scrim)] adm-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-notes-title"
        id="admin-notification-centre"
        className="adm-dialog adm-sheet-in sm-pop absolute inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[24px] lg:inset-x-auto lg:bottom-auto lg:right-5 lg:top-[66px] lg:w-[420px] lg:max-h-[min(640px,calc(100dvh-90px))] lg:rounded-[22px] flex flex-col overflow-hidden"
      >
        <span className="lg:hidden mx-auto mt-2 w-9 h-1 rounded-full bg-sunken-deep shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-2 pl-5 pr-2 pt-3 pb-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="adm-notes-title" className="text-[19px] leading-6 font-extrabold tracking-[-0.02em] text-ink">Notifications</h2>
            <p className="text-[13px] leading-[18px] text-ink-muted">{loaded ? `${unreadKeys.length} unread · ${notes.length} waiting in all` : 'Orders are still loading…'}</p>
          </div>
          <button type="button" onClick={() => markRead(unreadKeys)} disabled={!unreadKeys.length} className="h-10 px-3 rounded-full text-[13px] font-bold text-ink inline-flex items-center gap-1.5 hover:bg-[color:var(--adm-hover)] disabled:opacity-40 disabled:cursor-default cursor-pointer">
            <CheckCheck className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> Mark all read
          </button>
          <button type="button" onClick={onClose} aria-label="Close notifications" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-[color:var(--adm-hover)] cursor-pointer">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
        <div role="group" aria-label="Show" className="flex gap-1.5 px-4 pb-3 overflow-x-auto sag-scroll-x shrink-0 border-b border-[color:var(--adm-line)]">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="sag-chip !h-9 !px-3.5 !text-[13px] gap-1.5 shrink-0 cursor-pointer">
              {f.label}<span className="sag-num opacity-70">{countOf(f)}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!shown.length && (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto mb-3 w-14 h-14 rounded-full bg-ok-tint text-ok flex items-center justify-center" aria-hidden="true"><Bell className="w-6 h-6" strokeWidth={1.5} /></span>
              <p className="text-base font-bold text-ink">{loaded ? 'All clear' : 'Loading…'}</p>
              <p className="mt-1 text-sm leading-5 text-ink-muted">{loaded ? 'Nothing is waiting for you here right now.' : 'The orders are on their way.'}</p>
            </div>
          )}
          {ORDER_OF.filter((k) => kinds.includes(k)).map((kind) => {
            const rows = shown.filter((n) => n.kind === kind);
            if (!rows.length) return null;
            const meta = KIND[kind];
            const Icon = meta.icon;
            return (
              <section key={kind} aria-label={meta.label} className="pt-3">
                <p className="px-5 pb-1 text-[11px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted flex items-center gap-2">
                  {meta.label}<span className="sag-num text-ink">{rows.length}</span>
                </p>
                <ul>
                  {rows.slice(0, PER_KIND).map((n) => {
                    const unread = n.kind !== 'stock' && !seen.has(n.key);
                    return (
                      <li key={n.key}>
                        <button type="button" onClick={() => { markRead([n.key]); onGo(n.target); onClose(); }} className="adm-row w-full min-h-[60px] px-3 mx-0 py-2 flex items-center gap-3 text-left cursor-pointer hover:bg-[color:var(--adm-hover)]">
                          <span className={`ml-2 w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${meta.tone}`} aria-hidden="true"><Icon className="w-[17px] h-[17px]" strokeWidth={1.75} /></span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm leading-5 truncate ${unread ? 'font-bold text-ink' : 'font-medium text-ink'}`}>{n.title}</span>
                            <span className="block text-xs leading-4 text-ink-muted truncate">{n.line}</span>
                          </span>
                          <span className="shrink-0 flex flex-col items-end gap-0.5">
                            {n.side && <span className="text-[13px] leading-[18px] font-semibold text-ink sag-num">{n.side}</span>}
                            {n.at && <span className="text-[11.5px] leading-4 text-ink-muted">{timeAgo(n.at)}</span>}
                          </span>
                          {unread ? <span className="w-2 h-2 shrink-0 rounded-full bg-accent mr-1" aria-label="Unread" /> : <ChevronRight className="w-4 h-4 shrink-0 text-ink-faint mr-0.5" strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {rows.length > PER_KIND && (
                  <button type="button" onClick={() => { onGo(kind === 'stock' ? { tab: 'products' } : kind === 'order' ? { tab: 'orders' } : { tab: kind === 'return' ? 'returns' : 'cancellations' }); onClose(); }} className="ml-5 mb-1 min-h-10 text-[13px] font-bold text-brand underline underline-offset-[3px] cursor-pointer">
                    See all {rows.length}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
