export function categoryToSlug(category: string): string {
  if (!category || category === 'All') return 'all';
  if (category === 'Kids & Toys') return 'kids-toys';
  return category
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function slugToCategory(slug: string): string {
  if (!slug) return 'All';
  const clean = slug.trim().toLowerCase();

  const map: Record<string, string> = {
    'all': 'All',
    'anarkali': 'Anarkali',
    'suits': 'Suits',
    'salwar-suits': 'Suits',
    'suit-sets': 'Suits',
    'kurtis': 'Kurtis',
    'kurti': 'Kurtis',
    'dresses': 'Dresses',
    'dupatta-sets': 'Dupatta Sets',
    'dupatta': 'Dupatta Sets',
    'co-ord-sets': 'Co-ord Sets',
    'co-ords': 'Co-ord Sets',
    'coord': 'Co-ord Sets',
    'festive-wear': 'Festive Wear',
    'festive': 'Festive Wear',
    'party-wear': 'Party Wear',
    'party': 'Party Wear',
    'sale': 'Sale',
    'new-arrivals': 'New Arrivals',
    'best-sellers': 'Best Sellers',
    'trending': 'Trending',
    'kids': 'Kids',
    'kids-toys': 'Kids & Toys',
    'kids-and-toys': 'Kids & Toys',
    'baby-girls': 'Baby Girls',
    'girls': 'Baby Girls',
    'baby-boys': 'Baby Boys',
    'boys': 'Baby Boys',
    'toys': 'Toys',
  };

  if (map[clean]) return map[clean];

  return clean
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
