import React from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, X } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { SharedWishlistView, ShareWishlistButton, sharedWishlistId } from './SharedWishlist';
import { defaultSizeFor, sizesOf } from '../utils/looks';
import { Product, ProductSize } from '../types';
import { PackageIcon } from './StoreIcons';
import { AuraTitle, Icon, useFlip } from '../aura';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "Move to bag" under a wishlist card; styles with several sizes show the size chips first. */
const MoveToBag: React.FC<{ product: Product; onMove: (product: Product, size?: ProductSize) => void }> = ({ product, onMove }) => {
  const [choosing, setChoosing] = React.useState(false);
  const sizes = sizesOf(product);
  const single = defaultSizeFor(product);
  if (!product.inStock) {
    return (
      <p className="mt-auto flex h-[46px] items-center justify-center rounded-full bg-sunken px-2 text-[14px] font-bold text-ink-muted">
        Sold out
      </p>
    );
  }
  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => (single ? onMove(product, single) : setChoosing(true))}
        className="aura-pc-add"
      >
        <span>Move to bag</span>
      </button>
    );
  }
  return (
    <div className="aura-pc-pick sag-pop" role="group" aria-label={`Choose a size for ${product.name}`}>
      <div className="flex items-center justify-between pl-1">
        <span className="text-[13px] leading-4 font-bold text-ink-muted">Choose a size</span>
        <button type="button" onClick={() => setChoosing(false)} aria-label="Cancel" className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
          <X className="w-4 h-4" strokeWidth={1.6} />
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onMove(product, size)}
            aria-label={`Move to bag in size ${size}`}
            className="sag-chip min-w-0 h-10 px-1 text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
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
    // The pieces of the shop's product card: a white card, the photo, the heart, the name, the price and the pill
    <article className="aura-pc aura-card" data-rv="card" data-flip={String(product.id)}>
      <div className="aura-pc-m">
        <button
          type="button"
          onClick={() => navigateToProduct(product.id)}
          className="aura-pc-ph aura-sk w-full cursor-pointer"
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
              className={product.inStock ? '' : 'opacity-60 grayscale-[35%]'}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          aria-label={`Remove ${product.name} from wishlist`}
          title="Remove from wishlist"
          className="aura-hrt on"
        >
          <Icon name="heart" size={18} />
        </button>
      </div>
      <div className="aura-pc-b">
        {!product.inStock && <span className="aura-pc-l">Sold out</span>}
        <button type="button" onClick={() => navigateToProduct(product.id)} className="aura-pc-n text-left hover:underline underline-offset-2 cursor-pointer">
          {product.name}
        </button>
        <p className="aura-pc-pr aura-num">
          <span className={`text-[16px] leading-5 font-extrabold tracking-[-0.01em] ${product.inStock ? 'text-ink' : 'text-ink-muted'}`}>{inr(product.price)}</span>
          {off > 0 && <span className="text-[13px] text-ink-muted line-through">{inr(mrp)}</span>}
          {off > 0 && <span className="text-[13px] font-bold text-sale whitespace-nowrap">{off}% off</span>}
        </p>
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

  // Aura Kinetic: when a style leaves the list the others glide into its place
  const gridRef = React.useRef<HTMLDivElement>(null);
  useFlip(gridRef, wishlist.map((saved) => saved.id).join(','), { selector: ':scope > article' });

  const sharedId = sharedWishlistId();
  if (sharedId) return <SharedWishlistView id={sharedId} />;

  if (wishlist.length === 0) {
    return (
      <div id="wishlist-empty-state" data-aura className="clay-pg px-3 pt-4 pb-16 sm:px-6 lg:pt-8">
        <div className="mx-auto max-w-[1120px] lg:grid lg:grid-cols-2 lg:items-start lg:gap-[50px]">
          <div className="aa-band aa-band-blush">
            <span className="aa-ic kx-drawn kx-beat mb-5 h-14 w-14" aria-hidden="true">
              <Icon name="heart" size={24} />
            </span>
            <AuraTitle
              as="h1"
              label="Saved styles"
              title="Your wishlist is"
              accent="empty"
              sub="Tap the heart on any style to save it here. Saved styles stay on every device you sign in to."
            />
            <button
              id="empty-wishlist-shop-btn"
              onClick={() => navigateToCategory('All')}
              className="aura-btn aura-btn-w mt-7 sm:inline-flex sm:w-auto"
            >
              Start shopping <Icon name="arrow" />
            </button>
          </div>

          {collections.length > 0 && (
            <div className="mt-8 px-1 lg:mt-0">
              <p className="aura-lbl mb-3">Browse collections</p>
              <div className="space-y-2">
                {collections.map(([name, count]) => (
                  <button
                    key={name}
                    onClick={() => navigateToCategory(name as any)}
                    className="aa-row min-h-[60px] pl-5"
                  >
                    <span className="aa-row-t"><b className="truncate">{name}</b></span>
                    <span className="aura-num text-[13.5px] text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
                    <ChevronRight strokeWidth={1.6} aria-hidden="true" />
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
    <div id="wishlist-page-container" data-aura className="clay-pg px-3 pt-4 pb-16 sm:px-6 lg:pt-8 lg:pb-20">
      <div className="mx-auto max-w-[1120px]">

        {/* Breadcrumbs (tablet and desktop) */}
        <nav className="hidden sm:flex items-center gap-1.5 text-[13.5px] text-ink-muted mb-2 px-1 w-fit" aria-label="Breadcrumb">
          <button onClick={() => setActivePage('home')} className="min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
          <span className="font-semibold text-ink" aria-current="page">My wishlist</span>
        </nav>

        {/* Title with the real count; what the saved styles cost together today sits under it in quiet text */}
        <div className="mb-6 flex flex-col gap-5 px-1 pt-3 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <AuraTitle
              as="h1"
              label="Saved styles"
              title="My"
              accent="wishlist"
              sub={<span className="aura-num">{wishlist.length} saved {wishlist.length === 1 ? 'style' : 'styles'}</span>}
            />
            {liveSaved.length > 0 && (
              <p className="aura-num mt-1 text-[14px] leading-5 text-ink-muted">
                Total {inr(savedTotal)}{liveSaved.length < wishlist.length ? ` for the ${liveSaved.length} still available` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {canMove.length > 0 && (
              <button type="button" onClick={moveAll} className="aura-btn aura-btn-w sm:inline-flex sm:w-auto">
                Move all to bag
              </button>
            )}
            <ShareWishlistButton />
            <button onClick={() => navigateToCategory('All')} className="aura-lk">
              Continue shopping
            </button>
          </div>
        </div>

        {/* Wishlist items always show the live product (current price and stock) */}
        <div ref={gridRef} className="aura-pc-grid">
          {wishlist.map((saved) => {
            const live = allProducts.find((p) => String(p.id) === String(saved.id));
            if (live) return <WishlistCard key={saved.id} product={live} />;
            return (
              <article key={saved.id} data-flip={String(saved.id)} className="aura-pc aura-card">
                <div className="aura-pc-ph flex flex-col items-center justify-center gap-2 bg-sunken px-3 text-center text-ink-muted">
                  <PackageIcon className="w-6 h-6" mono live={false} />
                  <p className="text-[13px] leading-4 font-semibold">No longer available</p>
                </div>
                <div className="aura-pc-b">
                  <p className="aura-pc-n">{saved.name}</p>
                  <p className="mt-1 mb-2.5 text-[13px] leading-[18px] text-ink-muted">This style has left our collection.</p>
                  <button onClick={() => toggleWishlist(saved)} className="aura-pc-add"><span>Remove</span></button>
                </div>
              </article>
            );
          })}
        </div>

      </div>
    </div>
  );
};
