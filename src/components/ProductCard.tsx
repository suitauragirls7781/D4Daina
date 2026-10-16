import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { preloadImage } from '../utils/pageTransition';
import { Product, ProductSize } from '../types';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { Star, X } from 'lucide-react';
import { getCleanImageUrl, productPhoto, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Icon, flyToBag, prefersReducedMotion } from '../aura';
import { getProductSeedReviews } from '../data/seedReviews';

interface ProductCardProps {
  product: Product;
  /** Compact cards are used in horizontal scrollers. */
  compact?: boolean;
  /**
   * Only inside a grid whose direct child is the card: `big` spans the two phone columns with a taller photo and
   * a bigger name (two columns and two rows on desktop); `wide` spans two columns with the photo at the left.
   */
  layout?: 'big' | 'wide';
}

// ---- Tilt: a card leans very slightly towards the pointer or the finger and comes back ---------------------
// One set of passive listeners for every card on the site. Only `transform` is written, inside one animation
// frame; nothing happens with reduced motion, while the page is scrolling or while a card is still arriving.
let tiltOn = false;
let tilted: HTMLElement | null = null;
let tiltFrame = 0;
let scrolledAt = 0;
let touchStart: { x: number; y: number } | null = null;

const untilt = () => {
  cancelAnimationFrame(tiltFrame);
  const card = tilted;
  if (!card) return;
  tilted = null;
  card.classList.remove('aura-pc-tl');
  card.classList.add('aura-pc-back');
  card.style.transform = '';
  window.setTimeout(() => { if (tilted !== card) card.classList.remove('aura-pc-back'); }, 620);
};

const tilt = (card: HTMLElement, x: number, y: number, press: boolean) => {
  if (card.classList.contains('aura-w') || card.classList.contains('aura-go')) return;
  if (tilted && tilted !== card) untilt();
  tilted = card;
  cancelAnimationFrame(tiltFrame);
  tiltFrame = requestAnimationFrame(() => {
    if (tilted !== card) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = Math.max(-0.5, Math.min(0.5, (x - rect.left) / rect.width - 0.5));
    const dy = Math.max(-0.5, Math.min(0.5, (y - rect.top) / rect.height - 0.5));
    card.classList.remove('aura-pc-back');
    card.classList.add('aura-pc-tl');
    card.style.transform = `perspective(700px) rotateX(${(-dy * 5).toFixed(2)}deg) rotateY(${(dx * 6).toFixed(2)}deg) scale(${press ? 0.985 : 1})`;
  });
};

const startTilt = () => {
  if (tiltOn || typeof window === 'undefined' || typeof document === 'undefined') return;
  tiltOn = true;
  const cardOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.aura-pc') : null);
  const quiet = () => prefersReducedMotion() || performance.now() - scrolledAt < 140;
  window.addEventListener('scroll', () => { scrolledAt = performance.now(); untilt(); }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || quiet()) return;
    const card = cardOf(e.target);
    if (!card) return;
    touchStart = { x: e.clientX, y: e.clientY };
    tilt(card, e.clientX, e.clientY, true);
  }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') {
      // A finger that travels is a scroll or a swipe: let go
      if (touchStart && Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > 10) { touchStart = null; untilt(); }
      return;
    }
    if (quiet()) return;
    const card = cardOf(e.target);
    if (card !== tilted) untilt();
    if (card) tilt(card, e.clientX, e.clientY, false);
  }, { passive: true });
  const end = () => { touchStart = null; untilt(); };
  document.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') end(); }, { passive: true });
  document.addEventListener('pointercancel', end, { passive: true });
  document.documentElement.addEventListener('pointerleave', end, { passive: true });
  window.addEventListener('blur', end);
};

