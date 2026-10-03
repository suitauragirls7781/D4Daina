import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { Product } from '../types';
import { HOME_SECTION, HOME_WRAP, HomeSectionHeader, SeenIds, preferUnseen } from './HomeSections';

export const pickTrending = (products: Product[], seen?: SeenIds): Product[] => {
  const activeProducts = products.filter((p) => p.inStock);
  const trendingList = activeProducts.filter((p) => p.isTrending && !p.isNewArrival);
  return preferUnseen(trendingList.length > 0 ? trendingList : activeProducts.filter((p) => !p.isNewArrival), seen, 4);
};

export const TrendingNowSection: React.FC<{ seen?: SeenIds }> = ({ seen }) => {
  const { products = [], navigateToCategory } = useShop();
  const trendingProducts = pickTrending(products, seen);

  // Hide the whole section instead of showing an empty heading
  if (trendingProducts.length === 0) return null;

  return (
    <section id="trending-now-section" aria-labelledby="trending-now-title" className={`${HOME_SECTION} bg-page`}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="trending-now-title"
          title="Trending now"
          action={{ id: 'view-all-trending-btn', label: 'View all', onClick: () => navigateToCategory('Trending') }}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-6 lg:gap-x-6">
          {trendingProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};
