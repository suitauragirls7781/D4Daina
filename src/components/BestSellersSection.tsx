import React from 'react';
import { ProductCard } from './ProductCard';
import { useShop } from '../context/ShopContext';
import { Product } from '../types';
import { HOME_SECTION, HOME_WRAP, HomeSectionHeader, SeenIds, preferUnseen } from './HomeSections';

const GRID = 'grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-6 lg:gap-x-6';

export const pickBestSellers = (products: Product[], seen?: SeenIds): Product[] => {
  const activeProducts = products.filter((p) => p.inStock);
  const bestSellersList = activeProducts.filter((p) => p.isBestSeller && !p.isNewArrival);
  return preferUnseen(bestSellersList.length > 0 ? bestSellersList : activeProducts.filter((p) => !p.isNewArrival), seen, 4);
};

export const pickFestive = (products: Product[], seen?: SeenIds): Product[] => {
  const activeProducts = products.filter((p) => p.inStock);
  const festiveList = activeProducts.filter((p) => (p.isFestive || p.category === 'Festive Wear') && !p.isNewArrival && !p.isBestSeller);
  return preferUnseen(festiveList.length > 0 ? festiveList : activeProducts.filter((p) => !p.isNewArrival && !p.isBestSeller), seen, 4);
};

export const BestSellersSection: React.FC<{ seen?: SeenIds }> = ({ seen }) => {
  const { products = [], navigateToCategory } = useShop();
  const bestSellers = pickBestSellers(products, seen);

  // Hide the whole section instead of showing an empty heading
  if (bestSellers.length === 0) return null;

  return (
    <section id="best-sellers-section" aria-labelledby="best-sellers-title" className={`${HOME_SECTION} bg-white`}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="best-sellers-title"
          title="Best sellers"
          action={{ id: 'view-all-bestsellers-btn', label: 'View all', onClick: () => navigateToCategory('Best Sellers') }}
        />
        <div className={GRID}>
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};

export const FestiveCollectionSection: React.FC<{ seen?: SeenIds }> = ({ seen }) => {
  const { products = [], navigateToCategory } = useShop();
  const festiveItems = pickFestive(products, seen);

  if (festiveItems.length === 0) return null;

  return (
    <section id="festive-collection-section" aria-labelledby="festive-collection-title" className={`${HOME_SECTION} bg-white`}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader
          titleId="festive-collection-title"
          title="Festive collection"
          action={{ id: 'view-all-festive-btn', label: 'View all', onClick: () => navigateToCategory('Festive Wear') }}
        />
        <div className={GRID}>
          {festiveItems.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};
