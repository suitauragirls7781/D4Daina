import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { HOME_SECTION } from './HomeSections';

/** Small star row filled to exactly the value (one decimal, same rule as the product page): 4.7 is four and seven tenths stars. */
const Stars: React.FC<{ value: number }> = ({ value }) => {
  const shown = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 10) / 10));
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        return (
          <span key={i} className="relative block h-[15px] w-[15px] shrink-0">
            <Star className="block h-[15px] w-[15px] text-star" strokeWidth={1.25} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="block h-[15px] w-[15px] max-w-none fill-star text-star" strokeWidth={1.25} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
};

// A place the code fills in when the customer gave none; it is not shown as the customer's place
const reviewPlace = (location?: string) => {
  const text = (location || '').trim();
  return text && text !== 'Artisan, India' ? text : '';
};

/**
 * Approved customer reviews. Hidden entirely until there is at least one.
 * One review at a time as a centred serif quote on the quiet tint (verified purchases first, the others one
 * swipe or arrow away), then the real average and count. The same at every width.
 */
export const CustomerReviews: React.FC = () => {
  const { reviewsList = [] } = useAdmin();
  const { navigateToProduct, products = [] } = useShop();
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const reviews = reviewsList
    .filter((r) => r.status === 'approved' && String(r.comment || '').trim())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);

  if (reviews.length === 0) return null;

  // Every approved review counts towards the average, not only the ones in the strip
  const approved = reviewsList.filter((r) => r.status === 'approved' && Number(r.rating) > 0);
  const allAverage = approved.length > 0 ? approved.reduce((sum, r) => sum + Number(r.rating), 0) / approved.length : 0;
  // Verified purchases lead; the order inside each group stays newest first
  const quotes = [...reviews.filter((r) => r.verifiedPurchase === true), ...reviews.filter((r) => r.verifiedPurchase !== true)];
  const at = Math.min(shown, quotes.length - 1);
  const productOf = (review: (typeof quotes)[number]) => products.find((p) => String(p.id) === String(review.productId));
  // "Read all reviews" opens the style the shown review is about: its page lists every review of it
  const linked = productOf(quotes[at]) || quotes.map(productOf).find(Boolean);
  const step = (to: number) => {
    const strip = stripRef.current;
    const target = strip?.children[Math.max(0, Math.min(quotes.length - 1, to))] as HTMLElement | undefined;
    if (!strip || !target) return;
    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    strip.scrollTo({ left: target.offsetLeft - (strip.children[0] as HTMLElement).offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const strip = stripRef.current;
      if (!strip || strip.children.length === 0) return;
      const origin = (strip.children[0] as HTMLElement).offsetLeft;
      let nearest = 0;
      let best = Infinity;
      Array.from(strip.children).forEach((child, index) => {
        const distance = Math.abs((child as HTMLElement).offsetLeft - origin - strip.scrollLeft);
        if (distance < best) { best = distance; nearest = index; }
      });
      setShown(nearest);
    });
  };
  const arrow = 'flex h-9 w-9 items-center justify-center text-ink cursor-pointer transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed';

  return (
    <section id="customer-reviews-section" aria-labelledby="customer-reviews-title" className={`${HOME_SECTION} bg-sunken text-center`}>
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <h2 id="customer-reviews-title" className="font-sans text-[10.5px] font-semibold uppercase leading-4 tracking-[0.16em] text-sale">
          <span className="sr-only">Customer reviews: </span>Real customers
        </h2>

        {/* One review per view; a swipe or the arrows bring the next real one */}
        <div ref={stripRef} onScroll={onScroll} className="sag-scroll-x scroll-px-0! mt-2.5 flex overflow-x-auto">
          {quotes.map((review) => {
            const product = productOf(review);
            const rating = Number(review.rating) || 0;
            const place = reviewPlace(review.location);
            return (
              <figure key={review.id} className="flex w-full shrink-0 flex-col items-center px-1">
                {rating > 0 && (
                  <div className="flex items-center">
                    <Stars value={rating} />
                    <span className="sr-only">Rated {rating} out of 5</span>
                  </div>
                )}
                <blockquote className="mt-2.5 font-display text-[19px] font-normal italic leading-[1.4] text-ink line-clamp-6 lg:text-2xl lg:leading-[1.4]">“{String(review.comment).trim()}”</blockquote>
                <figcaption className="mt-2.5 text-[13px] leading-[18px] text-ink-muted">
                  {review.userName}
                  {place ? `, ${place}` : ''}
                  {review.verifiedPurchase === true ? ' · Verified purchase' : ''}
                  {product ? (
                    <button type="button" onClick={() => navigateToProduct(product.id)} className="mx-auto mt-0.5 block min-h-6 cursor-pointer underline decoration-1 underline-offset-4 line-clamp-1">{product.name}</button>
                  ) : review.productName ? (
                    <span className="mt-0.5 block line-clamp-1">{review.productName}</span>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>

        {quotes.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <button type="button" onClick={() => step(at - 1)} disabled={at === 0} aria-label="Previous review" className={arrow}>
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
            </button>
            <span className="sag-num text-[11.5px] tracking-[0.04em] text-ink-muted" aria-hidden="true">{at + 1} / {quotes.length}</span>
            <button type="button" onClick={() => step(at + 1)} disabled={at === quotes.length - 1} aria-label="Next review" className={arrow}>
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.25} />
            </button>
          </div>
        )}

        {approved.length > 0 && (
          <p className="sag-num mt-3 text-[11.5px] leading-4 tracking-[0.04em] text-ink-muted">
            {allAverage.toFixed(1)} out of 5 from {approved.length} {approved.length === 1 ? 'review' : 'reviews'}
          </p>
        )}
        {linked && (
          <button
            type="button"
            onClick={() => navigateToProduct(linked.id)}
            className="mt-2 inline-flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-ink underline decoration-1 underline-offset-4"
          >
            Read all reviews
          </button>
        )}
      </div>
    </section>
  );
};
