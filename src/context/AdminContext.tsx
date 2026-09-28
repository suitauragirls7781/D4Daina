import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  ADMIN_UID,
  newDocId,
  patchDoc,
  removeDoc,
  saveDoc,
  signInAdminToFirebase,
  signOutAdminFromFirebase,
  watchCollection,
} from '../lib/dataStore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { 
  Product, 
  CategoryItem, 
  Order, 
  Customer, 
  Coupon, 
  HomepageSectionConfig, 
  HeroBannerConfig, 
  Banner, 
  Review, 
  StoreSettings, 
  PaymentGatewaySettings,
  AdminTab,
  AdminOrderStatus,
  DealOfTheDayConfig,
  InstagramReel,
  Lead
} from '../types';
import { useProducts } from './ProductContext';
import { CATEGORIES_DATA } from '../data/categories';

import { ELEGANT_PLACEHOLDER_SVG, getCleanImageUrl } from '../utils/imageHelper';

export interface AdminSecurityConfig {
  adminUsername: string;
  adminPassword: string;
  securityPin: string;
  secretPathSlug: string;
  allowDirectAdminRoute: boolean;
  requirePin: boolean;
  sessionVersion: number;
}

export const DEFAULT_SECURITY_CONFIG: AdminSecurityConfig = {
  adminUsername: '',
  adminPassword: '',
  securityPin: '',
  secretPathSlug: 'sag-vault',        // Secret administrative portal route e.g. /sag-vault
  allowDirectAdminRoute: false,      // When false, typing /admin returns 404 to protect route secrecy
  requirePin: true,                  // 2-Step PIN authentication
  sessionVersion: 2,                 // Incremented from 1: instantly invalidates old sessions
};

interface AdminContextType {
  isAdminLoggedIn: boolean;
  adminEmail: string | null;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  loginAdmin: (email: string, pass: string, pin?: string) => Promise<{ success: boolean; message?: string }>;
  logoutAdmin: () => void;
  securityConfig: AdminSecurityConfig;
  updateSecurityConfig: (updated: Partial<AdminSecurityConfig>) => Promise<void>;
  invalidateAllAdminSessions: () => Promise<void>;

  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, updated: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  duplicateProduct: (id: string) => Promise<Product | undefined>;
  toggleProductStatus: (id: string) => Promise<void>;

  // Categories
  categories: CategoryItem[];
  addCategory: (cat: Omit<CategoryItem, 'id'>) => void;
  updateCategory: (id: string, updated: Partial<CategoryItem>) => void;
  deleteCategory: (id: string) => void;

  // Orders
  orders: Order[];
  addOrder: (order: Order) => Promise<void>;
  updateOrderStatus: (orderNumber: string, status: AdminOrderStatus, trackingNumber?: string, notes?: string) => void;
  updateOrderPaymentStatus: (orderNumber: string, paymentStatus: 'Paid' | 'Pending Verification' | 'Unpaid') => void;
  deleteOrder: (orderNumber: string) => void;

  // Customers
  customers: Customer[];
  updateCustomerStatus: (id: string, status: 'active' | 'inactive') => void;

  // Leads
  leads: Lead[];
  updateLeadOfferStatus: (id: string, status: boolean) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;

  // Coupons
  coupons: Coupon[];
  addCoupon: (coupon: Omit<Coupon, 'id' | 'usageCount'>) => void;
  updateCoupon: (id: string, updated: Partial<Coupon>) => void;
  deleteCoupon: (id: string) => void;
  toggleCouponStatus: (id: string) => void;

  // Visitor Analytics
  visitorStats: {
    liveActiveCount: number;
    todayUniqueCount: number;
    totalUniqueCount: number;
    checkoutInitiatedCount: number;
    cartAddedCount: number;
  };

  // Homepage Config
  homepageSections: HomepageSectionConfig[];
  toggleHomepageSection: (id: string) => Promise<void>;
  moveHomepageSection: (id: string, direction: 'up' | 'down') => Promise<void>;
  reorderHomepageSections: (newSections: HomepageSectionConfig[]) => Promise<void>;
  resetHomepageSectionsToDefault: () => Promise<void>;
  heroConfig: HeroBannerConfig;
  updateHeroConfig: (updated: Partial<HeroBannerConfig>) => Promise<void>;
  syncHeroWithLiveProducts: () => Promise<void>;

  // Deal of the Day
  dealOfTheDay: DealOfTheDayConfig;
  updateDealOfTheDay: (updated: Partial<DealOfTheDayConfig>) => Promise<void>;

  // Instagram reels shown in the homepage "Follow the Aura" section
  instagramReels: InstagramReel[];
  updateInstagramReels: (reels: InstagramReel[]) => Promise<void>;

  // Banners
  banners: Banner[];
  addBanner: (banner: Omit<Banner, 'id'>) => void;
  updateBanner: (id: string, updated: Partial<Banner>) => void;
  deleteBanner: (id: string) => void;
  toggleBannerStatus: (id: string) => void;

  // Reviews
  reviewsList: Review[];
  reviews: Review[];
  addReview: (review: Omit<Review, 'id'> & { id?: string }) => Promise<void>;
  updateReviewStatus: (id: string, status: 'approved' | 'pending' | 'hidden') => void;
  updateReview: (id: string, updatedData: Partial<Review>) => Promise<void>;
  replyToReview: (id: string, reply: string) => void;
  deleteReview: (id: string) => void;

  // Settings
  storeSettings: StoreSettings;
  updateStoreSettings: (updated: Partial<StoreSettings>) => void;
  paymentSettings: PaymentGatewaySettings;
  updatePaymentSettings: (updated: Partial<PaymentGatewaySettings>) => void;

  // Reset to sample defaults
  resetStoreDataToDefaults: () => Promise<void>;

