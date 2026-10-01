import type { CartItem, Coupon } from '../types';

const key = (value: unknown) => String(value || '').trim().toLowerCase();
const list = (value: unknown) => (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean);

/** True when the admin limited the coupon to some categories and/or products. */
export const isCouponRestricted = (coupon: Pick<Coupon, 'allowedCategories' | 'allowedProductIds'> | null | undefined) =>
  Boolean(coupon && (list(coupon.allowedCategories).length || list(coupon.allowedProductIds).length));

/** Whether one cart line counts for the coupon (any allowed category or any allowed product; no limit = every line). */
export const isCouponEligibleItem = (coupon: Pick<Coupon, 'allowedCategories' | 'allowedProductIds'>, item: Pick<CartItem, 'product'>) => {
  const categories = list(coupon.allowedCategories).map(key);
  const productIds = list(coupon.allowedProductIds);
  if (!categories.length && !productIds.length) return true;
  return productIds.includes(String(item.product?.id || '')) || categories.includes(key(item.product?.category));
};

/**
 * Subtotal of the cart lines the coupon applies to. Browser preview only: must match couponEligibleSubtotal in
 * api/_lib/orders.js, which recalculates it before payment.
 */
export const couponEligibleSubtotal = (coupon: Pick<Coupon, 'allowedCategories' | 'allowedProductIds'>, items: Array<Pick<CartItem, 'product' | 'quantity'>>) =>
  items
    .filter((item) => isCouponEligibleItem(coupon, item))
    .reduce((sum, item) => sum + Math.max(0, Number(item.product?.price) || 0) * Math.max(0, Number(item.quantity) || 0), 0);

/** Short honest conditions shown with a coupon, e.g. ["Valid on Kurta Sets only", "1 use per customer"]. */
export const couponRestrictionNotes = (coupon: Coupon): string[] => {
  const notes: string[] = [];
  const categories = list(coupon.allowedCategories);
  const products = list(coupon.allowedProductIds);
  if (categories.length && products.length) notes.push(`Valid on ${categories.join(', ')} and selected products only`);
  else if (categories.length) notes.push(`Valid on ${categories.join(', ')} only`);
  else if (products.length) notes.push(`Valid on selected product${products.length === 1 ? '' : 's'} only`);
  const perUser = Math.floor(Number(coupon.perUserLimit) || 0);
  if (perUser > 0) notes.push(`${perUser} use${perUser === 1 ? '' : 's'} per customer`);
  return notes;
};
