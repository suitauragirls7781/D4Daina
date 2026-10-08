import { lineImage } from '../utils/lineImage';
import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';
import { AlertCircle, Check, ChevronDown, Loader2, Minus, Plus } from 'lucide-react';
import { isAccessory, outfitQtyIn } from '../utils/looks';
import { HeartIcon, TagIcon, TruckIcon } from './StoreIcons';
import { BagIcon } from './BrandIcons';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Size M", or "One size" for free-size pieces. */
const sizeLabel = (size?: string) => (!size || /^(free ?size|one ?size|standard)$/i.test(String(size)) ? 'One size' : `Size ${size}`);

// Midnight glass: a small gold text link
const LINK = 'sag-link text-[12.5px] font-semibold decoration-1 underline-offset-4';

/** The bag's estimated total (a preview; the server recalculates at checkout). */
export const useBagTotal = () => {
  const { cartTotal, prepaidDiscount } = useShop();
  return Math.max(0, cartTotal - prepaidDiscount);
};

/**
 * Display only: what the bag saves against MRP, from the shop's own numbers (catalogue discount, combo,
 * coupon and online-payment discount). The same sum the price details show; nothing is priced here.
 */
export const useBagSavings = () => {
  const { cart, cartSubtotal, discountAmount, prepaidDiscount, comboDiscount } = useShop();
  const totalMRP = cart.reduce((sum, item) => {
    const price = Number(item.product?.price) || 0;
    return sum + Math.max(price, Number(item.product?.originalPrice) || price) * item.quantity;
  }, 0);
  const catalogDiscount = Math.max(0, totalMRP - cartSubtotal);
  const totalSavings = catalogDiscount + comboDiscount + discountAmount + prepaidDiscount;
  return { totalMRP, catalogDiscount, totalSavings };
};

/** The small quiet notice on top of the bag: "You save ₹X on this order". Not shown when nothing is saved. */
export const SavingsStrip: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { totalSavings } = useBagSavings();
  if (!(totalSavings > 0)) return null;
  return (
    <p className={`sag-glass rounded-full px-4 py-2.5 text-xs leading-4 tracking-[0.02em] text-ink sag-num ${className}`}>
      <span className="font-semibold text-sale">You save <span key={totalSavings} className="sag-settle">{inr(totalSavings)}</span></span> on this order
    </p>
  );
};

/**
 * Display only: applies a coupon through the shop's own applyCoupon() and keeps the reason it was refused,
 * so the bag, the offers sheet and checkout show it once, next to the coupon field (no error toast as well).
 * The reason is the exact text applyCoupon() gives; nothing is validated here.
 */
export const useCouponApply = () => {
  const { applyCoupon, appliedCoupon } = useShop();
  const [applying, setApplying] = useState('');
  const [error, setError] = useState('');
  const [failedCode, setFailedCode] = useState('');

  useEffect(() => {
    if (appliedCoupon) { setError(''); setFailedCode(''); }
  }, [appliedCoupon]);

  const clearError = () => { setError(''); setFailedCode(''); };

  const apply = async (value: string): Promise<boolean> => {
    const code = value.trim().toUpperCase();
    if (!code || applying) return false;
    setApplying(code);
    setError('');
    setFailedCode('');
    let reason = '';
    const ok = await applyCoupon(code, (message) => { reason = message; });
    setApplying('');
    if (!ok) {
      setFailedCode(code);
      setError(reason || 'This coupon could not be applied.');
    }
    return ok;
  };

  return { apply, applying, error, failedCode, clearError };
};

