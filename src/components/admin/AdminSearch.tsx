import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { rupees } from './adminStats';

/**
 * "Search everything" for the admin top bar: orders, customers, products and the admin pages, from the
 * data the panel already holds. Opens with a click, the "/" key or Ctrl / Cmd + K.
 */

export interface AdminSearchPage {
  id: string;
  label: string;
  group: string;
}

interface AdminSearchProps {
  pages: AdminSearchPage[];
  onOpenPage: (id: string) => void;
}

type Group = 'Orders' | 'Customers' | 'Products' | 'Pages';
interface Hit {
  key: string;
  group: Group;
  title: string;
  note: string;
  side?: string;
  go: () => void;
}

const MAX = 6;
const last10 = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10);
const compact = (value: unknown) => String(value || '').toLowerCase().replace(/[\s\-_/]/g, '');
const lower = (value: unknown) => String(value || '').toLowerCase();

export const AdminSearch: React.FC<AdminSearchProps> = ({ pages, onOpenPage }) => {
  const { orders = [], products = [], ordersLoaded } = useAdmin();
  const { currentPath, openAdminOrderDetails, openAdminProductEdit, openAdminTab } = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  // "/" (when not typing in a field) and Ctrl / Cmd + K open the search from anywhere in the admin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Closes when the page changes
  useEffect(() => { setOpen(false); }, [currentPath]);

  useEffect(() => {
    if (!open) return;
    cameFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
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
    const map = new Map<string, { name: string; phone: string; email: string; city: string; paid: number; orders: number; latest: string }>();
    orders.forEach((o) => {
      if (o.testPayment) return;
      const phone = last10(o.customerMobile || o.deliveryAddress?.mobile);
      const email = lower(o.customerEmail).trim();
      const key = phone.length === 10 ? phone : email;
      if (!key) return;
      const row = map.get(key) || { name: '', phone: phone.length === 10 ? phone : '', email, city: '', paid: 0, orders: 0, latest: '' };
      row.orders += 1;
      if (o.paymentStatus === 'Paid') row.paid += 1;
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

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const pageHits = (list: AdminSearchPage[]): Hit[] => list.map((p) => ({
      key: `page-${p.id}`, group: 'Pages', title: p.label, note: p.group, go: () => onOpenPage(p.id),
    }));
    if (!q) return pageHits(pages);

    const qc = compact(q);
    const qDigits = q.replace(/\D/g, '');
    const phoneLike = qDigits.length >= 3 && /^[\d\s+\-()]+$/.test(q);

    const orderHits: Hit[] = orders
      .filter((o) => (qc && compact(o.orderNumber).includes(qc))
        || lower(o.customerName).includes(q)
        || lower(o.customerEmail).includes(q)
        || (phoneLike && last10(o.customerMobile).includes(qDigits.slice(-10)))
        || (qc.length >= 4 && compact(o.trackingNumber).includes(qc)))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, MAX)
      .map((o) => ({
        key: `order-${o.orderNumber}`,
        group: 'Orders',
        title: o.orderNumber,
        note: [o.customerName || 'Customer', o.status, o.paymentStatus === 'Paid' ? (o.payMode === 'cod' ? 'Cash on delivery' : 'Paid') : o.paymentStatus || ''].filter(Boolean).join(' · '),
        side: rupees(Number(o.finalTotal) || 0),
        go: () => openAdminOrderDetails(o.orderNumber),
      }));

    const peopleHits: Hit[] = people
      .filter((p) => lower(p.name).includes(q) || p.email.includes(q) || (phoneLike && p.phone.includes(qDigits.slice(-10))))
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .slice(0, MAX)
      .map((p) => ({
        key: `person-${p.phone || p.email}`,
        group: 'Customers',
        title: p.name || p.phone || p.email,
        note: [p.phone, p.email, p.city].filter(Boolean).join(' · '),
        side: p.paid > 0 ? `${p.paid} paid ${p.paid === 1 ? 'order' : 'orders'}` : 'No paid order yet',
        go: () => openAdminTab('customers'),
      }));

    const productHits: Hit[] = products
      .filter((p) => lower(p.name).includes(q) || (qc && compact(p.sku).includes(qc)) || lower(p.id) === q)
      .slice(0, MAX)
      .map((p) => ({
        key: `product-${p.id}`,
        group: 'Products',
        title: p.name,
        note: [p.sku ? `SKU ${p.sku}` : '', String(p.category || ''), p.hidden ? 'Not shown in the store' : ''].filter(Boolean).join(' · '),
        side: rupees(Number(p.price) || 0),
        go: () => openAdminProductEdit(p.id),
      }));

    const matchedPages = pageHits(pages.filter((p) => lower(p.label).includes(q) || lower(p.group).includes(q)).slice(0, MAX));
    return [...orderHits, ...peopleHits, ...productHits, ...matchedPages];
  }, [query, orders, people, products, pages, onOpenPage, openAdminOrderDetails, openAdminProductEdit, openAdminTab]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    hit.go();
    window.scrollTo({ top: 0 });
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (hits.length ? (i + 1) % hits.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hits[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const groups = (['Orders', 'Customers', 'Products', 'Pages'] as Group[])
    .map((group) => ({ group, rows: hits.map((hit, index) => ({ hit, index })).filter((r) => r.hit.group === group) }))
    .filter((g) => g.rows.length > 0);
  const typed = query.trim();

  return (
    <>
      {/* Desktop: a sand pill field. Phones and tablets: the icon. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden lg:flex h-10 w-44 xl:w-52 pl-3.5 pr-2.5 items-center gap-2 rounded-full bg-sunken hover:text-ink text-sm text-ink-muted transition-colors cursor-pointer"
        aria-label="Search orders, customers, products and pages"
        aria-haspopup="dialog"
        title="Search everything ( / )"
      >
        <Search className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="flex-1 text-left truncate">Search</span>
        <kbd className="shrink-0 h-5 min-w-5 px-1 inline-flex items-center justify-center rounded-[6px] border border-line font-sans text-[11px] leading-4 text-ink-muted" aria-hidden="true">/</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer"
        aria-label="Search orders, customers, products and pages"
        aria-haspopup="dialog"
        title="Search everything"
      >
        <Search className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-[color:var(--sag-scrim)] flex items-start justify-center px-3 pt-3 sm:pt-[9vh] animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Search everything"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[78vh] flex flex-col overflow-hidden bg-surface rounded-[28px] shadow-[var(--sag-shadow-pop)] text-left">
            <div className="flex items-center gap-2 p-3 border-b border-line rounded-none shrink-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" strokeWidth={1.5} aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Order number, name, phone, email, product or SKU"
                  className="sag-input w-full !pl-10 !text-[16px]"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="admin-search-results"
                  aria-activedescendant={hits[active] ? `admin-search-${hits[active].key}` : undefined}
                  aria-label="Search orders, customers, products and pages"
                />
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer" aria-label="Close search">
                <X className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div ref={listRef} id="admin-search-results" role="listbox" aria-label="Results" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2">
              {!typed && (
                <p className="px-4 pt-3 text-[13px] leading-[18px] text-ink-muted">
                  Type an order number, a customer's name, phone or email, or a product name or SKU. Or pick a page below.
                </p>
              )}
              {typed && hits.length === 0 && (
                <p className="px-4 py-8 text-sm leading-5 text-ink-muted text-center">
                  {ordersLoaded ? `Nothing found for "${typed}". Try an order number, a phone number or a product name.` : 'Orders are still loading. Try again in a moment.'}
                </p>
              )}
              {groups.map(({ group, rows }) => (
                <div key={group} role="group" aria-label={group}>
                  <p className="px-4 pt-4 pb-1 text-[11px] leading-4 font-bold uppercase tracking-[0.14em] text-sale" aria-hidden="true">{typed || group !== 'Pages' ? group : 'Go to a page'}</p>
                  {rows.map(({ hit, index }) => {
                    const on = index === active;
                    return (
                      <button
                        key={hit.key}
                        id={`admin-search-${hit.key}`}
                        type="button"
                        role="option"
                        aria-selected={on}
                        tabIndex={-1}
                        onMouseMove={() => { if (!on) setActive(index); }}
                        onClick={() => choose(hit)}
                        className={`w-[calc(100%-1rem)] mx-2 min-h-[48px] px-2 py-2 flex items-center gap-3 text-left cursor-pointer rounded-[14px] ${on ? 'bg-sunken' : ''}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-5 text-ink truncate">{hit.title}</span>
                          {hit.note && <span className="block text-xs leading-4 text-ink-muted truncate">{hit.note}</span>}
                        </span>
                        {hit.side && <span className="shrink-0 sag-num text-[13px] leading-[18px] text-ink-muted">{hit.side}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="hidden sm:block px-4 py-2.5 border-t border-line rounded-none text-xs leading-4 text-ink-muted shrink-0">
              Up and down arrows to move · Enter to open · Esc to close
            </p>
          </div>
        </div>
      )}
    </>
  );
};
