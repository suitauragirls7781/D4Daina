import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Check } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { ProductSize } from '../types';
import { BagIcon } from './BrandIcons';
import { FadeImg, HOME_SECTION, HOME_WRAP, HomeSectionHeader } from './HomeSections';

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
    <section id="festive-combo-offers-section" aria-labelledby="combo-offer-title" className={`${HOME_SECTION} bg-page`}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="combo-offer-title"
          eyebrow={comboOffer.title || undefined}
          title={`Buy ${minItems} or more, save ${comboOffer.percent}%`}
          text={comboOffer.subtitle || `Mix and match any outfits. ${comboOffer.percent}% comes off automatically in your bag once it holds ${minItems} or more outfits.`}
        />

        <div className="grid lg:grid-cols-12 gap-5 lg:gap-8">
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-6">
            {available.map((product) => {
              const selected = Boolean(picked[product.id]);
              const sizes = product.sizes?.length ? product.sizes : (['Free Size'] as unknown as ProductSize[]);
              return (
                <div key={product.id} className="flex flex-col min-w-0">
                  <button type="button" onClick={() => navigateToProduct(product)} className="block overflow-hidden rounded-control bg-sunken cursor-pointer" aria-label={`View ${product.name}`}>
                    <FadeImg src={getCleanImageUrl(product.images?.[0] || product.image || '', 420)} alt={product.name} className="w-full aspect-[4/5] object-cover object-top" loading="lazy" decoding="async" />
                  </button>
                  <div className="pt-2 flex-1 flex flex-col gap-2">
                    <p className="text-sm leading-5 font-medium text-ink line-clamp-2 min-h-10">{product.name}</p>
                    <p className="sag-num text-base leading-5 font-bold text-ink">₹{product.price.toLocaleString('en-IN')}</p>
                    {selected && (
                      <select
                        aria-label={`Size for ${product.name}`}
                        value={picked[product.id]}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [product.id]: e.target.value as ProductSize }))}
                        className="sag-input h-11 px-2.5 text-sm"
                      >
                        {sizes.map((size) => <option key={size} value={size}>Size {size}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(product.id, sizes[0])}
                      aria-pressed={selected}
                      className="sag-chip mt-auto w-full h-11 min-w-0 px-2 gap-1.5 text-sm font-semibold"
                    >
                      {selected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                      {selected ? 'Added to combo' : 'Add to combo'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="lg:col-span-4 sag-card p-4 sm:p-5 h-fit lg:sticky lg:top-24">
            <h3 className="font-display text-[17px] leading-6 font-semibold text-ink">Your combo</h3>
            <p className={`mt-1 text-sm leading-5 ${qualifies ? 'text-ok font-semibold' : 'text-ink-muted'}`} role="status">
              {pickedProducts.length} of {minItems} pieces picked{qualifies ? '. Offer unlocked.' : ''}
            </p>
            <div className="sag-num mt-3 space-y-2 text-sm leading-5">
              <div className="flex justify-between text-ink-muted"><span>Items</span><span>₹{rawTotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sale font-semibold"><span>Combo {comboOffer.percent}% off</span><span>{discount ? `−₹${discount.toLocaleString('en-IN')}` : '—'}</span></div>
              <div className="flex items-baseline justify-between text-ink pt-3 border-t border-line">
                <span className="font-semibold">Combo price</span>
                <span className="text-lg leading-[22px] font-bold">₹{(rawTotal - discount).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              <button type="button" onClick={() => addAll(false)} disabled={!qualifies} className="sag-btn-primary w-full h-12 gap-2">
                <BagIcon mono className="w-[18px] h-[18px]" />
                Add combo to bag
              </button>
              <button type="button" onClick={() => addAll(true)} disabled={!qualifies} className="sag-btn-outline w-full h-12 text-[15px]">
                Buy combo now
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">The discount is applied to your whole bag at checkout whenever it has {minItems}+ outfits.</p>
          </aside>
        </div>
      </div>
    </section>
  );
};
