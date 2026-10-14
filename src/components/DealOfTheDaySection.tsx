import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Icon, Odometer } from '../aura';

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
 * Deal of the day: one big round ink block. On the ink: the label and the real discount percent in very large
 * type (the price when there is no discount) and the countdown when a real end time is set; inside it a white
 * card with the photo, the name, price, the real saving and "View deal".
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
    ? [['Days', timeLeft.days], ['Hrs', timeLeft.hours], ['Min', timeLeft.minutes], ['Sec', timeLeft.seconds]]
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
    <section ref={sectionRef} id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" data-th="sand" className="w-full px-3 py-16 lg:px-8 lg:py-24">
      <a
        href={`/product/${product.id}`}
        onClick={openProduct}
        data-rv="card"
        className="hm-deal aura-blk clay-t-rose"
      >
        {/* The rose clay side: the label and the real discount in very large type (the price when there is no discount) */}
        <span className="hm-deal-l">
          <span className="aura-lbl">Deal of the day</span>
          {discountPercent > 0 ? (
            <span className="hm-deal-pc aura-num">
              {discountPercent}<small>%</small> <em>off</em>
            </span>
          ) : (
            <span className="hm-deal-pc hm-deal-pr aura-num">₹{dealPrice.toLocaleString('en-IN')}</span>
          )}
          {showClock && (
            <span className="mt-4 block w-full" role="timer" aria-live="off" aria-label={clockText}>
              <span aria-hidden="true" className="aura-lbl block">Ends in</span>
              <span aria-hidden="true" className="mt-2 grid max-w-[300px] grid-cols-4 gap-1.5">
                {clockParts.map(([label, value]) => (
                  <span key={label} className="hm-ck flex min-w-0 flex-col items-center rounded-[16px] py-2.5">
                    <Odometer value={two(value)} roll={false} className="text-[22px] font-extrabold" />
                    <span className="aura-mu mt-0.5 text-[13px] leading-4">{label}</span>
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
        {/* The product on a white card: its photo, name, price, the real saving and the button */}
        <span className="hm-deal-r aura-card aura-lt">
          <span className="hm-deal-ph aura-sk">
            <img
              src={image ? getCleanImageUrl(image, 640) : ELEGANT_PLACEHOLDER_SVG}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-top"
              onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-2 px-2 pb-2 pt-3.5 sm:justify-center sm:p-5">
            <span id="deal-of-the-day-title" role="heading" aria-level={2} className="break-words text-[17px] font-bold leading-[1.25] tracking-[-0.01em] text-ink line-clamp-3 sm:text-[22px]">{product.name}</span>
            <span className="aura-num flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {/* Screen readers get the real price; the counting figure is for the eye only */}
              <span className="sr-only">₹{dealPrice.toLocaleString('en-IN')}</span>
              <span aria-hidden="true" className="text-[24px] font-extrabold leading-8 text-ink sm:text-[30px]">₹{shownPrice.toLocaleString('en-IN')}</span>
              {originalPrice > dealPrice && <span className="text-[14px] text-ink-muted line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
            </span>
            {saving > 0 && <span className="aura-num text-[14px] font-bold leading-5 text-sale">You save ₹{saving.toLocaleString('en-IN')}</span>}
            <span
              aria-disabled={soldOut || undefined}
              className="aura-btn aura-btn-w mt-2"
            >
              {soldOut ? 'Sold out' : <>View deal <Icon name="arrow" /></>}
            </span>
          </span>
        </span>
      </a>
    </section>
  );
};
