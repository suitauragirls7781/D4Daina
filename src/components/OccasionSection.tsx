import React, { useMemo, useState } from 'react';
import { Gift, ArrowRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { liveOccasions, useDiscovery } from '../utils/discovery';
import { isAvailable } from '../utils/smartQuery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { GiftFinder } from './GiftFinder';
import { withPageTransition } from '../utils/pageTransition';

export const openOccasion = (id: string, go: { setSelectedCategory: (c: any) => void; setActivePage: (p: any) => void; navigate: (p: string) => void }) =>
  // One transition, so the page change cannot run after (and overwrite) the occasion URL
  withPageTransition(() => {
    go.setSelectedCategory('All');
    go.setActivePage('shop');
    go.navigate(`/shop?occasion=${encodeURIComponent(id)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  });

/** Homepage "Shop by occasion": only occasions that currently have in-stock products. */
export const OccasionSection: React.FC = () => {
  const { products = [], setSelectedCategory, setActivePage } = useShop();
  const { navigate } = useRouter();
  const discovery = useDiscovery();
  const [giftOpen, setGiftOpen] = useState(false);
  const list = useMemo(() => liveOccasions(discovery, products), [discovery, products]);

  if (!list.length && !discovery.features.giftMode) return null;

  return (
    <section className="w-full bg-white py-12 sm:py-16" aria-label="Shop by occasion">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 sm:px-6 lg:px-8 mb-6">
          <div>
            <p className="sag-eyebrow">Occasions</p>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">Dress for the moment</h2>
          </div>
          {discovery.features.giftMode && (
            <button onClick={() => setGiftOpen(true)} className="h-11 px-5 rounded-full bg-[#F7E4EA] text-[#8A2E55] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#F3D5DF] transition-colors cursor-pointer">
              <Gift className="w-4 h-4" /> Shop as a gift
            </button>
          )}
        </div>
        {list.length > 0 && (
          <ul className="sag-scroll-x sag-stagger flex gap-3 sm:gap-4 overflow-x-auto scroll-px-4 sm:scroll-px-6 px-4 sm:px-6 lg:px-8 pb-2">
            {list.map(({ occasion, items }, i) => {
              const cover = items.find(isAvailable) || items[0];
              const count = items.filter(isAvailable).length;
              return (
                <li key={occasion.id} style={{ ['--i' as string]: i }} className="shrink-0">
                  <button onClick={() => openOccasion(occasion.id, { setSelectedCategory, setActivePage, navigate })}
                    className="group relative block w-[150px] sm:w-[190px] aspect-[3/4] overflow-hidden rounded-2xl bg-[#F3EEF8] text-left cursor-pointer">
                    <img src={getCleanImageUrl(cover?.images?.[0] || cover?.image || '', 400)} alt="" loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.05]" />
                    <span className="absolute inset-x-2 bottom-2 rounded-xl bg-white/95 px-3 py-2">
                      <span className="block font-serif text-lg leading-tight text-[#2A1A26]">{occasion.name}</span>
                      <span className="mt-0.5 flex items-center justify-between text-[11px] text-[#2A1A26]/65">{count} {count === 1 ? 'style' : 'styles'} <ArrowRight className="w-3.5 h-3.5 text-[#4B1D3F]" /></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {giftOpen && <GiftFinder onClose={() => setGiftOpen(false)} />}
    </section>
  );
};
