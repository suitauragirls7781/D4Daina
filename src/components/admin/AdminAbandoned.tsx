import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Mail, MessageCircle, Phone, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { COLLECTIONS, listDocs, patchDoc } from '../../lib/dataStore';
import { formatOrderDate } from '../../utils/orderDate';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { EmptyState, KeyNumbers, PageTitle, Pill, adminUi } from './PaymentBadge';

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
  /** When the automatic reminder email went out ('' = not sent). Written by the server (api/_lib/reminders.js). */
  reminderSentAt: string;
  /** When the shopper opened the checkout: the time inside the id, else the last update (0 = unknown). */
  startedMs: number;
  /** True when house / street, city and PIN code were all typed. */
  addressDone: boolean;
}

type Tab = 'todo' | 'contacted' | 'ordered' | 'all';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10);

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_MS = 24 * 60 * 60 * 1000;
/** The India calendar day of a saved time ('' when it cannot be read). */
const istDay = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? IST_DAY.format(new Date(time)) : '';
};

const toCheckout = (row: any): Checkout => {
  const address = row.address && typeof row.address === 'object' ? row.address : {};
  const items = (Array.isArray(row.cartItems) ? row.cartItems : []).map((item: any) => ({
    id: String(item?.product?.id || ''),
    name: String(item?.product?.name || 'Product'),
    size: String(item?.selectedSize || ''),
    quantity: Math.max(1, Number(item?.quantity) || 1),
    image: String(item?.product?.images?.[0] || item?.product?.image || ''),
  }));
  const updatedAt = String(row.updatedAt || '');
  const idTime = Number(/^chk_(\d{10,})/.exec(String(row.id))?.[1]) || 0;
  return {
    id: String(row.id),
    name: String(row.fullName || `${row.firstName || ''} ${row.lastName || ''}`).trim(),
    phone: digits(row.phone || row.mobile || address.mobile),
    email: String(row.email || address.email || '').trim().toLowerCase(),
    total: Math.max(0, Math.round(Number(row.totalAmount) || 0)),
    items,
    place: [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    source: String(row.utmSource || ''),
    updatedAt,
    contactedAt: String(row.contactedAt || ''),
    reminderSentAt: String(row.reminderSentAt || ''),
    startedMs: idTime || Date.parse(updatedAt) || 0,
    addressDone: Boolean((address.houseFlat || address.street) && address.city && address.pincode),
  };
};

const eyebrow = 'text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted';

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

  // Order times per shopper (phone or email), read from the orders list: the newest paid order, and every
  // checkout attempt where the payment was never completed
  const orderTimes = useMemo(() => {
    const lastPaid = new Map<string, number>();
    const unpaid = new Map<string, number[]>();
    for (const order of orders) {
      const phone = digits((order as any).customerMobile || order.deliveryAddress?.mobile);
      const email = String(order.customerEmail || '').trim().toLowerCase();
      const keys = [phone.length === 10 ? `p:${phone}` : '', email ? `e:${email}` : ''].filter(Boolean);
      if (order.paymentStatus === 'Paid') {
        const time = Date.parse(String(order.paidAt || order.date || ''));
        if (Number.isFinite(time)) keys.forEach((key) => lastPaid.set(key, Math.max(lastPaid.get(key) || 0, time)));
      } else if (order.paymentStatus === 'Unpaid') {
        const time = Date.parse(String(order.date || ''));
        if (Number.isFinite(time)) keys.forEach((key) => unpaid.set(key, [...(unpaid.get(key) || []), time]));
      }
    }
    return { lastPaid, unpaid };
  }, [orders]);
  const keysOf = (row: Checkout) => [row.phone.length === 10 ? `p:${row.phone}` : '', row.email ? `e:${row.email}` : ''].filter(Boolean);
  /** True when this shopper has a paid order placed after they opened this checkout. */
  const boughtAfter = (row: Checkout) => row.startedMs > 0 && keysOf(row).some((key) => (orderTimes.lastPaid.get(key) || 0) >= row.startedMs);
  /** True when an unpaid payment attempt by this shopper was made while this checkout was open (up to a day after its last change). */
  const reachedPayment = (row: Checkout) => {
    const end = (Date.parse(row.updatedAt) || row.startedMs) + DAY_MS;
    return row.startedMs > 0 && keysOf(row).some((key) => (orderTimes.unpaid.get(key) || []).some((time) => time >= row.startedMs && time <= end));
  };
  /** How far the shopper got, from what was saved: nothing is guessed. */
  const progressOf = (row: Checkout) => {
    if (reachedPayment(row)) return 'Got to the payment step, did not pay';
    if (row.addressDone) return 'Filled the delivery address';
    if (row.phone.length === 10 || row.email) return 'Typed contact details, no full address';
    return 'Typed a name only';
  };

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

  // Key numbers: checkouts left unpaid today and in the last 7 days (India time), the reminder emails that
  // went out, and the shoppers who paid for an order after leaving
  const numbers = useMemo(() => {
    const all = rows || [];
    const today = IST_DAY.format(new Date());
    const weekStart = IST_DAY.format(new Date(Date.now() - 6 * DAY_MS));
    const open = all.filter((row) => !hasPaidOrder(row));
    const week = open.filter((row) => { const day = istDay(row.updatedAt); return Boolean(day) && day >= weekStart; });
    return {
      today: open.filter((row) => istDay(row.updatedAt) === today).length,
      week: week.length,
      weekValue: week.reduce((sum, row) => sum + row.total, 0),
      reminded: all.filter((row) => row.reminderSentAt).length,
      recovered: all.filter(boughtAfter).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, paid, orderTimes]);

  const term = search.trim().toLowerCase();
  const visible = groups[tab].filter((row) => !term
    || row.name.toLowerCase().includes(term) || row.phone.includes(term) || row.email.includes(term)
    || row.items.some((item) => item.name.toLowerCase().includes(term)));

  // The message fits how far the shopper got: a payment that did not go through gets a payment message
  const whatsappLink = (row: Checkout) => {
    const first = row.items[0];
    const link = first?.id ? `https://www.suitauragirls.in/product/${first.id}` : 'https://www.suitauragirls.in/cart';
    const hello = `Hi ${row.name.split(' ')[0] || ''}, this is Suit Aura Girls.`;
    const text = reachedPayment(row)
      ? `${hello} Your payment for ${first ? `"${first.name}"` : 'your order'} (₹${row.total.toLocaleString('en-IN')}) did not go through. Can I help you complete it? ${link}`
      : `${hello} You were looking at ${first ? `"${first.name}"` : 'a style'} on our website. Can I help you with the size, delivery or payment? ${link}`;
    return `https://wa.me/91${row.phone}?text=${encodeURIComponent(text.replace(/\s+/g, ' ').trim())}`;
  };
  // Opening WhatsApp from here counts as contacting the shopper (undo with "Not contacted")
  const messaged = (row: Checkout) => { if (!row.contactedAt) void setContacted(row, true); };

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
    <div className="space-y-5">
      <PageTitle
        title={<>Abandoned checkouts {rows && <span className="font-sans text-ink-muted font-normal text-lg sag-num">({rows.length})</span>}</>}
        line="Shoppers who typed their details at checkout but did not pay. Message them on WhatsApp from your own number: the message fits how far they got, and the card moves to “Contacted”."
        actions={
          <button type="button" onClick={load} disabled={loading} className={adminUi.outline}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      {rows && (
        <KeyNumbers
          label="Abandoned checkouts at a glance"
          items={[
            { label: 'Left today', value: numbers.today, highlight: numbers.today > 0, note: 'Did not pay, no order since' },
            { label: 'Left this week', value: numbers.week, note: numbers.weekValue > 0 ? `₹${numbers.weekValue.toLocaleString('en-IN')} left in bags, the last 7 days` : 'The last 7 days' },
            { label: 'Reminder emails sent', value: numbers.reminded, note: 'Sent automatically to shoppers who left' },
            { label: 'Bought afterwards', value: numbers.recovered, note: 'Paid for an order after leaving' },
          ]}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="sag-scroll-x flex gap-2 min-w-0 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={adminUi.chip}>
              {label} <span className="sag-num font-normal opacity-70">{groups[id].length}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-72 min-w-0">
          <span className="sr-only">Search checkouts</span>
          <Search className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} inputMode="search" placeholder="Search name, phone or product"
            className={adminUi.search} />
        </label>
      </div>

      {error && (
        <div role="alert" className={adminUi.alert}>{error}</div>
      )}
      {!rows && !error && <p role="status" className="text-sm leading-5 text-ink-muted">Loading checkouts…</p>}
      {rows && visible.length === 0 && (
        <EmptyState
          icon={<ShoppingCart />}
          title={tab === 'todo' ? 'Nobody is waiting for a message.' : 'Nothing here.'}
          line={term ? 'No checkout matches your search.' : undefined}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((row) => {
          const ordered = hasPaidOrder(row);
          const pieces = row.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <article key={row.id} className="sag-card p-4 min-w-0 flex flex-col gap-3.5">
              <header className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-base leading-6 font-semibold text-ink truncate">{row.name || 'No name typed'}</p>
                  <p className="text-xs leading-4 text-ink-muted">Left {formatOrderDate(row.updatedAt) || 'time not saved'}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {ordered && <Pill tone="muted" dot>Has a paid order</Pill>}
                  {!ordered && row.contactedAt && <Pill tone="muted" dot>Contacted</Pill>}
                  {!ordered && !row.contactedAt && row.phone.length === 10 && <Pill tone="good" dot>To contact</Pill>}
                </div>
              </header>

              {/* What was in the bag */}
              <div className={`${adminUi.inset} min-w-0`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className={eyebrow}>In the bag{pieces > 0 ? ` · ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}` : ''}</p>
                  <p className="text-lg leading-6 font-semibold text-ink sag-num">₹{row.total.toLocaleString('en-IN')}</p>
                </div>
                {row.items.length === 0 ? (
                  <p className="mt-1.5 text-sm leading-5 text-ink-muted">Empty bag</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {row.items.map((item, index) => (
                      <li key={`${item.id}-${index}`} className="flex items-center gap-2.5 min-w-0">
                        {item.image
                          ? <img src={getCleanImageUrl(item.image, 160)} alt="" loading="lazy" className="w-10 aspect-[4/5] rounded-[12px] object-cover object-top shrink-0 bg-sunken" />
                          : <span className="w-10 aspect-[4/5] rounded-[12px] shrink-0 bg-sunken-deep" aria-hidden="true" />}
                        <p className="min-w-0 text-sm leading-5 text-ink">
                          <span className="line-clamp-1">{item.name}</span>
                          <span className="block text-xs leading-4 text-ink-muted sag-num">{item.size ? `Size ${item.size} · ` : ''}Qty {item.quantity}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <dl className="grid gap-1.5 text-[13px] leading-[18px] min-w-0">
                <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">How far</dt><dd className="min-w-0 text-ink font-medium">{progressOf(row)}</dd></div>
                <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">Phone</dt><dd className="truncate text-ink sag-num">{row.phone.length === 10 ? `+91 ${row.phone}` : 'not typed'}</dd></div>
                {row.email && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">Email</dt><dd className="truncate text-ink">{row.email}</dd></div>}
                {row.place && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">Place</dt><dd className="truncate text-ink">{row.place}</dd></div>}
                {row.source && <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">Came from</dt><dd className="truncate text-ink">{row.source}</dd></div>}
                <div className="flex gap-2 min-w-0">
                  <dt className="shrink-0 w-[5.5rem] text-ink-muted">Reminder</dt>
                  <dd className={`min-w-0 inline-flex items-start gap-1.5 ${row.reminderSentAt ? 'text-ok font-semibold' : 'text-ink-muted'}`}>
                    <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    {row.reminderSentAt
                      ? `Email sent ${formatOrderDate(row.reminderSentAt)}`
                      : row.email ? 'No reminder email sent' : 'No reminder email (no email typed)'}
                  </dd>
                </div>
                {row.contactedAt && (
                  <div className="flex gap-2 min-w-0"><dt className="shrink-0 w-[5.5rem] text-ink-muted">Contacted</dt><dd className="min-w-0 text-ink">{formatOrderDate(row.contactedAt)}</dd></div>
                )}
              </dl>

              {row.phone.length === 10 && (
                <div className="mt-auto pt-3.5 border-t border-line grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <a href={whatsappLink(row)} target="_blank" rel="noopener noreferrer" onClick={() => messaged(row)} className={`${ordered || row.contactedAt ? adminUi.outline : adminUi.primary} col-span-2`}>
                    <MessageCircle className="w-4 h-4" /> Message on WhatsApp
                  </a>
                  <a href={`tel:+91${row.phone}`} className={`${adminUi.outline} px-4`}>
                    <Phone className="w-4 h-4" /> Call
                  </a>
                  <button type="button" onClick={() => setContacted(row, !row.contactedAt)} className={`${adminUi.outline} px-4`}>
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
