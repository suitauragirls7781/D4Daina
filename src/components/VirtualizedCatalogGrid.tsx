import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { ShimmerCard } from './ShimmerCard';
import { useShop } from '../context/ShopContext';
import { Sparkles as SparklesIcon, ArrowUp as ArrowUpIcon, Search, Flame } from 'lucide-react';

interface VirtualizedCatalogGridProps {
  products: Product[];
  emptyMessage?: string;
  onResetFilters?: () => void;
  mobileColumns?: '1' | '2';
  bestsellerProducts?: Product[];
  isLoading?: boolean;
}

export const VirtualizedCatalogGrid: React.FC<VirtualizedCatalogGridProps> = ({
  products,
  onResetFilters,
  mobileColumns = '2',
  bestsellerProducts,
  isLoading
}) => {
  const { products: allStoreProducts } = useShop();
  const [showScrollTopBtn, setShowScrollTopBtn] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(12); // Lazy rendering buffer to make mobile instant

  // Listen to scroll to show/hide back-to-top button (throttled to fire only when crossing the threshold, NOT on every pixel)
  useEffect(() => {
    let crossedThreshold = false;
    
    const handleScrollThrottled = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const isAbove = scrollY > 700;
      
      if (isAbove !== crossedThreshold) {
        crossedThreshold = isAbove;
        setShowScrollTopBtn(isAbove);
      }
    };

    window.addEventListener('scroll', handleScrollThrottled, { passive: true });
    return () => window.removeEventListener('scroll', handleScrollThrottled);
  }, []);

  // Smooth lazy loading as user scrolls near the bottom of the grid
  useEffect(() => {
    const handleNearBottom = () => {
      if (visibleCount >= products.length) return;
      
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight;
      
      if (scrollHeight - scrollTop - clientHeight < 400) {
        // Expand visible buffer of items to maintain infinite-scroll experience smoothly
        setVisibleCount(prev => Math.min(products.length, prev + 12));
      }
    };

    window.addEventListener('scroll', handleNearBottom, { passive: true });
    return () => window.removeEventListener('scroll', handleNearBottom);
  }, [products.length, visibleCount]);

  // Reset lazy visible count whenever filtered products array changes
  useEffect(() => {
    setVisibleCount(12);
  }, [products]);

  // Top 4 Bestseller ethnic sets fallback when search results are zero
  const top4Bestsellers = useMemo(() => {
    if (bestsellerProducts && bestsellerProducts.length >= 4) {
      return bestsellerProducts.slice(0, 4);
    }
    const storeList = allStoreProducts && allStoreProducts.length > 0 ? allStoreProducts : [];
    const active = storeList.filter((p) => p.inStock);
    const taggedBestsellers = active.filter((p) => p.isBestSeller);
    if (taggedBestsellers.length >= 4) {
      return taggedBestsellers.slice(0, 4);
    }
    const sorted = [...active].sort((a, b) => (b.rating * (b.reviewCount || 1)) - (a.rating * (a.reviewCount || 1)));
    return sorted.slice(0, 4);
  }, [bestsellerProducts, allStoreProducts]);

  const totalItems = products.length;
  const itemsToRender = products.slice(0, visibleCount);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className={`grid gap-3 sm:gap-6 grid-cols-2 md:grid-cols-3 xl:grid-cols-4`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <ShimmerCard key={`shimmer-${i}`} />
        ))}
      </div>
    );
  }

  // Fallback Empty State (Breathtaking royal layout)
  if (totalItems === 0) {
    return (
      <div className="space-y-12 animate-in fade-in duration-500 w-full">
        {/* Zero Results Notice Box */}
        <div className="p-8 sm:p-12 text-center bg-[#2A0710] rounded-md border border-[#D7B77A]/35 shadow-sm space-y-5">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#5C0B1B] border border-[#D7B77A]/30 flex items-center justify-center text-[#F7F0E5] shadow-xs">
            <Search className="w-6 h-6 text-[#F7F0E5]" />
          </div>
          <div className="space-y-2">
            <h3 className="font-serif text-2xl font-bold text-[#F7F0E5]">
              No Masterpieces Found
            </h3>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/75 max-w-md mx-auto leading-relaxed">
              We couldn't locate any handcrafted designs matching your precise filter criteria. Please reset your preferences or browse our beloved signatures below.
            </p>
          </div>
          {onResetFilters && (
            <button
              type="button"
              id="zero-results-reset-btn"
              onClick={onResetFilters}
              className="px-6 py-3 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded text-xs font-black uppercase tracking-[0.15em] shadow-md transition-all duration-300 active:scale-95 cursor-pointer border border-[#D7B77A]/40"
            >
              Reset Filters & View All
            </button>
          )}
        </div>

        {/* Top 4 Bestseller Ethnic Sets */}
        {top4Bestsellers.length > 0 && (
          <div id="zero-results-bestsellers-section" className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-[#D7B77A]/20 pb-3.5">
              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] font-black text-[#F7F0E5] flex items-center gap-1.5 mb-1">
                  <SparklesIcon className="w-3.5 h-3.5 text-[#F7F0E5] fill-[#D7B77A]" />
                  MOST LOVED BY ARTISAN PATRONS
                </span>
                <h2 className="font-serif text-2xl font-bold text-[#F7F0E5]">
                  Bestselling Signature Outfits
                </h2>
              </div>
              <span className="text-xs font-bold text-[#F7F0E5] bg-[#D7B77A]/15 border border-[#D7B77A]/25 px-3 py-1 rounded-full self-start sm:self-auto flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#F7F0E5] fill-[#D7B77A] animate-pulse" />
                Customer Favorites
              </span>
            </div>

            {/* 4-Card Responsive Grid */}
            <div className={`grid gap-4.5 sm:gap-6 ${
              mobileColumns === '1' ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-2 lg:grid-cols-4'
            }`}>
              {top4Bestsellers.map((product) => (
                <ProductCard key={`bestseller-${product.id}`} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="optimized-catalog-container" className="relative w-full">
      {/* Active Results Summary Badge */}
      <div className="flex items-center justify-between pb-3 text-xs font-bold text-[#F7F0E5]/55 border-b border-[#D7B77A]/15 mb-6">
        <div className="flex items-center gap-2 text-[#F7F0E5]">
          <SparklesIcon className="w-3.5 h-3.5 text-[#F7F0E5]" />
          <span>Viewing <strong className="text-[#F7F0E5] font-extrabold">{totalItems}</strong> authentic designs</span>
        </div>
        <span className="text-[9px] uppercase tracking-[0.15em] bg-[#D7B77A]/15 text-[#F7F0E5] px-3 py-1 rounded-full border border-[#D7B77A]/20 font-black">
          ⚡ Smooth Scroll
        </span>
      </div>

      {/* Main High-Performance Hardware-Accelerated CSS Grid */}
      <div className="w-full">
        <div className={`grid gap-3.5 sm:gap-6 transition-all duration-300 ${
          mobileColumns === '1' 
            ? 'grid-cols-1 max-w-sm sm:max-w-md mx-auto w-full' 
            : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
        }`}>
          {itemsToRender.map((product) => (
            <div 
              key={product.id} 
              className="transform translate-y-0 opacity-100 transition-all duration-500 ease-out animate-in fade-in slide-in-from-bottom-4"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>

      {/* Elegant Infinite Loading Indicator */}
      {visibleCount < totalItems && (
        <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-7 h-7 border-2 border-[#D7B77A]/25 border-t-[#211C1A] rounded-full animate-spin"></div>
          <p className="text-xs text-[#F7F0E5]/55 font-serif italic">Scrolling reveals more exquisite couture designs...</p>
          <button
            onClick={() => setVisibleCount(prev => Math.min(totalItems, prev + 12))}
            className="mt-2 px-5 py-2.5 bg-[#2A0710] hover:bg-[#5C0B1B] text-[#F7F0E5] hover:text-[#F7F0E5] border border-[#D7B77A]/50 hover:border-[#D7B77A]/40 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 cursor-pointer shadow-3xs"
          >
            Show All Outfits ({totalItems - visibleCount} Left)
          </button>
        </div>
      )}

      {/* Floating Scroll-to-Top Button */}
      {showScrollTopBtn && (
        <button
          type="button"
          id="optimized-scroll-top-btn"
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[8000] p-2.5 sm:p-3 rounded-full bg-[#5C0B1B]/90 hover:bg-[#5C0B1B] backdrop-blur-md text-[#F7F0E5] shadow-md active:scale-95 transition-all duration-300 flex items-center gap-1.5 text-xs font-black border border-[#D7B77A]/40 cursor-pointer"
          title="Back to Top"
        >
          <ArrowUpIcon className="w-4 h-4 text-[#F7F0E5]" />
          <span className="hidden sm:inline text-[10px] tracking-widest uppercase text-[#F7F0E5]">Top</span>
        </button>
      )}
    </div>
  );
};
