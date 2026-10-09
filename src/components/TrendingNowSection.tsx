import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { HOME_GRID, HOME_SECTION, HOME_WRAP } from './HomeSections';
import { SectionTitle } from './SectionTitle';

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
        <SectionTitle id="trending-now-title" title="Trending now" className="mb-6 lg:mb-9" />
        <div className={HOME_GRID}>
          {trendingProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <div className="mt-5 flex justify-center lg:mt-8">
          <button type="button" id="view-all-trending-btn" onClick={() => navigateToCategory('Trending')} className="sag-lnk">View all</button>
        </div>
      </div>
    </section>
  );
};
