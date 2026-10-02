import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Gift, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { COLOUR_FAMILIES, OCCASIONS, smartSearch } from '../utils/smartQuery';
import { ProductCard } from './ProductCard';

const RELATIONS = ['Mother', 'Sister', 'Wife', 'Daughter', 'Friend', 'Someone special'];
const BUDGETS = [699, 999, 1499, 1999, 2999];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

/** "Shop as a gift": real products for an occasion, budget, colour and size. */
export const GiftFinder: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { products = [] } = useShop();
  const [relation, setRelation] = useState(RELATIONS[0]);
  const [occasion, setOccasion] = useState('');
  const [budget, setBudget] = useState<number | ''>('');
  const [colour, setColour] = useState('');
  const [size, setSize] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const result = useMemo(() => {
    const q = [colour, occasion, budget ? `under ${budget}` : '', size ? (['S', 'M', 'L'].includes(size) ? `size ${size}` : size) : '', 'in stock'].filter(Boolean).join(' ');
    return smartSearch(products, q, 12);
  }, [products, occasion, budget, colour, size]);

  const select = 'sag-input h-12 pr-9 appearance-none truncate cursor-pointer';
  const field = (id: string, label: string, control: React.ReactNode, wide = false) => (
    <div className={wide ? 'col-span-2 md:col-span-1' : ''}>
      <label htmlFor={id} className="sag-label">{label}</label>
      <div className="relative">
        {control}
        <ChevronDown className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[70] bg-ink/50 flex items-end md:items-center justify-center sag-fade" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Shop as a gift" onClick={(e) => e.stopPropagation()}
        className="bg-white text-ink w-full md:max-w-4xl max-h-[85dvh] rounded-t-sheet md:rounded-card flex flex-col shadow-[var(--sag-shadow-bar)] animate-in slide-in-from-bottom-5 fade-in">
        <div className="md:hidden shrink-0 pt-2 flex justify-center" aria-hidden="true"><span className="w-9 h-1 rounded-full bg-sunken-deep" /></div>
        <div className="flex items-center justify-between pl-4 pr-2 min-h-[52px] border-b border-line shrink-0">
          <p className="text-base leading-[22px] font-semibold text-ink flex items-center gap-2"><Gift className="w-5 h-5" strokeWidth={1.75} /> Shop as a gift</p>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer"><X className="w-[22px] h-[22px]" strokeWidth={1.75} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {field('gift-for', 'For', <select id="gift-for" value={relation} onChange={(e) => setRelation(e.target.value)} className={select}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>)}
            {field('gift-occasion', 'Occasion', <select id="gift-occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} className={select}><option value="">Any</option>{Object.keys(OCCASIONS).map((o) => <option key={o}>{o}</option>)}</select>)}
            {field('gift-budget', 'Budget', <select id="gift-budget" value={budget} onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : '')} className={select}><option value="">Any</option>{BUDGETS.map((b) => <option key={b} value={b}>Under ₹{b.toLocaleString('en-IN')}</option>)}</select>)}
            {field('gift-colour', 'Colour', <select id="gift-colour" value={colour} onChange={(e) => setColour(e.target.value)} className={select}><option value="">Any</option>{Object.keys(COLOUR_FAMILIES).map((c) => <option key={c}>{c}</option>)}</select>)}
            {field('gift-size', 'Size (if known)', <select id="gift-size" value={size} onChange={(e) => setSize(e.target.value)} className={select}><option value="">Not sure</option>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>, true)}
          </div>
          <p className="mt-5 text-[15px] leading-[22px] font-semibold text-ink" aria-live="polite">
            {result.products.length === 0
              ? 'No styles in stock match all of these. Try a higher budget or “Any” colour.'
              : result.exact
                ? `${result.products.length} ${result.products.length === 1 ? 'gift idea' : 'gift ideas'} for your ${relation.toLowerCase()} — all in stock.`
                : `No exact match — closest in-stock styles within your budget and size:`}
          </p>
          {size === '' && result.products.length > 0 && <p className="text-[13px] leading-[18px] text-ink-muted mt-1">Not sure of the size? Every product page has a size chart and “Find my size”.</p>}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5">
            {result.products.map((p) => <div key={p.id} onClickCapture={onClose}><ProductCard product={p} compact /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
};
