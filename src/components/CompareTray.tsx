import React, { useEffect, useMemo, useState } from 'react';
import { GitCompare, History, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { Product } from '../types';
import { clearCompare, rememberComparison, setCompare, toggleCompare, useShopperMemory } from '../utils/shopperMemory';
import { getCleanImageUrl } from '../utils/imageHelper';
import { isAvailable, productColourFamilies, productOccasions } from '../utils/smartQuery';
import { useDiscovery } from '../utils/discovery';

const HIDDEN_ON = new Set(['checkout', 'login', 'order-confirmation', 'admin']);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const discountOf = (p: Product) => {
  const mrp = Math.max(p.price, Number(p.originalPrice) || p.price);
  return mrp > p.price ? Math.round(((mrp - p.price) / mrp) * 100) : 0;
};

/** Compare 2–4 real products side by side, plus a factual "Help me choose" summary. */
export const CompareTray: React.FC = () => {
  const { allProducts = [], activePage, navigateToProduct, showToast } = useShop();
  const { reviewsList: reviews = [] } = useAdmin();
  const { compare, compared } = useShopperMemory();
  const { features } = useDiscovery();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => compare.map((id) => allProducts.find((p) => String(p.id) === id)).filter(Boolean) as Product[], [compare, allProducts]);
  const history = compared.filter((set) => set.join('|') !== [...compare].sort().join('|'))
    .map((set) => set.map((id) => allProducts.find((p) => String(p.id) === id)).filter(Boolean) as Product[])
    .filter((set) => set.length >= 2);

  useEffect(() => { if (open && items.length >= 2) rememberComparison(items.map((p) => String(p.id))); }, [open, items.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ratingOf = (p: Product) => {
    const own = reviews.filter((r) => String(r.productId) === String(p.id) && r.status === 'approved');
    return own.length ? { avg: own.reduce((s: number, r) => s + (Number(r.rating) || 0), 0) / own.length, count: own.length } : null;
  };

  if (!features.compare || (items.length === 0 && !open) || HIDDEN_ON.has(activePage)) return null;

  // Facts only: which product is lowest priced, biggest discount, most sizes, in stock
  const facts: string[] = [];
  if (items.length >= 2) {
    const cheapest = [...items].sort((a, b) => a.price - b.price)[0];
    facts.push(`Lowest price: ${cheapest.name} at ${inr(cheapest.price)}.`);
    const best = [...items].sort((a, b) => discountOf(b) - discountOf(a))[0];
    if (discountOf(best) > 0) facts.push(`Biggest discount: ${best.name} (${discountOf(best)}% off).`);
    const sizes = [...items].sort((a, b) => (b.sizes || []).length - (a.sizes || []).length)[0];
    facts.push(`Most sizes: ${sizes.name} (${(sizes.sizes || []).join(', ')}).`);
    const sold = items.filter((p) => !isAvailable(p));
    if (sold.length) facts.push(`Sold out right now: ${sold.map((p) => p.name).join(', ')}.`);
    const rated = items.map((p) => ({ p, r: ratingOf(p) })).filter((x) => x.r).sort((a, b) => b.r!.avg - a.r!.avg)[0];
    if (rated) facts.push(`Highest rated: ${rated.p.name} (${rated.r!.avg.toFixed(1)}★ from ${rated.r!.count} ${rated.r!.count === 1 ? 'review' : 'reviews'}).`);
  }

  const rows: Array<[string, (p: Product) => React.ReactNode]> = [
    ['Price', (p) => <span className="sag-num font-bold text-ink">{inr(p.price)}</span>],
    ['Discount', (p) => (discountOf(p) ? <span className="sag-num"><span className="font-bold text-sale">{discountOf(p)}% off</span> <span className="text-ink-faint line-through">{inr(Math.max(p.price, Number(p.originalPrice) || p.price))}</span></span> : '—')],
    ['Colour', (p) => (p.colors || []).map((c) => c.name).filter((n) => !['Default', 'Standard'].includes(n)).join(', ') || productColourFamilies(p).join(', ') || '—'],
    ['Fabric', (p) => p.fabric || '—'],
    ['Fit', (p) => p.fit || '—'],
    ['Occasion', (p) => p.occasion || productOccasions(p).join(', ') || '—'],
    ['Sizes', (p) => (p.sizes || []).join(', ') || '—'],
    ['Rating', (p) => { const r = ratingOf(p); return r ? `${r.avg.toFixed(1)}★ (${r.count})` : 'No reviews yet'; }],
    ['Availability', (p) => (isAvailable(p) ? <span className="font-semibold text-ok">In stock</span> : <span className="font-semibold text-ink-muted">Sold out</span>)],
  ];
  const columns = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` };
  const viewButton = 'sag-btn-outline h-11 w-full px-2 text-sm';
  const removeLink = 'min-h-11 inline-flex items-center text-[13px] text-ink-muted underline underline-offset-[3px] hover:text-ink cursor-pointer';

  return (
    <>
      {!open && items.length > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[88px] md:bottom-6 z-40 flex items-center gap-1.5 max-w-[calc(100vw-2rem)] rounded-control bg-white text-ink border border-line shadow-[var(--sag-shadow-pop)] p-1.5 sag-pop">
          <div className="flex -space-x-2 pl-1">
            {items.map((p) => <img key={p.id} src={getCleanImageUrl(p.images?.[0] || '', 80)} alt="" className="w-8 h-10 rounded-badge border-2 border-white object-cover object-top bg-sunken" />)}
          </div>
          <button onClick={() => (items.length >= 2 ? setOpen(true) : showToast('Add one more style to compare.', 'info'))}
            className="sag-num h-11 px-4 rounded-chip bg-ink text-white text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer">
            <GitCompare className="w-4 h-4" /> Compare ({items.length})
          </button>
          <button onClick={clearCompare} aria-label="Clear comparison" className="w-11 h-11 rounded-full text-ink-muted hover:bg-sunken flex items-center justify-center cursor-pointer"><X className="w-[18px] h-[18px]" /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] bg-ink/50 flex items-end md:items-center justify-center sag-fade" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Compare styles" onClick={(e) => e.stopPropagation()}
            className="bg-white text-ink w-full md:max-w-4xl max-h-[85dvh] rounded-t-sheet md:rounded-card flex flex-col shadow-[var(--sag-shadow-bar)] animate-in slide-in-from-bottom-5 fade-in">
            <div className="md:hidden shrink-0 pt-2 flex justify-center" aria-hidden="true"><span className="w-9 h-1 rounded-full bg-sunken-deep" /></div>
            <div className="flex items-center justify-between pl-4 pr-2 min-h-[52px] border-b border-line shrink-0">
              <p className="text-base leading-[22px] font-semibold text-ink">Compare styles</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-11 h-11 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer"><X className="w-[22px] h-[22px]" strokeWidth={1.75} /></button>
            </div>
            <div className="overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {/* Phones: products sit side by side in narrow columns and each detail is a labelled row */}
              <div className="md:hidden px-4 pt-4 pb-4">
                <div className="grid gap-2.5" style={columns}>
                  {items.map((p) => (
                    <div key={p.id} className="min-w-0">
                      <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className="block w-full text-left cursor-pointer">
                        <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className="w-full aspect-[4/5] rounded-chip object-cover object-top bg-sunken" />
                      </button>
                      <button onClick={() => toggleCompare(String(p.id))} aria-label={`Remove ${p.name} from comparison`} className={removeLink}>Remove</button>
                    </div>
                  ))}
                </div>
                <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white border-b border-line grid gap-2.5" style={columns}>
                  {items.map((p) => <p key={p.id} className="min-w-0 text-sm leading-5 font-medium text-ink line-clamp-2">{p.name}</p>)}
                </div>
                {rows.map(([label, cell]) => (
                  <div key={label} className="py-3 border-b border-line">
                    <p className="text-xs leading-4 font-semibold text-ink-muted mb-1">{label}</p>
                    <div className="grid gap-2.5 text-sm leading-5 text-ink" style={columns}>
                      {items.map((p) => <div key={p.id} className="min-w-0 break-words">{cell(p)}</div>)}
                    </div>
                  </div>
                ))}
                <div className="grid gap-2.5 pt-4" style={columns}>
                  {items.map((p) => (
                    <button key={p.id} onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className={viewButton}>View</button>
                  ))}
                </div>
              </div>
              <table className="hidden md:table w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white w-28" />
                    {items.map((p) => (
                      <th key={p.id} className="p-3 align-top text-left font-normal">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="block text-left cursor-pointer">
                          <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className="w-full aspect-[4/5] rounded-control object-cover object-top bg-sunken" />
                          <span className="mt-2 block text-sm leading-5 font-medium text-ink line-clamp-2">{p.name}</span>
                        </button>
                        <button onClick={() => toggleCompare(String(p.id))} aria-label={`Remove ${p.name} from comparison`} className={removeLink}>Remove</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, cell]) => (
                    <tr key={label} className="border-t border-line">
                      <th scope="row" className="sticky left-0 bg-white p-3 text-left text-[13px] font-semibold text-ink-muted align-top">{label}</th>
                      {items.map((p) => <td key={p.id} className="p-3 align-top text-ink">{cell(p)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className="sticky left-0 bg-white" />
                    {items.map((p) => (
                      <td key={p.id} className="p-3">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className={viewButton}>View</button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {facts.length > 0 && (
                <div className="mx-4 mb-4 md:mt-2 rounded-card bg-page border border-line p-4">
                  <p className="text-sm font-semibold text-ink mb-1.5">The facts, side by side</p>
                  <ul className="text-sm leading-5 text-ink-muted space-y-1 list-disc pl-5">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              {history.length > 0 && (
                <div className="mx-4 mb-4">
                  <p className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><History className="w-4 h-4" /> Recently compared</p>
                  <div className="flex flex-wrap gap-2">
                    {history.map((set) => (
                      <button key={set.map((p) => p.id).join('|')} onClick={() => setCompare(set.map((p) => String(p.id)))}
                        className="sag-chip h-11 min-w-0 max-w-full px-3.5 text-sm">
                        <span className="truncate">{set.map((p) => p.name.split(' ').slice(0, 2).join(' ')).join(' vs ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
