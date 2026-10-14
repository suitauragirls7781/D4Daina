import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../../lib/firebase';
import type { Order, Product } from '../../../types';
import { isWomenCategory } from '../../../data/womenCategories';
import { dayRange, istDay, istToday, shiftDay } from '../adminStats';

/**
 * Shared logic of the catalogue pages (Products, the product form, Categories): the listing-quality checks,
 * the per-product numbers of the last 30 days and the small hand-offs between pages. Everything is worked
 * out from the store's own data; nothing here is estimated.
 */

// ---------------------------------------------------------------- listing quality ("health")

/** The parts of a product the checks read: the saved product, or the product form while it is being filled. */
export type HealthInput = Pick<Product, 'name' | 'price' | 'originalPrice' | 'images' | 'description' | 'sizes' | 'colors' | 'fabric' | 'category' | 'seoTitle' | 'seoDescription' | 'stockQuantity' | 'hidden'>;

export type FixKind = 'seo-title' | 'seo-description';

export interface HealthCheck {
  id: string;
  label: string;
  ok: boolean;
  /** What to do, in plain words, when the check is not met. */
  todo: string;
  /** The product form section that fixes it. */
  section: string;
  /** Points out of 100. */
  weight: number;
  /** A fix that can be done in one tap from the list (only where the text is already in the product). */
  fix?: FixKind;
}

export const DESCRIPTION_GOOD = 120;
export const PHOTOS_GOOD = 3;
const isRealColourName = (name?: string) => Boolean(name && !['standard', 'default', 'new color', 'new colour', ''].includes(name.trim().toLowerCase()));

/** The ready-made page title the store already uses when no title is typed (ProductDetailPage). */
export const defaultSeoTitle = (name: string) => `${name.trim()} | Suit Aura Girls`;
/** The first sentences of the description that fit in what Google shows (about 155 characters). */
export const seoDescriptionFrom = (description: string) => {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 155) return text;
  const cut = text.slice(0, 156);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return (stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')).trim();
};

/** The real checks behind a product's listing score. */
export const healthChecks = (p: HealthInput): HealthCheck[] => {
  const photos = (p.images || []).filter((u) => typeof u === 'string' && u.trim()).length;
  const description = String(p.description || '').trim();
  const price = Number(p.price) || 0;
  const mrp = Number(p.originalPrice) || 0;
  const off = mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const stock = Math.max(0, Number(p.stockQuantity) || 0);
  return [
    { id: 'photos', label: `${PHOTOS_GOOD}+ photos`, ok: photos >= PHOTOS_GOOD, todo: photos ? `Only ${photos} photo${photos === 1 ? '' : 's'}: add the back and a close-up` : 'Add photos', section: 'apf-sec-photos', weight: 25 },
    { id: 'description', label: 'Description', ok: description.length >= DESCRIPTION_GOOD, todo: description ? `Only ${description.length} characters: say the fabric, the work and the fit` : 'No description yet', section: 'apf-sec-name', weight: 20 },
    { id: 'price', label: 'Price and MRP', ok: price > 0 && (mrp === 0 || mrp >= price) && off <= 80, todo: price <= 0 ? 'No price' : off > 80 ? `${off}% off looks unreal to shoppers: check the MRP` : 'MRP is below the price', section: 'apf-sec-price', weight: 15 },
    { id: 'colour', label: 'Colour named', ok: (p.colors || []).some((c) => isRealColourName(c?.name)), todo: 'Name the colour so shoppers can search it', section: 'apf-sec-sizes', weight: 10 },
    { id: 'details', label: 'Fabric', ok: Boolean(String(p.fabric || '').trim()), todo: 'Write the fabric (shown on the product page)', section: 'apf-sec-details', weight: 10 },
    { id: 'category', label: 'Women\'s category', ok: isWomenCategory(p.category), todo: 'Pick one of the store\'s categories', section: 'apf-sec-category', weight: 5 },
    { id: 'seo-title', label: 'Google title', ok: Boolean(String(p.seoTitle || '').trim()), todo: 'No search title (the name is used)', section: 'apf-sec-seo', weight: 5, fix: p.name?.trim() ? 'seo-title' : undefined },
    { id: 'seo-description', label: 'Google description', ok: Boolean(String(p.seoDescription || '').trim()), todo: 'No search description', section: 'apf-sec-seo', weight: 5, fix: description ? 'seo-description' : undefined },
    { id: 'stock', label: 'In stock', ok: p.hidden ? true : stock > 0, todo: 'Live on the store but sold out', section: 'apf-sec-stock', weight: 5 },
  ];
};

export const healthScore = (checks: HealthCheck[]) => {
  const total = checks.reduce((s, c) => s + c.weight, 0) || 1;
  return Math.round((checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0) / total) * 100);
};

