import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LucideIcon, ArrowLeft, ChevronRight, Clock, Copy, CornerDownLeft, ExternalLink, Eye, EyeOff, FileText,
  MessageCircle, Package, PackageCheck, Pause, Phone, Play, Search, ShoppingBag, Tag, User, X, Zap,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { rupees } from './adminStats';
import { orderMobile, orderWhatsAppLink } from './adminAlerts';
import { withUndo, adminToast } from './adminToast';
import type { RecentPage } from './adminNav';
import type { Order } from '../../types';

/**
 * The command palette ("Search everything"): orders, customers, products, coupons, admin pages and actions, from
 * the data the panel already holds. Opens with a click, the "/" key or Ctrl / Cmd + K. Every result can be
 * opened with Enter; a result with more to do (mark an order packed, hide a product, pause a coupon, message a
 * customer…) shows them with the right arrow or Tab. Typing ">" first lists only the actions.
 * A change made from here waits five seconds with "Undo" before it is saved (adminToast.withUndo).
 */

export interface AdminSearchPage {
  id: string;
  label: string;
  group: string;
  /** Extra words that find the page. */
  words?: string;
  icon?: LucideIcon;
  /** "g" then this key. */
  keyHint?: string;
}

/** Something the shell can do (add a product, switch the sound, open the notifications…). */
export interface AdminCommand {
  id: string;
  label: string;
  note?: string;
  icon?: LucideIcon;
  /** The shortcut, shown at the right ("N P"). */
  keys?: string;
  words?: string;
  run: () => void;
}

interface AdminSearchProps {
  pages: AdminSearchPage[];
  onOpenPage: (id: string) => void;
  /** Controlled opening (the shell's shortcuts open it too). Without these the palette keeps its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  commands?: AdminCommand[];
  recent?: RecentPage[];
  onOpenPath?: (path: string) => void;
  /** Draws the search field / icon in the top bar (default true). */
  showTrigger?: boolean;
}

type Group = 'Recent' | 'Actions' | 'Orders' | 'Customers' | 'Products' | 'Coupons' | 'Pages';
const GROUPS: Group[] = ['Recent', 'Actions', 'Orders', 'Customers', 'Products', 'Coupons', 'Pages'];

interface SubAction {
  id: string;
  label: string;
  note?: string;
  icon: LucideIcon;
  run: () => void;
}
interface Hit {
  key: string;
  group: Group;
  title: string;
  note: string;
  side?: string;
  icon?: LucideIcon;
  keys?: string;
  go: () => void;
  actions?: SubAction[];
}

const MAX = 6;
const last10 = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10);
const compact = (value: unknown) => String(value || '').toLowerCase().replace(/[\s\-_/]/g, '');
const lower = (value: unknown) => String(value || '').toLowerCase();

const copy = (text: string, what: string) => {
  const done = () => adminToast(`${what} copied: ${text}`, { tone: 'success', duration: 2500 });
  try {
    navigator.clipboard.writeText(text).then(done, () => adminToast(`Could not copy. ${what}: ${text}`, { tone: 'error' }));
  } catch {
    adminToast(`Could not copy. ${what}: ${text}`, { tone: 'error' });
  }
};
const openOut = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };

/** A paid order that is ready to be packed (no cancel request or return waiting on it). */
const canMarkPacked = (o: Order) => o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Pending')
  && !(o.cancelRequest && !o.cancelRequest.handledAt);

