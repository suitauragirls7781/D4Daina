import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { HOME_SECTION, HOME_WRAP, HomeViewAllButton } from './HomeSections';
import { AuraTitle, Icon } from '../aura';

// Four styles make one composed block: a big card, two plain ones and a wide one. Three: a big card and two
// plain ones. Any other number is a plain grid.
export const editLayout = (index: number, total: number): 'big' | 'wide' | undefined =>
  (total === 4 || total === 3) && index === 0 ? 'big' : total === 4 && index === 3 ? 'wide' : undefined;

export const BestSellersSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();

  const activeProducts = products.filter((p) => p.inStock);
  const bestSellersList = activeProducts.filter((p) => p.isBestSeller && !p.isNewArrival);
  const bestSellers = (bestSellersList.length > 0
    ? bestSellersList
    : activeProducts.filter(p => !p.isNewArrival)
  ).slice(0, 4);

  // Hide the whole section instead of showing an empty heading
  if (bestSellers.length === 0) return null;

  return (
    <section id="best-sellers-section" aria-labelledby="best-sellers-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        {/* The small "View all" sits under the title here, because the button under the grid is this section's own */}
        <AuraTitle id="best-sellers-title" label={`${bestSellers.length} ${bestSellers.length === 1 ? 'style' : 'styles'}`} title="Best" accent="sellers" />
        <div className="mb-4 mt-2 flex lg:mb-7">
          <button type="button" id="view-all-bestsellers-btn" onClick={() => navigateToCategory('Best Sellers')} className="aura-lk">View all<Icon name="arrow" /></button>
        </div>
        <div className="aura-pc-grid">
          {bestSellers.map((product, index) => (
            <ProductCard key={product.id} product={product} layout={editLayout(index, bestSellers.length)} />
          ))}
        </div>
        <HomeViewAllButton onClick={() => navigateToCategory('Best Sellers')} />
      </div>
    </section>
  );
};

export const FestiveCollectionSection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const activeProducts = products.filter((p) => p.inStock);
  const festiveList = activeProducts.filter((p) => (p.isFestive || p.category === 'Festive Wear') && !p.isNewArrival && !p.isBestSeller);
  const festiveItems = (festiveList.length > 0
    ? festiveList
    : activeProducts.filter(p => !p.isNewArrival && !p.isBestSeller)
  ).slice(0, 4);

  if (festiveItems.length === 0) return null;

  return (
    <section id="festive-collection-section" aria-labelledby="festive-collection-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <AuraTitle id="festive-collection-title" label={`${festiveItems.length} ${festiveItems.length === 1 ? 'style' : 'styles'}`} title="Festive" accent="collection" className="mb-6 lg:mb-9" />
        <div className="aura-pc-grid">
          {festiveItems.map((product, index) => (
            <ProductCard key={product.id} product={product} layout={editLayout(index, festiveItems.length)} />
          ))}
        </div>
        <div className="mt-4 flex lg:mt-7">
          <button type="button" id="view-all-festive-btn" onClick={() => navigateToCategory('Festive Wear')} className="aura-lk">View all<Icon name="arrow" /></button>
        </div>
      </div>
    </section>
  );
};
