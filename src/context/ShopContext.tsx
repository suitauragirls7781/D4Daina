import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Product, 
  CartItem, 
  ProductSize, 
  ProductColor, 
  Order, 
  ActivePage, 
  ProductCategory,
  Coupon 
} from '../types';
import { useProducts } from './ProductContext';
import { useRouter } from './RouterContext';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { ADMIN_UID, COLLECTIONS, emailKey, getDocById, listDocs, listDocsWhere, saveDoc } from '../lib/dataStore';
import { mapCouponFromDb, mapOrderFromDb } from './AdminContext';
import { recordHeartbeat, trackFunnelEvent } from '../utils/visitorTracker';
import { categoryToSlug, slugToCategory } from '../utils/slugHelper';

export const DEFAULT_COUPONS: Coupon[] = [
  {
    id: 'c1',
    code: 'AURA10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 0,
    maxDiscount: 500,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    usageCount: 42,
    isActive: true
  },
  {
    id: 'c2',
    code: 'FESTIVE15',
    discountType: 'percentage',
    discountValue: 15,
    minOrderValue: 1200,
    maxDiscount: 1000,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    usageCount: 88,
    isActive: true
  },
  {
    id: 'c3',
    code: 'ROYAL200',
    discountType: 'fixed',
    discountValue: 200,
    minOrderValue: 1500,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 500,
    usageCount: 19,
    isActive: true
  },
  {
    id: 'c4',
    code: 'BLISS500',
    discountType: 'fixed',
    discountValue: 500,
    minOrderValue: 2999,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 500,
    usageCount: 14,
    isActive: true
  },
  {
    id: 'c5',
    code: 'FIRSTSUIT',
    discountType: 'fixed',
    discountValue: 150,
    minOrderValue: 699,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    usageCount: 65,
    isActive: true
  },
  {
    id: 'c6',
    code: 'ARTISAN12',
    discountType: 'percentage',
    discountValue: 12,
    minOrderValue: 899,
    maxDiscount: 600,
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    usageCount: 31,
    isActive: true
  }
];

