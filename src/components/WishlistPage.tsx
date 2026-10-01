import React from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, ArrowRight, X } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { SharedWishlistView, ShareWishlistButton, sharedWishlistId } from './SharedWishlist';
import { defaultSizeFor, sizesOf } from '../utils/looks';
import { Product, ProductSize } from '../types';
import { BagIcon } from './BrandIcons';
import { HeartIcon, PackageIcon } from './StoreIcons';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Move to bag" under a wishlist card; styles with several sizes show the size chips first. */
const MoveToBag: React.FC<{ product: Product; onMove: (product: Product, size?: ProductSize) => void }> = ({ product, onMove }) => {
  const [choosing, setChoosing] = React.useState(false);
  const sizes = sizesOf(product);
  const single = defaultSizeFor(product);
  if (!product.inStock) {
    return (
      <p className="h-11 rounded-full bg-[#2A1A26]/[0.04] text-xs font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/55 flex items-center justify-center">
        Out of stock
      </p>
    );
  }
  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => (single ? onMove(product, single) : setChoosing(true))}
        className="sag-btn-primary w-full h-11 px-3 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 cursor-pointer"
      >
        <BagIcon className="w-4 h-4" mono live={false} /> Move to bag
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-[#4B1D3F]/15 bg-[#FBF7F3] p-2.5 space-y-2 sag-pop" role="group" aria-label={`Choose a size for ${product.name}`}>
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/70">Choose size</span>
        <button type="button" onClick={() => setChoosing(false)} aria-label="Cancel" className="w-8 h-8 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onMove(product, size)}
            aria-label={`Move to bag in size ${size}`}
            className="min-w-10 h-9 px-2.5 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#2A1A26] hover:bg-[#4B1D3F] hover:border-[#4B1D3F] hover:text-white transition-colors cursor-pointer"
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
    <article className="sag-card rounded-3xl overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => navigateToProduct(product.id)}
        className="group block aspect-[4/5] bg-[#F3EEF8] overflow-hidden cursor-pointer"
        aria-label={`View ${product.name}`}
      >
        {image && (
          <img
            src={getCleanImageUrl(image, 480)}
            alt={product.name}
            loading="lazy"
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            className={`w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04] ${product.inStock ? '' : 'grayscale-[35%]'}`}
          />
        )}
      </button>
      <div className="flex-1 flex flex-col p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 min-h-9">
          {!product.inStock ? (
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#2A1A26]/[0.06] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2A1A26]/65">Sold out</span>
          ) : off > 0 ? (
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#F7E4EA] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A2E55]">{off}% off</span>
          ) : (
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#9C7A45] truncate">{product.category}</span>
          )}
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            aria-label={`Remove ${product.name} from wishlist`}
            title="Remove from wishlist"
            className="-mr-1.5 w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[#F7E4EA] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
          >
            <HeartIcon className="w-5 h-5" live={false} />
          </button>
        </div>
        <button type="button" onClick={() => navigateToProduct(product.id)} className="mt-1 text-left font-serif text-[17px] leading-snug text-[#2A1A26] line-clamp-2 min-h-[2.75em] hover:text-[#4B1D3F] cursor-pointer">
          {product.name}
        </button>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-semibold text-[#4B1D3F] tabular-nums">{inr(product.price)}</span>
          {off > 0 && <span className="text-xs text-[#2A1A26]/50 line-through tabular-nums">{inr(mrp)}</span>}
        </p>
        <div className="mt-auto pt-3">
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
      <div id="wishlist-empty-state" className="py-16 sm:py-24 px-4 bg-[#FBF7F3]">
        <div className="max-w-xl mx-auto text-center">
          <span className="relative mx-auto w-24 h-24 rounded-full bg-[#F7E4EA] flex items-center justify-center sag-pop">
            <span aria-hidden="true" className="absolute inset-2 rounded-full border border-dashed border-[#C5A46D]/60" />
            <HeartIcon className="w-10 h-10" />
          </span>
          <h1 className="mt-6 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">Your wishlist is empty</h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#2A1A26]/70 max-w-md mx-auto">Tap the heart on any style to save it here. Saved styles stay on every device you sign in to.</p>
          <button
            id="empty-wishlist-shop-btn"
            onClick={() => navigateToCategory('All')}
            className="mt-8 sag-btn-primary h-12 px-10 text-xs font-semibold uppercase tracking-[0.16em] cursor-pointer"
          >
            Explore styles
          </button>

          {collections.length > 0 && (
            <div className="mt-12 pt-8 border-t border-[#4B1D3F]/10">
              <p className="sag-eyebrow">Browse collections</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {collections.map(([name, count]) => (
                  <button
                    key={name}
                    onClick={() => navigateToCategory(name as any)}
                    className="group p-4 rounded-2xl bg-white border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] hover:bg-[#F3EEF8] text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block font-serif text-lg leading-tight text-[#2A1A26] truncate">{name}</span>
                      <span className="block mt-0.5 text-xs text-[#2A1A26]/60">{count} {count === 1 ? 'style' : 'styles'}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#4B1D3F]/50 shrink-0 group-hover:translate-x-0.5 transition-transform" />
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
    <div id="wishlist-page-container" className="pt-6 pb-16 sm:pt-10 sm:pb-20 bg-[#FBF7F3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-xs text-[#2A1A26]/60 mb-4 w-fit" aria-label="Breadcrumb">
          <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-[#9C7A45]" aria-hidden="true" />
          <span className="text-[#4B1D3F] font-semibold" aria-current="page">My wishlist</span>
        </nav>

        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 border-b border-[#4B1D3F]/10 pb-5 sm:pb-6">
          <div>
            <span className="sag-eyebrow block">Saved for later</span>
            <h1 className="mt-1.5 font-serif text-4xl sm:text-5xl leading-none text-[#4B1D3F]">
              My wishlist <span className="align-middle font-sans text-sm font-semibold text-[#2A1A26]/60">({wishlist.length} {wishlist.length === 1 ? 'style' : 'styles'})</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ShareWishlistButton />
            <button
              onClick={() => navigateToCategory('All')}
              className="h-10 px-2 text-sm text-[#4B1D3F] font-semibold cursor-pointer inline-flex items-center gap-1.5 group hover:underline underline-offset-4"
            >
              Continue shopping
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Wishlist items always show the live product (current price and stock) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
          {wishlist.map((saved) => {
            const live = allProducts.find((p) => String(p.id) === String(saved.id));
            if (live) return <WishlistCard key={saved.id} product={live} />;
            return (
              <article key={saved.id} className="sag-card rounded-3xl overflow-hidden flex flex-col">
                <div className="aspect-[4/5] bg-[#F3EEF8] flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <span className="w-14 h-14 rounded-full bg-white flex items-center justify-center"><PackageIcon className="w-7 h-7" live={false} /></span>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/60">No longer available</p>
                </div>
                <div className="flex-1 flex flex-col p-3 sm:p-4">
                  <p className="mt-1 font-serif text-[17px] leading-snug text-[#2A1A26] line-clamp-2">{saved.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#2A1A26]/65">This style has left our collection.</p>
                  <div className="mt-auto pt-3">
                    <button onClick={() => toggleWishlist(saved)} className="sag-btn-outline w-full h-11 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Remove</button>
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
