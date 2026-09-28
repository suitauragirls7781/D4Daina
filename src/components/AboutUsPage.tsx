import React from 'react';
import { useShop } from '../context/ShopContext';
import { Sparkles, Heart, ShieldCheck, Award, Users, ChevronRight, ArrowRight } from 'lucide-react';

export const AboutUsPage: React.FC = () => {
  const { setActivePage, navigateToCategory } = useShop();

  return (
    <div id="about-us-page" className="py-12 sm:py-16 bg-[#120205]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[#E8D2A4]/55">
          <button onClick={() => setActivePage('home')} className="hover:text-[#E8D2A4]">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-[#D7B77A]" />
          <span className="text-[#E8D2A4] font-semibold">About Us</span>
        </nav>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs uppercase tracking-[0.25em] font-semibold text-[#D7B77A]">
            Our Story & Craft
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#E8D2A4]">
            Elegance That Feels Like You
          </h1>
          <p className="text-sm sm:text-base text-[#F7F0E5]/75 leading-relaxed">
            Suit Aura Girls was born from a singular passion: celebrating modern Indian womanhood with ethnic silhouettes that harmonize regal heritage with supreme everyday comfort.
          </p>
        </div>

        {/* Narrative Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-[#180306] border-y border-[#D7B77A]/30 py-7 sm:py-10">
          <div className="space-y-4">
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#E8D2A4]">
              Handcrafted With Love in India
            </h2>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/75 leading-relaxed">
              Every Suit Aura Girls ensemble is meticulously tailored using breathable pure cottons, fluid Georgettes, lustrous Chanderi silks, and modal blends. We work directly with master artisans across Artisan, Surat, and Lucknow to bring timeless zardozi, hand block prints, and gota patti craftsmanship directly to your doorstep.
            </p>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/75 leading-relaxed">
              We believe luxury should never be cumbersome. Our silhouettes are designed to flatter all Indian body shapes from sizes XS to XXL with graceful drapes that move effortlessly with you.
            </p>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80"
              alt="Craftsmanship"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 bg-[#180306] border-t border-[#D7B77A]/35 space-y-2.5 text-center">
            <div className="w-12 h-12 rounded-full bg-[#2A0710]/20 border border-[#D7B77A]/15 text-[#F7F0E5] flex items-center justify-center mx-auto">
              <Award className="w-6 h-6 text-[#D7B77A]" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-[#E8D2A4]">Premium Quality</h3>
            <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
              Non-bleeding azo-free dyes, pre-shrunk fabrics, and reinforced double-needle seam stitching.
            </p>
          </div>

          <div className="p-6 bg-[#180306] border-t border-[#D7B77A]/35 space-y-2.5 text-center">
            <div className="w-12 h-12 rounded-full bg-[#2A0710]/20 border border-[#D7B77A]/15 text-[#F7F0E5] flex items-center justify-center mx-auto">
              <Heart className="w-6 h-6 text-[#D7B77A]" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-[#E8D2A4]">Feminine Comfort</h3>
            <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
              Tailored for all-day ease from morning rituals and boardroom meetings to festive celebrations.
            </p>
          </div>

          <div className="p-6 bg-[#180306] border-t border-[#D7B77A]/35 space-y-2.5 text-center">
            <div className="w-12 h-12 rounded-full bg-[#2A0710]/20 border border-[#D7B77A]/15 text-[#F7F0E5] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-[#D7B77A]" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-[#E8D2A4]">Ethical & Fair</h3>
            <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
              Proudly supporting traditional artisan communities with fair wages and sustainable textile practices.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-6">
          <button
            onClick={() => navigateToCategory('All')}
            className="px-8 py-3.5 bg-[#D7B77A] hover:bg-[#D7B77A]/90 text-[#F7F0E5] text-xs sm:text-sm font-semibold tracking-widest uppercase transition-colors inline-flex items-center gap-2"
          >
            <span>Explore The Collection</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
