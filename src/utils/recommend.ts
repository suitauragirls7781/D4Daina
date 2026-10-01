import { Product } from '../types';
import { isAvailable, productColourFamilies, productOccasions } from './smartQuery';
import { departmentOf } from './kids';

/** How alike two real products are (category, colour, occasion, fabric, price band). */
export const similarity = (a: Product, b: Product) => {
  let score = 0;
  if (a.category === b.category) score += 4;
  const ca = productColourFamilies(a);
  if (productColourFamilies(b).some((c) => ca.includes(c))) score += 3;
  const oa = productOccasions(a);
  if (productOccasions(b).some((o) => oa.includes(o))) score += 2;
  const fa = (a.fabric || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (fa.some((w) => (b.fabric || '').toLowerCase().includes(w))) score += 1;
  const ratio = Math.max(a.price, b.price) / Math.max(1, Math.min(a.price, b.price));
  if (ratio <= 1.3) score += 2; else if (ratio <= 1.7) score += 1;
  return score;
};

/** Similar available styles for a product page. */
export const similarProducts = (product: Product, all: Product[], limit = 8) =>
  all
    .filter((p) => p.id !== product.id && !p.hidden && isAvailable(p) && departmentOf(p) === departmentOf(product))
    .map((p) => ({ p, s: similarity(product, p) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.p);

/**
 * "Picked for you": ranks available products by similarity to what this shopper looked at,
 * saved or added to the bag (on this device / account). Products already viewed are left out.
 */
export const pickedForYou = (all: Product[], signals: Product[], exclude: Set<string>, limit = 8) => {
  if (!signals.length) return [];
  return all
    .filter((p) => !p.hidden && isAvailable(p) && !exclude.has(p.id))
    .map((p) => ({ p, s: signals.reduce((sum, sig, i) => sum + similarity(sig, p) * (i < 3 ? 1.5 : 1), 0) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.p);
};
