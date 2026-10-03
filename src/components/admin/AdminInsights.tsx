import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useProducts } from '../../context/ProductContext';
import { Eye, Heart, Search } from 'lucide-react';
import { ui } from './kidsToysShared';

const lastDays = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

/** Shopper insights from real, server-counted data (last 7 days). */
export const AdminInsights: React.FC = () => {
  const { allProducts = [] } = useProducts();
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

  const box = 'min-w-0 bg-white rounded-2xl border border-line p-4';
  const head = `${ui.eyebrow} flex items-center gap-2 mb-2`;
  const list = 'divide-y divide-line text-sm leading-5 text-ink';
  const row = 'flex justify-between gap-3 py-1.5';
  const count = 'text-ink-muted tabular-nums font-semibold';
  const skeleton = (
    <div className="space-y-2.5 py-1.5" aria-hidden="true">
      {[80, 62, 72].map((w) => <div key={w} className="h-3 rounded bg-sunken-deep" style={{ width: `${w}%` }} />)}
    </div>
  );
  const empty = loaded ? <p className="text-sm leading-5 text-ink-muted">No data yet. Counts start from today.</p> : skeleton;
  return (
    <section aria-label="Shopper insights" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className={ui.h2}>Shopper insights</h3>
        <span className="text-[13px] leading-[18px] text-ink-muted">Last 7 days · one count per visitor per day</span>
      </div>
      {/* Low stock is shown once, in the dashboard's own Low stock section (with Restock links) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className={box}>
          <p className={head}><Search className="w-4 h-4" aria-hidden="true" /> Top searches</p>
          {terms.length ? <ol className={list}>{terms.map((t) => <li key={t.term} className={row}><span className="min-w-0 truncate">{t.term}</span><span className={count}>{t.count}</span></li>)}</ol> : empty}
        </div>
        <div className={box}>
          <p className={head}><Eye className="w-4 h-4" aria-hidden="true" /> Most viewed</p>
          {topViewed.length ? <ol className={list}>{topViewed.map(([id, s]) => <li key={id} className={row}><span className="min-w-0 truncate">{name(id)}</span><span className={count}>{s.views}</span></li>)}</ol> : empty}
        </div>
        <div className={box}>
          <p className={head}><Heart className="w-4 h-4" aria-hidden="true" /> Most wishlisted</p>
          {topSaved.length ? <ol className={list}>{topSaved.map(([id, s]) => <li key={id} className={row}><span className="min-w-0 truncate">{name(id)}</span><span className={count}>{s.wishlists}</span></li>)}</ol> : empty}
        </div>
      </div>
    </section>
  );
};
