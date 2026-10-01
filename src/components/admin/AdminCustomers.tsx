import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { Download, Loader2, Mail, Phone, RefreshCw, Search, Users } from 'lucide-react';

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
    <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${row.hasAccount ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-[#FBF7F3] border-[#4B1D3F]/10 text-[#2A1A26]/70'}`}>
      {row.hasAccount ? 'Account' : 'Guest'}
    </span>
  );

  return (
    <div id="admin-customers-page" className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">Customers</p>
          <h2 className="mt-1 font-serif text-3xl sm:text-4xl font-semibold text-[#4B1D3F] leading-tight">Customers <span className="text-[#2A1A26]/35 font-sans text-xl align-middle tabular-nums">({rows.length})</span></h2>
          <p className="mt-1 text-sm text-[#2A1A26]/60">Accounts created by email sign-in, plus guests who have paid for an order.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="h-10 px-4 bg-white border border-[#4B1D3F]/20 hover:bg-[#F3EEF8] rounded-full text-[13px] font-semibold text-[#4B1D3F] inline-flex items-center gap-2 cursor-pointer transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCsv} disabled={!filtered.length} className="h-10 px-4 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4 text-white" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'All customers', value: rows.length },
          { label: 'With account', value: accountCount },
          { label: 'Have paid', value: buyerCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-[#4B1D3F]/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2A1A26]/55 leading-tight">{stat.label}</p>
            <p className="font-serif text-2xl font-semibold text-[#2A1A26] tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-3 sm:p-4 rounded-3xl border border-[#4B1D3F]/10 relative">
        <Search className="w-4 h-4 text-[#4B1D3F]/50 absolute left-7 sm:left-8 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or phone"
          className="w-full h-11 pl-11 pr-4 border border-[#4B1D3F]/15 bg-[#FBF7F3] rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:bg-white focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 transition"
        />
      </div>

      {error && <div role="alert" className="px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

      {loading && rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 p-4 space-y-3" aria-label="Loading customers">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F3EEF8] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded-full bg-[#F3EEF8] animate-pulse" />
                <div className="h-3 w-1/2 rounded-full bg-[#F3EEF8]/70 animate-pulse" />
              </div>
            </div>
          ))}
          <Loader2 className="sr-only" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 py-14 px-6 text-center space-y-2">
          <span className="mx-auto w-14 h-14 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center mb-2"><Users className="w-6 h-6" /></span>
          <p className="text-sm text-[#2A1A26]/65 max-w-sm mx-auto">{rows.length === 0 ? 'No customers yet. They appear here after signing in or paying for an order.' : 'No customer matches your search.'}</p>
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-3">
            {filtered.map((row) => (
              <li key={row.email} className="bg-white rounded-2xl border border-[#4B1D3F]/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] font-serif font-semibold flex items-center justify-center">{initial(row)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[#2A1A26] truncate">{row.name || '—'}</p>
                      {accountBadge(row)}
                    </div>
                    <p className="text-[12px] text-[#2A1A26]/55">Joined {formatDate(row.createdAt)}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-[13px]">
                  <a href={`mailto:${row.email}`} className="flex items-center gap-2 text-[#2A1A26]/80 break-all"><Mail className="w-3.5 h-3.5 shrink-0 text-[#4B1D3F]/50" />{row.email}</a>
                  {row.phone && <a href={`tel:+91${row.phone}`} className="flex items-center gap-2 text-[#2A1A26]/80"><Phone className="w-3.5 h-3.5 shrink-0 text-[#4B1D3F]/50" />+91 {row.phone}</a>}
                </div>
                <div className="mt-3 pt-3 border-t border-[#4B1D3F]/[0.08] grid grid-cols-3 gap-2 text-[12px]">
                  <div><p className="text-[#2A1A26]/55">Paid orders</p><p className="font-semibold text-[#2A1A26] tabular-nums">{row.orders}</p></div>
                  <div><p className="text-[#2A1A26]/55">Spent</p><p className="font-semibold text-[#2A1A26] tabular-nums">₹{Math.round(row.spent).toLocaleString('en-IN')}</p></div>
                  <div className="min-w-0">
                    <p className="text-[#2A1A26]/55">Last order</p>
                    {row.lastOrderNumber ? (
                      <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className="font-mono font-semibold text-[#4B1D3F] underline underline-offset-2 cursor-pointer truncate max-w-full block">
                        {row.lastOrderNumber}
                      </button>
                    ) : <p className="text-[#2A1A26]/60">—</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] overflow-hidden">
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#FBF7F3] text-[11px] uppercase tracking-[0.12em] text-[#2A1A26]/55">
                  <tr className="border-b border-[#4B1D3F]/10">
                    <th className="py-3.5 pl-5 pr-3 font-semibold">Customer</th>
                    <th className="py-3.5 px-3 font-semibold">Contact</th>
                    <th className="py-3.5 px-3 font-semibold">Account</th>
                    <th className="py-3.5 px-3 text-right font-semibold">Paid orders</th>
                    <th className="py-3.5 px-3 text-right font-semibold">Spent</th>
                    <th className="py-3.5 pl-3 pr-5 font-semibold">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4B1D3F]/[0.06]">
                  {filtered.map((row) => (
                    <tr key={row.email} className="hover:bg-[#FBF7F3] transition-colors">
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] font-serif font-semibold flex items-center justify-center">{initial(row)}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2A1A26] truncate">{row.name || '—'}</p>
                            <p className="text-[12px] text-[#2A1A26]/55">Joined {formatDate(row.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 space-y-0.5">
                        <a href={`mailto:${row.email}`} className="flex items-center gap-1.5 text-[#2A1A26]/80 hover:text-[#4B1D3F] hover:underline"><Mail className="w-3.5 h-3.5 text-[#4B1D3F]/45" />{row.email}</a>
                        {row.phone && <a href={`tel:+91${row.phone}`} className="flex items-center gap-1.5 text-[#2A1A26]/80 hover:text-[#4B1D3F] hover:underline"><Phone className="w-3.5 h-3.5 text-[#4B1D3F]/45" />+91 {row.phone}</a>}
                      </td>
                      <td className="py-3.5 px-3">{accountBadge(row)}</td>
                      <td className="py-3.5 px-3 text-right font-semibold text-[#2A1A26] tabular-nums">{row.orders}</td>
                      <td className="py-3.5 px-3 text-right font-semibold text-[#2A1A26] tabular-nums">₹{Math.round(row.spent).toLocaleString('en-IN')}</td>
                      <td className="py-3.5 pl-3 pr-5">
                        {row.lastOrderNumber ? (
                          <button onClick={() => openAdminOrderDetails(row.lastOrderNumber)} className="font-mono font-semibold text-[#4B1D3F] hover:underline underline-offset-2 cursor-pointer">
                            {row.lastOrderNumber}
                          </button>
                        ) : '—'}
                        <p className="text-[12px] text-[#2A1A26]/55">{formatDate(row.lastOrder)}</p>
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
