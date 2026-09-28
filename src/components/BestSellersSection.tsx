import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { Flame, ArrowRight, Sparkles } from 'lucide-react';

export const BestSellersSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  
  const activeProducts = products.filter((p) => p.inStock);
  const bestSellersList = activeProducts.filter((p) => p.isBestSeller && !p.isNewArrival);
  const bestSellers = (bestSellersList.length > 0 
    ? bestSellersList 
    : activeProducts.filter(p => !p.isNewArrival)
  ).slice(0, 4);

  // Hide the whole section instead of showing an empty heading
  if (bestSellers.length === 0) return null;

  return (
    <section id="best-sellers-section" className="py-8 sm:py-14 bg-[#180306] border-b border-[#D7B77A]/25">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 sm:mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2.5 border border-[#D7B77A]/40">
              <Flame className="w-3.5 h-3.5 text-[#F7F0E5]" />
              <span>MOST CHERISHED</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F7F0E5] tracking-tight">
              Best Sellers
            </h2>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/80 mt-2 max-w-lg font-normal leading-relaxed">
              The iconic silhouettes our community wears on repeat for effortless grace, compliment-worthy drapes, and rich handloom textures.
            </p>
          </div>

          <button
            id="view-all-bestsellers-btn"
            onClick={() => navigateToCategory('Best Sellers')}
            className="px-5 py-2.5 bg-[#180306] text-[#F7F0E5] hover:bg-[#5C0B1B]/10 border border-[#D7B77A]/40 rounded text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 self-start sm:self-auto"
          >
            <span>VIEW ALL BEST SELLERS</span>
            <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 lg:gap-8">
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

      </div>
    </section>
  );
};

export const FestiveCollectionSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const activeProducts = products.filter((p) => p.inStock);
  const festiveList = activeProducts.filter((p) => (p.isFestive || p.category === 'Festive Wear') && !p.isNewArrival && !p.isBestSeller);
  const festiveItems = (festiveList.length > 0 
    ? festiveList 
    : activeProducts.filter(p => !p.isNewArrival && !p.isBestSeller)
  ).slice(0, 4);

  if (festiveItems.length === 0) return null;

  return (
    <section id="festive-collection-section" className="py-8 sm:py-14 bg-[#180306] border-b border-[#D7B77A]/25">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 sm:mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2.5 border border-[#D7B77A]/40">
              <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />
              <span>ROYAL FESTIVE EDIT</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F7F0E5] tracking-tight">
              Celebrate In Style
            </h2>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/80 mt-2 max-w-lg font-normal leading-relaxed">
              Intricate zardozi, shimmering gota patti, and rich Chanderi drapes designed for festive grandeur and wedding soirees.
            </p>
          </div>

          <button
            id="view-all-festive-btn"
            onClick={() => navigateToCategory('Festive Wear')}
            className="px-5 py-2.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] border border-[#D7B77A]/50 rounded text-xs font-sans font-bold tracking-wider uppercase transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 self-start sm:self-auto"
          >
            <span>SHOP FESTIVE</span>
            <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 lg:gap-8">
          {festiveItems.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

      </div>
    </section>
  );
};
