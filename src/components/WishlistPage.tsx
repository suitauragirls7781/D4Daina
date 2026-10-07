import React from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, Heart, X } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { SharedWishlistView, ShareWishlistButton, sharedWishlistId } from './SharedWishlist';
import { defaultSizeFor, sizesOf } from '../utils/looks';
import { Product, ProductSize } from '../types';
import { PackageIcon } from './StoreIcons';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const label = 'text-[10.5px] leading-[14px] font-semibold uppercase tracking-[0.16em]';
const quietLink = 'inline-flex items-center gap-1.5 min-h-11 text-[12.5px] font-medium text-ink underline decoration-1 underline-offset-4 hover:text-ink-muted cursor-pointer';
const grid = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-[12px] gap-y-[18px] sm:gap-x-5 sm:gap-y-9';

/** "Move to bag" under a wishlist card; styles with several sizes show the size chips first. */
const MoveToBag: React.FC<{ product: Product; onMove: (product: Product, size?: ProductSize) => void }> = ({ product, onMove }) => {
  const [choosing, setChoosing] = React.useState(false);
  const sizes = sizesOf(product);
  const single = defaultSizeFor(product);
  if (!product.inStock) {
    return (
      <p className="h-[38px] border border-line text-[11.5px] font-medium uppercase tracking-[0.12em] text-ink-muted flex items-center justify-center">
        Sold out
      </p>
    );
  }
  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => (single ? onMove(product, single) : setChoosing(true))}
        className="sag-btn-outline w-full h-[38px] px-2"
      >
        Move to bag
      </button>
    );
  }
  return (
    <div className="border border-line bg-surface p-2 sag-pop" role="group" aria-label={`Choose a size for ${product.name}`}>
      <div className="flex items-center justify-between pl-1">
        <span className={`${label} text-ink-muted`}>Choose a size</span>
        <button type="button" onClick={() => setChoosing(false)} aria-label="Cancel" className="w-11 h-11 -my-1 -mr-1 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onMove(product, size)}
            aria-label={`Move to bag in size ${size}`}
            className="sag-chip min-w-0 h-10 px-1 border border-line text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis hover:border-ink"
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
};

