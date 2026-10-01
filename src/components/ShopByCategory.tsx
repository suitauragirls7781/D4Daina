import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { LayoutGrid } from 'lucide-react';
import { KIDS_TOYS, departmentOf } from '../utils/kids';

/** Story-style category rail at the top of the homepage, built only from categories that have products. */
export const ShopByCategory: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { categories = [] } = useAdmin();

  // Women's categories here; kids wear and toys show as one bubble that opens their own page
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

  const bubble = 'sag-cat-ring relative mx-auto w-[76px] h-[76px] sm:w-[100px] sm:h-[100px] rounded-full p-[3px] ring-2 ring-[#4B1D3F]/80 ring-offset-2 ring-offset-[#FBF7F3] bg-white overflow-hidden';

  return (
    <section id="shop-by-category" aria-label="Shop by category" className="w-full bg-[#FBF7F3] pt-5 pb-4 sm:pt-7 sm:pb-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between px-4 sm:px-6 lg:px-8 mb-3 sm:mb-4">
          <h2 className="font-serif text-xl sm:text-2xl text-[#4B1D3F]">Shop by category</h2>
          <button onClick={() => navigateToCategory('All')} className="text-xs sm:text-sm text-[#4B1D3F] underline underline-offset-4 cursor-pointer">View all</button>
        </div>

        <ul className="sag-scroll-x sag-stagger flex gap-4 sm:gap-7 overflow-x-auto scroll-px-4 sm:scroll-px-6 px-4 sm:px-6 lg:px-8 pb-2 pt-1 sm:justify-center">
          <li style={{ ['--i' as string]: 0 }} className="shrink-0">
            <button onClick={() => navigateToCategory('All')} className="sag-cat w-[84px] sm:w-[110px] text-center cursor-pointer">
              <span className={`${bubble} flex items-center justify-center bg-[#F3EEF8]`}>
                <LayoutGrid className="w-7 h-7 sm:w-8 sm:h-8 text-[#4B1D3F]" />
              </span>
              <span className="mt-2 block text-[13px] sm:text-sm font-medium text-[#2A1A26] leading-tight">All styles</span>
              <span className="block text-[11px] text-[#2A1A26]/60">{women.length} designs</span>
            </button>
          </li>
          {cards.map((card, i) => (
            <li key={card.name} style={{ ['--i' as string]: i + 1 }} className="shrink-0">
              <button onClick={() => navigateToCategory(card.name as any)} className="sag-cat w-[84px] sm:w-[110px] text-center cursor-pointer">
                <span className={`${bubble} block`}>
                  <img
                    src={card.image ? getCleanImageUrl(card.image, 240) : ELEGANT_PLACEHOLDER_SVG}
                    alt=""
                    loading="eager"
                    className="w-full h-full rounded-full object-cover object-top"
                  />
                </span>
                <span className="mt-2 block text-[13px] sm:text-sm font-medium text-[#2A1A26] leading-tight line-clamp-1">{card.name}</span>
                <span className="block text-[11px] text-[#2A1A26]/60">{card.count} {card.count === 1 ? 'design' : 'designs'}</span>
              </button>
            </li>
          ))}
          {kidsToys.count > 0 && (
            <li style={{ ['--i' as string]: cards.length + 1 }} className="shrink-0">
              <button onClick={() => navigateToCategory(KIDS_TOYS as any)} className="sag-cat w-[84px] sm:w-[110px] text-center cursor-pointer">
                <span className={`${bubble} block`}>
                  <img src={kidsToys.image ? getCleanImageUrl(kidsToys.image, 240) : ELEGANT_PLACEHOLDER_SVG} alt="" loading="eager" className="w-full h-full rounded-full object-cover object-top" />
                </span>
                <span className="mt-2 block text-[13px] sm:text-sm font-medium text-[#2A1A26] leading-tight line-clamp-1">{KIDS_TOYS}</span>
                <span className="block text-[11px] text-[#2A1A26]/60">{kidsToys.count} {kidsToys.count === 1 ? 'design' : 'designs'}</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
};
