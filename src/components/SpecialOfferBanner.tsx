import React from 'react';
import { useShop } from '../context/ShopContext';
import { Sparkles, ArrowRight, Tag } from 'lucide-react';

export const SpecialOfferBanner: React.FC = () => {
  const { navigateToCategory } = useShop();

  return (
    <section id="special-offer-banner-section" className="py-4 sm:py-6 bg-[#120205]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-md overflow-hidden bg-gradient-to-r from-[#5C0B1B] via-[#5C0B1B] to-[#5C0B1B] text-[#F7F0E5] shadow-lg p-6 sm:p-8 lg:p-10 border border-rose-900/40">
          
          {/* Decorative Atmospheric Elements */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-[#D7B77A]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 bg-[#D8C8B8]/200/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            <div className="lg:col-span-8 space-y-3 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-\[#FAF7F2\]/10 backdrop-blur-md border border-[#D7B77A]/15 text-[#F7F0E5] text-[10px] font-bold uppercase tracking-[0.15em]">
                <Tag className="w-3 h-3" />
                Limited Time Offer
              </div>

              <h2 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF7F9] leading-tight">
                THE AURA SALE
              </h2>

              <p className="text-xl sm:text-2xl font-serif text-[#F7F0E5] font-semibold tracking-wide">
                Up to 40% OFF
              </p>

              <p className="text-xs sm:text-sm text-rose-100/90 max-w-xl font-light leading-relaxed">
                Elevate your wardrobe with handcrafted designs at celebratory prices.
              </p>

              <div className="pt-1">
                <button
                  id="special-offer-shop-sale-btn"
                  onClick={() => navigateToCategory('Sale')}
                  className="px-6 py-2.5 bg-[#D7B77A] hover:bg-[#2A0710] text-[#3D0C1B] font-bold text-[10px] sm:text-xs tracking-widest uppercase rounded-lg shadow-md hover:shadow-lg transition-all duration-200 inline-flex items-center gap-2 group"
                >
                  <span>SHOP SALE</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right Feature Highlight Box */}
            <div className="lg:col-span-4 flex justify-center">
              <div className="bg-\[#FAF7F2\]/5 backdrop-blur-md border border-[#D7B77A]/15 rounded-lg p-4 text-center max-w-[240px] w-full shadow-inner">
                <div className="w-10 h-10 rounded-full bg-[#D7B77A]/10 border border-[#D7B77A]/30 text-[#F7F0E5] mx-auto flex items-center justify-center mb-2">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h4 className="font-serif text-sm font-bold text-[#F7F0E5] mb-0.5">
                  Extra 15% Off
                </h4>
                <p className="text-[10px] text-rose-100/70 mb-2">
                  First Order
                </p>
                <div className="bg-\[#FAF7F2\]/10 border border-dashed border-[#D7B77A]/15 py-1 px-3 rounded text-[10px] font-mono font-bold tracking-widest text-[#FFF7F9]">
                  FIRST15
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
