import { getStoredUtmParams } from './utmTracker';

export interface VisitorLog {
  id: string;
  firstSeen: string;
  lastActive: string;
  deviceType: string;
  deviceModel?: string;
  userAgent?: string;
  page: string;
  utm_source?: string;
  actions?: { time: string; type: string; path: string; label: string }[];
}

export interface VisitorAnalytics {
  totalUniqueVisitors: number;
  todayUniqueVisitors: number;
  liveActiveCount: number;
  cartAddCount: number;
  checkoutCount: number;
  visitorLogs: VisitorLog[];
  /** Every visit ever (repeat visits count again); never reset. */
  lifetimeVisits?: number;
  /** Devices seen for the first time ever. */
  lifetimeUniqueVisitors?: number;
  todayVisits?: number;
  returningToday?: number;
  /** When per-visit counting started (earlier days counted one visit per visitor per day). */
  countingSince?: string;
}

const STORAGE_KEY_VISITOR_ID = 'sag_unique_visitor_id';
const STORAGE_KEY_TRACKED_DATE = 'sag_tracked_date_v1';
const STORAGE_KEY_CART_DATE = 'sag_cart_date_v1';
const STORAGE_KEY_CHECKOUT_DATE = 'sag_checkout_date_v1';
const STORAGE_KEY_QUOTA_EXCEEDED = 'sag_fs_quota_exceeded';

export function isLocalPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0') || host.includes('webcontainer') || host.includes('run.app');
}

// In-memory + sessionStorage Firestore Quota Circuit Breaker
let isFirestoreQuotaExhausted = false;
try {
  if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY_QUOTA_EXCEEDED) === 'true') {
    isFirestoreQuotaExhausted = true;
  }
  if (isLocalPreviewEnvironment()) {
    isFirestoreQuotaExhausted = true;
    sessionStorage.setItem(STORAGE_KEY_QUOTA_EXCEEDED, 'true');
  }
} catch {
  if (isLocalPreviewEnvironment()) {
    isFirestoreQuotaExhausted = true;
  }
}

export function markFirestoreQuotaExhausted() {
  isFirestoreQuotaExhausted = true;
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_QUOTA_EXCEEDED, 'true');
    }
  } catch {
    // Ignore storage write errors
  }
}

export function isQuotaExhausted(): boolean {
  return isFirestoreQuotaExhausted;
}

export function getOrCreateVisitorId(): string {
  try {
    let vid = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
    if (!vid) {
      vid = 'vis_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY_VISITOR_ID, vid);
    }
    return vid;
  } catch {
    return 'vis_temp_' + Math.random().toString(36).substring(2, 7);
  }
}

// Detect Detailed Device Brand, Model & Browser from User Agent
export interface ParsedDevice {
  deviceType: string;
  deviceModel: string;
  browser: string;
  userAgent: string;
}

export function getBrowserName(ua: string): string {
  if (!ua) return 'Web Browser';
  if (/Instagram/i.test(ua)) return 'Instagram In-App Browser';
  if (/FB_IAB|FBAV|FBAN/i.test(ua)) return 'Facebook In-App Browser';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Edg/i.test(ua)) return 'Microsoft Edge';
  if (/OPR|Opera/i.test(ua)) return 'Opera Browser';
  if (/Firefox|FxiOS/i.test(ua)) return 'Mozilla Firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'Google Chrome';
  if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) return 'Apple Safari';
  if (/wv|WebView/i.test(ua)) return 'Android WebView';
  return 'Mobile Browser';
}

