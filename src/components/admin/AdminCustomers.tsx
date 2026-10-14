import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { ChevronDown, ChevronRight, Download, Loader2, Mail, MapPin, MessageCircle, Phone, RefreshCw, Search, Users } from 'lucide-react';
import { EmptyState, KeyNumbers, OrderStatusBadge, PageTitle, PaymentBadge, Pill, adminUi } from './PaymentBadge';
import { formatOrderDate } from '../../utils/orderDate';
import type { Order } from '../../types';

type CustomerRow = {
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  lastLoginAt: string;
  hasAccount: boolean;
  orders: number;
  spent: number;
  lastOrder: string;
  lastOrderNumber: string;
  /** Every order the customer placed (paid or not), newest first. */
  orderList: Order[];
  /** Paid orders by how they were paid. */
  cod: number;
  prepaid: number;
  /** Orders that were cancelled (paid or not). */
  cancelled: number;
  /** Orders placed but never paid. */
  unpaid: number;
  city: string;
};

type Segment = 'all' | 'repeat' | 'once' | 'never' | 'high';
const SEGMENTS: Array<{ id: Segment; label: string; line: string }> = [
  { id: 'all', label: 'Everyone', line: 'Accounts and everyone who placed an order' },
  { id: 'repeat', label: 'Repeat buyers', line: 'Two or more paid orders' },
  { id: 'once', label: 'Bought once', line: 'Exactly one paid order' },
  { id: 'never', label: 'Never paid', line: 'Signed in or started an order, but no paid order yet' },
  { id: 'high', label: 'High value', line: 'The top 10% of buyers by money spent' },
];
/** An Indian mobile as 10 digits ('' when it is not one). */
const mobile10 = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  const last = digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(last) ? last : '';
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
};
const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** Customer accounts (created by OTP sign-in) merged with guest buyers from paid orders. */
export const AdminCustomers: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminOrderDetails } = useRouter();
  const [accounts, setAccounts] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // The customer whose orders are open in the list ('' = none)
  const [openEmail, setOpenEmail] = useState('');
  const [segment, setSegment] = useState<Segment>('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocs(collection(db, 'customers'));
      setAccounts(snapshot.docs.map((d) => ({ email: d.id, ...d.data() })));
    } catch (err: any) {
      setError(err?.code === 'permission-denied' ? 'Admin session expired. Sign in again to load customers.' : 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    accounts.forEach((a) => {
      const email = String(a.email || '').toLowerCase();
      if (!email) return;
      map.set(email, {
        email,
        name: a.name || '',
        phone: a.phone || '',
        createdAt: a.createdAt || '',
        lastLoginAt: a.lastLoginAt || '',
        hasAccount: true,
        orders: 0,
        spent: 0,
        lastOrder: '',
        lastOrderNumber: '',
        orderList: [],
        cod: 0, prepaid: 0, cancelled: 0, unpaid: 0, city: '',
      });
    });
    orders.forEach((o) => {
        const email = String(o.customerEmail || '').toLowerCase();
        if (!email) return;
        const row = map.get(email) || {
          email, name: o.customerName || '', phone: o.customerMobile || '', createdAt: '', lastLoginAt: '',
          hasAccount: false, orders: 0, spent: 0, lastOrder: '', lastOrderNumber: '', orderList: [],
          cod: 0, prepaid: 0, cancelled: 0, unpaid: 0, city: '',
        };
        row.orderList.push(o);
        const paid = o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded';
        if (o.status === 'Cancelled') row.cancelled += 1;
        if (paid) {
          row.orders += 1;
          if (o.payMode === 'cod') row.cod += 1; else row.prepaid += 1;
          if (o.status !== 'Cancelled' && o.status !== 'Refunded' && o.paymentStatus === 'Paid') row.spent += o.finalTotal;
          if (String(o.date) > row.lastOrder) {
            row.lastOrder = String(o.date);
            row.lastOrderNumber = o.orderNumber;
          }
        } else {
          row.unpaid += 1;
        }
        if (!row.name) row.name = o.customerName || '';
        if (!row.phone) row.phone = o.customerMobile || '';
        const city = String(o.deliveryAddress?.city || '').trim();
        if (city && (!row.city || paid)) row.city = city;
        map.set(email, row);
      });
    map.forEach((row) => row.orderList.sort((a, b) => String(b.date).localeCompare(String(a.date))));
    return [...map.values()].sort((a, b) => (b.lastOrder || b.createdAt).localeCompare(a.lastOrder || a.createdAt));
  }, [accounts, orders]);

  // "High value": the top 10% of buyers by money spent (at least one buyer), so it follows the store's own numbers
  const highLine = useMemo(() => {
    const spends = rows.filter((r) => r.spent > 0).map((r) => r.spent).sort((a, b) => b - a);
    if (!spends.length) return Infinity;
    return spends[Math.max(0, Math.ceil(spends.length * 0.1) - 1)];
  }, [rows]);
  const inSegment = (row: CustomerRow, seg: Segment) => {
    if (seg === 'repeat') return row.orders > 1;
    if (seg === 'once') return row.orders === 1;
    if (seg === 'never') return row.orders === 0;
    if (seg === 'high') return row.spent > 0 && row.spent >= highLine;
    return true;
  };
  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    return inSegment(row, segment) && (!q || row.email.includes(q) || row.name.toLowerCase().includes(q) || row.phone.includes(q) || row.city.toLowerCase().includes(q));
  });
  const whatsApp = (row: CustomerRow, compact = false) => {
    const number = mobile10(row.phone);
    if (!number) return null;
    const first = (row.name || '').trim().split(/\s+/)[0] || '';
    const text = `${first ? `Namaste ${first}!` : 'Namaste!'} This is Suit Aura Girls.`;
    return (
      <a href={`https://wa.me/91${number}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
        aria-label={`Message ${row.name || row.email} on WhatsApp`} title="Message on WhatsApp" className={compact ? `${adminUi.outlineSmall} shrink-0 !w-10 !px-0` : `${adminUi.outlineSmall} shrink-0`}>
        <MessageCircle className="w-4 h-4" aria-hidden="true" />{!compact && " WhatsApp"}
      </a>
    );
  };
  /** A short line of what the customer did, in plain words, from their real orders. */
  const profileLine = (row: CustomerRow) => [
    row.orders > 0 ? `${row.prepaid} paid online · ${row.cod} cash on delivery` : '',
    row.cancelled > 0 ? `${row.cancelled} cancelled` : '',
    row.unpaid > 0 ? `${row.unpaid} not paid` : '',
  ].filter(Boolean).join(' · ');

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Phone', 'City', 'Account', 'Paid orders', 'Paid online', 'Cash on delivery', 'Cancelled', 'Not paid', 'Total spent', 'Last order', 'Joined'];
    const lines = filtered.map((r) => [r.name, r.email, r.phone, r.city, r.hasAccount ? 'Yes' : 'Guest', r.orders, r.prepaid, r.cod, r.cancelled, r.unpaid, Math.round(r.spent), formatDate(r.lastOrder), formatDate(r.createdAt)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suitauragirls-customers-${segment === 'all' ? '' : `${segment}-`}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const accountCount = rows.filter((r) => r.hasAccount).length;
  const buyerCount = rows.filter((r) => r.orders > 0).length;
  const repeatCount = rows.filter((r) => r.orders > 1).length;
  const initial = (row: CustomerRow) => (row.name || row.email || '?').trim().charAt(0).toUpperCase();
  const accountBadge = (row: CustomerRow) => (
    <Pill tone={row.hasAccount ? 'good' : 'muted'} className="shrink-0">
      {row.hasAccount ? 'Account' : 'Guest'}
    </Pill>
  );
  const toggleOrders = (row: CustomerRow) => setOpenEmail((current) => (current === row.email ? '' : row.email));
  const ordersButton = (row: CustomerRow, className = '') => row.orderList.length > 0 ? (
    <button
      type="button"
      onClick={() => toggleOrders(row)}
      aria-expanded={openEmail === row.email}
      aria-controls={`customer-orders-${row.email}`}
      className={`${adminUi.outlineSmall} ${className}`}
    >
      {openEmail === row.email ? 'Hide orders' : `View orders (${row.orderList.length})`}
      <ChevronDown className={`w-4 h-4 transition-transform ${openEmail === row.email ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  ) : <span className="text-[13px] text-ink-muted">No orders</span>;

  /** The customer's paid orders, newest first; each one opens the order page. */
  const ordersList = (row: CustomerRow) => (
    <ul id={`customer-orders-${row.email}`} aria-label={`Orders of ${row.name || row.email}`} className="divide-y divide-line">
      {row.orderList.map((o) => (
        <li key={o.orderNumber}>
          <button
            type="button"
            onClick={() => openAdminOrderDetails(o.orderNumber)}
            className="w-full min-h-12 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-[13px] leading-[18px] cursor-pointer transition-colors hover:bg-sunken rounded-[16px] px-2 -mx-2"
          >
            <span className={`${adminUi.link} text-sm font-semibold sag-num`}>{o.orderNumber}</span>
            <span className="text-ink-muted">{formatOrderDate(o.date)}</span>
            <OrderStatusBadge status={o.status} />
            <PaymentBadge order={o} />
            {o.payMode === 'cod' && <span className="text-ink-muted">Cash on delivery</span>}
            <span className="ml-auto text-sm font-semibold text-ink sag-num inline-flex items-center gap-1">
              {inr(Number(o.finalTotal) || 0)} <ChevronRight className="w-4 h-4 text-ink-muted" aria-hidden="true" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div id="admin-customers-page" className="space-y-5">
      <PageTitle
        title={<>Customers <span className="font-sans text-ink-muted font-normal text-lg sag-num">({rows.length})</span></>}
        line="Everyone who signed in or placed an order, as profiles: what they bought, how they paid, what they spent. Pick a group, then message or download it."
        actions={
          <>
            <button onClick={load} className={`${adminUi.outline} flex-1 sm:flex-none`}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={!filtered.length} className={`${adminUi.primary} flex-1 sm:flex-none`}>
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </>
        }
      />

      <KeyNumbers
        label="Customers at a glance"
        items={[
          { label: 'All customers', value: rows.length, note: 'Accounts and everyone who ordered' },
          { label: 'With account', value: accountCount, note: 'Signed in with their email' },
          { label: 'Have paid', value: buyerCount, note: 'At least one paid order' },
          { label: 'Bought again', value: repeatCount, note: 'Two or more paid orders' },
        ]}
      />

      <div role="group" aria-label="Customer groups" className="flex flex-nowrap gap-2 max-w-full overflow-x-auto sag-scroll-x">
        {SEGMENTS.map((s) => (
          <button key={s.id} type="button" aria-pressed={segment === s.id} onClick={() => setSegment(s.id)} title={s.line}
            className="sag-chip h-11 px-4 shrink-0 whitespace-nowrap gap-1.5 text-sm">
            {s.label} <span className="sag-num opacity-80">{rows.filter((r) => inSegment(r, s.id)).length}</span>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[13px] leading-[18px] text-ink-muted">
        {SEGMENTS.find((s) => s.id === segment)?.line}
        {segment === 'high' && Number.isFinite(highLine) ? ` (spent ${inr(highLine)} or more).` : '.'}
        {filtered.length > 0 && ' Export CSV downloads just this group.'}
      </p>

      <div className="relative">
        <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          aria-label="Search customers"
          placeholder="Search by name, email, phone or city"
          className={adminUi.search}
        />
      </div>

      {error && <div role="alert" className={adminUi.alert}>{error}</div>}

      {loading && rows.length === 0 ? (
        <div className={`${adminUi.panel} space-y-4`} role="status" aria-label="Loading customers">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sunken-deep" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-sunken-deep" />
                <div className="h-3 w-1/2 rounded bg-sunken-deep" />
              </div>
            </div>
          ))}
          <Loader2 className="sr-only" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={rows.length === 0 ? 'No customers yet' : 'No customer matches your search'}
          line={rows.length === 0 ? 'They appear here after signing in or paying for an order.' : undefined}
        />
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-2.5">
            {filtered.map((row) => (
              <li key={row.email} className="sag-card p-3.5">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 ${adminUi.avatar}`} aria-hidden="true">{initial(row)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] leading-5 font-semibold text-ink truncate">{row.name || '—'}</p>
                      {accountBadge(row)}
                    </div>
                    <p className="text-xs leading-4 text-ink-muted">{row.city ? <><MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden="true" /> {row.city} · </> : ''}{row.createdAt ? `Joined ${formatDate(row.createdAt)}` : 'Guest'}</p>
                  </div>
                  {whatsApp(row)}
                </div>
                {profileLine(row) && <p className="mt-2 text-[13px] leading-[18px] text-ink-muted">{profileLine(row)}</p>}
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-[16px] bg-page p-3">
                  <div><dt className="text-xs leading-4 text-ink-muted">Paid orders</dt><dd className="mt-0.5 text-lg leading-6 font-semibold text-ink sag-num">{row.orders}</dd></div>
                  <div><dt className="text-xs leading-4 text-ink-muted">Spent</dt><dd className="mt-0.5 text-lg leading-6 font-semibold text-ink sag-num">{inr(row.spent)}</dd></div>
                  <div className="min-w-0">
                    <dt className="text-xs leading-4 text-ink-muted">Last order</dt>
                    <dd className="mt-0.5 text-[13px] leading-[18px] text-ink">
                      {formatDate(row.lastOrder)}
                      {row.lastOrderNumber ? (
                        <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className={`${adminUi.link} sag-num truncate max-w-full block py-0.5 -my-0.5 text-left`}>
                          {row.lastOrderNumber}
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </dl>
                <div className="mt-1.5 text-sm leading-5">
                  <a href={`mailto:${row.email}`} className="min-h-11 flex items-center gap-2.5 text-ink break-all"><Mail className="w-4 h-4 shrink-0 text-ink-muted" />{row.email}</a>
                  {row.phone && <a href={`tel:+91${row.phone}`} className="min-h-11 flex items-center gap-2.5 text-ink border-t border-line sag-num"><Phone className="w-4 h-4 shrink-0 text-ink-muted" />+91 {row.phone}</a>}
                </div>
                {row.orderList.length > 0 && (
                  <div className="pt-2.5 border-t border-line">
                    {ordersButton(row, 'w-full')}
                    {openEmail === row.email && <div className="mt-2">{ordersList(row)}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className={`hidden md:block ${adminUi.panelFlush}`}>
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={`${adminUi.th} pl-5`}>Customer</th>
                    <th className={adminUi.th}>Contact</th>
                    <th className={adminUi.th}>Account</th>
                    <th className={`${adminUi.th} text-right`}>Paid orders</th>
                    <th className={`${adminUi.th} text-right`}>Total spent</th>
                    <th className={adminUi.th}>Last order</th>
                    <th className={`${adminUi.th} pr-5 text-right`}><span className="sr-only">Their orders</span></th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:border-b [&>tr>td]:border-line [&>tr:last-child>td]:border-b-0">
                  {filtered.map((row) => (
                    <React.Fragment key={row.email}>
                      <tr className={adminUi.row}>
                        <td className={`${adminUi.td} pl-5`}>
                          <div className="flex items-center gap-3">
                            <span className={`w-9 h-9 ${adminUi.avatar}`} aria-hidden="true">{initial(row)}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink truncate">{row.name || '—'}</p>
                              <p className="text-xs text-ink-muted">{row.city ? `${row.city} · ` : ''}{row.createdAt ? `Joined ${formatDate(row.createdAt)}` : 'Guest'}</p>
                              {profileLine(row) && <p className="text-xs text-ink-muted">{profileLine(row)}</p>}
                            </div>
                          </div>
                        </td>
                        <td className={`${adminUi.td} space-y-0.5`}>
                          <a href={`mailto:${row.email}`} className="flex items-center gap-1.5 text-ink hover:text-brand hover:underline"><Mail className="w-3.5 h-3.5 text-ink-muted" />{row.email}</a>
                          {row.phone && <a href={`tel:+91${row.phone}`} className="flex items-center gap-1.5 text-ink hover:text-brand hover:underline sag-num"><Phone className="w-3.5 h-3.5 text-ink-muted" />+91 {row.phone}</a>}
                        </td>
                        <td className={adminUi.td}>{accountBadge(row)}</td>
                        <td className={`${adminUi.td} text-right text-[15px] font-semibold text-ink sag-num`}>{row.orders}</td>
                        <td className={`${adminUi.td} text-right text-[15px] font-semibold text-ink sag-num whitespace-nowrap`}>{inr(row.spent)}</td>
                        <td className={`${adminUi.td} whitespace-nowrap`}>
                          <p className="text-ink">{formatDate(row.lastOrder)}</p>
                          {row.lastOrderNumber ? (
                            <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className={`${adminUi.link} text-xs sag-num`}>
                              {row.lastOrderNumber}
                            </button>
                          ) : null}
                        </td>
                        <td className={`${adminUi.td} pr-5 text-right whitespace-nowrap`}><div className="inline-flex items-center gap-2">{whatsApp(row, true)}{ordersButton(row)}</div></td>
                      </tr>
                      {openEmail === row.email && row.orderList.length > 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-2 bg-sunken">
                            {ordersList(row)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