/** The refused-coupon reason, shown directly under the coupon field. */
export const CouponError: React.FC<{ id?: string; message: string; className?: string }> = ({ id, message, className = 'mt-1.5' }) => (
  message ? (
    <p id={id} role="alert" className={`${className} flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-danger`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-px" strokeWidth={1.5} aria-hidden="true" /><span>{message}</span>
    </p>
  ) : null
);

/**
 * Price breakdown: the same rows and words in the bag, the bag drawer and checkout.
 * A preview built from the shop's own totals; the server recalculates everything before payment.
 * Plain key/value rows with a hairline above the total. totalLabel only renames the last row ("To pay" at checkout).
 */
export const PriceDetails: React.FC<{ totalLabel?: string }> = ({ totalLabel = 'Total' }) => {
  const {
    cartSubtotal, shippingFee, discountAmount, appliedCoupon, prepaidDiscount, comboDiscount, comboOffer, freeShippingThreshold,
  } = useShop();
  const total = useBagTotal();
  const { totalMRP, catalogDiscount, totalSavings } = useBagSavings();
  const row = 'flex justify-between gap-3 py-[5px]';
  return (
    <div>
      <h3 className="sr-only">Price details</h3>
      <dl className="text-[13.5px] leading-5 text-ink sag-num">
        <div className={row}><dt className="text-ink-muted">Total MRP</dt><dd>{inr(totalMRP)}</dd></div>
        {catalogDiscount > 0 && <div className={row}><dt className="text-ink-muted">Discount on MRP</dt><dd className="text-sale">−{inr(catalogDiscount)}</dd></div>}
        <div className={row}><dt className="text-ink-muted">Subtotal</dt><dd>{inr(cartSubtotal)}</dd></div>
        <div className={row}><dt className="text-ink-muted">Delivery</dt><dd>{shippingFee > 0 ? inr(shippingFee) : 'Free'}</dd></div>
        {comboDiscount > 0 && <div className={row}><dt className="text-ink-muted">Combo discount{comboOffer ? ` (${comboOffer.percent}% on ${comboOffer.minItems}+ outfits)` : ''}</dt><dd className="text-sale">−{inr(comboDiscount)}</dd></div>}
        {discountAmount > 0 && <div className={row}><dt className="text-ink-muted">Coupon {appliedCoupon?.code}</dt><dd className="text-sale">−{inr(discountAmount)}</dd></div>}
        {prepaidDiscount > 0 && <div className={row}><dt className="text-ink-muted">Online payment discount</dt><dd className="text-sale">−{inr(prepaidDiscount)}</dd></div>}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt>
            <span className="block text-[17px] leading-6 font-semibold text-ink">{totalLabel}</span>
            <span className="block text-[11.5px] leading-4 text-ink-muted">Inclusive of all taxes{shippingFee > 0 ? ' and delivery' : ''}{freeShippingThreshold > 0 && shippingFee > 0 ? ` · free delivery above ${inr(freeShippingThreshold)}` : ''}</span>
          </dt>
          <dd className="text-[17px] leading-6 font-semibold text-ink"><span key={total} className="sag-settle">{inr(total)}</span></dd>
        </div>
      </dl>
      {totalSavings > 0 && (
        <p className="mt-2 text-xs leading-4 font-semibold text-sale sag-num">
          You save <span key={totalSavings} className="sag-settle">{inr(totalSavings)}</span> on this order
        </p>
      )}
    </div>
  );
};

/**
 * Bag lines with quantity controls. Used by the cart drawer and the cart page.
 * Midnight glass (owner's pick): each line is its own glass card, at every width.
 */
export const CartLines: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { cart, removeFromCart, updateCartQuantity, navigateToProduct, maxQtyPerItem, toggleWishlist, isInWishlist, showToast } = useShop();
  // Saves the style to the wishlist and takes this line out of the bag (look accessories stay with their outfit)
  const moveToWishlist = (itemId: string, product: (typeof cart)[number]['product']) => {
    removeFromCart(itemId);
    if (isInWishlist(product.id)) showToast(`Moved to wishlist\n${product.name}`, 'success');
    else toggleWishlist(product);
  };
  const stepButton = 'w-9 h-full flex items-center justify-center rounded-full text-ink hover:bg-[color:var(--sag-glass-strong)] transition-colors disabled:text-ink-faint disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer';
  return (
    <ul className="sag-stagger space-y-3">
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
        const off = mrp > item.product.price ? Math.round(((mrp - item.product.price) / mrp) * 100) : 0;
        const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
        // Only real limits: the stock the store entered, or the outfit an accessory belongs to
        const capNote = item.quantity >= cap
          ? accessory && lookRoom <= Math.min(maxQtyPerItem, stock > 0 ? stock : maxQtyPerItem)
            ? 'Matches your outfit quantity'
            : stock > 0 && stock <= maxQtyPerItem
              ? `Only ${stock} available`
              : `Max ${cap} per order`
          : '';
        const canMove = !item.lookParentId && !isAccessory(item.product);
        return (
          <li key={item.id} className="sag-glass p-3">
            <div className="flex gap-[13px]">
              <button
                onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                className="shrink-0 self-start w-[78px] sm:w-[84px] aspect-[4/5] overflow-hidden rounded-[14px] bg-[color:var(--sag-glass)] cursor-pointer"
                aria-label={`View ${item.product.name}`}
              >
                <img src={getCleanImageUrl(lineImage(item), 240)} alt="" width={84} height={105} className="w-full h-full object-cover object-top" loading="lazy" />
              </button>
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                  className="block text-left text-[13px] leading-[18px] text-ink line-clamp-2 cursor-pointer"
                >
                  {item.product.name}
                </button>
                <p className="mt-1 text-[11.5px] leading-4 text-ink-muted">{sizeLabel(item.selectedSize)}{colour ? ` · ${colour}` : ''}</p>
                {accessory && (
                  <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted line-clamp-1">Complete the look · with {outfit?.product.name || 'your outfit'}</p>
                )}
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-[7px] sag-num">
                  <span className="text-[14.5px] leading-5 font-semibold text-ink">{inr(item.product.price * item.quantity)}</span>
                  {mrp > item.product.price && <span className="text-[12.5px] text-ink-muted line-through">{inr(mrp * item.quantity)}</span>}
                  {off > 0 && <span className="text-[12.5px] font-semibold text-sale">{off}% off</span>}
                </p>
                {/* The glass pill quantity stepper and "Remove" sit under the price, beside the photo */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
                  <div className="inline-flex items-center h-9 rounded-full border border-[color:var(--sag-edge)] bg-[color:var(--sag-glass)]" role="group" aria-label={`Quantity of ${item.product.name}`}>
                    {/* At quantity 1 the "Remove" link beside the stepper is the one way to take the line out */}
                    <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Decrease quantity" className={stepButton}>
                      <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <span className="w-6 text-center text-[13px] font-semibold text-ink sag-num" aria-live="polite">{item.quantity}</span>
                    <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= cap} aria-label="Increase quantity" className={stepButton}>
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3.5">
                    {canMove && (
                      <button type="button" onClick={() => moveToWishlist(item.id, item.product)} className={LINK}>
                        Move to wishlist
                      </button>
                    )}
                    <button type="button" onClick={() => removeFromCart(item.id)} className={LINK} aria-label={`Remove ${item.product.name} from bag`}>
                      Remove
                    </button>
                  </div>
                </div>
                {capNote && <p className="mt-1 text-[11.5px] leading-4 text-ink-muted">{capNote}</p>}
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
    <div className="flex flex-col items-center text-center px-6 w-full max-w-sm mx-auto">
      <BagIcon className="w-8 h-8 text-ink" />
      <Heading className="mt-5 font-display text-[23px] leading-7 text-ink">Your bag is empty</Heading>
      <p className="mt-2 text-[13px] leading-5 text-ink-muted">Add a style you like and it will wait here until you are ready to check out.</p>
      <button onClick={() => { onDone?.(); navigateToCategory('All'); }} className="mt-6 sag-btn-primary w-full">
        Start shopping
      </button>
      {wishlist.length > 0 && (
        <button onClick={() => { onDone?.(); setActivePage('wishlist'); }} className="mt-3 sag-btn-outline w-full gap-2">
          <HeartIcon className="w-4 h-4" live={false} /> View wishlist ({wishlist.length})
        </button>
      )}
    </div>
  );
};

/** Free-delivery and combo nudges, built only from the store's real settings. */
const BagNudges: React.FC = () => {
  const { cartSubtotal, shippingFee, freeShippingThreshold, comboDiscount, comboOffer, comboPieces = 0 } = useShop();
  const toFreeShipping = freeShippingThreshold > 0 && shippingFee > 0 ? freeShippingThreshold - cartSubtotal : 0;
  const unlocked = freeShippingThreshold > 0 && shippingFee === 0 && cartSubtotal >= freeShippingThreshold;
  const comboLeft = comboOffer && comboDiscount === 0 && comboPieces < comboOffer.minItems ? comboOffer.minItems - comboPieces : 0;
  if (!comboLeft && toFreeShipping <= 0 && !unlocked && !(comboOffer && comboDiscount > 0)) return null;
  const progress = freeShippingThreshold > 0 ? Math.min(100, Math.round((cartSubtotal / freeShippingThreshold) * 100)) : 0;
  const divider = toFreeShipping > 0 || unlocked ? 'pt-2.5 border-t border-line' : '';
  return (
    <div className="sag-glass px-3.5 py-3 space-y-2.5 text-[13px] leading-[18px] text-ink">
      {toFreeShipping > 0 && (
        <div>
          <p className="flex items-center gap-2.5">
            <TruckIcon className="w-[18px] h-[18px] shrink-0 text-sale" mono live={false} />
            <span>Add <span className="font-semibold sag-num">{inr(toFreeShipping)}</span> more for free delivery</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-[color:var(--sag-glass-strong)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress to free delivery">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {unlocked && (
        <p className="flex items-center gap-2.5 font-medium">
          <TruckIcon className="w-[18px] h-[18px] shrink-0 text-sale" mono live={false} />
          <span>You have unlocked free delivery</span>
        </p>
      )}
      {comboLeft > 0 && comboOffer && (
        <p className={`flex items-center gap-2.5 ${divider}`}>
          <TagIcon className="w-[18px] h-[18px] shrink-0 text-sale" mono live={false} />
          <span>Add {comboLeft} more {comboLeft === 1 ? 'outfit' : 'outfits'} to save <span className="font-semibold">{comboOffer.percent}%</span> on your bag</span>
        </p>
      )}
      {comboOffer && comboDiscount > 0 && (
        <p className={`flex items-center gap-2.5 font-medium ${divider}`}>
          <TagIcon className="w-[18px] h-[18px] shrink-0 text-sale" mono live={false} />
          <span>Combo offer applied · <span className="text-sale">{comboOffer.percent}% off</span></span>
        </p>
      )}
    </div>
  );
};

/** Coupon field + price breakdown. Totals are a preview; the server recalculates at checkout. */
export const CartTotals: React.FC<{ idPrefix?: string }> = ({ idPrefix = 'bag' }) => {
  const { discountAmount, appliedCoupon, removeCoupon, coupons = [], setIsCouponDrawerOpen } = useShop();
  const [code, setCode] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const { apply: applyCode, applying: applyingCode, error: couponError, clearError } = useCouponApply();
  const applying = Boolean(applyingCode);
  // The bag page and the bag drawer can be in the page together: each gets its own ids
  const couponId = `${idPrefix}-coupon`;
  const panelId = `${idPrefix}-coupon-panel`;
  const errorId = `${idPrefix}-coupon-error`;

  const apply = async (value: string) => {
    if (!value.trim() || applying) return;
    const ok = await applyCode(value);
    if (ok) setCode('');
  };

  const couponValue = (c: (typeof coupons)[number]) => (c.discountType === 'fixed' ? `₹${c.discountValue} off` : `${c.discountValue}% off`);
  const chip = (c: (typeof coupons)[number]) => (
    <button key={c.id} type="button" onClick={() => apply(c.code)} disabled={applying}
      className="inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full border border-[color:var(--sag-edge)] bg-[color:var(--sag-glass)] text-[12.5px] leading-[18px] cursor-pointer hover:border-brand transition-colors disabled:opacity-60"
      aria-label={`Apply coupon ${c.code}, ${couponValue(c)}`}>
      <span className="font-semibold tracking-[0.04em] text-ink">{c.code}</span>
      <span className="font-medium text-sale">{couponValue(c)}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <BagNudges />

      {appliedCoupon ? (
        <div className="sag-glass flex items-center justify-between gap-3 px-3.5 min-h-[52px] text-[13.5px] leading-5 text-ink">
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <Check className="w-[18px] h-[18px] shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate">Code <span className="font-semibold">{appliedCoupon.code}</span> applied</span>
              {discountAmount > 0 && <span className="block text-[11.5px] leading-4 text-sale sag-num">You save {inr(discountAmount)}</span>}
            </span>
          </span>
          <button onClick={removeCoupon} aria-label="Remove coupon" className={`${LINK} shrink-0`}>Remove</button>
        </div>
      ) : (
        <div className="sag-glass">
          <div className="flex items-center gap-2 pr-3.5">
            <button type="button" onClick={() => setCouponOpen((open) => !open)} aria-expanded={couponOpen} aria-controls={panelId}
              className="flex-1 min-w-0 flex items-center gap-2.5 min-h-[48px] pl-3.5 text-left text-[13.5px] leading-5 text-ink cursor-pointer">
              <span className="shrink-0 text-sale"><TagIcon className="w-[18px] h-[18px]" mono live={false} /></span>
              <span className="flex-1">Apply coupon</span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-ink-muted transition-transform ${couponOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          {!couponOpen && coupons.length > 0 && (
            <div className="px-3.5 pb-3 -mt-0.5">{chip(coupons[0])}</div>
          )}
          <div id={panelId} className={couponOpen ? 'px-3.5 pb-3.5' : 'hidden'}>
            <form onSubmit={(e) => { e.preventDefault(); apply(code); }} className="flex gap-2">
              <label htmlFor={couponId} className="sr-only">Coupon code</label>
              <input id={couponId} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (couponError) clearError(); }} aria-invalid={couponError ? true : undefined} aria-describedby={couponError ? errorId : undefined} placeholder="Enter coupon code" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                className="sag-input sag-caps flex-1 min-w-0 h-12 aria-[invalid=true]:border-danger! uppercase placeholder:normal-case" />
              <button type="submit" disabled={applying || !code.trim()} className="sag-btn-outline h-12 min-w-[84px] px-4">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-label="Applying" /> : 'Apply'}
              </button>
            </form>
            {coupons.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                {coupons.slice(0, 3).map(chip)}
                <button type="button" onClick={() => setIsCouponDrawerOpen(true)} className={LINK}>
                  View all offers
                </button>
              </div>
            )}
          </div>
          {/* Shown whether the field is open or the shopper tapped the coupon chip */}
          <CouponError id={errorId} message={couponError} className={couponOpen ? 'px-3.5 pb-3.5 -mt-1.5' : 'px-3.5 pb-3'} />
        </div>
      )}

      <div className="sag-glass p-4">
        <PriceDetails />
      </div>
    </div>
  );
};
