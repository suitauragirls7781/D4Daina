import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { ProductSize } from '../types';
import { Heart, Check, Clock } from 'lucide-react';
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
  const showSizes = product.sizes && product.sizes.length > 0 && !(product.sizes.length === 1 && /free/i.test(product.sizes[0]));

  return (
    <section id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" className="w-full bg-page py-8 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="sag-card p-4 sm:p-6 lg:p-8 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-12 lg:gap-10 lg:items-center">
          {/* Photos: nothing is drawn on them */}
          <div className="min-w-0 lg:col-span-5">
            <button
              type="button"
              onClick={() => navigateToProduct(product.id)}
              className="block w-full overflow-hidden rounded-control bg-sunken cursor-pointer"
              aria-label={`View ${product.name}`}
            >
              <img
                key={mainImage}
                src={getCleanImageUrl(mainImage, 900)}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="w-full aspect-[4/5] object-cover object-top"
                onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
              />
            </button>
            {gallery.length > 1 && (
              <div className="mt-2 flex gap-2 sag-scroll-x overflow-x-auto scroll-px-0" role="tablist" aria-label="Deal photos">
                {gallery.map((img, index) => (
                  <button
                    key={img}
                    type="button"
                    role="tab"
                    aria-selected={index === activeImage}
                    aria-label={`Photo ${index + 1}`}
                    onClick={() => setActiveImage(index)}
                    className={`h-[70px] w-14 shrink-0 overflow-hidden rounded-chip bg-sunken cursor-pointer border-2 ${index === activeImage ? 'border-ink' : 'border-transparent hover:border-control'}`}
                  >
                    <img src={getCleanImageUrl(img, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex flex-col lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs leading-4 font-semibold text-sale">Deal of the day</p>
              {badgeTag && <span className="sag-badge bg-sale-tint text-sale">{badgeTag}</span>}
            </div>
            <h2 id="deal-of-the-day-title" className="mt-1 font-display text-[22px] leading-7 lg:text-[32px] lg:leading-10 text-ink line-clamp-3">{product.name}</h2>
            {subtitle && <p className="mt-1 text-sm leading-5 text-ink-muted line-clamp-2">{subtitle}</p>}

            <div className="sag-num mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[28px] leading-8 font-bold text-ink">₹{dealPrice.toLocaleString('en-IN')}</span>
              {originalPrice > dealPrice && <span className="text-[15px] leading-5 text-ink-faint line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="text-[15px] leading-5 font-bold text-sale">{discountPercent}% off</span>}
            </div>
            {originalPrice > dealPrice && (
              <p className="sag-num mt-0.5 text-[13px] leading-[18px] text-sale">You save ₹{(originalPrice - dealPrice).toLocaleString('en-IN')}</p>
            )}

            {/* The countdown runs to the end time the store set; it never resets */}
            {timeLeft && timerOn && (
              <div className="mt-4 rounded-control border border-sale-line bg-sale-tint px-3 py-3 sm:px-4" role="timer" aria-live="off" aria-label="Offer ends in">
                <p className="flex items-center gap-1.5 text-xs leading-4 font-semibold text-sale">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Offer ends in
                </p>
                <div className="mt-2 flex gap-2">
                  {units.map(([label, value]) => (
                    <div key={label} className="flex-1 max-w-[76px] rounded-chip bg-white border border-sale-line py-1.5 text-center">
                      <span className="sag-num block text-xl leading-6 font-bold text-ink">{String(value).padStart(2, '0')}</span>
                      <span className="block text-[11px] leading-[14px] text-ink-muted">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stockNotice && <p className={`mt-3 text-sm leading-5 font-semibold ${soldOut ? 'text-ink-muted' : 'text-sale'}`}>{stockNotice}</p>}

            {showSizes && (
              <div className="mt-4">
                <p className="sag-label">Size: {selectedSize}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      aria-pressed={selectedSize === size}
                      className="sag-chip h-11 min-w-11"
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-2 sm:max-w-md">
              <button type="button" onClick={handleBuyNow} disabled={soldOut} className="sag-btn-primary flex-[1.2] min-w-0 px-2 whitespace-nowrap">
                Buy now
              </button>
              <button type="button" onClick={handleAddToCart} disabled={soldOut} className="sag-btn-outline flex-1 min-w-0 px-2 gap-1.5 text-[15px] whitespace-nowrap">
                {isAddedToBag ? <><Check className="h-[18px] w-[18px]" aria-hidden="true" /> Added</> : <><BagIcon mono className="hidden sm:block h-[18px] w-[18px]" /> Add to bag</>}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={isWishlisted}
                className={`h-[52px] w-11 shrink-0 rounded-control flex items-center justify-center transition-colors cursor-pointer ${isWishlisted ? 'text-accent bg-accent-tint' : 'text-ink hover:bg-sunken'}`}>
                <Heart className={`h-[22px] w-[22px] ${isWishlisted ? 'fill-accent' : ''}`} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <button type="button" onClick={() => navigateToProduct(product.id)} className="sag-link mt-2 self-start">
              View full details
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
