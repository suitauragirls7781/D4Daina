import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Product, ProductCategory } from '../../../types';
import { WOMEN_CATEGORY_NAMES } from '../../../data/womenCategories';
import { SCRIM, ui } from '../adminShared';
import { defaultSeoTitle, offOf, rupees, seoDescriptionFrom } from './catalogueKit';

/**
 * The bulk actions of Products: one change worked out for each chosen product, shown before it is saved, then
 * saved product by product through the normal product save (so the store, the stock history and the alerts
 * see each change exactly as if it had been made by hand).
 */

export type BulkKind = 'price' | 'stock' | 'visibility' | 'category' | 'label' | 'seo';
export type FlagKey = 'isNewArrival' | 'isBestSeller' | 'isFeatured' | 'isSale' | 'isTrending' | 'isFestive';

export const FLAG_LABELS: Record<FlagKey, string> = {
  isNewArrival: 'New arrival',
  isBestSeller: 'Bestseller',
  isFeatured: 'Featured',
  isSale: 'Sale',
  isTrending: 'Trending',
  isFestive: 'Festive edit',
};

export interface PlannedChange {
  product: Product;
  change: Partial<Product>;
  before: Partial<Product>;
  /** One line saying what happens, e.g. "₹1,299 → ₹1,169". */
  summary: string;
}

type PriceMode = 'pct-down' | 'pct-up' | 'amt-down' | 'amt-up' | 'set';

const KIND_LABEL: Record<BulkKind, string> = {
  price: 'Price',
  stock: 'Stock',
  visibility: 'Show / hide',
  category: 'Category',
  label: 'Labels',
  seo: 'Search text',
};

const pick = (p: Product, keys: Array<keyof Product>): Partial<Product> => Object.fromEntries(keys.map((k) => [k, p[k]])) as Partial<Product>;

interface BulkSheetProps {
  products: Product[];
  busy: boolean;
  onClose: () => void;
  onApply: (plan: PlannedChange[], label: string, reason: string) => void;
}

