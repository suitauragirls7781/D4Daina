import React, { useRef, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { Star } from 'lucide-react';
import { AuraTitle, Icon } from '../aura';

/** Small star row filled to exactly the value (one decimal, same rule as the product page): 4.7 is four and seven tenths stars. */
const Stars: React.FC<{ value: number }> = ({ value }) => {
  const shown = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 10) / 10));
  return (
    <span className="aura-ac flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        return (
          <span key={i} className="relative block h-[15px] w-[15px] shrink-0">
            <Star className="block h-[15px] w-[15px]" strokeWidth={1.4} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="block h-[15px] w-[15px] max-w-none fill-current" strokeWidth={1.4} />
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

// The customer's own words, untouched. Only the SETTING of a short quote changes: its last word is the serif
// accent, where that reads naturally (a real word of four letters or more at the end of a short review).
const quoteParts = (comment: string): [string, string] => {
  const text = comment.trim();
  if (text.length > 110) return [text, ''];
  const match = text.match(/^(.*\s)([\p{L}][\p{L}'’-]{3,}[.!?…]*)$/su);
  return match ? [match[1], match[2]] : [text, ''];
};
const quoteSize = (length: number) => (length <= 70 ? 'xl' : length <= 150 ? 'lg' : length <= 260 ? 'md' : 'sm');

/**
 * Approved customer reviews. Hidden entirely until there is at least one.
 * One review at a time as a very large quote on a blush section (verified purchases first, the others one swipe or
 * arrow away); the next one rises in behind a mask. Then the real average and count. The same at every width.
 */
export const CustomerReviews: React.FC = () => {
  const { reviewsList = [] } = useAdmin();
  const { navigateToProduct, products = [] } = useShop();
  const [shown, setShown] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);

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
  const step = (to: number) => setShown(Math.max(0, Math.min(quotes.length - 1, to)));
  // A sideways swipe on the quote brings the next or the previous one (the page's own scroll is never touched)
  const onDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || e.pointerType === 'mouse') return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.4) step(at + (dx < 0 ? 1 : -1));
  };

  return (
    <section id="customer-reviews-section" aria-labelledby="customer-reviews-title" data-th="blush" className="w-full py-20 lg:py-28">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6 lg:px-8">
        <AuraTitle id="customer-reviews-title" label="Real customers" title="Customer" accent="reviews" size="lg" />

        {/* Every review is in the page; one is shown at a time, in the same place, so nothing jumps when it changes */}
        <div
          className="aura-rvq-wrap mt-9 lg:mt-12"
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          {quotes.map((review, index) => {
            const product = productOf(review);
            const rating = Number(review.rating) || 0;
            const place = reviewPlace(review.location);
            const comment = String(review.comment).trim();
            const [lead, accent] = quoteParts(comment);
            const on = index === at;
            return (
              <figure key={review.id} className="aura-rvq" data-on={on ? '' : undefined} data-size={quoteSize(comment.length)} aria-hidden={on ? undefined : true}>
                {rating > 0 && (
                  <div className="aura-rvq-s flex items-center">
                    <Stars value={rating} />
                    <span className="sr-only">Rated {rating} out of 5</span>
                  </div>
                )}
                <blockquote className="aura-rvq-q">
                  <span>“{lead}{accent && <em>{accent}</em>}”</span>
                </blockquote>
                <figcaption className="aura-rvq-c aura-mu">
                  <span className="aura-fg font-bold">{review.userName}</span>
                  {place ? `, ${place}` : ''}
                  {review.verifiedPurchase === true ? ' · Verified purchase' : ''}
                  {product ? (
                    <button type="button" onClick={() => navigateToProduct(product.id)} tabIndex={on ? 0 : -1} className="aura-fg mt-1 block min-h-6 max-w-full cursor-pointer text-left font-semibold underline decoration-[1.5px] underline-offset-4 line-clamp-1">{product.name}</button>
                  ) : review.productName ? (
                    <span className="mt-1 block line-clamp-1">{review.productName}</span>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 lg:mt-12">
          {quotes.length > 1 && (
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => step(at - 1)} disabled={at === 0} aria-label="Previous review" className="aura-rnd disabled:cursor-not-allowed disabled:opacity-30">
                <Icon name="arrow" className="rotate-180" />
              </button>
              <button type="button" onClick={() => step(at + 1)} disabled={at === quotes.length - 1} aria-label="Next review" className="aura-rnd disabled:cursor-not-allowed disabled:opacity-30">
                <Icon name="arrow" />
              </button>
              <span className="aura-num aura-mu ml-1.5 text-[14px] font-bold" aria-hidden="true">{at + 1} / {quotes.length}</span>
            </div>
          )}

          <div className="min-w-0 sm:ml-auto sm:text-right">
            {approved.length > 0 && (
              <p className="aura-num aura-mu text-[15px] leading-[1.4]">
                <b className="aura-fg text-[26px] font-extrabold leading-none tracking-[-0.03em]">{allAverage.toFixed(1)}</b> out of 5 from {approved.length} {approved.length === 1 ? 'review' : 'reviews'}
              </p>
            )}
            {linked && (
              <button type="button" onClick={() => navigateToProduct(linked.id)} className="aura-lk">
                Read all reviews
                <Icon name="arrow" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
