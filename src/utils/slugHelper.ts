import { WOMEN_CATEGORY_BY_SLUG } from '../data/womenCategories';

export function categoryToSlug(category: string): string {
  if (!category || category === 'All') return 'all';
  return category
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

export function slugToCategory(slug: string): string {
  if (!slug) return 'All';
  const clean = slug.trim().toLowerCase();

  // Every women's category and its other addresses come from src/data/womenCategories.ts
  const map: Record<string, string> = {
    ...WOMEN_CATEGORY_BY_SLUG,
    'all': 'All',
    'sale': 'Sale',
    'new-arrivals': 'New Arrivals',
    'best-sellers': 'Best Sellers',
    'trending': 'Trending',
  };

  if (map[clean]) return map[clean];
  // Kids wear and toys were taken out of the store: an old link to them opens the whole shop
  if (['kids', 'kids-toys', 'kids-and-toys', 'baby-girls', 'girls', 'baby-boys', 'boys', 'toys'].includes(clean)) return 'All';

  return clean
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
