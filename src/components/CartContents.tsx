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

// Emerald Heritage: a small emerald text link, and the quiet small-capitals link ("Remove", "Move to wishlist")
const LINK = 'sag-link text-[12.5px] font-semibold decoration-1 underline-offset-4';
const CAPS_LINK = 'inline-flex min-h-11 items-center text-[10.5px] leading-none font-semibold uppercase tracking-[0.18em] text-ink-muted underline decoration-control decoration-1 underline-offset-4 transition-colors hover:text-brand cursor-pointer';
const CAPS_LINK_BRAND = CAPS_LINK.replace('text-ink-muted', 'text-brand');

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
    <p className={`flex items-center gap-2 rounded-lg bg-sunken px-3.5 py-2.5 text-[13px] leading-[18px] text-ink-muted sag-num ${className}`}>
      <TagIcon className="h-4 w-4 shrink-0 text-brand" mono live={false} />
      <span><span className="font-semibold text-sale">You save <span key={totalSavings} className="sag-settle">{inr(totalSavings)}</span></span> on this order</span>
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
  const row = 'flex justify-between gap-4 py-[7px]';
  return (
    <div>
      <h3 className="sr-only">Price details</h3>
      <dl className="text-[14px] leading-5 text-ink sag-num">
        <div className={row}><dt className="text-ink-muted">Total MRP</dt><dd>{inr(totalMRP)}</dd></div>
        {catalogDiscount > 0 && <div className={row}><dt className="text-ink-muted">Discount on MRP</dt><dd className="font-semibold text-accent">−{inr(catalogDiscount)}</dd></div>}
        <div className={row}><dt className="text-ink-muted">Subtotal</dt><dd>{inr(cartSubtotal)}</dd></div>
        <div className={row}><dt className="text-ink-muted">Delivery</dt><dd>{shippingFee > 0 ? inr(shippingFee) : 'Free'}</dd></div>
        {comboDiscount > 0 && <div className={row}><dt className="text-ink-muted">Combo discount{comboOffer ? ` (${comboOffer.percent}% on ${comboOffer.minItems}+ outfits)` : ''}</dt><dd className="font-semibold text-accent">−{inr(comboDiscount)}</dd></div>}
        {discountAmount > 0 && <div className={row}><dt className="text-ink-muted">Coupon {appliedCoupon?.code}</dt><dd className="font-semibold text-accent">−{inr(discountAmount)}</dd></div>}
        {prepaidDiscount > 0 && <div className={row}><dt className="text-ink-muted">Online payment discount</dt><dd className="font-semibold text-accent">−{inr(prepaidDiscount)}</dd></div>}
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
          <dt>
            <span className="block font-display text-[21px] leading-6 font-semibold text-ink">{totalLabel}</span>
            <span className="mt-1 block text-[11.5px] leading-4 text-ink-muted">Inclusive of all taxes{shippingFee > 0 ? ' and delivery' : ''}{freeShippingThreshold > 0 && shippingFee > 0 ? ` · free delivery above ${inr(freeShippingThreshold)}` : ''}</span>
          </dt>
          <dd className="text-[21px] leading-6 font-semibold text-ink"><span key={total} className="sag-settle">{inr(total)}</span></dd>
        </div>
      </dl>
      {totalSavings > 0 && (
        <p className="mt-2.5 text-[12.5px] leading-4 font-semibold text-sale sag-num">
          You save <span key={totalSavings} className="sag-settle">{inr(totalSavings)}</span> on this order
        </p>
      )}
    </div>
  );
};

/**
 * Bag lines with quantity controls. Used by the cart drawer and the cart page.
 * Emerald Heritage: lines separated by thin lines; a 3:4 photo, the name, size and colour, a white quantity
 * box, the price at the right with the MRP struck through, and the quiet small-capitals links under them.
 */