export const BulkSheet: React.FC<BulkSheetProps> = ({ products, busy, onClose, onApply }) => {
  const [kind, setKind] = useState<BulkKind>('price');
  const [priceMode, setPriceMode] = useState<PriceMode>('pct-down');
  const [priceTarget, setPriceTarget] = useState<'price' | 'mrp'>('price');
  const [amount, setAmount] = useState('10');
  const [stockMode, setStockMode] = useState<'set' | 'add'>('add');
  const [stockValue, setStockValue] = useState('5');
  const [visibility, setVisibility] = useState<'publish' | 'hide' | 'archive'>('publish');
  const [category, setCategory] = useState<string>(WOMEN_CATEGORY_NAMES[0]);
  const [flag, setFlag] = useState<FlagKey>('isNewArrival');
  const [flagOn, setFlagOn] = useState(true);

  const { plan, problem, label, reason } = useMemo(() => {
    const out: PlannedChange[] = [];
    let problem = '';
    let label = '';
    let reason = 'Bulk edit in Products';
    if (kind === 'price') {
      const n = Number(amount);
      if (!amount.trim() || !Number.isFinite(n) || n < 0) problem = 'Enter a number of 0 or more.';
      else if (priceMode === 'pct-down' && n >= 100) problem = 'Enter a percent between 0 and 99.';
      else if (priceMode === 'set' && Math.round(n) < 1) problem = 'Enter a price of at least ₹1.';
      products.forEach((p) => {
        if (problem) return;
        const mrp = Math.max(p.price, Number(p.originalPrice) || p.price);
        const base = priceTarget === 'price' ? p.price : mrp;
        let next = base;
        if (priceMode === 'pct-down') next = base * (1 - n / 100);
        if (priceMode === 'pct-up') next = base * (1 + n / 100);
        if (priceMode === 'amt-down') next = base - n;
        if (priceMode === 'amt-up') next = base + n;
        if (priceMode === 'set') next = n;
        next = Math.max(1, Math.round(next));
        const price = priceTarget === 'price' ? next : p.price;
        // The MRP never sits below the price: raising the price above it raises the MRP with it
        const originalPrice = priceTarget === 'price' ? Math.max(next, mrp) : Math.max(next, p.price);
        if (price === p.price && originalPrice === mrp) return;
        const discount = offOf(price, originalPrice);
        out.push({
          product: p,
          change: { price, originalPrice, discount },
          before: pick(p, ['price', 'originalPrice', 'discount']),
          summary: priceTarget === 'price'
            ? `${rupees(p.price)} → ${rupees(price)}${discount ? ` (${discount}% off)` : ''}`
            : `MRP ${rupees(mrp)} → ${rupees(originalPrice)}${discount ? ` (${discount}% off)` : ''}`,
        });
      });
      label = priceTarget === 'price' ? 'Price changed' : 'MRP changed';
    } else if (kind === 'stock') {
      const n = Number(stockValue);
      if (!stockValue.trim() || !Number.isInteger(n) || (stockMode === 'set' && n < 0)) problem = 'Enter a whole number.';
      products.forEach((p) => {
        if (problem) return;
        const now = Math.max(0, Number(p.stockQuantity) || 0);
        const next = Math.max(0, stockMode === 'set' ? n : now + n);
        if (next === now) return;
        out.push({ product: p, change: { stockQuantity: next, inStock: next > 0 }, before: { stockQuantity: now, inStock: now > 0 }, summary: `${now} → ${next} pieces` });
      });
      label = 'Stock changed';
      reason = stockMode === 'set' ? 'Bulk set in Products' : n >= 0 ? 'Bulk add in Products' : 'Bulk remove in Products';
    } else if (kind === 'visibility') {
      products.forEach((p) => {
        const status = visibility === 'publish' ? 'published' : visibility === 'hide' ? 'draft' : 'archived';
        const current = !p.hidden ? 'published' : p.status === 'archived' ? 'archived' : 'draft';
        if (current === status) return;
        out.push({
          product: p,
          change: { hidden: status !== 'published', status },
          before: { hidden: Boolean(p.hidden), status: current },
          summary: status === 'published' ? 'Published on the store' : status === 'draft' ? 'Hidden (draft)' : 'Archived',
        });
      });
      label = visibility === 'publish' ? 'Published' : visibility === 'hide' ? 'Hidden' : 'Archived';
    } else if (kind === 'category') {
      products.forEach((p) => {
        if (p.category === category) return;
        out.push({ product: p, change: { category: category as ProductCategory }, before: { category: p.category }, summary: `${p.category} → ${category}` });
      });
      label = `Moved to ${category}`;
    } else if (kind === 'label') {
      products.forEach((p) => {
        if (Boolean(p[flag]) === flagOn) return;
        out.push({ product: p, change: { [flag]: flagOn } as Partial<Product>, before: { [flag]: Boolean(p[flag]) } as Partial<Product>, summary: `${FLAG_LABELS[flag]} ${flagOn ? 'on' : 'off'}` });
      });
      label = `${FLAG_LABELS[flag]} ${flagOn ? 'on' : 'off'}`;
    } else {
      products.forEach((p) => {
        const change: Partial<Product> = {};
        if (!String(p.seoTitle || '').trim() && p.name.trim()) change.seoTitle = defaultSeoTitle(p.name).slice(0, 120);
        if (!String(p.seoDescription || '').trim() && p.description.trim()) change.seoDescription = seoDescriptionFrom(p.description);
        if (!Object.keys(change).length) return;
        out.push({
          product: p,
          change,
          before: pick(p, Object.keys(change) as Array<keyof Product>),
          summary: [change.seoTitle ? 'Google title from the name' : '', change.seoDescription ? 'description from the product text' : ''].filter(Boolean).join(', '),
        });
      });
      label = 'Search text filled';
    }
    return { plan: out, problem, label, reason };
  }, [kind, priceMode, priceTarget, amount, stockMode, stockValue, visibility, category, flag, flagOn, products]);

  const unchanged = products.length - plan.length;
  const segment = (on: boolean) => `h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${on ? 'bg-ink text-[color:var(--sag-on-gold)]' : 'bg-sunken text-ink hover:bg-sunken-deep'}`;

  return (
    <div className={`fixed inset-0 z-50 ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="bulk-title" id="admin-bulk-sheet"
        className="bg-surface rounded-t-[28px] sm:rounded-[28px] w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain shadow-[var(--sag-shadow-pop)] animate-in fade-in slide-in-from-bottom-5">
        <div className="sticky top-0 z-10 bg-surface px-5 pt-4 pb-3 border-b border-line flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="bulk-title" className={ui.h2}>Change {products.length} product{products.length === 1 ? '' : 's'}</h3>
            <p className="text-[13px] text-ink-muted">You see every change before it is saved.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken-deep cursor-pointer disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div role="tablist" aria-label="What to change" className="flex flex-wrap gap-1.5">
            {(Object.keys(KIND_LABEL) as BulkKind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={ui.chip(kind === k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>

          {kind === 'price' && (
            <div className="space-y-3">
              <div role="group" aria-label="Which price" className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={priceTarget === 'price'} onClick={() => setPriceTarget('price')} className={segment(priceTarget === 'price')}>Selling price</button>
                <button type="button" aria-pressed={priceTarget === 'mrp'} onClick={() => setPriceTarget('mrp')} className={segment(priceTarget === 'mrp')}>MRP</button>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <select id="bulk-price-mode" aria-label="How to change it" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} className={`${ui.select} pl-3.5`}>
                  <option value="pct-down">Lower by %</option>
                  <option value="pct-up">Raise by %</option>
                  <option value="amt-down">Lower by ₹</option>
                  <option value="amt-up">Raise by ₹</option>
                  <option value="set">Set every one to ₹</option>
                </select>
                <input id="bulk-price-amount" aria-label="Amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${ui.field} sag-num text-center`} />
              </div>
              <p className="text-[12.5px] leading-[18px] text-ink-muted">Rounded to whole rupees. The MRP is never left below the price, and the "% off" is worked out again for each product.</p>
            </div>
          )}

          {kind === 'stock' && (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <select id="bulk-stock-mode" aria-label="How to change stock" value={stockMode} onChange={(e) => setStockMode(e.target.value as 'set' | 'add')} className={`${ui.select} pl-3.5`}>
                <option value="add">Add pieces (use − to remove)</option>
                <option value="set">Set every one to</option>
              </select>
              <input id="bulk-stock-value" aria-label="Pieces" type="number" inputMode="numeric" step={1} value={stockValue} onChange={(e) => setStockValue(e.target.value)} className={`${ui.field} sag-num text-center`} />
            </div>
          )}

          {kind === 'visibility' && (
            <div role="group" aria-label="Show or hide" className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={visibility === 'publish'} onClick={() => setVisibility('publish')} className={segment(visibility === 'publish')}>Publish</button>
              <button type="button" aria-pressed={visibility === 'hide'} onClick={() => setVisibility('hide')} className={segment(visibility === 'hide')}>Hide (draft)</button>
              <button type="button" aria-pressed={visibility === 'archive'} onClick={() => setVisibility('archive')} className={segment(visibility === 'archive')}>Archive</button>
            </div>
          )}

          {kind === 'category' && (
            <select id="bulk-category" aria-label="Move to category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${ui.select} pl-3.5`}>
              {WOMEN_CATEGORY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {kind === 'label' && (
            <div className="space-y-2.5">
              <select id="bulk-flag" aria-label="Label" value={flag} onChange={(e) => setFlag(e.target.value as FlagKey)} className={`${ui.select} pl-3.5`}>
                {(Object.keys(FLAG_LABELS) as FlagKey[]).map((f) => <option key={f} value={f}>{FLAG_LABELS[f]}</option>)}
              </select>
              <div role="group" aria-label="On or off" className="flex gap-1.5">
                <button type="button" aria-pressed={flagOn} onClick={() => setFlagOn(true)} className={segment(flagOn)}>Switch on</button>
                <button type="button" aria-pressed={!flagOn} onClick={() => setFlagOn(false)} className={segment(!flagOn)}>Switch off</button>
              </div>
            </div>
          )}

          {kind === 'seo' && (
            <p className="text-[13px] leading-[18px] text-ink-muted">Fills only what is empty: the Google title from the product name ("Name | Suit Aura Girls") and the Google description from the first lines of the product's own description. Nothing already written is changed.</p>
          )}

          {/* What will happen, product by product */}
          <div className="rounded-[16px] bg-page">
            <p className="px-3.5 pt-3 text-[13px] font-semibold text-ink sag-num" aria-live="polite">
              {problem ? problem : plan.length ? `${plan.length} will change${unchanged ? ` · ${unchanged} already like this` : ''}` : 'Nothing to change: every chosen product is already like this.'}
            </p>
            {!problem && plan.length > 0 && (
              <ul className="mt-1.5 max-h-48 overflow-y-auto px-3.5 pb-3 divide-y divide-line">
                {plan.map((row) => (
                  <li key={row.product.id} className="py-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-ink">{row.product.name}</span>
                    <span className="shrink-0 text-ink-muted sag-num">{row.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-line flex gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={`${ui.outline} flex-1 sm:flex-none`}>Cancel</button>
          <button type="button" id="bulk-apply" disabled={busy || Boolean(problem) || plan.length === 0} onClick={() => onApply(plan, label, reason)} className={`${ui.primary} flex-[2] sm:flex-none sm:ml-auto disabled:opacity-50`}>
            {busy ? 'Saving…' : `Save ${plan.length} change${plan.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
