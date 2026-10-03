import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Layers, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product, ProductColor, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { getCleanImageUrl } from '../utils/imageHelper';
import { isAvailable } from '../utils/smartQuery';
import { trackItem } from '../utils/visitorTracker';
import {
  MAX_BAG_LINES, bagLineId, bagQtyFor, colourByName, coloursOf, comboSaving, defaultSizeFor, inr, isAccessory, lineCapFor,
  needsSizeChoice, sizesOf, usableSize,
} from '../utils/looks';

interface LookLine { productId: string; size: string; colour: string; qty: number }
/** A look line resolved against the live catalogue and the bag. */
interface Row { line: LookLine; product?: Product; size: string; colour?: ProductColor; cap: number; qty: number; gone: boolean }

const STORE_KEY = 'sag_build_look_v1';
const MAX_STYLES = 10;
const PAGE = 24;

// The look in progress survives closing the builder and moving between pages (this tab only).
const loadLines = (): LookLine[] => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    return (Array.isArray(saved) ? saved : [])
      .filter((l) => l && typeof l.productId === 'string')
      .map((l) => ({ productId: l.productId, size: String(l.size || ''), colour: String(l.colour || ''), qty: Math.max(1, Math.floor(Number(l.qty) || 1)) }))
      .slice(0, MAX_STYLES);
  } catch {
    return [];
  }
};
const saveLines = (lines: LookLine[]) => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(lines)); } catch {} };

const mrpOf = (p: Product) => Math.max(p.price, Number(p.originalPrice) || p.price);
const firstImage = (p: Product) => p.images?.find(Boolean) || p.image || '';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Pill button that opens the "Build your look" bundle builder (only when the feature is switched on). */
export const BuildYourLookButton: React.FC<{ className?: string }> = ({ className }) => {
  const { features } = useDiscovery();
  const { products = [] } = useShop();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  if (!features.bundleBuilder || !products.some((p) => !isAccessory(p) && isAvailable(p))) return null;
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={className || 'h-10 px-4 rounded-full border border-line bg-white text-sm text-ink inline-flex items-center gap-1.5 hover:bg-sunken cursor-pointer'}>
        <Layers className="w-4 h-4" /> Build your look
      </button>
      {open && <BuildYourLook onClose={close} />}
    </>
  );
};

