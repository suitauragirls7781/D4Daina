import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { ChevronDown, ChevronRight, Download, Loader2, Mail, Phone, RefreshCw, Search, Users } from 'lucide-react';
import { EmptyState, KeyNumbers, OrderStatusBadge, PageTitle, Pill, adminUi } from './PaymentBadge';
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
  /** The customer's paid (or refunded) orders, the ones counted in `orders`. */
  orderList: Order[];
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
      });
    });
    orders
      .filter((o) => o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')
      .forEach((o) => {
        const email = String(o.customerEmail || '').toLowerCase();
        if (!email) return;
        const row = map.get(email) || {
          email, name: o.customerName || '', phone: o.customerMobile || '', createdAt: '', lastLoginAt: '',
          hasAccount: false, orders: 0, spent: 0, lastOrder: '', lastOrderNumber: '', orderList: [],
        };
        row.orders += 1;
        row.orderList.push(o);
        if (o.status !== 'Cancelled' && o.status !== 'Refunded' && o.paymentStatus === 'Paid') row.spent += o.finalTotal;
        if (!row.name) row.name = o.customerName || '';
        if (!row.phone) row.phone = o.customerMobile || '';
        if (String(o.date) > row.lastOrder) {
          row.lastOrder = String(o.date);
          row.lastOrderNumber = o.orderNumber;
        }
        map.set(email, row);
      });
    map.forEach((row) => row.orderList.sort((a, b) => String(b.date).localeCompare(String(a.date))));
    return [...map.values()].sort((a, b) => (b.lastOrder || b.createdAt).localeCompare(a.lastOrder || a.createdAt));
  }, [accounts, orders]);

  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    return !q || row.email.includes(q) || row.name.toLowerCase().includes(q) || row.phone.includes(q);
  });

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Phone', 'Account', 'Paid orders', 'Total spent', 'Last order', 'Joined'];
    const lines = filtered.map((r) => [r.name, r.email, r.phone, r.hasAccount ? 'Yes' : 'Guest', r.orders, Math.round(r.spent), formatDate(r.lastOrder), formatDate(r.createdAt)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suitauragirls-customers-${new Date().toISOString().slice(0, 10)}.csv`;
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
  const ordersButton = (row: CustomerRow, className = '') => row.orders > 0 ? (
    <button
      type="button"
      onClick={() => toggleOrders(row)}
      aria-expanded={openEmail === row.email}
      aria-controls={`customer-orders-${row.email}`}
      className={`${adminUi.outlineSmall} ${className}`}
    >
      {openEmail === row.email ? 'Hide orders' : `View orders (${row.orders})`}
      <ChevronDown className={`w-4 h-4 transition-transform ${openEmail === row.email ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  ) : <span className="text-[13px] text-ink-muted">No paid orders</span>;

  /** The customer's paid orders, newest first; each one opens the order page. */
  const ordersList = (row: CustomerRow) => (
    <ul id={`customer-orders-${row.email}`} aria-label={`Orders of ${row.name || row.email}`} className="divide-y divide-line">
      {row.orderList.map((o) => (
        <li key={o.orderNumber}>
          <button
            type="button"
            onClick={() => openAdminOrderDetails(o.orderNumber)}
            className="w-full min-h-12 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-[13px] leading-[18px] cursor-pointer transition-colors hover:bg-sunken rounded-xl px-2 -mx-2"
          >
            <span className={`${adminUi.link} text-sm font-semibold sag-num`}>{o.orderNumber}</span>
            <span className="text-ink-muted">{formatOrderDate(o.date)}</span>
            <OrderStatusBadge status={o.status} />
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
        line="Everyone who signed in with their email, plus guests who have paid for an order. See what each one bought and how much they spent."
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
          { label: 'All customers', value: rows.length, note: 'Accounts and paying guests' },
          { label: 'With account', value: accountCount, note: 'Signed in with their email' },
          { label: 'Have paid', value: buyerCount, note: 'At least one paid order' },
          { label: 'Bought again', value: repeatCount, note: 'Two or more paid orders' },
        ]}
      />

      <div className="relative">
        <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          aria-label="Search customers"
          placeholder="Search by name, email or phone"
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
                    <p className="text-xs leading-4 text-ink-muted">Joined {formatDate(row.createdAt)}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-sunken p-3">
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
                {row.orders > 0 && (
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
                              <p className="text-xs text-ink-muted">Joined {formatDate(row.createdAt)}</p>
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
                        <td className={`${adminUi.td} pr-5 text-right whitespace-nowrap`}>{ordersButton(row)}</td>
                      </tr>
                      {openEmail === row.email && row.orders > 0 && (
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
