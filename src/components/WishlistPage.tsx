import React from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, Heart, X } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { SharedWishlistView, ShareWishlistButton, sharedWishlistId } from './SharedWishlist';
import { defaultSizeFor, sizesOf } from '../utils/looks';
import { Product, ProductSize } from '../types';
import { BagIcon } from './BrandIcons';
import { PackageIcon } from './StoreIcons';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Move to bag" under a wishlist card; styles with several sizes show the size chips first. */
const MoveToBag: React.FC<{ product: Product; onMove: (product: Product, size?: ProductSize) => void }> = ({ product, onMove }) => {
  const [choosing, setChoosing] = React.useState(false);
  const sizes = sizesOf(product);
  const single = defaultSizeFor(product);
  if (!product.inStock) {
    return (
      <p className="h-11 rounded-control bg-sunken-deep text-sm font-semibold text-ink-muted flex items-center justify-center">
        Sold out
      </p>
    );
  }
  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => (single ? onMove(product, single) : setChoosing(true))}
        className="sag-btn-outline w-full h-11 px-2 text-sm gap-1.5"
      >
        <BagIcon className="w-4 h-4" mono live={false} /> Move to bag
      </button>
    );
  }
  return (
    <div className="rounded-control border border-line bg-page p-2 sag-pop" role="group" aria-label={`Choose a size for ${product.name}`}>
      <div className="flex items-center justify-between pl-1">
        <span className="text-[13px] font-semibold text-ink">Choose a size</span>
        <button type="button" onClick={() => setChoosing(false)} aria-label="Cancel" className="w-11 h-11 -my-1 -mr-1 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onMove(product, size)}
            aria-label={`Move to bag in size ${size}`}
            className="sag-chip min-w-0 h-11 px-1 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis hover:bg-ink hover:border-ink hover:text-white"
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
};

