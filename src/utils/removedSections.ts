/**
 * Kids wear and toys were taken out of the store (owner, 2026-10-12): the site and the admin panel have no such
 * section any more. Styles and categories saved for them earlier are still in the database (nothing is deleted),
 * so they are left out wherever the catalogue is read. The same rule is in api/_lib/removedSections.js.
 */
export const REMOVED_CATEGORIES: readonly string[] = ['Baby Girls', 'Baby Boys', 'Toys', 'Kids', 'Kids & Toys'];
const REMOVED_TYPES: readonly string[] = ['kids', 'toy'];

export const isRemovedCategory = (name?: string | null) => REMOVED_CATEGORIES.includes(String(name || '').trim());
export const isRemovedSection = (p?: { productType?: string | null; category?: string | null } | null) =>
  REMOVED_TYPES.includes(String(p?.productType || '')) || isRemovedCategory(p?.category);
