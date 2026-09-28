import React from 'react';
import { useShop } from '../context/ShopContext';
import { Sparkles, ArrowRight, Compass, Crown, ShieldCheck, Flame } from 'lucide-react';

export const BrandHeroIntroCard: React.FC = () => {
  const { navigateToCategory } = useShop();

  return (
    <section id="brand-story-section" className="py-12 sm:py-20 bg-[#5C0B1B] text-[#F7F0E5] relative overflow-hidden border-y border-[#D7B77A]/30">
      
      {/* Background Decorative Motif */}
      <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#9A6A3A_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Editorial Brand Image */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-md overflow-hidden border border-[#D7B77A]/40 shadow-2xl aspect-[4/5] sm:aspect-[3/4]">
              <img
                src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1200&auto=format&fit=crop"
                alt="Suit Aura Girls Handcrafted Handloom"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#5C0B1B] via-transparent to-transparent opacity-60" />
              
              {/* Floating Badge on Image */}
              <div className="absolute bottom-4 left-4 right-4 p-4 rounded bg-[#5C0B1B]/90 backdrop-blur-md border border-[#D7B77A]/40">
                <p className="text-[11px] font-bold tracking-[0.2em] text-[#F7F0E5] uppercase">
                  Jacquard & Handblock Craft
                </p>
                <p className="text-xs text-[#F7F0E5] mt-0.5 font-serif italic">
                  Crafted by master weavers in Sanganeri & Chanderi artisan clusters.
                </p>
              </div>
            </div>

            {/* Accent Gold Frame Offset */}
            <div className="absolute -bottom-3 -right-3 w-full h-full border-2 border-[#D7B77A]/30 rounded-md -z-10 hidden sm:block" />
          </div>

          {/* Brand Story Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#D7B77A]/15 border border-[#D7B77A]/40 text-[#F7F0E5] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>THE ART OF SLOW LUXURY</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#F7F0E5] leading-[1.15]">
              Handcrafted Ethnic Wear for the Modern Connoisseur
            </h2>

            <p className="font-serif italic text-lg sm:text-xl text-[#D8C8B8] font-normal">
              &ldquo;We don&apos;t make mass clothing. We craft quiet, timeless drapes that feel like second skin.&rdquo;
            </p>

            <p className="text-sm sm:text-base text-[#F7F0E5]/85 leading-relaxed font-normal">
              At <strong className="text-[#F7F0E5] font-semibold">Suit Aura Girls</strong>, every suit set and kurta is woven in small artisanal batches using 100% natural cambric cotton, authentic Organza, and hand-loomed Chanderi silk. Rooted in traditional Artisan block prints and Banarasi zari work, our pieces balance regal heritage with weightless, breathable comfort.
            </p>

            {/* Key Craft Highlights */}
            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              <div className="p-3 rounded bg-[#180306]/5 border border-[#D7B77A]/20">
                <Crown className="w-5 h-5 text-[#F7F0E5] mx-auto mb-1" />
                <h4 className="text-xs font-bold text-[#F7F0E5]">Small Batch</h4>
                <p className="text-[10px] text-[#D8C8B8] mt-0.5">Exclusive Editions</p>
              </div>

              <div className="p-3 rounded bg-[#180306]/5 border border-[#D7B77A]/20">
                <ShieldCheck className="w-5 h-5 text-[#F7F0E5] mx-auto mb-1" />
                <h4 className="text-xs font-bold text-[#F7F0E5]">Pure Weaves</h4>
                <p className="text-[10px] text-[#D8C8B8] mt-0.5">100% Lab Tested</p>
              </div>

              <div className="p-3 rounded bg-[#180306]/5 border border-[#D7B77A]/20">
                <Flame className="w-5 h-5 text-[#F7F0E5] mx-auto mb-1" />
                <h4 className="text-xs font-bold text-[#F7F0E5]">Artisan Origin</h4>
                <p className="text-[10px] text-[#D8C8B8] mt-0.5">Direct from Loom</p>
              </div>
            </div>

            {/* CTA Action */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <button
                type="button"
                onClick={() => navigateToCategory('All')}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#D7B77A] hover:bg-[#a37e47] text-[#F7F0E5] font-bold text-xs uppercase tracking-[0.18em] rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>EXPLORE ALL COLLECTIONS</span>
                <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
              </button>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
