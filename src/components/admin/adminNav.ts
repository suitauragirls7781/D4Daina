import { useCallback, useEffect, useState } from 'react';
import {
  type LucideIcon,
  BarChart3, LayoutDashboard, Package, PlusCircle, Layers, ShoppingBag, Users, Tag, LayoutTemplate,
  Image as ImageIcon, MessageSquare, Instagram, Settings, CreditCard, Gauge, Sparkles, Flame, Star, Film,
  Compass, Shirt, RotateCcw, ShoppingCart, XCircle, Gift,
} from 'lucide-react';
import type { AdminTab } from '../../types';

/**
 * The admin's map: every page, its group, its address and its keyboard shortcut. The sidebar, the phone menu,
 * the bottom bar, the breadcrumbs, the command palette and the shortcut sheet are all built from this one list.
 */

export type NavId = AdminTab | 'add-product';
export type NavGroup = 'Overview' | 'Orders' | 'Customers' | 'Catalogue' | 'Offers' | 'Storefront' | 'System';
export const NAV_GROUPS: NavGroup[] = ['Overview', 'Orders', 'Customers', 'Catalogue', 'Offers', 'Storefront', 'System'];

export interface NavSpec {
  id: NavId;
  label: string;
  /** Shorter name for the bottom bar and the breadcrumbs on a phone. */
  short?: string;
  route: string;
  icon: LucideIcon;
  group: NavGroup;
  /** "g" then this key opens the page. */
  key?: string;
  /** Extra words the command palette matches. */
  words?: string;
}

// The order of this list is the order in the menu, group by group
export const NAV_SPECS: NavSpec[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', route: '/admin/dashboard', icon: LayoutDashboard, group: 'Overview', key: 'd', words: 'home today overview live visitors' },
  { id: 'reports', label: 'Reports', route: '/admin/reports', icon: BarChart3, group: 'Overview', key: 'e', words: 'sales history csv export week month' },

  { id: 'orders', label: 'Orders', route: '/admin/orders', icon: ShoppingBag, group: 'Orders', key: 'o', words: 'pack ship deliver courier' },
  { id: 'returns', label: 'Returns & exchanges', short: 'Returns', route: '/admin/returns', icon: RotateCcw, group: 'Orders', key: 'r', words: 'exchange return request' },
  { id: 'cancellations', label: 'Cancellations', short: 'Cancels', route: '/admin/cancellations', icon: XCircle, group: 'Orders', key: 'x', words: 'cancel refund' },
  { id: 'abandoned', label: 'Abandoned checkouts', short: 'Abandoned', route: '/admin/abandoned', icon: ShoppingCart, group: 'Orders', key: 'a', words: 'cart left checkout' },

  { id: 'customers', label: 'Customers', route: '/admin/customers', icon: Users, group: 'Customers', key: 'u', words: 'people buyers' },
  { id: 'leads', label: 'Captured leads', short: 'Leads', route: '/admin/leads', icon: MessageSquare, group: 'Customers', key: 'l', words: 'newsletter whatsapp signup' },
  { id: 'reviews', label: 'Reviews', route: '/admin/reviews', icon: Star, group: 'Customers', key: 'v', words: 'rating stars' },

  { id: 'products', label: 'Products', route: '/admin/products', icon: Package, group: 'Catalogue', key: 'p', words: 'catalogue styles stock suits' },
  { id: 'add-product', label: 'Add product', route: '/admin/products/new', icon: PlusCircle, group: 'Catalogue', words: 'new product upload' },
  { id: 'categories', label: 'Categories', route: '/admin/categories', icon: Layers, group: 'Catalogue', key: 't', words: 'collections' },

  { id: 'coupons', label: 'Coupons', route: '/admin/coupons', icon: Tag, group: 'Offers', key: 'c', words: 'discount code offer' },
  { id: 'dealOfTheDay', label: 'Deal of the day', short: 'Deal', route: '/admin/deal-of-the-day', icon: Flame, group: 'Offers', words: 'dod offer' },
  { id: 'specialDod', label: 'Special DOD', route: '/admin/special-dod', icon: Sparkles, group: 'Offers', words: 'festive diwali navratri' },
  { id: 'comboOffers', label: 'Combo offer', short: 'Combo', route: '/admin/combo-offers', icon: Gift, group: 'Offers', words: 'bundle' },

  { id: 'homepage', label: 'Homepage', route: '/admin/homepage', icon: LayoutTemplate, group: 'Storefront', key: 'h', words: 'sections order' },
  { id: 'hero', label: 'Hero slides', short: 'Hero', route: '/admin/hero', icon: Sparkles, group: 'Storefront', words: 'banner slider' },
  { id: 'banners', label: 'Banners', route: '/admin/banners', icon: ImageIcon, group: 'Storefront', words: 'announcement' },
  { id: 'reels', label: 'Aura reels', short: 'Reels', route: '/admin/reels', icon: Film, group: 'Storefront', words: 'video' },
  { id: 'instagram', label: 'Instagram reels', short: 'Instagram', route: '/admin/instagram', icon: Instagram, group: 'Storefront', words: 'video insta' },
  { id: 'looks', label: 'Complete the look', short: 'Looks', route: '/admin/looks', icon: Shirt, group: 'Storefront', words: 'accessories outfit' },
  { id: 'discovery', label: 'Discovery features', short: 'Discovery', route: '/admin/discovery', icon: Compass, group: 'Storefront', words: 'quiz search' },

  { id: 'payments', label: 'Payment gateways', short: 'Payments', route: '/admin/payments', icon: CreditCard, group: 'System', words: 'razorpay payu upi cod' },
  { id: 'usage', label: 'Usage & limits', short: 'Usage', route: '/admin/usage', icon: Gauge, group: 'System', words: 'storage r2 limits' },
  { id: 'settings', label: 'Settings', route: '/admin/settings', icon: Settings, group: 'System', key: 's', words: 'store shipping cash on delivery password' },
];

