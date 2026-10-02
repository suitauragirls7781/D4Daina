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
    <div id="not-found-page" className="bg-page px-4 sm:px-6 py-8 lg:py-16">
      <div className="max-w-xl mx-auto">
        <div className="sag-card p-5 sm:p-8">
          <p className="sag-eyebrow">Error 404</p>
          <h1 className="font-display text-[28px] leading-8 lg:text-[40px] lg:leading-[46px] text-ink mt-1">This page does not exist</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-ink-muted">The link may be old or mistyped. Try the shop or go back to the homepage.</p>
          <div className="mt-5 flex flex-col min-[420px]:flex-row gap-2.5">
            <button type="button" onClick={() => navigateToCategory('All')} className="sag-btn-primary min-[420px]:flex-1">Shop all styles</button>
            <button type="button" onClick={() => setActivePage('home')} className="sag-btn-outline gap-2 min-[420px]:flex-1">
              <HomeIcon mono className="w-[18px] h-[18px]" /> Homepage
            </button>
          </div>
        </div>

        {collections.length > 0 && (
          <section className="mt-8" aria-labelledby="not-found-collections">
            <h2 id="not-found-collections" className="text-[17px] leading-6 font-semibold text-ink">Popular collections</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {collections.map((name) => (
                <button key={name} type="button" onClick={() => navigateToCategory(name as any)}
                  className="inline-flex items-center h-11 px-3.5 rounded-chip bg-surface border-[1.5px] border-control text-sm font-medium text-ink hover:bg-sunken transition-colors cursor-pointer">
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}

        <nav className="mt-8 sag-card px-4 sm:px-6" aria-label="Help">
          {help.map(({ icon: Icon, label, action }) => (
            <button key={label} type="button" onClick={action} className="sag-row w-full text-left cursor-pointer">
              <span className="shrink-0 flex"><Icon mono className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">{label}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};
