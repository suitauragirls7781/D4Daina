import { lineImage } from '../utils/lineImage';
import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { isAccessory, outfitQtyIn } from '../utils/looks';
import { HeartIcon, TagIcon, TruckIcon } from './StoreIcons';
import { assuranceLine } from './Assurance';
import { Icon, Odometer, prefersReducedMotion } from '../aura';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Size M", or "One size" for free-size pieces. */
const sizeLabel = (size?: string) => (!size || /^(free ?size|one ?size|standard)$/i.test(String(size)) ? 'One size' : `Size ${size}`);

// Aura: the small quiet link under a line ("Remove", "Move to wishlist")
const MINI_LINK = 'abag-mini';

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

/** The small blush notice on top of the bag: "You save ₹X on this order". Not shown when nothing is saved. */
export const SavingsStrip: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { totalSavings } = useBagSavings();
  if (!(totalSavings > 0)) return null;
  return (
    <p className={`abag-note aura-num ${className}`}>
      <TagIcon className="h-[18px] w-[18px] shrink-0" mono live={false} />
      <span><span className="font-bold text-sale">You save <Odometer value={inr(totalSavings)} roll={false} /></span> on this order</span>
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
    <p id={id} role="alert" className={`${className} flex items-start gap-1.5 text-[14px] leading-5 font-medium text-danger`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.6} aria-hidden="true" /><span>{message}</span>
    </p>
  ) : null
);

/**
 * Price breakdown: the same rows and words in the bag, the bag drawer and checkout.
 * A preview built from the shop's own totals; the server recalculates everything before payment.
 * Plain rows, reductions in dark rose, a hairline above the total in big bold type; the numbers roll when they
 * change. totalLabel only renames the last row ("To pay" at checkout).
 */
export const PriceDetails: React.FC<{ totalLabel?: string }> = ({ totalLabel = 'Total' }) => {
  const {
    cartSubtotal, shippingFee, discountAmount, appliedCoupon, prepaidDiscount, comboDiscount, comboOffer, freeShippingThreshold,
  } = useShop();
  const total = useBagTotal();
  const { totalMRP, catalogDiscount, totalSavings } = useBagSavings();
  const roll = (value: string) => <Odometer value={value} roll={false} />;
  return (
    <div>
      <h3 className="abag-pdt-h">Price details</h3>
      <dl className="abag-rows">
        <div><dt>Total MRP</dt><dd>{roll(inr(totalMRP))}</dd></div>
        {catalogDiscount > 0 && <div className="sv"><dt>Discount on MRP</dt><dd>{roll(`−${inr(catalogDiscount)}`)}</dd></div>}
        <div><dt>Subtotal</dt><dd>{roll(inr(cartSubtotal))}</dd></div>
        <div><dt>Delivery</dt><dd>{shippingFee > 0 ? roll(inr(shippingFee)) : 'Free'}</dd></div>
        {comboDiscount > 0 && <div className="sv"><dt>Combo discount{comboOffer ? ` (${comboOffer.percent}% on ${comboOffer.minItems}+ outfits)` : ''}</dt><dd>{roll(`−${inr(comboDiscount)}`)}</dd></div>}
        {discountAmount > 0 && <div className="sv"><dt>Coupon {appliedCoupon?.code}</dt><dd>{roll(`−${inr(discountAmount)}`)}</dd></div>}
        {prepaidDiscount > 0 && <div className="sv"><dt>Online payment discount</dt><dd>{roll(`−${inr(prepaidDiscount)}`)}</dd></div>}
        <div className="tt">
          <dt>
            <span className="block">{totalLabel}</span>
            <span className="mt-1 block text-[13px] leading-[18px] font-normal text-ink-muted">Inclusive of all taxes{shippingFee > 0 ? ' and delivery' : ''}{freeShippingThreshold > 0 && shippingFee > 0 ? ` · free delivery above ${inr(freeShippingThreshold)}` : ''}</span>
          </dt>
          <dd><Odometer value={inr(total)} /></dd>
        </div>
      </dl>
      {totalSavings > 0 && (
        <p className="mt-2.5 text-[14px] leading-5 font-bold text-sale aura-num">
          You save <Odometer value={inr(totalSavings)} roll={false} /> on this order
        </p>
      )}
    </div>
  );
};

/**
 * One bag line: a white card over a rose layer. On a touch screen the card can be dragged to the left; past
 * the threshold the line leaves (the same remove handler as the "Remove" link, which stays in the card, so
 * nothing depends on the gesture). A line that leaves folds away first, then the handler runs.
 * The drag writes only a transform, straight on the element (no React state while the finger moves).
 */
