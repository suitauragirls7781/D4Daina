import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { ProductSize } from '../types';
import { ShoppingBag, Heart, Zap, Check, ArrowRight, Clock } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { BagIcon } from './BrandIcons';

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number; fraction: number };

// Remaining time until the admin's end time; null when there is no end time or it has passed.
const readTimeLeft = (endTime?: string, durationHours?: number): TimeLeft | null => {
  if (!endTime) return null;
  const endMs = new Date(endTime).getTime();
  const diffMs = endMs - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const totalMs = Math.max(diffMs, (Number(durationHours) || 24) * 3600000);
  return {
    days: Math.floor(diffMs / 86400000),
    hours: Math.floor((diffMs / 3600000) % 24),
    minutes: Math.floor((diffMs / 60000) % 60),
    seconds: Math.floor((diffMs / 1000) % 60),
    fraction: Math.min(1, diffMs / totalMs),
  };
};

export const DealOfTheDaySection: React.FC = () => {
  const { dealOfTheDay } = useAdmin();
  const { products = [], navigateToProduct, toggleWishlist, isInWishlist, addToCart, buyNow, showToast } = useShop();

  const targetProductId = dealOfTheDay?.productId || (products[0]?.id || '');
  const product = products.find((p) => p.id === targetProductId) || products[0];

  const [selectedSize, setSelectedSize] = useState<ProductSize>('M');
  const [isAddedToBag, setIsAddedToBag] = useState<boolean>(false);
  const [activeImage, setActiveImage] = useState(0);

  // The countdown is shown only when the admin turned the timer on and set an end time that has not passed.
  const timerOn = dealOfTheDay?.showTimer !== false && !!dealOfTheDay?.endTime;
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => readTimeLeft(dealOfTheDay?.endTime, dealOfTheDay?.durationHours));

  useEffect(() => {
    if (product && product.sizes && product.sizes.length > 0) setSelectedSize(product.sizes[0]);
    setActiveImage(0);
  }, [product?.id]);

  useEffect(() => {
    const tick = () => setTimeLeft(readTimeLeft(dealOfTheDay?.endTime, dealOfTheDay?.durationHours));
    tick();
    if (!timerOn) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [dealOfTheDay?.endTime, dealOfTheDay?.durationHours, timerOn]);

  if ((dealOfTheDay && dealOfTheDay.enabled === false) || !product) return null;
  // A timed deal that has ended: hidden when the admin chose so, otherwise shown without the countdown
  const ended = timerOn && !timeLeft;
  if (ended && dealOfTheDay?.hideWhenEnded === true) return null;

  // Show exactly what the bag charges: cart and checkout use the product's own price.
  const dealPrice = Number(product.price) || 0;
  const originalPrice = Math.max(dealPrice, Number(product.originalPrice) || dealPrice);
  const discountPercent = originalPrice > dealPrice && originalPrice > 0 ? Math.round(((originalPrice - dealPrice) / originalPrice) * 100) : 0;
  const stockLeft = Math.max(0, Number(product.stockQuantity) || 0);
  const soldOut = !product.inStock || stockLeft <= 0;
  const stockNotice = soldOut ? 'Sold out' : stockLeft <= 5 ? `Only ${stockLeft} left in stock` : '';

  const productImages = product.images && product.images.length > 0 ? product.images : [product.image || ELEGANT_PLACEHOLDER_SVG];
  // The admin's deal-only photo leads; the product's own photos follow as thumbnails
  const gallery = Array.from(new Set([dealOfTheDay?.bannerImage, ...productImages].filter(Boolean) as string[])).slice(0, 5);
  const mainImage = gallery[Math.min(activeImage, gallery.length - 1)];
  const isWishlisted = isInWishlist(product.id);
  // The admin's own label shows as a small tag, unless it just repeats "Deal of the day – product name"
  const cleanBadge = (dealOfTheDay?.badgeText || '').replace(/[^\p{L}\p{N}\s%₹.,:-]/gu, '').trim();
  const badgeTag = cleanBadge && !/^deal of the day/i.test(cleanBadge) && cleanBadge.length <= 40 ? cleanBadge : '';
  const subtitle = dealOfTheDay?.customSubtitle || product.description;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product, selectedSize);
    setIsAddedToBag(true);
    showToast(`Added ${product.name} to bag`, 'success');
    setTimeout(() => setIsAddedToBag(false), 2000);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    buyNow(product, selectedSize);
  };

  const units: Array<[string, number]> = timeLeft
    ? [...(timeLeft.days > 0 ? [['Days', timeLeft.days] as [string, number]] : []), ['Hours', timeLeft.hours], ['Mins', timeLeft.minutes], ['Secs', timeLeft.seconds]]
    : [];

  return (
    <section id="deal-of-the-day-section" aria-label="Deal of the day" className="w-full bg-[#FBF7F3] px-3 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] sm:rounded-[36px] bg-[#4B1D3F] text-white shadow-[0_40px_80px_-50px_rgba(42,26,38,0.9)]">
        {/* Plain decorative rings (beside the photo, never on it) */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border border-[#C5A46D]/25" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-[#C5A46D]/15" />

        <div className="relative grid lg:grid-cols-12">
          {/* Photos */}
          <div className="p-3 sm:p-5 lg:col-span-6 lg:p-7">
            <button
              type="button"
              onClick={() => navigateToProduct(product.id)}
              className="group block w-full overflow-hidden rounded-[22px] sm:rounded-[28px] bg-[#F3EEF8] cursor-pointer"
              aria-label={`View ${product.name}`}
            >
              <img
                key={mainImage}
                src={getCleanImageUrl(mainImage, 1000)}
                alt={product.name}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover object-top transition-transform duration-700 group-hover:scale-[1.03]"
                onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
              />
            </button>
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 sag-scroll-x overflow-x-auto" role="tablist" aria-label="Deal photos">
                {gallery.map((img, index) => (
                  <button
                    key={img}
                    type="button"
                    role="tab"
                    aria-selected={index === activeImage}
                    aria-label={`Photo ${index + 1}`}
                    onClick={() => setActiveImage(index)}
                    className={`h-[72px] w-14 sm:h-20 sm:w-16 shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] transition-all cursor-pointer ${index === activeImage ? 'ring-2 ring-[#C5A46D] ring-offset-2 ring-offset-[#4B1D3F]' : 'opacity-55 hover:opacity-100'}`}
                  >
                    <img src={getCleanImageUrl(img, 160)} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center px-5 pb-7 pt-2 sm:px-8 sm:pb-10 lg:col-span-6 lg:py-12 lg:pl-4 lg:pr-12">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-px w-8 bg-[#C5A46D]" />
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-[#C5A46D]">Deal of the day</p>
              {badgeTag && <span className="rounded-full border border-[#C5A46D]/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[#FBF7F3]/85">{badgeTag}</span>}
            </div>
            <h2 className="mt-3 font-serif text-[30px] leading-[1.08] sm:text-4xl lg:text-5xl text-[#FBF7F3] line-clamp-3">{product.name}</h2>
            {subtitle && <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-white/70 line-clamp-2">{subtitle}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-3xl sm:text-4xl font-semibold text-white">₹{dealPrice.toLocaleString('en-IN')}</span>
              {originalPrice > dealPrice && <span className="text-base text-white/55 line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="rounded-full bg-[#F7E4EA] px-3 py-1 text-xs font-bold text-[#8A2E55]">{discountPercent}% off</span>}
            </div>

            {timeLeft && timerOn && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5" role="timer" aria-live="off" aria-label="Offer ends in">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A46D]">
                    <Clock className="h-3.5 w-3.5" /> Offer ends in
                  </p>
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F7E4EA] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F7E4EA]" />
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-1.5 sm:gap-2.5">
                  {units.map(([label, value], index) => (
                    <React.Fragment key={label}>
                      {index > 0 && <span className="pt-2.5 sm:pt-3 font-serif text-2xl text-[#C5A46D]/70" aria-hidden="true">:</span>}
                      <div className="flex-1 max-w-[84px] text-center">
                        <div className="rounded-xl bg-[#FBF7F3] py-2.5 sm:py-3 shadow-[inset_0_-2px_0_rgba(75,29,63,0.12)]">
                          <span key={value} className="sag-tick block font-serif text-[28px] sm:text-4xl font-semibold leading-none text-[#4B1D3F] tabular-nums">
                            {String(value).padStart(2, '0')}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-white/60">{label}</p>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <div className="h-full rounded-full bg-[#C5A46D] transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(2, timeLeft.fraction * 100)}%` }} />
                </div>
              </div>
            )}

            {stockNotice && <p className="mt-4 text-sm font-medium text-[#F7E4EA]">{stockNotice}</p>}

            {product.sizes && product.sizes.length > 0 && !(product.sizes.length === 1 && /free/i.test(product.sizes[0])) && (
              <div className="mt-5">
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/60">Select size</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      aria-pressed={selectedSize === size}
                      className={`h-10 min-w-[44px] rounded-full border px-3.5 text-sm transition-colors cursor-pointer ${selectedSize === size ? 'border-[#FBF7F3] bg-[#FBF7F3] font-semibold text-[#4B1D3F]' : 'border-white/25 text-white hover:border-white/70'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-2.5">
              <button type="button" onClick={handleBuyNow} disabled={soldOut}
                className="flex-1 sm:flex-none h-12 whitespace-nowrap rounded-full bg-[#FBF7F3] px-4 sm:px-7 text-xs font-bold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#4B1D3F] inline-flex items-center justify-center gap-2 transition-colors hover:bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Zap className="h-4 w-4" /> Buy now
              </button>
              <button type="button" onClick={handleAddToCart} disabled={soldOut}
                className="flex-1 sm:flex-none h-12 whitespace-nowrap rounded-full border border-white/35 px-4 sm:px-6 text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-white inline-flex items-center justify-center gap-2 transition-colors hover:bg-white/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {isAddedToBag ? <><Check className="h-4 w-4" /> Added</> : <><BagIcon mono className="h-[18px] w-[18px]" /> Add to bag</>}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={isWishlisted}
                className="h-12 w-12 shrink-0 rounded-full border border-white/35 flex items-center justify-center transition-colors hover:bg-white/10 cursor-pointer">
                <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-[#F7E4EA] text-[#F7E4EA]' : 'text-white'}`} />
              </button>
            </div>

            <button type="button" onClick={() => navigateToProduct(product.id)}
              className="mt-5 inline-flex items-center gap-2 self-start text-xs font-semibold uppercase tracking-[0.18em] text-[#C5A46D] hover:text-[#FBF7F3] transition-colors cursor-pointer">
              View full details <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
