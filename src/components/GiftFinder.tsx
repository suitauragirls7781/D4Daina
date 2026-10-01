import React, { useEffect, useMemo, useState } from 'react';
import { Gift, X } from 'lucide-react';
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

  const select = 'h-11 w-full rounded-full border border-[#4B1D3F]/15 bg-white px-4 text-sm focus:outline-none focus:border-[#4B1D3F]/50';
  return (
    <div className="fixed inset-0 z-[70] bg-[#2A1A26]/50 flex items-end md:items-center justify-center sag-fade" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Shop as a gift" onClick={(e) => e.stopPropagation()}
        className="bg-[#FBF7F3] w-full md:max-w-4xl max-h-[92vh] rounded-t-3xl md:rounded-3xl flex flex-col animate-in slide-in-from-bottom-5 fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#4B1D3F]/10">
          <p className="font-serif text-2xl text-[#4B1D3F] flex items-center gap-2"><Gift className="w-5 h-5" /> Shop as a gift</p>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className="text-xs text-[#2A1A26]/70 space-y-1"><span>For</span>
              <select value={relation} onChange={(e) => setRelation(e.target.value)} className={select}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="text-xs text-[#2A1A26]/70 space-y-1"><span>Occasion</span>
              <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className={select}><option value="">Any</option>{Object.keys(OCCASIONS).map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className="text-xs text-[#2A1A26]/70 space-y-1"><span>Budget</span>
              <select value={budget} onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : '')} className={select}><option value="">Any</option>{BUDGETS.map((b) => <option key={b} value={b}>Under ₹{b.toLocaleString('en-IN')}</option>)}</select></label>
            <label className="text-xs text-[#2A1A26]/70 space-y-1"><span>Colour</span>
              <select value={colour} onChange={(e) => setColour(e.target.value)} className={select}><option value="">Any</option>{Object.keys(COLOUR_FAMILIES).map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs text-[#2A1A26]/70 space-y-1 col-span-2 md:col-span-1"><span>Size (if known)</span>
              <select value={size} onChange={(e) => setSize(e.target.value)} className={select}><option value="">Not sure</option>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <p className="mt-5 text-sm text-[#2A1A26]/75" aria-live="polite">
            {result.products.length === 0
              ? 'No styles in stock match all of these. Try a higher budget or “Any” colour.'
              : result.exact
                ? `${result.products.length} ${result.products.length === 1 ? 'gift idea' : 'gift ideas'} for your ${relation.toLowerCase()} — all in stock.`
                : `No exact match — closest in-stock styles within your budget and size:`}
          </p>
          {size === '' && result.products.length > 0 && <p className="text-xs text-[#2A1A26]/60 mt-1">Not sure of the size? Every product page has a size chart and “Find my size”.</p>}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {result.products.map((p) => <div key={p.id} onClickCapture={onClose}><ProductCard product={p} compact /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
};
