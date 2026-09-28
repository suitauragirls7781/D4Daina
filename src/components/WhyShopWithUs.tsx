import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  RotateCcw, 
  Truck, 
  ChevronRight, 
  X, 
  CheckCircle2, 
  Lock, 
  Crown,
  Award
} from 'lucide-react';

interface FeatureItem {
  id: string;
  shortTitle: string;
  subtitle: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  details: {
    heading: string;
    points: string[];
    note: string;
  };
}

export const WhyShopWithUs: React.FC = () => {
  const [selectedFeature, setSelectedFeature] = useState<FeatureItem | null>(null);

  const features: FeatureItem[] = [
    {
      id: 'why-secure-payments',
      shortTitle: '100% Safe Payments',
      subtitle: 'Instant UPI & Cards',
      badge: '256-Bit Encrypted',
      icon: ShieldCheck,
      details: {
        heading: 'Safe & Secure Prepaid Payments',
        points: [
          'Direct integration with Verified Payment Gateways',
          'Supports Google Pay, PhonePe, Paytm, BHIM & all UPI apps',
          'Debit & Credit Cards (Visa, Mastercard, RuPay) & Net Banking',
          'Zero hidden charges with instant SMS & WhatsApp receipt'
        ],
        note: 'All transactions are protected by bank-grade 256-bit SSL encryption.'
      }
    },
    {
      id: 'why-quality-fashion',
      shortTitle: 'Artisanal Quality',
      subtitle: 'Pure Artisan Fabrics',
      badge: 'Certified Pure',
      icon: Sparkles,
      details: {
        heading: 'Premium Handcrafted Ethnic Wear',
        points: [
          '100% Breathable Cambric Cotton, Organza & Chanderi Silk',
          'Authentic Sanganeri & Bagru Handblock heritage printing',
          'Double-stitched interlocking with generous seam allowances',
          'Color-fast and pre-shrunk lab-tested premium standards'
        ],
        note: 'Designed by master artisans to keep you stylish and comfortable all day.'
      }
    },
    {
      id: 'why-easy-returns',
      shortTitle: '7-Day Easy Return',
      subtitle: 'Hassle-Free Exchange',
      badge: 'Doorstep Pickup',
      icon: RotateCcw,
      details: {
        heading: 'Hassle-Free 7-Day Returns & Exchanges',
        points: [
          'Wrong size or fitting? Instant size exchange with zero hassle',
          'Doorstep pickup arranged from your home or office address',
          '1-Click return initiation via WhatsApp or Support Ticket',
          'Instant replacement dispatch or prepaid refund process'
        ],
        note: 'Items must be unused with original tags and packaging intact.'
      }
    },
    {
      id: 'why-fast-delivery',
      shortTitle: 'Express Dispatch',
      subtitle: '24-48h Hub Shipping',
      badge: 'Live Tracking',
      icon: Truck,
      details: {
        heading: 'Fast Pan-India Express Shipping',
        points: [
          'All orders dispatched within 24–48 hours from Artisan Hub',
          'Partnered with BlueDart, Delhivery & DTDC premium air cargo',
          'Real-time live SMS & WhatsApp tracking link sent instantly',
          'Safe tamper-proof multi-layer luxury packaging'
        ],
        note: 'Delivers in 3–5 business days across major metro cities & towns.'
      }
    },
  ];

  return (
    <section 
      id="why-shop-with-us-section" 
      className="py-12 sm:py-16 bg-[#120205] border-t border-[#D7B77A]/20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        {/* Sleek Editorial Header */}
        <div className="text-center max-w-lg mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] border border-[#D7B77A]/40 shadow-sm text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />
            <span>THE SUIT AURA GIRLS PROMISE</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#F7F0E5] tracking-wide leading-none">
            Why Shop With Us
          </h2>
          <p className="text-xs sm:text-sm text-[#F7F0E5]/75 mt-2.5 font-medium">
            Tap any guarantee below to view our verified quality commitments
          </p>
        </div>

        {/* Responsive Grid Layout - 2x2 on Mobile, 4-Cols on Desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {features.map((feat) => {
            const IconComp = feat.icon;
            return (
              <div
                key={feat.id}
                id={feat.id}
                onClick={() => setSelectedFeature(feat)}
                className="bg-[#2A0710]/40 rounded-md p-4 sm:p-5 border border-[#D7B77A]/25 hover:border-[#D7B77A]/40 hover:bg-[#2A0710]/80 hover:shadow-lg transition-all duration-300 flex flex-col justify-between cursor-pointer group active:scale-98 relative overflow-hidden"
              >
                <div>
                  {/* Top Row: Delicate Gold Outline Icon & No-Clip Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-[#D7B77A]/40 bg-[#180306] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-300 text-[#F7F0E5] group-hover:text-[#F7F0E5]">
                      <IconComp className="w-5 h-5 stroke-[1.5]" />
                    </div>

                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-[#F7F0E5] bg-[#D7B77A]/15 border border-[#D7B77A]/30 px-2.5 py-0.5 rounded-full whitespace-nowrap self-start sm:self-center shadow-3xs">
                      {feat.badge}
                    </span>
                  </div>

                  {/* Elegant Typography */}
                  <h3 className="font-serif text-xs sm:text-base font-bold text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors leading-tight truncate">
                    {feat.shortTitle}
                  </h3>

                  <p className="text-[10px] sm:text-xs text-[#F7F0E5]/75 font-medium mt-1 leading-normal line-clamp-2">
                    {feat.subtitle}
                  </p>
                </div>

                {/* Micro CTA Action at Bottom */}
                <div className="pt-3.5 mt-4 border-t border-[#D7B77A]/15 flex items-center justify-between text-[10px] sm:text-[11px] font-black text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors tracking-widest">
                  <span>VERIFY PROOF</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-300 text-[#F7F0E5]" />
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* ROYAL GUARANTEE CERTIFICATE MODAL */}
      {selectedFeature && (
        <div className="fixed inset-0 bg-[#1C040C]/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          
          {/* Double Hairline Frame Outer Layer */}
          <div className="bg-[#180306] p-1 rounded-md max-w-md w-full border border-[#D7B77A]/35 shadow-2xl relative animate-in zoom-in-95 duration-300">
            
            {/* Elegant Inner Card Container */}
            <div className="bg-[#2A0710] rounded p-5 sm:p-6 space-y-4 border border-[#D7B77A]/25 relative text-[#F7F0E5]">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[#D7B77A]/20 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#5C0B1B] text-[#F7F0E5] flex items-center justify-center shrink-0 shadow-md border border-[#D7B77A]/45">
                    <selectedFeature.icon className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-[#F7F0E5] tracking-[0.18em]">
                      {selectedFeature.badge}
                    </span>
                    <h3 className="font-serif text-sm sm:text-base font-bold text-[#F7F0E5] leading-tight">
                      {selectedFeature.details.heading}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedFeature(null)}
                  className="p-1.5 rounded-full hover:bg-[#180306] border border-transparent hover:border-[#D7B77A]/35 text-[#F7F0E5]/55 hover:text-[#F7F0E5] transition cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Checklist Frame (Scroll Panel) */}
              <div className="space-y-3.5 bg-[#180306] p-4 rounded border border-[#D7B77A]/20 shadow-2xs">
                {selectedFeature.details.points.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs text-[#F7F0E5] font-medium leading-relaxed">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>

              {/* Quality Seal Graphic (Royal Authenticity Seal) */}
              <div className="p-3.5 bg-[#5C0B1B] text-[#F7F0E5] rounded border border-[#D7B77A]/35 space-y-1">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#F7F0E5]" />
                  <span className="text-[10px] font-black uppercase text-[#F7F0E5] tracking-widest">
                    ARTISAN GUILD VERIFIED
                  </span>
                </div>
                <p className="text-[10px] text-[#F7F0E5]/55 font-sans font-medium leading-normal">
                  {selectedFeature.details.note} Batch Certificate No: <span className="font-mono text-[#F7F0E5] font-black">SAG-2026-REGAL</span>.
                </p>
              </div>

              {/* Clean Solid Royal Close Button */}
              <button
                type="button"
                onClick={() => setSelectedFeature(null)}
                className="w-full py-3 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] font-black text-xs uppercase tracking-widest rounded shadow-md transition cursor-pointer border border-[#D7B77A]/40"
              >
                Acknowledge Guarantee
              </button>

            </div>
          </div>
        </div>
      )}

    </section>
  );
};
