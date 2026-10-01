import React from 'react';
import { Award, Heart, ShieldCheck, Truck } from 'lucide-react';

export const ArtisanalPromises: React.FC = () => {
  const promises = [
    {
      id: 'handlooms',
      icon: Award,
      title: 'Artisanal Handlooms',
      desc: 'Sanganer & Bagru Weavers',
    },
    {
      id: 'fabrics',
      icon: Heart,
      title: 'Breathable Pure Fabrics',
      desc: '100% Cotton & Chanderi Silk',
    },
    {
      id: 'fit',
      icon: ShieldCheck,
      title: 'Double-Locked Fit',
      desc: 'Flawless Interlocking Fit',
    },
    {
      id: 'dispatch',
      icon: Truck,
      title: 'Express Air Dispatch',
      desc: '24-48 Hours Shipping',
    },
  ];

  return (
    <section 
      id="artisanal-promises-strip" 
      className="w-full bg-white py-4 sm:py-5 px-2 sm:px-4 border-y border-[#4B1D3F]/20 relative overflow-hidden z-10"
    >
      <div className="max-w-7xl mx-auto">
        {/* DESKTOP VIEW: 4 Columns with vertical gold dividers, ultra slim height */}
        <div className="hidden md:grid md:grid-cols-4 divide-x divide-[#4B1D3F]/35 items-center">
          {promises.map((prom) => {
            const IconComp = prom.icon;
            return (
              <div 
                key={prom.id}
                className="flex items-center justify-center gap-3 px-4 py-2 group cursor-default"
              >
                <div className="shrink-0 text-[#4B1D3F]">
                  <IconComp className="w-5 h-5 stroke-[1.5]" />
                </div>
                <div className="text-left leading-tight min-w-0">
                  <h4 className="font-serif text-xs font-semibold text-[#2A1A26] tracking-wide uppercase truncate">
                    {prom.title}
                  </h4>
                  <p className="text-[10px] text-[#2A1A26]/70 font-medium truncate">
                    {prom.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* MOBILE VIEW: Ultra-compact Marquee Ticker, ~36px tall, scrolling smoothly */}
        <div className="md:hidden overflow-hidden relative w-full flex items-center py-0.5">
          <div className="animate-luxury-marquee flex items-center gap-6 whitespace-nowrap text-xs">
            {/* Duplicated list for seamless infinite loop */}
            {[...promises, ...promises, ...promises].map((prom, idx) => {
              const IconComp = prom.icon;
              return (
                <div key={idx} className="inline-flex items-center gap-2 shrink-0">
                  <div className="text-[#4B1D3F] shrink-0">
                    <IconComp className="w-3 h-3 stroke-[2]" />
                  </div>
                  <span className="font-serif font-semibold text-[#2A1A26] text-[11px] tracking-wide uppercase">
                    {prom.title}
                  </span>
                  <span className="text-[10px] text-[#2A1A26]/70 font-semibold">
                    ({prom.desc})
                  </span>
                  <span className="text-[#4B1D3F] ml-2 text-[8px]">◆</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
