import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Check, ShoppingBag } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { ProductSize } from '../types';

const MAX_PICKS = 4;

/**
 * Multi-buy builder. The discount itself is the admin's combo rule, applied automatically
 * to the bag (and re-applied by the server at checkout), so items are added at their normal price.
 */
export const FestiveComboOffers: React.FC = () => {
  const { products, addToCart, showToast, setActivePage, comboOffer, navigateToProduct } = useShop();
  const available = useMemo(() => products.filter((p) => p.inStock && (p.stockQuantity ?? 1) > 0).slice(0, 8), [products]);
  const [picked, setPicked] = useState<Record<string, ProductSize>>({});

  if (!comboOffer || available.length < 1) return null;

  const minItems = comboOffer.minItems;
  const pickedProducts = available.filter((p) => picked[p.id]);
  const rawTotal = pickedProducts.reduce((sum, p) => sum + p.price, 0);
  const qualifies = pickedProducts.length >= minItems;
  const discount = qualifies ? Math.round((rawTotal * comboOffer.percent) / 100) : 0;

  const toggle = (id: string, defaultSize: ProductSize) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        if (Object.keys(next).length >= MAX_PICKS) {
          showToast(`You can pick up to ${MAX_PICKS} pieces here. Add more from any product page.`, 'info');
          return prev;
        }
        next[id] = defaultSize;
      }
      return next;
    });
  };

  const addAll = (goToCheckout: boolean) => {
    if (!qualifies) {
      showToast(`Pick at least ${minItems} pieces to unlock ${comboOffer.percent}% off.`, 'info');
      return;
    }
    pickedProducts.forEach((product) => {
      addToCart(product, picked[product.id], product.colors?.[0], 1, false);
    });
    setPicked({});
    if (goToCheckout) setActivePage('checkout');
  };

  return (
    <section id="festive-combo-offers-section" className="w-full py-12 sm:py-16 bg-[#FBF7F3] border-y border-[#4B1D3F]/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#7E5F33]">{comboOffer.title || 'Combo offer'}</p>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#2A1A26]">
            Buy {minItems} or more, save {comboOffer.percent}%
          </h2>
          <p className="text-sm text-[#2A1A26]/65">
            {comboOffer.subtitle || `Mix and match any outfits. ${comboOffer.percent}% comes off automatically in your bag once it holds ${minItems} or more outfits.`}
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {available.map((product) => {
              const selected = Boolean(picked[product.id]);
              const sizes = product.sizes?.length ? product.sizes : (['Free Size'] as unknown as ProductSize[]);
              return (
                <div key={product.id} className={`border bg-white flex flex-col transition ${selected ? 'border-[#4B1D3F]' : 'border-[#4B1D3F]/20'}`}>
                  <button type="button" onClick={() => navigateToProduct(product)} className="block cursor-pointer" aria-label={`View ${product.name}`}>
                    <img src={getCleanImageUrl(product.images?.[0] || product.image || '')} alt={product.name} className="w-full aspect-[4/5] object-cover" loading="lazy" />
                  </button>
                  <div className="p-2.5 flex-1 flex flex-col gap-2">
                    <p className="text-xs text-[#2A1A26] line-clamp-2 min-h-[2rem]">{product.name}</p>
                    <p className="text-sm text-[#7E5F33]">₹{product.price.toLocaleString('en-IN')}</p>
                    {selected && (
                      <select
                        aria-label={`Size for ${product.name}`}
                        value={picked[product.id]}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [product.id]: e.target.value as ProductSize }))}
                        className="w-full px-2 py-1.5 bg-[#FBF7F3] border border-[#4B1D3F]/30 rounded text-xs text-[#2A1A26]"
                      >
                        {sizes.map((size) => <option key={size} value={size}>Size {size}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(product.id, sizes[0])}
                      aria-pressed={selected}
                      className={`mt-auto w-full py-2 text-[11px] uppercase tracking-wider rounded border cursor-pointer inline-flex items-center justify-center gap-1 ${
                        selected ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'border-[#4B1D3F]/40 text-[#2A1A26] hover:bg-[#F3EEF8]'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {selected ? 'Added to combo' : 'Add to combo'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="lg:col-span-4 border border-[#4B1D3F]/25 bg-white p-5 space-y-4 h-fit lg:sticky lg:top-36">
            <h3 className="font-serif text-xl text-[#2A1A26]">Your combo</h3>
            <p className="text-xs text-[#2A1A26]/70">
              {pickedProducts.length} of {minItems} pieces picked{qualifies ? ' — offer unlocked' : ''}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#2A1A26]/75"><span>Items</span><span>₹{rawTotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Combo {comboOffer.percent}% off</span><span>{discount ? `−₹${discount.toLocaleString('en-IN')}` : '—'}</span></div>
              <div className="flex justify-between text-[#2A1A26] pt-2 border-t border-[#4B1D3F]/15">
                <span>Combo price</span>
                <span className="font-serif text-2xl">₹{(rawTotal - discount).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => addAll(false)}
              disabled={!qualifies}
              className="w-full py-3 bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-xs font-semibold uppercase tracking-[0.18em] rounded inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBag className="w-4 h-4" />
              Add combo to bag
            </button>
            <button
              type="button"
              onClick={() => addAll(true)}
              disabled={!qualifies}
              className="w-full py-3 border border-[#4B1D3F]/40 text-[#2A1A26] text-xs uppercase tracking-[0.18em] rounded hover:bg-[#F3EEF8] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Buy combo now
            </button>
            <p className="text-[11px] text-[#2A1A26]/65">The discount is applied to your whole bag at checkout whenever it has {minItems}+ outfits.</p>
          </aside>
        </div>
      </div>
    </section>
  );
};
