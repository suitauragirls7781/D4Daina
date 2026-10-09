import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { HomeIcon, SearchIcon, SupportIcon, TruckIcon } from './StoreIcons';
import { SectionTitle } from './SectionTitle';

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
    <div id="not-found-page" className="px-4 sm:px-6 py-8 lg:py-16">
      <div className="max-w-xl mx-auto">
        <div className="text-center sag-glass rounded-xl! px-5 py-9 sm:py-11">
          <SectionTitle as="h1" eyebrow="Error 404" title="This page does not exist" sub="The link may be old or mistyped. Try the shop or go back to the homepage." />
          <div className="mt-6 flex flex-col min-[420px]:flex-row gap-2.5">
            <button type="button" onClick={() => navigateToCategory('All')} className="sag-btn-primary min-[420px]:flex-1">Shop all styles</button>
            <button type="button" onClick={() => setActivePage('home')} className="sag-btn-outline gap-2 min-[420px]:flex-1">
              <HomeIcon mono className="w-[18px] h-[18px]" /> Homepage
            </button>
          </div>
        </div>

        {collections.length > 0 && (
          <section className="mt-8" aria-labelledby="not-found-collections">
            <h2 id="not-found-collections" className="font-sans text-[10.5px] leading-4 font-semibold uppercase tracking-[0.2em] text-sale">Popular collections</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {collections.map((name) => (
                <button key={name} type="button" onClick={() => navigateToCategory(name as any)}
                  className="sag-chip inline-flex items-center h-11 px-4 text-[13px] transition-colors cursor-pointer">
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}

        <nav className="mt-8 sag-glass px-4" aria-label="Help">
          {help.map(({ icon: Icon, label, action }) => (
            <button key={label} type="button" onClick={action} className="sag-row !border-t-0 border-b border-line last:border-b-0 w-full text-left font-normal cursor-pointer">
              <span className="shrink-0 flex text-sale"><Icon mono className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">{label}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};
