export type ProductCategory =
  | 'Suits'
  | 'Kurtis'
  | 'Dresses'
  | 'Dupatta Sets'
  | 'Co-ord Sets'
  | 'Anarkali'
  | 'Festive Wear'
  | 'Party Wear'
  /** Accessories (bags, heels, jewellery...) sold only inside "Complete the look". */
  | 'Accessories'
  /** Kids wear (Admin → Kids Wear) and toys (Admin → Toys): their own sections of the store. */
  | 'Baby Girls'
  | 'Baby Boys'
  | 'Toys';

export type ProductSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL' | '4XL' | '5XL' | 'Free Size'
  /** UK shoe sizes, for heels and other footwear accessories. */
  | 'UK 3' | 'UK 4' | 'UK 5' | 'UK 6' | 'UK 7' | 'UK 8'
  /** Kids wear sizes by age (see KIDS_SIZES in src/utils/kids.ts). */
  | '1-2 Y' | '2-3 Y' | '3-4 Y' | '4-5 Y' | '5-6 Y' | '6-7 Y' | '7-8 Y'
  | '8-9 Y' | '9-10 Y' | '10-11 Y' | '11-12 Y' | '12-13 Y' | '13-14 Y' | '14-15 Y';

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
  /** Unpublished: kept in the catalogue for the admin but not shown or sold on the store. */
  hidden?: boolean;
  reviews?: Review[];
  videoUrl?: string;
  /**
   * 'accessory': a bag, heels, jewellery... sold only inside "Complete the look" on combo / set
   * products; never listed in the shop, search, home rails or recommendations. Anything else is an outfit.
   */
  productType?: 'outfit' | 'accessory' | 'kids' | 'toy';
  /** Toys only: the suitable age, e.g. "3+ years". */
  ageRange?: string;
  /** Accessories only: Bag, Heels, Jewellery, Earrings, Watch or the admin's own word. */
  accessoryType?: string;
  /** Outfits only: 'Full combo', '3 piece'... "Complete the look" shows only on products with a set type. */
  setType?: string;
  /** Admin lifecycle. Draft and archived products are always saved with hidden = true (never shown or sold). */
  status?: 'draft' | 'published' | 'archived';
  /** Optional SEO overrides for the product page title and meta description. */
  seoTitle?: string;
  seoDescription?: string;
  /** Extra words shoppers may search for (comma separated), e.g. "chikankari, lucknowi". */
  searchKeywords?: string;
  /** Per-product low-stock alert level; falls back to the store's lowStockThreshold. */
  lowStockThreshold?: number;
}

export interface CartItem {
  id: string; // unique item id combining product.id + size + color
  product: Product;
  selectedSize: ProductSize;
  selectedColor: ProductColor;
  quantity: number;
  /** "Complete the look" accessories only: the outfit (combo product id) they were added with. */
  lookParentId?: string;
  /** Saved on order lines by the server: the outfit's name, for the admin and the customer. */
  lookParentName?: string;
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
  /** Address book extras (optional; older orders and checkout do not have them). */
  altMobile?: string;
  type?: 'Home' | 'Work' | 'Other';
  landmark?: string;
  tehsil?: string;
  district?: string;
}

export type PaymentMethodType = 'upi' | 'card' | 'netbanking' | 'razorpay' | 'payu';

export type AdminOrderStatus =
  | 'Pending'
  | 'Paid'
  | 'Processing'
  | 'Packed'
  | 'Shipped'
  | 'In Transit'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Returned'
  | 'Cancelled'
  | 'Refund Requested'
  | 'Refunded';

export interface OrderTimelineEntry {
  status: string;
  at: string;
  note?: string;
}

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
  /** 'cod' = cash on delivery: codAdvance was paid online, codDue is collected in cash at the door. */
  payMode?: 'prepaid' | 'cod';
  codAdvance?: number;
  codDue?: number;
  deliveryAddress: DeliveryAddress;
  paymentMethod: PaymentMethodType;
  paymentStatus?: 'Paid' | 'Pending' | 'Refunded' | 'Unpaid' | 'Pending Verification';
  razorpayOrderId?: string;
  paymentRef: string;
  /** Estimate (ISO) computed when the order was placed from the owner's configured processing + delivery days; '' when not configured. */
  estimatedDeliveryDate: string;
  /** Admin: a PayU sandbox payment (no real money). */
  testPayment?: boolean;
  status: AdminOrderStatus;
  trackingNumber?: string;
  courierPartner?: string;
  /** Courier tracking page the admin pasted (https only); wins over the courier's standard link. */
  trackingUrl?: string;
  /** Expected delivery date (YYYY-MM-DD) entered by the admin; never estimated automatically. */
  expectedDeliveryDate?: string;
  /** Delivery executive, shown to the customer only when set and the order is out for delivery. */
  deliveryAgentName?: string;
  deliveryAgentPhone?: string;
  notes?: string;
  /** Message shown to the customer on tracking and in status emails. */
  customerNote?: string;
  giftNote?: string;
  couponDiscount?: number;
  prepaidDiscount?: number;
  comboDiscount?: number;
  timeline?: OrderTimelineEntry[];
  paidAt?: string;
  stockShortfall?: Array<{ productId: string; name?: string; requested: number; available: number }>;
  emailLog?: Array<{ kind: string; at: string; ok: boolean }>;
  /** Return / exchange request (api/orders.js 'return-request'); older orders may hold only { reason, at }. */
  returnRequest?: ReturnRequest | null;
  /** Earlier requests on the order (rejected, refunded or exchanged), kept when the customer asks again. */
  pastReturnRequests?: ReturnRequest[];
  /** Owner view only: whether a return / exchange can be started now (decided by the server). */
  returnEligibility?: ReturnEligibility;
  /** Customer's cancellation request (api/orders.js 'request-cancel'); closed by the admin or by a status change. The reason is not in a guest lookup. */
  cancelRequest?: { reason?: string; at: string; handledAt?: string; outcome?: 'cancelled' | 'kept'; storeNotified?: boolean } | null;
}

