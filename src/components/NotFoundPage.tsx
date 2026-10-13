import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { HomeIcon, SearchIcon, SupportIcon, TruckIcon } from './StoreIcons';
import { AuraTitle, Icon } from '../aura';

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
    <div id="not-found-page" data-aura className="px-3 sm:px-6 pt-3 pb-14 lg:pt-6 lg:pb-20">
      <div className="max-w-[1120px] mx-auto lg:grid lg:grid-cols-2 lg:items-start lg:gap-[50px]">
        <div className="aa-band">
          {/* Aura Kinetic: the number itself, dropped in figure by figure (decoration; the label below says it in words) */}
          <p className="kx-404" aria-hidden="true"><b>4</b><b>0</b><b>4</b></p>
          <AuraTitle as="h1" label="Error 404" title="This page does not" accent="exist" sub="The link may be old or mistyped. Try the shop or go back to the homepage." />
          <div className="mt-7 flex flex-col min-[420px]:flex-row gap-2.5">
            <button type="button" onClick={() => navigateToCategory('All')} className="aura-btn min-[420px]:flex-1">Shop all styles <Icon name="arrow" /></button>
            <button type="button" onClick={() => setActivePage('home')} className="aura-btn aura-btn-line min-[420px]:flex-1">
              <HomeIcon mono className="w-[18px] h-[18px]" /> Homepage
            </button>
          </div>
        </div>

        <div className="px-1">
          {collections.length > 0 && (
            <section className="mt-8 lg:mt-2" aria-labelledby="not-found-collections">
              <h2 id="not-found-collections" className="aura-lbl" style={{ fontSizeAdjust: 'none' }}>Popular collections</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {collections.map((name) => (
                  <button key={name} type="button" onClick={() => navigateToCategory(name as any)}
                    className="sag-chip inline-flex items-center h-11 px-4 text-[14px] font-semibold cursor-pointer">
                    {name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <nav className="mt-8 space-y-2" aria-label="Help">
            {help.map(({ icon: HelpRowIcon, label, action }) => (
              <button key={label} type="button" onClick={action} className="aa-row">
                <span className="aa-ic"><HelpRowIcon mono className="w-5 h-5" /></span>
                <span className="aa-row-t"><b>{label}</b></span>
                <ChevronRight strokeWidth={1.6} aria-hidden="true" />
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};
