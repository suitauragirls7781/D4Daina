import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Icon, Odometer, clamp, prefersReducedMotion, setVar, smooth, useScrollFx } from '../aura';

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
const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/**
 * Deal of the day, "the ticket": one big round-cornered ticket in two parts with a perforation between them
 * (two notches and a dashed line). The white part carries the product's photo, the label, the name and, only
 * when the store set a real end time that has not passed, the clock. The ink stub carries the real discount
 * percent in very large type (the price when there is no discount), the price, the MRP struck through,
 * "You save ₹X" and the one button.
 * It moves like a thing you hold: it tips up into place as it scrolls into view (one CSS variable from the
 * shared scroll engine), leans a few degrees towards a mouse, a flat band of light crosses the stub once, and
 * the price counts once from the MRP down to the real price. Nothing is drawn on the photo.
 * The whole ticket opens the product, where the size is chosen. The price is the product's own price (what the
 * bag charges), and the clock runs only to the end time the store set in Admin; it never resets.
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

  const sectionRef = useRef<HTMLElement>(null);
  const ticketRef = useRef<HTMLAnchorElement>(null);
  const leanRef = useRef<HTMLSpanElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const box = useRef({ left: 0, top: 0, width: 1, height: 1 });

  // The ticket tips up into place while it comes into view and tips away a little as it leaves
  useScrollFx(sectionRef, ({ enter }) => {
    const el = ticketRef.current;
    if (prefersReducedMotion() || !el) return;
    const arriving = 1 - smooth(clamp((enter - 0.08) / 0.34));
    const leaving = smooth(clamp((enter - 0.7) / 0.3));
    setVar(el, '--rx', arriving * 13 - leaving * 7, 2);
    setVar(el, '--rz', arriving * -2.6, 2);
    setVar(el, '--sc', 1 - arriving * 0.06);
  }, [rendered]);

  // When the ticket is first seen: the band of light crosses the stub and the price counts once from the MRP
  // down to the real price. The page always holds the real price; the count only writes this element's text
  // (never React state) and always ends on the real price.
  useEffect(() => {
    const section = sectionRef.current;
    const ticket = ticketRef.current;
    if (!rendered || !section || !ticket) return undefined;
    // React's own text node is kept (only its value is written), so a later render still finds it
    const node = priceRef.current?.firstChild || null;
    const real = rupees(dealPrice);
    const write = (text: string) => { if (node && node.nodeValue !== text) node.nodeValue = text; };
    const counts = Boolean(node) && originalPrice > dealPrice;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) { section.classList.add('in'); return undefined; }
    let raf = 0;
    // Not seen yet (it is below the screen): the count will start from the MRP
    if (counts && ticket.getBoundingClientRect().top > window.innerHeight * 0.7) write(rupees(originalPrice));
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      section.classList.add('in');
      if (!counts || node?.nodeValue === real) return;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start - 250) / 1000);
        if (t >= 1) { write(real); return; }
        const eased = 1 - Math.pow(1 - Math.max(0, t), 3);
        write(rupees(Math.round(originalPrice + (dealPrice - originalPrice) * eased)));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.45 });
    observer.observe(ticket);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); write(real); };
  }, [rendered, dealPrice, originalPrice]);

  if (!rendered || !product) return null;

  const discountPercent = originalPrice > dealPrice && originalPrice > 0 ? Math.round(((originalPrice - dealPrice) / originalPrice) * 100) : 0;
  const soldOut = !product.inStock || Math.max(0, Number(product.stockQuantity) || 0) <= 0;
  const image = dealOfTheDay?.bannerImage || product.images?.find(Boolean) || product.image || '';
  const showClock = Boolean(timeLeft && timerOn);
  const saving = originalPrice > dealPrice ? originalPrice - dealPrice : 0;
  const clockParts: Array<[string, number]> = timeLeft
    ? [['days', timeLeft.days], ['hrs', timeLeft.hours], ['min', timeLeft.minutes], ['sec', timeLeft.seconds]]
    : [];
  const clockText = timeLeft ? `Offer ends in ${timeLeft.days} days ${timeLeft.hours} hours ${timeLeft.minutes} minutes` : '';
  const small = image ? getCleanImageUrl(image, 480) : '';
  const wide = image ? getCleanImageUrl(image, 828) : '';

  const openProduct = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigateToProduct(product.id);
  };
  // A mouse makes the ticket lean a few degrees towards it (its box is read once, when the mouse arrives)
  const onEnter = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    box.current = { left: rect.left, top: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  };
  const onMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const b = box.current;
    setVar(leanRef.current, '--mx', clamp((event.clientX - b.left) / b.width) - 0.5, 2);
    setVar(leanRef.current, '--my', clamp((event.clientY - b.top) / b.height) - 0.5, 2);
  };
  const onLeave = () => { setVar(leanRef.current, '--mx', 0); setVar(leanRef.current, '--my', 0); };

  return (
    <section ref={sectionRef} id="deal-of-the-day-section" aria-labelledby="deal-of-the-day-title" data-th="sand" className="d3v">
      <a
        ref={ticketRef}
        href={`/product/${product.id}`}
        onClick={openProduct}
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        data-cur="View"
        className="d3v-tk"
      >
        <span ref={leanRef} className="d3v-ln">
          {/* The white part: the photo, the label, the name and the clock (only for a real end time) */}
          <span className="d3v-a aura-lt">
            <span className="d3v-ph aura-sk">
              <img
                src={small || ELEGANT_PLACEHOLDER_SVG}
                srcSet={small && wide && small !== wide ? `${small} 480w, ${wide} 828w` : undefined}
                sizes="(min-width: 900px) 340px, 44vw"
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={(event) => { if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; } }}
              />
            </span>
            <span className="d3v-i">
              <span id="deal-of-the-day-title" role="heading" aria-level={2} className="sr-only">Deal of the day</span>
              <span aria-hidden="true" className="d3v-lb">Deal of the day</span>
              <span role="heading" aria-level={3} className="d3v-n">{product.name}</span>
              {showClock && (
                <span className="d3v-ck" role="timer" aria-live="off" aria-label={clockText}>
                  <span aria-hidden="true" className="d3v-ck-l">Ends in</span>
                  <span aria-hidden="true" className="d3v-ck-r">
                    {clockParts.map(([label, value]) => (
                      <span key={label}>
                        <Odometer value={two(value)} roll={false} />
                        <small>{label}</small>
                      </span>
                    ))}
                  </span>
                </span>
              )}
            </span>
          </span>
          {/* The ink stub: the real discount in very large type (the price when there is no discount), the price, the saving, the button */}
          <span className="d3v-b aura-dk">
            <span className="d3v-sh" aria-hidden="true" />
            <span className="d3v-top">
              {discountPercent > 0 ? (
                <span className="d3v-pc aura-num">
                  {discountPercent}<small>%</small><em>off</em>
                </span>
              ) : (
                <span className="d3v-pc d3v-pc-pr aura-num">{rupees(dealPrice)}</span>
              )}
              {discountPercent > 0 && (
                <span className="d3v-p aura-num">
                  {/* Screen readers get the real price; the counting figure is for the eye only */}
                  <span className="sr-only">{rupees(dealPrice)}</span>
                  <span ref={priceRef} aria-hidden="true" className="d3v-p-now">{rupees(dealPrice)}</span>
                  <span className="d3v-p-was"><span className="sr-only">MRP </span><s>{rupees(originalPrice)}</s></span>
                  {saving > 0 && <span className="d3v-p-save">You save {rupees(saving)}</span>}
                </span>
              )}
            </span>
            <span aria-disabled={soldOut || undefined} className="aura-btn aura-btn-w d3v-go">
              {soldOut ? 'Sold out' : <>View deal <Icon name="arrow" /></>}
            </span>
          </span>
        </span>
      </a>
    </section>
  );
};
