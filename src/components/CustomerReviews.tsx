import React from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { Star } from 'lucide-react';
import { HOME_SECTION, HomeSectionHeader } from './HomeSections';

/** Star row filled to exactly the value (one decimal, same rule as the product page): 4.7 is four and seven tenths stars. */
const Stars: React.FC<{ value: number }> = ({ value }) => {
  const shown = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 10) / 10));
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        return (
          <span key={i} className="relative block shrink-0 w-4 h-4">
            <Star className="block w-4 h-4 fill-sunken-deep text-sunken-deep" />
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

/** Approved customer reviews. Hidden entirely until there is at least one. */
export const CustomerReviews: React.FC = () => {
  const { reviewsList = [] } = useAdmin();
  const { navigateToProduct, products = [] } = useShop();

  const reviews = reviewsList
    .filter((r) => r.status === 'approved' && String(r.comment || '').trim())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);

  if (reviews.length === 0) return null;

  const average = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;

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
