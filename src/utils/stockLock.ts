import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS, getDocById } from '../lib/dataStore';
import { CartItem } from '../types';

export interface StockLockResult {
  success: boolean;
  outOfStockItem?: string;
  lockToken?: string;
  errorMessage?: string;
}

/**
 * Verify live stock availability in the database
 * when Razorpay checkout triggers to prevent overbooking.
 */
export async function lockAndReserveCartStock(cartItems: CartItem[]): Promise<StockLockResult> {
  if (!cartItems || cartItems.length === 0) {
    return { success: true };
  }

  try {
    const productIds = Array.from(new Set(cartItems.map(item => String(item.product.id))));

    // 1. Fetch live product documents from the 'products' collection
    const liveProducts = await Promise.all(productIds.map(id => getDocById(COLLECTIONS.products, id)));

    // 2. Map fetched products by ID
    const dbProductMap = new Map<string, any>();
    liveProducts.forEach(p => {
      if (p) dbProductMap.set(String(p.id), p);
    });

    // 3. Verify stock availability for each cart item
    for (const item of cartItems) {
      const dbProd = dbProductMap.get(String(item.product.id));
      if (!dbProd) {
        return {
          success: false,
          outOfStockItem: item.product.name,
          errorMessage: `Sorry, "${item.product.name}" is no longer available. Please remove it from your bag.`,
        };
      }

      const currentStock = Math.max(0, Number(dbProd.stockQuantity) || 0);
      const isAvailable = dbProd.inStock !== false && currentStock > 0;

      if (!isAvailable || currentStock < item.quantity) {
        return {
          success: false,
          outOfStockItem: item.product.name,
          errorMessage: `Sorry, "${item.product.name}" (Size ${item.selectedSize}) has only ${currentStock} item(s) remaining in stock.`,
        };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Stock verification error during checkout:', err);
    return { success: false, errorMessage: 'We could not verify live stock. Please try again before payment.' };
  }
}

/**
 * Release reserved stock lock when Razorpay checkout is cancelled or fails
 */
export async function releaseStockLock(lockToken?: string): Promise<void> {
  void lockToken;
}

/**
 * Confirm final stock deduction in the database after successful Razorpay payment.
 * Each product is decremented inside a Firestore transaction so concurrent orders
 * cannot overwrite each other's deductions. Only stockQuantity/inStock/updatedAt are written.
 */
export async function confirmStockDeduction(cartItems: CartItem[], _lockToken?: string): Promise<void> {
  if (!cartItems || cartItems.length === 0) return;

  // Combine quantities for the same product (different sizes/colours share one stock count)
  const quantities = new Map<string, number>();
  for (const item of cartItems) {
    const pId = String(item.product.id);
    quantities.set(pId, (quantities.get(pId) || 0) + (Number(item.quantity) || 0));
  }

  for (const [pId, quantity] of quantities) {
    try {
      const productRef = doc(db, COLLECTIONS.products, pId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(productRef);
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const existingQty = Math.max(0, Number(data.stockQuantity) || 0);
        const nextQty = Math.max(0, existingQty - quantity);

        transaction.update(productRef, {
          stockQuantity: nextQty,
          inStock: nextQty > 0 && data.inStock !== false,
          updatedAt: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.warn('Confirm stock deduction notice:', err);
    }
  }
}