interface ShopContextType {
  products: Product[];
  allProducts: Product[];
  isLoading: boolean;
  getProductById: (id: string | null | undefined) => Product | undefined;
  cart: CartItem[];
  wishlist: Product[];
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
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
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  toast: { message: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  addToCart: (product: Product, size: ProductSize, color?: ProductColor, quantity?: number, openDrawer?: boolean) => void;
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
  const { products, allProducts,
        isLoading, getProductById } = useProducts();
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Always keep selectedProduct in sync with the live products state
  useEffect(() => {
    if (selectedProductId && products.length > 0) {
      const fresh = products.find((p) => String(p.id) === String(selectedProductId));
      if (fresh) {
        setSelectedProduct(fresh);
      }
    }
  }, [products, selectedProductId]);
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
  const [coupons, setCoupons] = useState<Coupon[]>(DEFAULT_COUPONS);

  // Fetch Coupons from the database and merge with DEFAULT_COUPONS
  const fetchCoupons = async () => {
    try {
      const data = await listDocs(COLLECTIONS.coupons);

      if (data && data.length > 0) {
        const mappedCoupons: Coupon[] = data
          .map(mapCouponFromDb)
          .filter(coupon => coupon.isActive)
          .sort((a, b) => String(b.id).localeCompare(String(a.id)));
        
        // Always preserve DEFAULT_COUPONS so users can access all 6 curated coupons!
        const existingCodes = new Set(mappedCoupons.map(c => c.code.toUpperCase()));
        const missingDefaults = DEFAULT_COUPONS.filter(dc => !existingCodes.has(dc.code.toUpperCase()));
        setCoupons([...mappedCoupons, ...missingDefaults]);
      } else {
        setCoupons(DEFAULT_COUPONS);
      }
    } catch (e) {
      console.warn('Error fetching shop coupons, falling back to defaults:', e);
      setCoupons(DEFAULT_COUPONS);
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
    const localUser = localStorage.getItem('sag_custom_user');
    if (localUser) {
      try {
        const parsed = JSON.parse(localUser);
        if (parsed.email) return parsed.email;
      } catch {}
    }
    const fbUser = auth.currentUser;
    if (fbUser && fbUser.uid !== ADMIN_UID && fbUser.email) {
      return fbUser.email;
    }
    return null;
  };

  // Push Cart to the customer's database profile
  const pushCartToDb = async (itemsToPush: CartItem[]) => {
    try {
      const email = getSessionEmail();
      if (email) {
        const cleanEmail = emailKey(email);
        await saveDoc(COLLECTIONS.profiles, cleanEmail, {
          email: cleanEmail,
          cart: itemsToPush,
        });
      }
    } catch (e) {
      console.warn('Database cart push notice:', e);
    }
  };

  // Background cart merging script executed when guest authenticates into an active account
  const mergeGuestCartOnAuth = async (targetEmail?: string) => {
    try {
      const email: string | null = targetEmail || getSessionEmail();
      if (!email) return;

      const cleanEmail = emailKey(email);

      // Read guest cart snapshot prior to merge
      let guestItems: CartItem[] = [];
      try {
        const savedGuestCart = localStorage.getItem('sag_cart_v1');
        if (savedGuestCart) {
          const parsed = JSON.parse(savedGuestCart);
          if (Array.isArray(parsed)) {
            guestItems = parsed;
          }
        }
      } catch {}

      if (guestItems.length === 0) {
        guestItems = cart;
      }

      // Fetch user's active account cart from the database profile
      const profData = await getDocById(COLLECTIONS.profiles, cleanEmail);

      let remoteCart: CartItem[] = [];
      if (profData && Array.isArray(profData.cart)) {
        remoteCart = profData.cart as CartItem[];
      }

      if (guestItems.length > 0) {
        const mergedMap = new Map<string, CartItem>();

        // 1. Populate remote account cart items
        remoteCart.forEach((item) => {
          const key = item.id || `${item.product.id}_${item.selectedSize}_${item.selectedColor?.name || ''}`;
          mergedMap.set(key, { ...item });
        });

        let addedCount = 0;
        let quantityUpdatesCount = 0;

        // 2. Merge guest items into map
        guestItems.forEach((guestItem) => {
          const key = guestItem.id || `${guestItem.product.id}_${guestItem.selectedSize}_${guestItem.selectedColor?.name || ''}`;
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key)!;
            mergedMap.set(key, {
              ...existing,
              quantity: existing.quantity + guestItem.quantity,
            });
            quantityUpdatesCount++;
          } else {
            mergedMap.set(key, { ...guestItem });
            addedCount++;
          }
        });

        const mergedCart = Array.from(mergedMap.values());

        // 3. Update active cart state & local storage
        setCart(mergedCart);
        try {
          localStorage.setItem('sag_cart_v1', JSON.stringify(mergedCart));
          localStorage.setItem('sag_cart_backup', JSON.stringify(mergedCart));
        } catch {}

        // 4. Sync merged cart back to remote account profile
        await pushCartToDb(mergedCart);

        // 5. Silent sync complete
        if (addedCount > 0 || quantityUpdatesCount > 0) {
          console.log(`Cart synced: ${mergedCart.length} item(s) active.`);
        }
      } else if (remoteCart.length > 0) {
        setCart(remoteCart);
        try {
          localStorage.setItem('sag_cart_v1', JSON.stringify(remoteCart));
        } catch {}
      }
    } catch (e) {
      console.warn('Background cart merge notice:', e);
    }
  };

  // Pull / Restore Cart from the customer's database profile
  const pullCartFromDb = async () => {
    await mergeGuestCartOnAuth();
  };