export const CartLines: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { cart, removeFromCart, updateCartQuantity, navigateToProduct, maxQtyPerItem, toggleWishlist, isInWishlist, showToast } = useShop();
  // Saves the style to the wishlist and takes this line out of the bag (look accessories stay with their outfit)
  const moveToWishlist = (itemId: string, product: (typeof cart)[number]['product']) => {
    removeFromCart(itemId);
    if (isInWishlist(product.id)) showToast(`Moved to wishlist\n${product.name}`, 'success');
    else toggleWishlist(product);
  };
  const stepButton = 'w-[38px] h-full flex items-center justify-center rounded-md text-ink hover:bg-sunken transition-colors disabled:text-ink-faint disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer';
  return (
    <ul className="sag-stagger border-t border-line">
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
          <li key={item.id} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3.5 border-b border-line py-[18px] sm:grid-cols-[92px_minmax(0,1fr)]">
            <button
              onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
              className="sag-zoom self-start aspect-[3/4] w-full overflow-hidden rounded-md bg-sunken cursor-pointer"
              aria-label={`View ${item.product.name}`}
            >
              <img src={getCleanImageUrl(lineImage(item), 240)} alt="" width={92} height={123} className="w-full h-full object-cover object-top" loading="lazy" />
            </button>
            <div className="flex min-w-0 flex-col">
              <button
                type="button"
                onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                className="block text-left text-[14px] leading-5 font-medium text-ink line-clamp-2 cursor-pointer"
              >
                {item.product.name}
              </button>
              <p className="mt-[3px] text-[12.5px] leading-[18px] text-ink-muted">{sizeLabel(item.selectedSize)}{colour ? ` · ${colour}` : ''}</p>
              {accessory && (
                <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted line-clamp-1">Complete the look · with {outfit?.product.name || 'your outfit'}</p>
              )}
              {/* The white quantity box at the left, the price at the right with the MRP struck through */}
              <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
                <div className="inline-flex h-10 shrink-0 items-center rounded-lg border border-control bg-surface" role="group" aria-label={`Quantity of ${item.product.name}`}>
                  {/* At quantity 1 the "Remove" link under the box is the one way to take the line out */}
                  <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Decrease quantity" className={stepButton}>
                    <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                  <span className="w-7 text-center text-[14px] font-semibold text-ink sag-num" aria-live="polite">{item.quantity}</span>
                  <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= cap} aria-label="Increase quantity" className={stepButton}>
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
                <p className="min-w-0 text-right sag-num">
                  <span className="block text-[15.5px] leading-5 font-semibold text-ink">{inr(item.product.price * item.quantity)}</span>
                  {mrp > item.product.price && <span className="text-[12px] leading-4 text-ink-muted line-through">{inr(mrp * item.quantity)}</span>}
                  {off > 0 && <span className="ml-1.5 text-[12px] leading-4 font-semibold text-accent">{off}% off</span>}
                </p>
              </div>
              {capNote && <p className="mt-1.5 text-[11.5px] leading-4 text-ink-muted">{capNote}</p>}
              <div className="-mb-3 mt-0.5 flex flex-wrap items-center gap-x-4">
                <button type="button" onClick={() => removeFromCart(item.id)} className={CAPS_LINK} aria-label={`Remove ${item.product.name} from bag`}>
                  Remove
                </button>
                {canMove && (
                  <button type="button" onClick={() => moveToWishlist(item.id, item.product)} className={CAPS_LINK}>
                    Move to wishlist
                  </button>
                )}
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
      <BagIcon className="w-7 h-7 text-brand" />
      <Heading className="mt-5 font-display text-[30px] leading-[1.08] text-ink">Your bag is empty</Heading>
      <span aria-hidden="true" className="sag-orn mt-3.5"><i /></span>
      <p className="mt-3.5 text-[13.5px] leading-5 text-ink-muted">Add a style you like and it will wait here until you are ready to check out.</p>
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
    <div className="sag-glass px-4 py-3.5 space-y-2.5 text-[13px] leading-[18px] text-ink">
      {toFreeShipping > 0 && (
        <div>
          <p className="flex items-center gap-2.5">
            <TruckIcon className="w-[18px] h-[18px] shrink-0 text-sale" mono live={false} />
            <span>Add <span className="font-semibold sag-num">{inr(toFreeShipping)}</span> more for free delivery</span>
          </p>
          <div className="mt-2.5 h-[3px] rounded-full! bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress to free delivery">
            <div className="h-full rounded-full! bg-brand transition-[width] duration-700" style={{ width: `${progress}%` }} />
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
          <span>Combo offer applied · <span className="font-semibold text-accent">{comboOffer.percent}% off</span></span>
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
      className="flex w-full min-h-11 items-center gap-2.5 rounded-lg border border-dashed border-[color:var(--sag-champagne)] bg-surface px-3 py-2 text-left text-[13px] leading-[18px] text-ink-muted cursor-pointer transition-colors hover:bg-sunken active:bg-sunken disabled:opacity-60"
      aria-label={`Apply coupon ${c.code}, ${couponValue(c)}`}>
      <span className="min-w-0 break-all font-display text-[17px] leading-5 font-semibold tracking-[0.06em] text-brand">{c.code}</span>
      <span className="shrink-0 sag-num">{couponValue(c)}</span>
      <span className="ml-auto shrink-0 text-[10.5px] leading-none font-semibold uppercase tracking-[0.18em] text-brand underline decoration-1 underline-offset-4">Apply</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <BagNudges />

      {appliedCoupon ? (
        <div className="sag-glass flex items-center justify-between gap-3 px-4 min-h-[60px] text-[13.5px] leading-5 text-ink">
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <Check className="sag-tick-draw w-5 h-5 shrink-0 text-brand" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate">Code <span className="font-semibold">{appliedCoupon.code}</span> applied</span>
              {discountAmount > 0 && <span className="block text-[12px] leading-4 text-ink-muted sag-num">You save {inr(discountAmount)}</span>}
            </span>
          </span>
          <button onClick={removeCoupon} aria-label="Remove coupon" className={`${CAPS_LINK} shrink-0`}>Remove</button>
        </div>
      ) : (
        <div className="sag-glass px-4 py-3.5">
          <button type="button" onClick={() => setCouponOpen((open) => !open)} aria-expanded={couponOpen} aria-controls={panelId}
            className="flex w-full min-h-11 items-center gap-2.5 text-left text-ink cursor-pointer">
            <span className="flex-1 font-display text-[21px] leading-6 font-semibold">Apply coupon</span>
            <ChevronDown className={`w-4 h-4 shrink-0 text-ink-muted transition-transform ${couponOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {!couponOpen && coupons.length > 0 && (
            <div className="mt-1.5">{chip(coupons[0])}</div>
          )}
          <div id={panelId} className={couponOpen ? 'mt-2' : 'hidden'}>
            <form onSubmit={(e) => { e.preventDefault(); apply(code); }} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label htmlFor={couponId} className="sr-only">Coupon code</label>
              <input id={couponId} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (couponError) clearError(); }} aria-invalid={couponError ? true : undefined} aria-describedby={couponError ? errorId : undefined} placeholder="Enter coupon code" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                className="sag-input sag-caps min-w-0 h-[50px] aria-[invalid=true]:border-danger! uppercase placeholder:normal-case" />
              <button type="submit" disabled={applying || !code.trim()} className="sag-btn-outline h-[50px] min-w-[84px] px-[18px]">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-label="Applying" /> : 'Apply'}
              </button>
            </form>
            {coupons.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {coupons.slice(0, 3).map(chip)}
                <button type="button" onClick={() => setIsCouponDrawerOpen(true)} className={CAPS_LINK_BRAND}>
                  View all offers
                </button>
              </div>
            )}
          </div>
          {/* Shown whether the field is open or the shopper tapped the coupon chip */}
          <CouponError id={errorId} message={couponError} className="mt-2" />
        </div>
      )}

      <div className="sag-glass px-4 py-[18px]">
        <PriceDetails />
      </div>
    </div>
  );
};
