import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { CATEGORIES_DATA } from '../data/categories';
import { COLLECTIONS, listDocs, watchCollection } from '../lib/dataStore';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Sparkles, ArrowUpRight } from 'lucide-react';

export const CategoryGrid: React.FC = () => {
  const { navigateToCategory, products: shopProducts = [] } = useShop();
  const { categories = [] } = useAdmin();
  const [liveCategoryCounts, setLiveCategoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const applyCategoryCounts = (data: any[] | null) => {
        const counts: Record<string, number> = {};

        if (data && data.length > 0) {
          data.forEach((p: any) => {
            if (p.category) {
              counts[p.category] = (counts[p.category] || 0) + 1;
            }
            if (p.isNewArrival) counts['New Arrivals'] = (counts['New Arrivals'] || 0) + 1;
            if (p.isBestSeller) counts['Best Sellers'] = (counts['Best Sellers'] || 0) + 1;
            if (p.isTrending) counts['Trending'] = (counts['Trending'] || 0) + 1;
            if (p.isFestive) counts['Festive Wear'] = (counts['Festive Wear'] || 0) + 1;
            if (p.isSale) counts['Sale'] = (counts['Sale'] || 0) + 1;
          });
        } else if (shopProducts && shopProducts.length > 0) {
          shopProducts.forEach((p) => {
            if (p.category) {
              counts[p.category] = (counts[p.category] || 0) + 1;
            }
            if (p.isNewArrival) counts['New Arrivals'] = (counts['New Arrivals'] || 0) + 1;
            if (p.isBestSeller) counts['Best Sellers'] = (counts['Best Sellers'] || 0) + 1;
            if (p.isTrending) counts['Trending'] = (counts['Trending'] || 0) + 1;
            if (p.isFestive) counts['Festive Wear'] = (counts['Festive Wear'] || 0) + 1;
            if (p.isSale) counts['Sale'] = (counts['Sale'] || 0) + 1;
          });
        }

        setLiveCategoryCounts(counts);
    };

    const fetchLiveCategoryCounts = async () => {
      try {
        applyCategoryCounts(await listDocs(COLLECTIONS.products));
      } catch (e) {
        console.warn('Error fetching live category counts from database:', e);
        applyCategoryCounts(null);
      }
    };

    fetchLiveCategoryCounts();

    const unsubscribe = watchCollection(COLLECTIONS.products, (rows) => {
      applyCategoryCounts(rows);
    });

    return () => {
      unsubscribe();
    };
  }, [shopProducts.length]);

  const getLiveCountTag = (catName: string) => {
    const count = liveCategoryCounts[catName] ?? shopProducts.filter(p => p.category === catName).length;
    if (count > 0) {
      return `${count}+ Designs`;
    }
    return `${count} Designs`;
  };

  // Use admin categories if available and active, otherwise fallback to CATEGORIES_DATA
  const displayCategories = categories && categories.length > 0 
    ? categories.filter(c => c.isActive !== false)
    : CATEGORIES_DATA.map((c, i) => ({ id: `cat-${i}`, ...c, isActive: true }));

  return (
    <section id="shop-by-category-section" className="py-6 sm:py-10 bg-[#180306]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#180306]/80 backdrop-blur-xs border border-[#D7B77A]/30 shadow-xs text-[#F7F0E5] text-[10px] font-bold uppercase tracking-widest mb-2">
            <Sparkles className="w-3 h-3 text-[#F7F0E5]" />
            Curated Wardrobe
          </div>
          <h2 className="font-serif text-2xl sm:text-4xl font-bold text-[#F7F0E5] tracking-tight">
            Shop by Category
          </h2>
        </div>

        {/* Categories Grid - Compact Circular Layout */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4 lg:gap-6">
          {displayCategories.map((cat) => (
            <button
              key={cat.id || cat.name}
              id={`category-card-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => navigateToCategory(cat.name as any)}
              className="group flex flex-col items-center gap-2 sm:gap-3 focus:outline-none cursor-pointer"
            >
              {/* Circular Image Container */}
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border border-[#D7B77A]/35 shadow-sm group-hover:shadow-md transition-all duration-300 bg-[#2A0710] relative">
                <img
                  src={getCleanImageUrl(cat.image)}
                  alt={`Suit Aura Girls - ${cat.name}`}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('data:image/svg+xml')) {
                      target.src = ELEGANT_PLACEHOLDER_SVG;
                    }
                  }}
                />
              </div>
              
              <div className="text-center">
                <h3 className="font-serif text-xs sm:text-sm font-bold text-[#F7F0E5] leading-tight">
                  {cat.name}
                </h3>
                <p className="text-[9px] sm:text-[10px] text-[#F7F0E5] uppercase tracking-widest font-bold mt-0.5">
                  {getLiveCountTag(cat.name)}
                </p>
              </div>
            </button>
          ))}
        </div>

      </div>
    </section>
  );
};
