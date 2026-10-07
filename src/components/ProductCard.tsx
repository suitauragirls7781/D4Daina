import React, { useMemo, useState } from 'react';
import { preloadImage } from '../utils/pageTransition';
import { Product, ProductSize } from '../types';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { Check, Heart, Star, X } from 'lucide-react';
import { BagIcon } from './BrandIcons';
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
      {/* No card chrome: the photo, then the text under it. The heart sits on the photo's top-right corner (the watermark is top-left). */}
      <a href={href} onClick={openProduct} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/5] w-full shrink-0 overflow-hidden bg-sunken">
        <img
          src={getCleanImageUrl(primary, 480)}
          // Two columns on phones (about 170px wide), about 280px on a desktop. The phone value is kept a little
          // under the real width on purpose, so a 360-430px phone takes the 480px file (still about 2.8x sharp
          // there) instead of the 640px one, and the shop page is lighter.
          srcSet={getCleanImageUrl(primary, 480) !== getCleanImageUrl(primary, 640) ? `${getCleanImageUrl(primary, 480)} 480w, ${getCleanImageUrl(primary, 640)} 640w, ${getCleanImageUrl(primary, 828)} 828w` : undefined}
          sizes="(min-width: 1024px) 24vw, (min-width: 640px) 30vw, 34vw"
          alt={product.name}
          className={`w-full h-full object-cover object-top ${soldOut ? 'opacity-60 grayscale-[35%]' : ''}`}
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
            className="absolute inset-0 w-full h-full object-cover object-top opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:block"
            loading="lazy"
            decoding="async"
          />
        )}
      </a>
      <button
        id={`wishlist-btn-${product.id}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }}
        aria-label={fav ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        aria-pressed={fav}
        className="absolute top-px right-px w-11 h-11 flex items-center justify-center cursor-pointer"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/90 text-ink">
          <Heart className={`w-[15px] h-[15px] ${fav ? 'fill-current' : ''}`} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-[9px]">
        {/* A real status only (new, bestseller, trending, sold out): a small label, never a filled pill */}
        {badge && (
          <span className={`text-[10.5px] leading-[14px] font-semibold uppercase tracking-[0.16em] ${soldOut ? 'text-ink-muted' : 'text-sale'}`}>{badge}</span>
        )}

        <h3 className="text-[13px] leading-[1.35] font-normal text-ink line-clamp-2" title={product.name}>
          <a href={href} onClick={openProduct} className="hover:underline underline-offset-2 focus-visible:underline">{product.name}</a>
        </h3>

        {/* Rating from approved reviews only; nothing is shown when there is none */}
        {rating && (
          <span className="sag-num inline-flex items-center gap-1 text-[12px] leading-4 text-ink-muted" aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`}>
            <Star className="w-3 h-3 fill-star text-star" strokeWidth={0} aria-hidden="true" />
            {rating.avg.toFixed(1)} ({rating.count})
          </span>
        )}

        <div className="sag-num flex flex-wrap items-baseline gap-x-[7px] gap-y-0">
          <span className={`text-[14.5px] leading-5 font-semibold ${soldOut ? 'text-ink-muted' : 'text-ink'}`}>₹{price.toLocaleString('en-IN')}</span>
          {mrp > price && <span className="text-[12.5px] text-ink-muted line-through">₹{mrp.toLocaleString('en-IN')}</span>}
          {discount > 0 && <span className="text-[12.5px] font-medium text-sale whitespace-nowrap">{discount}% off</span>}
        </div>

        {picking ? (
          <div className="mt-1 border border-line bg-surface p-1.5 sm:p-2" onClick={(e) => e.stopPropagation()} role="group" aria-label={`Choose a size for ${product.name}`}>
            <div className="flex items-center justify-between pl-1">
              <span className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Choose a size</span>
              <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 -my-1 -mr-1 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => add(size)}
                  className="sag-chip min-w-0 h-10 px-1 border border-line text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis hover:border-ink"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // A quiet text control under the price (same handler, id and label as before), 36-40px tall so it is easy to tap
          <button
            id={`add-to-bag-${product.id}`}
            type="button"
            disabled={soldOut}
            onClick={onQuickAdd}
            aria-label={soldOut ? `${product.name} is sold out` : justAdded ? `${product.name} is in your bag. Open bag` : `Add ${product.name} to bag`}
            // Sold out is already said by the label above the name, so the disabled control is kept for screen readers only
            className={soldOut ? 'sr-only' : 'mt-auto -mb-1 self-start min-h-9 sm:min-h-10 inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] leading-4 font-medium uppercase tracking-[0.1em] text-ink hover:text-ink-muted transition-colors cursor-pointer'}
          >
            {soldOut ? 'Sold out' : justAdded ? (
              <><Check className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" /><span className="underline decoration-1 underline-offset-4">In bag · View</span></>
            ) : (
              <><BagIcon mono className="w-3.5 h-3.5" /><span className="underline decoration-1 underline-offset-4">Add to bag</span></>
            )}
          </button>
        )}
      </div>
    </article>
  );
};