export function calculateStayDuration(firstSeen?: string, lastActive?: string): string {
  if (!firstSeen) return 'Just landed';
  const start = new Date(firstSeen).getTime();
  const end = lastActive ? new Date(lastActive).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return 'Active now';
  
  const diffSec = Math.max(1, Math.floor((end - start) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function getDeviceDetails(): ParsedDevice {
  if (typeof navigator === 'undefined') {
    return {
      deviceType: 'desktop',
      deviceModel: 'Server Environment',
      browser: 'Server',
      userAgent: 'unknown'
    };
  }

  const ua = navigator.userAgent || '';
  const browser = getBrowserName(ua);

  let deviceType = 'desktop';
  if (/Instagram|FBAV|FBAN|FB_IAB/i.test(ua)) {
    deviceType = 'instagram_webview';
  } else if (/ipad|tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobi|Android|iPhone/i.test(ua)) {
    deviceType = 'mobile';
  }

  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let deviceModel = 'Unknown Device';

  if (os === 'iOS') {
    if (/iPhone/i.test(ua)) {
      deviceModel = 'Apple iPhone';
    } else if (/iPad/i.test(ua)) {
      deviceModel = 'Apple iPad';
    }
  } else if (os === 'Android') {
    const match = ua.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      const parts = match[1].split(';');
      const androidPartIdx = parts.findIndex(p => p.includes('Android'));
      
      let rawModel = '';
      if (androidPartIdx !== -1 && parts[androidPartIdx + 1]) {
        rawModel = parts[androidPartIdx + 1].trim();
        if (rawModel === 'wv' && parts[androidPartIdx + 2]) {
          rawModel = parts[androidPartIdx + 2].trim();
        }
      } else {
        rawModel = parts.reduce((longest, current) => {
          const clean = current.trim();
          if (clean.includes('Build/') || clean.includes('Android') || clean.includes('Linux') || clean.includes('wv')) {
            return longest;
          }
          return clean.length > longest.length ? clean : longest;
        }, '').trim();
      }

      if (rawModel) {
        deviceModel = cleanAndroidModel(rawModel);
      } else {
        deviceModel = 'Android Phone';
      }
    } else {
      deviceModel = 'Android Phone';
    }
  } else if (os === 'macOS') {
    deviceModel = 'Apple Mac';
  } else if (os === 'Windows') {
    deviceModel = 'Windows PC';
  }

  return {
    deviceType,
    deviceModel,
    browser,
    userAgent: ua
  };
}

function cleanAndroidModel(raw: string): string {
  raw = raw.trim();
  if (raw.includes('Build/')) {
    raw = raw.split('Build/')[0].trim();
  }
  
  const lower = raw.toLowerCase();

  // Samsung mappings
  if (lower.includes('sm-g991') || lower.includes('sm-g990') || lower.includes('galaxy s21')) return 'Samsung Galaxy S21';
  if (lower.includes('sm-g998') || lower.includes('galaxy s21 ultra')) return 'Samsung Galaxy S21 Ultra';
  if (lower.includes('sm-s901') || lower.includes('galaxy s22')) return 'Samsung Galaxy S22';
  if (lower.includes('sm-s906') || lower.includes('galaxy s22+')) return 'Samsung Galaxy S22+';
  if (lower.includes('sm-s908') || lower.includes('galaxy s22 ultra')) return 'Samsung Galaxy S22 Ultra';
  if (lower.includes('sm-s911') || lower.includes('galaxy s23')) return 'Samsung Galaxy S23';
  if (lower.includes('sm-s916') || lower.includes('galaxy s23+')) return 'Samsung Galaxy S23+';
  if (lower.includes('sm-s918') || lower.includes('galaxy s23 ultra')) return 'Samsung Galaxy S23 Ultra';
  if (lower.includes('sm-s921') || lower.includes('galaxy s24')) return 'Samsung Galaxy S24';
  if (lower.includes('sm-s926') || lower.includes('galaxy s24+')) return 'Samsung Galaxy S24+';
  if (lower.includes('sm-s928') || lower.includes('galaxy s24 ultra')) return 'Samsung Galaxy S24 Ultra';
  if (lower.includes('sm-e')) {
    const match = raw.match(/SM-E[0-9]+/i);
    return match ? `Samsung Galaxy E${match[0].substring(4)}` : 'Samsung Galaxy E Series';
  }
  if (lower.includes('sm-f')) {
    const match = raw.match(/SM-F[0-9]+/i);
    return match ? `Samsung Galaxy Fold/Flip (${match[0]})` : 'Samsung Galaxy Foldable';
  }
  if (lower.includes('sm-a')) {
    const match = raw.match(/SM-A[0-9]+/i);
    return match ? `Samsung Galaxy A${match[0].substring(4)}` : 'Samsung Galaxy A Series';
  }
  if (lower.includes('sm-m')) {
    const match = raw.match(/SM-M[0-9]+/i);
    return match ? `Samsung Galaxy M${match[0].substring(4)}` : 'Samsung Galaxy M Series';
  }

  // OnePlus
  if (lower.includes('oneplus') || lower.includes('op5') || lower.includes('hd1901') || lower.includes('kb2001') || lower.includes('ne2211')) {
    if (lower.includes('oneplus')) return raw;
    return `OnePlus (${raw})`;
  }

  // Xiaomi/Redmi
  if (lower.includes('redmi') || lower.includes('poco') || lower.includes('xiaomi') || lower.includes('m20') || lower.includes('m21') || lower.includes('mi ')) {
    if (lower.includes('redmi') || lower.includes('poco') || lower.includes('xiaomi')) return raw;
    return `Redmi/Xiaomi (${raw})`;
  }

  // Oppo / Realme
  if (lower.includes('cph') || lower.includes('oppo')) {
    if (lower.includes('oppo')) return raw;
    return `Oppo (${raw})`;
  }
  if (lower.includes('rmx') || lower.includes('realme')) {
    if (lower.includes('realme')) return raw;
    return `Realme (${raw})`;
  }

  // Vivo
  if (lower.includes('v20') || lower.includes('v21') || lower.includes('v22') || lower.includes('vivo') || lower.includes('i20')) {
    if (lower.includes('vivo')) return raw;
    return `Vivo (${raw})`;
  }

  // Google Pixel
  if (lower.includes('pixel')) {
    return raw;
  }

  // Motorola / Moto
  if (lower.includes('moto') || lower.includes('motorola') || lower.includes('xt2')) {
    if (lower.includes('moto')) return raw;
    return `Motorola (${raw})`;
  }

  // Capitalize if it's raw
  if (raw.length > 25) {
    return raw.substring(0, 25) + '...';
  }
  return raw || 'Android Phone';
}

// Counting happens on the server (api/track.js), which also stops repeat and scripted counts.
const sendEvent = (event: 'visit' | 'add_to_cart' | 'checkout_initiated', extra: Record<string, string> = {}) => {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, visitorId: getOrCreateVisitorId(), path: window.location.pathname || '/', ...extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the store
  }
};

const STORAGE_KEY_LAST_ACTIVITY = 'sag_last_activity_v1';
const SESSION_GAP_MS = 30 * 60 * 1000;

/** Marks the shopper as still active (keeps one long browse from counting as several visits). */
export function touchActivity() {
  try { localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(Date.now())); } catch {}
}

