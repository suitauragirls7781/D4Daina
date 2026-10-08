import { useEffect, useState } from 'react';
import { getOrCreateVisitorId, isQuotaExhausted } from './visitorTracker';
import { getStoredUtmParams } from './utmTracker';
import { isAdminEntryPath, toAppPath } from './adminEntry';

/**
 * Live presence for the owner's dashboard: tells the server which page this visitor is on now (api/track.js,
 * event "presence"). Every signal is one Worker request and one row write on a small free plan, so the rules
 * are strict:
 *  - a "view" when the page (path or label) changes, at most one every 8 seconds (the latest page wins);
 *  - a heartbeat every 120 seconds while the tab is visible (the server calls a visitor active for 210 seconds);
 *  - 30 signals per browser session, then nothing more;
 *  - never from the admin panel, never with Do Not Track, never for automated browsers, never on a preview host.
 * Fire-and-forget: nothing here can block or break the page.
 */

const VIEW_GAP_MS = 8_000;
const SETTLE_MS = 600;
const BEAT_MS = 120_000;
const MAX_SIGNALS = 30;
const COUNT_KEY = 'sag_presence_n';
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

let memoryCount = 0;
let lastSentAt = 0;
let current: { path: string; label: string } | null = null;
let sentKey = '';
let viewTimer: number | undefined;

const sentSoFar = (): number => {
  try {
    return Math.max(memoryCount, Number(sessionStorage.getItem(COUNT_KEY)) || 0);
  } catch {
    return memoryCount;
  }
};

const countOne = () => {
  memoryCount = sentSoFar() + 1;
  try { sessionStorage.setItem(COUNT_KEY, String(memoryCount)); } catch { /* the in-memory count still holds */ }
};

const allowed = (): boolean => {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { msDoNotTrack?: string; globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1' || nav.globalPrivacyControl === true) return false;
    if (nav.webdriver || !nav.userAgent || BOT.test(nav.userAgent)) return false;
    // The same switch the visit counting uses (off on localhost and preview hosts)
    if (isQuotaExhausted()) return false;
    const path = toAppPath(window.location.pathname || '/');
    if (path.startsWith('/admin') || isAdminEntryPath(window.location.pathname || '/')) return false;
    return sentSoFar() < MAX_SIGNALS;
  } catch {
    return false;
  }
};

/** Where the visitor came from, sent with the first signal of the session only. */
const sourceOfVisit = (): string => {
  try {
    const utm = getStoredUtmParams();
    if (utm.utm_source) return utm.utm_source.slice(0, 40);
    if (utm.fbclid) return 'meta_ads';
    if (utm.gclid) return 'google_ads';
    if (utm.is_instagram_webview) return 'instagram';
    const referrer = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    if (referrer && referrer !== window.location.hostname.replace(/^www\./, '')) return referrer.slice(0, 40);
  } catch { /* direct */ }
  return 'direct';
};

const send = (kind: 'view' | 'beat') => {
  try {
    if (!current || !allowed()) return;
    const first = sentSoFar() === 0;
    const body = JSON.stringify({
      event: 'presence',
      kind,
      visitorId: getOrCreateVisitorId(),
      path: current.path,
      label: current.label,
      ...(first ? { source: sourceOfVisit() } : {}),
    });
    countOne();
    lastSentAt = Date.now();
    if (kind === 'view') sentKey = `${current.path}|${current.label}`;
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    // Presence must never break the store
  }
};

/** The page the visitor is on now. Sent once it has settled, and never more often than every 8 seconds. */
export const reportView = (path: string, label: string) => {
  try {
    if (typeof window === 'undefined') return;
    current = { path: (path || '/').slice(0, 160), label: label.replace(/\s+/g, ' ').trim().slice(0, 80) };
    window.clearTimeout(viewTimer);
    if (`${current.path}|${current.label}` === sentKey) return;
    const wait = Math.max(SETTLE_MS, lastSentAt + VIEW_GAP_MS - Date.now());
    viewTimer = window.setTimeout(() => send('view'), wait);
  } catch {
    // ignored
  }
};

/** Stops following (the admin panel was opened): nothing more is sent until the next view. */
export const pausePresence = () => {
  try { window.clearTimeout(viewTimer); } catch { /* ignored */ }
  current = null;
};

const beat = () => {
  try {
    if (!current || !sentKey || document.visibilityState !== 'visible') return;
    if (Date.now() - lastSentAt < BEAT_MS - 2_000) return;
    send('beat');
  } catch {
    // ignored
  }
};

const ROUTE_LABELS: Record<string, string> = {
  home: 'Home',
  shop: 'Shop',
  'product-detail': 'Product',
  cart: 'Bag',
  checkout: 'Checkout',
  'order-confirmation': 'Order placed',
  wishlist: 'Wishlist',
  account: 'My account',
  login: 'Sign in',
  about: 'About us',
  contact: 'Contact us',
  'track-order': 'Track order',
  'shipping-policy': 'Shipping policy',
  'return-policy': 'Returns policy',
  'privacy-policy': 'Privacy policy',
  'terms-policy': 'Terms',
  'terms-conditions': 'Terms',
  'cancellation-policy': 'Cancellation policy',
  'size-guide': 'Size guide',
  'not-found': 'Page not found',
};

export interface PresenceView {
  /** The route name from RouterContext / ShopContext ('home', 'shop', 'product-detail' ...). */
  route: string;
  category?: string;
  productName?: string;
  search?: string;
  checkoutStep?: 'address' | 'payment';
}

/** A short label for the owner: "Home", "Shop: Suits", "Product: <name>", "Checkout: payment", "Search: <term>". */
export const presenceLabel = ({ route, category, productName, search, checkoutStep }: PresenceView): string => {
  const base = ROUTE_LABELS[route] || 'Store';
  if (route === 'shop') {
    if (search && search.trim()) return `Search: ${search.trim()}`;
    return category && category !== 'All' ? `Shop: ${category}` : base;
  }
  if (route === 'product-detail') return productName ? `Product: ${productName}` : base;
  if (route === 'checkout') return `Checkout: ${checkoutStep || 'address'}`;
  return base;
};

/**
 * The checkout keeps its step to itself, so the step is read from the page: the payment step is the one that
 * shows the "How would you like to pay?" title (id co-pay-title in CheckoutPage).
 */
const useCheckoutStep = (onCheckout: boolean): 'address' | 'payment' => {
  const [step, setStep] = useState<'address' | 'payment'>('address');
  useEffect(() => {
    if (!onCheckout) { setStep('address'); return; }
    const read = () => setStep(document.getElementById('co-pay-title') ? 'payment' : 'address');
    read();
    const timer = window.setInterval(read, 1500);
    return () => window.clearInterval(timer);
  }, [onCheckout]);
  return step;
};

/** Mounted once (src/App.tsx). `enabled` is false on admin routes and while the store is still loading. */
export const usePresence = (enabled: boolean, path: string, view: Omit<PresenceView, 'checkoutStep'>) => {
  const checkoutStep = useCheckoutStep(enabled && view.route === 'checkout');
  const label = presenceLabel({ ...view, checkoutStep });

  useEffect(() => {
    if (enabled) reportView(path, label);
    else pausePresence();
  }, [enabled, path, label]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [enabled]);
};
