import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';
import { Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import { isAccessory, outfitQtyIn } from '../utils/looks';
import { HeartIcon, TagIcon, TruckIcon } from './StoreIcons';
import { BagIcon } from './BrandIcons';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Size M", or "One size" for free-size pieces. */
const sizeLabel = (size?: string) => (!size || /^(free ?size|one ?size|standard)$/i.test(String(size)) ? 'One size' : `Size ${size}`);

/** The bag's estimated total (a preview; the server recalculates at checkout). */
export const useBagTotal = () => {
  const { cartTotal, prepaidDiscount } = useShop();
  return Math.max(0, cartTotal - prepaidDiscount);
};

/** Bag lines with quantity controls. Used by the cart drawer and the cart page. */
export const CartLines: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { cart, removeFromCart, updateCartQuantity, navigateToProduct, maxQtyPerItem, toggleWishlist, isInWishlist, showToast } = useShop();
  // Saves the style to the wishlist and takes this line out of the bag (look accessories stay with their outfit)
  const moveToWishlist = (itemId: string, product: (typeof cart)[number]['product']) => {
    removeFromCart(itemId);
    if (isInWishlist(product.id)) showToast(`"${product.name}" moved to your wishlist.`, 'success');
    else toggleWishlist(product);
  };
  return (
    <ul className="divide-y divide-[#4B1D3F]/10">
      {cart.map((item) => {
        const stock = Number(item.product.stockQuantity ?? 0);
        const accessory = isAccessory(item.product) && item.lookParentId;
        const outfit = accessory ? cart.find((line) => !isAccessory(line.product) && String(line.product.id) === item.lookParentId) : undefined;
        // An accessory never outnumbers its outfit (other sizes of the same accessory count too)
        const lookRoom = accessory
          ? outfitQtyIn(cart, String(item.lookParentId)) - cart.filter((line) => line.id !== item.id && line.lookParentId === item.lookParentId && String(line.product.id) === String(item.product.id)).reduce((sum, line) => sum + line.quantity, 0)
          : Infinity;
        const cap = Math.min(maxQtyPerItem, stock > 0 ? stock : maxQtyPerItem, lookRoom);
        const openId = accessory ? String(item.lookParentId) : item.product.id;
        const mrp = Math.max(item.product.price, Number(item.product.originalPrice) || item.product.price);
        const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
        // Only real limits: the stock the store entered, or the outfit an accessory belongs to
        const capNote = item.quantity >= cap
          ? accessory && lookRoom <= Math.min(maxQtyPerItem, stock > 0 ? stock : maxQtyPerItem)
            ? 'Matches your outfit quantity'
            : stock > 0 && stock <= maxQtyPerItem
              ? `Only ${stock} available`
              : `Max ${cap} per order`
          : '';
        return (
          <li key={item.id} className="flex gap-3.5 sm:gap-4 py-5">
            <button
              onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
              className="group shrink-0 w-[84px] sm:w-24 aspect-[4/5] rounded-2xl overflow-hidden bg-[#F3EEF8] border border-[#4B1D3F]/10 cursor-pointer"
              aria-label={`View ${item.product.name}`}
            >
              <img src={getCleanImageUrl(item.product.images?.[0] || item.product.image || '', 240)} alt="" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" loading="lazy" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                  className="text-left text-sm sm:text-[15px] font-medium text-[#2A1A26] leading-snug line-clamp-2 hover:text-[#4B1D3F] cursor-pointer"
                >
                  {item.product.name}
                </button>
                <button onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.product.name}`} title="Remove" className="shrink-0 -mr-1.5 -mt-1 w-9 h-9 rounded-full flex items-center justify-center text-[#2A1A26]/55 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#F3EEF8] text-[11px] font-semibold text-[#4B1D3F]">{sizeLabel(item.selectedSize)}</span>
                {colour && <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-[#4B1D3F]/12 text-[11px] font-medium text-[#2A1A26]/75">{colour}</span>}
              </div>
              {accessory && (
                <p className="mt-1.5 text-xs text-[#9C7A45] line-clamp-1">Complete the look · with {outfit?.product.name || 'your outfit'}</p>
              )}
              {!item.lookParentId && !isAccessory(item.product) && (
                <button
                  type="button"
                  onClick={() => moveToWishlist(item.id, item.product)}
                  className="mt-1.5 self-start inline-flex items-center gap-1.5 min-h-8 -ml-2 px-2 rounded-full text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
                >
                  <HeartIcon className="w-4 h-4" live={false} /> Move to wishlist
                </button>
              )}
              <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="inline-flex items-center h-9 rounded-full border border-[#4B1D3F]/15 bg-white" role="group" aria-label={`Quantity of ${item.product.name}`}>
                    <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} aria-label={item.quantity <= 1 ? `Remove ${item.product.name}` : 'Decrease quantity'} className="w-9 h-9 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer">
                      {item.quantity <= 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    </button>
                    <span className="w-7 text-center text-sm font-semibold text-[#2A1A26] tabular-nums" aria-live="polite">{item.quantity}</span>
                    <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= cap} aria-label="Increase quantity" className="w-9 h-9 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {capNote && <p className="mt-1 text-[11px] text-[#2A1A26]/60">{capNote}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-semibold text-[#4B1D3F] tabular-nums">{inr(item.product.price * item.quantity)}</p>
                  {mrp > item.product.price && <p className="text-xs text-[#2A1A26]/55 line-through tabular-nums">{inr(mrp * item.quantity)}</p>}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** Empty bag: one clear next step, plus the wishlist when it really has styles. */
export const EmptyBag: React.FC<{ onDone?: () => void; heading?: 'h1' | 'h2' }> = ({ onDone, heading = 'h2' }) => {
  const { navigateToCategory, setActivePage, wishlist = [] } = useShop();
  const Heading = heading;
  return (
    <div className="flex flex-col items-center text-center px-6 max-w-sm mx-auto">
      <span className="relative w-24 h-24 rounded-full bg-[#F3EEF8] flex items-center justify-center sag-pop">
        <span aria-hidden="true" className="absolute inset-2 rounded-full border border-dashed border-[#C5A46D]/60" />
        <BagIcon className="w-10 h-10" />
      </span>
      <Heading className="mt-6 font-serif text-3xl text-[#4B1D3F]">Your bag is empty</Heading>
      <p className="mt-2 text-sm leading-relaxed text-[#2A1A26]/70">Find a style you love — it will wait for you here until you are ready to check out.</p>
      <button onClick={() => { onDone?.(); navigateToCategory('All'); }} className="mt-7 sag-btn-primary w-full max-w-[260px] h-12 px-8 text-xs font-semibold uppercase tracking-[0.16em] cursor-pointer">
        Start shopping
      </button>
      {wishlist.length > 0 && (
        <button onClick={() => { onDone?.(); setActivePage('wishlist'); }} className="mt-3 sag-btn-outline w-full max-w-[260px] h-12 px-6 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer">
          <HeartIcon className="w-4 h-4" live={false} /> View wishlist ({wishlist.length})
        </button>
      )}
    </div>
  );
};

/** Free-shipping and combo nudges, built only from the store's real settings. */
const BagNudges: React.FC = () => {
  const { cartSubtotal, shippingFee, freeShippingThreshold, comboDiscount, comboOffer, comboPieces = 0 } = useShop();
  const toFreeShipping = freeShippingThreshold > 0 && shippingFee > 0 ? freeShippingThreshold - cartSubtotal : 0;
  const unlocked = freeShippingThreshold > 0 && shippingFee === 0 && cartSubtotal >= freeShippingThreshold;
  const comboLeft = comboOffer && comboDiscount === 0 && comboPieces < comboOffer.minItems ? comboOffer.minItems - comboPieces : 0;
  if (!comboLeft && toFreeShipping <= 0 && !unlocked && !(comboOffer && comboDiscount > 0)) return null;
  const progress = freeShippingThreshold > 0 ? Math.min(100, Math.round((cartSubtotal / freeShippingThreshold) * 100)) : 0;
  return (
    <div className="rounded-2xl bg-[#F3EEF8] p-4 space-y-3">
      {toFreeShipping > 0 && (
        <div>
          <p className="flex items-center gap-2.5 text-sm text-[#2A1A26]">
            <TruckIcon className="w-5 h-5 shrink-0" live={false} />
            <span>Add <span className="font-semibold text-[#4B1D3F]">{inr(toFreeShipping)}</span> more for free shipping</span>
          </p>
          <div className="mt-2.5 h-1.5 rounded-full bg-white overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress to free shipping">
            <div className="h-full rounded-full bg-[#4B1D3F] transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {unlocked && (
        <p className="flex items-center gap-2.5 text-sm text-emerald-800">
          <TruckIcon className="w-5 h-5 shrink-0" live={false} />
          <span className="font-medium">You have unlocked free shipping</span>
        </p>
      )}
      {comboLeft > 0 && comboOffer && (
        <p className={`flex items-center gap-2.5 text-sm text-[#2A1A26] ${toFreeShipping > 0 || unlocked ? 'pt-3 border-t border-[#4B1D3F]/10' : ''}`}>
          <TagIcon className="w-5 h-5 shrink-0" live={false} />
          <span>Add {comboLeft} more {comboLeft === 1 ? 'outfit' : 'outfits'} to save <span className="font-semibold text-[#4B1D3F]">{comboOffer.percent}%</span> on your bag</span>
        </p>
      )}
      {comboOffer && comboDiscount > 0 && (
        <p className={`flex items-center gap-2.5 text-sm text-emerald-800 ${toFreeShipping > 0 || unlocked ? 'pt-3 border-t border-[#4B1D3F]/10' : ''}`}>
          <TagIcon className="w-5 h-5 shrink-0" live={false} />
          <span className="font-medium">Combo offer applied · {comboOffer.percent}% off</span>
        </p>
      )}
    </div>
  );
};

/** Coupon field + price breakdown. Totals are a preview; the server recalculates at checkout. */
export const CartTotals: React.FC = () => {
  const {
    cart, cartSubtotal, shippingFee, discountAmount, appliedCoupon, applyCoupon, removeCoupon,
    coupons = [], prepaidDiscount, comboDiscount, setIsCouponDrawerOpen,
  } = useShop();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const pieces = cart.reduce((sum, item) => sum + item.quantity, 0);
  const estimated = useBagTotal();
  const mrpSavings = cart.reduce((sum, item) => sum + Math.max(0, (Number(item.product.originalPrice) || 0) - item.product.price) * item.quantity, 0);
  const totalSavings = mrpSavings + comboDiscount + discountAmount + prepaidDiscount;

  const apply = async (value: string) => {
    if (!value.trim() || applying) return;
    setApplying(true);
    const ok = await applyCoupon(value);
    setApplying(false);
    if (ok) setCode('');
  };

  return (
    <div className="space-y-5">
      <BagNudges />

      {appliedCoupon ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 pl-4 pr-2 py-2.5 text-sm text-emerald-800">
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <TagIcon className="w-5 h-5 shrink-0" live={false} />
            <span className="min-w-0">
              <span className="block font-semibold tracking-wide truncate">{appliedCoupon.code} applied</span>
              {discountAmount > 0 && <span className="block text-xs text-emerald-700">You save {inr(discountAmount)}</span>}
            </span>
          </span>
          <button onClick={removeCoupon} aria-label="Remove coupon" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-emerald-100 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div>
          <form onSubmit={(e) => { e.preventDefault(); apply(code); }} className="relative">
            <label htmlFor="bag-coupon" className="sr-only">Coupon code</label>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"><TagIcon className="w-5 h-5" live={false} /></span>
            <input id="bag-coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" autoComplete="off"
              className="w-full h-12 rounded-full border border-[#4B1D3F]/15 bg-white pl-11 pr-28 text-sm font-medium tracking-wide text-[#2A1A26] uppercase placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-[#2A1A26]/50 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-4 focus:ring-[#F3EEF8] transition" />
            <button type="submit" disabled={applying || !code.trim()} className={`absolute right-1.5 top-1.5 h-9 min-w-[84px] px-4 rounded-full text-xs font-semibold uppercase tracking-[0.12em] transition-colors inline-flex items-center justify-center ${code.trim() || applying ? 'bg-[#4B1D3F] text-white hover:bg-[#3B1532] cursor-pointer' : 'bg-[#F3EEF8] text-[#4B1D3F]/70 cursor-not-allowed'}`}>
              {applying ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Applying" /> : 'Apply'}
            </button>
          </form>
          {coupons.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {coupons.slice(0, 3).map((c) => (
                <button key={c.id} onClick={() => apply(c.code)} disabled={applying} className="inline-flex items-center h-8 px-3 rounded-full border border-dashed border-[#C5A46D] bg-white text-xs text-[#2A1A26] hover:bg-[#F3EEF8] transition-colors cursor-pointer disabled:opacity-60">
                  <span className="font-semibold tracking-wide text-[#4B1D3F]">{c.code}</span>
                  <span className="mx-1.5 text-[#2A1A26]/35">·</span>
                  {c.discountType === 'fixed' ? `₹${c.discountValue}` : `${c.discountValue}%`} off
                </button>
              ))}
              <button type="button" onClick={() => setIsCouponDrawerOpen(true)} className="inline-flex items-center h-8 px-1 text-xs font-semibold text-[#4B1D3F] underline underline-offset-4 decoration-[#4B1D3F]/30 hover:decoration-[#4B1D3F] cursor-pointer">
                View all offers
              </button>
            </div>
          )}
        </div>
      )}

      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between gap-3 text-[#2A1A26]/75"><dt>Subtotal ({pieces} {pieces === 1 ? 'item' : 'items'})</dt><dd className="text-[#2A1A26] tabular-nums">{inr(cartSubtotal)}</dd></div>
        {comboDiscount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>Combo discount</dt><dd className="tabular-nums">−{inr(comboDiscount)}</dd></div>}
        {discountAmount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>Coupon {appliedCoupon?.code}</dt><dd className="tabular-nums">−{inr(discountAmount)}</dd></div>}
        {prepaidDiscount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>Prepaid discount</dt><dd className="tabular-nums">−{inr(prepaidDiscount)}</dd></div>}
        <div className="flex justify-between gap-3 text-[#2A1A26]/75"><dt>Shipping</dt><dd className={shippingFee > 0 ? 'text-[#2A1A26] tabular-nums' : 'font-medium text-emerald-700'}>{shippingFee > 0 ? inr(shippingFee) : 'Free'}</dd></div>
        <div className="flex justify-between items-baseline gap-3 pt-3.5 mt-1 border-t border-[#4B1D3F]/10">
          <dt>
            <span className="block text-base font-semibold text-[#2A1A26]">Total</span>
            <span className="block text-[11px] text-[#2A1A26]/60">Inclusive of all taxes</span>
          </dt>
          <dd className="font-serif text-[26px] leading-none font-semibold text-[#4B1D3F] tabular-nums lining-nums">{inr(estimated)}</dd>
        </div>
      </dl>
      {totalSavings > 0 && (
        <p className="rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2 text-center text-xs font-semibold text-emerald-800">
          You save {inr(totalSavings)} on this order
        </p>
      )}
    </div>
  );
};
