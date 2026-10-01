import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { Product } from '../types';
import { useShopperMemory } from '../utils/shopperMemory';
import { pickedForYou } from '../utils/recommend';
import { ProductCard } from './ProductCard';
import { useDiscovery } from '../utils/discovery';
import { recommendedForYou, useStylePrefs } from './StyleProfile';

const Rail: React.FC<{ eyebrow: string; title: string; items: Product[]; action?: React.ReactNode }> = ({ eyebrow, title, items, action }) => (
  <section className="w-full py-10 sm:py-14">
    <div className="max-w-7xl mx-auto">
      <div className="px-4 sm:px-6 lg:px-8 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="sag-eyebrow">{eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">{title}</h2>
        </div>
        {action}
      </div>
      <ul className="sag-scroll-x flex gap-3 sm:gap-5 overflow-x-auto scroll-px-4 sm:scroll-px-6 px-4 sm:px-6 lg:px-8 pb-2">
        {items.map((p) => (
          <li key={p.id} className="shrink-0 w-[46vw] max-w-[240px] sm:w-[240px]"><ProductCard product={p} compact /></li>
        ))}
      </ul>
    </div>
  </section>
);

/**
 * Personal rails: "Recommended for you" from a signed-in customer's saved style profile, then rails
 * from this shopper's own activity (viewed, wishlist, bag). Each is hidden until there is real data.
 */
export const PersonalRails: React.FC = () => {
  const { allProducts = [], wishlist = [], cart = [] } = useShop();
  const { navigate } = useRouter();
  const { viewed } = useShopperMemory();
  const { features } = useDiscovery();
  const { prefs } = useStylePrefs();

  const forYou = useMemo(
    () => (features.styleProfile ? recommendedForYou(allProducts, prefs, 10) : []),
    [features.styleProfile, allProducts, prefs],
  );

  const { recent, picked } = useMemo(() => {
    const byId = new Map(allProducts.map((p) => [String(p.id), p]));
    const recentList = viewed.map((id) => byId.get(id)).filter(Boolean) as Product[];
    const signals = [...recentList, ...wishlist.map((w) => byId.get(String(w.id))).filter(Boolean) as Product[], ...cart.map((c) => byId.get(String(c.product?.id))).filter(Boolean) as Product[]];
    // Styles already in "Recommended for you" are not repeated in "Picked for you"
    const exclude = new Set([...viewed, ...cart.map((c) => String(c.product?.id)), ...forYou.map((p) => String(p.id))]);
    return { recent: recentList.slice(0, 10), picked: pickedForYou(allProducts, signals, exclude, 10) };
  }, [allProducts, viewed, wishlist, cart, forYou]);

  const showActivity = features.personalRails && (recent.length > 0 || picked.length > 0);
  if (!forYou.length && !showActivity) return null;
  return (
    <div className="bg-[#FBF7F3]">
      {forYou.length > 0 && (
        <Rail
          eyebrow="Recommended for you"
          title="Chosen for your style"
          items={forYou}
          action={(
            <button
              type="button"
              onClick={() => { navigate('/account?tab=style'); window.scrollTo(0, 0); }}
              className="sag-btn-outline h-10 px-5 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer"
            >
              Edit my style
            </button>
          )}
        />
      )}
      {features.personalRails && picked.length > 0 && <Rail eyebrow="Picked for you" title="Because you viewed" items={picked} />}
      {features.personalRails && recent.length > 0 && <Rail eyebrow="Recently viewed" title="Pick up where you left off" items={recent} />}
    </div>
  );
};
