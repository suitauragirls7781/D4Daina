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
    ['Price', (p) => <span className="font-semibold text-[#4B1D3F]">{inr(p.price)}</span>],
    ['Discount', (p) => (discountOf(p) ? `${discountOf(p)}% off ${inr(Math.max(p.price, Number(p.originalPrice) || p.price))}` : '—')],
    ['Colour', (p) => (p.colors || []).map((c) => c.name).filter((n) => !['Default', 'Standard'].includes(n)).join(', ') || productColourFamilies(p).join(', ') || '—'],
    ['Fabric', (p) => p.fabric || '—'],
    ['Fit', (p) => p.fit || '—'],
    ['Occasion', (p) => p.occasion || productOccasions(p).join(', ') || '—'],
    ['Sizes', (p) => (p.sizes || []).join(', ') || '—'],
    ['Rating', (p) => { const r = ratingOf(p); return r ? `${r.avg.toFixed(1)}★ (${r.count})` : 'No reviews yet'; }],
    ['Availability', (p) => (isAvailable(p) ? <span className="text-emerald-800">In stock</span> : <span className="text-rose-700">Sold out</span>)],
  ];

  return (
    <>
      {!open && items.length > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-40 flex items-center gap-2 rounded-full bg-white border border-[#4B1D3F]/15 shadow-[0_12px_28px_-12px_rgba(42,26,38,0.45)] pl-2 pr-2 py-1.5 sag-pop">
          <div className="flex -space-x-2">
            {items.map((p) => <img key={p.id} src={getCleanImageUrl(p.images?.[0] || '', 80)} alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover object-top" />)}
          </div>
          <button onClick={() => (items.length >= 2 ? setOpen(true) : showToast('Add one more style to compare.', 'info'))}
            className="h-9 px-4 rounded-full bg-[#4B1D3F] text-white text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center gap-1.5 cursor-pointer">
            <GitCompare className="w-4 h-4" /> Compare ({items.length})
          </button>
          <button onClick={clearCompare} aria-label="Clear comparison" className="w-8 h-8 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] bg-[#2A1A26]/50 flex items-end md:items-center justify-center sag-fade" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Compare styles" onClick={(e) => e.stopPropagation()}
            className="bg-white w-full md:max-w-4xl max-h-[88vh] rounded-t-3xl md:rounded-3xl flex flex-col animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#4B1D3F]/10">
              <p className="font-serif text-2xl text-[#4B1D3F]">Compare styles</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-auto">
              {facts.length > 0 && (
                <div className="m-4 rounded-2xl bg-[#F3EEF8] p-4">
                  <p className="text-sm font-semibold text-[#4B1D3F] mb-1.5">Help me choose</p>
                  <ul className="text-sm text-[#2A1A26]/80 space-y-1 list-disc pl-5">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              {/* Phones: products sit side by side in narrow columns and each detail is a labelled row */}
              <div className="md:hidden px-3 pb-4">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
                  {items.map((p) => (
                    <div key={p.id} className="min-w-0">
                      <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="block w-full text-left cursor-pointer">
                        <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className="w-full aspect-[4/5] rounded-xl object-cover object-top bg-[#F3EEF8]" />
                      </button>
                      <button onClick={() => toggleCompare(String(p.id))} className="mt-1 h-8 text-xs text-[#2A1A26]/65 underline cursor-pointer">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-white border-b border-[#4B1D3F]/10 grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
                  {items.map((p) => <p key={p.id} className="min-w-0 font-serif text-[15px] leading-snug text-[#2A1A26] line-clamp-2">{p.name}</p>)}
                </div>
                {rows.map(([label, cell]) => (
                  <div key={label} className="py-2.5 border-b border-[#4B1D3F]/10">
                    <p className="text-[11px] uppercase tracking-wider text-[#2A1A26]/60 font-medium mb-1">{label}</p>
                    <div className="grid gap-2 text-[13px] leading-snug text-[#2A1A26]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
                      {items.map((p) => <div key={p.id} className="min-w-0 break-words">{cell(p)}</div>)}
                    </div>
                  </div>
                ))}
                <div className="grid gap-2 pt-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
                  {items.map((p) => (
                    <button key={p.id} onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="sag-btn-primary h-10 w-full text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">View</button>
                  ))}
                </div>
              </div>
              <table className="hidden md:table w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white w-24" />
                    {items.map((p) => (
                      <th key={p.id} className="p-3 align-top text-left font-normal">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="block text-left cursor-pointer">
                          <img src={getCleanImageUrl(p.images?.[0] || '', 240)} alt="" className="w-full aspect-[4/5] rounded-xl object-cover object-top bg-[#F3EEF8]" />
                          <span className="mt-2 block font-serif text-base text-[#2A1A26] leading-snug line-clamp-2">{p.name}</span>
                        </button>
                        <button onClick={() => toggleCompare(String(p.id))} className="mt-1 text-xs text-[#2A1A26]/60 underline cursor-pointer">Remove</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, cell]) => (
                    <tr key={label} className="border-t border-[#4B1D3F]/10">
                      <th scope="row" className="sticky left-0 bg-white p-3 text-left text-xs uppercase tracking-wider text-[#2A1A26]/60 font-medium align-top">{label}</th>
                      {items.map((p) => <td key={p.id} className="p-3 align-top text-[#2A1A26]">{cell(p)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-[#4B1D3F]/10">
                    <td className="sticky left-0 bg-white" />
                    {items.map((p) => (
                      <td key={p.id} className="p-3">
                        <button onClick={() => { setOpen(false); navigateToProduct(p.id); }} className="sag-btn-primary h-10 w-full text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">View</button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {history.length > 0 && (
                <div className="m-4">
                  <p className="text-sm font-medium text-[#2A1A26] mb-2 flex items-center gap-1.5"><History className="w-4 h-4" /> Recently compared</p>
                  <div className="flex flex-wrap gap-2">
                    {history.map((set) => (
                      <button key={set.map((p) => p.id).join('|')} onClick={() => setCompare(set.map((p) => String(p.id)))}
                        className="h-9 px-3 rounded-full border border-[#4B1D3F]/15 text-xs text-[#2A1A26] hover:bg-[#F3EEF8] cursor-pointer line-clamp-1 max-w-full">
                        {set.map((p) => p.name.split(' ').slice(0, 2).join(' ')).join(' vs ')}
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
