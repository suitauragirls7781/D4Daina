import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { History, RefreshCw } from 'lucide-react';
import { adminDb as db } from '../../lib/firebase';
import { COLLECTIONS } from '../../lib/dataStore';
import { useAdmin } from '../../context/AdminContext';
import type { InventoryLogEntry } from '../../utils/inventory';

const MAX_ENTRIES = 100;

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : iso;
};

/**
 * Admin → Products → Stock history: the latest stock changes made in the admin panel (newest first).
 * Read on demand (not a live listener) to keep database reads low. Stock taken by paid orders is not listed
 * here; it shows on each order.
 */
export const AdminStockHistory: React.FC = () => {
  const { products = [] } = useAdmin();
  const [productId, setProductId] = useState('');
  const [entries, setEntries] = useState<InventoryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const source = collection(db, COLLECTIONS.inventoryLog);
    // One product: equality filter only (no composite index needed), sorted here; all products: newest 100.
    const request = productId
      ? getDocs(query(source, where('productId', '==', productId), limit(300)))
      : getDocs(query(source, orderBy('at', 'desc'), limit(MAX_ENTRIES)));
    request
      .then((snapshot) => {
        if (cancelled) return;
        const rows = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<InventoryLogEntry, 'id'>) }))
          .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
          .slice(0, MAX_ENTRIES);
        setEntries(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Stock history could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, reloadKey]);

  const productOptions = [...products].sort((a, b) => a.name.localeCompare(b.name));


  const diffBadge = (diff: number) => (
    <span className={`inline-flex items-center min-h-[22px] px-2.5 py-0.5 rounded-full text-xs font-semibold sag-num shrink-0 ${diff > 0 ? 'bg-ok-tint text-ok' : 'bg-sunken-deep text-ink'}`}>{diff > 0 ? `+${diff} added` : `${diff} removed`}</span>
  );

  return (
    <section aria-label="Stock history" className="sag-glass overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 shrink-0 rounded-full bg-sunken text-brand flex items-center justify-center">
            <History className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[17px] leading-6 font-semibold text-ink">Stock history</h3>
            <p className="text-[13px] text-ink-muted">Every time stock was changed by hand in the admin panel: the last {MAX_ENTRIES} changes, newest first. Stock taken by orders shows on each order.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Filter stock history by product"
            className="sag-input flex-1 sm:flex-none min-w-0 sm:max-w-[260px]"
          >
            <option value="">All products</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            aria-label="Refresh stock history"
            className="h-11 w-11 shrink-0 rounded-full bg-sunken text-ink hover:bg-sunken-deep flex items-center justify-center disabled:opacity-50 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-4 px-4 py-3 rounded-[16px] bg-danger-tint border border-danger-line text-sm text-danger">{error}</p>
      ) : loading && entries.length === 0 ? (
        <div className="p-5 space-y-3" aria-label="Loading stock history">
          {[70, 55, 64, 48].map((w) => (
            <div key={w} className="flex items-center gap-4">
              <div className="h-3 w-24 rounded-full bg-sunken-deep" />
              <div className="h-3 rounded-full bg-sunken-deep" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <span className="mx-auto w-12 h-12 rounded-full bg-sunken text-ink-muted flex items-center justify-center mb-3"><History className="w-6 h-6" /></span>
          <p className="text-base font-semibold text-ink">{productId ? 'No stock changes for this product' : 'No stock changes yet'}</p>
          <p className="mt-1 text-sm text-ink-muted max-w-md mx-auto">No stock changes recorded yet. Changes made from now on in Products and Complete the Look appear here.</p>
        </div>
      ) : (
        <>
          {/* Phone: stacked rows */}
          <ul className="sm:hidden divide-y divide-line">
            {entries.map((entry) => {
              const diff = Number(entry.to) - Number(entry.from);
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink min-w-0 break-words">{entry.productName || entry.productId}</p>
                    {diffBadge(diff)}
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-muted"><span className="sag-num text-ink">{entry.from} → {entry.to}</span> · {entry.reason}</p>
                  <p className="text-[13px] text-ink-muted">{formatWhen(entry.at)}</p>
                </li>
              );
            })}
          </ul>

          {/* Tablet / desktop: table */}
          <div className="hidden sm:block overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  <th className="py-3 pl-5 pr-3 font-medium">When</th>
                  <th className="py-3 px-3 font-medium">Product</th>
                  <th className="py-3 px-3 font-medium text-right">Stock before → after</th>
                  <th className="py-3 pl-3 pr-5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((entry) => {
                  const diff = Number(entry.to) - Number(entry.from);
                  return (
                    <tr key={entry.id} className="hover:bg-sunken transition-colors">
                      <td className="py-3 pl-5 pr-3 whitespace-nowrap text-ink-muted">{formatWhen(entry.at)}</td>
                      <td className="py-3 px-3 font-medium text-ink max-w-[260px] truncate">{entry.productName || entry.productId}</td>
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <span className="text-ink-muted tabular-nums">{entry.from} → {entry.to}</span>
                        <span className="ml-2">{diffBadge(diff)}</span>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-ink-muted">{entry.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
