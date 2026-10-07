import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { HOME_SECTION, HomeSectionHeader } from './HomeSections';

/** Star row filled to exactly the value (one decimal, same rule as the product page): 4.7 is four and seven tenths stars. */
const Stars: React.FC<{ value: number; onDark?: boolean }> = ({ value, onDark = false }) => {
  const shown = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 10) / 10));
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        return (
          <span key={i} className="relative block shrink-0 w-4 h-4">
            <Star className={`block w-4 h-4 ${onDark ? 'fill-white/20 text-transparent' : 'fill-sunken-deep text-sunken-deep'}`} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="block max-w-none w-4 h-4 fill-star text-star" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
};

/** True from Tailwind's `lg` width up: the desktop keeps the row of review cards. */
const useIsDesktop = () => {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1024px)').matches));
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return;
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return desktop;
};

// A place the code fills in when the customer gave none; it is not shown as the customer's place
const reviewPlace = (location?: string) => {
  const text = (location || '').trim();
  return text && text !== 'Artisan, India' ? text : '';
};

/**
 * Approved customer reviews. Hidden entirely until there is at least one.
 * Phones and tablets (owner's pick 3): one review as a large quote on a dark block, the others one swipe away,
 * then the real average and count. Desktop keeps the row of cards.
 */
export const CustomerReviews: React.FC = () => {
  const { reviewsList = [] } = useAdmin();
  const { navigateToProduct, products = [] } = useShop();
  const isDesktop = useIsDesktop();
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const reviews = reviewsList
    .filter((r) => r.status === 'approved' && String(r.comment || '').trim())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);

  if (reviews.length === 0) return null;

  const average = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;

  if (!isDesktop) {
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
    const arrow = 'flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-on-dark cursor-pointer transition-colors hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed';

    return (
      <section id="customer-reviews-section" aria-labelledby="customer-reviews-title" className="w-full pt-5 pb-1">
        <div className="mx-auto max-w-2xl px-3.5 sm:px-6">
          <div className="flex flex-col gap-2.5 rounded-[28px] bg-dark p-4 text-on-dark sm:p-6">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <h2 id="customer-reviews-title" className="font-sans text-[11px] font-extrabold uppercase leading-4 tracking-[0.08em] text-highlight">
                <span className="sr-only">Customer reviews: </span>Real customers
              </h2>
              {quotes.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="sag-num mr-0.5 text-xs font-semibold text-on-dark-muted" aria-hidden="true">{at + 1} / {quotes.length}</span>
                  <button type="button" onClick={() => step(at - 1)} disabled={at === 0} aria-label="Previous review" className={arrow}>
                    <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => step(at + 1)} disabled={at === quotes.length - 1} aria-label="Next review" className={arrow}>
                    <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            {/* One review per view; a swipe or the arrows bring the next real one */}
            <div ref={stripRef} onScroll={onScroll} className="sag-scroll-x scroll-px-0! flex gap-4 overflow-x-auto">
              {quotes.map((review) => {
                const product = productOf(review);
                const rating = Number(review.rating) || 0;
                const place = reviewPlace(review.location);
                return (
                  <figure key={review.id} className="flex w-full shrink-0 flex-col gap-2.5">
                    {rating > 0 && (
                      <div className="flex items-center">
                        <Stars value={rating} onDark />
                        <span className="sr-only">Rated {rating} out of 5</span>
                      </div>
                    )}
                    <blockquote className="text-[17px] font-bold leading-[1.4] text-on-dark line-clamp-6 sm:text-xl">“{String(review.comment).trim()}”</blockquote>
                    <figcaption className="text-[13px] leading-[18px] text-on-dark-muted">
                      <b className="font-bold text-on-dark">{review.userName}</b>
                      {place ? ` · ${place}` : ''}
                      {review.verifiedPurchase === true ? ' · Verified purchase' : ''}
                      {product ? (
                        <button type="button" onClick={() => navigateToProduct(product.id)} className="mt-0.5 block min-h-6 cursor-pointer text-left underline underline-offset-2 line-clamp-1">{product.name}</button>
                      ) : review.productName ? (
                        <span className="mt-0.5 block line-clamp-1">{review.productName}</span>
                      ) : null}
                    </figcaption>
                  </figure>
                );
              })}
            </div>

            {(approved.length > 0 || linked) && (
              <>
                <div className="h-px w-full bg-white/10" aria-hidden="true" />
                <div className="flex items-center justify-between gap-3">
                  {approved.length > 0 ? (
                    <p className="sag-num">
                      <b className="block text-xl font-extrabold leading-6 text-on-dark">{allAverage.toFixed(1)} <span aria-hidden="true">★</span><span className="sr-only"> out of 5</span></b>
                      <span className="block text-xs leading-4 text-on-dark-muted">from {approved.length} {approved.length === 1 ? 'review' : 'reviews'}</span>
                    </p>
                  ) : <span />}
                  {linked && (
                    <button type="button" onClick={() => navigateToProduct(linked.id)} className="inline-flex h-[42px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full bg-sun px-4 text-sm font-bold text-ink">
                      Read all reviews
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="customer-reviews-section" aria-labelledby="customer-reviews-title" className={`${HOME_SECTION} bg-white`}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader titleId="customer-reviews-title" title="Customer reviews" className="mb-2" />
          {/* The average is worked out from the reviews shown below, nothing else */}
          <p className="mb-4 lg:mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-ink">
            <Stars value={average} />
            <span className="sag-num">
              <span className="font-semibold">{average.toFixed(1)}</span>
              <span className="text-ink-muted"> · average of our {reviews.length === 1 ? 'latest review' : `${reviews.length} latest reviews`}</span>
            </span>
          </p>
        </div>

        <div className="sag-scroll-x flex md:grid md:grid-cols-3 gap-3 lg:gap-5 overflow-x-auto md:overflow-visible px-4 sm:px-6 lg:px-8 pb-1">
          {reviews.map((review) => {
            const product = products.find((p) => String(p.id) === String(review.productId));
            const rating = Number(review.rating) || 0;
            return (
              <article key={review.id} className="sag-card p-4 lg:p-5 shrink-0 w-[82%] sm:w-[48%] md:w-auto flex flex-col">
                <div className="flex items-center gap-2">
                  <Stars value={rating} />
                  <span className="sr-only">Rated {rating} out of 5</span>
                </div>
                <p className="mt-2 text-[15px] leading-[22px] text-ink line-clamp-5">“{review.comment}”</p>
                <div className="mt-auto pt-3">
                  <p className="text-sm leading-5 font-semibold text-ink">{review.userName}</p>
                  {product ? (
                    <button type="button" onClick={() => navigateToProduct(product.id)} className="sag-link -mt-1 text-[13px] text-left">{product.name}</button>
                  ) : review.productName ? (
                    <p className="text-[13px] leading-[18px] text-ink-muted">{review.productName}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
