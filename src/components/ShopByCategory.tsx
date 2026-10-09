import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { HOME_SECTION, HomeMore } from './HomeSections';
import { SectionTitle } from './SectionTitle';

/** Category rail at the top of the homepage, built only from categories that have products. */
export const ShopByCategory: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { categories = [] } = useAdmin();

  // Women's categories here; kids wear and toys show as one tile that opens their own page
  const women = useMemo(() => products.filter((p) => departmentOf(p) === 'women'), [products]);
  const kidsToys = useMemo(() => {
    const items = products.filter((p) => departmentOf(p) !== 'women');
    const withPhoto = items.find((p) => p.images?.find(Boolean) || p.image);
    return { count: items.length, image: withPhoto ? withPhoto.images?.find(Boolean) || withPhoto.image || '' : '' };
  }, [products]);
  const cards = useMemo(() => {
    const byCategory = new Map<string, { count: number; image: string }>();
    women.forEach((p) => {
      const entry = byCategory.get(p.category) || { count: 0, image: '' };
      entry.count += 1;
      if (!entry.image) entry.image = p.images?.find(Boolean) || p.image || '';
      byCategory.set(p.category, entry);
    });
    return [...byCategory.entries()]
      .map(([name, info]) => {
        const adminCategory = categories.find((c) => c.name === name);
        const adminImage = adminCategory?.image && !adminCategory.image.includes('unsplash.com') ? adminCategory.image : '';
        return { name, count: info.count, image: adminImage || info.image };
      })
      .sort((a, b) => b.count - a.count);
  }, [women, categories]);

  if (cards.length === 0 && kidsToys.count === 0) return null;

  // A swipe row of arch-topped photos (about three to a phone screen, one row on desktop) with a thin
  // champagne arch line just outside each photo and the name in serif under it. Nothing is drawn on a photo.
  const item = 'w-[31%] shrink-0 sm:w-[150px] lg:w-auto lg:min-w-[128px] lg:max-w-[210px] lg:flex-1';
  const tile = 'group flex w-full cursor-pointer flex-col items-center gap-3 text-center';
  const frame = 'relative block w-full';
  const photo = 'sag-arch sag-zoom block aspect-[3/4] w-full overflow-hidden bg-sunken';
  const name = 'block font-display text-[17px] font-semibold leading-[1.12] text-ink line-clamp-2 lg:text-[24px]';
  const count = 'sr-only';
  const designs = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;

  return (
    <section id="shop-by-category" aria-labelledby="shop-by-category-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <SectionTitle id="shop-by-category-title" eyebrow="Collections" title="Shop by category" className="mb-7 lg:mb-10" />
        </div>

        <ul className="sag-scroll-x flex gap-[18px] overflow-x-auto px-4 pt-2 pb-1 sm:px-6 lg:gap-7 lg:px-8 lg:[justify-content:safe_center]">
          {cards.map((card) => (
            <li key={card.name} className={item}>
              <button type="button" onClick={() => navigateToCategory(card.name as any)} className={tile}>
                <span className={frame}>
                  <span className={photo}>
                    <img
                      src={card.image ? getCleanImageUrl(card.image, 320) : ELEGANT_PLACEHOLDER_SVG}
                      alt=""
                      loading="eager"
                      decoding="async"
                      className="w-full h-full rounded-none object-cover object-top"
                    />
                  </span>
                  <span className="sag-arch-line" aria-hidden="true" />
                </span>
                <span className="block">
                  <span className={name}>{card.name}</span>
                  <span className={count}>{designs(card.count)}</span>
                </span>
              </button>
            </li>
          ))}
          {kidsToys.count > 0 && (
            <li className={item}>
              <button type="button" onClick={() => navigateToCategory(KIDS_TOYS as any)} className={tile}>
                <span className={frame}>
                  <span className={photo}>
                    <img src={kidsToys.image ? getCleanImageUrl(kidsToys.image, 320) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="eager" decoding="async" className="w-full h-full rounded-none object-cover object-top" />
                  </span>
                  <span className="sag-arch-line" aria-hidden="true" />
                </span>
                <span className="block">
                  <span className={name}>{KIDS_TOYS}</span>
                  <span className={count}>{designs(kidsToys.count)}</span>
                </span>
              </button>
            </li>
          )}
        </ul>

        <HomeMore onClick={() => navigateToCategory('All')}>
          View all <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </HomeMore>
      </div>
    </section>
  );
};
