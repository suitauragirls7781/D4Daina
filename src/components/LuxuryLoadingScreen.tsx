import React, { useState, useEffect } from 'react';
import { Crown, Sparkles, Gem } from 'lucide-react';

const LUXURY_PHRASES = [
  'Weaving Pure Chanderi & Handloom Silks...',
  'Curating Handcrafted Artisan Gotapatti...',
  'Preparing Bespoke Festive Silhouettes...',
  'Unveiling Royal Boutique Collection...'
];

export const LuxuryLoadingScreen: React.FC = () => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [progress, setProgress] = useState(15);

  // Cycle craftsmanship phrases smoothly
  useEffect(() => {
    const phraseInterval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % LUXURY_PHRASES.length);
    }, 1200);

    return () => clearInterval(phraseInterval);
  }, []);

  // Smooth realistic progress animation
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 96) return 96;
        const jump = Math.floor(Math.random() * 14) + 6;
        return Math.min(prev + jump, 96);
      });
    }, 280);

    return () => clearInterval(progressInterval);
  }, []);

  return (
    <div
      id="luxury-curtain-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading Suit Aura Girls luxury storefront"
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-between p-6 sm:p-12 select-none overflow-hidden bg-[#16030A]"
    >
      {/* 1. Deep Royal Wine Radial Ambient Lighting */}
      <div className="absolute inset-0 bg-[#5C0B1B] pointer-events-none" />

      {/* 2. Delicate Antique Gold Luxury Outer Hairline Frame with Corner Filigrees */}
      <div className="absolute inset-3 sm:inset-6 border border-[#D7B77A]/25 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
        {/* Top Corners */}
        <div className="flex justify-between items-center text-[#F7F0E5]/70 text-xs sm:text-sm font-serif">
          <Gem className="w-3 h-3 text-[#E8D2A4]" aria-hidden="true" />
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.35em] text-[#F7F0E5]/80 font-medium hidden xs:inline">
            HAUTE ETHNIC ATELIER
          </span>
          <Gem className="w-3 h-3 text-[#E8D2A4]" aria-hidden="true" />
        </div>

        {/* Bottom Corners */}
        <div className="flex justify-between items-center text-[#F7F0E5]/70 text-xs sm:text-sm font-serif">
          <Gem className="w-3 h-3 text-[#E8D2A4]" aria-hidden="true" />
          <span className="text-[8.5px] sm:text-[9.5px] uppercase tracking-[0.3em] text-[#F7F0E5]/70 font-medium hidden xs:inline">
            EST. IN ARTISAN, INDIA
          </span>
          <Gem className="w-3 h-3 text-[#E8D2A4]" aria-hidden="true" />
        </div>
      </div>

      {/* Subtle floating ambient light dots */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#D7B77A]/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#D7B77A]/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* Header Top Spacer */}
      <div className="relative z-10 pt-2 sm:pt-4 flex items-center justify-center gap-2 text-[#F7F0E5]">
        <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-[#F7F0E5] animate-bounce" />
      </div>

      {/* Center Stage: Royal Brand Medallion & Title */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md my-auto px-4">
        
        {/* Official Wide Suit Aura Girls Logo */}
        <div className="relative w-64 sm:w-80 aspect-[2/1] mb-6 sm:mb-8 flex items-center justify-center border border-[#D7B77A]/35 p-2">
          <img
            src="/suit-aura-logo.png"
            alt="Suit Aura Girls logo"
            className="w-full h-full object-contain"
          />
          <div className="absolute -top-2 -right-2 text-[#F7F0E5] animate-pulse">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Royal Tagline */}
        <p className="text-[10px] sm:text-xs tracking-[0.38em] uppercase text-[#F7F0E5] font-semibold mb-6 sm:mb-8">
          Pure Luxury Artisan Couture
        </p>

        {/* Golden Laser Loading Bar */}
        <div className="w-56 sm:w-72 flex flex-col items-center gap-2 mb-4">
          <div className="w-full h-[3px] bg-[#5C0B1B] rounded-full overflow-hidden border border-[#D7B77A]/40 p-[0.5px]">
            <div
              className="h-full bg-gradient-to-r from-[#D7B77A] via-[#D7B77A] to-[#D7B77A] rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_#C7A77A]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Dynamic Craftsmanship Status Text */}
          <div className="h-6 flex items-center justify-center overflow-hidden">
            <p
              key={phraseIndex}
              className="text-[11px] sm:text-xs text-[#F7F0E5]/90 font-medium tracking-wider italic animate-in fade-in slide-in-from-bottom-1 duration-500"
            >
              {LUXURY_PHRASES[phraseIndex]}
            </p>
          </div>
        </div>

      </div>

      {/* Footer Artisanal Guarantee */}
      <div className="relative z-10 pb-2 sm:pb-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5C0B1B]/60 border border-[#D7B77A]/30 text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-[#F7F0E5] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D7B77A] animate-ping" />
          <span>Handcrafted in Artisan • Express Air Dispatch</span>
        </div>
      </div>
    </div>
  );
};
