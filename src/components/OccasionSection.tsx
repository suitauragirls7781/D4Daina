import React, { useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { liveOccasions, useDiscovery } from '../utils/discovery';
import { isAvailable } from '../utils/smartQuery';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { FadeImg, HOME_SECTION, HomeSectionHeader, SeenIds } from './HomeSections';
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
export const OccasionSection: React.FC<{ seen?: SeenIds }> = ({ seen }) => {
  const { products = [], setSelectedCategory, setActivePage } = useShop();
  const { navigate } = useRouter();
  const discovery = useDiscovery();
  const [giftOpen, setGiftOpen] = useState(false);
  // Each tile's cover photo: an in-stock style of that occasion that is not already shown higher on the page
  // or on an earlier tile, where the occasion has one; otherwise its first in-stock style, as before.
  const list = useMemo(() => {
    const used = new Set<string>(seen || []);
    return liveOccasions(discovery, products).map((entry) => {
      const available = entry.items.filter(isAvailable);
      const cover = available.find((p) => !used.has(String(p.id))) || available[0] || entry.items[0];
      if (cover) used.add(String(cover.id));
      return { ...entry, cover, count: available.length };
    });
  }, [discovery, products, seen]);

  // No occasion has styles in stock: nothing to show, so no empty heading either
  if (!list.length) return null;

  return (
    <section id="shop-by-occasion" aria-labelledby="shop-by-occasion-title" className={`${HOME_SECTION} bg-white`}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader
            titleId="shop-by-occasion-title"
            title="Shop by occasion"
            action={discovery.features.giftMode ? { label: 'Shop as a gift', onClick: () => setGiftOpen(true) } : undefined}
          />
        </div>
          <ul className="sag-scroll-x flex gap-3 lg:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1">
            {list.map(({ occasion, cover, count }) => {
              const photoUrl = cover?.images?.[0] || cover?.image || '';
              return (
                <li key={occasion.id} className="shrink-0">
                  {/* Nothing is drawn on the photo: the name and the real in-stock count sit below it */}
                  <button type="button" onClick={() => openOccasion(occasion.id, { setSelectedCategory, setActivePage, navigate })}
                    className="block w-[128px] sm:w-[160px] lg:w-[190px] text-left cursor-pointer rounded-control">
                    <span className="block aspect-[4/5] w-full overflow-hidden rounded-control bg-sunken">
                      <FadeImg src={photoUrl ? getCleanImageUrl(photoUrl, 400) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="lazy" decoding="async"
                        className="w-full h-full object-cover object-top" />
                    </span>
                    <span className="mt-2 block text-sm leading-5 font-medium text-ink line-clamp-1">{occasion.name}</span>
                    <span className="sag-num block text-xs leading-4 text-ink-muted">{count} {count === 1 ? 'style' : 'styles'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
      </div>
      {giftOpen && <GiftFinder onClose={() => setGiftOpen(false)} />}
    </section>
  );
};
