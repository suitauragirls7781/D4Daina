import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { istDay, num } from './adminStats';
import { Panel, Thumb } from './adminUi';

interface DayCounts {
  views: Record<string, number>;
  wishlists: Record<string, number>;
  terms: Record<string, number>;
}
const emptyDay = (): DayCounts => ({ views: {}, wishlists: {}, terms: {} });
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

interface AdminInsightsProps {
  /** The days of the chosen period (YYYY-MM-DD). */
  days: string[];
  /** The period in words, e.g. "today" or "the last 7 days". */
  periodWords: string;
  /** The period switch, shown in the first panel. */
  action?: React.ReactNode;
}

/**
 * Top products (most viewed, most sold), searches and wishlist saves for the chosen period.
 * Views, saves and searches are the server's own counts (one per visitor per item per day); units sold
 * come from the paid orders. Each day is read once and kept, so changing the period reads only new days.
 */
export const AdminInsights: React.FC<AdminInsightsProps> = ({ days, periodWords, action }) => {
  const { products = [], orders = [], ordersLoaded } = useAdmin();
  const { openAdminProductEdit } = useRouter();
  const cache = useRef(new Map<string, DayCounts>());
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const key = days.join(',');
  useEffect(() => {
    const missing = days.filter((day) => !cache.current.has(day));
    if (!missing.length) { setLoading(false); return; }
    let stopped = false;
    setLoading(true);
    setFailed(false);
    Promise.all(chunks(missing, 10).map((part) => Promise.all([
      getDocs(query(collection(db, 'search_terms'), where('day', 'in', part))),
      getDocs(query(collection(db, 'product_daily'), where('day', 'in', part))),
    ]))).then((results) => {
      if (stopped) return;
      missing.forEach((day) => cache.current.set(day, emptyDay()));
      results.forEach(([terms, productRows]) => {
        terms.docs.forEach((d) => {
          const x = d.data();
          const row = cache.current.get(String(x.day));
          if (row && x.term) row.terms[String(x.term)] = (row.terms[String(x.term)] || 0) + (Number(x.count) || 0);
        });
        productRows.docs.forEach((d) => {
          const x = d.data();
          const row = cache.current.get(String(x.day));
          const id = String(x.productId || '');
          if (!row || !id) return;
          row.views[id] = (row.views[id] || 0) + (Number(x.views) || 0);
          row.wishlists[id] = (row.wishlists[id] || 0) + (Number(x.wishlists) || 0);
        });
      });
      setVersion((n) => n + 1);
    }).catch(() => { if (!stopped) setFailed(true); }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const { viewed, saved, terms } = useMemo(() => {
    const sum = (pick: (d: DayCounts) => Record<string, number>) => {
      const total = new Map<string, number>();
      days.forEach((day) => Object.entries(pick(cache.current.get(day) || emptyDay())).forEach(([id, n]) => total.set(id, (total.get(id) || 0) + n)));
      return [...total.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    };
    return { viewed: sum((d) => d.views).slice(0, 5), saved: sum((d) => d.wishlists).slice(0, 5), terms: sum((d) => d.terms).slice(0, 8) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  // Units sold in the period: paid orders, not cancelled or refunded, by the India-time day they were paid
  const sold = useMemo(() => {
    const inPeriod = new Set(days);
    const units = new Map<string, number>();
    orders.forEach((o) => {
      if (o.testPayment || o.paymentStatus !== 'Paid' || o.status === 'Cancelled' || o.status === 'Refunded') return;
      if (!inPeriod.has(istDay(o.paidAt || o.date))) return;
      o.items.forEach((item) => {
        const id = String(item.product?.id || '');
        if (id) units.set(id, (units.get(id) || 0) + (Number(item.quantity) || 0));
      });
    });
    return [...units.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, key]);

  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const counted = loading ? 'Loading…' : failed ? 'These counts could not be read right now.' : `No data for ${periodWords}.`;
  const head = 'text-[11px] leading-4 font-bold uppercase tracking-[0.12em] text-ink-muted';

  const productList = (rows: Array<[string, number]>, unit: (n: number) => string, empty: string) => (rows.length === 0
    ? <p className="py-5 text-sm leading-5 text-ink-muted">{empty}</p>
    : (
      <ol className="mt-1 divide-y divide-line">
        {rows.map(([id, n], i) => {
          const product = byId.get(id);
          const body = (
            <>
              <span className="w-4 shrink-0 sag-num text-[13px] text-ink-muted">{i + 1}</span>
              <Thumb url={product?.images?.[0] || product?.image} />
              <span className="min-w-0 flex-1 text-sm leading-5 text-ink line-clamp-2">{product?.name || 'Removed product'}</span>
              <span className="shrink-0 sag-num text-sm font-medium text-ink">{unit(n)}</span>
            </>
          );
          return (
            <li key={id}>
              {product
                ? <button type="button" onClick={() => openAdminProductEdit(String(product.id))} className="w-full py-2 flex items-center gap-3 text-left hover:bg-sunken transition-colors cursor-pointer">{body}</button>
                : <div className="py-2 flex items-center gap-3">{body}</div>}
            </li>
          );
        })}
      </ol>
    ));

  const plainList = (rows: Array<[string, number]>, label: (id: string) => string) => (rows.length === 0
    ? <p className="py-5 text-sm leading-5 text-ink-muted">{counted}</p>
    : (
      <ol className="mt-1 divide-y divide-line text-sm leading-5 text-ink">
        {rows.map(([id, n]) => (
          <li key={id} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{label(id)}</span><span className="shrink-0 sag-num text-ink-muted">{num(n)}</span></li>
        ))}
      </ol>
    ));

  return (
    <>
      <Panel id="admin-top-products" title="Top products" note={`In ${periodWords}`} action={action} className="lg:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className={head}>Most viewed</p>
            {productList(viewed, (n) => `${num(n)} ${n === 1 ? 'view' : 'views'}`, counted)}
          </div>
          <div className="min-w-0">
            <p className={head}>Most sold</p>
            {productList(sold, (n) => `${num(n)} sold`, ordersLoaded ? `Nothing sold in ${periodWords}.` : 'Loading orders…')}
          </div>
        </div>
      </Panel>
      <Panel id="admin-searches" title="Searches and wishlist" note={`In ${periodWords}`}>
        <p className={head}>What people searched for</p>
        {plainList(terms, (term) => term)}
        <p className={`mt-4 ${head}`}>Most saved to wishlist</p>
        {plainList(saved, (id) => byId.get(id)?.name || 'Removed product')}
      </Panel>
    </>
  );
};