const SwipeRow: React.FC<{
  nudge: boolean;
  onSwipedOut: () => void;
  children: (leave: (then: () => void) => void) => React.ReactNode;
}> = ({ nudge, onSwipedOut, children }) => {
  const row = useRef<HTMLLIElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; on: boolean } | null>(null);
  const swiped = useRef(false);
  const gone = useRef(false);
  // The class list is fixed for the life of the row, so the classes the gesture adds are never wiped by a re-render
  const [rowClass] = useState(() => `abag-l${nudge ? ' nudge' : ''}`);

  const leave = (then: () => void) => {
    if (gone.current) return;
    gone.current = true;
    const el = row.current;
    if (!el || prefersReducedMotion()) { then(); return; }
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add('out');
    el.style.height = '0px';
    window.setTimeout(then, 460);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || gone.current) return;
    if ((e.target as HTMLElement).closest('.abag-qty')) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return;
      d.on = true;
      card.current?.classList.add('dg');
      row.current?.classList.remove('nudge');
      row.current?.classList.add('rev');
    }
    d.dx = Math.min(0, dx);
    if (card.current) card.current.style.transform = `translate3d(${d.dx}px,0,0)`;
  };
  const onEnd = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = card.current;
    if (!el) return;
    el.classList.remove('dg');
    if (!d.on) return;
    // The tap that ends a drag must not open the product
    swiped.current = true;
    window.setTimeout(() => { swiped.current = false; }, 350);
    if (d.dx < -110) {
      el.style.transform = 'translate3d(-110%,0,0)';
      leave(onSwipedOut);
    } else {
      el.style.transform = '';
      const r = row.current;
      window.setTimeout(() => r?.classList.remove('rev'), 520);
    }
  };

  return (
    <li ref={row} className={rowClass}>
      <div className="abag-x" aria-hidden="true"><Icon name="trash" size={20} />Remove</div>
      <div
        ref={card}
        className="abag-in"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onPointerLeave={onEnd}
        onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); } }}
      >
        {children(leave)}
      </div>
    </li>
  );
};

/**
 * Bag lines with quantity controls. Used by the cart drawer and the cart page.
 * Aura: each line a white 22px card: a 3:4 photo, the name, size and colour, the line price and a pill
 * quantity control whose numbers roll, and the quiet "Remove" / "Move to wishlist" links under them.
 */
export const CartLines: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { cart, removeFromCart, updateCartQuantity, navigateToProduct, maxQtyPerItem, toggleWishlist, isInWishlist, showToast } = useShop();
  // Saves the style to the wishlist and takes this line out of the bag (look accessories stay with their outfit)
  const moveToWishlist = (itemId: string, product: (typeof cart)[number]['product']) => {
    removeFromCart(itemId);
    if (isInWishlist(product.id)) showToast(`Moved to wishlist\n${product.name}`, 'success');
    else toggleWishlist(product);
  };
  // Display only: the first line shows once, on a touch screen, that it can be swiped
  const [nudgeId] = useState(() => cart[0]?.id);
  return (
    <ul>
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
          <SwipeRow key={item.id} nudge={item.id === nudgeId} onSwipedOut={() => removeFromCart(item.id)}>
            {(leave) => (
              <>
                <button
                  onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                  className="abag-ph"
                  aria-label={`View ${item.product.name}`}
                >
                  <img src={getCleanImageUrl(lineImage(item), 240)} alt="" width={84} height={112} loading="lazy" draggable={false} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col pt-1 pr-0.5">
                  <button
                    type="button"
                    onClick={() => { navigateToProduct(openId); onNavigate?.(); }}
                    className="abag-nm"
                  >
                    {item.product.name}
                  </button>
                  <p className="abag-sm mt-[3px]">{sizeLabel(item.selectedSize)}{colour ? ` · ${colour}` : ''}</p>
                  {accessory && (
                    <p className="abag-sm line-clamp-1">Complete the look · with {outfit?.product.name || 'your outfit'}</p>
                  )}
                  {/* The line price at the left (the MRP struck through under it), the pill quantity control at the right */}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                    <p className="min-w-0 aura-num">
                      <Odometer value={inr(item.product.price * item.quantity)} roll={false} className="abag-pr" />
                      {mrp > item.product.price && (
                        <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted">
                          <span className="line-through">{inr(mrp * item.quantity)}</span>
                          {off > 0 && <span className="ml-1.5 inline-block whitespace-nowrap font-bold text-sale">{off}% off</span>}
                        </span>
                      )}
                    </p>
                    <div className="abag-qty" role="group" aria-label={`Quantity of ${item.product.name}`}>
                      {/* At quantity 1 the "Remove" link under the line is the one way to take it out */}
                      <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Decrease quantity">
                        <Icon name="minus" size={16} />
                      </button>
                      <span aria-live="polite"><Odometer value={item.quantity} roll={false} /></span>
                      <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= cap} aria-label="Increase quantity">
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </div>
                  {capNote && <p className="abag-sm mt-1.5">{capNote}</p>}
                  <div className="-mb-1.5 flex flex-wrap items-center gap-x-4">
                    <button type="button" onClick={() => leave(() => removeFromCart(item.id))} className={MINI_LINK} aria-label={`Remove ${item.product.name} from bag`}>
                      Remove
                    </button>
                    {canMove && (
                      <button type="button" onClick={() => leave(() => moveToWishlist(item.id, item.product))} className={MINI_LINK}>
                        Move to wishlist
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </SwipeRow>
        );
      })}
    </ul>
  );
};

