import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { liveOccasions, useDiscovery } from '../utils/discovery';
import { isAvailable } from '../utils/smartQuery';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { HOME_SECTION, HomeSectionHeader } from './HomeSections';
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
    <section id="shop-by-occasion" aria-labelledby="shop-by-occasion-title" className={`${HOME_SECTION} bg-white`}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader
            titleId="shop-by-occasion-title"
            eyebrow="Occasions"
            title="Dress for the moment"
            action={discovery.features.giftMode ? { label: 'Shop as a gift', onClick: () => setGiftOpen(true) } : undefined}
          />
        </div>
        {list.length > 0 && (
          <ul className="sag-scroll-x flex gap-3 lg:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1">
            {list.map(({ occasion, items }) => {
              const cover = items.find(isAvailable) || items[0];
              const count = items.filter(isAvailable).length;
              const photoUrl = cover?.images?.[0] || cover?.image || '';
              return (
                <li key={occasion.id} className="shrink-0">
                  {/* Nothing is drawn on the photo: the name and the real in-stock count sit below it */}
                  <button type="button" onClick={() => openOccasion(occasion.id, { setSelectedCategory, setActivePage, navigate })}
                    className="block w-[128px] sm:w-[160px] lg:w-[190px] text-left cursor-pointer rounded-control">
                    <span className="block aspect-[4/5] w-full overflow-hidden rounded-control bg-sunken">
                      <img src={photoUrl ? getCleanImageUrl(photoUrl, 400) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="lazy" decoding="async"
                        className="w-full h-full object-cover object-top" />
                    </span>
                    <span className="mt-2 block text-sm leading-5 font-medium text-ink line-clamp-1">{occasion.name}</span>
                    <span className="sag-num block text-xs leading-4 text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
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
