import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

// Remaining time until the admin's end time; null when there is no end time or it has passed.
const readTimeLeft = (endTime?: string): TimeLeft | null => {
  if (!endTime) return null;
  const diffMs = new Date(endTime).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return {
    days: Math.floor(diffMs / 86400000),
    hours: Math.floor((diffMs / 3600000) % 24),
    minutes: Math.floor((diffMs / 60000) % 60),
    seconds: Math.floor((diffMs / 1000) % 60),
  };
};

const two = (value: number) => String(value).padStart(2, '0');

/**
 * Deal of the day as a small coupon ticket (owner's pick 1): photo, name and price on a butter strip, and a
 * torn-off end with the time left and "Grab it". The whole ticket opens the product, where the size is chosen.
 * The price is the product's own price (what the bag charges), and the clock runs only to the end time the
 * store set in Admin; it never resets.
 */
export const DealOfTheDaySection: React.FC = () => {
  const { dealOfTheDay } = useAdmin();
  const { products = [], navigateToProduct } = useShop();

  const targetProductId = dealOfTheDay?.productId || (products[0]?.id || '');
  const product = products.find((p) => p.id === targetProductId) || products[0];

  // The countdown is shown only when the admin turned the timer on and set an end time that has not passed.
  const timerOn = dealOfTheDay?.showTimer !== false && !!dealOfTheDay?.endTime;
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => readTimeLeft(dealOfTheDay?.endTime));

  useEffect(() => {
    const tick = () => setTimeLeft(readTimeLeft(dealOfTheDay?.endTime));
    tick();
    if (!timerOn) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [dealOfTheDay?.endTime, timerOn]);

  if ((dealOfTheDay && dealOfTheDay.enabled === false) || !product) return null;
  // A timed deal that has ended: hidden when the admin chose so, otherwise shown without the countdown
  const ended = timerOn && !timeLeft;
  if (ended && dealOfTheDay?.hideWhenEnded === true) return null;

  const dealPrice = Number(product.price) || 0;
  const originalPrice = Math.max(dealPrice, Number(product.originalPrice) || dealPrice);
  const discountPercent = originalPrice > dealPrice && originalPrice > 0 ? Math.round(((originalPrice - dealPrice) / originalPrice) * 100) : 0;
  const soldOut = !product.inStock || Math.max(0, Number(product.stockQuantity) || 0) <= 0;
  const image = dealOfTheDay?.bannerImage || product.images?.find(Boolean) || product.image || '';
  const showClock = Boolean(timeLeft && timerOn);
  const clock = timeLeft
    ? `${timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}${two(timeLeft.hours)}:${two(timeLeft.minutes)}:${two(timeLeft.seconds)}`
    : '';

  return (
    <section id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" className="w-full pt-5 pb-1 lg:py-8">
      <div className="mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8">
        <a
          href={`/product/${product.id}`}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            navigateToProduct(product.id);
          }}
          className="relative mx-auto grid max-w-2xl grid-cols-[84px_minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-[22px] bg-butter text-ink sm:grid-cols-[112px_minmax(0,1fr)_auto]"
        >
          <img
            src={image ? getCleanImageUrl(image, 240) : ELEGANT_PLACEHOLDER_SVG}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full min-h-[118px] w-full object-cover object-top"
            onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
          />
          <span className="flex min-w-0 flex-col justify-center gap-[3px] px-2.5 py-3 sm:px-4">
            <span className="text-[11px] font-extrabold leading-[14px] tracking-[0.06em] text-butter-ink">DEAL OF THE DAY</span>
            <span id="deal-of-the-day-title" role="heading" aria-level={2} className="text-[13.5px] font-bold leading-[1.25] line-clamp-2 sm:text-base">{product.name}</span>
            <span className="sag-num flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[17px] font-extrabold leading-6 sm:text-xl">₹{dealPrice.toLocaleString('en-IN')}</span>
              {originalPrice > dealPrice && <span className="text-xs text-ink-muted line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="text-xs font-extrabold text-sale">{discountPercent}% off</span>}
            </span>
          </span>
          {/* The torn-off end: a dashed line with a notch above and below */}
          <span className="relative flex flex-col items-center justify-center gap-1.5 border-l-2 border-dashed border-sale-line px-3 py-2.5 sm:px-5">
            <span aria-hidden="true" className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full bg-page" />
            <span aria-hidden="true" className="absolute -left-[9px] -bottom-2 h-4 w-4 rounded-full bg-page" />
            {showClock && (
              <span className="flex flex-col items-center" role="timer" aria-live="off" aria-label="Offer ends in">
                <span className="text-[11px] font-bold leading-[14px] text-butter-ink">Ends in</span>
                <span className="sag-num text-[15px] font-extrabold leading-5">{clock}</span>
              </span>
            )}
            <span className={`inline-flex h-[34px] items-center whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-bold ${soldOut ? 'bg-white/70 text-ink-muted' : 'bg-ink text-white'}`}>
              {soldOut ? 'Sold out' : 'Grab it'}
            </span>
          </span>
        </a>
      </div>
    </section>
  );
};