  // Push Wishlist to the customer's database profile
  const pushWishlistToDb = async (itemsToPush: Product[]) => {
    try {
      const email = getSessionEmail();
      if (email) {
        const cleanEmail = emailKey(email);
        await saveDoc(COLLECTIONS.profiles, cleanEmail, {
          email: cleanEmail,
          wishlist: itemsToPush,
        });
      }
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

        if (profData && Array.isArray(profData.wishlist)) {
          const remoteWishlist = profData.wishlist as Product[];
          setWishlist((prevGuestWishlist) => {
            const map = new Map<string, Product>();
            // First add remote wishlist items from profile
            remoteWishlist.forEach((item) => {
              if (item && item.id) map.set(String(item.id), item);
            });
            // Auto-merge guest local items so non-logged-in guest favorites are preserved & merged!
            prevGuestWishlist.forEach((item) => {
              if (item && item.id) map.set(String(item.id), item);
            });
            const mergedWishlist = Array.from(map.values());

            try {
              localStorage.setItem('sag_wishlist_v1', JSON.stringify(mergedWishlist));
            } catch {}

            pushWishlistToDb(mergedWishlist);
            return mergedWishlist;
          });
        } else {
          // If profile has no remote wishlist data yet, push the guest wishlist to profile!
          if (wishlistRef.current && wishlistRef.current.length > 0) {
            pushWishlistToDb(wishlistRef.current);
          }
        }
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
      if (fbUser && fbUser.uid !== ADMIN_UID) {
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

  // One-time local storage purge to clear legacy test data
  useEffect(() => {
    const purgeOldTestData = async () => {
      try {
        const isPurged = localStorage.getItem('sag_v2_data_purged_final');
        if (!isPurged) {
          console.log('Purging legacy test data from local storage...');
          localStorage.clear();
          sessionStorage.clear();
          localStorage.setItem('sag_v2_data_purged_final', 'true');
        }
      } catch (e) {
        console.warn('Purge test data notice:', e);
      }
    };
    purgeOldTestData();
  }, []);

  // Retroactive Order Mapping: Query the database + Local Storage for current authenticated user's exact email/phone
  const syncCustomerOrders = async (identifier?: string | { email?: string; phone?: string }) => {
    try {
      let targetEmail = '';
      if (typeof identifier === 'string' && identifier.trim() && identifier.includes('@')) {
        targetEmail = identifier.trim().toLowerCase();
      } else if (identifier && typeof identifier === 'object' && identifier.email?.trim()) {
        targetEmail = identifier.email.trim().toLowerCase();
      }

      // Check current custom logged-in user
      if (!targetEmail) {
        const localUserStr = localStorage.getItem('sag_custom_user');
        if (localUserStr) {
          try {
            const parsed = JSON.parse(localUserStr);
            if (parsed.email) targetEmail = parsed.email.toLowerCase().trim();
          } catch {}
        }
      }

      // Check Firebase Auth customer session if still empty
      if (!targetEmail) {
        const sessionEmail = getSessionEmail();
        if (sessionEmail) targetEmail = emailKey(sessionEmail);
      }

      // Check last guest email fallback if user recently ordered or logged in
      if (!targetEmail) {
        const guestEmail = localStorage.getItem('sag_last_guest_email');
        if (guestEmail && guestEmail.includes('@')) {
          targetEmail = guestEmail.trim().toLowerCase();
        }
      }

      // IF NO USER EMAIL IS FOUND AT ALL, RETURN EMPTY ORDERS
      if (!targetEmail) {
        setRecentOrders([]);
        return;
      }

      // Read verified phone number saved specifically under this target user's email profile
      let targetPhone = '';
      const userProfStr = localStorage.getItem(`sag_user_profile_${targetEmail}`);
      if (userProfStr) {
        try {
          const p = JSON.parse(userProfStr);
          if (p.phone) targetPhone = cleanPhone(p.phone);
        } catch {}
      }

      const matchedMap = new Map<string, Order>();

      // 1. Read from LocalStorage Order backups
      const localKeys = [
        `sag_user_orders_${targetEmail}`,
        'sag_orders_v1',
        'sag_guest_orders'
      ];
      localKeys.forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((o: Order) => {
                if (o && o.orderNumber) {
                  const oEmail = (o.customerEmail || '').toLowerCase().trim();
                  const oPhone = cleanPhone(o.customerMobile || '');
                  if (
                    oEmail === targetEmail ||
                    (targetPhone && oPhone && oPhone === targetPhone)
                  ) {
                    matchedMap.set(o.orderNumber, o);
                  }
                }
              });
            }
          }
        } catch (e) {}
      });