  // Global loading state for initial fetch from the database
  isLoading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// Initial States
export const generateHeroSlidesFromProducts = (productsList: Product[]): HeroBannerConfig['slides'] => {
  const pool = (productsList && productsList.length > 0) ? productsList : [];
  if (pool.length === 0) return [];
  const picked = pool.slice(0, 6);

  const badges = [
    '👑 ROYAL FESTIVE EDIT',
    '🌸 SUMMER GRACE ARTISAN',
    '✨ LUXURY REGAL ANARKALI',
    '🔥 BESTSELLER OF THE WEEK',
    '🌿 PURE SILK HANDBLOCK',
    '💎 EXCLUSIVE DESIGNER SUIT'
  ];

  return picked.map((prod, idx) => {
    let rawImg = (prod.images && prod.images.length > 0) 
      ? prod.images[0] 
      : ((prod as any).image || ELEGANT_PLACEHOLDER_SVG);
    rawImg = getCleanImageUrl(rawImg);
    const originalPrice = prod.originalPrice || Math.round(prod.price * 1.85);

    return {
      id: `slide-prod-${prod.id || idx + 1}`,
      productId: prod.id,
      title: prod.name,
      subtitle: prod.fabric || (prod.description ? prod.description.slice(0, 65) + '...' : 'Handcrafted luxury artisan ethnic ensemble'),
      badge: badges[idx % badges.length],
      image: rawImg,
      price: prod.price,
      originalPrice: originalPrice,
      linkText: 'BUY NOW',
      link: prod.id,
    };
  });
};

const INITIAL_CATEGORIES: CategoryItem[] = [];
const INITIAL_CUSTOMERS: Customer[] = [];
const INITIAL_ORDERS: Order[] = [];
const INITIAL_COUPONS: Coupon[] = [];
export const INITIAL_SECTIONS: HomepageSectionConfig[] = [
  { id: 'sec-brand-header', title: 'Announcement Marquee', key: 'brandHeader', enabled: true, order: 1 },
  { id: 'sec-categories', title: 'Shop By Silhouette', key: 'categoryGrid', enabled: true, order: 2 },
  { id: 'sec-hero', title: 'Hero Banner Showcase', key: 'hero', enabled: true, order: 3 },
  { id: 'sec-promises', title: 'Artisanal Promises', key: 'artisanalPromises', enabled: true, order: 4 },
  { id: 'sec-combo', title: 'Festive Combo Offers', key: 'comboOffers', enabled: true, order: 5 },
  { id: 'sec-deal', title: 'Deal of the Day', key: 'dealOfTheDay', enabled: true, order: 6 },
  { id: 'sec-new-arrivals', title: 'All Products & Categories', key: 'newArrivals', enabled: true, order: 7 },
  { id: 'sec-best-sellers', title: 'Best Sellers', key: 'bestSellers', enabled: true, order: 8 },
  { id: 'sec-trending', title: 'Trending Now', key: 'trending', enabled: true, order: 9 },
  { id: 'sec-festive', title: 'Festive Collection', key: 'festive', enabled: true, order: 10 },
  { id: 'sec-special-offer', title: 'Special Offer Banner', key: 'specialOffer', enabled: true, order: 11 },
  { id: 'sec-why-shop', title: 'Why Shop With Us', key: 'whyShop', enabled: true, order: 12 },
  { id: 'sec-reviews', title: 'Customer Reviews', key: 'reviews', enabled: true, order: 13 },
  { id: 'sec-instagram', title: 'Instagram Gallery', key: 'instagram', enabled: true, order: 14 },
  { id: 'sec-newsletter', title: 'Newsletter Signup', key: 'newsletter', enabled: true, order: 15 },
];

export const mergeHomepageSections = (parsed: any[]): HomepageSectionConfig[] => {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return INITIAL_SECTIONS;
  }

  const sanitized = parsed;
  const existingKeys = new Set(sanitized.map(p => p.key));
  const merged = [...sanitized];

  INITIAL_SECTIONS.forEach((defaultSec) => {
    if (!existingKeys.has(defaultSec.key)) {
      merged.push({
        ...defaultSec,
        order: merged.length + 1,
      });
    }
  });

  return merged.map((s, idx) => ({
    ...s,
    order: idx + 1,
    title: INITIAL_SECTIONS.find(d => d.key === s.key)?.title || s.title
  }));
};
const INITIAL_HERO_CONFIG: HeroBannerConfig = {
  slides: [],
};
const INITIAL_BANNERS: Banner[] = [];
const INITIAL_REVIEWS: Review[] = [];
const INITIAL_STORE_SETTINGS: StoreSettings = {
  storeName: 'Suit Aura Girls',
  tagline: 'Elegance That Feels Like You',
  logoText: 'Suit Aura Girls',
  storeEmail: 'suitauragirls@gmail.com',
  phone: '+91 87398 35310',
  whatsapp: '+91 87398 35310',
  address: 'Shop No. 23, Asansol Junction Railway Station, Station Road, Asansol, Paschim Bardhaman, West Bengal - 713301, India.',
  instagramUrl: 'https://www.instagram.com/suit_aura_girls/',
  facebookUrl: 'https://www.facebook.com/suitauragirls',
  twitterUrl: '',
  currency: 'INR',
  currencySymbol: '₹',
  shippingCharge: 0,
  freeShippingThreshold: 0,
};
const normalizeStoreBrand = (settings: StoreSettings): StoreSettings => ({
  ...settings,
  storeName: settings.storeName?.trim() || INITIAL_STORE_SETTINGS.storeName,
  logoText: settings.logoText?.trim() || INITIAL_STORE_SETTINGS.logoText,
});
const toPublicStoreSettings = (settings: Partial<StoreSettings>): StoreSettings => ({
  storeName: settings.storeName?.trim() || INITIAL_STORE_SETTINGS.storeName,
  tagline: settings.tagline?.trim() || INITIAL_STORE_SETTINGS.tagline,
  logoText: settings.logoText?.trim() || INITIAL_STORE_SETTINGS.logoText,
  storeEmail: settings.storeEmail?.trim() || INITIAL_STORE_SETTINGS.storeEmail,
  phone: settings.phone?.trim() || INITIAL_STORE_SETTINGS.phone,
  whatsapp: settings.whatsapp?.trim() || INITIAL_STORE_SETTINGS.whatsapp,
  address: settings.address?.trim() || INITIAL_STORE_SETTINGS.address,
  instagramUrl: settings.instagramUrl?.trim() || '',
  facebookUrl: settings.facebookUrl?.trim() || '',
  twitterUrl: settings.twitterUrl?.trim() || '',
  currency: 'INR',
  currencySymbol: '₹',
  shippingCharge: Math.max(0, Number(settings.shippingCharge) || 0),
  freeShippingThreshold: Math.max(0, Number(settings.freeShippingThreshold) || 0),
  announcementText: settings.announcementText?.trim().slice(0, 500),
  announcementActive: settings.announcementActive ?? true,
});
const INITIAL_PAYMENT_SETTINGS: PaymentGatewaySettings = {
  mode: 'test',
  prepaidOnly: true,
  allowCod: false,
  razorpayKeyIdPlaceholder: '',
  razorpayKeySecretPlaceholder: '••••••••••••••••••••••••••••',
  webhookSecretPlaceholder: '••••••••••••••••••••••••••••',
  enableUpi: true,
  enableCards: true,
  enableNetBanking: true,
};

const toPublicPaymentSettings = (settings: Partial<PaymentGatewaySettings>): PaymentGatewaySettings => ({
  mode: settings.mode === 'live' ? 'live' : 'test',
  prepaidOnly: true,
  allowCod: false,
  razorpayKeyIdPlaceholder: typeof settings.razorpayKeyIdPlaceholder === 'string'
    ? (settings.razorpayKeyIdPlaceholder.trim().includes('SuitAuraGirlsKey') ? '' : settings.razorpayKeyIdPlaceholder.trim().slice(0, 160))
    : '',
  razorpayKeySecretPlaceholder: '',
  webhookSecretPlaceholder: '',
  enableUpi: Boolean(settings.enableUpi),
  enableCards: Boolean(settings.enableCards),
  enableNetBanking: Boolean(settings.enableNetBanking),
});

