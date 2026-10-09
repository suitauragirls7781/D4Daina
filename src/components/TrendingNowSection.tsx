import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { HOME_SECTION, HOME_WRAP } from './HomeSections';
import { editLayout } from './BestSellersSection';
import { AuraTitle, Icon } from '../aura';

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
        <AuraTitle id="trending-now-title" label={`${trendingProducts.length} ${trendingProducts.length === 1 ? 'style' : 'styles'}`} title="Trending" accent="now" className="mb-6 lg:mb-9" />
        <div className="aura-pc-grid">
          {trendingProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} layout={editLayout(index, trendingProducts.length)} />
          ))}
        </div>
        <div className="mt-4 flex lg:mt-7">
          <button type="button" id="view-all-trending-btn" onClick={() => navigateToCategory('Trending')} className="aura-lk">View all<Icon name="arrow" /></button>
        </div>
      </div>
    </section>
  );
};
