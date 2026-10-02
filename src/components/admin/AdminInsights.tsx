import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useProducts } from '../../context/ProductContext';
import { useAdmin } from '../../context/AdminContext';
import { isLowStock } from '../../utils/inventory';
import { Eye, Heart, Search, AlertTriangle } from 'lucide-react';

const lastDays = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

/** Shopper insights from real, server-counted data (last 7 days). */
export const AdminInsights: React.FC = () => {
  const { allProducts = [] } = useProducts();
  const { lowStockThreshold } = useAdmin();
  const [terms, setTerms] = useState<Array<{ term: string; count: number }>>([]);
  const [stats, setStats] = useState<Record<string, { views: number; wishlists: number }>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const days = lastDays(7);
    Promise.all([
      getDocs(query(collection(db, 'search_terms'), where('day', 'in', days))),
      getDocs(query(collection(db, 'product_daily'), where('day', 'in', days))),
    ]).then(([t, p]) => {
      const byTerm = new Map<string, number>();
      t.docs.forEach((d) => byTerm.set(d.data().term, (byTerm.get(d.data().term) || 0) + (Number(d.data().count) || 0)));
      setTerms([...byTerm.entries()].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 8));
      const byProduct: Record<string, { views: number; wishlists: number }> = {};
      p.docs.forEach((d) => {
        const x = d.data();
        const cur = byProduct[x.productId] || { views: 0, wishlists: 0 };
        cur.views += Number(x.views) || 0;
        cur.wishlists += Number(x.wishlists) || 0;
        byProduct[x.productId] = cur;
      });
      setStats(byProduct);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const name = (id: string) => allProducts.find((p) => String(p.id) === id)?.name || 'Removed product';
  const topViewed = useMemo(() => Object.entries(stats).filter(([, s]) => s.views).sort((a, b) => b[1].views - a[1].views).slice(0, 5), [stats]);
  const topSaved = useMemo(() => Object.entries(stats).filter(([, s]) => s.wishlists).sort((a, b) => b[1].wishlists - a[1].wishlists).slice(0, 5), [stats]);
  const lowStock = allProducts.filter((p) => !p.hidden && isLowStock(p, lowStockThreshold)).sort((a, b) => Number(a.stockQuantity ?? 0) - Number(b.stockQuantity ?? 0)).slice(0, 6);

  const box = 'min-w-0 bg-white rounded-2xl border border-[#4B1D3F]/10 p-4 sm:p-5';
  const head = 'text-[13px] font-semibold text-[#2A1A26] flex items-center gap-2 mb-3';
  const iconWrap = 'w-7 h-7 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center';
  const list = 'space-y-1.5 text-[13px] text-[#2A1A26]/85';
  const row = 'flex justify-between gap-2';
  const count = 'text-[#2A1A26]/55 tabular-nums font-medium';
  const skeleton = (
    <div className="space-y-2" aria-hidden="true">
      {[80, 62, 72].map((w) => <div key={w} className="h-3 rounded-full bg-[#F3EEF8] animate-pulse" style={{ width: `${w}%` }} />)}
    </div>
  );
  const empty = loaded ? <p className="text-[13px] text-[#2A1A26]/55">No data yet — counts start from today.</p> : skeleton;
  return (
    <section aria-label="Shopper insights" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-2xl font-semibold text-[#4B1D3F]">Shopper insights</h3>
        <span className="text-[12px] text-[#2A1A26]/55">last 7 days · one count per visitor per day</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={box}>
          <p className={head}><span className={iconWrap}><Search className="w-3.5 h-3.5" /></span> Top searches</p>
          {terms.length ? <ol className={list}>{terms.map((t) => <li key={t.term} className={row}><span className="min-w-0 truncate">{t.term}</span><span className={count}>{t.count}</span></li>)}</ol> : empty}
        </div>
        <div className={box}>
          <p className={head}><span className={iconWrap}><Eye className="w-3.5 h-3.5" /></span> Most viewed</p>
          {topViewed.length ? <ol className={list}>{topViewed.map(([id, s]) => <li key={id} className={row}><span className="min-w-0 truncate">{name(id)}</span><span className={count}>{s.views}</span></li>)}</ol> : empty}
        </div>
        <div className={box}>
          <p className={head}><span className={iconWrap}><Heart className="w-3.5 h-3.5" /></span> Most wishlisted</p>
          {topSaved.length ? <ol className={list}>{topSaved.map(([id, s]) => <li key={id} className={row}><span className="min-w-0 truncate">{name(id)}</span><span className={count}>{s.wishlists}</span></li>)}</ol> : empty}
        </div>
        <div className={box}>
          <p className={head}><span className="w-7 h-7 rounded-full bg-[#F7E4EA] text-[#8A2E55] flex items-center justify-center"><AlertTriangle className="w-3.5 h-3.5" /></span> Low stock (≤ 5)</p>
          {lowStock.length ? <ol className={list}>{lowStock.map((p) => <li key={p.id} className={row}><span className="min-w-0 truncate">{p.name}</span><span className={`tabular-nums font-semibold ${Number(p.stockQuantity ?? 0) === 0 ? 'text-rose-700' : 'text-[#8A2E55]'}`}>{Number(p.stockQuantity ?? 0)}</span></li>)}</ol> : <p className="text-[13px] text-[#2A1A26]/55">All products are above their low-stock level ({lowStockThreshold} pieces by default).</p>}
        </div>
      </div>
    </section>
  );
};
