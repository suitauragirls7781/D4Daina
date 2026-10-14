import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { Order, Product } from '../../types';
import { istDay } from './adminStats';
import { isRemovedCategory } from '../../utils/removedSections';

/**
 * Per-product and per-category numbers for a set of days: product page views and wishlist saves
 * (`product_daily`, the server's own counts: once per visitor per product per day), search terms
 * (`search_terms`) and, from the paid orders, pieces sold and sales. There is no per-product count of
 * "added to bag" in the store's data, so it is not shown.
 *
 * Each day is read once per admin visit and kept (a closed day never changes; today is read again after
 * five minutes), so switching periods only reads the new days.
 */

interface DayCounts {
  views: Record<string, number>;
  wishlists: Record<string, number>;
  terms: Record<string, number>;
  at: number;
}
const cache = new Map<string, DayCounts>();
const TODAY_FRESH_MS = 5 * 60 * 1000;
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** A kept day is good unless it is one of the newest two (product_daily days are the server's UTC days; those can still grow). */
const fresh = (day: string) => {
  const hit = cache.get(day);
  if (!hit) return false;
  const stillGrowing = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return day < stillGrowing || Date.now() - hit.at < TODAY_FRESH_MS;
};

/** Views, wishlist saves and searches for `days`, read once and kept. */
export const useProductDaily = (days: string[], today: string) => {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = days.join(',');

  useEffect(() => {
    const missing = days.filter((day) => !fresh(day));
    if (!missing.length) { setLoading(false); setFailed(false); return undefined; }
    let stopped = false;
    setLoading(true);
    setFailed(false);
    Promise.all(chunks(missing, 10).map((part) => Promise.all([
      getDocs(query(collection(db, 'search_terms'), where('day', 'in', part))),
      getDocs(query(collection(db, 'product_daily'), where('day', 'in', part))),
    ]))).then((results) => {
      const at = Date.now();
      missing.forEach((day) => cache.set(day, { views: {}, wishlists: {}, terms: {}, at }));
      results.forEach(([terms, productRows]) => {
        terms.docs.forEach((d) => {
          const x = d.data();
          const row = cache.get(String(x.day));
          if (row && x.term) row.terms[String(x.term)] = (row.terms[String(x.term)] || 0) + (Number(x.count) || 0);
        });
        productRows.docs.forEach((d) => {
          const x = d.data();
          const row = cache.get(String(x.day));
          const id = String(x.productId || '');
          if (!row || !id) return;
          row.views[id] = (row.views[id] || 0) + (Number(x.views) || 0);
          row.wishlists[id] = (row.wishlists[id] || 0) + (Number(x.wishlists) || 0);
        });
      });
      if (!stopped) setVersion((n) => n + 1);
    }).catch(() => { if (!stopped) setFailed(true); }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, today]);

  return useMemo(() => {
    const sum = (pick: (d: DayCounts) => Record<string, number>) => {
      const total = new Map<string, number>();
      days.forEach((day) => {
        const row = cache.get(day);
        if (row) Object.entries(pick(row)).forEach(([id, n]) => total.set(id, (total.get(id) || 0) + n));
      });
      return total;
    };
    return { views: sum((d) => d.views), wishlists: sum((d) => d.wishlists), terms: sum((d) => d.terms), loading, failed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, loading, failed]);
};

export interface ProductSales { units: number; sales: number; orders: number }

/**
 * Pieces sold and sales per product in `days`: paid orders not cancelled or refunded, by the India-time day
 * they were paid. A line's sales are its price × quantity before order-level discounts (coupon, prepaid
 * discount), so product sales add up to a little more than the order totals.
 */
export const salesByProduct = (orders: Order[], days: string[]) => {
  const inPeriod = new Set(days);
  const map = new Map<string, ProductSales>();
  orders.forEach((o) => {
    if (o.testPayment || o.paymentStatus !== 'Paid' || o.status === 'Cancelled' || o.status === 'Refunded') return;
    if (!inPeriod.has(istDay(o.paidAt || o.date))) return;
    const seen = new Set<string>();
    (o.items || []).forEach((item) => {
      const id = String(item.product?.id || '');
      if (!id) return;
      const row = map.get(id) || { units: 0, sales: 0, orders: 0 };
      const qty = Number(item.quantity) || 0;
      row.units += qty;
      row.sales += qty * (Number(item.product?.price) || 0);
      if (!seen.has(id)) { row.orders += 1; seen.add(id); }
      map.set(id, row);
    });
  });
  return map;
};

export interface CategoryRow { category: string; views: number; units: number; sales: number; products: number }

/** Views, pieces sold and line sales per category for the products in the catalogue (removed products under "Removed products"). */
export const categoryRows = (products: Product[], views: Map<string, number>, sold: Map<string, ProductSales>, soldCategory: Map<string, string>) => {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const rows = new Map<string, CategoryRow>();
  const at = (category: string) => {
    let row = rows.get(category);
    if (!row) { row = { category, views: 0, units: 0, sales: 0, products: 0 }; rows.set(category, row); }
    return row;
  };
  products.forEach((p) => { if (p.productType !== 'accessory') at(String(p.category || 'Other')).products += 1; });
  views.forEach((n, id) => { const p = byId.get(id); at(p ? String(p.category || 'Other') : 'Removed products').views += n; });
  sold.forEach((s, id) => {
    const p = byId.get(id);
    const row = at(p ? String(p.category || 'Other') : soldCategory.get(id) || 'Removed products');
    row.units += s.units;
    row.sales += s.sales;
  });
  // Kids wear and toys were removed from the store (2026-10-12): their old numbers are left out
  return [...rows.values()].filter((r) => (r.views > 0 || r.units > 0) && !isRemovedCategory(r.category));
};

/** The category each sold product had in its order (for products no longer in the catalogue). */
export const soldCategories = (orders: Order[]) => {
  const map = new Map<string, string>();
  orders.forEach((o) => (o.items || []).forEach((item) => {
    const id = String(item.product?.id || '');
    if (id && item.product?.category) map.set(id, String(item.product.category));
  }));
  return map;
};
