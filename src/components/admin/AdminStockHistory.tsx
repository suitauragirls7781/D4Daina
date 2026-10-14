import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { History, RefreshCw } from 'lucide-react';
import { adminDb as db } from '../../lib/firebase';
import { COLLECTIONS } from '../../lib/dataStore';
import { useAdmin } from '../../context/AdminContext';
import type { InventoryLogEntry } from '../../utils/inventory';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { dayLabel, istDay, istToday, shiftDay } from './adminStats';

const MAX_ENTRIES = 100;

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : '';
};
/** "Today", "Yesterday" or the date, India time. */
const dayHeading = (day: string) => {
  if (!day) return 'Date not known';
  const today = istToday();
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return dayLabel(day, day.slice(0, 4) !== today.slice(0, 4));
};

/**
 * Admin → Products → Stock history: the latest stock changes made in the admin panel (newest first), grouped by
 * day, each with the product's photo, what changed and why. Read on demand (not a live listener) to keep
 * database reads low. Stock taken by paid orders is not listed here; it shows on each order.
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
  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  // The shown changes in numbers, and grouped by India day
  const { added, removed, groups } = useMemo(() => {
    let added = 0;
    let removed = 0;
    const groups: Array<{ day: string; rows: InventoryLogEntry[] }> = [];
    entries.forEach((entry) => {
      const diff = Number(entry.to) - Number(entry.from);
      if (diff > 0) added += diff; else removed -= diff;
      const day = istDay(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(entry);
      else groups.push({ day, rows: [entry] });
    });
    return { added, removed, groups };
  }, [entries]);

  const diffBadge = (diff: number) => (
    <span className={`inline-flex items-center min-h-[22px] px-2.5 py-0.5 rounded-full text-xs font-semibold sag-num shrink-0 ${diff > 0 ? 'bg-ok-tint text-ok' : 'bg-sunken-deep text-ink'}`}>{diff > 0 ? `+${diff} added` : `${diff} removed`}</span>
  );
  const photoOf = (entry: InventoryLogEntry) => {
    const url = byId.get(String(entry.productId))?.images?.[0];
    return url
      ? <img src={getCleanImageUrl(url, 160)} alt="" loading="lazy" className="w-10 aspect-[4/5] shrink-0 rounded-[10px] object-cover object-top bg-sunken" />
      : <span className="w-10 aspect-[4/5] shrink-0 rounded-[10px] bg-sunken" aria-hidden="true" />;
  };

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
        <div className="flex items-center gap-2 sm:shrink-0">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Filter stock history by product"
            className="sag-input flex-1 sm:flex-none min-w-0 sm:!w-[240px]"
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
            <RefreshCw className={`w-4 h-4 ${loading ? 'motion-safe:animate-spin' : ''}`} />
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
          {/* The shown changes in one line */}
          <p id="stock-history-summary" className="px-4 sm:px-5 py-3 border-b border-line text-[13px] text-ink-muted sag-num" aria-live="polite">
            <span className="font-semibold text-ink">{entries.length} change{entries.length === 1 ? '' : 's'}</span> shown
            {added > 0 && <> · <span className="font-semibold text-ok">+{added}</span> pieces added</>}
            {removed > 0 && <> · <span className="font-semibold text-ink">−{removed}</span> pieces taken off</>}
          </p>

          <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
            {groups.map((group) => (
              <section key={group.day || 'unknown'} aria-label={dayHeading(group.day)}>
                <h4 className="sticky top-0 z-10 bg-surface px-4 sm:px-5 py-2 border-b border-line text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted">
                  {dayHeading(group.day)} <span className="font-semibold normal-case tracking-normal sag-num">· {group.rows.length}</span>
                </h4>
                <ul className="divide-y divide-line">
                  {group.rows.map((entry) => {
                    const diff = Number(entry.to) - Number(entry.from);
                    return (
                      <li key={entry.id} className="px-4 sm:px-5 py-3 flex items-start gap-3 hover:bg-sunken transition-colors">
                        {photoOf(entry)}
                        <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink break-words sm:truncate">{entry.productName || entry.productId}</p>
                            <p className="mt-0.5 text-[13px] text-ink-muted">
                              <span className="sag-num text-ink">{entry.from} → {entry.to}</span> · {entry.reason} · <span className="sag-num">{timeOf(entry.at)}</span>
                            </p>
                          </div>
                          <div className="mt-1.5 sm:mt-0">{diffBadge(diff)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
