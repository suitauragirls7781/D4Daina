import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { HOME_GRID, HOME_SECTION, HOME_WRAP, HomeSectionHeader } from './HomeSections';

export const TrendingNowSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();

  const activeProducts = products.filter((p) => p.inStock);
  const trendingList = activeProducts.filter((p) => p.isTrending && !p.isNewArrival);
  const trendingProducts = (trendingList.length > 0
    ? trendingList
    : activeProducts.filter(p => !p.isNewArrival)
  ).slice(0, 4);

  // Hide the whole section instead of showing an empty heading
  if (trendingProducts.length === 0) return null;

  return (
    <section id="trending-now-section" aria-labelledby="trending-now-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="trending-now-title"
          title="Trending now"
          action={{ id: 'view-all-trending-btn', label: 'View all', onClick: () => navigateToCategory('Trending') }}
        />
        <div className={HOME_GRID}>
          {trendingProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};
