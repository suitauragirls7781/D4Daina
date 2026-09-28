export type ProductCategory = 
  | 'Suits'
  | 'Kurtis'
  | 'Dresses'
  | 'Dupatta Sets'
  | 'Co-ord Sets'
  | 'Anarkali'
  | 'Festive Wear'
  | 'Party Wear';

export type ProductSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL';

export interface ProductColor {
  name: string;
  hex: string;
  imageUrl?: string;
}

export interface Review {
  id: string;
  productId?: string;
  productName?: string;
  userName: string;
  userEmail?: string;
  rating: number;
  date: string;
  comment: string;
  verifiedPurchase: boolean;
  sizePurchased?: ProductSize;
  location?: string;
  status?: 'approved' | 'pending' | 'hidden';
  adminReply?: string;
  imageUrl?: string;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  image?: string;
  price: number;
  originalPrice: number;
  discount: number; // percentage e.g. 38
  rating: number;
  reviewCount: number;
  images: string[];
  colors: ProductColor[];
  sizes: ProductSize[];
  stockQuantity?: number;
  description: string;
  fabric: string;
  fit: string;
  occasion: string;
  washCare: string;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  isFestive?: boolean;
  isSale?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  inStock: boolean;
  reviews?: Review[];
  videoUrl?: string;
}

export interface CartItem {
  id: string; // unique item id combining product.id + size + color
  product: Product;
  selectedSize: ProductSize;
  selectedColor: ProductColor;
  quantity: number;
}

export interface WishlistItem {
  product: Product;
  addedAt: number;
}

export interface DeliveryAddress {
  fullName: string;
  mobile: string;
  email: string;
  houseFlat: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
}

export type PaymentMethodType = 'upi' | 'card' | 'netbanking' | 'razorpay';

export type AdminOrderStatus = 
  | 'Pending'
  | 'Paid'
  | 'Processing'
  | 'Packed'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded';

export interface Order {
  orderNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  shippingCharge: number;
  finalTotal: number;
  deliveryAddress: DeliveryAddress;
  paymentMethod: PaymentMethodType;
  paymentStatus?: 'Paid' | 'Pending' | 'Refunded' | 'Unpaid' | 'Pending Verification';
  paymentRef: string;
  estimatedDeliveryDate: string;
  status: AdminOrderStatus;
  trackingNumber?: string;
  courierPartner?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  address?: string;
  city?: string;
  state?: string;
  status: 'active' | 'inactive';
  joinedDate: string;
}

export interface CategoryItem {
  id: string;
  name: ProductCategory;
  title: string;
  image: string;
  itemCount: string;
  tagline: string;
  isActive: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  startDate: string;
  expiryDate: string;
  usageLimit: number;
  usageCount: number;
  isActive: boolean;
}

export interface HomepageSectionConfig {
  id: string;
  title: string;
  key: 'hero' | 'dealOfTheDay' | 'newArrivals' | 'bestSellers' | 'trending' | 'festive' | 'specialOffer' | 'whyShop' | 'reviews' | 'instagram' | 'newsletter' | string;
  enabled: boolean;
  order: number;
}

export interface HeroBannerConfig {
  slides: Array<{
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    image: string; // product photo, kept in sync with the linked product
    bannerImage?: string; // admin-uploaded banner photo; shown instead of the product photo when set
    price: number;
    originalPrice: number;
    linkText: string;
    link: string; // This can be a product ID or a category URL
    productId?: string; // Optional real product ID for direct linking
  }>;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  image: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  position: 'hero' | 'midpage' | 'footer_promo';
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  logoText: string;
  storeEmail: string;
  phone: string;
  whatsapp: string;
  address: string;
  instagramUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  currency: string;
  currencySymbol: string;
  shippingCharge: number;
  freeShippingThreshold: number;
  announcementText?: string;
  announcementActive?: boolean;
}

export interface PaymentGatewaySettings {
  mode: 'test' | 'live';
  prepaidOnly: boolean; // Must strictly remain true
  allowCod: boolean; // Must strictly remain false
  razorpayKeyIdPlaceholder: string;
  razorpayKeySecretPlaceholder: string;
  webhookSecretPlaceholder: string;
  enableUpi: boolean;
  enableCards: boolean;
  enableNetBanking: boolean;
}

export interface FilterState {
  category?: ProductCategory | 'All' | 'Sale' | 'New Arrivals' | 'Best Sellers' | 'Trending';
  sizes: ProductSize[];
  colors: string[];
  priceRange: [number, number];
  discountRange: number; // minimum discount
  minRating: number;
  sortBy: 'popular' | 'newest' | 'price-low' | 'price-high' | 'rating';
  searchQuery: string;
}

export interface DealOfTheDayConfig {
  enabled: boolean;
  productId: string;
  customTitle?: string;
  customSubtitle?: string;
  badgeText?: string;
  dealPrice?: number;
  endTime?: string;
  durationHours?: number;
  stockText?: string;
  bannerImage?: string; // admin-uploaded photo for the deal card, separate from the product's own images
}

export interface Lead {
  id: string;
  email: string;
  phone?: string;
  name?: string;
  source: 'newsletter' | 'contact' | 'direct';
  createdAt: string;
  offerSent?: boolean;
}

export type AdminTab = 
  | 'dashboard'
  | 'aiController'
  | 'products'
  | 'comboOffers'
  | 'dealOfTheDay'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'leads'
  | 'coupons'
  | 'homepage'
  | 'hero'
  | 'banners'
  | 'reviews'
  | 'instagram'
  | 'settings';

/** An Instagram reel or post shown in the homepage "Follow the Aura" section. */
export interface InstagramReel {
  id: string;
  url: string; // canonical https://www.instagram.com/reel/<code>/ (or /p/<code>/)
  caption?: string;
}

export type ActivePage = 
  | 'home'
  | 'shop'
  | 'product-detail'
  | 'cart'
  | 'checkout'
  | 'order-confirmation'
  | 'wishlist'
  | 'about'
  | 'contact'
  | 'size-guide'
  | 'track-order'
  | 'shipping-policy'
  | 'return-policy'
  | 'privacy-policy'
  | 'terms-policy'
  | 'terms-conditions'
  | 'cancellation-policy'
  | 'account'
  | 'login'
  | 'admin'
  | 'admin-login';