/** One saved style: the live product (current price and stock). Only the heart (remove) sits on its photo. */
const WishlistCard: React.FC<{ product: Product }> = ({ product }) => {
  const { navigateToProduct, toggleWishlist, moveToCartFromWishlist } = useShop();
  const image = product.images?.[0] || (product as { image?: string }).image || ELEGANT_PLACEHOLDER_SVG;
  const mrp = Math.max(product.price, Number(product.originalPrice) || product.price);
  const off = mrp > product.price ? Math.round((1 - product.price / mrp) * 100) : 0;
  return (
    // No card chrome at any width: the photo, the name, the price and a small outline "Move to bag"
    <article className="relative flex h-full min-w-0 flex-col">
      <button
        type="button"
        onClick={() => navigateToProduct(product.id)}
        className="block aspect-[4/5] w-full shrink-0 bg-sunken overflow-hidden cursor-pointer"
        aria-label={`View ${product.name}`}
      >
        {image && (
          <img
            src={getCleanImageUrl(image, 480)}
            srcSet={getCleanImageUrl(image, 160) !== getCleanImageUrl(image, 480) ? `${getCleanImageUrl(image, 160)} 160w, ${getCleanImageUrl(image, 320)} 320w, ${getCleanImageUrl(image, 480)} 480w, ${getCleanImageUrl(image, 640)} 640w` : undefined}
            // Two columns on phones, three on tablets, four on a desktop (the phone value is kept a little under the
            // real width, like the product card, so a phone takes the 480px file)
            sizes="(min-width: 1024px) 24vw, (min-width: 640px) 30vw, 34vw"
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            className={`w-full h-full object-cover object-top ${product.inStock ? '' : 'opacity-60 grayscale-[35%]'}`}
          />
        )}
      </button>
      <button
        type="button"
        onClick={() => toggleWishlist(product)}
        aria-label={`Remove ${product.name} from wishlist`}
        title="Remove from wishlist"
        className="absolute top-px right-px w-11 h-11 flex items-center justify-center cursor-pointer"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/90 text-ink">
          <Heart className="w-[15px] h-[15px] fill-current" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px] pt-[9px]">
        {!product.inStock && <span className={`${label} text-ink-muted`}>Sold out</span>}
        <button type="button" onClick={() => navigateToProduct(product.id)} className="text-left text-[13px] leading-[1.35] font-normal text-ink line-clamp-2 hover:underline underline-offset-2 cursor-pointer">
          {product.name}
        </button>
        <p className="sag-num flex flex-wrap items-baseline gap-x-[7px]">
          <span className={`text-[14.5px] leading-5 font-semibold ${product.inStock ? 'text-ink' : 'text-ink-muted'}`}>{inr(product.price)}</span>
          {off > 0 && <span className="text-[12.5px] text-ink-muted line-through">{inr(mrp)}</span>}
          {off > 0 && <span className="text-[12.5px] font-medium text-sale whitespace-nowrap">{off}% off</span>}
        </p>
        <div className="mt-auto pt-1">
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
    moveToCartFromWishlist,
    showToast,
  } = useShop();

  // The saved styles as they are in the shop right now (current price and stock)
  const liveSaved = wishlist
    .map((saved) => allProducts.find((p) => String(p.id) === String(saved.id)))
    .filter(Boolean) as Product[];
  const savedTotal = liveSaved.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const canMove = liveSaved.filter((p) => p.inStock);
  // "Move all to bag": styles with one size (or none) go straight in; a style with several sizes stays here until its size is chosen
  const moveAll = () => {
    const ready = canMove.filter((p) => defaultSizeFor(p));
    const waiting = canMove.length - ready.length;
    ready.forEach((p) => moveToCartFromWishlist(p, defaultSizeFor(p) as ProductSize));
    const moved = `${ready.length} ${ready.length === 1 ? 'style' : 'styles'} moved to your bag.`;
    const choose = `Choose a size for ${waiting === 1 ? 'the remaining style' : `the remaining ${waiting} styles`} to move ${waiting === 1 ? 'it' : 'them'}.`;
    if (!ready.length) showToast(waiting === 1 ? 'Choose a size for this style to move it to your bag.' : 'Choose a size for each style to move it to your bag.', 'info');
    else showToast(waiting ? `${moved}\n${choose}` : moved, 'success');
  };

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
          <span className="mx-auto flex w-fit text-ink-muted" aria-hidden="true">
            <Heart className="w-7 h-7" strokeWidth={1.25} />
          </span>
          <h1 className="mt-5 font-display text-[23px] leading-[1.18] lg:text-[32px] text-ink">Your wishlist is empty</h1>
          <p className="mt-2 text-[14px] leading-[21px] text-ink-muted">Tap the heart on any style to save it here. Saved styles stay on every device you sign in to.</p>
          <button
            id="empty-wishlist-shop-btn"
            onClick={() => navigateToCategory('All')}
            className="mt-6 sag-btn-primary w-full sm:w-auto sm:px-12"
          >
            Start shopping
          </button>

          {collections.length > 0 && (
            <div className="mt-10 text-left">
              <p className={`${label} mb-1 text-sale`}>Browse collections</p>
              <div className="border-t border-line">
                {collections.map(([name, count]) => (
                  <button
                    key={name}
                    onClick={() => navigateToCategory(name as any)}
                    className="sag-row w-full text-left font-normal cursor-pointer"
                  >
                    <span className="flex-1 min-w-0 truncate">{name}</span>
                    <span className="sag-num text-[13px] font-normal text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" strokeWidth={1.5} aria-hidden="true" />
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
          <span className="text-ink" aria-current="page">My wishlist</span>
        </nav>

        {/* Title with the real count; what the saved styles cost together today sits under it in quiet text */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4 mb-4 sm:mb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="font-display text-[23px] leading-[1.18] lg:text-[32px] text-ink">My wishlist</h1>
              <p className="sag-num text-[13px] text-ink-muted">{wishlist.length} saved {wishlist.length === 1 ? 'style' : 'styles'}</p>
            </div>
            {liveSaved.length > 0 && (
              <p className="sag-num mt-1 text-[13px] leading-[18px] text-ink-muted">
                Total {inr(savedTotal)}{liveSaved.length < wishlist.length ? ` for the ${liveSaved.length} still available` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {canMove.length > 0 && (
              <button type="button" onClick={moveAll} className="sag-btn-outline h-[38px] px-4 w-full sm:w-auto">
                Move all to bag
              </button>
            )}
            <ShareWishlistButton />
            <button onClick={() => navigateToCategory('All')} className={quietLink}>
              Continue shopping
            </button>
          </div>
        </div>

        {/* Wishlist items always show the live product (current price and stock) */}
        <div className={grid}>
          {wishlist.map((saved) => {
            const live = allProducts.find((p) => String(p.id) === String(saved.id));
            if (live) return <WishlistCard key={saved.id} product={live} />;
            return (
              <article key={saved.id} className="flex h-full min-w-0 flex-col">
                <div className="aspect-[4/5] w-full shrink-0 bg-sunken flex flex-col items-center justify-center gap-2 px-3 text-center text-ink-muted">
                  <PackageIcon className="w-6 h-6" mono live={false} />
                  <p className="text-[12.5px] leading-4">No longer available</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-[5px] pt-[9px]">
                  <p className="text-[13px] leading-[1.35] text-ink line-clamp-2">{saved.name}</p>
                  <p className="text-[12.5px] leading-[17px] text-ink-muted">This style has left our collection.</p>
                  <div className="mt-auto pt-1">
                    <button onClick={() => toggleWishlist(saved)} className="sag-btn-outline w-full h-[38px] px-2">Remove</button>
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