/** Empty bag: one big bold line and one clear next step, plus the wishlist when it really has styles. */
export const EmptyBag: React.FC<{ onDone?: () => void; heading?: 'h1' | 'h2' }> = ({ onDone, heading = 'h2' }) => {
  const { navigateToCategory, setActivePage, wishlist = [] } = useShop();
  const Heading = heading;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center px-6 text-center">
      {/* Aura Kinetic: the bag draws itself and settles */}
      <span className="kx-drawn kx-emptybag" aria-hidden="true"><Icon name="bag" size={40} strokeWidth={1.4} /></span>
      <Heading className="abag-empty-h">Your bag is empty</Heading>
      <p className="mt-3 text-[15px] leading-[1.5] text-ink-muted">Add a style you like and it will wait here until you are ready to check out.</p>
      <button onClick={() => { onDone?.(); navigateToCategory('All'); }} className="aura-btn aura-btn-w mt-6">
        Start shopping <Icon name="arrow" />
      </button>
      {wishlist.length > 0 && (
        <button onClick={() => { onDone?.(); setActivePage('wishlist'); }} className="aura-btn aura-btn-line aura-btn-w mt-2.5">
          <HeartIcon className="w-[18px] h-[18px]" live={false} /> View wishlist ({wishlist.length})
        </button>
      )}
    </div>
  );
};

/**
 * The facts the bag has always closed with ("Secure online payment · 7-day returns & exchange"), as small
 * sand and blush tiles. The words are the store's own line from Assurance.tsx; nothing is added.
 */
export const BagFacts: React.FC<{ className?: string }> = ({ className = '' }) => (
  <ul className={`abag-facts ${className}`}>
    {assuranceLine().split(' · ').map((fact, index) => (
      <li key={fact}><Icon name={index === 0 ? 'lock' : 'returns'} size={22} />{fact}</li>
    ))}
  </ul>
);

