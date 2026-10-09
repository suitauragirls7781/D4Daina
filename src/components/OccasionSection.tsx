import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { liveOccasions, useDiscovery } from '../utils/discovery';
import { isAvailable } from '../utils/smartQuery';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { HOME_SECTION, HomeMore, HomeSectionHeader } from './HomeSections';
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
    <section id="shop-by-occasion" aria-labelledby="shop-by-occasion-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader
            titleId="shop-by-occasion-title"
            eyebrow="Occasions"
            title="Dress for the moment"
          />
        </div>
        {list.length > 0 && (
          <ul className="sag-scroll-x flex gap-3 overflow-x-auto px-4 pb-1 sm:gap-5 sm:px-6 lg:gap-7 lg:px-8 lg:[justify-content:safe_center]">
            {list.map(({ occasion, items }) => {
              const cover = items.find(isAvailable) || items[0];
              const count = items.filter(isAvailable).length;
              const photoUrl = cover?.images?.[0] || cover?.image || '';
              return (
                <li key={occasion.id} className="w-[38%] shrink-0 sm:w-[170px] lg:w-[200px]">
                  {/* Nothing is drawn on the photo: the name and the real in-stock count sit below it */}
                  <button type="button" onClick={() => openOccasion(occasion.id, { setSelectedCategory, setActivePage, navigate })}
                    className="group flex w-full cursor-pointer flex-col items-center text-center">
                    <span className="sag-zoom block aspect-[3/4] w-full overflow-hidden rounded-lg bg-sunken">
                      <img src={photoUrl ? getCleanImageUrl(photoUrl, 400) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="lazy" decoding="async"
                        className="w-full h-full rounded-none object-cover object-top" />
                    </span>
                    <span className="mt-3 block font-display text-[19px] font-semibold leading-[1.12] text-ink line-clamp-2 lg:text-[22px]">{occasion.name}</span>
                    <span className="sag-num mt-1 block text-[13px] leading-[18px] text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {discovery.features.giftMode && (
          <HomeMore onClick={() => setGiftOpen(true)} className={list.length > 0 ? undefined : 'mt-0'}>Shop as a gift</HomeMore>
        )}
      </div>
      {giftOpen && <GiftFinder onClose={() => setGiftOpen(false)} />}
    </section>
  );
};