const INITIAL_DEAL_OF_THE_DAY: DealOfTheDayConfig = {
  enabled: true,
  productId: 'ae986604-cb06-4bbf-99b6-59d58fea0263',
  customTitle: 'Full Combo Set – Kurti, Palazzo, Bag & Heels',
  customSubtitle: 'Complete coordinated look at a limited-time price.',
  badgeText: '🔥 24-HOUR SPECIAL DEAL',
  dealPrice: 850,
  endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  durationHours: 24,
  stockText: '30 Left In Stock',
};

// Schema mappers between frontend objects and Firestore documents
export const mapOrderFromDb = (o: any): Order => {
  const items = o.items ?? [];
  const subtotal = Number(o.subtotal) || 0;
  const discountAmount = Number(o.discountAmount) || 0;
  const shippingCharge = Number(o.shippingCharge) || 0;
  const paymentStatus = o.paymentStatus ?? 'Pending';

  return {
    orderNumber: String(o.orderNumber ?? o.id ?? ''),
    status: (o.status ?? (paymentStatus === 'Paid' ? 'Processing' : 'Pending')) as AdminOrderStatus,
    finalTotal: Number(o.finalTotal) || Math.max(0, subtotal - discountAmount + shippingCharge),
    customerEmail: String(o.customerEmail ?? ''),
    customerName: o.customerName ?? '',
    customerMobile: o.customerMobile || '',
    deliveryAddress: o.deliveryAddress || {
      fullName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    },
    items: Array.isArray(items) ? items : [],
    subtotal,
    shippingCharge,
    couponCode: o.couponCode || '',
    discountAmount,
    paymentStatus,
    paymentMethod: o.paymentMethod ?? 'razorpay',
    paymentRef: o.paymentRef || '',
    date: o.date ?? new Date().toISOString(),
    estimatedDeliveryDate: o.estimatedDeliveryDate || '',
    trackingNumber: o.trackingNumber || '',
    notes: o.notes || '',
  };
};

/** Firestore order document; the document id is the order number. */
export const mapOrderToDb = (o: any) => ({
  orderNumber: String(o.orderNumber),
  status: o.status,
  customerEmail: String(o.customerEmail || '').trim().toLowerCase(),
  customerName: o.customerName || '',
  customerMobile: o.customerMobile || '',
  deliveryAddress: o.deliveryAddress || null,
  items: Array.isArray(o.items) ? o.items : [],
  subtotal: Number(o.subtotal) || 0,
  shippingCharge: Number(o.shippingCharge) || 0,
  couponCode: o.couponCode || '',
  discountAmount: Number(o.discountAmount) || 0,
  finalTotal: Number(o.finalTotal) || 0,
  paymentMethod: o.paymentMethod || 'razorpay',
  paymentStatus: o.paymentStatus || 'Pending',
  paymentRef: o.paymentRef || '',
  date: o.date || new Date().toISOString(),
  estimatedDeliveryDate: o.estimatedDeliveryDate || '',
  trackingNumber: o.trackingNumber || '',
  courierPartner: o.courierPartner || '',
  notes: o.notes || '',
});

