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
    <article id={`product-card-${product.id}`} className="group relative grid grid-cols-[42%_minmax(0,1fr)] sm:flex sm:flex-col h-full overflow-hidden rounded-[20px] bg-white shadow-[var(--sag-shadow)]">
      {/* Phones: a row, photo left and details right, with the heart at the row's top-right corner.
          From tablet width: photo on top, and the heart sits on the photo's top-right corner (the watermark is top-left). */}
      <a href={href} onClick={openProduct} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/5] w-full overflow-hidden bg-sunken">
        <img
          src={getCleanImageUrl(primary, compact ? 420 : 600)}
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
        className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center cursor-pointer"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken sm:bg-white text-accent sm:shadow-[0_1px_4px_rgba(34,27,51,0.16)]">
          <Heart className={`w-[18px] h-[18px] ${fav ? 'fill-accent' : ''}`} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      <div className="flex flex-col flex-1 min-w-0 py-3 pr-3 pl-3 sm:px-2.5 sm:pt-2.5 sm:pb-2.5">
        <div className="flex items-center min-h-[22px] mb-1 pr-10 sm:pr-0">
          {badge ? (
            <span className={`sag-badge ${soldOut ? 'text-ink-muted' : product.isBestSeller && !product.isNewArrival ? 'bg-accent-tint text-accent' : 'bg-ink text-white'}`}>
              {badge}
            </span>
          ) : (
            <span className="min-w-0 truncate text-xs text-ink-muted">{product.category}</span>
          )}
        </div>

        <h3 className="text-[13px] leading-[17px] font-bold sm:font-semibold text-ink sm:line-clamp-2 sm:min-h-[34px]" title={product.name}>
          <a href={href} onClick={openProduct} className="hover:underline underline-offset-2 focus-visible:underline">{product.name}</a>
        </h3>

        {rating && (
          <div className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-ink-muted" aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`}>
            <span className="inline-flex items-center gap-0.5 rounded-md bg-ok px-1.5 text-[11px] font-bold leading-[18px] text-white">
              {rating.avg.toFixed(1)} <Star className="w-2.5 h-2.5 fill-white text-white" aria-hidden="true" />
            </span>
            <span>({rating.count})</span>
          </div>
        )}

        <div className="sag-num flex items-baseline gap-x-1.5 gap-y-0 flex-wrap mt-auto pt-1">
          <span className={`text-[17px] leading-5 font-extrabold ${soldOut ? 'text-ink-muted' : 'text-ink'}`}>₹{price.toLocaleString('en-IN')}</span>
          {mrp > price && <span className="text-[13px] text-ink-faint line-through">₹{mrp.toLocaleString('en-IN')}</span>}
          {discount > 0 && <span className="text-[13px] font-bold text-sale whitespace-nowrap">{discount}% off</span>}
        </div>

        {picking ? (
          <div className="mt-2 rounded-control bg-page border border-line p-2" onClick={(e) => e.stopPropagation()} role="group" aria-label={`Choose a size for ${product.name}`}>
            <div className="flex items-center justify-between pl-1">
              <span className="text-[13px] font-semibold text-ink">Choose a size</span>
              <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="w-11 h-11 -my-1 -mr-1 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => add(size)}
                  className="sag-chip min-w-0 h-11 px-1 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis hover:bg-ink hover:border-ink hover:text-white"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            id={`add-to-bag-${product.id}`}
            type="button"
            disabled={soldOut}
            onClick={onQuickAdd}
            aria-label={soldOut ? `${product.name} is sold out` : justAdded ? `${product.name} is in your bag. Open bag` : `Add ${product.name} to bag`}
            className={`mt-2 w-full h-10 rounded-full text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
              soldOut
                ? 'bg-sunken-deep text-ink-muted cursor-not-allowed'
                : justAdded
                ? 'bg-ok-tint text-ok border border-ok-line cursor-pointer'
                : 'bg-white text-brand border-[1.5px] border-brand hover:bg-brand-wash cursor-pointer'
            }`}
          >
            {soldOut ? 'Sold out' : justAdded ? <><Check className="w-4 h-4" /> In bag · View</> : <><BagIcon mono className="w-4 h-4" /> Add to bag</>}
          </button>
        )}
      </div>
    </article>
  );
};
