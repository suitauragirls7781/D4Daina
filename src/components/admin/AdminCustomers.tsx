import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { Download, Loader2, Mail, Phone, RefreshCw, Search, Users } from 'lucide-react';
import { AdminPageHeader, tone, ui } from './kidsToysShared';

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
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
};

/** Customer accounts (created by OTP sign-in) merged with guest buyers from paid orders. */
export const AdminCustomers: React.FC = () => {
  const { orders = [] } = useAdmin();
  const { openAdminOrderDetails } = useRouter();
  const [accounts, setAccounts] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

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
      });
    });
    orders
      .filter((o) => o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')
      .forEach((o) => {
        const email = String(o.customerEmail || '').toLowerCase();
        if (!email) return;
        const row = map.get(email) || {
          email, name: o.customerName || '', phone: o.customerMobile || '', createdAt: '', lastLoginAt: '',
          hasAccount: false, orders: 0, spent: 0, lastOrder: '', lastOrderNumber: '',
        };
        row.orders += 1;
        if (o.status !== 'Cancelled' && o.status !== 'Refunded' && o.paymentStatus === 'Paid') row.spent += o.finalTotal;
        if (!row.name) row.name = o.customerName || '';
        if (!row.phone) row.phone = o.customerMobile || '';
        if (String(o.date) > row.lastOrder) {
          row.lastOrder = String(o.date);
          row.lastOrderNumber = o.orderNumber;
        }
        map.set(email, row);
      });
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
  const initial = (row: CustomerRow) => (row.name || row.email || '?').trim().charAt(0).toUpperCase();
  const accountBadge = (row: CustomerRow) => (
    <span className={`shrink-0 ${ui.badge} ${row.hasAccount ? tone.ok : tone.muted}`}>
      {row.hasAccount ? 'Account' : 'Guest'}
    </span>
  );
  const avatar = 'shrink-0 rounded-full bg-sunken text-ink text-sm font-bold flex items-center justify-center';

  return (
    <div id="admin-customers-page" className="space-y-4">
      <AdminPageHeader
        eyebrow="Sales"
        title={<>Customers <span className="text-ink-muted font-normal tabular-nums">({rows.length})</span></>}
        icon={<Users />}
        description="Accounts created by email sign-in, plus guests who have paid for an order."
        actions={
          <>
            <button onClick={load} className={`${ui.outline} flex-1 sm:flex-none`}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={!filtered.length} className={`${ui.primary} flex-1 sm:flex-none`}>
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </>
        }
      />

      <dl className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'All customers', value: rows.length },
          { label: 'With account', value: accountCount },
          { label: 'Have paid', value: buyerCount },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 bg-white rounded-2xl border border-line px-3 py-2.5 sm:px-4">
            <dt className={ui.eyebrow}>{stat.label}</dt>
            <dd className={ui.stat}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative">
        <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          aria-label="Search customers"
          placeholder="Search by name, email or phone"
          className={ui.search}
        />
      </div>

      {error && <div role="alert" className={ui.alert}>{error}</div>}

      {loading && rows.length === 0 ? (
        <div className={`${ui.card} space-y-4`} role="status" aria-label="Loading customers">
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
        <div className={ui.empty}>
          <Users className="mx-auto w-6 h-6 text-ink-muted mb-2" aria-hidden="true" />
          <p className="text-sm leading-5 text-ink-muted max-w-sm mx-auto">{rows.length === 0 ? 'No customers yet. They appear here after signing in or paying for an order.' : 'No customer matches your search.'}</p>
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-2.5">
            {filtered.map((row) => (
              <li key={row.email} className="bg-white rounded-2xl border border-line p-3.5">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 ${avatar}`} aria-hidden="true">{initial(row)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] leading-5 font-semibold text-ink truncate">{row.name || '—'}</p>
                      {accountBadge(row)}
                    </div>
                    <p className="text-xs leading-4 text-ink-muted">Joined {formatDate(row.createdAt)}</p>
                  </div>
                </div>
                <div className="mt-1.5 text-sm leading-5">
                  <a href={`mailto:${row.email}`} className="min-h-11 flex items-center gap-2.5 text-ink break-all"><Mail className="w-4 h-4 shrink-0 text-ink-muted" />{row.email}</a>
                  {row.phone && <a href={`tel:+91${row.phone}`} className="min-h-11 flex items-center gap-2.5 text-ink border-t border-line"><Phone className="w-4 h-4 shrink-0 text-ink-muted" />+91 {row.phone}</a>}
                </div>
                <dl className="pt-2.5 border-t border-line grid grid-cols-3 gap-2 text-[13px] leading-[18px]">
                  <div><dt className="text-ink-muted">Paid orders</dt><dd className="font-bold text-ink tabular-nums">{row.orders}</dd></div>
                  <div><dt className="text-ink-muted">Spent</dt><dd className="font-bold text-ink tabular-nums">₹{Math.round(row.spent).toLocaleString('en-IN')}</dd></div>
                  <div className="min-w-0">
                    <dt className="text-ink-muted">Last order</dt>
                    <dd>
                      {row.lastOrderNumber ? (
                        <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className={`${ui.link} font-mono truncate max-w-full block py-0.5 -my-0.5`}>
                          {row.lastOrderNumber}
                        </button>
                      ) : <span className="text-ink-muted">—</span>}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className={`hidden md:block ${ui.panel}`}>
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px]">
                <thead className={`sticky top-0 z-10 ${ui.thead}`}>
                  <tr className="border-b border-line">
                    <th className="py-2.5 pl-5 pr-3 font-semibold">Customer</th>
                    <th className="py-2.5 px-3 font-semibold">Contact</th>
                    <th className="py-2.5 px-3 font-semibold">Account</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Paid orders</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Spent</th>
                    <th className="py-2.5 pl-3 pr-5 font-semibold">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((row) => (
                    <tr key={row.email} className="hover:bg-page transition-colors">
                      <td className="py-3 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 ${avatar}`} aria-hidden="true">{initial(row)}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink truncate">{row.name || '—'}</p>
                            <p className="text-xs text-ink-muted">Joined {formatDate(row.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 space-y-0.5">
                        <a href={`mailto:${row.email}`} className="flex items-center gap-1.5 text-ink hover:text-brand hover:underline"><Mail className="w-3.5 h-3.5 text-ink-muted" />{row.email}</a>
                        {row.phone && <a href={`tel:+91${row.phone}`} className="flex items-center gap-1.5 text-ink hover:text-brand hover:underline"><Phone className="w-3.5 h-3.5 text-ink-muted" />+91 {row.phone}</a>}
                      </td>
                      <td className="py-3 px-3">{accountBadge(row)}</td>
                      <td className="py-3 px-3 text-right font-semibold text-ink tabular-nums">{row.orders}</td>
                      <td className="py-3 px-3 text-right font-bold text-ink tabular-nums">₹{Math.round(row.spent).toLocaleString('en-IN')}</td>
                      <td className="py-3 pl-3 pr-5">
                        {row.lastOrderNumber ? (
                          <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className={`${ui.link} font-mono`}>
                            {row.lastOrderNumber}
                          </button>
                        ) : '—'}
                        <p className="text-xs text-ink-muted">{formatDate(row.lastOrder)}</p>
                      </td>
                    </tr>
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