/** One saved style: the live product (current price and stock), with nothing laid over its photo. */
const WishlistCard: React.FC<{ product: Product }> = ({ product }) => {
  const { navigateToProduct, toggleWishlist, moveToCartFromWishlist } = useShop();
  const image = product.images?.[0] || (product as { image?: string }).image || ELEGANT_PLACEHOLDER_SVG;
  const mrp = Math.max(product.price, Number(product.originalPrice) || product.price);
  const off = mrp > product.price ? Math.round((1 - product.price / mrp) * 100) : 0;
  return (
    <article className="flex flex-col h-full">
      <button
        type="button"
        onClick={() => navigateToProduct(product.id)}
        className="block aspect-[4/5] w-full rounded-control bg-sunken overflow-hidden cursor-pointer"
        aria-label={`View ${product.name}`}
      >
        {image && (
          <img
            src={getCleanImageUrl(image, 480)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            className={`w-full h-full object-cover object-top ${product.inStock ? '' : 'opacity-60 grayscale-[35%]'}`}
          />
        )}
      </button>
      <div className="flex-1 flex flex-col pt-1">
        <div className="flex items-center justify-between gap-2 min-h-11">
          {!product.inStock ? (
            <span className="sag-badge text-ink-muted">Sold out</span>
          ) : (
            <span className="min-w-0 truncate text-xs text-ink-muted">{product.category}</span>
          )}
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            aria-label={`Remove ${product.name} from wishlist`}
            title="Remove from wishlist"
            className="-mr-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-accent hover:bg-accent-tint transition-colors cursor-pointer"
          >
            <Heart className="w-[22px] h-[22px] fill-accent" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={() => navigateToProduct(product.id)} className="text-left text-sm leading-5 font-medium text-ink line-clamp-2 min-h-10 hover:underline underline-offset-2 cursor-pointer">
          {product.name}
        </button>
        <p className="sag-num mt-auto pt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className={`text-base leading-5 font-bold ${product.inStock ? 'text-ink' : 'text-ink-muted'}`}>{inr(product.price)}</span>
          {off > 0 && <span className="text-[13px] text-ink-faint line-through">{inr(mrp)}</span>}
          {off > 0 && <span className="text-[13px] font-bold text-sale whitespace-nowrap">{off}% off</span>}
        </p>
        <div className="pt-2">
          <MoveToBag product={product} onMove={moveToCartFromWishlist} />
        </div>
      </div>
    </article>
  );
};

export const WishlistPage: React.FC = () => {
  const {
    wishlist,
    toggleWishlist,
    setActivePage,
    navigateToCategory,
    products = [],
    allProducts = [],
  } = useShop();

  // Collections that really have styles in stock right now
  const collections = React.useMemo(() => {
    const counts = new Map<string, number>();
    products.filter((p) => p.inStock).forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  }, [products]);

  const sharedId = sharedWishlistId();
  if (sharedId) return <SharedWishlistView id={sharedId} />;

  if (wishlist.length === 0) {
    return (
      <div id="wishlist-empty-state" className="py-12 sm:py-20 px-4 bg-surface">
        <div className="max-w-md mx-auto text-center">
          <span className="mx-auto w-16 h-16 rounded-full bg-sunken flex items-center justify-center text-ink" aria-hidden="true">
            <Heart className="w-7 h-7" strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 font-display text-[28px] leading-8 text-ink">Your wishlist is empty</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-ink-muted">Tap the heart on any style to save it here. Saved styles stay on every device you sign in to.</p>
          <button
            id="empty-wishlist-shop-btn"
            onClick={() => navigateToCategory('All')}
            className="mt-6 sag-btn-primary w-full sm:w-auto sm:px-12"
          >
            Start shopping
          </button>

          {collections.length > 0 && (
            <div className="mt-10 text-left">
              <p className="sag-eyebrow mb-1">Browse collections</p>
              <div>
                {collections.map(([name, count]) => (
                  <button
                    key={name}
                    onClick={() => navigateToCategory(name as any)}
                    className="sag-row w-full text-left cursor-pointer hover:bg-sunken"
                  >
                    <span className="flex-1 min-w-0 truncate">{name}</span>
                    <span className="sag-num text-[13px] font-normal text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="wishlist-page-container" className="pt-4 pb-14 sm:pt-6 lg:pt-8 lg:pb-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumbs (tablet and desktop) */}
        <nav className="hidden sm:flex items-center gap-1.5 text-[13px] text-ink-muted mb-3 w-fit" aria-label="Breadcrumb">
          <button onClick={() => setActivePage('home')} className="min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
          <span className="text-ink font-medium" aria-current="page">My wishlist</span>
        </nav>

        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-x-4 gap-y-1 mb-4 sm:mb-7">
          <h1 className="font-display text-[28px] leading-8 lg:text-4xl lg:leading-[1.15] text-ink">
            My wishlist <span className="sag-num font-sans text-sm font-normal tracking-normal text-ink-muted">({wishlist.length} {wishlist.length === 1 ? 'style' : 'styles'})</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <ShareWishlistButton />
            <button onClick={() => navigateToCategory('All')} className="sag-link">
              Continue shopping
            </button>
          </div>
        </div>

        {/* Wishlist items always show the live product (current price and stock) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9">
          {wishlist.map((saved) => {
            const live = allProducts.find((p) => String(p.id) === String(saved.id));
            if (live) return <WishlistCard key={saved.id} product={live} />;
            return (
              <article key={saved.id} className="flex flex-col h-full">
                <div className="aspect-[4/5] rounded-control bg-sunken flex flex-col items-center justify-center gap-2 px-4 text-center text-ink-muted">
                  <PackageIcon className="w-7 h-7" mono live={false} />
                  <p className="text-[13px] font-semibold">No longer available</p>
                </div>
                <div className="flex-1 flex flex-col pt-3">
                  <p className="text-sm leading-5 font-medium text-ink line-clamp-2">{saved.name}</p>
                  <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">This style has left our collection.</p>
                  <div className="mt-auto pt-2">
                    <button onClick={() => toggleWishlist(saved)} className="sag-btn-outline w-full h-11 text-sm">Remove</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

      </div>
    </div>
  );
};
