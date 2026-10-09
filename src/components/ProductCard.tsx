import React, { useEffect, useMemo, useRef, useState } from 'react';
import { preloadImage } from '../utils/pageTransition';
import { Product, ProductSize } from '../types';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { Check, Heart, Plus, Star, X } from 'lucide-react';
import { getCleanImageUrl, productPhoto, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';

interface ProductCardProps {
  product: Product;
  /** Compact cards are used in horizontal scrollers. */
  compact?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, compact = false }) => {
  const { isInWishlist, toggleWishlist, navigateToProduct, addToCart, cart, setIsCartDrawerOpen } = useShop();
  const { reviewsList = [] } = useAdmin();
  const [picking, setPicking] = useState(false);
  // Stays "Added" for as long as this style is in the bag (not a timed flash)
  const justAdded = cart.some((item) => String(item.product?.id) === String(product.id));

  // One heart beat when the style is saved, and a short "Added" when it has just gone into the bag
  const [beat, setBeat] = useState(false);
  const [flashAdded, setFlashAdded] = useState(false);
  const wasAdded = useRef(justAdded);
  useEffect(() => {
    if (!beat) return;
    const timer = setTimeout(() => setBeat(false), 450);
    return () => clearTimeout(timer);
  }, [beat]);
  useEffect(() => {
    const before = wasAdded.current;
    wasAdded.current = justAdded;
    if (!justAdded || before) return;
    setFlashAdded(true);
    const timer = setTimeout(() => setFlashAdded(false), 1200);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const images = Array.isArray(product.images) ? product.images.filter((img) => typeof img === 'string' && img.trim()) : [];
  const primary = images[0] || product.image || ELEGANT_PLACEHOLDER_SVG;
  const secondary = images.length > 1 ? images[1] : null;
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
    return count ? { avg: sum / count, count } : null;
  }, [reviewsList, product.id]);

  const add = (size: ProductSize) => {
    addToCart(product, size, product.colors?.[0], 1, false);
    setPicking(false);
  };

  const href = `/product/${product.id}`;
  // Real links (crawlable, open in a new tab) that still navigate instantly inside the app.
  const openProduct = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
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

  return (
    <article id={`product-card-${product.id}`} className="group relative flex h-full min-w-0 flex-col">
      {/* No box: the photo, then the text under it. The heart sits on the photo's top-right corner (the watermark is top-left). */}
      <a href={href} onClick={openProduct} tabIndex={-1} aria-hidden="true" className="sag-zoom relative block aspect-[4/5] w-full shrink-0 overflow-hidden rounded-lg bg-sunken">
        <img
          src={getCleanImageUrl(primary, 480)}
          // Two columns on phones (about 170px wide), about 280px on a desktop. The phone value is kept a little
          // under the real width on purpose, so a 360-430px phone takes the 480px file (still about 2.8x sharp
          // there) instead of the 640px one, and the shop page is lighter.
          srcSet={getCleanImageUrl(primary, 480) !== getCleanImageUrl(primary, 640) ? `${getCleanImageUrl(primary, 480)} 480w, ${getCleanImageUrl(primary, 640)} 640w, ${getCleanImageUrl(primary, 828)} 828w` : undefined}
          sizes="(min-width: 1024px) 24vw, (min-width: 640px) 30vw, 34vw"
          alt={product.name}
          className={`w-full h-full rounded-none object-cover object-top ${soldOut ? 'opacity-60 grayscale-[35%]' : ''}`}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
          }}
        />
        {secondary && !soldOut && (
          <img
            src={getCleanImageUrl(secondary, compact ? 420 : 600)}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full rounded-none object-cover object-top opacity-0 group-hover:opacity-100 transition-opacity duration-700 motion-reduce:transition-none hidden md:block"
            loading="lazy"
            decoding="async"
          />
        )}
      </a>
      <button
        id={`wishlist-btn-${product.id}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!fav) setBeat(true); toggleWishlist(product); }}
        aria-label={fav ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        aria-pressed={fav}
        className="absolute top-0.5 right-0.5 w-11 h-11 flex items-center justify-center rounded-full cursor-pointer"
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink ${beat ? 'sag-beat' : ''}`}>
          <Heart className={`w-[17px] h-[17px] transition-colors duration-300 ${fav ? 'fill-accent text-accent' : ''}`} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-[5px] px-0.5 pt-3">
        {/* A real status (new, bestseller, trending, sold out), else the style's own category: a tiny quiet label */}
        {label && (
          <span className="truncate text-[10.5px] leading-[14px] font-semibold uppercase tracking-[0.2em] text-ink-muted">{label}</span>
        )}

        <h3 className="min-h-[2.76em] text-[13.5px] leading-[1.38] font-medium text-ink line-clamp-2" title={product.name}>
          <a href={href} onClick={openProduct} className="hover:underline underline-offset-2 focus-visible:underline">{product.name}</a>
        </h3>

        {/* Rating from approved reviews only; nothing is shown when there is none */}
        {rating && (
          <span className="sag-num inline-flex items-center gap-1 text-[12px] leading-4 text-ink-muted" aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`}>
            <Star className="w-3 h-3 fill-star text-star" strokeWidth={0} aria-hidden="true" />
            {rating.avg.toFixed(1)} ({rating.count})
          </span>
        )}

        <div className="sag-num flex flex-wrap items-baseline gap-x-[7px] gap-y-0.5">
          <span className={`text-[15.5px] leading-[1.2] font-semibold ${soldOut ? 'text-ink-muted' : 'text-ink'}`}>₹{price.toLocaleString('en-IN')}</span>
          {mrp > price && <span className="text-[12.5px] text-ink-muted line-through">₹{mrp.toLocaleString('en-IN')}</span>}
          {discount > 0 && <span className="text-[12px] leading-[1.2] font-semibold text-accent whitespace-nowrap">{discount}% off</span>}
        </div>

        {picking ? (
          <div className="mt-1.5 rounded-lg border border-line bg-surface p-1.5 sm:p-2" onClick={(e) => e.stopPropagation()} role="group" aria-label={`Choose a size for ${product.name}`}>
            <div className="flex items-center justify-between pl-1">
              <span className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Choose a size</span>
              <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="w-11 h-11 shrink-0 -my-1 -mr-1 rounded-full flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => add(size)}
                  className="sag-chip min-w-0 h-11 px-1 text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // The quiet row under the price (same handler, id and label as before): a thin line on top that draws in
          // emerald under the pointer, small capitals at the left and the icon at the right, 44px tall
          <button
            id={`add-to-bag-${product.id}`}
            type="button"
            disabled={soldOut}
            onClick={onQuickAdd}
            aria-label={soldOut ? `${product.name} is sold out` : justAdded ? `${product.name} is in your bag. Open bag` : `Add ${product.name} to bag`}
            // Sold out is already said by the label above the name, so the disabled control is kept for screen readers only
            className={soldOut ? 'sr-only' : 'relative mt-auto flex h-11 w-full shrink-0 items-center justify-between gap-2 whitespace-nowrap border-t border-line text-[10.5px] leading-none font-semibold uppercase tracking-[0.18em] text-brand cursor-pointer after:absolute after:left-0 after:-top-px after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-brand after:transition-transform after:duration-500 hover:after:scale-x-100 active:after:scale-x-100 motion-reduce:after:transition-none'}
          >
            {soldOut ? 'Sold out' : justAdded ? (
              <><span key={flashAdded ? 'added' : 'in-bag'} className={`min-w-0 truncate ${flashAdded ? 'sag-settle' : ''}`}>{flashAdded ? 'Added' : 'In bag · View'}</span><Check className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} aria-hidden="true" /></>
            ) : (
              <><span>Add to bag</span><Plus className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} aria-hidden="true" /></>
            )}
          </button>
        )}
      </div>
    </article>
  );
};
