import React, { useState, useEffect, useRef } from 'react';
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
 * Deal of the day (pick 3-3): one glass panel in two parts. Left, a brighter glass area with the label and
 * the real discount percent very large in gold serif (the price when there is no discount) and the countdown
 * when a real end time is set; right, a rounded photo, the name, price, the real saving and a gold "View deal".
 * The selling price counts once from the MRP to the real price when the section first comes into view.
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

  const dealPrice = Number(product?.price) || 0;
  const originalPrice = Math.max(dealPrice, Number(product?.originalPrice) || dealPrice);
  // A timed deal that has ended: hidden when the admin chose so, otherwise shown without the countdown
  const ended = timerOn && !timeLeft;
  const rendered = Boolean(product) && !(dealOfTheDay && dealOfTheDay.enabled === false) && !(ended && dealOfTheDay?.hideWhenEnded === true);

  // The price counts once from the MRP to the real price when the section first enters the view.
  // `pending` = not seen yet (the MRP stands there); `count` = the running value; null = the real price.
  // With reduced motion (or no IntersectionObserver) the real price is shown at once.
  const sectionRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState(() => typeof window !== 'undefined' && 'IntersectionObserver' in window
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !pending || !(originalPrice > dealPrice)) return;
    let raf = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        if (t >= 1) { setCount(null); setPending(false); return; }
        const eased = 1 - Math.pow(1 - t, 3);
        setCount(Math.round(originalPrice + (dealPrice - originalPrice) * eased));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); setCount(null); };
  }, [rendered, pending, dealPrice, originalPrice]);

  if (!rendered || !product) return null;

  const discountPercent = originalPrice > dealPrice && originalPrice > 0 ? Math.round(((originalPrice - dealPrice) / originalPrice) * 100) : 0;
  const soldOut = !product.inStock || Math.max(0, Number(product.stockQuantity) || 0) <= 0;
  const image = dealOfTheDay?.bannerImage || product.images?.find(Boolean) || product.image || '';
  const showClock = Boolean(timeLeft && timerOn);
  const saving = originalPrice > dealPrice ? originalPrice - dealPrice : 0;
  const clockParts: Array<[string, number]> = timeLeft
    ? [['Days', timeLeft.days], ['Hours', timeLeft.hours], ['Min', timeLeft.minutes], ['Sec', timeLeft.seconds]]
    : [];
  const clockText = timeLeft ? `Offer ends in ${timeLeft.days} days ${timeLeft.hours} hours ${timeLeft.minutes} minutes` : '';
  // What the price line shows right now; it always ends on the real price
  const shownPrice = saving > 0 && pending ? (count ?? originalPrice) : dealPrice;

  const openProduct = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigateToProduct(product.id);
  };

  return (
    <section ref={sectionRef} id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" className="w-full py-[18px] lg:py-10">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <a
          href={`/product/${product.id}`}
          onClick={openProduct}
          className="sag-glass rounded-[26px]! mx-auto flex max-w-2xl items-stretch overflow-hidden text-ink lg:max-w-4xl"
        >
          {/* Left: the brighter glass area with the real discount (or the price when there is no discount) */}
          <span className="flex w-[38%] shrink-0 flex-col items-center justify-center gap-1.5 border-r border-line bg-white/[0.08] px-2 py-4 text-center text-ink sm:px-4 sm:py-6 lg:w-[300px]">
            <span className="text-[10.5px] font-semibold uppercase leading-4 tracking-[0.16em] text-sale sm:text-[11px]">Deal of the day</span>
            {discountPercent > 0 ? (
              <>
                <span className="font-display text-[46px] font-medium leading-[0.95] text-sale sm:text-[64px] lg:text-[84px]">
                  {discountPercent}<span className="text-[22px] sm:text-[30px] lg:text-[34px]">%</span>
                </span>
                <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.2em] text-ink">Off</span>
              </>
            ) : (
              <span className="sag-num text-[26px] font-semibold leading-8 text-sale sm:text-[36px] sm:leading-10">₹{dealPrice.toLocaleString('en-IN')}</span>
            )}
            {showClock && (
              <span className="mt-1.5 block w-full" role="timer" aria-live="off" aria-label={clockText}>
                <span aria-hidden="true" className="block text-[11px] leading-4 text-ink-muted">Ends in</span>
                <span aria-hidden="true" className="mx-auto mt-1 grid max-w-[220px] grid-cols-4 gap-1 sm:gap-1.5">
                  {clockParts.map(([label, value]) => (
                    <span key={label} className="flex min-w-0 flex-col items-center rounded-[10px] border border-line bg-white/[0.08] py-1 sm:rounded-[14px] sm:py-1.5">
                      <span className="sag-digit sag-num text-[12px] font-semibold leading-4 text-ink sm:text-[15px] sm:leading-5">{two(value)}</span>
                      <span className="text-[9px] leading-3 text-ink-muted sm:text-[10.5px]">{label}</span>
                    </span>
                  ))}
                </span>
              </span>
            )}
          </span>
          {/* Right: the rounded photo, name, price and the gold pill */}
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 p-2.5 sm:gap-4 sm:p-5">
            <span className="flex items-start gap-2.5 sm:gap-4">
              <span className="sag-zoom block w-[74px] shrink-0 overflow-hidden rounded-[14px] bg-sunken sm:w-[120px] sm:rounded-[18px] lg:w-[150px]">
                <img
                  src={image ? getCleanImageUrl(image, 320) : ELEGANT_PLACEHOLDER_SVG}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/5] w-full rounded-none object-cover object-top"
                  onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span id="deal-of-the-day-title" role="heading" aria-level={2} className="break-words text-[13px] leading-[1.35] text-ink line-clamp-3 sm:text-base">{product.name}</span>
                <span className="sag-num flex flex-wrap items-baseline gap-x-[7px] gap-y-0.5">
                  {/* Screen readers get the real price; the counting figure is for the eye only */}
                  <span className="sr-only">₹{dealPrice.toLocaleString('en-IN')}</span>
                  <span aria-hidden="true" className="text-[19px] font-semibold leading-6 text-ink sm:text-[24px] sm:leading-8">₹{shownPrice.toLocaleString('en-IN')}</span>
                  {originalPrice > dealPrice && <span className="text-[12.5px] text-ink-muted line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
                </span>
                {saving > 0 && <span className="sag-num text-[11.5px] font-semibold leading-4 text-sale sm:text-[13px]">You save ₹{saving.toLocaleString('en-IN')}</span>}
              </span>
            </span>
            <span
              aria-disabled={soldOut || undefined}
              className={`sag-btn-primary h-10 w-full whitespace-nowrap sm:h-12 ${soldOut ? '' : 'sag-sheen'}`}
            >
              {soldOut ? 'Sold out' : 'View deal'}
            </span>
          </span>
        </a>
      </div>
    </section>
  );
};
