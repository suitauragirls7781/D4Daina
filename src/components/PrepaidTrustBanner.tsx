import React from 'react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Sparkles, ArrowRight } from 'lucide-react';

export const PrepaidTrustBanner: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();

  const categories = [
    { name: 'Suits', label: 'Suits & Sets', tag: 'Royal Chanderi' },
    { name: 'Kurtis', label: 'Classic Kurtis', tag: 'Handblock Cambric' },
    { name: 'Anarkali', label: 'Kalidaar Anarkali', tag: 'Heritage Flares' },
    { name: 'Dresses', label: 'Festive Dresses', tag: 'Indo-Western drapes' }
  ];
  const categoryAliases: Record<string, string[]> = {
    Suits: ['Suits', 'Suit Sets'],
    Kurtis: ['Kurtis'],
    Anarkali: ['Anarkali', 'Anarkalis'],
    Dresses: ['Dresses'],
  };
  const getCategoryProducts = (categoryName: string) => {
    const matchingCategories = categoryAliases[categoryName] || [categoryName];
    return products.filter((product) =>
      product.inStock &&
      matchingCategories.includes(product.category) &&
      (Array.isArray(product.images) && product.images.some((image) => Boolean(image)) || Boolean(product.image))
    );
  };

  const getCategoryImage = (categoryName: string) => {
    const matchedProduct = getCategoryProducts(categoryName)[0];
    const image = matchedProduct?.images?.find(Boolean) || matchedProduct?.image;
    return image ? getCleanImageUrl(image, 160) : ELEGANT_PLACEHOLDER_SVG;
  };

  const getCategoryCount = (categoryName: string) => {
    return getCategoryProducts(categoryName).length;
  };

  const visibleCategories = categories.filter((category) => getCategoryCount(category.name) > 0);
  if (visibleCategories.length === 0) return null;

  return (
    <section
      id="silhouette-curations-strip"
      className="w-full bg-[#120205] pt-6 pb-5 sm:pt-9 sm:pb-8 border-b border-antique-gold/20 select-none"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between gap-3 px-4 sm:px-6 lg:px-8 mb-4 sm:mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-antique-gold font-semibold">
              <Sparkles className="w-3 h-3" />
              <span>Artisan Craft Legacies</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#E8D2A4] leading-tight">
              Shop By Silhouette
            </h2>
          </div>
          <button
            onClick={() => navigateToCategory('All')}
            className="shrink-0 text-[11px] sm:text-xs text-bottle-maroon hover:text-antique-gold font-semibold uppercase tracking-[0.18em] flex items-center gap-1 transition-colors group cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Story-style circles: swipe on mobile, evenly spread on larger screens */}
        <div className="flex gap-5 sm:gap-8 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleCategories.map((cat) => {
            const count = getCategoryCount(cat.name);
            const coverImage = getCategoryImage(cat.name);

            return (
              <button
                key={cat.name}
                id={`silhouette-card-${cat.name.toLowerCase().replace(/s+/g, '-')}`}
                onClick={() => navigateToCategory(cat.name as 'Suits' | 'Kurtis' | 'Anarkali' | 'Dresses')}
                className="snap-start shrink-0 flex flex-col items-center text-center group cursor-pointer w-[84px] sm:w-[112px] transition-transform duration-200 active:scale-95"
              >
                <div className="w-[76px] h-[76px] sm:w-[104px] sm:h-[104px] rounded-full p-[2.5px] bg-gradient-to-tr from-[#D7B77A] via-[#E9D7B9] to-[#D7B77A] group-hover:rotate-6 transition-transform duration-500">
                  <div className="w-full h-full rounded-full p-[3px] bg-[#120205]">
                    <div className="w-full h-full rounded-full overflow-hidden bg-ivory">
                      <img
                        src={coverImage}
                        alt={cat.label}
                        className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-500 ease-out"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
                <h3 className="mt-2 font-serif text-[13px] sm:text-sm font-semibold text-bottle-maroon group-hover:text-antique-gold transition-colors leading-tight line-clamp-2">
                  {cat.label}
                </h3>
                <span className="mt-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-antique-gold">
                  {count} {count === 1 ? 'Design' : 'Designs'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
