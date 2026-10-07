import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { HOME_GRID, HOME_SECTION, HOME_WRAP, HomeSectionHeader, HomeViewAllButton } from './HomeSections';

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
        <HomeSectionHeader
          titleId="best-sellers-title"
          title="Best sellers"
          action={{ id: 'view-all-bestsellers-btn', label: 'View all', onClick: () => navigateToCategory('Best Sellers') }}
        />
        <div className={HOME_GRID}>
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
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
        <HomeSectionHeader
          titleId="festive-collection-title"
          title="Festive collection"
          action={{ id: 'view-all-festive-btn', label: 'View all', onClick: () => navigateToCategory('Festive Wear') }}
        />
        <div className={HOME_GRID}>
          {festiveItems.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};
