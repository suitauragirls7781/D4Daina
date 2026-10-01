import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { HomeIcon, SearchIcon, SupportIcon, TruckIcon } from './StoreIcons';

/** Friendly 404: real collections from the catalogue plus the main help routes. */
export const NotFoundPage: React.FC = () => {
  const { setActivePage, navigateToCategory, setIsSearchOpen, products = [] } = useShop();

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  }, [products]);

  const help = [
    { icon: SearchIcon, label: 'Search styles', action: () => { window.scrollTo({ top: 0 }); setIsSearchOpen(true); } },
    { icon: TruckIcon, label: 'Track an order', action: () => setActivePage('track-order') },
    { icon: SupportIcon, label: 'Contact us', action: () => setActivePage('contact') },
  ];

  return (
    <div id="not-found-page" className="px-4 sm:px-6 py-14 sm:py-20">
      <div className="max-w-2xl mx-auto text-center">
        <div className="relative mx-auto w-24 h-24 rounded-full bg-[#F3EEF8] border border-[#4B1D3F]/10 flex items-center justify-center">
          <SearchIcon className="w-11 h-11" />
        </div>
        <p className="sag-eyebrow mt-7">Error 404</p>
        <h1 className="font-serif text-[36px] leading-[1.08] sm:text-5xl text-[#4B1D3F] mt-3">This page does not exist</h1>
        <p className="mt-4 text-[15px] leading-7 text-[#2A1A26]/70 max-w-md mx-auto">The link may be old or mistyped. Try the shop or go back to the homepage.</p>
        <div className="mt-7 flex flex-col min-[420px]:flex-row justify-center gap-2.5">
          <button onClick={() => navigateToCategory('All')} className="sag-btn-primary h-12 px-7 text-sm font-semibold cursor-pointer">Shop all styles</button>
          <button onClick={() => setActivePage('home')} className="sag-btn-outline h-12 px-7 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
            <HomeIcon className="w-[18px] h-[18px]" /> Homepage
          </button>
        </div>

        {collections.length > 0 && (
          <div className="mt-12">
            <p className="sag-eyebrow">Popular collections</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {collections.map((name) => (
                <button key={name} onClick={() => navigateToCategory(name as any)}
                  className="h-10 px-4 rounded-full bg-white border border-[#4B1D3F]/12 text-sm text-[#2A1A26]/80 hover:border-[#4B1D3F]/35 hover:text-[#4B1D3F] transition-colors cursor-pointer">
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
          {help.map(({ icon: Icon, label, action }) => (
            <button key={label} onClick={action} className="sag-card rounded-2xl flex items-center gap-3 px-4 py-3.5 text-[15px] text-[#2A1A26] hover:border-[#4B1D3F]/30 transition-colors cursor-pointer">
              <span className="w-10 h-10 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><Icon className="w-[22px] h-[22px]" /></span>
              <span className="flex-1 text-left">{label}</span>
              <ChevronRight className="w-4 h-4 text-[#4B1D3F]/40" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
