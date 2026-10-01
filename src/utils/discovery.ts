import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product } from '../types';
import { isAvailable, productOccasions } from './smartQuery';
import { departmentOf } from './kids';
import { fromCatalogOrLive } from '../lib/catalog';

/** Admin-managed settings for the discovery features (storefront_settings/discovery). */
export interface OccasionConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** Occasion keywords matched against each product's occasion/tags (e.g. "Wedding"). Empty = none. */
  match?: string;
  maxPrice?: number | null;
  /** Only styles made in at least one of these sizes (e.g. plus sizes). */
  sizes?: string[];
  /** Products the admin picked by hand; always included. */
  productIds: string[];
}

export interface DiscoveryFeatures {
  assistant: boolean;
  voiceSearch: boolean;
  compare: boolean;
  surpriseMe: boolean;
  findMySize: boolean;
  personalRails: boolean;
  occasions: boolean;
  giftMode: boolean;
  shareWishlist: boolean;
  priceDropAlerts: boolean;
  backInStockAlerts: boolean;
  googleOneTap: boolean;
  reels: boolean;
  completeLook: boolean;
  bundleBuilder: boolean;
  visualSearch: boolean;
  reviewPhotos: boolean;
  styleProfile: boolean;
}

export interface DiscoverySettings {
  features: DiscoveryFeatures;
  occasions: OccasionConfig[];
}

export const DEFAULT_FEATURES: DiscoveryFeatures = {
  assistant: true, voiceSearch: true, compare: true, surpriseMe: true, findMySize: true, personalRails: true,
  occasions: true, giftMode: true, shareWishlist: true, priceDropAlerts: true, backInStockAlerts: true, googleOneTap: true,
  reels: true, completeLook: true, bundleBuilder: true, visualSearch: false, reviewPhotos: true, styleProfile: true,
};

export const DEFAULT_OCCASIONS: OccasionConfig[] = [
  { id: 'wedding-guest', name: 'Wedding Guest', match: 'Wedding', enabled: true, productIds: [] },
  { id: 'mehndi', name: 'Mehndi', match: 'Mehndi', enabled: true, productIds: [] },
  { id: 'haldi', name: 'Haldi', match: 'Haldi', enabled: true, productIds: [] },
  { id: 'festive', name: 'Festive', match: 'Festive', enabled: true, productIds: [] },
  { id: 'party', name: 'Party Wear', match: 'Party', enabled: true, productIds: [] },
  { id: 'office', name: 'Office Wear', match: 'Office', enabled: true, productIds: [] },
  { id: 'daily', name: 'Daily Wear', match: 'Daily', enabled: true, productIds: [] },
  { id: 'eid', name: 'Eid', match: 'Festive', enabled: false, productIds: [] },
  { id: 'plus-size', name: 'Plus Size', sizes: ['XXL', '3XL', '4XL', '5XL'], enabled: true, productIds: [] },
  { id: 'under-699', name: 'Under ₹699', maxPrice: 699, enabled: true, productIds: [] },
  { id: 'under-999', name: 'Under ₹999', maxPrice: 999, enabled: true, productIds: [] },
];

export const DEFAULT_DISCOVERY: DiscoverySettings = { features: DEFAULT_FEATURES, occasions: DEFAULT_OCCASIONS };

export const normaliseDiscovery = (raw: any): DiscoverySettings => ({
  features: { ...DEFAULT_FEATURES, ...(raw?.features || {}) },
  occasions: Array.isArray(raw?.occasions) && raw.occasions.length ? raw.occasions : DEFAULT_OCCASIONS,
});

let cache: DiscoverySettings = DEFAULT_DISCOVERY;
let listeners = new Set<(s: DiscoverySettings) => void>();
let started = false;
const start = () => {
  if (started) return;
  started = true;
  fromCatalogOrLive(
    (catalog) => {
      cache = normaliseDiscovery(catalog.settings.discovery || {});
      listeners.forEach((fn) => fn(cache));
    },
    () => onSnapshot(doc(db, 'storefront_settings', 'discovery'), (snap) => {
      try { cache = normaliseDiscovery(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {}); } catch { cache = DEFAULT_DISCOVERY; }
      listeners.forEach((fn) => fn(cache));
    }, () => {}),
  );
};

/** Live discovery settings (one shared listener for the whole app). */
export const useDiscovery = () => {
  const [value, setValue] = useState(cache);
  useEffect(() => {
    start();
    listeners.add(setValue);
    setValue(cache);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
};

/** Real products for an occasion: hand-picked ones first, then those matching its rule. */
export const occasionProducts = (occasion: OccasionConfig, products: Product[]) => {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const picked = occasion.productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p && !p.hidden));
  const hasRule = Boolean(occasion.match || occasion.maxPrice || occasion.sizes?.length);
  const ruled = hasRule ? products.filter((p) => {
    if (p.hidden || picked.includes(p) || departmentOf(p) !== 'women') return false;
    if (occasion.match && !productOccasions(p).includes(occasion.match)) return false;
    if (occasion.maxPrice && p.price > occasion.maxPrice) return false;
    if (occasion.sizes?.length && !occasion.sizes.some((s) => (p.sizes || []).map(String).includes(s))) return false;
    return true;
  }) : [];
  return [...picked, ...ruled];
};

export const liveOccasions = (settings: DiscoverySettings, products: Product[]) =>
  settings.features.occasions
    ? settings.occasions.filter((o) => o.enabled).map((o) => ({ occasion: o, items: occasionProducts(o, products) })).filter((x) => x.items.some(isAvailable))
    : [];
