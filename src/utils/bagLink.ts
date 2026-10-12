// Carrying the bag from an in-app browser (Instagram, Facebook) to the phone's own browser. The bag is saved in
// the browser it was filled in, so a checkout link opened in Chrome or Safari would otherwise find it empty.
// The link carries only what the bag holds (style, size, colour, quantity); prices always come from the store.
import type { CartItem } from '../types';

export type BagLinkLine = { productId: string; size: string; color: string; quantity: number; parentId: string };

const PARAM = 'bag';
const MAX_LINES = 20;

/** The checkout address with the bag in it. */
export const bagLinkUrl = (cart: CartItem[], origin: string = window.location.origin): string => {
  const lines = cart.slice(0, MAX_LINES).map((item) => [String(item.product.id), String(item.selectedSize || ''), item.selectedColor?.name || '', item.quantity, item.lookParentId || '']);
  return `${origin}/checkout?${PARAM}=${encodeURIComponent(JSON.stringify(lines))}`;
};

/** The bag carried by the page's address, or null when there is none. */
export const readBagLink = (search: string = window.location.search): BagLinkLine[] | null => {
  try {
    const raw = new URLSearchParams(search).get(PARAM);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const lines = parsed.slice(0, MAX_LINES)
      .filter((line) => Array.isArray(line) && line[0])
      .map((line) => ({ productId: String(line[0]).slice(0, 80), size: String(line[1] || '').slice(0, 40), color: String(line[2] || '').slice(0, 60), quantity: Math.max(1, Math.min(10, Math.round(Number(line[3]) || 1))), parentId: String(line[4] || '').slice(0, 80) }));
    return lines.length ? lines : null;
  } catch {
    return null;
  }
};

/** Takes the bag out of the address bar once it has been read, so a reload or a shared link does not carry it. */
export const clearBagLink = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash);
  } catch { /* the address stays as it is */ }
};

/** A link that leaves the in-app browser: Chrome on Android, Safari on iPhone. */
export const outOfAppUrl = (httpsUrl: string): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) {
    return `intent://${httpsUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return `x-safari-${httpsUrl}`;
  return httpsUrl;
};
