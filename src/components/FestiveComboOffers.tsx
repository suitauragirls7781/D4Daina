import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Check } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { ProductSize } from '../types';
import { BagIcon } from './BrandIcons';
import { HOME_SECTION, HOME_WRAP, HomeSectionHeader } from './HomeSections';

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
    <section id="festive-combo-offers-section" aria-labelledby="combo-offer-title" data-th="paper" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="combo-offer-title"
          eyebrow={comboOffer.title || 'Combo offer'}
          title={`Buy ${minItems} or more, save ${comboOffer.percent}%`}
          text={comboOffer.subtitle || `Mix and match any outfits. ${comboOffer.percent}% comes off automatically in your bag once it holds ${minItems} or more outfits.`}
        />

        <div className="grid lg:grid-cols-12 gap-4 lg:gap-8">
          <div className="aura-card aura-blk aura-lt lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-x-2.5 gap-y-6 p-2 sm:p-4 lg:gap-x-4 lg:gap-y-8 lg:p-5">
            {available.map((product) => {
              const selected = Boolean(picked[product.id]);
              const sizes = product.sizes?.length ? product.sizes : (['Free Size'] as unknown as ProductSize[]);
              return (
                <div key={product.id} className="flex flex-col min-w-0">
                  <button type="button" onClick={() => navigateToProduct(product)} className="aura-sk block overflow-hidden rounded-[17px] cursor-pointer" aria-label={`View ${product.name}`}>
                    <img src={getCleanImageUrl(product.images?.[0] || product.image || '', 420)} alt={product.name} className="w-full aspect-[4/5] object-cover object-top" loading="lazy" decoding="async" />
                  </button>
                  <div className="px-1 pt-2.5 flex-1 flex flex-col gap-1.5">
                    <p className="text-[14px] leading-[1.35] font-medium text-ink line-clamp-2 min-h-[2.7em]">{product.name}</p>
                    <p className="aura-num text-[16px] leading-5 font-extrabold text-ink">₹{product.price.toLocaleString('en-IN')}</p>
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
                      className="sag-chip mt-auto w-full h-[46px] min-w-0 px-2 gap-1.5 text-[14px] font-bold"
                    >
                      {selected && <Check className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />}
                      {selected ? 'Added to combo' : 'Add to combo'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="aura-blk aura-dk bg-dark lg:col-span-4 p-5 sm:p-6 h-fit">
            <h3 className="aura-h2 aura-h-sm">Your <em>combo</em></h3>
            <p className={`mt-2 text-[14px] leading-5 ${qualifies ? 'font-bold' : 'aura-mu'}`} role="status">
              {pickedProducts.length} of {minItems} pieces picked{qualifies ? '. Offer unlocked.' : ''}
            </p>
            <div className="aura-num mt-4 space-y-2 text-[15px] leading-5">
              <div className="aura-mu flex justify-between"><span>Items</span><span>₹{rawTotal.toLocaleString('en-IN')}</span></div>
              <div className="aura-sa flex justify-between font-semibold"><span>Combo {comboOffer.percent}% off</span><span>{discount ? `−₹${discount.toLocaleString('en-IN')}` : '—'}</span></div>
              <div className="aura-hl flex items-baseline justify-between pt-3 border-t">
                <span className="font-bold">Combo price</span>
                <span className="text-[22px] leading-7 font-extrabold">₹{(rawTotal - discount).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2.5">
              <button type="button" onClick={() => addAll(false)} disabled={!qualifies} className="aura-btn aura-btn-w">
                <BagIcon mono className="w-[18px] h-[18px]" />
                Add combo to bag
              </button>
              <button type="button" onClick={() => addAll(true)} disabled={!qualifies} className="aura-btn aura-btn-line aura-btn-w">
                Buy combo now
              </button>
            </div>
            <p className="aura-mu mt-4 text-[13px] leading-[18px]">The discount is applied to your whole bag at checkout whenever it has {minItems}+ outfits.</p>
          </aside>
        </div>
      </div>
    </section>
  );
};
