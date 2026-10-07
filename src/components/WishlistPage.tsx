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
    // Phones and tablets: a white card with a small photo beside the name and price, then a hairline and "Move to bag".
    // Desktop: the photo-on-top column as before.
    <article className="relative flex flex-col h-full rounded-card bg-surface p-3 shadow-[var(--sag-shadow)] lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
      <div className="flex flex-1 gap-2.5 lg:flex-col lg:gap-0">
        <button
          type="button"
          onClick={() => navigateToProduct(product.id)}
          className="block aspect-[4/5] w-[58px] shrink-0 self-start rounded-chip bg-sunken overflow-hidden cursor-pointer lg:w-full lg:rounded-control"
          aria-label={`View ${product.name}`}
        >
          {image && (
            <img
              src={getCleanImageUrl(image, 480)}
              srcSet={getCleanImageUrl(image, 160) !== getCleanImageUrl(image, 480) ? `${getCleanImageUrl(image, 160)} 160w, ${getCleanImageUrl(image, 320)} 320w, ${getCleanImageUrl(image, 480)} 480w, ${getCleanImageUrl(image, 640)} 640w` : undefined}
              sizes="(min-width: 1024px) 24vw, 58px"
              alt={product.name}
              loading="lazy"
              decoding="async"
              onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
              className={`w-full h-full object-cover object-top ${product.inStock ? '' : 'opacity-60 grayscale-[35%]'}`}
            />
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col pr-9 lg:pr-0 lg:pt-1">
          <div className="flex items-center justify-between gap-2 lg:min-h-11">
            {!product.inStock ? (
              <span className="sag-badge mb-1 lg:mb-0 text-ink-muted">Sold out</span>
            ) : (
              <span className="hidden lg:block min-w-0 truncate text-xs text-ink-muted">{product.category}</span>
            )}
            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              aria-label={`Remove ${product.name} from wishlist`}
              title="Remove from wishlist"
              className="absolute top-1 right-1 lg:static lg:-mr-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-accent hover:bg-accent-tint transition-colors cursor-pointer"
            >
              <Heart className="w-5 h-5 lg:w-[22px] lg:h-[22px] fill-accent" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <button type="button" onClick={() => navigateToProduct(product.id)} className="text-left text-[13px] leading-[17px] font-semibold lg:text-sm lg:leading-5 lg:font-medium text-ink line-clamp-2 lg:min-h-10 hover:underline underline-offset-2 cursor-pointer">
            {product.name}
          </button>
          <p className="sag-num pt-1 lg:mt-auto flex flex-wrap items-baseline gap-x-1.5">
            <span className={`text-[15px] lg:text-base leading-5 font-extrabold lg:font-bold ${product.inStock ? 'text-ink' : 'text-ink-muted'}`}>{inr(product.price)}</span>
            {off > 0 && <span className="text-xs lg:text-[13px] text-ink-faint line-through">{inr(mrp)}</span>}
            {off > 0 && <span className="text-xs lg:text-[13px] font-bold text-sale whitespace-nowrap">{off}% off</span>}
          </p>
        </div>
      </div>
      <div className="mt-2.5 border-t border-line pt-2.5 lg:mt-0 lg:border-0 lg:pt-2">
        <MoveToBag product={product} onMove={moveToCartFromWishlist} />
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
    <div id="wishlist-page-container" className="pt-4 pb-14 sm:pt-6 lg:pt-8 lg:pb-20 bg-page lg:bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumbs (tablet and desktop) */}
        <nav className="hidden sm:flex items-center gap-1.5 text-[13px] text-ink-muted mb-3 w-fit" aria-label="Breadcrumb">
          <button onClick={() => setActivePage('home')} className="min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
          <span className="text-ink font-medium" aria-current="page">My wishlist</span>
        </nav>

        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-x-4 gap-y-1 mb-3 sm:mb-5">
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

        {/* The dark block: how many styles are saved, what they cost together today, and one tap to move them to the bag */}
        <div className="mb-3 lg:mb-7 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-sheet bg-dark text-on-dark px-4 py-3.5">
          <div className="flex-1 min-w-[8rem]">
            <p className="sag-num text-[15px] leading-5 font-bold">{wishlist.length} saved {wishlist.length === 1 ? 'style' : 'styles'}</p>
            {liveSaved.length > 0 && (
              <p className="sag-num mt-0.5 text-[13px] leading-[18px] text-on-dark-muted">
                Total {inr(savedTotal)}{liveSaved.length < wishlist.length ? ` for the ${liveSaved.length} still available` : ''}
              </p>
            )}
          </div>
          {canMove.length > 0 && (
            <button type="button" onClick={moveAll} className="shrink-0 h-10 px-4 rounded-full bg-sun text-ink text-[13px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-transform active:scale-[0.98]">
              <BagIcon className="w-4 h-4" mono live={false} /> Move all to bag
            </button>
          )}
        </div>

        {/* Wishlist items always show the live product (current price and stock) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-x-5 lg:gap-y-9">
          {wishlist.map((saved) => {
            const live = allProducts.find((p) => String(p.id) === String(saved.id));
            if (live) return <WishlistCard key={saved.id} product={live} />;
            return (
              <article key={saved.id} className="flex flex-col h-full rounded-card bg-surface p-3 shadow-[var(--sag-shadow)] lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
                <div className="flex flex-1 gap-2.5 lg:flex-col lg:gap-0">
                  <div className="aspect-[4/5] w-[58px] shrink-0 self-start rounded-chip bg-sunken flex flex-col items-center justify-center gap-2 text-center text-ink-muted lg:w-full lg:rounded-control lg:px-4">
                    <PackageIcon className="w-6 h-6 lg:w-7 lg:h-7" mono live={false} />
                    <p className="hidden lg:block text-[13px] font-semibold">No longer available</p>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col lg:pt-3">
                    <p className="text-[13px] leading-[17px] font-semibold lg:text-sm lg:leading-5 lg:font-medium text-ink line-clamp-2">{saved.name}</p>
                    <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">This style has left our collection.</p>
                  </div>
                </div>
                <div className="mt-2.5 border-t border-line pt-2.5 lg:mt-0 lg:border-0 lg:pt-2">
                  <button onClick={() => toggleWishlist(saved)} className="sag-btn-outline w-full h-11 text-sm">Remove</button>
                </div>
              </article>
            );
          })}
        </div>

      </div>
    </div>
  );
};
