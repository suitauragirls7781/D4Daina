import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Zap, Sparkles, Truck, Tag, X } from 'lucide-react';
import * as motion from 'motion/react-client';

interface TickerItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  highlightText?: string;
  badge?: string;
}

const TICKER_ITEMS: TickerItem[] = [
  {
    id: 'upi-shipping',
    icon: <Zap className="w-3.5 h-3.5 text-[#F7F0E5] fill-[#D7B77A]" />,
    text: 'Extra ₹100 Flat OFF on UPI | Free Express Shipping Nationwide',
    badge: 'EXCLUSIVE',
  },
  {
    id: 'prepaid-discount',
    icon: <Tag className="w-3.5 h-3.5 text-[#F7F0E5]" />,
    text: 'Use Code: BLISS10 | Extra 10% OFF on Prepaid Orders',
    badge: 'LIMITED TIME',
  },
  {
    id: 'express-dispatch',
    icon: <Truck className="w-3.5 h-3.5 text-[#F7F0E5]" />,
    text: '24-48 Hour Dispatch Across India | Easy 7-Day Returns',
    badge: 'FAST SHIP',
  },
  {
    id: 'artisan-heritage',
    icon: <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />,
    text: 'Handcrafted in Artisan • 100% Authentic Premium Ethnic Wear',
    badge: 'ARTISAN ATELIER',
  },
];

export const RotatableBannerTicker: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Auto-rotate ticker every 3.5 seconds unless paused
  useEffect(() => {
    if (isPaused || !isVisible) return;
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % TICKER_ITEMS.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [isPaused, isVisible]);

  if (!isVisible) return null;

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + TICKER_ITEMS.length) % TICKER_ITEMS.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % TICKER_ITEMS.length);
  };

  const currentItem = TICKER_ITEMS[currentIndex];

  return (
    <div
      id="rotatable-banner-ticker"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full bg-[#5C0B1B] text-[#F7F0E5] py-1.5 px-3 sm:px-6 border-b border-[#D7B77A]/30 shadow-2xs select-none z-50 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-[11px] sm:text-xs font-semibold">
        {/* Left Control Chevron */}
        <button
          type="button"
          id="ticker-prev-btn"
          onClick={handlePrev}
          aria-label="Previous announcement"
          className="p-1 rounded-full text-[#F7F0E5]/70 hover:text-[#F7F0E5] hover:bg-[#180306]/10 transition cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F7F0E5]" />
        </button>

        {/* Center Rotatable Content */}
        <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden text-center py-0.5">
          <motion.div
            key={currentItem.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 truncate cursor-pointer hover:opacity-95 transition"
          >
            {currentItem.badge && (
              <span className="hidden xs:inline-block text-[9px] font-bold uppercase tracking-wider bg-[#5C0B1B] text-[#F7F0E5] border border-[#D7B77A]/40 px-1.5 py-0.2 rounded shrink-0">
                {currentItem.badge}
              </span>
            )}
            <span className="shrink-0">{currentItem.icon}</span>
            <span className="truncate tracking-wide font-medium text-[#F7F0E5] sm:font-semibold">
              {currentItem.text}
            </span>
          </motion.div>
        </div>

        {/* Right Controls: Next & Close */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            id="ticker-next-btn"
            onClick={handleNext}
            aria-label="Next announcement"
            className="p-1 rounded-full text-[#F7F0E5]/70 hover:text-[#F7F0E5] hover:bg-[#180306]/10 transition cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F7F0E5]" />
          </button>
          <button
            type="button"
            id="ticker-dismiss-btn"
            onClick={() => setIsVisible(false)}
            aria-label="Close announcement bar"
            className="p-1 rounded-full text-[#F7F0E5]/50 hover:text-[#F7F0E5] hover:bg-[#180306]/10 transition cursor-pointer ml-1 hidden sm:block"
          >
            <X className="w-3.5 h-3.5 text-[#D8C8B8]" />
          </button>
        </div>
      </div>
    </div>
  );
};
