import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Product,
  CartItem,
  ProductSize,
  ProductColor,
  Order,
  ActivePage,
  ProductCategory,
  Coupon,
  ComboOfferConfig
} from '../types';
import { useProducts } from './ProductContext';
import { useRouter } from './RouterContext';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { COLLECTIONS, emailKey, getDocById, listDocs, saveDoc } from '../lib/dataStore';
import { mapCouponFromDb } from './AdminContext';
import { couponEligibleSubtotal, couponRestrictionNotes, isCouponRestricted } from '../utils/coupons';
import { doc as fsDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ordersApi } from '../lib/api';
import { withPageTransition } from '../utils/pageTransition';
import { recordHeartbeat, trackFunnelEvent, trackItem } from '../utils/visitorTracker';
import { categoryToSlug, slugToCategory } from '../utils/slugHelper';
import { MAX_BAG_LINES, comboPiecesIn, enforceLooks, isAccessory, lookLineId, outfitQtyIn } from '../utils/looks';
import { fromCatalogOrLive, loadCatalog, readsLive } from '../lib/catalog';
import { prepaidDiscountFor, prepaidRulesFrom } from '../utils/prepaid';

export // Must match MAX_QTY_PER_LINE in api/_lib/orders.js.
const MAX_QTY_PER_ITEM = 10;
const NO_COUPONS: Coupon[] = [];
const qtyCapFor = (product: Product) => {
  const stock = Number(product?.stockQuantity);
  return Number.isFinite(stock) && stock > 0 ? Math.min(MAX_QTY_PER_ITEM, stock) : MAX_QTY_PER_ITEM;
};

