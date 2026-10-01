import React from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { Star } from 'lucide-react';

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
    <section id="customer-reviews-section" className="w-full bg-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center mb-8 sm:mb-10">
          <p className="sag-eyebrow">Reviews</p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">Loved by our customers</h2>
          <div className="mt-3 flex items-center gap-2 text-sm text-[#2A1A26]/70">
            <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= Math.round(average) ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/35'}`} />)}</span>
            <span>{average.toFixed(1)} average</span>
          </div>
        </div>

        <div className="sag-scroll-x flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {reviews.map((review) => {
            const product = products.find((p) => String(p.id) === String(review.productId));
            return (
              <article key={review.id} className="sag-card p-5 sm:p-6 shrink-0 w-[82%] sm:w-[60%] md:w-auto flex flex-col">
                <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= (Number(review.rating) || 0) ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/35'}`} />)}</span>
                <p className="mt-3 text-[15px] leading-relaxed text-[#2A1A26]/80 line-clamp-5">“{review.comment}”</p>
                <div className="mt-auto pt-4">
                  <p className="text-sm font-semibold text-[#2A1A26]">{review.userName}</p>
                  {product ? (
                    <button onClick={() => navigateToProduct(product.id)} className="text-xs text-[#4B1D3F] hover:underline cursor-pointer text-left">{product.name}</button>
                  ) : review.productName ? (
                    <p className="text-xs text-[#2A1A26]/65">{review.productName}</p>
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
