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
 * Deal of the day: a white box with a hairline, the photo on the left and beside it the label, name, price,
 * the real saving and a black "View deal". The same box at every width.
 * The whole box opens the product, where the size is chosen.
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
  const saving = originalPrice > dealPrice ? originalPrice - dealPrice : 0;
  const clock = timeLeft
    ? `${timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}${two(timeLeft.hours)}:${two(timeLeft.minutes)}:${two(timeLeft.seconds)}`
    : '';

  const openProduct = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigateToProduct(product.id);
  };

  return (
    <section id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" className="w-full py-[26px] lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <a
          href={`/product/${product.id}`}
          onClick={openProduct}
          className="mx-auto flex max-w-2xl items-stretch gap-3.5 border border-line bg-surface p-4 text-ink sm:gap-6 sm:p-5"
        >
          <span className="block w-[38%] shrink-0 overflow-hidden bg-sunken">
            <img
              src={image ? getCleanImageUrl(image, 480) : ELEGANT_PLACEHOLDER_SVG}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] h-full w-full object-cover object-top"
              onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase leading-4 tracking-[0.16em] text-sale">Deal of the day</span>
            <span id="deal-of-the-day-title" role="heading" aria-level={2} className="text-[13px] leading-[1.35] text-ink line-clamp-2 sm:text-base">{product.name}</span>
            <span className="sag-num flex flex-wrap items-baseline gap-x-[7px] gap-y-0.5">
              <span className="text-[14.5px] font-semibold leading-5 text-ink sm:text-lg">₹{dealPrice.toLocaleString('en-IN')}</span>
              {originalPrice > dealPrice && <span className="text-[12.5px] text-ink-muted line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="text-[12.5px] font-semibold text-sale">{discountPercent}% off</span>}
            </span>
            {saving > 0 && <span className="sag-num text-[11.5px] font-semibold leading-4 text-sale">You save ₹{saving.toLocaleString('en-IN')}</span>}
            {showClock && (
              <span className="text-[11.5px] leading-4 text-ink-muted" role="timer" aria-live="off" aria-label="Offer ends in">
                Ends in <span className="sag-num text-ink">{clock}</span>
              </span>
            )}
            <span
              className={`mt-1 inline-flex h-10 items-center justify-center whitespace-nowrap px-4 text-[12.5px] font-semibold uppercase tracking-[0.12em] sm:self-start sm:px-8 ${soldOut ? 'bg-sunken text-ink-muted' : 'bg-ink text-white'}`}
            >
              {soldOut ? 'Sold out' : 'View deal'}
            </span>
          </span>
        </a>
      </div>
    </section>
  );
};