export type ReturnRequestType = 'return' | 'exchange';
/** 'closed' only appears on older requests that the store handled before item-level returns existed. */
export type ReturnRequestStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'exchanged' | 'closed';

export interface ReturnRequestItem {
  /** Index of the line in order.items */
  line: number;
  productId?: string;
  name: string;
  image?: string;
  size: string;
  color?: string;
  qty: number;
  price?: number;
  clearance?: boolean;
  /** Exchanges: the size the customer wants instead ('' = see the note). */
  exchangeSize?: string;
}

export interface ReturnRequest {
  type?: ReturnRequestType;
  status?: ReturnRequestStatus;
  items?: ReturnRequestItem[];
  reason: string;
  details?: string;
  /** Cash-on-delivery orders: the UPI ID the customer gave for the refund. */
  refundUpi?: string;
  photos?: string[];
  at: string;
  updatedAt?: string;
  /** Written by the store for the customer (sent in the approval / rejection email). */
  adminNote?: string;
  history?: Array<{ status: string; at: string; note?: string }>;
  approvedAt?: string;
  rejectedAt?: string;
  receivedAt?: string;
  refundedAt?: string;
  exchangedAt?: string;
  /** Admin only: whether the store's email alert went out. */
  storeNotified?: boolean;
  legacy?: boolean;
}

export interface ReturnEligibility {
  canRequest: boolean;
  /** Why not, in words the customer can act on ('' when they can). */
  reason: string;
  /** End of the 7-day window (ISO; 11:59 pm India time on the last day), or '' when the delivery date is unknown. */
  windowEndsAt: string;
  /** Pieces of each order line (by index) that can still go into a request (bought minus already returned or exchanged). */
  remaining?: number[];
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
  /** Uses allowed per customer (same email or mobile, paid orders); 0 / empty = no limit. */
  perUserLimit?: number;
  /** Limits the coupon to these categories (with allowedProductIds: either matches); empty = every item. */
  allowedCategories?: string[];
  /** Limits the coupon to these products; empty = every item. */
  allowedProductIds?: string[];
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
    customText?: boolean; // admin typed their own title/subtitle; product sync must not replace them
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

/** Multi-buy discount applied automatically (browser preview and server) when the bag holds enough pieces. */
export interface ComboOfferConfig {
  enabled: boolean;
  percent: number;
  minItems: number;
  title: string;
  subtitle: string;
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
  /** Flat discount for prepaid orders, applied by the server at checkout. */
  prepaidDiscount?: number;
  /** Online payment discount in percent (whole number 0–50, 0 = off), applied by the server at checkout. */
  prepaidPercent?: number;
  /** The percent discount is given only on products whose unit price is above this (₹; 0 = every product). */
  prepaidMinPrice?: number;
  /** Cash on delivery: the shopper pays codCharge online to confirm, the rest in cash at delivery. */
  codEnabled?: boolean;
  /** ₹ paid online for a cash-on-delivery order (its shipping charge). */
  codCharge?: number;
  /** One reminder email to a shopper who left the checkout (sent by the server's hourly run; default on). */
  abandonedReminders?: boolean;
  /** One email asking for a review, a few days after an order is delivered (default on). */
  reviewRequests?: boolean;
  announcementText?: string;
  announcementActive?: boolean;
  // ---- Checkout rules (Admin → Settings → Checkout; the server enforces them again) ----
  /** Smallest order (₹, after discounts, before shipping); 0 = no minimum. */
  minOrderAmount?: number;
  /** Largest order (₹, after discounts, before shipping); 0 = no maximum. */
  maxOrderAmount?: number;
  /** false switches every coupon code off (default true). */
  couponsEnabled?: boolean;
  /** Hours after payment in which a customer may still ask to cancel (default 24; 0 = no time limit). */
  cancellationWindowHours?: number;
  /** Working days to pack an order before it ships. */
  processingDays?: number;
  /** Courier transit days (owner-configured); 0 = no delivery estimate is shown. */
  deliveryMinDays?: number;
  deliveryMaxDays?: number;
  // ---- Invoice ----
  legalName?: string;
  gstin?: string;
  /** Invoice number prefix, e.g. SAG-INV → SAG-INV-SAG-260930-ABCDE. */
  invoicePrefix?: string;
  invoiceAddress?: string;
  invoiceNote?: string;
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
  showTimer?: boolean; // countdown on the homepage (default on when an end time exists)
  hideWhenEnded?: boolean; // hide the deal once the timer runs out (set from the admin page)
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
  | 'discovery'
  | 'reels'
  | 'looks'
  | 'kids'
  | 'toys'
  | 'dealOfTheDay'
  | 'categories'
  | 'orders'
  | 'returns'
  | 'cancellations'
  | 'customers'
  | 'leads'
  | 'abandoned'
  | 'coupons'
  | 'homepage'
  | 'hero'
  | 'banners'
  | 'reviews'
  | 'instagram'
  | 'payments'
  | 'usage'
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