export const navSpec = (id: string) => NAV_SPECS.find((n) => n.id === id);

/** Which menu entry an address belongs to (an order's page belongs to Orders, a product's form to Products). */
export const navIdForPath = (path: string, activeTab: string): NavId => {
  if (path === '/admin/products/new') return 'add-product';
  if (path.startsWith('/admin/products')) return 'products';
  if (path.startsWith('/admin/orders')) return 'orders';
  return (navSpec(activeTab)?.id || 'dashboard') as NavId;
};

export interface Crumb { label: string; path?: string }

/** Admin › Group › Page › the order or product open on it. `detail` names that last step (an order number, a product name). */
export const crumbsFor = (path: string, activeTab: string, detail?: string): Crumb[] => {
  const id = navIdForPath(path, activeTab);
  const spec = navSpec(id) || NAV_SPECS[0];
  // "Orders › Orders" says nothing: the group is left out when the page carries the same name
  const list: Crumb[] = spec.group === spec.label ? [] : [{ label: spec.group }];
  const isDetail = (path.startsWith('/admin/orders/') && path !== '/admin/orders')
    || (path.startsWith('/admin/products/') && path.endsWith('/edit'));
  if (isDetail) {
    list.push({ label: spec.label, path: spec.route });
    list.push({ label: detail || (id === 'orders' ? 'Order' : 'Edit product') });
  } else {
    list.push({ label: spec.label });
  }
  return list;
};

// ---------------------------------------------------------------- recent pages (this browser only)

const RECENT_KEY = 'sag_admin_recent';
export interface RecentPage { path: string; label: string; note: string; at: number }

const readRecent = (): RecentPage[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && typeof r.path === 'string' && typeof r.label === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
};

let recentCache: RecentPage[] | null = null;
const recentListeners = new Set<(list: RecentPage[]) => void>();

export const getRecentPages = () => (recentCache ??= readRecent());

/** Remembers a visited admin page at the top of the list (eight at most, no repeats). */
export const rememberPage = (page: Omit<RecentPage, 'at'>) => {
  const list = [{ ...page, at: Date.now() }, ...getRecentPages().filter((r) => r.path !== page.path)].slice(0, 8);
  recentCache = list;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* the list still works for this visit */ }
  recentListeners.forEach((l) => l(list));
};

export const useRecentPages = () => {
  const [list, setList] = useState<RecentPage[]>(getRecentPages);
  useEffect(() => {
    recentListeners.add(setList);
    return () => { recentListeners.delete(setList); };
  }, []);
  return list;
};

// ---------------------------------------------------------------- small remembered choices

/** A yes / no choice kept in this browser (the sidebar folded, for example). */
export const useStoredFlag = (key: string, initial = false): [boolean, (next: boolean) => void] => {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback((next: boolean) => {
    setValue(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* fine for this visit */ }
  }, [key]);
  return [value, set];
};

/** True while the person is typing in a field (single-key shortcuts must then do nothing). */
export const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName);
};

/** True while a dialog of the admin is open (the shortcuts then leave the keyboard to it). */
export const dialogOpen = () => Boolean(document.querySelector('#admin-root-container [aria-modal="true"]'));
