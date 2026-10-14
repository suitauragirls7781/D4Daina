import React, { useMemo } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useRouter } from '../../context/RouterContext';
import { istToday, num } from './adminStats';
import { salesByProduct, useProductDaily } from './adminProductStats';
import { Panel, Thumb } from './adminUi';

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
  const counts = useProductDaily(days, istToday());
  const { loading, failed } = counts;
  const key = days.join(',');

  const { viewed, saved, terms } = useMemo(() => {
    const top = (m: Map<string, number>, n: number) => [...m.entries()].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, n);
    return { viewed: top(counts.views, 5), saved: top(counts.wishlists, 5), terms: top(counts.terms, 8) };
  }, [counts]);

  // Units sold in the period: paid orders, not cancelled or refunded, by the India-time day they were paid
  const soldMap = useMemo(() => salesByProduct(orders, days), [orders, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const sold = useMemo(() => [...soldMap.entries()].map(([id, s]) => [id, s.units] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5), [soldMap]);

  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  // Products many people opened but nobody bought in the period: worth a look at the photos, price or sizes
  const notSelling = useMemo(() => [...counts.views.entries()]
    .filter(([id, v]) => v >= 5 && !soldMap.has(id) && byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5), [counts.views, soldMap, byId]);
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
        {!loading && ordersLoaded && notSelling.length > 0 && (
          <div id="admin-not-selling" className="mt-5 pt-4 border-t border-line rounded-none">
            <p className={head}>Looked at a lot, not bought yet</p>
            <p className="mt-0.5 text-xs leading-4 text-ink-muted">Opened by 5 or more people in {periodWords} without a sale. Worth checking the photos, the price and the sizes in stock.</p>
            {productList(notSelling, (n) => `${num(n)} views, 0 sold`, '')}
          </div>
        )}
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