      // Query database orders by the customer's exact (normalized) email.
      try {
        const ordData = await listDocsWhere(COLLECTIONS.orders, 'customerEmail', emailKey(targetEmail));

        if (ordData && ordData.length > 0) {
          const mappedOrders = ordData.map(mapOrderFromDb);
          mappedOrders.forEach((o) => {
            if (o && o.orderNumber) {
              matchedMap.set(o.orderNumber, o);
            }
          });
        }
      } catch (dbErr) {
        console.warn('Database sync orders notice:', dbErr);
      }

      const userOrders = Array.from(matchedMap.values()).sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );

      setRecentOrders(userOrders);
      try {
        localStorage.setItem(`sag_user_orders_${targetEmail}`, JSON.stringify(userOrders));
        localStorage.setItem('sag_orders_v1', JSON.stringify(userOrders));
      } catch {}
    } catch (e) {
      console.warn('Sync customer orders error:', e);
    }
  };

  useEffect(() => {
    syncCustomerOrders();
    const handleAuthEvent = () => syncCustomerOrders();
    window.addEventListener('sag-auth-state-change', handleAuthEvent);
    return () => window.removeEventListener('sag-auth-state-change', handleAuthEvent);
  }, []);

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
    const chosenSize = size || (product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'M');
    const chosenColor = color || (product.colors && product.colors.length > 0 ? product.colors[0] : { name: 'Standard', hex: '#241D1B' });

    const itemId = `${product.id}-${chosenSize}-${chosenColor.name.replace(/\s+/g, '-').toLowerCase()}`;
    
    setCart((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          product,
          selectedSize: chosenSize,
          selectedColor: chosenColor,
          quantity,
        },
      ];
    });

    if (openDrawer) {
      setIsCartDrawerOpen(true);
    }

    trackFunnelEvent('add_to_cart');
    showToast(`Added "${product.name}" (${chosenSize}) to your bag! 🛍️`, 'success');
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
    setCart((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [
        ...prev,
        {
          id: itemId,
          product,
          selectedSize: chosenSize,
          selectedColor,
          quantity,
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
    setCart((prev) => prev.filter((item) => item.id !== itemId));
    showToast('Item removed from shopping bag.', 'info');
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    );
  };

  const updateCartItem = (itemId: string, updates: { size?: ProductSize; color?: ProductColor }) => {
    setCart((prev) =>
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
    setCart([]);
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
    const exists = wishlist.some((item) => item.id === product.id);
    if (exists) {
      setWishlist((prev) => prev.filter((item) => item.id !== product.id));
      showToast(`Removed "${product.name}" from Wishlist.`, 'info');
    } else {
      setWishlist((prev) => [...prev, product]);
      showToast(`Added "${product.name}" to your Wishlist!`, 'success');
    }
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some((item) => item.id === productId);
  };

  const moveToCartFromWishlist = (product: Product, size: ProductSize = 'M') => {
    addToCart(product, size, product.colors[0] || { name: 'Default', hex: '#241D1B' }, 1);
    setWishlist((prev) => prev.filter((item) => item.id !== product.id));
  };

  // Coupon Logic
  const applyCoupon = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    
    // Find matching coupon in our fetched list or defaults
    let found = coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (!found) {
      found = DEFAULT_COUPONS.find(c => c.code.toUpperCase() === cleanCode);
    }

    if (!found) {
      showToast('Invalid coupon code. Try AURA10, FESTIVE15, ROYAL200, BLISS500, FIRSTSUIT, or ARTISAN12!', 'error');
      return false;
    }

    // Check if active
    if (!found.isActive) {
      showToast('This coupon is currently inactive.', 'error');
      return false;
    }

    // Check Expiry
    const now = new Date();
    const startsAt = new Date(found.startDate);
    if (found.startDate && Number.isFinite(startsAt.getTime()) && now < startsAt) {
      showToast('This coupon is not active yet.', 'error');
      return false;
    }

    const expiry = new Date(found.expiryDate);
    // Set expiry to end of day
    expiry.setHours(23, 59, 59, 999);
    
    if (now > expiry) {
      showToast('This coupon has expired.', 'error');
      return false;
    }

    // Check Min Order Value
    if (cartSubtotal < found.minOrderValue) {
      const diff = found.minOrderValue - cartSubtotal;
      showToast(`Add ₹${diff.toLocaleString('en-IN')} more to unlock coupon ${found.code} (Min Order: ₹${found.minOrderValue.toLocaleString('en-IN')})`, 'error');
      return false;
    }

    // Check Usage Limit
    if (found.usageCount >= found.usageLimit) {
      showToast('Coupon usage limit reached.', 'error');
      return false;
    }

    setAppliedCoupon(found);
    showToast(`🎉 Coupon ${found.code} applied successfully!`, 'success');
    return true;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon removed.', 'info');
  };

  // Navigation Helpers
  const navigateToProduct = (productOrId: string | Product) => {
    let pId: string;
    if (typeof productOrId === 'object' && productOrId !== null) {
      pId = productOrId.id;
      setSelectedProduct(productOrId);
    } else {
      pId = String(productOrId);
      const found = products.find(p => String(p.id) === pId) || allProducts.find(p => String(p.id) === pId);
      if (found) {
        setSelectedProduct(found);
      }
    }
    setSelectedProductId(pId);
    setActivePage('product-detail');
    navigate(`/product/${pId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCategory = (
    category: ProductCategory | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending' | 'All'
  ) => {
    setSelectedCategory(category);
    setActivePage('shop');
    if (category === 'All') {
      navigate('/shop');
    } else {
      const slug = categoryToSlug(category);
      navigate(`/category/${slug}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
  
  // Dynamic Shipping Fee synchronized with Store Settings / AI Storefront Controller
  const [storeShippingSettings, setStoreShippingSettings] = useState<{ shippingCharge: number; freeShippingThreshold: number }>(() => {
    try {
      const saved = localStorage.getItem('sag_store_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          shippingCharge: Number(parsed.shippingCharge) || 0,
          freeShippingThreshold: Number(parsed.freeShippingThreshold) || 0,
        };
      }
    } catch {}
    return { shippingCharge: 0, freeShippingThreshold: 0 };
  });

  useEffect(() => {
    const syncShipping = () => {
      try {
        const saved = localStorage.getItem('sag_store_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setStoreShippingSettings({
            shippingCharge: Number(parsed.shippingCharge) || 0,
            freeShippingThreshold: Number(parsed.freeShippingThreshold) || 0,
          });
        }
      } catch {}
    };
    window.addEventListener('storage', syncShipping);
    window.addEventListener('sag_settings_updated', syncShipping);
    return () => {
      window.removeEventListener('storage', syncShipping);
      window.removeEventListener('sag_settings_updated', syncShipping);
    };
  }, []);

  const freeShippingThreshold = storeShippingSettings.freeShippingThreshold;
  const standardShippingCharge = storeShippingSettings.shippingCharge;
  const shippingFee = (freeShippingThreshold > 0 && cartSubtotal >= freeShippingThreshold) || standardShippingCharge === 0 
    ? 0 
    : standardShippingCharge;

  // Dynamic Discount Calculation
  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') {
      discountAmount = Math.round((cartSubtotal * appliedCoupon.discountValue) / 100);
      if (appliedCoupon.maxDiscount && discountAmount > appliedCoupon.maxDiscount) {
        discountAmount = appliedCoupon.maxDiscount;
      }
    } else {
      // Fixed / Flat Discount
      discountAmount = appliedCoupon.discountValue;
    }
  }

  const cartTotal = Math.max(0, cartSubtotal - discountAmount + (cart.length > 0 ? shippingFee : 0));

  return (
    <ShopContext.Provider
      value={{
        products,
        allProducts,
        isLoading,
        getProductById,
        cart,
        wishlist,
        activePage,
        setActivePage: (p) => {
          navigateToPage(p);
        },
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
        coupons
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
