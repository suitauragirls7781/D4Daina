/**
 * The shoppers' shared catalogue: products, categories, approved reviews, active coupons and the public store
 * settings in ONE request (/api/admin-config?action=catalog). Cloudflare's cache keeps each copy for a few minutes and
 * hands the same answer to every visitor, so the database is read a few times an hour instead of on every visit.
 *
 * The admin panel, an admin browsing the store and local development keep reading Firestore live (changes show
 * instantly there). Shoppers see admin changes within about 5 minutes. If the catalogue can't be fetched, every
 * caller falls back to its live Firestore listener, exactly as before.
 */
import { isAdminAreaPath } from '../utils/adminEntry';

export interface PublicCatalog {
  settings: Record<string, any>;
  products: any[];
  categories: any[];
  reviews: any[];
  coupons: any[];
  generatedAt: string;
}

const LIVE_FLAG = 'sag_admin_live';
const BUCKET_MS = 5 * 60 * 1000;

/** True where data must be live: admin pages, a browser where the admin signed in, and localhost. */
export const readsLive = (): boolean => {
  if (typeof window === 'undefined') return true;
  if (isAdminAreaPath(window.location.pathname)) return true;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return true;
  try {
    return localStorage.getItem(LIVE_FLAG) === '1';
  } catch {
    return false;
  }
};

/** Remembered on this browser when the admin signs in (and forgotten on sign-out), so the admin sees changes live. */
export const setAdminLive = (on: boolean) => {
  try {
    if (on) localStorage.setItem(LIVE_FLAG, '1');
    else localStorage.removeItem(LIVE_FLAG);
  } catch {}
};

let pending: Promise<PublicCatalog | null> | null = null;

// The last good catalogue is kept on this device, so a slow or unavailable server never leaves shoppers
// on the loading screen (prices are always re-checked by the server at checkout).
const SAVED_KEY = 'sag_catalog_saved_v1';
const SAVED_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const valid = (catalog: any): catalog is PublicCatalog => Boolean(catalog && Array.isArray(catalog.products) && catalog.settings);
const readSaved = (): PublicCatalog | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (!valid(saved) || Date.now() - new Date(saved.generatedAt).getTime() > SAVED_MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
};
const save = (catalog: PublicCatalog) => {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(catalog)); } catch {}
};

/** One catalogue request per page load; the 5-minute bucket in the URL is what the CDN caches. */
export const loadCatalog = (): Promise<PublicCatalog | null> => {
  if (!pending) {
    const bucket = Math.floor(Date.now() / BUCKET_MS);
    const controller = new AbortController();
    // A saved copy is used if the server takes longer than 4 seconds; otherwise wait up to 10 seconds
    const saved = readSaved();
    const timer = window.setTimeout(() => controller.abort(), saved ? 4000 : 10000);
    // index.html asks for the catalogue before this code has arrived: that answer is used when it is there
    const early: Promise<unknown> | undefined = (window as any).__sagCatalog;
    const asked: Promise<unknown> = early
      ? Promise.race([early, new Promise((resolve) => window.setTimeout(() => resolve(null), saved ? 4000 : 10000))])
      : fetch(`/api/admin-config?action=catalog&v=${bucket}`, { signal: controller.signal }).then((response) => (response.ok ? response.json() : null));
    pending = asked
      .then((catalog) => {
        if (!valid(catalog)) return saved;
        save(catalog);
        return catalog;
      })
      .catch(() => saved)
      .finally(() => window.clearTimeout(timer));
  }
  return pending;
};

/**
 * Shoppers: calls onData with the catalogue (or starts the live listener when it isn't available).
 * Live readers: starts the live listener straight away. Returns a cleanup function.
 */
export const fromCatalogOrLive = (onData: (catalog: PublicCatalog) => void, startLive: () => (() => void) | void): (() => void) => {
  let stopLive: (() => void) | void;
  let cancelled = false;
  if (readsLive()) {
    stopLive = startLive();
  } else {
    loadCatalog().then((catalog) => {
      if (cancelled) return;
      if (catalog) onData(catalog);
      else stopLive = startLive();
    });
  }
  return () => {
    cancelled = true;
    if (typeof stopLive === 'function') stopLive();
  };
};