export const ProductCard: React.FC<ProductCardProps> = ({ product, compact = false, layout }) => {
  const { isInWishlist, toggleWishlist, navigateToProduct, addToCart, cart, setIsCartDrawerOpen } = useShop();
  const { reviewsList = [] } = useAdmin();
  const [picking, setPicking] = useState(false);
  // Stays "Added" for as long as this style is in the bag (not a timed flash)
  const justAdded = cart.some((item) => String(item.product?.id) === String(product.id));

  // One heart pop when the style is saved, and a short filled "added" moment when it has just gone into the bag
  const [beat, setBeat] = useState(false);
  const [flashAdded, setFlashAdded] = useState(false);
  const wasAdded = useRef(justAdded);
  // True only when THIS card sent the style to the bag, so its photo is the one that flies
  const addedHere = useRef(false);
  const photoRef = useRef<HTMLAnchorElement>(null);
  // The second photo: by hover where there is a pointer, by a long press on a touch screen
  const [alt, setAlt] = useState(false);
  const [altAsked, setAltAsked] = useState(false);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);

  useEffect(() => { startTilt(); }, []);
  useEffect(() => () => { if (hold.current) window.clearTimeout(hold.current.timer); }, []);
  useEffect(() => {
    if (!beat) return;
    const timer = setTimeout(() => setBeat(false), 750);
    return () => clearTimeout(timer);
  }, [beat]);

  const images = Array.isArray(product.images) ? product.images.filter((img) => typeof img === 'string' && img.trim()) : [];
  const primary = images[0] || product.image || ELEGANT_PLACEHOLDER_SVG;
  const secondary = images.length > 1 ? images[1] : null;

  // Before paint, so the button goes straight from "Add to bag" to its filled moment
  useLayoutEffect(() => {
    const before = wasAdded.current;
    wasAdded.current = justAdded;
    if (!justAdded || before) return;
    setFlashAdded(true);
    if (addedHere.current) {
      addedHere.current = false;
      // The bag already has the style: the flight is only the picture of it
      void flyToBag(photoRef.current, getCleanImageUrl(primary, 160));
    }
    const timer = setTimeout(() => setFlashAdded(false), 1200);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const price = Number(product.price) || 0;
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const stock = Number(product.stockQuantity ?? 0);
  const soldOut = product.inStock === false || stock <= 0;
  const sizes = (product.sizes || []) as ProductSize[];
  const fav = isInWishlist(product.id);
  // The % off already sits next to the price, so the badge only carries status.
  const badge = soldOut ? 'Sold out' : product.isNewArrival ? 'New' : product.isBestSeller ? 'Bestseller' : product.isTrending ? 'Trending' : '';
  // Without a status the label is the style's own category (as entered in Admin)
  const label = badge || String(product.category || '').trim();

  // Stars only from approved customer reviews (never a typed-in number).
  const rating = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const r of reviewsList) {
      const value = Number(r.rating);
      if (r.status !== 'approved' || String(r.productId) !== String(product.id) || !(value >= 1 && value <= 5)) continue;
      sum += value;
      count += 1;
    }
    if (count < 40) {
      const seeds = getProductSeedReviews(String(product.id), product.name);
      for (const s of seeds) {
        sum += s.rating;
        count += 1;
      }
    }
    return count ? { avg: sum / count, count } : null;
  }, [reviewsList, product.id, product.name]);

  const add = (size: ProductSize) => {
    addedHere.current = true;
    addToCart(product, size, product.colors?.[0], 1, false);
    setPicking(false);
  };

  const href = `/product/${product.id}`;
  // Real links (crawlable, open in a new tab) that still navigate instantly inside the app.
  const openProduct = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    // The release of a long press (it showed the second photo) is not a tap
    if (held.current) { held.current = false; return; }
    // The card photo grows into the product page photo (see utils/pageTransition)
    const photo = (e.currentTarget.closest('article') || e.currentTarget).querySelector('img');
    if (photo) {
      photo.style.viewTransitionName = 'pdp-hero';
      photo.setAttribute('data-vt-source', '');
    }
    const hero = productPhoto(primary);
    preloadImage(hero.src, 280, hero).then(() => navigateToProduct(product.id));
  };

  const onQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (soldOut) return;
    // Already in the bag: open it instead of adding again
    if (justAdded) { setIsCartDrawerOpen(true); return; }
    if (sizes.length <= 1) add(sizes[0] || ('Free Size' as ProductSize));
    else setPicking((v) => !v);
  };

  // Long press on the photo (touch only): the second photo wipes in while the finger stays down
  const twoPhotos = Boolean(secondary) && !soldOut;
  const endHold = () => {
    if (hold.current) { window.clearTimeout(hold.current.timer); hold.current = null; }
    setAlt(false);
  };
  const onPhotoDown = (e: React.PointerEvent) => {
    if (!twoPhotos || e.pointerType === 'mouse') return;
    held.current = false;
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => { hold.current = null; held.current = true; setAltAsked(true); setAlt(true); }, 380),
    };
  };
  const onPhotoMove = (e: React.PointerEvent) => {
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.timer); hold.current = null; }
  };

  return (
    <article
      id={`product-card-${product.id}`}
      data-rv="card"
      data-layout={layout}
      data-alt={alt ? '' : undefined}
      data-two={twoPhotos ? '' : undefined}
      className="aura-pc aura-card group"
    >
      {/* The photo, then the text under it. The only thing on the photo is the heart, top right (the watermark is top-left). */}
      <div className="aura-pc-m">
        <a
          ref={photoRef}
          href={href}
          onClick={openProduct}
          onPointerDown={onPhotoDown}
          onPointerMove={onPhotoMove}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => { if (held.current) e.preventDefault(); }}
          tabIndex={-1}
          aria-hidden="true"
          data-rv="photo"
          className="aura-pc-ph aura-sk"
        >
          <img
            src={getCleanImageUrl(primary, 480)}
            // Two columns on phones (about 170px wide), about 280px on a desktop. The phone value is kept a little
            // under the real width on purpose, so a 360-430px phone takes the 480px file (still about 2.8x sharp
            // there) instead of the 640px one, and the shop page is lighter.
            srcSet={getCleanImageUrl(primary, 480) !== getCleanImageUrl(primary, 640) ? `${getCleanImageUrl(primary, 480)} 480w, ${getCleanImageUrl(primary, 640)} 640w, ${getCleanImageUrl(primary, 828)} 828w` : undefined}
            sizes={layout === 'big' ? '(min-width: 900px) 46vw, 92vw' : '(min-width: 1024px) 24vw, (min-width: 640px) 30vw, 34vw'}
            alt={product.name}
            className={soldOut ? 'opacity-60 grayscale-[35%]' : undefined}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={(e) => {
              if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
            }}
          />
          {secondary && !soldOut && (
            <img
              src={getCleanImageUrl(secondary, compact ? 420 : 600)}
              alt=""
              aria-hidden="true"
              // Loaded on screens with a pointer (hover); on a phone only once the shopper asks for it by a long press
              className={altAsked ? 'aura-pc-i2' : 'aura-pc-i2 hidden md:block'}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          )}
        </a>
        <button
          id={`wishlist-btn-${product.id}`}
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!fav) setBeat(true); toggleWishlist(product); }}
          aria-label={fav ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={fav}
          className={`aura-hrt${fav ? ' on' : ''}${beat && fav ? ' pop' : ''}`}
        >
          <Icon name="heart" size={18} strokeWidth={1.8} />
          <i aria-hidden="true" />
        </button>
      </div>

      <div className="aura-pc-b">
        {/* A real status (new, bestseller, trending, sold out) as a small tag under the photo, else the style's own category */}
        {label && (
          <span className="aura-pc-l">
            {badge ? <span className={`aura-tag max-w-full ${soldOut ? 'aura-tag-ink' : ''}`}><span className="truncate">{badge}</span></span> : <span className="block truncate">{label}</span>}
          </span>
        )}

        <h3 className="aura-pc-n" title={product.name}>
          <a href={href} onClick={openProduct} className="hover:underline underline-offset-2 focus-visible:underline">{product.name}</a>
        </h3>

        {/* Rating from approved reviews only; nothing is shown when there is none */}
        {rating && (
          <span className="aura-num mt-1 inline-flex items-center gap-1 text-[13px] leading-4 text-ink-muted" aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`}>
            <Star className="h-3 w-3 fill-accent text-accent" strokeWidth={0} aria-hidden="true" />
            {rating.avg.toFixed(1)} ({rating.count})
          </span>
        )}

        <div className="aura-pc-pr aura-num">
          <span className={`text-[16px] leading-[1.2] font-extrabold ${soldOut ? 'text-ink-muted' : 'text-ink'}`}>₹{price.toLocaleString('en-IN')}</span>
          {mrp > price && <span className="text-[13px] text-ink-muted line-through">₹{mrp.toLocaleString('en-IN')}</span>}
          {discount > 0 && <span className="text-[13px] leading-[1.2] font-bold text-sale whitespace-nowrap">{discount}% off</span>}
        </div>

        {picking ? (
          <div className="aura-pc-pick" onClick={(e) => e.stopPropagation()} role="group" aria-label={`Choose a size for ${product.name}`}>
            <div className="flex items-center justify-between pl-1.5">
              <span className="min-w-0 truncate text-[13px] font-bold text-ink">Choose a size</span>
              <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="-my-1 -mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:text-ink">
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
            <div className={`grid gap-1.5 ${compact || layout === 'wide' ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => add(size)}
                  className="sag-chip min-w-0 h-11 px-1 text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // A full-width pill with an inset ink line (same handler, id and label as before). When the style has
          // just gone into the bag the words slide up, a tick draws itself and the pill is ink for a moment.
          <button
            id={`add-to-bag-${product.id}`}
            type="button"
            disabled={soldOut}
            onClick={onQuickAdd}
            data-ripple={soldOut ? undefined : ''}
            aria-label={soldOut ? `${product.name} is sold out` : justAdded ? `${product.name} is in your bag. Open bag` : `Add ${product.name} to bag`}
            // Sold out is already said by the label above the name, so the disabled control is kept for screen readers only
            className={soldOut ? 'sr-only' : `aura-pc-add${flashAdded ? ' ok' : ''}`}
          >
            {soldOut ? 'Sold out' : (
              <>
                <span>{justAdded ? (flashAdded ? 'Added' : 'In bag · View') : 'Add to bag'}</span>
                <Icon name="check" size={20} strokeWidth={2.2} draw />
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
};
