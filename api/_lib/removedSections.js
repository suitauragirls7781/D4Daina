// Kids wear and toys were taken out of the store (owner, 2026-10-12). Styles and categories saved for them
// earlier stay in the database (nothing is deleted) and are left out of everything the store hands out or sells.
// The same rule is in src/utils/removedSections.ts.
export const REMOVED_CATEGORIES = ['Baby Girls', 'Baby Boys', 'Toys', 'Kids', 'Kids & Toys'];
const REMOVED_TYPES = ['kids', 'toy'];

export const isRemovedCategory = (name) => REMOVED_CATEGORIES.includes(String(name || '').trim());
export const isRemovedSection = (product) => REMOVED_TYPES.includes(String(product?.productType || '')) || isRemovedCategory(product?.category);
