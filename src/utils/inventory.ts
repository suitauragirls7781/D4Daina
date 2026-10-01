import type { Product } from '../types';

/** Store default for "low stock" alerts when the admin has not chosen one. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Clean threshold value (whole number, 0-9999); anything invalid falls back to the default. */
export const cleanLowStockThreshold = (value: unknown, fallback = DEFAULT_LOW_STOCK_THRESHOLD): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(9999, n) : fallback;
};

/** The product's own alert level when set, otherwise the store threshold. */
export const lowStockLevelFor = (product: Pick<Product, 'lowStockThreshold'>, storeThreshold: number): number =>
  product.lowStockThreshold != null && Number(product.lowStockThreshold) > 0 ? Math.floor(Number(product.lowStockThreshold)) : storeThreshold;

/** Sold out, or at / below its low-stock level. */
export const isLowStock = (product: Pick<Product, 'inStock' | 'stockQuantity' | 'lowStockThreshold'>, storeThreshold: number): boolean =>
  !product.inStock || Math.max(0, Number(product.stockQuantity ?? 0)) <= lowStockLevelFor(product, storeThreshold);

/** One entry in the Firestore `inventory_log` collection (written only from the admin panel). */
export interface InventoryLogEntry {
  id: string;
  at: string;
  by: 'admin';
  productId: string;
  productName: string;
  from: number;
  to: number;
  reason: string;
}
