import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { TrendingUp, ArrowRight } from 'lucide-react';

export const TrendingNowSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  
  const activeProducts = products.filter((p) => p.inStock);
  const trendingList = activeProducts.filter((p) => p.isTrending && !p.isNewArrival);
  const trendingProducts = (trendingList.length > 0 
    ? trendingList 
    : activeProducts.filter(p => !p.isNewArrival)
  ).slice(0, 4);

  // Hide the whole section instead of showing an empty heading
  if (trendingProducts.length === 0) return null;

  return (
    <section id="trending-now-section" className="py-8 sm:py-14 bg-[#180306] border-b border-[#D7B77A]/25">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 sm:mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2.5 border border-[#D7B77A]/40">
              <TrendingUp className="w-3.5 h-3.5 text-[#F7F0E5]" />
              <span>IN THE SPOTLIGHT</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F7F0E5] tracking-tight">
              Trending Now
            </h2>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/80 mt-2 max-w-lg font-normal leading-relaxed">
              Explore the most-loved ethnic silhouettes, floral prints, and modern co-ord sets currently turning heads across India.
            </p>
          </div>

          <button
            id="view-all-trending-btn"
            onClick={() => navigateToCategory('Trending')}
            className="px-5 py-2.5 bg-[#180306] text-[#F7F0E5] hover:bg-[#5C0B1B]/10 border border-[#D7B77A]/40 rounded text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 self-start sm:self-auto"
          >
            <span>VIEW ALL TRENDING</span>
            <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 lg:gap-8">
          {trendingProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

      </div>
    </section>
  );
};
