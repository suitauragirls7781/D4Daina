import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { LayoutGrid } from 'lucide-react';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { HomeSectionHeader } from './HomeSections';

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

  const tile = 'group block w-[96px] sm:w-[104px] lg:w-[128px] text-left cursor-pointer rounded-control';
  const photo = 'block aspect-[4/5] w-full overflow-hidden rounded-control bg-sunken';
  const name = 'mt-2 block text-sm leading-5 font-medium text-ink line-clamp-1';
  const count = 'sag-num block text-xs leading-4 text-ink-muted';
  const designs = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;

  return (
    <section id="shop-by-category" aria-labelledby="shop-by-category-title" className="w-full bg-white pt-5 pb-6 lg:pt-8 lg:pb-8">
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader titleId="shop-by-category-title" title="Shop by category" className="mb-3 lg:mb-5" action={{ label: 'View all', onClick: () => navigateToCategory('All') }} />
        </div>

        <ul className="sag-scroll-x flex gap-3 lg:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1">
          <li className="shrink-0">
            <button type="button" onClick={() => navigateToCategory('All')} className={tile}>
              <span className={`${photo} flex items-center justify-center`}>
                <LayoutGrid className="w-7 h-7 text-ink" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className={name}>All styles</span>
              <span className={count}>{designs(women.length)}</span>
            </button>
          </li>
          {cards.map((card) => (
            <li key={card.name} className="shrink-0">
              <button type="button" onClick={() => navigateToCategory(card.name as any)} className={tile}>
                <span className={photo}>
                  <img
                    src={card.image ? getCleanImageUrl(card.image, 320) : ELEGANT_PLACEHOLDER_SVG}
                    alt=""
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-cover object-top"
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
                  <img src={kidsToys.image ? getCleanImageUrl(kidsToys.image, 320) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="eager" decoding="async" className="w-full h-full object-cover object-top" />
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
