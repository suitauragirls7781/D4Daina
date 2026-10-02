import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, Phone, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { COLLECTIONS, listDocs, patchDoc } from '../../lib/dataStore';
import { formatOrderDate } from '../../utils/orderDate';
import { AdminPageHeader, tone, ui } from './kidsToysShared';

/** A shopper who typed their details at checkout and left without paying (saved by CheckoutPage). */
interface Checkout {
  id: string;
  name: string;
  phone: string;
  email: string;
  total: number;
  items: { id: string; name: string; size: string; quantity: number; image: string }[];
  place: string;
  source: string;
  updatedAt: string;
  contactedAt: string;
}

type Tab = 'todo' | 'contacted' | 'ordered' | 'all';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10);

const toCheckout = (row: any): Checkout => {
  const address = row.address && typeof row.address === 'object' ? row.address : {};
  const items = (Array.isArray(row.cartItems) ? row.cartItems : []).map((item: any) => ({
    id: String(item?.product?.id || ''),
    name: String(item?.product?.name || 'Product'),
    size: String(item?.selectedSize || ''),
    quantity: Math.max(1, Number(item?.quantity) || 1),
    image: String(item?.product?.images?.[0] || item?.product?.image || ''),
  }));
  return {
    id: String(row.id),
    name: String(row.fullName || `${row.firstName || ''} ${row.lastName || ''}`).trim(),
    phone: digits(row.phone || row.mobile || address.mobile),
    email: String(row.email || address.email || '').trim().toLowerCase(),
    total: Math.max(0, Math.round(Number(row.totalAmount) || 0)),
    items,
    place: [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    source: String(row.utmSource || ''),
    updatedAt: String(row.updatedAt || ''),
    contactedAt: String(row.contactedAt || ''),
  };
};

/** Checkouts that were started but not paid, so the owner can message those shoppers on WhatsApp. */
export const AdminAbandoned: React.FC = () => {
  const { orders } = useAdmin();
  const { showToast } = useShop();
  const [rows, setRows] = useState<Checkout[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('todo');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = (await listDocs(COLLECTIONS.abandonedCheckouts)).map(toCheckout);
      list.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
      setRows(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load the checkouts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Phones and emails that have a paid order: those shoppers did buy, so they need no reminder
  const paid = useMemo(() => {
    const phones = new Set<string>();
    const emails = new Set<string>();
    for (const order of orders) {
      if (order.paymentStatus !== 'Paid') continue;
      const phone = digits((order as any).customerMobile || order.deliveryAddress?.mobile);
      const email = String(order.customerEmail || '').trim().toLowerCase();
      if (phone.length === 10) phones.add(phone);
      if (email) emails.add(email);
    }
    return { phones, emails };
  }, [orders]);

  const hasPaidOrder = (row: Checkout) => (row.phone.length === 10 && paid.phones.has(row.phone)) || (Boolean(row.email) && paid.emails.has(row.email));

  const groups = useMemo(() => {
    const all = rows || [];
    const ordered = all.filter(hasPaidOrder);
    const open = all.filter((row) => !hasPaidOrder(row));
    return {
      todo: open.filter((row) => !row.contactedAt && row.phone.length === 10),
      contacted: open.filter((row) => row.contactedAt),
      ordered,
      all,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, paid]);

  const term = search.trim().toLowerCase();
  const visible = groups[tab].filter((row) => !term
    || row.name.toLowerCase().includes(term) || row.phone.includes(term) || row.email.includes(term)
    || row.items.some((item) => item.name.toLowerCase().includes(term)));

  const whatsappLink = (row: Checkout) => {
    const first = row.items[0];
    const link = first?.id ? `https://www.suitauragirls.in/product/${first.id}` : 'https://www.suitauragirls.in/cart';
    const text = `Hi ${row.name.split(' ')[0] || ''}, this is Suit Aura Girls. You were looking at ${first ? `"${first.name}"` : 'a style'} on our website. Can I help you with the size, delivery or payment? ${link}`;
    return `https://wa.me/91${row.phone}?text=${encodeURIComponent(text.replace(/\s+/g, ' ').trim())}`;
  };

  const setContacted = async (row: Checkout, contacted: boolean) => {
    const contactedAt = contacted ? new Date().toISOString() : '';
    try {
      await patchDoc(COLLECTIONS.abandonedCheckouts, row.id, { contactedAt });
      setRows((list) => (list || []).map((item) => (item.id === row.id ? { ...item, contactedAt } : item)));
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    }
  };

  const tabs: [Tab, string][] = [['todo', 'To contact'], ['contacted', 'Contacted'], ['ordered', 'Ordered'], ['all', 'All']];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Sales"
        title={<>Abandoned checkouts {rows && <span className="text-ink-muted font-normal tabular-nums">({rows.length})</span>}</>}
        icon={<ShoppingCart className="text-current" />}
        description="Shoppers who typed their details at checkout but did not pay. Message them on WhatsApp from your own number."
        actions={
          <button type="button" onClick={load} disabled={loading} className={ui.outline}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="sag-scroll-x flex gap-2 min-w-0 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
              className={`${ui.chip(tab === id)} shrink-0 whitespace-nowrap`}>
              {label} <span className={`tabular-nums font-normal ${tab === id ? 'text-on-dark-muted' : 'text-ink-muted'}`}>{groups[id].length}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-72 min-w-0">
          <span className="sr-only">Search checkouts</span>
          <Search className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} inputMode="search" placeholder="Search name, phone or product"
            className={ui.search} />
        </label>
      </div>

      {error && (
        <div role="alert" className={ui.alert}>{error}</div>
      )}
      {!rows && !error && <p role="status" className="text-sm leading-5 text-ink-muted">Loading checkouts…</p>}
      {rows && visible.length === 0 && (
        <div className={`${ui.empty} text-sm leading-5 text-ink-muted`}>
          {tab === 'todo' ? 'Nobody is waiting for a message.' : 'Nothing here.'}
        </div>
      )}

      <div className="grid gap-2.5 lg:grid-cols-2">
        {visible.map((row) => {
          const ordered = hasPaidOrder(row);
          return (
            <article key={row.id} className="bg-white rounded-2xl border border-line p-3.5 sm:p-4 min-w-0 space-y-2.5">
              <div className="flex items-start gap-3 min-w-0">
                {row.items[0]?.image && (
                  <img src={row.items[0].image} alt="" loading="lazy" className="w-14 aspect-[4/5] rounded-[10px] object-cover object-top shrink-0 bg-sunken" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] leading-5 font-semibold text-ink truncate">{row.name || 'No name typed'}</p>
                    {ordered && <span className={`shrink-0 ${ui.badge} ${tone.ok}`}>Has a paid order</span>}
                    {!ordered && row.contactedAt && <span className={`shrink-0 ${ui.badge} ${tone.neutral}`}>Contacted</span>}
                  </div>
                  <p className="text-sm leading-5 text-ink-muted line-clamp-2">
                    {row.items.length === 0 ? 'Empty bag' : row.items.map((item) => `${item.name}${item.size ? ` (${item.size})` : ''}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`).join(', ')}
                  </p>
                  <p className="mt-0.5 text-sm leading-5 text-ink">
                    <strong className="font-bold tabular-nums">₹{row.total.toLocaleString('en-IN')}</strong>
                    <span className="text-ink-muted"> · {formatOrderDate(row.updatedAt) || 'time not saved'}</span>
                  </p>
                </div>
              </div>

              <dl className="grid gap-0.5 text-[13px] leading-[18px] min-w-0 pt-2.5 border-t border-line">
                <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[4.5rem] text-ink-muted">Phone</dt><dd className="truncate text-ink">{row.phone.length === 10 ? `+91 ${row.phone}` : 'not typed'}</dd></div>
                {row.email && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[4.5rem] text-ink-muted">Email</dt><dd className="truncate text-ink">{row.email}</dd></div>}
                {row.place && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[4.5rem] text-ink-muted">Place</dt><dd className="truncate text-ink">{row.place}</dd></div>}
                {row.source && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[4.5rem] text-ink-muted">Came from</dt><dd className="truncate text-ink">{row.source}</dd></div>}
              </dl>

              {row.phone.length === 10 && (
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <a href={whatsappLink(row)} target="_blank" rel="noopener noreferrer" className={`${ui.primary} col-span-2`}>
                    <MessageCircle className="w-4 h-4" /> Message on WhatsApp
                  </a>
                  <a href={`tel:+91${row.phone}`} className={ui.outline}>
                    <Phone className="w-4 h-4" /> Call
                  </a>
                  <button type="button" onClick={() => setContacted(row, !row.contactedAt)} className={ui.outline}>
                    <Check className="w-4 h-4" /> {row.contactedAt ? 'Not contacted' : 'Mark contacted'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