/** Bundle builder: combine in-stock styles, pick sizes and quantities, see real prices and the combo estimate. */
export const BuildYourLook: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { products = [], cart = [], addToCart, showToast, comboOffer, comboPieces = 0, maxQtyPerItem = 10 } = useShop();
  const [lines, setLines] = useState<LookLine[]>(loadLines);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [visible, setVisible] = useState(PAGE);
  const [view, setView] = useState<'browse' | 'look'>('browse');
  const [showMissing, setShowMissing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { saveLines(lines); }, [lines]);
  useEffect(() => { setVisible(PAGE); }, [query, category]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Keep keyboard focus inside the dialog
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [onClose]);

  // Outfits only: accessories are sold just inside "Complete the look" on combo / set product pages
  const outfits = useMemo(() => products.filter((p) => !isAccessory(p)), [products]);
  const available = useMemo(() => outfits.filter(isAvailable), [outfits]);
  const byId = useMemo(() => new Map(outfits.map((p) => [String(p.id), p])), [outfits]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(available.map((p) => String(p.category || '')).filter(Boolean)))], [available]);
  const results = useMemo(
    () => available.filter((p) => (category === 'All' || p.category === category) && fuzzyMatchProduct(p, query)),
    [available, category, query],
  );

  // Each line resolved against the live catalogue and the bag: current price, stock left, chosen colour.
  const rows: Row[] = lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product || !isAvailable(product)) return { line, product, size: '', colour: undefined, cap: 0, qty: 0, gone: true };
    const size = usableSize(product, line.size);
    const colour: ProductColor | undefined = coloursOf(product).length > 1 ? colourByName(product, line.colour) : undefined;
    const cap = lineCapFor(product, cart, maxQtyPerItem, size ? bagLineId(product, size, colour) : undefined);
    return { line, product, size, colour, cap, qty: Math.min(line.qty, cap), gone: false };
  });
  const ready = rows.filter((r): r is Row & { product: Product } => !r.gone && r.qty > 0 && Boolean(r.product));
  const missingSizes = ready.filter((r) => !r.size).length;
  const pieces = ready.reduce((sum, r) => sum + r.qty, 0);
  const subtotal = ready.reduce((sum, r) => sum + r.product.price * r.qty, 0);
  // Same rule as the bag: outfit pieces already in the bag count towards the minimum (accessories never do).
  // A look holds outfits only, so every piece in it counts.
  const saving = pieces > 0 ? comboSaving(comboOffer, subtotal, comboPieces + pieces) : 0;
  const viaBag = saving > 0 && comboOffer !== null && pieces < comboOffer.minItems;
  const shortBy = comboOffer && pieces > 0 ? Math.max(0, comboOffer.minItems - comboPieces - pieces) : 0;
  const canAdd = pieces > 0 && missingSizes === 0;

  const inLook = (p: Product) => lines.some((l) => l.productId === String(p.id));
  const update = (productId: string, patch: Partial<LookLine>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  const remove = (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId));

  const toggle = (p: Product) => {
    if (inLook(p)) { remove(String(p.id)); return; }
    if (lines.length >= MAX_STYLES) { showToast(`A look can hold up to ${MAX_STYLES} styles.`, 'info'); return; }
    if (lineCapFor(p, cart, maxQtyPerItem) <= 0) { showToast('All available pieces of this style are already in your bag.', 'info'); return; }
    setLines((prev) => [...prev, { productId: String(p.id), size: defaultSizeFor(p), colour: coloursOf(p)[0]?.name || '', qty: 1 }]);
  };

  const setSize = (row: Row, size: string) => {
    if (!row.product) return;
    // The new size may be a different bag line with its own limit
    const cap = size ? lineCapFor(row.product, cart, maxQtyPerItem, bagLineId(row.product, size, row.colour)) : row.cap;
    update(row.line.productId, { size, qty: Math.max(1, Math.min(row.line.qty, cap || 1)) });
  };

  const addBundle = () => {
    if (pieces === 0) return;
    if (missingSizes > 0) { setShowMissing(true); setView('look'); return; }
    const newLines = new Set(ready.map((r) => bagLineId(r.product, r.size, r.colour)).filter((id) => !cart.some((item) => item.id === id)));
    if (cart.length + newLines.size > MAX_BAG_LINES) {
      showToast(`One order can hold up to ${MAX_BAG_LINES} different items. Remove a few from your bag first.`, 'error');
      return;
    }
    ready.forEach((r) => addToCart(r.product, r.size as ProductSize, r.colour, r.qty, false));
    trackItem('feature_use', 'bundle_add');
    showToast(`Added your look (${pieces} ${pieces === 1 ? 'piece' : 'pieces'}) to your bag.`, 'success');
    // Clear the saved look now: the builder unmounts before its save effect would run again
    saveLines([]);
    setLines([]);
    onClose();
  };

  const chip = (active: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm transition-colors cursor-pointer ${active ? 'bg-brand border-ink text-white' : 'bg-white border-line text-ink hover:bg-sunken'}`;
  const control = 'h-10 max-w-full pl-3 pr-8 rounded-full border bg-white text-sm text-ink focus:outline-none focus:border-control cursor-pointer';

  return (
    <div className="fixed inset-0 z-[70] bg-ink/50 flex items-end md:items-center justify-center sag-fade" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="byl-title" onClick={(e) => e.stopPropagation()}
        className="bg-page w-full md:max-w-5xl h-[94dvh] md:h-[88vh] rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-line bg-white">
          <div className="min-w-0">
            <p id="byl-title" className="font-display text-2xl text-ink flex items-center gap-2"><Layers className="w-5 h-5 shrink-0" /> Build your look</p>
            <p className="text-xs text-ink-muted">Combine in-stock styles and see the real total as you go.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-sunken flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="md:hidden grid grid-cols-2 gap-2 px-4 pt-3" role="group" aria-label="Builder view">
          <button type="button" onClick={() => setView('browse')} aria-pressed={view === 'browse'} className={chip(view === 'browse')}>Browse styles</button>
          <button type="button" onClick={() => setView('look')} aria-pressed={view === 'look'} className={chip(view === 'look')}>Your look ({lines.length})</button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Browse real, in-stock products */}
          <div className={`${view === 'browse' ? 'block' : 'hidden'} md:block flex-1 min-w-0 overflow-y-auto p-4 sm:p-5`}>
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <label htmlFor="byl-search" className="sr-only">Search styles</label>
              <input id="byl-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, colour, fabric"
                className="w-full h-11 pl-10 pr-4 rounded-full border border-line bg-white text-sm focus:outline-none focus:border-control" />
            </div>
            {categories.length > 2 && (
              <div className="sag-scroll-x mt-3 -mx-4 sm:-mx-5 px-4 sm:px-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categories">
                {categories.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={chip(category === c)}>{c}</button>)}
              </div>
            )}
            <p className="mt-3 text-sm text-ink-muted" aria-live="polite">
              {results.length === 0 ? 'No in-stock styles match. Try another word or category.' : `${results.length} ${results.length === 1 ? 'style' : 'styles'} in stock`}
            </p>
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {results.slice(0, visible).map((p) => {
                const added = inLook(p);
                return (
                  <li key={p.id} className="rounded-2xl bg-white border border-line overflow-hidden flex flex-col">
                    <img src={getCleanImageUrl(firstImage(p), 360)} alt={p.name} loading="lazy" className="w-full aspect-[4/5] object-cover object-top bg-sunken" />
                    <div className="p-2.5 flex flex-col flex-1">
                      <p className="text-sm text-ink line-clamp-2 leading-snug">{p.name}</p>
                      <p className="mt-1 mb-2.5 text-sm">
                        <span className="font-semibold text-ink">{inr(p.price)}</span>
                        {mrpOf(p) > p.price && <span className="ml-1.5 text-xs text-ink-faint line-through">{inr(mrpOf(p))}</span>}
                      </p>
                      <button type="button" onClick={() => toggle(p)} aria-pressed={added} aria-label={added ? `Remove ${p.name} from your look` : `Add ${p.name} to your look`}
                        className={`mt-auto h-10 w-full rounded-full text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-1.5 cursor-pointer ${added ? 'bg-sunken text-ink hover:bg-sunken-deep' : 'sag-btn-primary'}`}>
                        {added ? <><Check className="w-4 h-4" /> Added</> : <><Plus className="w-4 h-4" /> Add</>}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {results.length > visible && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Show more</button>
              </div>
            )}
          </div>

          {/* The look being built */}
          <div className={`${view === 'look' ? 'block' : 'hidden'} md:block w-full md:w-[380px] shrink-0 overflow-y-auto p-4 sm:p-5 bg-white md:border-l border-line`}>
            <p className="text-xl text-ink">Your look</p>
            {lines.length === 0 ? (
              <div className="mt-6 text-center px-2">
                <span className="mx-auto w-14 h-14 rounded-full bg-sunken flex items-center justify-center"><Layers className="w-6 h-6 text-ink" /></span>
                <p className="mt-3 text-sm font-medium text-ink">Nothing added yet</p>
                <p className="mt-1 text-sm text-ink-muted">Add styles from the list to build your outfit. The total updates as you go.</p>
                <button type="button" onClick={() => setView('browse')} className="md:hidden mt-4 sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Browse styles</button>
              </div>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line">
                  {rows.map((row) => {
                    const { line, product: p } = row;
                    if (row.gone || !p) {
                      return (
                        <li key={line.productId} className="flex items-center gap-3 py-3">
                          <p className="flex-1 text-sm text-ink-muted">A style in your look is no longer available.</p>
                          <button type="button" onClick={() => remove(line.productId)} className="h-10 px-4 rounded-full border border-line text-sm text-ink hover:bg-sunken cursor-pointer">Remove</button>
                        </li>
                      );
                    }
                    const sizes = sizesOf(p);
                    const colours = coloursOf(p);
                    const stock = Math.max(0, Number(p.stockQuantity ?? 0));
                    const inBag = bagQtyFor(cart, String(p.id));
                    const sizeMissing = showMissing && !row.size;
                    return (
                      <li key={line.productId} className="flex gap-3 py-3">
                        <img src={getCleanImageUrl(firstImage(p), 160)} alt="" className="shrink-0 w-16 aspect-[4/5] rounded-xl object-cover object-top bg-sunken" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1">
                            <p className="flex-1 min-w-0 text-sm text-ink line-clamp-2 leading-snug">{p.name}</p>
                            <button type="button" onClick={() => remove(line.productId)} aria-label={`Remove ${p.name}`} className="w-10 h-10 -mt-2 -mr-2 shrink-0 rounded-full hover:bg-sunken flex items-center justify-center cursor-pointer">
                              <Trash2 className="w-4 h-4 text-ink" />
                            </button>
                          </div>
                          {row.cap <= 0 ? (
                            <p className="text-xs text-ink-muted">Your bag already has the most we can add of this style — not included.</p>
                          ) : (
                            <p className="text-sm text-ink-muted">{inr(p.price)} × {row.qty} = <span className="font-semibold text-ink">{inr(p.price * row.qty)}</span></p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {needsSizeChoice(p) ? (
                              <select value={row.size} onChange={(e) => setSize(row, e.target.value)} aria-label={`Size for ${p.name}`} aria-invalid={sizeMissing}
                                className={`${control} ${sizeMissing ? 'border-rose-300' : 'border-line'}`}>
                                <option value="">Size</option>
                                {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <span className="text-xs text-ink-muted">{sizes.length ? `Size ${sizes[0]}` : 'Free size'}</span>
                            )}
                            {colours.length > 1 && (
                              <select value={row.colour?.name || ''} onChange={(e) => update(line.productId, { colour: e.target.value })} aria-label={`Colour for ${p.name}`}
                                className={`${control} border-line`}>
                                {colours.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                              </select>
                            )}
                            {row.cap > 0 && (
                              <div className="inline-flex items-center rounded-full border border-line bg-white">
                                <button type="button" onClick={() => update(line.productId, { qty: Math.max(1, row.qty - 1) })} disabled={row.qty <= 1} aria-label={`Decrease quantity of ${p.name}`}
                                  className="w-10 h-10 flex items-center justify-center disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><Minus className="w-4 h-4" /></button>
                                <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{row.qty}</span>
                                <button type="button" onClick={() => update(line.productId, { qty: Math.min(row.cap, row.qty + 1) })} disabled={row.qty >= row.cap} aria-label={`Increase quantity of ${p.name}`}
                                  className="w-10 h-10 flex items-center justify-center disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><Plus className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                          {sizeMissing && <p className="mt-1 text-xs text-rose-700">Please choose a size.</p>}
                          {row.cap > 0 && (stock <= 5 || inBag > 0) && (
                            <p className="mt-1 text-xs text-ink-muted">
                              {stock <= 5 ? `Only ${stock} left` : ''}{stock <= 5 && inBag > 0 ? ' · ' : ''}{inBag > 0 ? `${inBag} already in your bag` : ''}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 rounded-2xl bg-sunken p-4 text-sm text-ink" aria-live="polite">
                  <p className="flex justify-between gap-3"><span>Subtotal ({pieces} {pieces === 1 ? 'piece' : 'pieces'})</span><span className="font-semibold">{inr(subtotal)}</span></p>
                  {comboOffer && (
                    <p className="mt-2 text-ink-muted">Combo offer: {comboOffer.percent}% off when you buy {comboOffer.minItems} or more outfits — applied at checkout.</p>
                  )}
                  {saving > 0 && (
                    <>
                      <p className="mt-1 flex justify-between gap-3 text-emerald-800"><span>Combo saving (estimate)</span><span className="shrink-0">−{inr(saving)}</span></p>
                      {viaBag && <p className="text-xs text-ink-muted">Counted with the {comboPieces} {comboPieces === 1 ? 'outfit' : 'outfits'} already in your bag.</p>}
                    </>
                  )}
                  {shortBy > 0 && <p className="mt-1 text-xs text-ink-muted">Add {shortBy} more {shortBy === 1 ? 'outfit' : 'outfits'} to reach the combo offer.</p>}
                  <p className="mt-2 pt-2 border-t border-line flex justify-between gap-3 font-semibold"><span>Estimated total</span><span className="text-ink">{inr(subtotal - saving)}</span></p>
                  <p className="mt-2 text-xs text-ink-muted">Final price is confirmed at checkout.</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-white px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink truncate">
              {pieces > 0 ? <>{pieces} {pieces === 1 ? 'piece' : 'pieces'} · <span className="font-semibold text-ink">Est. {inr(subtotal - saving)}</span></> : 'Your look is empty'}
            </p>
            {missingSizes > 0 ? (
              <button type="button" onClick={() => { setShowMissing(true); setView('look'); }} className="block py-3 -my-3 text-xs text-rose-700 underline underline-offset-2 cursor-pointer text-left">
                Choose a size for {missingSizes} {missingSizes === 1 ? 'style' : 'styles'}
              </button>
            ) : (
              <p className="text-xs text-ink-muted">Final price is confirmed at checkout.</p>
            )}
          </div>
          <button type="button" onClick={addBundle} disabled={!canAdd}
            className="sag-btn-primary shrink-0 h-12 px-4 sm:px-5 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <ShoppingBag className="w-4 h-4 hidden sm:block" /> Add bundle to bag
          </button>
        </div>
      </div>
    </div>
  );
};
