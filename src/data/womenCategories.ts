/**
 * Every women's category the store can sell under, in one place (owner, 2026-10-13: "all the high-selling
 * women's categories"). The admin's product form, product filter, Categories page and hero links, the
 * storefront's menu, category directory, search words and category addresses are all built from this list.
 * To add a category, add it here and nowhere else.
 *
 * A category shows its real number of styles; one that has none yet is shown as "Soon" and opens an honest
 * "coming soon" page. Nothing is invented for it: no photo, no count, no product.
 */
export const WOMEN_CATEGORY_NAMES = [
  'Suits',
  'Kurtis',
  'Kurta Sets',
  'Anarkali',
  'Sarees',
  'Lehenga Choli',
  'Gowns',
  'Dresses',
  'Co-ord Sets',
  'Sharara Sets',
  'Palazzo Sets',
  'Dupatta Sets',
  'Indo-Western',
  'Dress Materials',
  'Tops & Tunics',
  'Bottom Wear',
  'Skirts',
  'Jumpsuits',
  'Blouses',
  'Dupattas & Stoles',
  'Shrugs & Jackets',
  'Nightwear',
  'Winter Wear',
  'Maternity Wear',
  'Plus Size',
  'Festive Wear',
  'Party Wear',
  'Wedding Wear',
  'Office Wear',
] as const;

export type WomenCategoryName = (typeof WOMEN_CATEGORY_NAMES)[number];

interface CategoryInfo {
  /** One plain line about the category (admin and the coming-soon page). */
  line: string;
  /** Other addresses that open it: /category/<alias>. Its own address is made from the name. */
  aliases: string[];
  /** What a shopper may type for it in search (lower case; English and common Hindi-English). */
  ask: string[];
  /** Words looked for in a style's name, category and description when that is typed. */
  find: string[];
}

export const WOMEN_CATEGORY_INFO: Record<WomenCategoryName, CategoryInfo> = {
  'Suits': { line: 'Salwar suits and suit sets with dupatta', aliases: ['salwar-suits', 'suit-sets', 'suit'], ask: ['suit', 'suits', 'salwar', 'soot'], find: ['suit'] },
  'Kurtis': { line: 'Everyday and festive kurtis', aliases: ['kurti', 'kurtas'], ask: ['kurti', 'kurtis', 'kurta', 'kurtas'], find: ['kurti', 'kurta'] },
  'Kurta Sets': { line: 'Kurta with pant or palazzo, with or without dupatta', aliases: ['kurta-set', 'kurti-sets', 'kurta-pant-sets'], ask: ['kurta set', 'kurta sets', 'kurti set', 'kurta pant', 'kurti pant'], find: ['kurta set', 'kurti set', 'kurta pant', 'kurta sets'] },
  'Anarkali': { line: 'Flared anarkali kurtas and sets', aliases: ['anarkalis', 'anarkali-suits'], ask: ['anarkali', 'anarkalis'], find: ['anarkali'] },
  'Sarees': { line: 'Silk, georgette, cotton and party sarees', aliases: ['saree', 'sari', 'saris'], ask: ['saree', 'sarees', 'sari', 'saris', 'saadi', 'sadi'], find: ['saree', 'sari'] },
  'Lehenga Choli': { line: 'Lehenga choli sets for weddings and festivals', aliases: ['lehenga', 'lehengas', 'lehnga'], ask: ['lehenga', 'lehengas', 'lehnga', 'lahanga', 'lehanga', 'choli', 'ghagra', 'chaniya'], find: ['lehenga', 'choli', 'ghagra'] },
  'Gowns': { line: 'Ethnic and party gowns', aliases: ['gown', 'ethnic-gowns'], ask: ['gown', 'gowns'], find: ['gown', 'anarkali'] },
  'Dresses': { line: 'Ethnic and fusion dresses', aliases: ['dress'], ask: ['dress', 'dresses', 'frock'], find: ['dress'] },
  'Co-ord Sets': { line: 'Matching top and bottom sets', aliases: ['co-ords', 'coord', 'coord-sets', 'co-ord'], ask: ['co-ord', 'co-ords', 'coord', 'coords', 'co ord', 'cord set'], find: ['co-ord', 'coord', 'co ord'] },
  'Sharara Sets': { line: 'Sharara and gharara sets', aliases: ['sharara', 'gharara', 'garara-sets'], ask: ['sharara', 'gharara', 'garara'], find: ['sharara', 'gharara', 'garara'] },
  'Palazzo Sets': { line: 'Kurta with palazzo sets', aliases: ['palazzo', 'palazzo-suits'], ask: ['palazzo', 'plazo', 'plazzo'], find: ['palazzo'] },
  'Dupatta Sets': { line: 'Suit sets that come with a dupatta', aliases: ['dupatta'], ask: ['dupatta set', 'dupatta sets'], find: ['dupatta'] },
  'Indo-Western': { line: 'Fusion wear: capes, dhoti sets and draped styles', aliases: ['indo-western-wear', 'indowestern', 'fusion-wear'], ask: ['indo western', 'indowestern', 'indo-western', 'fusion'], find: ['indo-western', 'indo western', 'fusion'] },
  'Dress Materials': { line: 'Unstitched suits and dress materials', aliases: ['dress-material', 'unstitched', 'unstitched-suits'], ask: ['dress material', 'dress materials', 'unstitched', 'kapda'], find: ['dress material', 'unstitched'] },
  'Tops & Tunics': { line: 'Tops, tunics and short kurtis', aliases: ['tops', 'tunics', 'tops-and-tunics'], ask: ['top', 'tops', 'tunic', 'tunics', 'shirt', 'shirts'], find: ['top', 'tunic', 'shirt'] },
  'Bottom Wear': { line: 'Palazzos, pants, leggings and salwars', aliases: ['bottoms', 'pants', 'leggings', 'palazzos'], ask: ['legging', 'leggings', 'pant', 'pants', 'trouser', 'trousers', 'bottom', 'bottoms', 'pajama', 'pyjama'], find: ['legging', 'pant', 'trouser', 'bottom wear'] },
  'Skirts': { line: 'Ethnic and long skirts', aliases: ['skirt', 'long-skirts'], ask: ['skirt', 'skirts'], find: ['skirt'] },
  'Jumpsuits': { line: 'Ethnic and party jumpsuits', aliases: ['jumpsuit'], ask: ['jumpsuit', 'jumpsuits', 'jump suit'], find: ['jumpsuit', 'jump suit'] },
  'Blouses': { line: 'Ready-made and designer blouses', aliases: ['blouse', 'saree-blouses'], ask: ['blouse', 'blouses'], find: ['blouse'] },
  'Dupattas & Stoles': { line: 'Dupattas, stoles and shawls sold on their own', aliases: ['dupattas', 'stoles', 'dupattas-and-stoles'], ask: ['dupatta', 'dupattas', 'chunni', 'stole', 'stoles', 'shawl', 'shawls', 'odhni'], find: ['dupatta', 'stole', 'shawl'] },
  'Shrugs & Jackets': { line: 'Ethnic jackets, shrugs and koti', aliases: ['shrugs', 'jackets', 'shrugs-and-jackets'], ask: ['shrug', 'shrugs', 'jacket', 'jackets', 'koti', 'cape'], find: ['shrug', 'jacket', 'koti', 'cape'] },
  'Nightwear': { line: 'Night suits, nighties and loungewear', aliases: ['night-suits', 'loungewear', 'nighty'], ask: ['nightwear', 'night suit', 'nightsuit', 'nighty', 'nightie', 'loungewear', 'night dress'], find: ['nightwear', 'night suit', 'nightsuit', 'nighty', 'nightie', 'night dress', 'loungewear'] },
  'Winter Wear': { line: 'Woollen kurtis, sweaters and winter suits', aliases: ['winter', 'woollen'], ask: ['winter', 'woollen', 'woolen', 'sweater', 'sweaters', 'cardigan', 'sardi'], find: ['winter', 'woollen', 'woolen', 'sweater', 'cardigan'] },
  'Maternity Wear': { line: 'Maternity and feeding kurtis and dresses', aliases: ['maternity', 'feeding-kurtis'], ask: ['maternity', 'feeding', 'pregnancy', 'nursing'], find: ['maternity', 'feeding', 'nursing'] },
  'Plus Size': { line: 'Styles cut for 3XL to 5XL', aliases: ['plus-size-wear', 'plus'], ask: ['plus size', 'plus-size', 'plussize'], find: ['plus size', 'plus-size'] },
  'Festive Wear': { line: 'Styles for festivals and pujas', aliases: ['festive'], ask: [], find: [] },
  'Party Wear': { line: 'Styles for parties and evenings', aliases: ['party'], ask: [], find: [] },
  'Wedding Wear': { line: 'Heavy and bridal styles for the wedding season', aliases: ['wedding', 'bridal', 'bridal-wear'], ask: [], find: [] },
  'Office Wear': { line: 'Plain and formal styles for work', aliases: ['office', 'workwear', 'formal-wear'], ask: [], find: [] },
};