export const healthWord = (score: number) => (score >= 90 ? 'Great' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work');

/** The change a one-tap fix saves (null when it cannot be done from what is saved). */
export const fixChange = (p: Product, kind: FixKind): Partial<Product> | null => {
  if (kind === 'seo-title' && p.name.trim()) return { seoTitle: defaultSeoTitle(p.name).slice(0, 120) };
  if (kind === 'seo-description' && p.description.trim()) return { seoDescription: seoDescriptionFrom(p.description) };
  return null;
};

// ---------------------------------------------------------------- the last 30 days per product

export const PERF_DAYS = 30;

export interface ProductNumbers { views: number; saves: number; sold: number; revenue: number }
export interface PerformanceData {
  /** null while the counts are read or when they could not be read. */
  byId: Map<string, ProductNumbers> | null;
  loading: boolean;
  failed: boolean;
  /** The orders list has arrived (sales are counted from it). */
  ordersReady: boolean;
}

let traffic: { day: string; rows: Map<string, { views: number; saves: number }> } | null = null;
let trafficLoad: Promise<Map<string, { views: number; saves: number }>> | null = null;

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Views and wishlist saves of the last 30 India days from product_daily (the server's own counts), read once per day. */
const loadTraffic = () => {
  const today = istToday();
  if (traffic && traffic.day === today) return Promise.resolve(traffic.rows);
  if (trafficLoad) return trafficLoad;
  const days = dayRange(shiftDay(today, -(PERF_DAYS - 1)), today);
  trafficLoad = Promise.all(chunks(days, 10).map((part) => getDocs(query(collection(db, 'product_daily'), where('day', 'in', part)))))
    .then((results) => {
      const rows = new Map<string, { views: number; saves: number }>();
      results.forEach((snap) => snap.docs.forEach((d) => {
        const x = d.data();
        const id = String(x.productId || '');
        if (!id) return;
        const row = rows.get(id) || { views: 0, saves: 0 };
        row.views += Number(x.views) || 0;
        row.saves += Number(x.wishlists) || 0;
        rows.set(id, row);
      }));
      traffic = { day: today, rows };
      return rows;
    })
    .finally(() => { trafficLoad = null; });
  return trafficLoad;
};

/** Units and money from paid orders of the last 30 days (not cancelled, not refunded, not test payments). */
export const salesByProduct = (orders: Order[]) => {
  const since = shiftDay(istToday(), -(PERF_DAYS - 1));
  const out = new Map<string, { sold: number; revenue: number }>();
  orders.forEach((o) => {
    if ((o as any).testPayment || o.paymentStatus !== 'Paid' || o.status === 'Cancelled' || o.status === 'Refunded') return;
    if (istDay((o as any).paidAt || o.date) < since) return;
    (o.items || []).forEach((item) => {
      const id = String(item.product?.id || '');
      if (!id) return;
      const qty = Number(item.quantity) || 0;
      const row = out.get(id) || { sold: 0, revenue: 0 };
      row.sold += qty;
      row.revenue += qty * (Number(item.product?.price) || 0);
      out.set(id, row);
    });
  });
  return out;
};

/** Views, saves and sales of every product in the last 30 days. */
export const useProductPerformance = (orders: Order[], ordersLoaded: boolean): PerformanceData => {
  const [rows, setRows] = useState(traffic?.day === istToday() ? traffic.rows : null);
  const [loading, setLoading] = useState(!rows);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stop = false;
    loadTraffic()
      .then((r) => { if (!stop) { setRows(r); setFailed(false); } })
      .catch(() => { if (!stop) setFailed(true); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);
  const byId = useMemo(() => {
    if (!rows) return null;
    const sales = salesByProduct(orders);
    const ids = new Set([...rows.keys(), ...sales.keys()]);
    const out = new Map<string, ProductNumbers>();
    ids.forEach((id) => {
      const t = rows.get(id);
      const s = sales.get(id);
      out.set(id, { views: t?.views || 0, saves: t?.saves || 0, sold: s?.sold || 0, revenue: s?.revenue || 0 });
    });
    return out;
  }, [rows, orders]);
  return { byId, loading, failed, ordersReady: ordersLoaded };
};

// ---------------------------------------------------------------- hand-offs between catalogue pages

let pendingCategory: string | null = null;
let pendingSection: { id: string; section: string } | null = null;

/** Categories → Products: open the list showing only this category. */
export const showCategoryInProducts = (category: string) => { pendingCategory = category; };
export const takePendingCategory = () => { const c = pendingCategory; pendingCategory = null; return c; };

/** Products → product form: open the form at the section that fixes a check. */
export const openFormAt = (id: string, section: string) => { pendingSection = { id, section }; };
export const takePendingSection = (id: string | undefined) => {
  if (!id || !pendingSection || pendingSection.id !== id) return null;
  const s = pendingSection.section;
  pendingSection = null;
  return s;
};

// ---------------------------------------------------------------- small helpers

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const offOf = (price: number, mrp: number) => (mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0);

/** Per-viewer convenience (the chosen view); never needed for anything to work. */
export const readPref = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
export const writePref = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private window: the choice just is not remembered */ }
};
