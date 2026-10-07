import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { Product } from '../types';
import { useShopperMemory } from '../utils/shopperMemory';
import { pickedForYou } from '../utils/recommend';
import { ProductCard } from './ProductCard';
import { useDiscovery } from '../utils/discovery';
import { recommendedForYou, useStylePrefs } from './StyleProfile';
import { HOME_RAIL, HOME_RAIL_ITEM, HOME_SECTION, HomeSectionHeader } from './HomeSections';

const Rail: React.FC<{ title: string; note?: string; items: Product[]; action?: { label: string; onClick: () => void } }> = ({ title, note, items, action }) => (
  <section className={HOME_SECTION} aria-label={title}>
    <div className="max-w-7xl mx-auto">
      <div className="px-4 sm:px-6 lg:px-8">
        <HomeSectionHeader title={title} text={note} action={action} />
      </div>
      <ul className={HOME_RAIL}>
        {items.map((p) => (
          <li key={p.id} className={HOME_RAIL_ITEM}><ProductCard product={p} compact /></li>
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
    <>
      {forYou.length > 0 && (
        <Rail
          title="Recommended for you"
          note="Based on your saved style profile"
          items={forYou}
          action={{ label: 'Edit my style', onClick: () => { navigate('/account?tab=style'); window.scrollTo(0, 0); } }}
        />
      )}
      {features.personalRails && picked.length > 0 && <Rail title="Similar to what you viewed" items={picked} />}
      {features.personalRails && recent.length > 0 && <Rail title="Recently viewed" items={recent} />}
    </>
  );
};