interface ShopContextType {
  /** Published outfits for every listing, search and recommendation (never hidden products or accessories). */
  products: Product[];
  allProducts: Product[];
  /** Published accessories, offered only inside "Complete the look" on combo / set product pages. */
  accessories: Product[];
  isLoading: boolean;
  getProductById: (id: string | null | undefined) => Product | undefined;
  cart: CartItem[];
  wishlist: Product[];
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  /** Updates the active page without navigating (used when the URL changed by Back/Forward). */
  syncActivePage: (page: ActivePage) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  quickViewProduct: Product | null;
  setQuickViewProduct: (product: Product | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  isCouponDrawerOpen: boolean;
  setIsCouponDrawerOpen: (open: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isSizeGuideOpen: boolean;
  setIsSizeGuideOpen: (open: boolean) => void;
  confirmedOrder: Order | null;
  setConfirmedOrder: (order: Order | null) => void;
  recentOrders: Order[];
  addRecentOrder: (order: Order) => void;
  syncCustomerOrders: (identifier?: string | { email?: string; phone?: string }) => Promise<void>;
  appliedCoupon: Coupon | null;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => void;
  toast: { message: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  addToCart: (product: Product, size: ProductSize, color?: ProductColor, quantity?: number, openDrawer?: boolean) => void;
  /** "Complete the look": adds the outfit (unless it is already in the bag) and the chosen accessories, linked to it. */
  addLookToBag: (outfit: Product, outfitSize: ProductSize, outfitColor: ProductColor | undefined, outfitQty: number, picks: Array<{ product: Product; size: ProductSize; color?: ProductColor }>) => boolean;
  buyNow: (product: Product, size?: ProductSize, color?: ProductColor, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  updateCartItem: (itemId: string, updates: { size?: ProductSize; color?: ProductColor }) => void;
  clearCart: () => void;
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  moveToCartFromWishlist: (product: Product, size?: ProductSize) => void;
  cartCount: number;
  cartSubtotal: number;
  shippingFee: number;
  discountAmount: number;
  cartTotal: number;
  /** Store-wide prepaid discount (admin setting); the server applies the same rule. */
  prepaidDiscount: number;
  /** Automatic multi-buy discount on the current bag (0 when the combo rule does not apply). */
  comboDiscount: number;
  comboOffer: ComboOfferConfig | null;
  /** Bag pieces that count towards the combo offer's minimum: outfits only (accessories never count). */
  comboPieces: number;
  freeShippingThreshold: number;
  /** Admin settings as configured (independent of the bag), for store-wide messages */
  storeOffers: { prepaidDiscount: number; prepaidPercent: number; prepaidMinPrice: number; freeShippingThreshold: number; shippingCharge: number };
  maxQtyPerItem: number;
  navigateToProduct: (productOrId: string | Product) => void;
  navigateToCategory: (category: ProductCategory | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending' | 'All') => void;
  trackOrderNumber: string;
  setTrackOrderNumber: (num: string) => void;
  isLoginPageLogin: boolean;
  setIsLoginPageLogin: (isLogin: boolean) => void;
  userDeliveryLocation: { pincode: string; city: string; state: string; area?: string };
  setUserDeliveryLocation: (location: { pincode: string; city: string; state: string; area?: string }) => void;
  isPincodeModalOpen: boolean;
  setIsPincodeModalOpen: (open: boolean) => void;
  mergeGuestCartOnAuth: (targetEmail?: string) => Promise<void>;
  coupons: Coupon[];
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { products: catalogProducts, allProducts: catalogAll, isLoading, getProductById: getCatalogProduct } = useProducts();
  // Unpublished (hidden) products stay in the admin catalogue but never reach the store.
  // Accessories are sold only inside "Complete the look", so they are kept out of every listing,
  // but stay available to the bag, product pages and links (published = both kinds).
  const published = React.useMemo(() => catalogAll.filter((p) => !p.hidden), [catalogAll]);
  const products = React.useMemo(() => catalogProducts.filter((p) => !p.hidden && !isAccessory(p)), [catalogProducts]);
  const allProducts = React.useMemo(() => published.filter((p) => !isAccessory(p)), [published]);
  const accessories = React.useMemo(() => published.filter(isAccessory), [published]);
  const getProductById = (id: string | null | undefined) => { const p = getCatalogProduct(id); return p && !p.hidden ? p : undefined; };
  const { navigate } = useRouter();
  // Load Cart with fallback redundant storage layers (v1, backup, session)
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const primary = localStorage.getItem('sag_cart_v1');
      if (primary) {
        const parsed = JSON.parse(primary);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const backup = localStorage.getItem('sag_cart_backup');
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const session = sessionStorage.getItem('sag_cart_session');
      if (session) {
        const parsed = JSON.parse(session);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading initial cart:', e);
    }
    return [];
  });

  // Keep a ref to cart so event handlers (visibility, unload) always read fresh cart
  const cartRef = React.useRef<CartItem[]>(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  // Account whose saved cart this device mirrors, and the cart last read from / written to it
  const cartSyncedForRef = React.useRef<string>('');
  const cartSyncedJsonRef = React.useRef<string | null>(null);
  // The shopper changed the bag on this device since the last save
  const cartTouchedRef = React.useRef(false);
  const setCartByShopper: typeof setCart = (value) => {
    cartTouchedRef.current = true;
    setCart(value);
  };

  // Load Wishlist from localStorage
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('sag_wishlist_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Keep a ref to wishlist so event handlers always read fresh state
  const wishlistRef = React.useRef<Product[]>(wishlist);
  useEffect(() => {
    wishlistRef.current = wishlist;
  }, [wishlist]);
  // Account whose saved wishlist this device list mirrors, and the ids last read from / written to it.
  // Nothing is pushed before the saved list has been read, so a stale device can't overwrite removals made elsewhere.
  const wishlistSyncedForRef = React.useRef<string>('');
  const wishlistSyncedIdsRef = React.useRef<string | null>(null);
  // Hearts tapped since the last successful save (id -> product added, or null when removed).
  // They are re-applied on top of the saved list, so a tap made while the page is still loading is never lost.
  const wishlistPendingRef = React.useRef<Map<string, Product | null>>(new Map());

  // Load Orders from localStorage
  const [recentOrders, setRecentOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('sag_orders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activePage, setActivePage] = useState<ActivePage>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('product')) return 'product-detail';
      const path = window.location.pathname;
      if (path === '/account') return 'account';
      if (path === '/login') return 'login';
      if (path === '/shop' || path.startsWith('/category/') || path.startsWith('/categories/') || path.startsWith('/c/')) return 'shop';
      if (path === '/cart') return 'cart';
      if (path.startsWith('/product/') || path.startsWith('/products/') || path.startsWith('/p/')) return 'product-detail';
    }
    return 'home';
  });
  const [isLoginPageLogin, setIsLoginPageLogin] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/(?:category|categories|c)\/([^/]+)/);
      if (match && match[1]) {
        return slugToCategory(match[1]);
      }
    }
    return 'All';
  });
  const [selectedProductId, setSelectedProductId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const prodParam = searchParams.get('product');
      if (prodParam) return prodParam;

      const match = window.location.pathname.match(/\/product\/([^/]+)/);
      return match ? match[1] : null;
    }
    return null;
  });
  // Seeded from the catalogue so a product page opened by URL shows at once (accessories are not in `products`).
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    () => (selectedProductId ? published.find((p) => String(p.id) === String(selectedProductId)) || null : null),
  );

  // Always keep selectedProduct in sync with the live catalogue (accessories included: they open from the bag)
  useEffect(() => {
    if (selectedProductId && published.length > 0) {
      const fresh = published.find((p) => String(p.id) === String(selectedProductId));
      if (fresh) {
        setSelectedProduct(fresh);
      }
    }
  }, [published, selectedProductId]);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [isCouponDrawerOpen, setIsCouponDrawerOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [trackOrderNumber, setTrackOrderNumber] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  // Coupons shown to shoppers: active ones created in the admin panel. The server re-validates at checkout.
  const fetchCoupons = async () => {
    try {
      const data = (!readsLive() ? (await loadCatalog())?.coupons : null) || await listDocs(COLLECTIONS.coupons);
      const now = Date.now();
      setCoupons(
        data
          .map(mapCouponFromDb)
          .filter((coupon) => coupon.isActive && coupon.code)
          .filter((coupon) => {
            if (!coupon.expiryDate) return true;
            const end = new Date(coupon.expiryDate);
            end.setHours(23, 59, 59, 999);
            return !Number.isFinite(end.getTime()) || end.getTime() >= now;
          })
          .filter((coupon) => !(coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit))
      );
    } catch (e) {
      console.warn('Could not load coupons:', e);
      setCoupons([]);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isPincodeModalOpen, setIsPincodeModalOpen] = useState<boolean>(false);

  // User Delivery Location state with LocalStorage persistence
  const [userDeliveryLocation, setUserDeliveryLocationState] = useState<{
    pincode: string;
    city: string;
    state: string;
    area?: string;
  }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sag_user_delivery_location_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.pincode) return parsed;
        }
      } catch {}
    }
    return { pincode: '110001', city: 'New Delhi', state: 'Delhi', area: 'Connaught Place' };
  });

  const setUserDeliveryLocation = (location: { pincode: string; city: string; state: string; area?: string }) => {
    setUserDeliveryLocationState(location);
    try {
      localStorage.setItem('sag_user_delivery_location_v1', JSON.stringify(location));
    } catch {}
  };

  // Resolve the logged-in storefront customer's email (custom/OTP session first, then Firebase Auth customer)
  const getSessionEmail = (): string | null => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.uid.startsWith('c_')) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem('sag_custom_user') || 'null');
      if (parsed?.email && parsed.uid === fbUser.uid) return parsed.email;
    } catch {}
    return null;
  };

  const cartKey = (item: CartItem) => item.id || `${item.product?.id}_${item.selectedSize}_${item.selectedColor?.name || ''}`;
  const cartJson = (items: CartItem[]) => JSON.stringify(items.map((i) => [cartKey(i), i.quantity]).sort());

  // Push Cart to the customer's database profile (only after the saved cart was read, and only when it changed)
  const pushCartToDb = async (itemsToPush: CartItem[]) => {
    try {
      const email = getSessionEmail();
      if (!email) return;
      const cleanEmail = emailKey(email);
      if (cartSyncedForRef.current !== cleanEmail) return;
      const json = cartJson(itemsToPush);
      if (json === cartSyncedJsonRef.current) return;
      await saveDoc(COLLECTIONS.profiles, cleanEmail, {
        email: cleanEmail,
        cart: itemsToPush,
      });
      cartSyncedJsonRef.current = json;
      if (cartJson(cartRef.current) === json) cartTouchedRef.current = false;
    } catch (e) {
      console.warn('Database cart push notice:', e);
    }
  };

  // Reads the account's saved cart. On a device that already mirrors the account, the saved cart wins
  // (so items removed or bought elsewhere never come back); changes made here and not yet saved are kept.
  // Only the first sign-in on a device combines the guest bag with the saved one.
  const mergeGuestCartOnAuth = async (targetEmail?: string) => {
    try {
      const email: string | null = targetEmail || getSessionEmail();
      if (!email) return;
      const cleanEmail = emailKey(email);

      const profData = await getDocById(COLLECTIONS.profiles, cleanEmail);
      const remoteCart: CartItem[] | null = profData && Array.isArray(profData.cart) ? (profData.cart as CartItem[]) : null;
      const local = cartRef.current || [];

      let cartOwner: string | null = null;
      try { cartOwner = localStorage.getItem('sag_cart_owner'); } catch {}
      const alreadyOwned = cartOwner === cleanEmail;
      try { localStorage.setItem('sag_cart_owner', cleanEmail); } catch {}

      const locallyChanged = cartTouchedRef.current
        || (cartSyncedForRef.current === cleanEmail && cartSyncedJsonRef.current !== null && cartJson(local) !== cartSyncedJsonRef.current);

      let next: CartItem[];
      if (!remoteCart) {
        next = local;
      } else if (alreadyOwned) {
        next = locallyChanged ? local : remoteCart;
      } else {
        const merged = new Map<string, CartItem>();
        remoteCart.forEach((item) => merged.set(cartKey(item), { ...item }));
        local.forEach((item) => {
          const key = cartKey(item);
          const existing = merged.get(key);
          merged.set(key, existing ? { ...existing, quantity: Math.min(10, existing.quantity + item.quantity) } : { ...item });
        });
        next = Array.from(merged.values());
      }

      cartSyncedForRef.current = cleanEmail;
      cartSyncedJsonRef.current = remoteCart ? cartJson(remoteCart) : '';
      cartRef.current = next;
      setCart(next);
      try {
        localStorage.setItem('sag_cart_v1', JSON.stringify(next));
        localStorage.setItem('sag_cart_backup', JSON.stringify(next));
      } catch {}
      await pushCartToDb(next);
    } catch (e) {
      console.warn('Background cart merge notice:', e);
    }
  };

  // Pull / Restore Cart from the customer's database profile
  const pullCartFromDb = async () => {
    await mergeGuestCartOnAuth();
  };

  const wishlistIds = (items: Product[]) => items.map((item) => String(item?.id || '')).filter(Boolean).sort().join(',');

  // Push Wishlist to the customer's database profile (only after it was read, and only when it changed)
  const pushWishlistToDb = async (itemsToPush: Product[]) => {
    try {
      const email = getSessionEmail();
      if (!email) return;
      const cleanEmail = emailKey(email);
      if (wishlistSyncedForRef.current !== cleanEmail) return;
      const ids = wishlistIds(itemsToPush);
      if (ids === wishlistSyncedIdsRef.current) return;
      await saveDoc(COLLECTIONS.profiles, cleanEmail, {
        email: cleanEmail,
        wishlist: itemsToPush,
      });
      wishlistSyncedIdsRef.current = ids;
      const saved = new Set(ids.split(','));
      wishlistPendingRef.current.forEach((product, id) => {
        if (Boolean(product) === saved.has(id)) wishlistPendingRef.current.delete(id);
      });
    } catch (e) {
      console.warn('Database wishlist push notice:', e);
    }
  };

  // Pull / Restore & Auto-Merge Wishlist from the customer's database profile
  const pullWishlistFromDb = async () => {
    try {
      const email = getSessionEmail();
      if (email) {
        const cleanEmail = emailKey(email);
        const profData = await getDocById(COLLECTIONS.profiles, cleanEmail);
        const remoteWishlist = profData && Array.isArray(profData.wishlist)
          ? (profData.wishlist as Product[]).filter((item) => item && item.id)
          : null;
        const local = wishlistRef.current || [];

        let owner: string | null = null;
        try { owner = localStorage.getItem('sag_wishlist_owner'); } catch {}
        const alreadyOwned = owner === cleanEmail;
        try { localStorage.setItem('sag_wishlist_owner', cleanEmail); } catch {}
        let base: Product[];
        if (!remoteWishlist) {
          base = local;
        } else if (alreadyOwned) {
          // This device already mirrors the account: the saved list wins, so removals on other devices stick
          base = remoteWishlist;
        } else {
          // First sign-in on this device: keep favourites saved while browsing as a guest
          base = [...remoteWishlist, ...local];
        }
        const map = new Map<string, Product>();
        base.forEach((item) => map.set(String(item.id), item));
        wishlistPendingRef.current.forEach((product, id) => (product ? map.set(id, product) : map.delete(id)));
        const next = Array.from(map.values());

        wishlistSyncedForRef.current = cleanEmail;
        wishlistSyncedIdsRef.current = remoteWishlist ? wishlistIds(remoteWishlist) : '';
        wishlistRef.current = next;
        setWishlist(next);
        try {
          localStorage.setItem('sag_wishlist_v1', JSON.stringify(next));
        } catch {}
        await pushWishlistToDb(next);
      }
    } catch (e) {
      console.warn('Database wishlist pull notice:', e);
    }
  };

  // Multi-tier storage persistence (v1 + backup + sessionStorage) + BroadcastChannel API
  useEffect(() => {
    try {
      const serialized = JSON.stringify(cart);
      localStorage.setItem('sag_cart_v1', serialized);
      localStorage.setItem('sag_cart_backup', serialized);
      sessionStorage.setItem('sag_cart_session', serialized);
    } catch (e) {
      console.error('Cart sync storage error:', e);
    }

    // Instant cross-tab broadcast via BroadcastChannel API
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('sag_cart_broadcast_channel');
        channel.postMessage({ type: 'SAG_CART_UPDATED', cart, timestamp: Date.now() });
        channel.close();
      } catch (bcErr) {
        console.warn('BroadcastChannel post error:', bcErr);
      }
    }

    // Debounced Push to the customer's database profile
    const timer = setTimeout(() => {
      pushCartToDb(cart);
    }, 400);

    return () => clearTimeout(timer);
  }, [cart]);

  // Cross-Tab, Navigation, App-Switching, and Visibility Protection with BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // BroadcastChannel listener for sub-millisecond instant cross-tab cart sync
    let bcChannel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        bcChannel = new BroadcastChannel('sag_cart_broadcast_channel');
        bcChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'SAG_CART_UPDATED' && Array.isArray(event.data.cart)) {
            const currentStr = JSON.stringify(cartRef.current);
            const incomingStr = JSON.stringify(event.data.cart);
            if (currentStr !== incomingStr) {
              setCart(event.data.cart);
            }
          }
        };
      } catch (bcErr) {
        console.warn('BroadcastChannel listener notice:', bcErr);
      }
    }

    // Fallback Cross-tab storage event listener
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sag_cart_v1' || e.key === 'sag_cart_backup') {
        try {
          if (e.newValue) {
            const newCart = JSON.parse(e.newValue);
            if (Array.isArray(newCart)) {
              const currentStr = JSON.stringify(cartRef.current);
              const incomingStr = JSON.stringify(newCart);
              if (currentStr !== incomingStr) {
                setCart(newCart);
              }
            }
          }
        } catch (err) {
          console.error('Cross-tab cart sync error:', err);
        }
      }
    };

    // App switching & backgrounding: write cart & wishlist immediately on hide/unload
    const handleSaveOnBackground = () => {
      try {
        const serialized = JSON.stringify(cartRef.current);
        localStorage.setItem('sag_cart_v1', serialized);
        localStorage.setItem('sag_cart_backup', serialized);
        sessionStorage.setItem('sag_cart_session', serialized);
        pushCartToDb(cartRef.current);

        const serializedWishlist = JSON.stringify(wishlistRef.current);
        localStorage.setItem('sag_wishlist_v1', serializedWishlist);
        pushWishlistToDb(wishlistRef.current);
      } catch {}
      // Coming back to a tab left open: pick up wishlist changes made on other devices
      if (document.visibilityState === 'visible') pullWishlistFromDb();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('visibilitychange', handleSaveOnBackground);
    window.addEventListener('pagehide', handleSaveOnBackground);
    window.addEventListener('beforeunload', handleSaveOnBackground);

    return () => {
      if (bcChannel) {
        try { bcChannel.close(); } catch {}
      }
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('visibilitychange', handleSaveOnBackground);
      window.removeEventListener('pagehide', handleSaveOnBackground);
      window.removeEventListener('beforeunload', handleSaveOnBackground);
    };
  }, []);

  // Sync database cart & wishlist state on mount & auth state changes (with auto-merge)
  useEffect(() => {
    pullCartFromDb();
    pullWishlistFromDb();

    // Firebase Auth customer sign-in (the admin's Firebase session is ignored)
    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser && fbUser.uid.startsWith('c_')) {
        pullCartFromDb();
        pullWishlistFromDb();
      }
    });

    const handleAuthEvent = () => {
      pullCartFromDb();
      pullWishlistFromDb();
    };
    window.addEventListener('sag-auth-state-change', handleAuthEvent);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('sag-auth-state-change', handleAuthEvent);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sag_wishlist_v1', JSON.stringify(wishlist));
    } catch (e) {
      console.error(e);
    }

    const timer = setTimeout(() => {
      pushWishlistToDb(wishlist);
    }, 400);

    return () => clearTimeout(timer);
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem('sag_orders_v1', JSON.stringify(recentOrders));
    } catch (e) {
      console.error(e);
    }
  }, [recentOrders]);

  // Visitor analytics session recorded once on mount / page change (handled by LiveVisitorTracker & visitorTracker)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname || '/';
      recordHeartbeat(path);
    }
  }, [activePage]);

  // Helper to extract clean 10-digit Indian phone
  const cleanPhone = (phone?: string): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };

  const addRecentOrder = (order: Order) => {
    setRecentOrders((prev) => {
      const updated = [order, ...prev.filter((o) => o.orderNumber !== order.orderNumber)];
      try {
        localStorage.setItem('sag_orders_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    try {
      const guestOrders = JSON.parse(localStorage.getItem('sag_guest_orders') || '[]');
      const updatedGuest = [order, ...guestOrders.filter((o: any) => o.orderNumber !== order.orderNumber)];
      localStorage.setItem('sag_guest_orders', JSON.stringify(updatedGuest));
      if (order.customerEmail) localStorage.setItem('sag_last_guest_email', order.customerEmail.toLowerCase().trim());
      if (order.customerMobile) localStorage.setItem('sag_last_guest_phone', order.customerMobile.trim());
    } catch {}
  };


  const syncCustomerOrders = async (_identifier?: string | { email?: string; phone?: string }) => {
    if (getSessionEmail()) {
      try {
        const result = await ordersApi<{ orders: Order[] }>('my-orders');
        setRecentOrders(result.orders || []);
      } catch (e) {
        console.warn('Could not load your orders:', e);
      }
      return;
    }
    try {
      const guest = JSON.parse(localStorage.getItem('sag_guest_orders') || '[]');
      setRecentOrders(Array.isArray(guest) ? guest : []);
    } catch {
      setRecentOrders([]);
    }
  };

  useEffect(() => {
    syncCustomerOrders();
    const handleAuthEvent = () => syncCustomerOrders();
    const handleLogout = () => {
      cartRef.current = [];
      cartSyncedForRef.current = '';
      cartSyncedJsonRef.current = null;
      cartTouchedRef.current = false;
      wishlistRef.current = [];
      wishlistSyncedForRef.current = '';
      wishlistSyncedIdsRef.current = null;
      wishlistPendingRef.current.clear();
      setCart([]);
      setWishlist([]);
      setRecentOrders([]);
      setAppliedCoupon(null);
    };
    window.addEventListener('sag-auth-state-change', handleAuthEvent);
    window.addEventListener('sag-customer-logout', handleLogout);
    return () => {
      window.removeEventListener('sag-auth-state-change', handleAuthEvent);
      window.removeEventListener('sag-customer-logout', handleLogout);
    };
  }, []);

  // Keep bag lines in step with the live catalogue: current price, name, image and stock.
  // Accessories added from "Complete the look" are real bag lines too, so they are looked up as well.
  useEffect(() => {
    if (isLoading || published.length === 0) return;
    setCart((prev) => {
      let changed = false;
      const removed: string[] = [];
      const next = prev.flatMap((item) => {
        const live = published.find((p) => String(p.id) === String(item.product?.id));
        if (!live) {
          changed = true;
          removed.push(item.product?.name || 'An item');
          return [];
        }
        const stock = Math.max(0, Number(live.stockQuantity ?? 0));
        const cap = Math.min(MAX_QTY_PER_ITEM, stock > 0 ? stock : MAX_QTY_PER_ITEM);
        const quantity = Math.min(item.quantity, cap);
        if (live.price !== item.product.price || live.name !== item.product.name || live.stockQuantity !== item.product.stockQuantity || live.inStock !== item.product.inStock || quantity !== item.quantity) {
          changed = true;
          return [{ ...item, product: live, quantity }];
        }
        return [item];
      });
      if (removed.length) setTimeout(() => showToast(`${removed.join(', ')} is no longer available and was removed from your bag.`, 'info'), 0);
      return changed ? next : prev;
    });
  }, [published, isLoading]);

  // Accessories stay only with their outfit: removing (or lowering) the outfit takes its accessories with it
  useEffect(() => {
    const { cart: fixed, removed } = enforceLooks(cart);
    if (fixed === cart) return;
    setCartByShopper(fixed);
    if (removed.length) {
      const names = [...new Set(removed)].join(', ');
      setTimeout(() => showToast(`${names} ${removed.length === 1 ? 'was' : 'were'} removed: accessories are sold only with their outfit.`, 'info'), 0);
    }
  }, [cart]);

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Add to Cart with size validation & quiet sync response (openDrawer defaults to false)
  const addToCart = (
    product: Product,
    size: ProductSize,
    color?: ProductColor,
    quantity: number = 1,
    openDrawer: boolean = false
  ) => {
    // Bags, heels and jewellery are sold only with their outfit, from "Complete the look" (addLookToBag)
    if (isAccessory(product)) {
      showToast('This accessory is available only with its outfit, in Complete the look.', 'info');
      return;
    }
    const chosenSize = size || (product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'M');
    const chosenColor = color || (product.colors && product.colors.length > 0 ? product.colors[0] : { name: 'Standard', hex: '#241D1B' });

    const itemId = `${product.id}-${chosenSize}-${chosenColor.name.replace(/\s+/g, '-').toLowerCase()}`;

    const cap = qtyCapFor(product);
    setCartByShopper((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId ? { ...item, quantity: Math.min(cap, item.quantity + quantity) } : item
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          product,
          selectedSize: chosenSize,
          selectedColor: chosenColor,
          quantity: Math.min(cap, quantity),
        },
      ];
    });

    if (openDrawer) {
      setIsCartDrawerOpen(true);
    }

    trackFunnelEvent('add_to_cart');
    showToast(`Added "${product.name}" (${chosenSize}) to your bag! 🛍️`, 'success');
  };

  // "Complete the look": the outfit (unless it is already in the bag) plus the chosen accessories, each linked to it
  const addLookToBag = (
    outfit: Product,
    outfitSize: ProductSize,
    outfitColor: ProductColor | undefined,
    outfitQty: number,
    picks: Array<{ product: Product; size: ProductSize; color?: ProductColor }>,
  ) => {
    if (isAccessory(outfit)) return false;
    const parentId = String(outfit.id);
    const current = cartRef.current || [];
    const colorOf = (p: Product, c?: ProductColor) => c || (p.colors && p.colors.length > 0 ? p.colors[0] : { name: 'Standard', hex: '#241D1B' });
    const outfitColour = colorOf(outfit, outfitColor);
    const outfitLineId = `${outfit.id}-${outfitSize}-${outfitColour.name.replace(/\s+/g, '-').toLowerCase()}`;
    const needsOutfit = outfitQtyIn(current, parentId) === 0;
    const newPicks = picks.filter((pick) => isAccessory(pick.product) && !current.some((item) => item.id === lookLineId(pick.product, pick.size, colorOf(pick.product, pick.color), parentId)));
    if (newPicks.length === 0 && !needsOutfit) return false;
    if (current.length + newPicks.length + (needsOutfit ? 1 : 0) > MAX_BAG_LINES) {
      showToast(`One order can hold up to ${MAX_BAG_LINES} different items. Remove a few from your bag first.`, 'error');
      return false;
    }
    setCartByShopper((prev) => {
      const next = [...prev];
      if (outfitQtyIn(next, parentId) === 0) {
        next.push({ id: outfitLineId, product: outfit, selectedSize: outfitSize, selectedColor: outfitColour, quantity: Math.min(qtyCapFor(outfit), Math.max(1, outfitQty)) });
      }
      newPicks.forEach((pick) => {
        const colour = colorOf(pick.product, pick.color);
        const id = lookLineId(pick.product, pick.size, colour, parentId);
        if (!next.some((item) => item.id === id)) {
          next.push({ id, product: pick.product, selectedSize: pick.size, selectedColor: colour, quantity: 1, lookParentId: parentId });
        }
      });
      return next;
    });
    trackFunnelEvent('add_to_cart');
    const count = newPicks.length;
    showToast(needsOutfit
      ? `Added your complete look: ${outfit.name}${count ? ` + ${count} ${count === 1 ? 'accessory' : 'accessories'}` : ''}.`
      : `Added ${count} ${count === 1 ? 'accessory' : 'accessories'} to your ${outfit.name} look.`, 'success');
    setIsCartDrawerOpen(true);
    return true;
  };

  // Buy Now: adds to cart and immediately routes straight to checkout
  const buyNow = (
    product: Product,
    size: ProductSize = 'M',
    color?: ProductColor,
    quantity: number = 1
  ) => {
    const selectedColor = color || (product.colors && product.colors.length > 0 ? product.colors[0] : { name: 'Standard', hex: '#241D1B' });
    const chosenSize = size || (product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'M');

    // Add product to cart
    const itemId = `${product.id}-${chosenSize}-${selectedColor.name.replace(/\s+/g, '-').toLowerCase()}`;
    const cap = qtyCapFor(product);
    setCartByShopper((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        // Buy now means exactly the quantity chosen on the product page, not added on top of the bag
        return prev.map((item) =>
          item.id === itemId ? { ...item, product, quantity: Math.min(cap, quantity) } : item
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          product,
          selectedSize: chosenSize,
          selectedColor,
          quantity: Math.min(cap, quantity),
        },
      ];
    });

    // Track funnel
    trackFunnelEvent('add_to_cart');
    trackFunnelEvent('checkout_initiated');

    // Navigate to checkout directly
    setActivePage('checkout');
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeFromCart = (itemId: string) => {
    setCartByShopper((prev) => prev.filter((item) => item.id !== itemId));
    showToast('Item removed from shopping bag.', 'info');
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCartByShopper((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const cap = qtyCapFor(item.product);
        if (quantity > cap) showToast(`Only ${cap} piece${cap === 1 ? '' : 's'} available for this item.`, 'info');
        return { ...item, quantity: Math.min(cap, quantity) };
      })
    );
  };

  const updateCartItem = (itemId: string, updates: { size?: ProductSize; color?: ProductColor }) => {
    setCartByShopper((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            selectedSize: updates.size || item.selectedSize,
            selectedColor: updates.color || item.selectedColor,
          };
        }
        return item;
      })
    );
    showToast('Item updated successfully.', 'success');
  };

  const clearCart = () => {
    setCartByShopper([]);
    try {
      localStorage.removeItem('sag_cart_v1');
      localStorage.removeItem('sag_cart_backup');
      sessionStorage.removeItem('sag_cart_session');
    } catch (e) {
      console.error(e);
    }
    pushCartToDb([]);
  };

  // Wishlist Actions
  const toggleWishlist = (product: Product) => {
    if (isAccessory(product)) return; // accessories are only part of a complete look
    const exists = wishlist.some((item) => item.id === product.id);
    wishlistPendingRef.current.set(String(product.id), exists ? null : product);
    if (exists) {
      setWishlist((prev) => prev.filter((item) => item.id !== product.id));
      showToast(`Removed "${product.name}" from Wishlist.`, 'info');
    } else {
      setWishlist((prev) => [...prev, product]);
      trackItem('wishlist_add', String(product.id));
      showToast(`Added "${product.name}" to your Wishlist!`, 'success');
    }
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some((item) => item.id === productId);
  };

  const moveToCartFromWishlist = (product: Product, size: ProductSize = 'M') => {
    addToCart(product, size, product.colors[0] || { name: 'Default', hex: '#241D1B' }, 1);
    wishlistPendingRef.current.set(String(product.id), null);
    setWishlist((prev) => prev.filter((item) => item.id !== product.id));
  };

  // Coupon Logic
  const applyCoupon = async (code: string): Promise<boolean> => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return false;
    try {
      const result = await ordersApi<{ coupon: Coupon }>('check-coupon', { couponCode: cleanCode, subtotal: cartSubtotal });
      // Category / product limits and the per-customer limit come from the shop's coupon list
      // (the server enforces them again when the order is priced).
      const listed = coupons.find((c) => c.code.trim().toUpperCase() === String(result.coupon.code).toUpperCase());
      const next: Coupon = {
        ...result.coupon,
        startDate: '',
        expiryDate: '',
        usageLimit: 0,
        usageCount: 0,
        isActive: true,
        perUserLimit: listed?.perUserLimit || 0,
        allowedCategories: listed?.allowedCategories || [],
        allowedProductIds: listed?.allowedProductIds || [],
      };
      if (isCouponRestricted(next) && couponEligibleSubtotal(next, cart) <= 0) {
        showToast(`${next.code}: ${couponRestrictionNotes(next)[0] || 'not valid on the items in your bag'}. Add an eligible item to use it.`, 'error');
        return false;
      }
      setAppliedCoupon(next);
      showToast(`Coupon ${result.coupon.code} applied.`, 'success');
      return true;
    } catch (error: any) {
      showToast(error?.message || 'This coupon code is not valid.', 'error');
      return false;
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon removed.', 'info');
  };

  // Navigation Helpers
  const navigateToProduct = (productOrId: string | Product) => withPageTransition(() => {
    // Accessories have no page of their own; they are shown only in their outfit's "Complete the look"
    const target = typeof productOrId === 'object' && productOrId !== null ? productOrId : published.find((p) => String(p.id) === String(productOrId));
    if (target && isAccessory(target)) return;
    let pId: string;
    if (typeof productOrId === 'object' && productOrId !== null) {
      pId = productOrId.id;
      setSelectedProduct(productOrId);
    } else {
      pId = String(productOrId);
      const found = published.find(p => String(p.id) === pId);
      if (found) {
        setSelectedProduct(found);
      }
    }
    setSelectedProductId(pId);
    setActivePage('product-detail');
    navigate(`/product/${pId}`);
    window.scrollTo(0, 0);
  });

  const navigateToCategory = (
    category: ProductCategory | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending' | 'All'
  ) => withPageTransition(() => {
    setSelectedCategory(category);
    setActivePage('shop');
    if (category === 'All') {
      navigate('/shop');
    } else {
      const slug = categoryToSlug(category);
      navigate(`/category/${slug}`);
    }
    window.scrollTo(0, 0);
  });

  const navigateToPage = (page: ActivePage) => {
    const paths: Partial<Record<ActivePage, string>> = {
      home: '/',
      shop: '/shop',
      'product-detail': selectedProductId ? `/?product=${selectedProductId}` : '/shop',
      cart: '/cart',
      checkout: '/checkout',
      'order-confirmation': '/order-confirmation',
      wishlist: '/wishlist',
      about: '/about',
      contact: '/contact',
      'size-guide': '/size-guide',
      'track-order': '/track-order',
      'shipping-policy': '/shipping-policy',
      'return-policy': '/return-policy',
      'privacy-policy': '/privacy-policy',
      'terms-policy': '/terms-policy',
      'terms-conditions': '/terms-policy',
      'cancellation-policy': '/cancellation-policy',
      'account': '/account',
      'login': '/login',
    };
    setActivePage(page);
    if (paths[page]) navigate(paths[page]);
  };

  // Cart Metrics
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  const [storeShippingSettings, setStoreShippingSettings] = useState({ shippingCharge: 0, freeShippingThreshold: 0, prepaidDiscount: 0, prepaidPercent: 0, prepaidMinPrice: 0 });
  const [couponsEnabled, setCouponsEnabled] = useState(true);
  useEffect(() => {
    const apply = (value: any) => {
      setStoreShippingSettings({
        shippingCharge: Math.max(0, Number(value?.shippingCharge) || 0),
        freeShippingThreshold: Math.max(0, Number(value?.freeShippingThreshold) || 0),
        ...prepaidRulesFrom(value),
      });
      setCouponsEnabled(value?.couponsEnabled !== false);
    };
    return fromCatalogOrLive(
      (catalog) => apply(catalog.settings.storeSettings || {}),
      () => onSnapshot(fsDoc(db, 'storefront_settings', 'storeSettings'), (snapshot) => {
        try {
          apply(snapshot.exists() ? JSON.parse(snapshot.data().value_json || '{}') : {});
        } catch {}
      }, () => {}),
    );
  }, []);

  const [comboOffer, setComboOffer] = useState<ComboOfferConfig | null>(null);
  useEffect(() => {
    const apply = (value: any) => setComboOffer(value && value.enabled && Number(value.percent) > 0 ? {
      enabled: true,
      percent: Math.min(50, Number(value.percent) || 0),
      minItems: Math.max(2, Number(value.minItems) || 2),
      title: value.title || '',
      subtitle: value.subtitle || '',
    } : null);
    return fromCatalogOrLive(
      (catalog) => apply(catalog.settings.comboOffer || null),
      () => onSnapshot(fsDoc(db, 'storefront_settings', 'comboOffer'), (snapshot) => {
        try {
          apply(snapshot.exists() ? JSON.parse(snapshot.data().value_json || 'null') : null);
        } catch {
          setComboOffer(null);
        }
      }, () => setComboOffer(null)),
    );
  }, []);
  // Only outfit pieces unlock the combo offer (same rule as the server); the percentage comes off the whole subtotal.
  const comboPieces = comboPiecesIn(cart);
  const comboDiscount = comboOffer && comboPieces >= comboOffer.minItems ? Math.round((cartSubtotal * comboOffer.percent) / 100) : 0;
  const afterComboSubtotal = cartSubtotal - comboDiscount;

  const freeShippingThreshold = storeShippingSettings.freeShippingThreshold;
  const standardShippingCharge = storeShippingSettings.shippingCharge;
  const shippingFee = (freeShippingThreshold > 0 && cartSubtotal >= freeShippingThreshold) || standardShippingCharge === 0
    ? 0
    : standardShippingCharge;

  // Dynamic Discount Calculation
  let discountAmount = 0;
  // A category / product-limited coupon applies only to its lines' share of the post-combo amount (same as the server)
  const couponEligible = appliedCoupon ? Math.min(cartSubtotal, couponEligibleSubtotal(appliedCoupon, cart)) : 0;
  const couponBase = appliedCoupon && couponEligible < cartSubtotal && cartSubtotal > 0
    ? Math.round((afterComboSubtotal * couponEligible) / cartSubtotal)
    : afterComboSubtotal;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') {
      discountAmount = Math.round((couponBase * appliedCoupon.discountValue) / 100);
      if (appliedCoupon.maxDiscount && discountAmount > appliedCoupon.maxDiscount) {
        discountAmount = appliedCoupon.maxDiscount;
      }
    } else {
      // Fixed / Flat Discount
      discountAmount = appliedCoupon.discountValue;
    }
  }

  discountAmount = Math.min(discountAmount, couponBase, afterComboSubtotal);
  const cartTotal = Math.max(0, afterComboSubtotal - discountAmount + (cart.length > 0 ? shippingFee : 0));
  // Online payment discount (flat + percent on products above the owner's minimum): same formula as the server
  const prepaidDiscount = cart.length > 0
    ? prepaidDiscountFor(storeShippingSettings, cart.map((item) => ({ price: item.product.price, quantity: item.quantity })), Math.max(0, afterComboSubtotal - discountAmount))
    : 0;

  // Drop a coupon whose minimum order is no longer met (the server would reject it anyway).
  useEffect(() => {
    if (appliedCoupon && (cart.length === 0 || cartSubtotal < (appliedCoupon.minOrderValue || 0))) {
      setAppliedCoupon(null);
      if (cart.length > 0) showToast(`Coupon ${appliedCoupon.code} removed: minimum order is ₹${appliedCoupon.minOrderValue.toLocaleString('en-IN')}.`, 'info');
    } else if (appliedCoupon && isCouponRestricted(appliedCoupon) && couponEligible <= 0) {
      // No eligible item left in the bag for a category / product-limited coupon
      setAppliedCoupon(null);
      showToast(`Coupon ${appliedCoupon.code} removed: ${(couponRestrictionNotes(appliedCoupon)[0] || 'no eligible items in your bag').replace(/^V/, 'v')}.`, 'info');
    }
  }, [cartSubtotal, cart.length, appliedCoupon, couponEligible]);

  return (
    <ShopContext.Provider
      value={{
        products,
        allProducts,
        accessories,
        isLoading,
        getProductById,
        cart,
        wishlist,
        activePage,
        syncActivePage: setActivePage,
        setActivePage: (p) => withPageTransition(() => {
          navigateToPage(p);
        }),
        selectedCategory,
        setSelectedCategory,
        selectedProductId,
        setSelectedProductId,
        selectedProduct,
        setSelectedProduct,
        quickViewProduct,
        setQuickViewProduct,
        searchQuery,
        setSearchQuery,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        isCouponDrawerOpen,
        setIsCouponDrawerOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        isSearchOpen,
        setIsSearchOpen,
        isSizeGuideOpen,
        setIsSizeGuideOpen,
        confirmedOrder,
        setConfirmedOrder,
        recentOrders,
        addRecentOrder,
        syncCustomerOrders,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        toast,
        showToast,
        addToCart,
        addLookToBag,
        buyNow,
        removeFromCart,
        updateCartQuantity,
        updateCartItem,
        clearCart,
        toggleWishlist,
        isInWishlist,
        moveToCartFromWishlist,
        cartCount,
        cartSubtotal,
        shippingFee,
        discountAmount,
        cartTotal,
        prepaidDiscount,
        comboDiscount,
        comboOffer,
        comboPieces,
        freeShippingThreshold,
        storeOffers: storeShippingSettings,
        maxQtyPerItem: MAX_QTY_PER_ITEM,
        navigateToProduct,
        navigateToCategory,
        trackOrderNumber,
        setTrackOrderNumber,
        isLoginPageLogin,
        setIsLoginPageLogin,
        userDeliveryLocation,
        setUserDeliveryLocation,
        isPincodeModalOpen,
        setIsPincodeModalOpen,
        mergeGuestCartOnAuth,
        // The owner can switch coupons off (Admin → Settings → Checkout): then none are listed anywhere
        coupons: couponsEnabled ? coupons : NO_COUPONS
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
