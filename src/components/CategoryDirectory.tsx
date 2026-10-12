import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { AuraTitle } from '../aura';
import { categoryDirectory } from '../data/womenCategories';

/**
 * The store's whole range, above the footer on the shopping pages: every women's category as a pill. A category
 * that has styles shows its real count and comes first; the ones still to come are quieter and say "Soon" (they
 * open an honest coming-soon listing). The list is src/data/womenCategories.ts; nothing here is invented.
 */
export const CategoryDirectory: React.FC = () => {
  const { products = [], navigateToCategory, activePage, selectedCategory } = useShop();
  const { categories = [] } = useAdmin();
  const entries = useMemo(() => categoryDirectory(products, categories), [products, categories]);
  const filled = entries.filter((entry) => entry.count > 0);
  const coming = entries.filter((entry) => entry.count === 0);
  if (filled.length === 0) return null;

  const open = (name: string) => { navigateToCategory(name as any); window.scrollTo(0, 0); };
  const pill = (entry: { name: string; count: number }) => (
    <li key={entry.name}>
      <button type="button" onClick={() => open(entry.name)} aria-current={activePage === 'shop' && selectedCategory === entry.name ? 'page' : undefined}
        className={`cdir-p ${entry.count > 0 ? '' : 'soon'}`}>
        {entry.name}<span className="aura-num">{entry.count > 0 ? entry.count : 'Soon'}</span>
      </button>
    </li>
  );

  return (
    <section id="category-directory" aria-labelledby="category-directory-title" className="cdir">
      <div className="cdir-in">
        <AuraTitle
          id="category-directory-title"
          label="The whole range"
          title="Shop every"
          accent="category"
          sub={coming.length > 0
            ? `${filled.length} ${filled.length === 1 ? 'category has' : 'categories have'} styles today. ${coming.length} more are on the way.`
            : `${filled.length} categories, all with styles today.`}
          className="pb-6"
        />
        <ul className="cdir-l" aria-label="Categories with styles">{filled.map(pill)}</ul>
        {coming.length > 0 && (
          <>
            <p className="aura-lbl cdir-h">Coming soon</p>
            <ul className="cdir-l" aria-label="Categories coming soon">{coming.map(pill)}</ul>
          </>
        )}
      </div>
    </section>
  );
};