/** Free-delivery and combo nudges, built only from the store's real settings. */
const BagNudges: React.FC = () => {
  const { cartSubtotal, shippingFee, freeShippingThreshold, comboDiscount, comboOffer, comboPieces = 0 } = useShop();
  const toFreeShipping = freeShippingThreshold > 0 && shippingFee > 0 ? freeShippingThreshold - cartSubtotal : 0;
  const unlocked = freeShippingThreshold > 0 && shippingFee === 0 && cartSubtotal >= freeShippingThreshold;
  const comboLeft = comboOffer && comboDiscount === 0 && comboPieces < comboOffer.minItems ? comboOffer.minItems - comboPieces : 0;
  if (!comboLeft && toFreeShipping <= 0 && !unlocked && !(comboOffer && comboDiscount > 0)) return null;
  const progress = freeShippingThreshold > 0 ? Math.min(100, Math.round((cartSubtotal / freeShippingThreshold) * 100)) : 0;
  const divider = toFreeShipping > 0 || unlocked ? 'pt-3 border-t border-line rounded-none!' : '';
  return (
    <div className="aura-card px-[18px] py-4 space-y-3 text-[14.5px] leading-5 text-ink">
      {toFreeShipping > 0 && (
        <div>
          <p className="flex items-center gap-2.5">
            <TruckIcon className="w-5 h-5 shrink-0" mono live={false} />
            <span>Add <span className="font-bold aura-num">{inr(toFreeShipping)}</span> more for free delivery</span>
          </p>
          <div className="mt-3 h-1 rounded-full! bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress to free delivery">
            <div className="h-full w-full origin-left rounded-full! bg-brand transition-transform duration-700" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
      )}
      {unlocked && (
        <p className="flex items-center gap-2.5 font-semibold">
          <TruckIcon className="w-5 h-5 shrink-0" mono live={false} />
          <span>You have unlocked free delivery</span>
        </p>
      )}
      {comboLeft > 0 && comboOffer && (
        <p className={`flex items-center gap-2.5 ${divider}`}>
          <TagIcon className="w-5 h-5 shrink-0" mono live={false} />
          <span>Add {comboLeft} more {comboLeft === 1 ? 'outfit' : 'outfits'} to save <span className="font-bold">{comboOffer.percent}%</span> on your bag</span>
        </p>
      )}
      {comboOffer && comboDiscount > 0 && (
        <p className={`flex items-center gap-2.5 font-semibold ${divider}`}>
          <TagIcon className="w-5 h-5 shrink-0" mono live={false} />
          <span>Combo offer applied · <span className="font-bold text-sale">{comboOffer.percent}% off</span></span>
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
  // A real coupon of the store as a dashed pill: tapping it applies it
  const chip = (c: (typeof coupons)[number]) => (
    <button key={c.id} type="button" onClick={() => apply(c.code)} disabled={applying}
      className="abag-chip"
      aria-label={`Apply coupon ${c.code}, ${couponValue(c)}`}>
      <b>{c.code}</b>
      <span className="shrink-0 aura-num">· {couponValue(c)}</span>
    </button>
  );

  return (
    <div className="space-y-2.5">
      <BagNudges />

      {appliedCoupon ? (
        <div className="aura-card flex items-center justify-between gap-3 px-[18px] min-h-[64px] text-[15px] leading-5 text-ink">
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <Icon name="check" className="sag-tick-draw shrink-0 text-ok" strokeWidth={2} />
            <span className="min-w-0">
              <span className="block truncate">Code <span className="font-bold">{appliedCoupon.code}</span> applied</span>
              {discountAmount > 0 && <span className="block text-[13px] leading-[18px] text-ink-muted aura-num">You save {inr(discountAmount)}</span>}
            </span>
          </span>
          <button onClick={removeCoupon} aria-label="Remove coupon" className={`${MINI_LINK} shrink-0`}>Remove</button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setCouponOpen((open) => !open)} aria-expanded={couponOpen} aria-controls={panelId}
            className="flex w-full min-h-11 items-center gap-2.5 px-1 text-left text-ink cursor-pointer">
            <span className="flex-1 text-[20px] leading-6 font-extrabold tracking-[-0.02em]">Apply coupon</span>
            <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-300 ${couponOpen ? 'rotate-180' : ''}`} strokeWidth={1.6} aria-hidden="true" />
          </button>
          {!couponOpen && coupons.length > 0 && (
            <div className="mt-1">{chip(coupons[0])}</div>
          )}
          <div id={panelId} className={couponOpen ? 'mt-1.5' : 'hidden'}>
            <form onSubmit={(e) => { e.preventDefault(); apply(code); }} className="abag-cpn">
              <label htmlFor={couponId} className="sr-only">Coupon code</label>
              <input id={couponId} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (couponError) clearError(); }} aria-invalid={couponError ? true : undefined} aria-describedby={couponError ? errorId : undefined} placeholder="Enter coupon code" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                className="sag-input sag-caps px-4 font-semibold uppercase placeholder:font-normal placeholder:normal-case" />
              <button type="submit" disabled={applying || !code.trim()} className="aura-btn">
                {applying ? <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.6} aria-label="Applying" /> : 'Apply'}
              </button>
            </form>
            {coupons.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {coupons.slice(0, 3).map(chip)}
                <button type="button" onClick={() => setIsCouponDrawerOpen(true)} className="aura-lk ml-1 text-[14px]">
                  View all offers
                </button>
              </div>
            )}
          </div>
          {/* Shown whether the field is open or the shopper tapped the coupon chip */}
          <CouponError id={errorId} message={couponError} className="mt-2 px-1" />
        </div>
      )}

      <div className="abag-pdt mt-5!">
        <PriceDetails />
      </div>
    </div>
  );
};