export const AdminSearch: React.FC<AdminSearchProps> = ({ pages, onOpenPage, open: openProp, onOpenChange, commands = [], recent = [], onOpenPath, showTrigger = true }) => {
  const { orders = [], products = [], coupons = [], ordersLoaded, updateOrderStatus, toggleProductStatus, toggleCouponStatus } = useAdmin();
  const { currentPath, openAdminOrderDetails, openAdminProductEdit, openAdminTab } = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => { if (onOpenChange) onOpenChange(next); else setOwnOpen(next); };
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [focusHit, setFocusHit] = useState<Hit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  // "/" (when not typing in a field) and Ctrl / Cmd + K open the palette from anywhere in the admin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenRef.current(true);
        return;
      }
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      if (document.querySelector('#admin-root-container [aria-modal="true"]')) return;
      e.preventDefault();
      setOpenRef.current(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Closes when the page changes
  useEffect(() => { setOpenRef.current(false); }, [currentPath]);

  useEffect(() => {
    if (!open) return;
    cameFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
    setFocusHit(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focus = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focus);
      document.body.style.overflow = overflow;
      cameFrom.current?.focus?.();
    };
  }, [open]);

  // Customers as the orders know them: one person per mobile number (else per email)
  const people = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; email: string; city: string; paid: number; orders: number; latest: string; spent: number }>();
    orders.forEach((o) => {
      if (o.testPayment) return;
      const phone = last10(o.customerMobile || o.deliveryAddress?.mobile);
      const email = lower(o.customerEmail).trim();
      const key = phone.length === 10 ? phone : email;
      if (!key) return;
      const row = map.get(key) || { name: '', phone: phone.length === 10 ? phone : '', email, city: '', paid: 0, orders: 0, latest: '', spent: 0 };
      row.orders += 1;
      if (o.paymentStatus === 'Paid') { row.paid += 1; row.spent += Number(o.finalTotal) || 0; }
      if (String(o.date || '') >= row.latest) {
        row.latest = String(o.date || '');
        row.name = String(o.customerName || o.deliveryAddress?.fullName || row.name || '').trim();
        row.city = String(o.deliveryAddress?.city || row.city || '').trim();
        if (email) row.email = email;
      }
      map.set(key, row);
    });
    return [...map.values()];
  }, [orders]);

  const orderActions = (o: Order): SubAction[] => {
    const list: SubAction[] = [{ id: 'open', label: 'Open the order', icon: FileText, run: () => openAdminOrderDetails(o.orderNumber) }];
    if (canMarkPacked(o)) {
      list.push({
        id: 'packed', label: 'Mark packed', note: 'Saved after 5 seconds, with Undo', icon: PackageCheck,
        run: () => { void withUndo({ message: `Marking ${o.orderNumber} as packed`, detail: o.customerName || undefined, commit: () => updateOrderStatus(o.orderNumber, 'Packed'), done: `Order ${o.orderNumber} is marked packed.` }); },
      });
    }
    const mobile = orderMobile(o);
    const stage = o.status === 'Packed' ? 'packed' : o.status === 'Shipped' || o.status === 'In Transit' || o.status === 'Out for Delivery' ? 'shipped' : o.status === 'Delivered' ? 'delivered' : null;
    if (mobile && stage) {
      const link = orderWhatsAppLink(o, stage);
      if (link) list.push({ id: 'wa-stage', label: `Send the "${stage}" message on WhatsApp`, note: 'Opens WhatsApp with the message typed in', icon: MessageCircle, run: () => openOut(link) });
    }
    if (mobile) {
      list.push({ id: 'wa', label: 'Open a WhatsApp chat', note: `+91 ${mobile}`, icon: MessageCircle, run: () => openOut(`https://wa.me/91${mobile}`) });
      list.push({ id: 'call', label: 'Call the customer', note: `+91 ${mobile}`, icon: Phone, run: () => { window.location.href = `tel:+91${mobile}`; } });
      list.push({ id: 'theirs', label: "Show this customer's orders", icon: ShoppingBag, run: () => { setFocusHit(null); setQuery(mobile); } });
    }
    list.push({ id: 'copy', label: 'Copy the order number', icon: Copy, run: () => copy(o.orderNumber, 'Order number') });
    return list;
  };

  const hits = useMemo<Hit[]>(() => {
    const raw = query.trim();
    const onlyActions = raw.startsWith('>');
    const q = (onlyActions ? raw.slice(1) : raw).trim().toLowerCase();

    const pageHit = (p: AdminSearchPage): Hit => ({ key: `page-${p.id}`, group: 'Pages', title: p.label, note: p.group, icon: p.icon, keys: p.keyHint ? `G ${p.keyHint.toUpperCase()}` : undefined, go: () => onOpenPage(p.id) });
    const commandHit = (c: AdminCommand): Hit => ({ key: `cmd-${c.id}`, group: 'Actions', title: c.label, note: c.note || '', icon: c.icon || Zap, keys: c.keys, go: c.run });
    const matchesCommand = (c: AdminCommand) => !q || lower(`${c.label} ${c.note || ''} ${c.words || ''}`).includes(q);

    if (onlyActions) return commands.filter(matchesCommand).map(commandHit);

    if (!q) {
      const recentHits: Hit[] = recent.filter((r) => r.path !== currentPath).slice(0, 5).map((r) => ({
        key: `recent-${r.path}`, group: 'Recent', title: r.label, note: r.note, icon: Clock, go: () => onOpenPath?.(r.path),
      }));
      return [...recentHits, ...commands.slice(0, 6).map(commandHit), ...pages.map(pageHit)];
    }

    const qc = compact(q);
    const qDigits = q.replace(/\D/g, '');
    const phoneLike = qDigits.length >= 3 && /^[\d\s+\-()]+$/.test(q);

    const orderHits: Hit[] = orders
      .filter((o) => (qc && compact(o.orderNumber).includes(qc))
        || lower(o.customerName).includes(q)
        || lower(o.customerEmail).includes(q)
        || (phoneLike && (last10(o.customerMobile).includes(qDigits.slice(-10)) || last10(o.deliveryAddress?.mobile).includes(qDigits.slice(-10))))
        || (qc.length >= 4 && compact(o.trackingNumber).includes(qc)))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, MAX)
      .map((o) => ({
        key: `order-${o.orderNumber}`,
        group: 'Orders',
        title: o.orderNumber,
        note: [o.customerName || 'Customer', o.status, o.paymentStatus === 'Paid' ? (o.payMode === 'cod' ? 'Cash on delivery' : 'Paid') : o.paymentStatus || ''].filter(Boolean).join(' · '),
        side: rupees(Number(o.finalTotal) || 0),
        icon: ShoppingBag,
        go: () => openAdminOrderDetails(o.orderNumber),
        actions: orderActions(o),
      }));

    const peopleHits: Hit[] = people
      .filter((p) => lower(p.name).includes(q) || p.email.includes(q) || (phoneLike && p.phone.includes(qDigits.slice(-10))))
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .slice(0, MAX)
      .map((p) => {
        const actions: SubAction[] = [{ id: 'page', label: 'Open Customers', icon: User, run: () => openAdminTab('customers') }];
        if (p.phone) {
          actions.push({ id: 'orders', label: 'Show their orders', icon: ShoppingBag, run: () => { setFocusHit(null); setQuery(p.phone); } });
          actions.push({ id: 'wa', label: 'Open a WhatsApp chat', note: `+91 ${p.phone}`, icon: MessageCircle, run: () => openOut(`https://wa.me/91${p.phone}`) });
          actions.push({ id: 'call', label: 'Call', note: `+91 ${p.phone}`, icon: Phone, run: () => { window.location.href = `tel:+91${p.phone}`; } });
          actions.push({ id: 'copy-phone', label: 'Copy the mobile number', icon: Copy, run: () => copy(p.phone, 'Mobile number') });
        }
        if (p.email) actions.push({ id: 'copy-email', label: 'Copy the email', icon: Copy, run: () => copy(p.email, 'Email') });
        return {
          key: `person-${p.phone || p.email}`,
          group: 'Customers' as const,
          title: p.name || p.phone || p.email,
          note: [p.phone, p.email, p.city].filter(Boolean).join(' · '),
          side: p.paid > 0 ? `${p.paid} paid · ${rupees(p.spent)}` : 'No paid order yet',
          icon: User,
          go: () => (p.phone ? (setFocusHit(null), setQuery(p.phone)) : openAdminTab('customers')),
          actions,
        };
      });

    const productHits: Hit[] = products
      .filter((p) => lower(p.name).includes(q) || (qc && compact(p.sku).includes(qc)) || lower(p.id) === q || lower(p.category).includes(q))
      .slice(0, MAX)
      .map((p) => {
        const actions: SubAction[] = [
          { id: 'edit', label: 'Edit the product', icon: FileText, run: () => openAdminProductEdit(p.id) },
          p.hidden
            ? { id: 'show', label: 'Show it on the store', note: 'Saved after 5 seconds, with Undo', icon: Eye, run: () => { void withUndo({ message: `Showing "${p.name}" on the store`, commit: () => toggleProductStatus(p.id), done: `"${p.name}" is live on the store.` }); } }
            : { id: 'hide', label: 'Hide it from the store', note: 'Saved after 5 seconds, with Undo', icon: EyeOff, run: () => { void withUndo({ message: `Hiding "${p.name}" from the store`, commit: () => toggleProductStatus(p.id), done: `"${p.name}" is hidden from the store.` }); } },
          { id: 'view', label: 'See it on the store', note: 'Opens in a new tab', icon: ExternalLink, run: () => openOut(`/product/${p.id}`) },
        ];
        if (p.sku) actions.push({ id: 'sku', label: 'Copy the SKU', icon: Copy, run: () => copy(String(p.sku), 'SKU') });
        return {
          key: `product-${p.id}`,
          group: 'Products' as const,
          title: p.name,
          note: [p.sku ? `SKU ${p.sku}` : '', String(p.category || ''), p.hidden ? 'Not shown in the store' : `${Math.max(0, Number(p.stockQuantity ?? 0))} in stock`].filter(Boolean).join(' · '),
          side: rupees(Number(p.price) || 0),
          icon: Package,
          go: () => openAdminProductEdit(p.id),
          actions,
        };
      });

    const couponHits: Hit[] = coupons
      .filter((c) => lower(c.code).includes(q) || lower(c.description).includes(q))
      .slice(0, MAX)
      .map((c) => ({
        key: `coupon-${c.id}`,
        group: 'Coupons' as const,
        title: c.code,
        note: [c.discountType === 'percentage' ? `${c.discountValue}% off` : `${rupees(c.discountValue)} off`, c.minOrderValue ? `above ${rupees(c.minOrderValue)}` : '', c.isActive ? 'On' : 'Paused', `used ${c.usageCount || 0}${c.usageLimit ? ` of ${c.usageLimit}` : ''}`].filter(Boolean).join(' · '),
        icon: Tag,
        go: () => openAdminTab('coupons'),
        actions: [
          { id: 'open', label: 'Open Coupons', icon: Tag, run: () => openAdminTab('coupons') },
          { id: 'copy', label: 'Copy the code', icon: Copy, run: () => copy(c.code, 'Code') },
          c.isActive
            ? { id: 'pause', label: 'Pause this coupon', note: 'Saved after 5 seconds, with Undo', icon: Pause, run: () => { void withUndo({ message: `Pausing ${c.code}`, commit: () => toggleCouponStatus(c.id), done: `${c.code} is paused.` }); } }
            : { id: 'on', label: 'Switch this coupon on', note: 'Saved after 5 seconds, with Undo', icon: Play, run: () => { void withUndo({ message: `Switching ${c.code} on`, commit: () => toggleCouponStatus(c.id), done: `${c.code} is on.` }); } },
        ],
      }));

    const pageMatches = pages.filter((p) => lower(`${p.label} ${p.group} ${p.words || ''}`).includes(q)).slice(0, MAX).map(pageHit);
    const commandMatches = commands.filter(matchesCommand).slice(0, 4).map(commandHit);
    return [...orderHits, ...peopleHits, ...productHits, ...couponHits, ...pageMatches, ...commandMatches];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, orders, people, products, coupons, pages, commands, recent, currentPath, onOpenPage, onOpenPath]);

  // In "actions" mode the list is the chosen result's actions
  const list: Hit[] = useMemo(() => {
    if (!focusHit) return hits;
    const q = query.trim().toLowerCase();
    return (focusHit.actions || [])
      .filter((a) => !q || lower(`${a.label} ${a.note || ''}`).includes(q))
      .map((a) => ({ key: `act-${a.id}`, group: 'Actions' as const, title: a.label, note: a.note || '', icon: a.icon, go: a.run }));
  }, [focusHit, hits, query]);

  useEffect(() => { setActive(0); }, [query, focusHit]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    const before = query;
    hit.go();
    // "Show their orders" changes the query and keeps the palette open; everything else closes it
    window.setTimeout(() => {
      if (inputRef.current && inputRef.current.value !== before) return;
      setOpen(false);
      window.scrollTo({ top: 0 });
    }, 0);
  };
  const enterActions = (hit: Hit | undefined) => {
    if (!hit?.actions?.length) return false;
    setFocusHit(hit);
    setQuery('');
    return true;
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const caretAtStart = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (list.length ? (i + 1) % list.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (list.length ? (i - 1 + list.length) % list.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(list[active]); }
    else if ((e.key === 'ArrowRight' && e.currentTarget.selectionStart === query.length) || (e.key === 'Tab' && !e.shiftKey)) {
      if (!focusHit && enterActions(list[active])) e.preventDefault();
      else if (e.key === 'Tab') e.preventDefault();
    }
    else if (focusHit && ((e.key === 'Backspace' && !query) || (e.key === 'ArrowLeft' && caretAtStart) || (e.key === 'Tab' && e.shiftKey))) { e.preventDefault(); setFocusHit(null); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (focusHit) setFocusHit(null); else setOpen(false); }
  };

  const groups = focusHit
    ? [{ group: 'Actions' as Group, rows: list.map((hit, index) => ({ hit, index })) }]
    : GROUPS
      .map((group) => ({ group, rows: list.map((hit, index) => ({ hit, index })).filter((r) => r.hit.group === group) }))
      .filter((g) => g.rows.length > 0);
  const typed = query.trim();
  const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const groupLabel = (group: Group) => {
    if (focusHit) return `What to do with ${focusHit.title}`;
    if (!typed && group === 'Pages') return 'Go to a page';
    if (!typed && group === 'Actions') return 'Quick actions';
    return group;
  };

  return (
    <>
      {showTrigger && (
        <>
          {/* Desktop: a field-like pill. Phones and tablets: the icon. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hidden lg:flex h-10 w-56 xl:w-72 pl-3.5 pr-2 items-center gap-2 rounded-full bg-surface shadow-[var(--adm-lift)] hover:text-ink text-sm text-ink-muted transition-colors cursor-pointer"
            aria-label="Search orders, customers, products and pages"
            aria-haspopup="dialog"
            title="Search everything and run actions ( / or Ctrl K )"
          >
            <Search className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1 text-left truncate">Search or run a command…</span>
            <span className="shrink-0 flex items-center gap-1" aria-hidden="true"><kbd className="adm-kbd">{isMac ? '⌘' : 'Ctrl'}</kbd><kbd className="adm-kbd">K</kbd></span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="lg:hidden w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-[color:var(--adm-hover)] transition-colors cursor-pointer"
            aria-label="Search orders, customers, products and pages"
            aria-haspopup="dialog"
            title="Search everything"
          >
            <Search className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-[color:var(--sag-scrim)] flex items-start justify-center px-2.5 pt-2.5 sm:px-3 sm:pt-[10vh] adm-fade-in"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search everything"
            id="admin-command-palette"
            className="adm-dialog adm-pop-in w-full max-w-[640px] max-h-[calc(100dvh-1.25rem)] sm:max-h-[74vh] flex flex-col overflow-hidden rounded-[24px] text-left"
          >
            <div className="flex items-center gap-1.5 pl-2 pr-2 py-2 border-b border-[color:var(--adm-line)] shrink-0">
              {focusHit ? (
                <button type="button" onClick={() => setFocusHit(null)} className="h-9 pl-2 pr-3 ml-1 shrink-0 max-w-[45%] rounded-full bg-[color:var(--adm-hover)] text-[13px] font-bold text-ink inline-flex items-center gap-1.5 cursor-pointer" aria-label={`Back to all results (now: ${focusHit.title})`}>
                  <ArrowLeft className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">{focusHit.title}</span>
                </button>
              ) : (
                <Search className="ml-2.5 w-[18px] h-[18px] shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
              )}
              <input
                ref={inputRef}
                type="text"
                inputMode="search"
                enterKeyHint="go"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={focusHit ? 'Pick what to do…' : 'Order number, name, phone, product, SKU, coupon or page…'}
                className="flex-1 min-w-0 h-12 px-2 bg-transparent !border-0 outline-none text-[16px] text-ink placeholder:text-ink-faint focus:!shadow-none focus-visible:!outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls="admin-search-results"
                aria-activedescendant={list[active] ? `admin-search-${list[active].key}` : undefined}
                aria-label="Search orders, customers, products and pages"
              />
              <button type="button" onClick={() => setOpen(false)} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-[color:var(--adm-hover)] transition-colors cursor-pointer" aria-label="Close search">
                <X className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div ref={listRef} id="admin-search-results" role="listbox" aria-label="Results" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2">
              {!typed && !focusHit && (
                <p className="px-4 pt-3 text-[13px] leading-[18px] text-ink-muted">
                  Find an order, a customer (name, phone or email), a product (name or SKU), a coupon or a page. Type <span className="font-bold text-ink">&gt;</span> for actions only.
                </p>
              )}
              {typed && list.length === 0 && (
                <p className="px-4 py-10 text-sm leading-5 text-ink-muted text-center">
                  {focusHit ? 'No action by that name.' : ordersLoaded ? `Nothing found for "${typed}". Try an order number, a phone number or a product name.` : 'Orders are still loading. Try again in a moment.'}
                </p>
              )}
              {groups.map(({ group, rows }) => (
                <div key={group} role="group" aria-label={groupLabel(group)}>
                  <p className="px-4 pt-3.5 pb-1 text-[11px] leading-4 font-bold uppercase tracking-[0.13em] text-ink-muted" aria-hidden="true">{groupLabel(group)}</p>
                  {rows.map(({ hit, index }) => {
                    const on = index === active;
                    const Icon = hit.icon;
                    return (
                      <div
                        key={hit.key}
                        id={`admin-search-${hit.key}`}
                        role="option"
                        aria-selected={on}
                        onMouseMove={() => { if (!on) setActive(index); }}
                        className="adm-row group mx-2 rounded-[14px] flex items-center"
                      >
                        <button type="button" tabIndex={-1} onClick={() => choose(hit)} className="flex-1 min-w-0 min-h-[50px] pl-2 pr-1 py-2 flex items-center gap-3 text-left cursor-pointer">
                          {Icon && <span className="w-8 h-8 shrink-0 rounded-[10px] bg-[color:var(--adm-hover)] group-aria-selected:bg-surface text-ink flex items-center justify-center" aria-hidden="true"><Icon className="w-4 h-4" strokeWidth={1.75} /></span>}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-5 font-semibold text-ink truncate">{hit.title}</span>
                            {hit.note && <span className="block text-xs leading-4 text-ink-muted truncate">{hit.note}</span>}
                          </span>
                          {hit.side && <span className="shrink-0 sag-num text-[13px] leading-[18px] text-ink-muted">{hit.side}</span>}
                          {hit.keys && <span className="hidden sm:flex shrink-0 items-center gap-1" aria-label={`Shortcut ${hit.keys}`}>{hit.keys.split(' ').map((k) => <kbd key={k} className="adm-kbd">{k}</kbd>)}</span>}
                          {!hit.actions?.length && <CornerDownLeft className="adm-row-go hidden sm:block w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                        {hit.actions?.length ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => enterActions(hit)}
                            className="shrink-0 h-9 mr-1.5 pl-2.5 pr-1.5 rounded-full text-[12.5px] font-bold text-ink inline-flex items-center gap-0.5 hover:bg-surface cursor-pointer"
                            aria-label={`More actions for ${hit.title}`}
                          >
                            <span className="hidden sm:inline">Actions</span><span className="sm:hidden">More</span><ChevronRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-[color:var(--adm-line)] rounded-none text-xs leading-4 text-ink-muted shrink-0">
              <span className="flex items-center gap-1.5"><kbd className="adm-kbd">↑</kbd><kbd className="adm-kbd">↓</kbd> move</span>
              <span className="flex items-center gap-1.5"><kbd className="adm-kbd">Enter</kbd> open</span>
              <span className="flex items-center gap-1.5"><kbd className="adm-kbd">→</kbd> actions</span>
              <span className="flex items-center gap-1.5 ml-auto"><kbd className="adm-kbd">Esc</kbd> {focusHit ? 'back' : 'close'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
