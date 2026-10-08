import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { HOME_SECTION, HomeSectionHeader } from './HomeSections';

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

  // A swipe row of glass tiles: a rounded photo with the name centred under it. "All styles" is the "View all" link in the title row.
  const tile = 'sag-glass group block h-full w-[108px] sm:w-[140px] lg:w-[180px] p-1.5 lg:p-2 text-center cursor-pointer';
  const photo = 'block aspect-square w-full overflow-hidden rounded-[16px] bg-sunken';
  const name = 'block px-0.5 pt-[7px] pb-[3px] text-[12.5px] font-medium leading-[18px] text-ink line-clamp-2';
  const count = 'sr-only';
  const designs = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;

  return (
    <section id="shop-by-category" aria-labelledby="shop-by-category-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader titleId="shop-by-category-title" title="Shop by category" action={{ label: 'View all', onClick: () => navigateToCategory('All') }} />
        </div>

        <ul className="sag-scroll-x flex gap-3 lg:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pt-1 pb-6 -mb-5">
          {cards.map((card) => (
            <li key={card.name} className="shrink-0">
              <button type="button" onClick={() => navigateToCategory(card.name as any)} className={tile}>
                <span className={photo}>
                  <img
                    src={card.image ? getCleanImageUrl(card.image, 320) : ELEGANT_PLACEHOLDER_SVG}
                    alt=""
                    loading="eager"
                    decoding="async"
                    className="w-full h-full rounded-none object-cover object-top"
                  />
                </span>
                <span className={name}>{card.name}</span>
                <span className={count}>{designs(card.count)}</span>
              </button>
            </li>
          ))}
          {kidsToys.count > 0 && (
            <li className="shrink-0">
              <button type="button" onClick={() => navigateToCategory(KIDS_TOYS as any)} className={tile}>
                <span className={photo}>
                  <img src={kidsToys.image ? getCleanImageUrl(kidsToys.image, 320) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="eager" decoding="async" className="w-full h-full rounded-none object-cover object-top" />
                </span>
                <span className={name}>{KIDS_TOYS}</span>
                <span className={count}>{designs(kidsToys.count)}</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
};