// Records a visit when a new session starts: the first visit of the day, or coming back after 30 minutes away.
// The server applies the same rules again, so repeated calls can't inflate the numbers.
export function recordHeartbeat(currentPath: string = '/'): VisitorAnalytics {
  const fallbackAnalytics: VisitorAnalytics = {
    totalUniqueVisitors: 1,
    todayUniqueVisitors: 1,
    liveActiveCount: 1,
    cartAddCount: 0,
    checkoutCount: 0,
    visitorLogs: []
  };

  if (typeof window === 'undefined' || isFirestoreQuotaExhausted) {
    return fallbackAnalytics;
  }

  const today = new Date().toISOString().split('T')[0];
  try {
    const now = Date.now();
    const lastActivity = Number(localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY)) || 0;
    localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(now));
    if (localStorage.getItem(STORAGE_KEY_TRACKED_DATE) === today && now - lastActivity < SESSION_GAP_MS) return fallbackAnalytics;
    localStorage.setItem(STORAGE_KEY_TRACKED_DATE, today);
  } catch {
    return fallbackAnalytics;
  }

  const utm = getStoredUtmParams();
  const details = getDeviceDetails();
  sendEvent('visit', {
    path: currentPath,
    deviceModel: details.deviceModel,
    browser: details.browser,
    utm_source: utm.utm_source || '',
    utm_medium: utm.utm_medium || '',
    utm_campaign: utm.utm_campaign || '',
    fbclid: utm.fbclid || '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  });

  return fallbackAnalytics;
}

// Tracks cart additions & checkout initiations, once per device per day each
export function trackFunnelEvent(event: 'add_to_cart' | 'checkout_initiated', _label: string = '') {
  if (typeof window === 'undefined' || isFirestoreQuotaExhausted) return;
  const today = new Date().toISOString().split('T')[0];
  const key = event === 'add_to_cart' ? STORAGE_KEY_CART_DATE : STORAGE_KEY_CHECKOUT_DATE;
  try {
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
  } catch {
    return;
  }
  sendEvent(event);
}

// Product views, wishlist saves and searches (counted on the server once per visitor per item per day)
export function trackItem(event: 'product_view' | 'wishlist_add' | 'search' | 'reel_view' | 'reel_click' | 'feature_use', value: string) {
  if (typeof window === 'undefined' || !value) return;
  const key = `sag_ti_${event}_${value.toLowerCase().slice(0, 60)}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {}
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event === 'search' ? { event, term: value } : event === 'reel_view' || event === 'reel_click' ? { event, reelId: value } : event === 'feature_use' ? { event, feature: value } : { event, productId: value }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