/** The category's own address part: "Tops & Tunics" → "tops-tunics". Kept the same as categoryToSlug in utils/slugHelper. */
const slugOf = (name: string) => name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

/** Address part → category name, for every category and each of its aliases. */
export const WOMEN_CATEGORY_BY_SLUG: Record<string, WomenCategoryName> = Object.fromEntries(
  WOMEN_CATEGORY_NAMES.flatMap((name) => [slugOf(name), ...WOMEN_CATEGORY_INFO[name].aliases].map((slug) => [slug, name])),
) as Record<string, WomenCategoryName>;

export const isWomenCategory = (name?: string | null): name is WomenCategoryName =>
  (WOMEN_CATEGORY_NAMES as readonly string[]).includes(String(name || ''));

export interface DirectoryEntry { name: string; count: number; line: string }

/**
 * The store's whole range for the menu, the directory and the search panel: every category with its real
 * number of styles (those with styles first, most styles first; then the ones still to come, in list order).
 * A category the owner switched off in Admin → Categories is left out while it has no styles.
 */
export const categoryDirectory = (
  products: Array<{ category?: string | null }>,
  categoryDocs: Array<{ name?: string; isActive?: boolean }> = [],
): DirectoryEntry[] => {
  const counts = new Map<string, number>();
  products.forEach((p) => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
  const off = new Set(categoryDocs.filter((c) => c.isActive === false).map((c) => String(c.name || '')));
  const lineOf = (name: string) => (isWomenCategory(name) ? WOMEN_CATEGORY_INFO[name].line : '');
  const filled = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, line: lineOf(name) }));
  const coming = WOMEN_CATEGORY_NAMES.filter((name) => !counts.has(name) && !off.has(name)).map((name) => ({ name: name as string, count: 0, line: lineOf(name) }));
  return [...filled, ...coming];
};
