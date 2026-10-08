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
    ['Price', (p) => <span className="sag-num font-semibold text-ink">{inr(p.price)}</span>],
    ['Discount', (p) => (discountOf(p) ? <span className="sag-num"><span className="font-medium text-sale">{discountOf(p)}% off</span> <span className="text-ink-muted line-through">{inr(Math.max(p.price, Number(p.originalPrice) || p.price))}</span></span> : '—')],
    ['Colour', (p) => (p.colors || []).map((c) => c.name).filter((n) => !['Default', 'Standard'].includes(n)).join(', ') || productColourFamilies(p).join(', ') || '—'],
    ['Fabric', (p) => p.fabric || '—'],
    ['Fit', (p) => p.fit || '—'],
    ['Occasion', (p) => p.occasion || productOccasions(p).join(', ') || '—'],
    ['Sizes', (p) => (p.sizes || []).join(', ') || '—'],
    ['Rating', (p) => { const r = ratingOf(p); return r ? `${r.avg.toFixed(1)}★ (${r.count})` : 'No reviews yet'; }],
    ['Availability', (p) => (isAvailable(p) ? <span className="text-ink">In stock</span> : <span className="text-ink-muted">Sold out</span>)],
  ];
  const columns = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` };
  const viewButton = 'sag-btn-outline h-[38px] w-full px-2';
  const removeLink = 'min-h-11 inline-flex items-center text-[12.5px] text-ink-muted underline decoration-1 underline-offset-4 hover:text-ink cursor-pointer';
  // Cells that stay in place while the table scrolls: a solid dark sheet, so nothing shows through them
  const stuck = 'bg-[color:var(--sag-glass-sheet)] backdrop-blur-xl';
  const photo = 'w-full aspect-[4/5] rounded-[18px]! object-cover object-top bg-sunken';

  return (
    <>
      {!open && items.length > 0 && (
        <div className="sag-glass-bar fixed left-1/2 -translate-x-1/2 bottom-[calc(92px+env(safe-area-inset-bottom))] md:bottom-6 z-40 flex items-center gap-1.5 max-w-[calc(100vw-2rem)] text-ink p-1.5 sag-pop">
          <div className="flex -space-x-2 pl-1">
            {items.map((p) => <img key={p.id} src={getCleanImageUrl(p.images?.[0] || '', 80)} alt="" className="w-8 h-10 rounded-[10px]! border border-line object-cover object-top bg-sunken" />)}
          </div>
          <button onClick={() => (items.length >= 2 ? setOpen(true) : showToast('Add one more style to compare.', 'info'))}
            className="sag-btn-primary sag-num h-10 px-4 gap-2 whitespace-nowrap">
            <GitCompare className="w-3.5 h-3.5" strokeWidth={1.5} /> Compare ({items.length})
          </button>
          <button onClick={clearCompare} aria-label="Clear comparison" className="w-10 h-10 rounded-full border border-line bg-white/10 text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"><X className="w-[18px] h-[18px]" strokeWidth={1.5} /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] bg-[color:var(--sag-scrim)] flex items-end md:items-center justify-center sag-fade" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Compare styles" onClick={(e) => e.stopPropagation()}
            className="bg-surface text-ink w-full md:max-w-4xl max-h-[85dvh] overflow-hidden rounded-t-[26px] md:rounded-[26px] border-t border-line md:border flex flex-col animate-in slide-in-from-bottom-5 fade-in">
            <div className="md:hidden shrink-0 pt-2 flex justify-center" aria-hidden="true"><span className="w-9 h-1 rounded-full bg-white/25" /></div>
            <div className="flex items-center justify-between pl-4 pr-2 min-h-[52px] border-b border-line shrink-0">
              <p className="font-display text-[19px] font-medium leading-6 text-ink">Compare styles</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-10 h-10 mr-1 rounded-full border border-line bg-white/10 text-ink hover:bg-white/15 flex items-center justify-center cursor-pointer"><X className="w-[22px] h-[22px]" strokeWidth={1.5} /></button>
            </div>
            <div className="overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {/* Phones: products sit side by side in narrow columns and each detail is a labelled row */}
              <div className="md:hidden px-4 pt-4 pb-4">
                <div className="grid gap-2.5" style={columns}>
                  {items.map((p) => (
                    <div key={p.id} className="min-w-0">
                      <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className="block w-full text-left cursor-pointer">
                        <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className={photo} />
                      </button>
                      <button onClick={() => toggleCompare(String(p.id))} aria-label={`Remove ${p.name} from comparison`} className={removeLink}>Remove</button>
                    </div>
                  ))}
                </div>
                <div className={`sticky top-0 z-10 -mx-4 px-4 py-2 border-b border-line grid gap-2.5 ${stuck}`} style={columns}>
                  {items.map((p) => <p key={p.id} className="min-w-0 text-[13px] leading-[1.35] text-ink line-clamp-2">{p.name}</p>)}
                </div>
                {rows.map(([label, cell]) => (
                  <div key={label} className="py-3 border-b border-line">
                    <p className="text-[10.5px] leading-[14px] font-semibold uppercase tracking-[0.16em] text-ink-muted mb-1.5">{label}</p>
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
                    <th className={`sticky left-0 w-28 ${stuck}`} />
                    {items.map((p) => (
                      <th key={p.id} className="p-3 align-top text-left font-normal">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="block text-left cursor-pointer">
                          <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className={photo} />
                          <span className="mt-[9px] block text-[13px] leading-[1.35] text-ink line-clamp-2">{p.name}</span>
                        </button>
                        <button onClick={() => toggleCompare(String(p.id))} aria-label={`Remove ${p.name} from comparison`} className={removeLink}>Remove</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, cell]) => (
                    <tr key={label} className="border-t border-line">
                      <th scope="row" className={`sticky left-0 p-3 text-left text-[10.5px] leading-5 font-semibold uppercase tracking-[0.16em] text-ink-muted align-top ${stuck}`}>{label}</th>
                      {items.map((p) => <td key={p.id} className="p-3 align-top text-ink">{cell(p)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className={`sticky left-0 ${stuck}`} />
                    {items.map((p) => (
                      <td key={p.id} className="p-3">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} aria-label={`View ${p.name}`} className={viewButton}>View</button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {facts.length > 0 && (
                <div className="mx-4 mb-4 md:mt-2 border-t border-line pt-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sale mb-2">The facts, side by side</p>
                  <ul className="text-sm leading-5 text-ink-muted space-y-1 list-disc pl-5">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              {history.length > 0 && (
                <div className="mx-4 mb-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-muted mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" strokeWidth={1.5} /> Recently compared</p>
                  <div className="flex flex-wrap gap-2">
                    {history.map((set) => (
                      <button key={set.map((p) => p.id).join('|')} onClick={() => setCompare(set.map((p) => String(p.id)))}
                        className="sag-chip h-[38px] min-w-0 max-w-full px-3.5 text-[13px] font-normal">
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
