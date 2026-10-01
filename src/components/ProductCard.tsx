import React, { useMemo, useState } from 'react';
import { preloadImage } from '../utils/pageTransition';
import { Product, ProductSize } from '../types';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { Check, Star, X } from 'lucide-react';
import { BagIcon } from './BrandIcons';
import { HeartIcon } from './StoreIcons';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';

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
    preloadImage(getCleanImageUrl(primary, 1100)).then(() => navigateToProduct(product.id));
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
    <article
      id={`product-card-${product.id}`}
      className="group relative flex flex-col h-full bg-white rounded-2xl border border-[#4B1D3F]/10 overflow-hidden transition-shadow duration-300 hover:shadow-[0_14px_32px_-18px_rgba(42,26,38,0.35)]"
    >
      <a href={href} onClick={openProduct} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/5] w-full overflow-hidden bg-[#F3EEF8]">
        <img
          src={getCleanImageUrl(primary, compact ? 420 : 600)}
          alt={product.name}
          className={`w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03] ${soldOut ? 'opacity-60 grayscale-[35%]' : ''}`}
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
            className="absolute inset-0 w-full h-full object-cover object-top opacity-0 group-hover:opacity-100 transition-opacity duration-500 hidden md:block"
            loading="lazy"
            decoding="async"
          />
        )}
      </a>

      <div className={`flex flex-col flex-1 ${compact ? 'p-3 gap-1.5' : 'p-3 sm:p-4 gap-1.5 sm:gap-2'}`}>
        <div className="flex items-center justify-between gap-2 min-h-9">
          {badge ? (
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold tracking-[0.08em] uppercase whitespace-nowrap ${
              soldOut ? 'bg-[#2A1A26]/[0.06] text-[#2A1A26]/70' : product.isBestSeller && !product.isNewArrival ? 'bg-[#F7E4EA] text-[#8A2E55]' : 'bg-[#F3EEF8] text-[#4B1D3F]'
            }`}>
              {badge}
            </span>
          ) : (
            <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.16em] text-[#9C7A45]">{product.category}</span>
          )}
          <button
            id={`wishlist-btn-${product.id}`}
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }}
            aria-label={fav ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            aria-pressed={fav}
            className={`w-9 h-9 -mr-1.5 shrink-0 rounded-full flex items-center justify-center transition-colors cursor-pointer ${fav ? 'bg-[#F7E4EA]' : 'hover:bg-[#F7E4EA]'}`}
          >
            <HeartIcon className="w-5 h-5" mono={!fav} live={fav} />
          </button>
        </div>

        <h3 className={`font-serif text-[#2A1A26] leading-snug line-clamp-2 ${compact ? 'text-[15px] min-h-[40px]' : 'text-[15px] sm:text-[17px] min-h-[40px] sm:min-h-[46px]'}`} title={product.name}>
          <a href={href} onClick={openProduct} className="hover:text-[#4B1D3F] focus-visible:underline">{product.name}</a>
        </h3>

        {rating && (
          <div className="flex items-center gap-1 text-xs text-[#2A1A26]/70" aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}`}>
            <Star className="w-3.5 h-3.5 fill-[#C5A46D] text-[#C5A46D]" aria-hidden="true" />
            <span className="font-semibold text-[#2A1A26]">{rating.avg.toFixed(1)}</span>
            <span>({rating.count})</span>
          </div>
        )}

        <div className="flex items-baseline gap-x-1.5 gap-y-0 flex-wrap mt-auto pt-0.5">
          <span className={`font-semibold tabular-nums ${soldOut ? 'text-[#2A1A26]/60' : 'text-[#4B1D3F]'} ${compact ? 'text-[15px]' : 'text-[15px] sm:text-[17px]'}`}>₹{price.toLocaleString('en-IN')}</span>
          {mrp > price && <span className="text-xs text-[#2A1A26]/55 line-through tabular-nums">₹{mrp.toLocaleString('en-IN')}</span>}
          {discount > 0 && <span className="text-xs font-semibold text-[#8A2E55] whitespace-nowrap">{discount}% off</span>}
        </div>

        {picking ? (
          <div className="rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/10 p-2" onClick={(e) => e.stopPropagation()} role="group" aria-label={`Choose a size for ${product.name}`}>
            <div className="flex items-center justify-between pl-1 mb-1.5">
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[#2A1A26]/70">Pick a size</span>
              <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="w-8 h-8 -my-1 rounded-full flex items-center justify-center text-[#2A1A26]/65 hover:bg-[#F3EEF8] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => add(size)}
                  className="min-w-0 h-9 px-1 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-medium text-[#2A1A26] whitespace-nowrap overflow-hidden text-ellipsis hover:border-[#4B1D3F] hover:bg-[#4B1D3F] hover:text-white transition-colors cursor-pointer"
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
            aria-label={soldOut ? `${product.name} is sold out` : justAdded ? `${product.name} is in your bag. Open bag` : `Quick add ${product.name}`}
            className={`w-full h-10 rounded-full text-[11px] sm:text-xs font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-1.5 transition-colors ${
              soldOut
                ? 'bg-[#2A1A26]/[0.05] text-[#2A1A26]/60 cursor-not-allowed'
                : justAdded
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer'
                : 'bg-[#F3EEF8] text-[#4B1D3F] hover:bg-[#4B1D3F] hover:text-white cursor-pointer'
            }`}
          >
            {soldOut ? 'Sold out' : justAdded ? <><Check className="w-4 h-4" /> Added{!compact && <span className="hidden sm:inline">&nbsp;· View bag</span>}</> : <><BagIcon mono live={false} className="w-4 h-4" /> Quick add</>}
          </button>
        )}
      </div>
    </article>
  );
};