export const mapCouponFromDb = (c: any): Coupon => ({
  id: String(c.id),
  code: c.code || '',
  discountType: c.discountType === 'fixed' ? 'fixed' : 'percentage',
  discountValue: Number(c.discountValue) || 0,
  minOrderValue: Number(c.minOrderValue) || 0,
  maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : undefined,
  startDate: c.startDate ?? '',
  expiryDate: c.expiryDate ?? '',
  usageLimit: Number(c.usageLimit) || 100,
  usageCount: Number(c.usageCount) || 0,
  isActive: c.isActive ?? true,
});

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    duplicateProduct,
    toggleProductStatus,
    resetToDefaultProducts,
  } = useProducts();

  const [securityConfig, setSecurityConfig] = useState<AdminSecurityConfig>(() => {
    try {
      const saved = localStorage.getItem('sag_admin_security_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        const config = {
          ...DEFAULT_SECURITY_CONFIG,
          ...parsed,
          sessionVersion: Math.max(parsed.sessionVersion || 0, DEFAULT_SECURITY_CONFIG.sessionVersion),
        };
        const isProductionHost = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (isProductionHost) {
          config.adminPassword = '';
          config.securityPin = '';
          localStorage.setItem('sag_admin_security_v2', JSON.stringify(config));
        }
        return config;
      }
    } catch {}
    return DEFAULT_SECURITY_CONFIG;
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        localStorage.removeItem('sag_admin_auth');
        localStorage.removeItem('sag_admin_session_version');
        return false;
      }
      const isAuth = localStorage.getItem('sag_admin_auth') === 'true';
      const storedVer = Number(localStorage.getItem('sag_admin_session_version') || 0);
      let currentVer = DEFAULT_SECURITY_CONFIG.sessionVersion;
      try {
        const saved = localStorage.getItem('sag_admin_security_v2');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.sessionVersion) currentVer = parsed.sessionVersion;
        }
      } catch {}

      // If version matches current active session version, allow
      if (isAuth && storedVer >= currentVer && currentVer > 1) {
        return true;
      }
      // Stale or older session (e.g. friend's previously saved login): purge immediately
      localStorage.removeItem('sag_admin_auth');
      localStorage.removeItem('sag_admin_email');
      localStorage.removeItem('sag_admin_session_version');
      return false;
    } catch {
      return false;
    }
  });
  const [adminEmail, setAdminEmail] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) return null;
    return localStorage.getItem('sag_admin_email') || null;
  });
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  // Active session validation guard: boots out stale logins immediately if tab is reactivated
  useEffect(() => {
    let active = true;
    const isProductionHost = !['localhost', '127.0.0.1'].includes(window.location.hostname);
    const validateSession = async () => {
      if (isProductionHost) {
        try {
          const response = await fetch('/api/admin-config?action=session', { credentials: 'same-origin' });
          if (!active) return;
          if (!response.ok) {
            setIsAdminLoggedIn(false);
            setAdminEmail(null);
            localStorage.removeItem('sag_admin_email');
            void signOutAdminFromFirebase().catch(() => {});
            return;
          }
          const session = await response.json();
          try {
            await signInAdminToFirebase(session.firebaseToken);
          } catch (firebaseErr) {
            console.warn('Firebase admin sign-in notice:', firebaseErr);
          }
          if (!active) return;
          setIsAdminLoggedIn(true);
          setAdminEmail(session.username || null);
          const securityResponse = await fetch('/api/admin-config?action=security', { credentials: 'same-origin' });
          if (securityResponse.ok && active) {
            const result = await securityResponse.json();
            const safeConfig = { ...DEFAULT_SECURITY_CONFIG, ...result.securityConfig, adminPassword: '', securityPin: '' };
            setSecurityConfig(safeConfig);
            localStorage.setItem('sag_admin_security_v2', JSON.stringify(safeConfig));
          }
        } catch {
          if (active) {
            setIsAdminLoggedIn(false);
            setAdminEmail(null);
          }
        }
        return;
      }

      try {
        const isAuth = localStorage.getItem('sag_admin_auth') === 'true';
        const storedVer = Number(localStorage.getItem('sag_admin_session_version') || 0);
        const currentVer = securityConfig.sessionVersion || DEFAULT_SECURITY_CONFIG.sessionVersion;

        if (isAuth && (storedVer < currentVer || currentVer <= 1)) {
          // Stale session detected (e.g. friend's old phone session) - purge immediately
          setIsAdminLoggedIn(false);
          setAdminEmail(null);
          localStorage.removeItem('sag_admin_auth');
          localStorage.removeItem('sag_admin_email');
          localStorage.removeItem('sag_admin_session_version');
        }
      } catch {}
    };

    validateSession();
    window.addEventListener('focus', validateSession);
    window.addEventListener('storage', validateSession);
    return () => {
      active = false;
      window.removeEventListener('focus', validateSession);
      window.removeEventListener('storage', validateSession);
    };
  }, [securityConfig.sessionVersion]);

  // Tracks whether the admin is signed into Firebase with the custom token (required for admin-only data)
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState<boolean>(() => auth.currentUser?.uid === ADMIN_UID);
  useEffect(() => onAuthStateChanged(auth, (user) => setIsFirebaseAdmin(user?.uid === ADMIN_UID)), []);

  // Datasets initialized from empty/defaults, fully controlled by the Firestore single source of truth
  const [categoryDocs, setCategoryDocs] = useState<CategoryItem[]>([]);
  const setCategories = setCategoryDocs;
  // Live product counts per category are derived from the product catalog
  const categories = useMemo<CategoryItem[]>(() => {
    const liveCountsMap: Record<string, number> = {};
    (products || []).forEach((p: any) => {
      if (p.category) {
        liveCountsMap[p.category] = (liveCountsMap[p.category] || 0) + 1;
      }
    });
    return categoryDocs.map((c) => {
      const liveCount = liveCountsMap[c.name] ?? 0;
      return {
        ...c,
        itemCount: liveCount > 0 ? `${liveCount}+ Designs` : `${liveCount} Designs`,
      };
    });
  }, [categoryDocs, products]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem('sag_customers_local');
      return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [homepageSections, setHomepageSections] = useState<HomepageSectionConfig[]>(() => {
    try {
      const saved = localStorage.getItem('sag_homepage_sections_local');
      if (saved) return mergeHomepageSections(JSON.parse(saved));
    } catch {}
    return INITIAL_SECTIONS;
  });
  const [heroConfig, setHeroConfig] = useState<HeroBannerConfig>(() => {
    try {
      const saved = localStorage.getItem('sag_hero_config_local');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_HERO_CONFIG;
  });
  const [banners, setBanners] = useState<Banner[]>(() => {
    try {
      const saved = localStorage.getItem('sag_banners_local');
      return saved ? JSON.parse(saved) : INITIAL_BANNERS;
    } catch {
      return INITIAL_BANNERS;
    }
  });
  const [reviewsList, setReviewsList] = useState<Review[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('sag_store_settings_local');
      if (saved) {
        const normalized = normalizeStoreBrand(toPublicStoreSettings(JSON.parse(saved)));
        localStorage.setItem('sag_store_settings_local', JSON.stringify(normalized));
        return normalized;
      }
    } catch {}
    return INITIAL_STORE_SETTINGS;
  });
  const [paymentSettings, setPaymentSettings] = useState<PaymentGatewaySettings>(() => {
    try {
      const saved = localStorage.getItem('sag_payment_settings_local');
      if (saved) {
        const safeSettings = toPublicPaymentSettings(JSON.parse(saved));
        localStorage.setItem('sag_payment_settings_local', JSON.stringify(safeSettings));
        return safeSettings;
      }
    } catch {}
    return toPublicPaymentSettings(INITIAL_PAYMENT_SETTINGS);
  });
  const [dealOfTheDay, setDealOfTheDay] = useState<DealOfTheDayConfig>(() => {
    try {
      const saved = localStorage.getItem('sag_deal_of_the_day');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_DEAL_OF_THE_DAY;
  });
  const [instagramReels, setInstagramReels] = useState<InstagramReel[]>(() => {
    try {
      const saved = localStorage.getItem('sag_instagram_reels');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const persistStorefrontSetting = async (key: string, value: unknown, localKey: string) => {
    const isLocalHost = typeof window === 'undefined' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalHost) {
      try {
        localStorage.setItem(localKey, JSON.stringify(value));
      } catch {}
      return;
    }

    const response = await fetch('/api/admin-config', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { [key]: value } }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Unable to sync storefront setting.');
    }
    try {
      localStorage.setItem(localKey, JSON.stringify(value));
    } catch {}
  };

  const loadSharedStorefrontSettings = async () => {
    if (typeof window === 'undefined' || ['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    try {
      const response = await fetch('/api/admin-config', { credentials: 'same-origin' });
      if (!response.ok) return;
      const { settings = {} } = await response.json();

      if (settings.homepageSections) {
        const value = mergeHomepageSections(settings.homepageSections);
        setHomepageSections(value);
        localStorage.setItem('sag_homepage_sections_local', JSON.stringify(value));
      }
      if (settings.heroConfig) {
        setHeroConfig(settings.heroConfig);
        localStorage.setItem('sag_hero_config_local', JSON.stringify(settings.heroConfig));
      }
      if (settings.storeSettings) {
        const value = normalizeStoreBrand(settings.storeSettings);
        setStoreSettings(value);
        localStorage.setItem('sag_store_settings_local', JSON.stringify(value));
      }
      if (settings.banners) {
        setBanners(settings.banners);
        localStorage.setItem('sag_banners_local', JSON.stringify(settings.banners));
      }
      if (settings.dealOfTheDay) {
        setDealOfTheDay(settings.dealOfTheDay);
        localStorage.setItem('sag_deal_of_the_day', JSON.stringify(settings.dealOfTheDay));
      }
      // Always apply (an empty list means the admin removed every reel)
      const reels = Array.isArray(settings.instagramReels) ? settings.instagramReels : [];
      setInstagramReels(reels);
      localStorage.setItem('sag_instagram_reels', JSON.stringify(reels));
      if (settings.paymentSettings) {
        const value = toPublicPaymentSettings(settings.paymentSettings);
        setPaymentSettings(value);
        localStorage.setItem('sag_payment_settings_local', JSON.stringify(value));
      }
    } catch (error) {
      console.warn('Shared storefront settings unavailable:', error);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || ['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    let settingsConnected = false;
    const refreshSharedSettings = () => {
      void loadSharedStorefrontSettings();
    };
    refreshSharedSettings();
    // Any change to a storefront setting document (including payment settings) triggers a refresh via the API.
    // The first snapshot only confirms the listener is connected; the initial load already happened above.
    const unsubscribeSettings = watchCollection('storefront_settings', () => {
      if (!settingsConnected) {
        settingsConnected = true;
        return;
      }
      refreshSharedSettings();
    });
    const fallbackSync = window.setInterval(() => {
      if (!settingsConnected) refreshSharedSettings();
    }, 15000);
    window.addEventListener('focus', refreshSharedSettings);
    return () => {
      window.clearInterval(fallbackSync);
      window.removeEventListener('focus', refreshSharedSettings);
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sag_customers_local', JSON.stringify(customers));
      localStorage.setItem('sag_banners_local', JSON.stringify(banners));
    } catch {}
  }, [customers, banners]);

  // Firestore documents store the frontend shapes directly; these helpers only normalize defaults.
  const mapCategoryFromDb = (c: any): CategoryItem => ({
    id: String(c.id),
    name: c.name || '',
    title: c.title || '',
    image: c.image || '',
    isActive: c.isActive ?? true,
    itemCount: c.itemCount || '0 Designs',
    tagline: c.tagline || '',
  });

  const mapCategoryToDb = (c: Partial<CategoryItem>) => ({
    name: c.name,
    title: c.title,
    image: c.image,
    isActive: c.isActive,
    tagline: c.tagline,
  });

  const mapCouponToDb = (c: Partial<Coupon>) => ({
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue != null ? Number(c.discountValue) || 0 : undefined,
    minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) || 0 : undefined,
    maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : undefined,
    startDate: c.startDate,
    expiryDate: c.expiryDate,
    usageLimit: c.usageLimit != null ? Number(c.usageLimit) || 0 : undefined,
    usageCount: c.usageCount != null ? Number(c.usageCount) || 0 : undefined,
    isActive: c.isActive,
  });

  const mapReviewFromDb = (r: any): Review => ({
    id: String(r.id),
    productId: String(r.productId || '0'),
    productName: r.productName || '',
    userName: r.userName || 'Anonymous',
    userEmail: r.userEmail || undefined,
    rating: Number(r.rating) || 5,
    comment: String(r.comment || ''),
    status: r.status || 'pending',
    adminReply: r.adminReply || '',
    date: r.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    verifiedPurchase: Boolean(r.verifiedPurchase),
    sizePurchased: r.sizePurchased,
    location: r.location || 'Artisan, India',
    imageUrl: r.imageUrl || '',
  });

  // Public storefront settings are persisted through the protected server API.
  const saveHomepageSectionsSetting = async (nextSections: HomepageSectionConfig[]) => {
    await persistStorefrontSetting('homepageSections', nextSections, 'sag_homepage_sections_local');
  };

  const saveStoreSettingsSetting = async (nextStore: StoreSettings) => {
    await persistStorefrontSetting('storeSettings', toPublicStoreSettings(nextStore), 'sag_store_settings_local');
  };

  const savePaymentSettingsSetting = async (nextPayment: PaymentGatewaySettings) => {
    await persistStorefrontSetting(
      'paymentSettings',
      toPublicPaymentSettings(nextPayment),
      'sag_payment_settings_local'
    );
  };

  const saveHeroConfigSetting = async (nextHero: HeroBannerConfig) => {
    await persistStorefrontSetting('heroConfig', nextHero, 'sag_hero_config_local');
  };

  // Public collections (categories, reviews): live Firestore listeners for multi-device synchronization.
  // Each collection is watched independently so a single failure does not block the others.
  useEffect(() => {
    let categoriesLoaded = false;
    let reviewsLoaded = false;
    const markLoaded = () => {
      if (categoriesLoaded && reviewsLoaded) setIsLoading(false);
    };
    // Never keep the storefront in a loading state if a listener cannot connect
    const loadingFallback = window.setTimeout(() => setIsLoading(false), 6000);

    const unsubscribeCategories = watchCollection('categories', (rows) => {
      setCategoryDocs(rows.map(mapCategoryFromDb));
      categoriesLoaded = true;
      markLoaded();
    });
    const unsubscribeReviews = watchCollection('reviews', (rows) => {
      setReviewsList(rows.map(mapReviewFromDb));
      reviewsLoaded = true;
      markLoaded();
    });

    return () => {
      window.clearTimeout(loadingFallback);
      unsubscribeCategories();
      unsubscribeReviews();
    };
  }, []);

  // Admin-only collections (orders, coupons): only readable once the admin is signed into Firebase.
  useEffect(() => {
    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isFirebaseAdmin && !(isLocalHost && isAdminLoggedIn)) return;

    const unsubscribeOrders = watchCollection('orders', (rows) => {
      setOrders(rows.map(mapOrderFromDb));
    });
    const unsubscribeCoupons = watchCollection('coupons', (rows) => {
      setCoupons(rows.map(mapCouponFromDb));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeCoupons();
    };
  }, [isFirebaseAdmin, isAdminLoggedIn]);

  // Real-time leads from Firestore with quota protection
  useEffect(() => {
    let unsubscribeLeads: () => void = () => {};
    if (!isQuotaExhausted()) {
      try {
        const leadsQuery = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
        unsubscribeLeads = onSnapshot(
          leadsQuery,
          (snapshot) => {
            const leadsData: Lead[] = [];
            snapshot.forEach((doc) => {
              leadsData.push({ id: doc.id, ...doc.data() } as Lead);
            });
            setLeads(leadsData);
          },
          (err) => {
            if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
              markFirestoreQuotaExhausted();
            }
          }
        );
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
      }
    }

    return () => {
      unsubscribeLeads();
    };
  }, []);

  // Auto-sync hero slides when real products are available or updated in the database.
  // Only the admin can save settings, so visitors never attempt this. Slide bannerImage is never touched.
  useEffect(() => {
    if (!isAdminLoggedIn) return;
    if (products && products.length > 0) {
      if (!heroConfig?.slides || heroConfig.slides.length === 0) {
        const freshSlides = generateHeroSlidesFromProducts(products);
        const newConfig: HeroBannerConfig = { slides: freshSlides };
        void saveHeroConfigSetting(newConfig)
          .then(() => setHeroConfig(newConfig))
          .catch((error) => console.warn('Hero live sync notice:', error));
        return;
      }

      // Check if any existing hero slide needs price/title/image sync with updated products
      let updatedSome = false;
      const updatedSlides = heroConfig.slides.map((slide) => {
        const matched = products.find(
          (p) =>
            (slide.productId && String(p.id) === String(slide.productId)) ||
            (slide.link && String(p.id) === String(slide.link)) ||
            p.name === slide.title
        );

        if (matched) {
          const freshPrice = Number(matched.price) || slide.price;
          const freshOrigPrice = Number(matched.originalPrice) || Math.round(freshPrice * 1.85);
          const freshImg = (matched.images && matched.images.length > 0) ? matched.images[0] : ((matched as any).image || slide.image);
          const freshTitle = matched.name || slide.title;

          if (
            slide.price !== freshPrice ||
            slide.originalPrice !== freshOrigPrice ||
            slide.title !== freshTitle ||
            slide.image !== freshImg ||
            slide.productId !== matched.id
          ) {
            updatedSome = true;
            return {
              ...slide,
              productId: matched.id,
              price: freshPrice,
              originalPrice: freshOrigPrice,
              title: freshTitle,
              image: freshImg,
            };
          }
        }
        return slide;
      });

      if (updatedSome) {
        const newConfig: HeroBannerConfig = { slides: updatedSlides };
        void saveHeroConfigSetting(newConfig)
          .then(() => setHeroConfig(newConfig))
          .catch((error) => console.warn('Hero live sync notice:', error));
      }
    }
  }, [products, isAdminLoggedIn]);

  // Auth Handler with hardened security & PIN check
  const loginAdmin = async (
    usernameOrEmail: string, 
    pass: string, 
    pin?: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!usernameOrEmail || !pass) {
      return { success: false, message: 'Please provide both username and password.' };
    }

    if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      try {
        const response = await fetch('/api/admin-config?action=login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: usernameOrEmail, password: pass, pin }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return { success: false, message: result.error || 'Admin authentication failed.' };
        // Admin-only database writes require the Firebase custom token issued by the server
        try {
          await signInAdminToFirebase(result.firebaseToken);
        } catch (firebaseErr) {
          console.warn('Firebase admin sign-in notice:', firebaseErr);
          return { success: false, message: 'Database authorization failed. Please try signing in again.' };
        }
        const securityResponse = await fetch('/api/admin-config?action=security', { credentials: 'same-origin' });
        if (securityResponse.ok) {
          const securityResult = await securityResponse.json();
          setSecurityConfig((previous) => ({ ...previous, ...securityResult.securityConfig }));
        }
        setIsAdminLoggedIn(true);
        setAdminEmail(usernameOrEmail);
        localStorage.setItem('sag_admin_auth', 'true');
        localStorage.setItem('sag_admin_email', usernameOrEmail);
        localStorage.setItem('sag_admin_session_version', String(result.sessionVersion || 1));
        return { success: true };
      } catch {
        return { success: false, message: 'Admin authentication service unavailable.' };
      }
    }

    const inputLower = usernameOrEmail.trim().toLowerCase();
    const configuredUser = (securityConfig.adminUsername || 'muskan').trim().toLowerCase();
    const isUsernameMatch = 
      inputLower === configuredUser || 
      inputLower === `${configuredUser}@suitauragirls.com` ||
      inputLower === 'muskan' || 
      inputLower === 'muskan@suitauragirls.com';

    // Strictly check configured admin password (old 'abhi' is permanently rejected)
    const isPasswordMatch = pass === securityConfig.adminPassword;

    if (!isUsernameMatch || !isPasswordMatch) {
      return { success: false, message: 'Invalid admin username or password.' };
    }

    // Check PIN if required
    if (securityConfig.requirePin) {
      if (!pin || pin.trim() !== securityConfig.securityPin.trim()) {
        return { success: false, message: 'Invalid 6-digit Security PIN.' };
      }
    }

    setIsAdminLoggedIn(true);
    setAdminEmail(usernameOrEmail);
    localStorage.setItem('sag_admin_auth', 'true');
    localStorage.setItem('sag_admin_email', usernameOrEmail);
    localStorage.setItem('sag_admin_session_version', String(securityConfig.sessionVersion));
    return { success: true };
  };

  const logoutAdmin = () => {
    if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      void fetch('/api/admin-config?action=logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    }
    void signOutAdminFromFirebase().catch(() => {});
    setIsAdminLoggedIn(false);
    setAdminEmail(null);
    localStorage.removeItem('sag_admin_auth');
    localStorage.removeItem('sag_admin_email');
    localStorage.removeItem('sag_admin_session_version');
  };

  const updateSecurityConfig = async (updated: Partial<AdminSecurityConfig>) => {
    const next = { ...securityConfig, ...updated };
    const isProductionHost = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isProductionHost) {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ securityConfig: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to update admin security settings.');
      next.sessionVersion = result.sessionVersion || next.sessionVersion + 1;
    }
    const savedConfig = isProductionHost ? { ...next, adminPassword: '', securityPin: '' } : next;
    setSecurityConfig(savedConfig);
    try {
      localStorage.setItem('sag_admin_security_v2', JSON.stringify(savedConfig));
    } catch {}
  };

  const invalidateAllAdminSessions = async () => {
    const nextVer = (securityConfig.sessionVersion || 2) + 1;
    await updateSecurityConfig({ sessionVersion: nextVer });
    logoutAdmin();
  };

  // Category Operations
  const addCategory = async (cat: Omit<CategoryItem, 'id'>) => {
    const newId = newDocId('cat-');
    const newCat = { id: newId, ...cat };
    setCategories((prev) => [...prev, newCat]);
    try {
      await saveDoc('categories', newId, mapCategoryToDb(newCat), false);
    } catch (error) {
      console.warn('Firebase add category notice:', error);
    }
  };

  const updateCategory = async (id: string, updated: Partial<CategoryItem>) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    try {
      await saveDoc('categories', id, mapCategoryToDb(updated));
    } catch (error) {
      console.warn('Firebase update category notice:', error);
    }
  };

  const deleteCategory = async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    try {
      await removeDoc('categories', id);
    } catch (error) {
      console.warn('Firebase delete category notice:', error);
    }
  };

  // Order Operations
  const updateOrderStatus = async (
    orderNumber: string,
    status: AdminOrderStatus,
    trackingNumber?: string,
    notes?: string
  ) => {
    const originalOrder = orders.find(o => o.orderNumber === orderNumber);
    if (!originalOrder) return;

    const updatedOrder = {
      ...originalOrder,
      status,
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(notes ? { notes } : {}),
    };

    setOrders((prev) =>
      prev.map((ord) => (ord.orderNumber === orderNumber ? updatedOrder : ord))
    );

    try {
      await patchDoc('orders', orderNumber, {
        status,
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(notes ? { notes } : {}),
      });
    } catch (error) {
      console.warn('Firebase update order notice:', error);
    }
  };

  const updateOrderPaymentStatus = async (
    orderNumber: string,
    paymentStatus: 'Paid' | 'Pending Verification' | 'Unpaid'
  ) => {
    const originalOrder = orders.find(o => o.orderNumber === orderNumber);
    if (!originalOrder) return;

    const updatedOrder = {
      ...originalOrder,
      paymentStatus,
    };

    setOrders((prev) =>
      prev.map((ord) => (ord.orderNumber === orderNumber ? updatedOrder : ord))
    );

    try {
      await patchDoc('orders', orderNumber, { paymentStatus });
    } catch (error) {
      console.warn('Firebase update payment status notice:', error);
    }
  };

  const addOrder = async (order: Order) => {
    const payload = mapOrderToDb(order);
    try {
      // Document id = order number; checkout creates the order document in one write.
      await saveDoc('orders', payload.orderNumber, payload, false);
    } catch (error) {
      throw new Error(`Order could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }

    setOrders((prev) => [order, ...prev.filter((existing) => existing.orderNumber !== order.orderNumber)]);

    const custEmail = (order.customerEmail || '').trim().toLowerCase();
    if (custEmail) {
      const existing = customers.find((customer) => customer.email.toLowerCase() === custEmail);
      const nextCustomers = existing
        ? customers.map((customer) => customer.email.toLowerCase() === custEmail
            ? {
                ...customer,
                totalOrders: (customer.totalOrders || 0) + 1,
                totalSpent: (Number(customer.totalSpent) || 0) + Number(order.finalTotal || 0),
                phone: customer.phone || order.customerMobile || '',
                lastOrderDate: order.date,
              }
            : customer)
        : [{
            id: `order_${custEmail}`,
            name: order.customerName || 'Customer',
            email: custEmail,
            phone: order.customerMobile || '',
            totalOrders: 1,
            totalSpent: Number(order.finalTotal || 0),
            lastOrderDate: order.date,
            status: 'active' as const,
            joinedDate: new Date().toISOString().split('T')[0],
          }, ...customers];
      setCustomers(nextCustomers);
    }
  };

  const deleteOrder = async (orderNumber: string) => {
    setOrders((prev) => prev.filter((o) => o.orderNumber !== orderNumber));
    try {
      await removeDoc('orders', orderNumber);
    } catch (error) {
      console.warn('Firebase delete order notice:', error);
    }
  };

  // Customer Operations
  const updateCustomerStatus = async (id: string, status: 'active' | 'inactive') => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  };

  // Coupon Operations
  const addCoupon = async (coupon: Omit<Coupon, 'id' | 'usageCount'>) => {
    const newId = newDocId('coup-');
    const newCoup = { id: newId, usageCount: 0, ...coupon };
    setCoupons((prev) => [newCoup, ...prev]);
    try {
      await saveDoc('coupons', newId, mapCouponToDb(newCoup), false);
    } catch (error) {
      console.warn('Firebase add coupon notice:', error);
    }
  };

  const updateCoupon = async (id: string, updated: Partial<Coupon>) => {
    setCoupons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
    try {
      await saveDoc('coupons', id, mapCouponToDb(updated));
    } catch (error) {
      console.warn('Firebase update coupon notice:', error);
    }
  };

  const deleteCoupon = async (id: string) => {
    setCoupons((prev) => prev.filter((c) => c.id !== id));
    try {
      await removeDoc('coupons', id);
    } catch (error) {
      console.warn('Firebase delete coupon notice:', error);
    }
  };

  const toggleCouponStatus = (id: string) => {
    const target = coupons.find(c => c.id === id);
    if (!target) return;
    updateCoupon(id, { isActive: !target.isActive });
  };

  // Homepage Operations
  const toggleHomepageSection = async (id: string) => {
    const nextSections = homepageSections.map((sec) => (sec.id === id ? { ...sec, enabled: !sec.enabled } : sec));
    await saveHomepageSectionsSetting(nextSections);
    setHomepageSections(nextSections);
  };

  const moveHomepageSection = async (id: string, direction: 'up' | 'down') => {
    const idx = homepageSections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= homepageSections.length) return;

    const updated = [...homepageSections];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    const nextSections = updated.map((sec, i) => ({ ...sec, order: i + 1 }));
    await saveHomepageSectionsSetting(nextSections);
    setHomepageSections(nextSections);
  };

  const reorderHomepageSections = async (newSections: HomepageSectionConfig[]) => {
    const formatted = newSections.map((sec, i) => ({ ...sec, order: i + 1 }));
    await saveHomepageSectionsSetting(formatted);
    setHomepageSections(formatted);
  };

  const resetHomepageSectionsToDefault = async () => {
    await saveHomepageSectionsSetting(INITIAL_SECTIONS);
    setHomepageSections(INITIAL_SECTIONS);
  };

  const updateHeroConfig = async (updated: Partial<HeroBannerConfig>) => {
    const nextHero = { ...heroConfig, ...updated };
    await saveHeroConfigSetting(nextHero);
    setHeroConfig(nextHero);
  };

  const syncHeroWithLiveProducts = async () => {
    // Keep any banner photo the admin uploaded for a product that stays in the slides
    const bannerByProduct = new Map(
      (heroConfig?.slides || []).filter((s) => s.bannerImage && s.productId).map((s) => [String(s.productId), s.bannerImage]),
    );
    const freshSlides = generateHeroSlidesFromProducts(products).map((slide) => ({
      ...slide,
      bannerImage: slide.productId ? bannerByProduct.get(String(slide.productId)) : undefined,
    }));
    const newConfig: HeroBannerConfig = { slides: freshSlides };
    setHeroConfig(newConfig);
    try {
      await updateHeroConfig(newConfig);
    } catch (e) {
      console.warn('Hero live sync notice:', e);
    }
  };

  // Banner Operations
  const addBanner = async (banner: Omit<Banner, 'id'>) => {
    const newId = String(Math.floor(Math.random() * 10000000) + 1);
    const newBan = { id: newId, ...banner };
    const nextBanners = [newBan, ...banners];
    await persistStorefrontSetting('banners', nextBanners, 'sag_banners_local');
    setBanners(nextBanners);
  };

  const updateBanner = async (id: string, updated: Partial<Banner>) => {
    const nextBanners = banners.map((banner) => (banner.id === id ? { ...banner, ...updated } : banner));
    await persistStorefrontSetting('banners', nextBanners, 'sag_banners_local');
    setBanners(nextBanners);
  };

  const deleteBanner = async (id: string) => {
    const nextBanners = banners.filter((banner) => banner.id !== id);
    await persistStorefrontSetting('banners', nextBanners, 'sag_banners_local');
    setBanners(nextBanners);
  };

  const toggleBannerStatus = (id: string) => {
    const target = banners.find(b => b.id === id);
    if (!target) return;
    updateBanner(id, { isActive: !target.isActive });
  };

  // Review Operations
  const addReview = async (reviewData: Omit<Review, 'id'> & { id?: string }) => {
    const newId = reviewData.id || newDocId('rev-');
    const newReview: Review = {
      date: reviewData.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: reviewData.status || 'pending',
      verifiedPurchase: reviewData.verifiedPurchase ?? true,
      ...reviewData,
      id: newId,
    };

    setReviewsList((prev) => [newReview, ...prev]);

    try {
      await saveDoc('reviews', newId, {
        ...newReview,
        productId: newReview.productId ? String(newReview.productId) : '0',
        rating: Number(newReview.rating) || 5,
        location: newReview.location || 'India',
        createdAt: new Date().toISOString(),
      }, false);
    } catch (error) {
      console.warn('Firebase add review notice:', error);
    }
  };

  const updateReview = async (id: string, updatedData: Partial<Review>) => {
    const target = reviewsList.find(r => r.id === id);
    if (!target) return;
    const updatedReview = { ...target, ...updatedData };
    setReviewsList((prev) => prev.map((r) => (r.id === id ? updatedReview : r)));
    try {
      await patchDoc('reviews', id, updatedData);
    } catch (error) {
      console.warn('Firebase update review notice:', error);
    }
  };

  const updateReviewStatus = async (id: string, status: 'approved' | 'pending' | 'hidden') => {
    const target = reviewsList.find(r => r.id === id);
    if (!target) return;
    const updatedReview = { ...target, status };
    setReviewsList((prev) => prev.map((r) => (r.id === id ? updatedReview : r)));
    try {
      await patchDoc('reviews', id, { status });
    } catch (error) {
      console.warn('Firebase update review notice:', error);
    }
  };

  const replyToReview = async (id: string, reply: string) => {
    const target = reviewsList.find(r => r.id === id);
    if (!target) return;
    const updatedReview = { ...target, adminReply: reply };
    setReviewsList((prev) => prev.map((r) => (r.id === id ? updatedReview : r)));
    try {
      await patchDoc('reviews', id, { adminReply: reply });
    } catch (error) {
      console.warn('Firebase update review notice:', error);
    }
  };

  const deleteReview = async (id: string) => {
    setReviewsList((prev) => prev.filter((r) => r.id !== id));
    try {
      await removeDoc('reviews', id);
    } catch (error) {
      console.warn('Firebase delete review notice:', error);
    }
  };

  // Store & Payment Settings
  const updateStoreSettings = async (updated: Partial<StoreSettings>) => {
    const nextStore = normalizeStoreBrand({ ...storeSettings, ...updated });
    await saveStoreSettingsSetting(nextStore);
    setStoreSettings(nextStore);
  };

  const updateInstagramReels = async (reels: InstagramReel[]) => {
    await persistStorefrontSetting('instagramReels', reels, 'sag_instagram_reels');
    setInstagramReels(reels);
  };

  const updateDealOfTheDay = async (updated: Partial<DealOfTheDayConfig>) => {
    const nextDeal = { ...dealOfTheDay, ...updated };
    await persistStorefrontSetting('dealOfTheDay', nextDeal, 'sag_deal_of_the_day');
    setDealOfTheDay(nextDeal);
  };

  const updatePaymentSettings = async (updated: Partial<PaymentGatewaySettings>) => {
    // Keep allowCod permanently false
    const nextPayment = { ...paymentSettings, ...updated, allowCod: false, prepaidOnly: true };
    setPaymentSettings(nextPayment);
    await savePaymentSettingsSetting(nextPayment);
  };

  const resetStoreDataToDefaults = async () => {
    await resetToDefaultProducts();
    setCategories(INITIAL_CATEGORIES);
    setOrders(INITIAL_ORDERS);
    setCustomers(INITIAL_CUSTOMERS);
    setCoupons(INITIAL_COUPONS);
    setHomepageSections(INITIAL_SECTIONS);
    setHeroConfig(INITIAL_HERO_CONFIG);
    setBanners(INITIAL_BANNERS);
    setReviewsList(INITIAL_REVIEWS);
    setStoreSettings(INITIAL_STORE_SETTINGS);
    setPaymentSettings(INITIAL_PAYMENT_SETTINGS);
    await Promise.all([
      saveHomepageSectionsSetting(INITIAL_SECTIONS),
      saveHeroConfigSetting(INITIAL_HERO_CONFIG),
      saveStoreSettingsSetting(INITIAL_STORE_SETTINGS),
      persistStorefrontSetting('banners', INITIAL_BANNERS, 'sag_banners_local'),
      persistStorefrontSetting('dealOfTheDay', INITIAL_DEAL_OF_THE_DAY, 'sag_deal_of_the_day'),
    ]);
  };

  // Lead Operations
  const updateLeadOfferStatus = async (id: string, status: boolean) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, offerSent: status } : l)));
    if (!isQuotaExhausted()) {
      try {
        await updateDoc(doc(db, 'leads', id), { offerSent: status });
      } catch (error: any) {
        if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
      }
    }
  };

  const deleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (!isQuotaExhausted()) {
      try {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'leads', id));
      } catch (error: any) {
        if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
      }
    }
  };

  return (
    <AdminContext.Provider
      value={{
        isAdminLoggedIn,
        adminEmail,
        adminTab,
        setAdminTab,
        loginAdmin,
        logoutAdmin,
        securityConfig,
        updateSecurityConfig,
        invalidateAllAdminSessions,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        duplicateProduct,
        toggleProductStatus,
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        orders,
        addOrder,
        updateOrderStatus,
        updateOrderPaymentStatus,
        deleteOrder,
        customers,
        updateCustomerStatus,
        leads,
        updateLeadOfferStatus,
        deleteLead,
        coupons,
        addCoupon,
        updateCoupon,
        deleteCoupon,
        toggleCouponStatus,
        visitorStats: {
          liveActiveCount: 0, // Placeholder, usually handled by visitorTracker
          todayUniqueCount: 0,
          totalUniqueCount: 0,
          checkoutInitiatedCount: 0,
          cartAddedCount: 0,
        },
        homepageSections,
        toggleHomepageSection,
        moveHomepageSection,
        reorderHomepageSections,
        resetHomepageSectionsToDefault,
        heroConfig,
        updateHeroConfig,
        syncHeroWithLiveProducts,
        dealOfTheDay,
        updateDealOfTheDay,
        instagramReels,
        updateInstagramReels,
        banners,
        addBanner,
        updateBanner,
        deleteBanner,
        toggleBannerStatus,
        reviewsList,
        reviews: reviewsList,
        addReview,
        updateReview,
        updateReviewStatus,
        replyToReview,
        deleteReview,
        storeSettings,
        updateStoreSettings,
        paymentSettings,
        updatePaymentSettings,
        resetStoreDataToDefaults,
        isLoading,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
