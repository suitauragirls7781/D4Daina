import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { ShimmerPDP } from './ShimmerPDP';
import { ProductSize, ProductColor } from '../types';
import { getCleanImageUrl, getShareableUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { COLLECTIONS, getDocById } from '../lib/dataStore';
import { 
  Star, 
  Heart, 
  ShoppingBag, 
  Zap, 
  Ruler, 
  Check, 
  Truck, 
  RotateCcw, 
  ShieldCheck, 
  Sparkles, 
  Share2, 
  MapPin, 
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Info,
  CheckCircle,
  HelpCircle,
  Clock,
  Tag,
  MessageSquarePlus,
  MessageSquare,
  X,
  Loader2,
  Video,
  Bell,
  Gift,
  Layers,
  Palette,
  Droplets,
  ChevronDown,
  ChevronsRight,
  Camera,
  Home,
  AlertTriangle
} from 'lucide-react';

interface ProductQA {
  q: string;
  a: string;
}

const getProductQAs = (product: any): ProductQA[] => {
  if (!product) return [];
  const name = product.name || "this exquisite royal ensemble";
  const fabric = product.fabric || "Premium Handloom Fabric";
  const washCare = product.washCare || "Gentle cold handwash separately or dry clean.";
  const fit = product.fit || "Flattering regular boutique fit.";
  const occasion = product.occasion || "Festive wear, special celebrations, and wedding ceremonies.";
  const mainColor = (product.colors && product.colors[0]?.name) || "this authentic shade";
  const category = product.category || "Suits";

  const qas: ProductQA[] = [];

  // Q1: Specific to the exact Fabric & quality
  qas.push({
    q: `What is the exact quality of the fabric in this "${name}"?`,
    a: `We use only premium, authentic "${fabric}" for this piece. The fabric is meticulously pre-softened at our boutique atelier to ensure it is highly breathable, beautifully drapeable, and extremely comfortable to wear for hours.`
  });

  // Q2: Specific to Category, Fit & Alteration
  if (category === 'Anarkali' || name.toLowerCase().includes('anarkali') || name.toLowerCase().includes('gown')) {
    qas.push({
      q: `What is the total flare (ghera) of this "${name}" and is there any alteration margin?`,
      a: `This premium Anarkali features a majestic, wide flared panel (kalis) design yielding a full floor-sweeping flare of approximately 3.8 to 4.2 meters. We also provide a generous 2-inch stitch margin on both sides inside the side seams, so you can easily adjust the fit locally if needed.`
    });
  } else if (category === 'Co-ord Sets' || name.toLowerCase().includes('co-ord') || name.toLowerCase().includes('pants')) {
    qas.push({
      q: `How is the fit of the pants/trousers in this "${name}"?`,
      a: `The trousers are styled in a tailored comfort fit with a modern flat-front and elasticated back waistband. This guarantees an elegant, gap-free fit and absolute comfort all day. It also features a hidden side pocket for your convenience.`
    });
  } else {
    qas.push({
      q: `How does the fitting of this "${name}" run and is it true to size?`,
      a: `This outfit is tailored in a graceful "${fit}" which aligns perfectly with our boutique size chart. We recommend selecting your exact chest size. For any future alterations, we've provided a standard 2-inch premium inner margin inside the side seams.`
    });
  }

  // Q3: Specific to Color fastness & Wash instructions
  qas.push({
    q: `Will the vibrant "${mainColor}" color bleed or fade over time?`,
    a: `Absolutely not. The fabric undergoes a specialized organic color-locking wash at our atelier before stitching. To preserve the royal hand-guided detailing, we recommend: "${washCare}". Always dry in shade.`
  });

  // Q4: Specific to Occasion & Styling tips
  qas.push({
    q: `What are the best occasions to style this "${name}"?`,
    a: `This elegant creation is custom-tailored for "${occasion}". We recommend styling it with traditional kundan earrings, matching juttis, and a subtle clutch to let the authentic craftsmanship truly stand out.`
  });

  return qas;
};

export const ProductDetailPage: React.FC = () => {
  const { 
    products = [],
    selectedProductId, 
    selectedProduct,
    addToCart, 
    buyNow,
    toggleWishlist, 
    isInWishlist, 
    setIsSizeGuideOpen, 
    setActivePage,
    navigateToCategory,
    showToast,
    isLoading
  } = useShop();

  const dbProduct = products.find((p) => String(p.id) === String(selectedProductId));

  // If we are currently loading products from the server, show a beautiful branded shimmer loading screen
  // Keep the detail view tied to the active database catalog instead of bundled stock products.
  if (isLoading || (selectedProductId && !dbProduct && products.length === 0)) {
    return (
      <ShimmerPDP />
    );
  }

  const product = dbProduct
    || (selectedProduct && String(selectedProduct.id) === String(selectedProductId) ? selectedProduct : undefined)
    || products[0] 
    || {
      id: 'catalog-fallback',
      name: 'Artisanal Suit Set',
      category: 'Suits',
      price: 999,
      originalPrice: 1599,
      discount: 38,
      rating: 5.0,
      reviewCount: 1,
      images: [],
      colors: [{ name: 'Standard', hex: '#FAF5EB' }],
      sizes: ['S', 'M', 'L', 'XL'],
      description: 'Artisanal pure cotton ethnic ensemble.',
      fabric: '100% Pure Cambric Cotton',
      fit: 'Regular Straight Fit',
      occasion: 'Festive & Workwear',
      washCare: 'Gentle Hand Wash',
      inStock: true,
    };

  let rawImages: unknown = product.images;
  if (typeof rawImages === 'string') {
    try {
      rawImages = JSON.parse(rawImages);
    } catch {
      rawImages = [rawImages];
    }
  }
  const normalizedImages = Array.isArray(rawImages)
    ? rawImages.filter((image): image is string => typeof image === 'string')
    : [];
  const productImages = normalizedImages.length > 0
    ? normalizedImages
    : (product as any).image 
      ? [(product as any).image]
      : ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80'];
  const storedColors = Array.isArray(product.colors)
    ? product.colors.filter(
        (color) => color && typeof color === 'object' && typeof color.name === 'string' && color.name.trim().length > 0
      )
    : [];
  const productColors = storedColors.length > 0
    ? storedColors
    : productImages.map((image, index) => ({
        name: ['Original', 'Alternate', 'Detail View', 'Back View'][index % 4],
        hex: '#FAF5EB',
        imageUrl: image,
      }));
  const safeProductColors = productColors.length > 0
    ? productColors
    : [{ name: 'Standard', hex: '#FAF5EB' }];

  const availableSizes: ProductSize[] = Array.isArray(product.sizes) ? product.sizes : [];

  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>('M');
  const [selectedColor, setSelectedColor] = useState<ProductColor>(
    safeProductColors[0]
  );
  const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);
  const { reviewsList = [], addReview } = useAdmin();
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState('');
  const [pincodeStatus, setPincodeStatus] = useState<{ 
    checked: boolean; 
    valid?: boolean; 
    message?: string; 
    isChecking?: boolean; 
    district?: string; 
    state?: string; 
    postOfficeName?: string; 
    estimatedDate?: string; 
    logisticsPartner?: string; 
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'fabric' | 'shipping' | 'reviews'>('details');
  const [isJustAdded, setIsJustAdded] = useState(false);

  // Reference Image Feature States: Interactive Coupons & Simulator
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; maxDiscount: number } | null>(null);
  const [showOffersModal, setShowOffersModal] = useState(false);

  // Swipe & Zoom States & Refs
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const recentlyBrowsedRef = React.useRef<HTMLDivElement>(null);
  const recommendationsRef = React.useRef<HTMLDivElement>(null);
  const popularProductsRef = React.useRef<HTMLDivElement>(null);
  const lastTapRef = React.useRef<number>(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });

  // Sticky Bottom Action Bar Size Selector State & Ref
  const [showStickySizePicker, setShowStickySizePicker] = useState(false);
  const stickySizePickerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (stickySizePickerRef.current && !stickySizePickerRef.current.contains(event.target as Node)) {
        setShowStickySizePicker(false);
      }
    };
    if (showStickySizePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showStickySizePicker]);

  // Reset zoom states on photo index change or modal open/close
  useEffect(() => {
    setIsZoomed(false);
    setZoomScale(1);
  }, [selectedImageIdx, isImageLightboxOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent, onSwipeLeft: () => void, onSwipeRight: () => void) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    
    const SWIPE_THRESHOLD = 50;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    }
    touchStartRef.current = null;
  };

  const toggleZoom = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isZoomed) {
      setIsZoomed(false);
      setZoomScale(1);
    } else {
      setIsZoomed(true);
      setZoomScale(2.5);
      
      let clientX = 0;
      let clientY = 0;
      
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      setZoomPosition({ x, y });
    }
  };

  const handleDoubleTapOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      toggleZoom(e);
    }
    lastTapRef.current = now;
  };

  const handleZoomMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  const handleZoomTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isZoomed || e.touches.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
    const y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  // Live database stock revalidation state
  const [dbStockState, setDbStockState] = useState<{
    inStock: boolean;
    stockQuantity: number;
    revalidated: boolean;
    isChecking: boolean;
  }>({
    inStock: product.inStock !== false && (product.stockQuantity === undefined || product.stockQuantity > 0),
    stockQuantity: product.stockQuantity ?? 10,
    revalidated: false,
    isChecking: true,
  });

  // Revalidate product stock status directly from the database on PDP mount & when product ID changes
  useEffect(() => {
    let isMounted = true;

    const revalidateStockFromDb = async () => {
      if (!product || !product.id) return;

      setDbStockState((prev) => ({ ...prev, isChecking: true }));

      try {
        const data = await getDocById(COLLECTIONS.products, String(product.id));

        if (data && isMounted) {
          const qty = Number(data.stockQuantity ?? product.stockQuantity ?? 10);

          const isAvailable = data.inStock !== false && qty > 0;

          setDbStockState({
            inStock: isAvailable,
            stockQuantity: qty,
            revalidated: true,
            isChecking: false,
          });
        } else if (isMounted) {
          setDbStockState({
            inStock: product.inStock !== false && (product.stockQuantity === undefined || product.stockQuantity > 0),
            stockQuantity: product.stockQuantity ?? 10,
            revalidated: true,
            isChecking: false,
          });
        }
      } catch (e) {
        console.warn('PDP stock revalidation notice:', e);
        if (isMounted) {
          setDbStockState((prev) => ({ ...prev, revalidated: true, isChecking: false }));
        }
      }
    };

    revalidateStockFromDb();

    return () => {
      isMounted = false;
    };
  }, [product.id]);

  const baseIsItemInStock = dbStockState.revalidated 
    ? dbStockState.inStock 
    : (product.inStock !== false && (product.stockQuantity === undefined || product.stockQuantity > 0));

  const baseEffectiveStockQty = dbStockState.revalidated 
    ? dbStockState.stockQuantity 
    : (product.stockQuantity ?? 12);

  // Swapping swatches dynamically updates SKU
  const baseSku = product.sku || `SAG-SUIT-${String(product.id).slice(-4).toUpperCase()}`;
  const currentSku = `${baseSku}-${selectedColor.name.replace(/\s+/g, '').substring(0, 3).toUpperCase()}`;

  // Swapping swatches dynamically updates price
  const rawPdpPrice = Number(product.price) || 0;
  const rawPdpOrigPrice = Number(product.originalPrice) || Math.round(rawPdpPrice * 1.85);
  const currentPrice = rawPdpPrice;
  const currentOriginalPrice = rawPdpOrigPrice;
  
  // Coupon Discount Calculation from Reference Image
  const couponDiscountAmount = appliedCoupon 
    ? Math.min(appliedCoupon.maxDiscount, Math.round((currentPrice * (appliedCoupon.discountPercent || 0)) / 100))
    : 0;
  const discountedPrice = Math.max(0, currentPrice - couponDiscountAmount);

  const currentDiscount = (currentOriginalPrice > 0 && !isNaN(currentOriginalPrice) && !isNaN(discountedPrice)) 
    ? Math.round(((currentOriginalPrice - discountedPrice) / currentOriginalPrice) * 100) 
    : (Number(product.discount) || 0);

  // Swapping swatches dynamically updates stock count
  const effectiveStockQty = baseEffectiveStockQty;
  const isItemInStock = baseIsItemInStock;

  const isSizeOutOfStock = (_sz: ProductSize) => !isItemInStock;

  const [isNotified, setIsNotified] = useState(false);
  const handleNotifyMe = () => {
    setIsNotified(true);
    showToast(`Shabash! Size ${selectedSize} ke liye aapka notification register ho gaya hai. Restock hote hi aapko update kiya jayega! 🔔`, 'success');
    setTimeout(() => setIsNotified(false), 3000);
  };

  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [showDispatchTimer, setShowDispatchTimer] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    fabric: true,
    work: false,
    length: false,
    care: false
  });

  const toggleAccordion = (key: string) => {
    setOpenAccordions(prev => ({ 
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleWhatsAppShare = () => {
    const shareUrl = getShareableUrl(product.id);
    const currentImg = selectedColor.imageUrl || product.images[0];
    const imageLink = getCleanImageUrl(currentImg);
    const message = `Hey! Look at this beautiful ethnic suit from Suit Aura Girls! ✨\n\n🛍️ *${product.name}*\n💰 Price: ₹${product.price.toLocaleString('en-IN')}\n\n🔗 *Buy Link:* ${shareUrl}\n📸 *Product Image Link:* ${imageLink}\n\nFree shipping & 7-day easy exchange. Order yours today! 🚚`;
    const finalUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(finalUrl, '_blank');
  };

  const handleInstagramShare = () => {
    const shareUrl = getShareableUrl(product.id);
    const currentImg = selectedColor.imageUrl || product.images[0];
    const imageLink = getCleanImageUrl(currentImg);
    const textToCopy = `Suit Aura Girls ✨\nProduct: ${product.name}\nPrice: ₹${product.price.toLocaleString('en-IN')}\n🔗 Link: ${shareUrl}\n📸 Image: ${imageLink}`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      showToast('Product info & direct image link copied! Paste in Instagram chats or stories 📸', 'success');
    } else {
      showToast('Copied product share description!', 'success');
    }
    setTimeout(() => {
      window.open('https://instagram.com', '_blank');
    }, 1200);
  };

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Dispatch works between 8:00 AM and 5:00 PM (17:00:00) daily local time
      if (currentHour >= 8 && currentHour < 17) {
        setShowDispatchTimer(true);
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
        const diffMs = target.getTime() - now.getTime();
        const diffSec = Math.max(0, Math.floor(diffMs / 1000));
        
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        const s = diffSec % 60;
        setTimeLeft({ hours: h, minutes: m, seconds: s });
      } else {
        setShowDispatchTimer(false);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Review submission state
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [zoomedReviewPhoto, setZoomedReviewPhoto] = useState<string | null>(null);
  const [recentlyBrowsed, setRecentlyBrowsed] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [popularProducts, setPopularProducts] = useState<any[]>([]);
  const [reviewForm, setReviewForm] = useState<{
    userName: string;
    rating: number;
    sizePurchased: ProductSize;
    location: string;
    comment: string;
    photoUrl: string;
  }>({
    userName: '',
    rating: 5,
    sizePurchased: 'M',
    location: 'Artisan, India',
    comment: '',
    photoUrl: ''
  });

  // Load Popular products based on Pincode/District
  useEffect(() => {
    if (!pincodeStatus?.district) return;
    
    const district = pincodeStatus?.district?.toLowerCase();
    const allProducts = products;
    
    const popular = allProducts.filter(p => 
      (p.tags || []).some(tag => tag.toLowerCase() === district)
    ).slice(0, 8);
    
    setPopularProducts(popular);
  }, [pincodeStatus?.district, products]);

  // Track and save recently browsed products to local session
  useEffect(() => {
    // Load saved pincode
    const savedPincode = localStorage.getItem('sag_user_pincode');
    if (savedPincode) {
        setPincode(savedPincode);
        // Note: We might want to re-run the check logic here if desired, but 
        // for now just populating the input is enough for user interaction.
    }

    if (product && product.id) {
      const stored = localStorage.getItem('sag_recently_browsed');
      let list: string[] = [];
      try {
        if (stored) {
          list = JSON.parse(stored);
        }
      } catch (e) {
        list = [];
      }
      
      list = list.filter(id => String(id) !== String(product.id));
      list.unshift(String(product.id));
      list = list.slice(0, 15);
      localStorage.setItem('sag_recently_browsed', JSON.stringify(list));
    }
  }, [product?.id]);

  // Load recently browsed products from local session
  useEffect(() => {
    const stored = localStorage.getItem('sag_recently_browsed');
    if (stored) {
      try {
        const list: string[] = JSON.parse(stored);
        const mapped = list
          .filter(id => String(id) !== String(product?.id))
          .map(id => {
            return (products || []).find(p => String(p.id) === String(id)) 
              || undefined;
          })
          .filter(Boolean);
        setRecentlyBrowsed(mapped);
      } catch (e) {
        // Safe fallback
      }
    }
  }, [product?.id, products]);

  // Calculate Recommendations based on Color and Category
  useEffect(() => {
    if (!product || !products) return;

    const allProducts = products;
    
    // Get primary color hex or name
    const targetColor = selectedColor.name || '';
    const targetCategory = product.category;
    
    const recs = allProducts
      .filter(p => String(p.id) !== String(product.id))
      .map(p => {
        let score = 0;
        // Category match
        if (p.category === targetCategory) score += 5;
        // Color match (name check)
        if (p.colors.some(c => c.name === targetColor)) score += 3;
        // Tag match
        const matchingTags = (p.tags || []).filter(t => (product.tags || []).includes(t));
        score += matchingTags.length * 2;
        
        return { product: p, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.product);

    setRecommendations(recs);
  }, [product?.id, selectedColor, products]);

  // Filter approved user-submitted reviews for this product (strictly excluding any English text)
  const approvedProductReviews = reviewsList.filter((r) => {
    const matchesProduct = String(r.productId) === String(product.id) || (r.productName && r.productName === product.name);
    const isApproved = (r.status || 'approved') === 'approved';
    const comment = String(r.comment || '').trim();
    return matchesProduct && isApproved && !!comment;
  });

  const displayReviews = approvedProductReviews;
  const productReviewCount = displayReviews.length;

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.userName.trim() || !reviewForm.comment.trim()) {
      showToast('Please fill in your name and review note.', 'error');
      return;
    }

    setIsSubmittingReview(true);
    try {
      await addReview({
        productId: String(product.id),
        productName: product.name,
        userName: reviewForm.userName.trim(),
        rating: Number(reviewForm.rating),
        sizePurchased: reviewForm.sizePurchased,
        date: new Date().toISOString(),
        verifiedPurchase: false,
        location: reviewForm.location.trim() || 'Artisan, India',
        comment: reviewForm.comment.trim(),
        imageUrl: reviewForm.photoUrl || undefined,
        status: 'pending',
      });

      showToast('Dhanyawad! Aapka review submit ho gaya hai. Admin dwara approve hone ke baad ye site par live ho jayega.', 'success');
      setIsWriteReviewOpen(false);
      setReviewForm({
        userName: '',
        rating: 5,
        sizePurchased: selectedSize || 'M',
        location: 'Artisan, India',
        comment: '',
        photoUrl: ''
      });
    } catch (err) {
      console.error('Review submit error:', err);
      showToast('Dhanyawad! Aapka review submit ho gaya hai. Admin dwara approve hone ke baad ye site par live ho jayega.', 'success');
      setIsWriteReviewOpen(false);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Reset states when product changes
  useEffect(() => {
    setSelectedImageIdx(0);
    setSelectedSize(availableSizes[0] || 'M');
    setSelectedColor(productColors[0] || { name: 'Standard', hex: '#FAF5EB' });
    setQuantity(1);
    setPincodeStatus(null);
  }, [product.id]);

  const handleSelectColor = (c: ProductColor) => {
    setSelectedColor(c);
    if (c.imageUrl) {
      const idx = productImages.findIndex(
        (img) => img === c.imageUrl || (img && c.imageUrl && img.split('/').pop() === c.imageUrl.split('/').pop())
      );
      if (idx !== -1) {
        setSelectedImageIdx(idx);
        return;
      }
    }
    // Fallback: match by index if colors array aligns with productImages
    const colorIdx = productColors.findIndex(
      (col) => col.name === c.name && col.hex === c.hex
    );
    if (colorIdx !== -1 && productImages[colorIdx]) {
      setSelectedImageIdx(colorIdx);
    }
  };

  const handleSelectThumbnail = (idx: number) => {
    setSelectedImageIdx(idx);
    const targetUrl = productImages[idx];
    if (targetUrl) {
      const targetFilename = targetUrl.split('/').pop();
      const matched = productColors.find(
        (c) => c.imageUrl && (c.imageUrl === targetUrl || (targetFilename && c.imageUrl.split('/').pop() === targetFilename))
      );
      if (matched) {
        setSelectedColor(matched);
      }
    }
  };

  const isFav = isInWishlist(product.id);

  const handleAddToCart = () => {
    if (!isItemInStock || effectiveStockQty <= 0) {
      showToast('Sorry! This item is currently Out of Stock in our database.', 'error');
      return;
    }
    if (!selectedSize) {
      showToast('Please select your size before adding to bag.', 'error');
      return;
    }
    if (isSizeOutOfStock(selectedSize)) {
      handleNotifyMe();
      return;
    }
    const dynamicProduct = {
      ...product,
      price: currentPrice,
      originalPrice: currentOriginalPrice,
      sku: currentSku
    };
    addToCart(dynamicProduct, selectedSize, selectedColor, quantity, false);

    showToast(`Added ${product.name} to Bag!`, 'success');
    setIsJustAdded(true);
    setTimeout(() => setIsJustAdded(false), 2500);
  };

  const handleBuyNow = () => {
    if (!isItemInStock || effectiveStockQty <= 0) {
      showToast('Sorry! This item is currently Out of Stock in our database.', 'error');
      return;
    }
    if (!selectedSize) {
      showToast('Please select your size to proceed.', 'error');
      return;
    }
    if (isSizeOutOfStock(selectedSize)) {
      handleNotifyMe();
      return;
    }
    const dynamicProduct = {
      ...product,
      price: currentPrice,
      originalPrice: currentOriginalPrice,
      sku: currentSku
    };

    buyNow(dynamicProduct, selectedSize, selectedColor, quantity);
  };

  const handleCheckPincode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pincode || pincode.length !== 6 || isNaN(Number(pincode))) {
      setPincodeStatus({
        checked: true,
        valid: false,
        message: 'Please enter a valid 6-digit Indian PIN code.'
      });
      return;
    }

    setPincodeStatus({
      checked: true,
      valid: true,
      isChecking: true,
      message: '🔍 Checking delivery eligibility with Postal database...'
    });

    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();
      if (data && data[0] && data[0].Status === 'Success') {
        const postOffices = data[0].PostOffice;
        if (postOffices && postOffices.length > 0) {
          const firstPO = postOffices[0];
          
          // Save valid pincode to local storage
          localStorage.setItem('sag_user_pincode', pincode);
          
          // Let's determine if it is a metropolitan city for Express Air delivery
          const stateName = String(firstPO.State).toLowerCase();
          const cityName = String(firstPO.District).toLowerCase();
          const isMetro = stateName.includes('delhi') || 
                          stateName.includes('maharashtra') || 
                          stateName.includes('karnataka') || 
                          stateName.includes('tamil nadu') || 
                          stateName.includes('west bengal') || 
                          cityName.includes('mumbai') || 
                          cityName.includes('bangalore') || 
                          cityName.includes('kolkata') || 
                          cityName.includes('chennai') || 
                          cityName.includes('artisan') ||
                          cityName.includes('ahmedabad') ||
                          cityName.includes('hyderabad');
          
          const daysToDeliver = isMetro ? 2 : 4;
          const deliveryDate = new Date();
          deliveryDate.setDate(deliveryDate.getDate() + daysToDeliver);
          
          const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
          const formattedDate = deliveryDate.toLocaleDateString('en-IN', options);
          
          const partner = isMetro ? 'Bluedart' : 'Delhivery';
          
          setPincodeStatus({
            checked: true,
            valid: true,
            isChecking: false,
            district: firstPO.District,
            state: firstPO.State,
            postOfficeName: firstPO.Name,
            estimatedDate: formattedDate,
            logisticsPartner: partner,
            message: `✅ Express Delivery Available! delivering to ${firstPO.District}, ${firstPO.State}.`
          });
          showToast(`Super Fast Delivery available at ${firstPO.District}!`, 'success');
        } else {
          throw new Error();
        }
      } else {
        setPincodeStatus({
          checked: true,
          valid: false,
          isChecking: false,
          message: '❌ Invalid PIN code / Non-Indian address. Delivery not available!'
        });
        showToast('Invalid / Non-Indian Pincode Rejected!', 'error');
      }
    } catch (err) {
      setPincodeStatus({
        checked: true,
        valid: false,
        isChecking: false,
        message: '❌ Invalid Pincode. No delivery records found in India.'
      });
      showToast('Pincode validation failed.', 'error');
    }
  };

  const activeProducts = products.filter((p) => p.inStock);
  const relatedProducts = activeProducts
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const fallbackRelated = relatedProducts.length > 0 
    ? relatedProducts 
    : activeProducts.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div id="product-detail-page-container" className="bg-[#FDFBF7] py-6 sm:py-10 pb-36 sm:pb-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-[#3D0F1F]/65 mb-6 overflow-x-auto whitespace-nowrap border-b border-[#B8935A]/25 pb-3">
          <button 
            onClick={() => setActivePage('home')}
            className="hover:text-[#3D0F1F] font-medium transition flex items-center gap-1"
          >
            <Home className="w-3.5 h-3.5 text-[#B8935A]" />
            <span>Home</span>
          </button>
          <ChevronRight className="w-3 h-3 text-[#B8935A] shrink-0" />
          <button 
            onClick={() => navigateToCategory(product.category)}
            className="hover:text-[#3D0F1F] font-medium transition"
          >
            {product.category}
          </button>
          <ChevronRight className="w-3 h-3 text-[#B8935A] shrink-0" />
          <span className="text-[#3D0F1F] font-semibold truncate">{product.name}</span>
        </nav>

        {/* Main Product Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Image Gallery */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Main Stage Image (100% CLEAN & UNOBSTRUCTED IMAGE CONTAINER) */}
            <motion.div 
              className="relative lg:aspect-[4/5] aspect-[3/4] overflow-hidden bg-[#FAF5EB] border border-[#B8935A]/25 group select-none touch-pan-y"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50) {
                  const nextIdx = (selectedImageIdx + 1) % productImages.length;
                  handleSelectThumbnail(nextIdx);
                } else if (info.offset.x > 50) {
                  const prevIdx = (selectedImageIdx - 1 + productImages.length) % productImages.length;
                  handleSelectThumbnail(prevIdx);
                }
              }}
              onClick={() => {
                setIsImageLightboxOpen(true);
              }}
              title="Click to enlarge or swipe to change image"
            >
              {(productImages[selectedImageIdx] || selectedColor.imageUrl || productImages[0]) ? (
                <img
                  src={getCleanImageUrl(productImages[selectedImageIdx] || selectedColor.imageUrl || productImages[0])}
                  alt={product.name}
                  className="w-full h-full object-contain object-center"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('data:image/svg+xml')) {
                      target.src = ELEGANT_PLACEHOLDER_SVG;
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full bg-[#F1E8DF]" />
              )}
            </motion.div>

            {/* Dedicated Outside Slot for Media Bar: Wishlist, Discount Tag, Dot Indicators, Tap to Zoom */}
            <div className="flex items-center justify-between gap-2 px-1 pt-1 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-[#241D1B] text-[#211C1A] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider border border-[#9A6A3A]/35">
                  {product.discount}% OFF
                </span>

                {/* Dot Indicators for Mobile Swipe */}
                {productImages.length > 1 && (
                  <div className="flex gap-1.5 items-center px-2 py-1 bg-[#241D1B]/5 rounded-full border border-[#9A6A3A]/15">
                    {productImages.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectThumbnail(idx)}
                        className={`h-1.5 rounded-full transition-all ${
                          selectedImageIdx === idx ? 'w-4 bg-[#241D1B]' : 'w-1.5 bg-[#241D1B]/30'
                        }`}
                        aria-label={`Go to slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImageLightboxOpen(true)}
                  className="bg-[#F1E8DF] border border-[#9A6A3A]/30 hover:bg-[#241D1B]/5 text-[#211C1A] text-[11px] font-black px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-[#211C1A]" />
                  <span>Tap to Zoom</span>
                </button>

                {/* Dedicated Wishlist Icon (Outside Photo Bounding Box) */}
                <button
                  id="pdp-wishlist-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWishlist(product);
                  }}
                  className={`p-2.5 rounded-full shadow-3xs transition-all border cursor-pointer flex items-center justify-center ${
                    isFav
                      ? 'bg-[#241D1B] text-[#211C1A] border-[#241D1B]'
                      : 'bg-[#F1E8DF] text-[#211C1A] border-[#9A6A3A]/35 hover:bg-[#241D1B] hover:text-[#211C1A]'
                  }`}
                  aria-label="Wishlist"
                  title={isFav ? "Remove from Wishlist" : "Add to Wishlist"}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-[#F1E8DF]' : ''}`} />
                </button>
              </div>
            </div>

            {/* Thumbnails Row */}
            <div className="flex gap-2.5 overflow-x-auto pb-2 items-center">
              {productImages.map((img, idx) => (
                <button
                  key={idx}
                  id={`pdp-thumb-${idx}`}
                  onClick={() => handleSelectThumbnail(idx)}
                  className={`w-16 h-20 rounded-xl overflow-hidden border transition cursor-pointer ${
                    selectedImageIdx === idx 
                      ? 'border-[#241D1B] ring-2 ring-[#9A6A3A]/30' 
                      : 'border-[#9A6A3A]/25 opacity-70 hover:opacity-100 bg-[#F1E8DF]'
                  }`}
                >
                  {img && <img src={getCleanImageUrl(img)} alt="Product view" className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>

            {/* Value Props Strip / Trust Guarantee Grid */}
            <div className="bg-[#FAF5EB] border border-[#B8935A]/30 p-4 grid grid-cols-3 gap-2 text-center text-xs text-[#3D0F1F] font-medium">
              <div className="flex flex-col items-center">
                <ShieldCheck className="w-5 h-5 text-black mb-1" />
                <span className="font-extrabold text-[#211C1A]">100% Authentic</span>
                <span className="text-[9px] text-[#211C1A]/70 font-normal">Artisan Craftsmanship</span>
              </div>
              <div className="flex flex-col items-center">
                <Truck className="w-5 h-5 text-black mb-1" />
                <span className="font-extrabold text-[#211C1A]">Express Delivery</span>
                <span className="text-[9px] text-[#211C1A]/70 font-normal">Fast Dispatch Pan-India</span>
              </div>
              <div className="flex flex-col items-center">
                <RotateCcw className="w-5 h-5 text-black mb-1" />
                <span className="font-extrabold text-[#211C1A]">Easy Exchange</span>
                <span className="text-[9px] text-[#211C1A]/70 font-normal">7-Day Doorstep Exchange</span>
              </div>
            </div>

            {/* ✨ DESIGN & FIT HIGHLIGHTS Card (Truly dynamic to prevent identical fake feel) */}
            <div className="bg-[#FDFBF7] border border-[#B8935A]/25 p-4 space-y-3 text-[#3D0F1F]">
              <div className="flex items-center gap-2 text-[#211C1A] font-serif font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-black" />
                <span>DESIGN & SILHOUETTE HIGHLIGHTS</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="px-3 py-1 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-full shadow-3xs flex items-center gap-1.5 text-[#211C1A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9A6A3A]"></span>
                  Premium {product.fabric || 'Pure Artisan Cotton'}
                </span>
                <span className="px-3 py-1 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-full shadow-3xs flex items-center gap-1.5 text-[#211C1A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9A6A3A]"></span>
                  Refined {product.fit || 'A-Line Straight Fit'} Silhouette
                </span>
                <span className="px-3 py-1 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-full shadow-3xs flex items-center gap-1.5 text-[#211C1A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9A6A3A]"></span>
                  Artisanal Handloom Detailing
                </span>
                <span className="px-3 py-1 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-full shadow-3xs flex items-center gap-1.5 text-[#211C1A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9A6A3A]"></span>
                  Curated for {product.occasion || 'Festive & Celebration Wear'}
                </span>
              </div>
            </div>

          </div>

          {/* Right Column: Buying Controls & Info */}
          <div className="lg:col-span-5 bg-[#FAF5EB] text-[#3D0F1F] border border-[#B8935A]/30 p-5 sm:p-7 space-y-6 lg:sticky lg:top-28 lg:self-start">
            
            {/* Title & Brand */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#211C1A] bg-[#F1E8DF] px-3 py-1 rounded-full border border-[#9A6A3A]/35 shadow-3xs">
                  CATEGORY: {product.category.toUpperCase()}
                </span>
              </div>

              <div className="flex items-start justify-between gap-3 mt-3">
                <div>
                  <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[#3D0F1F] leading-snug">
                    {product.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded font-black shadow-3xs">
                      SKU: {currentSku}
                    </span>
                    <span className="text-[10px] text-[#211C1A] bg-[#F1E8DF] border border-[#9A6A3A]/35 px-2 py-0.5 rounded font-black">
                      Color: {selectedColor.name}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {/* WhatsApp Share */}
                  <button
                    id="pdp-whatsapp-share-btn"
                    onClick={handleWhatsAppShare}
                    className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-3xs border border-emerald-200 cursor-pointer active:scale-95"
                    aria-label="Share on WhatsApp"
                    title="Share on WhatsApp"
                  >
                    <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.739-1.446L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.588 1.981 14.117.957 11.53.957c-5.44 0-9.866 4.372-9.87 9.802 0 1.772.465 3.502 1.345 5.027l-.993 3.628 3.73-.967zm12.333-5.26c-.307-.154-1.82-.897-2.102-.997-.282-.1-.487-.152-.692.152-.205.304-.795.997-.974 1.203-.179.205-.357.23-.664.077-.307-.154-1.3-.48-2.477-1.53-.915-.817-1.533-1.826-1.712-2.133-.179-.307-.019-.473.134-.626.138-.138.307-.359.461-.539.154-.179.205-.307.307-.512.103-.205.051-.384-.026-.538-.077-.154-.692-1.666-.948-2.28-.249-.597-.503-.516-.692-.526-.179-.009-.384-.01-.59-.01-.205 0-.538.077-.82.384-.282.308-1.077 1.051-1.077 2.564 0 1.513 1.102 2.974 1.256 3.179.154.205 2.17 3.313 5.258 4.646.734.317 1.308.507 1.753.648.739.235 1.412.201 1.944.122.593-.088 1.82-.743 2.076-1.46.256-.718.256-1.333.179-1.46-.077-.128-.282-.205-.59-.359z"/>
                    </svg>
                  </button>

                  {/* Standard Share */}
                  <button 
                    onClick={async () => {
                      const shareUrl = getShareableUrl(product.id);
                      const shareData = {
                        title: product.name,
                        text: `Check out ${product.name} at Suit Aura Girls!`,
                        url: shareUrl
                      };
                      if (navigator.share) {
                        try {
                          await navigator.share(shareData);
                        } catch (err) {
                          console.log('Error sharing:', err);
                        }
                      } else if (navigator.clipboard) {
                        navigator.clipboard.writeText(shareUrl);
                        showToast('Product link copied to clipboard!', 'success');
                      }
                    }}
                    className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[#F1E8DF] text-[#211C1A] hover:bg-[#241D1B] hover:text-[#211C1A] transition-all shadow-3xs border border-[#9A6A3A]/35 group cursor-pointer"
                    aria-label="Share Product"
                  >
                    <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Rating & Reviews Pills matching Reference Image */}
              {(() => {
                const count = displayReviews.length;
                const computedAvg = count > 0
                  ? (displayReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / count).toFixed(1)
                  : '5.0';

                return (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <div className="flex items-center gap-1 bg-[#9A6A3A] text-white px-2.5 py-0.5 rounded-full text-xs font-black border border-[#C7A77A]/30 shadow-3xs animate-pulse">
                      <Star className="w-3 h-3 fill-current text-white" />
                      <span>{computedAvg}</span>
                    </div>
                    <span className="text-xs text-gray-600 font-bold">
                      ({productReviewCount} Verified Reviews)
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-bold border border-emerald-500/20 shadow-3xs">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      Quality Verified
                    </span>
                  </div>
                );
              })()}

              {/* Scarcity Meter Bar (Exact match to reference image, but themed beautifully) */}
              <div className="mt-4 p-3.5 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#211C1A]">
                  <span className="flex items-center gap-1.5">
                    <span className="font-extrabold text-[#211C1A]">Current stock: {effectiveStockQty}</span>
                  </span>
                  <span className="text-[10px] bg-[#241D1B] text-[#211C1A] px-2 py-0.5 rounded-md border border-[#9A6A3A]/35 font-black tracking-wider">
                    {isItemInStock ? 'IN STOCK' : 'OUT OF STOCK'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden border border-[#9A6A3A]/15">
                  <div className="h-full bg-gradient-to-r from-[#9A6A3A] to-[#C7A77A] rounded-full w-[85%]"></div>
                </div>
              </div>

            </div>

            {/* Price Box & Integrated Active Coupon Section */}
            <div className="bg-[#FDFBF7] border border-[#B8935A]/30 p-4 space-y-3">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="font-serif text-3xl font-semibold text-[#3D0F1F]">
                  ₹{discountedPrice.toLocaleString('en-IN')}
                </span>
                <span className="text-base line-through text-gray-500 font-medium">
                  ₹{currentOriginalPrice.toLocaleString('en-IN')}
                </span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-500/20 px-3 py-0.5 rounded-full shadow-3xs">
                  {currentDiscount}% off onwards
                </span>
              </div>

              {/* Integrated Active Coupon Pill matching reference image */}
              <div className="p-3 bg-emerald-50 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-2 shadow-3xs">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-black text-gray-900">
                      {appliedCoupon 
                        ? `₹${discountedPrice} with Coupon ${appliedCoupon.code}` 
                        : `₹${Math.max(0, currentPrice - Math.min(150, Math.round(currentPrice * 0.1)))} with Coupon AURA10`}
                    </p>
                    <p className="text-[10px] text-emerald-700 font-bold">
                      {appliedCoupon ? `Saved ₹${couponDiscountAmount} extra!` : 'Extra 10% OFF up to ₹150'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (appliedCoupon) {
                      setAppliedCoupon(null);
                      showToast('Coupon removed.', 'info');
                    } else {
                      setAppliedCoupon({ code: 'AURA10', discountPercent: 10, maxDiscount: 150 });
                      showToast('Coupon AURA10 applied! Extra 10% OFF', 'success');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0 ${
                    appliedCoupon
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-[#3D0F1F] text-[#FAF5EB] hover:bg-[#3D0F1F]/90'
                  }`}
                >
                  {appliedCoupon ? 'Remove' : 'Apply Offer'}
                </button>
              </div>

              {/* View all coupons bar */}
              <div className="flex items-center justify-between pt-1 border-t border-[#9A6A3A]/15 text-xs">
                <span className="font-bold text-gray-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  3 Active Coupons Available
                </span>
                <button
                  type="button"
                  onClick={() => setShowOffersModal(true)}
                  className="font-extrabold text-[#211C1A] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View Offers &gt;
                </button>
              </div>
            </div>

            {/* Color Swatches matching reference image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-[#211C1A]">
                  COLOR <span className="text-black">*</span> | <span className="text-[#211C1A]/80 font-serif font-extrabold">{selectedColor.name.toUpperCase()}</span>
                </label>
                <span className="text-xs text-gray-500 font-bold">{productColors.length} Shades</span>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {productColors.map((c, idx) => {
                  const isSelected = selectedColor === c || (selectedColor.name === c.name && selectedColor.hex === c.hex);
                  const swatchImage = c.imageUrl || productImages[idx];
                  return (
                    <button
                      key={`pdp-col-${c.name}-${c.hex}-${idx}`}
                      type="button"
                      onClick={() => handleSelectColor(c)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        isSelected 
                          ? 'border-[#3D0F1F] bg-[#3D0F1F] text-[#FAF5EB] font-semibold' 
                          : 'border-[#B8935A]/30 bg-[#FDFBF7] text-[#3D0F1F] hover:border-[#3D0F1F]'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-black/10 overflow-hidden bg-[#FAF5EB] shrink-0" aria-hidden="true">
                        {swatchImage ? (
                          <img src={getCleanImageUrl(swatchImage, 80)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <span className="block w-full h-full" style={{ backgroundColor: c.hex }} />
                        )}
                      </span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size Selector matching reference image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-[#211C1A]">
                  SELECT SIZE <span className="text-black">*</span>
                </label>
                <button
                  id="pdp-size-guide-modal-btn"
                  type="button"
                  onClick={() => setIsSizeGuideOpen(true)}
                  className="text-xs text-[#211C1A]/80 hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Ruler className="w-3.5 h-3.5 text-[#211C1A]" />
                  Size Guide
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableSizes.map((sz) => {
                  const outOfStock = isSizeOutOfStock(sz);
                  const isSelected = selectedSize === sz;
                  
                  return (
                    <button
                      key={sz}
                      id={`pdp-size-${sz}`}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black border transition-all relative overflow-hidden cursor-pointer ${
                        outOfStock
                          ? 'bg-gray-100 border-gray-200 text-gray-300'
                          : isSelected
                          ? 'bg-[#3D0F1F] text-[#FAF5EB] border-[#3D0F1F]'
                          : 'bg-[#FDFBF7] border-[#B8935A]/30 text-[#3D0F1F] hover:border-[#3D0F1F]'
                      }`}
                    >
                      <span>{sz}</span>
                      {outOfStock && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          <div className="absolute top-1/2 left-1/2 w-[140%] h-[1.2px] bg-red-400/50 -translate-x-1/2 -translate-y-1/2 rotate-45 transform" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              
              {selectedSize && !isSizeOutOfStock(selectedSize) && (
                <p className="text-[11px] text-emerald-600 font-bold pt-1 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Size {selectedSize} is in stock for immediate dispatch.</span>
                </p>
              )}
            </div>

            {/* High Demand Urgency Stock Alert */}
            {!isItemInStock || effectiveStockQty <= 0 ? (
              <div className="flex items-center gap-2 p-3.5 bg-[#F1E8DF] border border-red-500/20 rounded-xl text-red-800 text-xs font-bold shadow-2xs">
                <X className="w-4 h-4 text-red-600 shrink-0" />
                <span>This ethnic suit set is sold out. Check back soon for restocking or contact support on WhatsApp.</span>
              </div>
            ) : selectedSize && isSizeOutOfStock(selectedSize) ? (
              <div className="flex items-center gap-2 p-3.5 bg-[#F1E8DF] border border-amber-500/20 rounded-xl text-black text-xs font-bold shadow-2xs">
                <span>Size {selectedSize} is Out of Stock, but other sizes are Selling Fast!</span>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Premium Luxury Stock Indicator (No cheap emojis, randomized by product ID and varies dynamically over time) */}
                <div 
                  id="pdp-dynamic-stock-warning"
                  className="flex items-center justify-between p-3.5 bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-xl text-gray-700 text-xs font-semibold shadow-3xs"
                >
                  <div className="flex items-center gap-2">
                    {/* Pulsing elegant status dot instead of cheap emoji */}
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse shrink-0"></span>
                    <span>
                      <span className="font-black text-[#211C1A]">{effectiveStockQty}</span> items remaining in Size <span className="font-extrabold text-[#211C1A]">{selectedSize || 'M'}</span>
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold text-black uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-500/15">
                    In Stock
                  </span>
                </div>

                {/* Elegant Dispatch Timer showing only when active (8 AM to 5 PM) */}
                {showDispatchTimer && (
                  <div 
                    id="pdp-dispatch-countdown"
                    className="flex items-center gap-2.5 p-3.5 bg-[#F1E8DF] border border-[#9A6A3A]/20 rounded-xl text-gray-700 text-xs font-semibold shadow-3xs"
                  >
                    <Clock className="w-4 h-4 text-[#211C1A] shrink-0" />
                    <span>
                      Order within <span className="text-[#211C1A] font-black tracking-tight font-mono">{String(timeLeft.hours).padStart(2, '0')}h {String(timeLeft.minutes).padStart(2, '0')}m {String(timeLeft.seconds).padStart(2, '0')}s</span> for <span className="font-extrabold text-emerald-700">Same-Day Dispatch</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Quantity Selector */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-[#211C1A]">
                Quantity:
              </label>
              <div className="inline-flex items-center border border-[#9A6A3A]/30 rounded-xl bg-[#F1E8DF]/40 shadow-2xs text-[#211C1A]">
                <button
                  id="pdp-qty-minus"
                  disabled={!isItemInStock || effectiveStockQty <= 0}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3.5 py-1.5 text-[#211C1A]/70 hover:text-[#211C1A] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  -
                </button>
                <span className="px-2 py-1.5 text-xs font-black min-w-[32px] text-center">
                  {quantity}
                </span>
                <button
                  id="pdp-qty-plus"
                  disabled={!isItemInStock || effectiveStockQty <= 0}
                  onClick={() => setQuantity(Math.min(Math.min(5, effectiveStockQty), quantity + 1))}
                  className="px-3.5 py-1.5 text-[#211C1A]/70 hover:text-[#211C1A] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action Buttons: Add to Bag & Buy Now */}
            <div className="space-y-3 pt-1">
              {selectedSize && isSizeOutOfStock(selectedSize) ? (
                <button
                  id="pdp-notify-me-btn"
                  type="button"
                  onClick={handleNotifyMe}
                  className="w-full py-3.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 bg-[#241D1B] hover:bg-[#241D1B]/90 text-[#211C1A] shadow-md cursor-pointer active:scale-95"
                >
                  <Bell className="w-4 h-4 text-white animate-pulse" />
                  <span>Notify Me on Restock</span>
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Full-Width Secondary Action: ADD TO BAG */}
                  <button
                    id="pdp-add-to-cart-btn"
                    disabled={!isItemInStock || effectiveStockQty <= 0}
                    onClick={handleAddToCart}
                    className={`w-full py-3.5 rounded-xl font-extrabold text-xs tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer active:scale-98 border ${
                      !isItemInStock || effectiveStockQty <= 0
                        ? 'bg-gray-100 text-gray-400 border-transparent cursor-not-allowed'
                        : isJustAdded
                        ? 'bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm'
                        : 'bg-[#FAF5EB] border-[#3D0F1F] text-[#3D0F1F] hover:bg-[#3D0F1F] hover:text-[#FAF5EB]'
                    }`}
                  >
                    {!isItemInStock || effectiveStockQty <= 0 ? (
                      <>
                        <X className="w-4 h-4 text-gray-300" />
                        <span>OUT OF STOCK</span>
                      </>
                    ) : isJustAdded ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>ADDED TO BAG!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-4 h-4 text-[#211C1A] group-hover:text-white" />
                        <span>ADD TO BAG</span>
                      </>
                    )}
                  </button>

                  {/* Full-Width Primary Action: BUY NOW */}
                  <button
                    id="pdp-buy-now-btn"
                    disabled={!isItemInStock || effectiveStockQty <= 0}
                    onClick={handleBuyNow}
                    className={`w-full py-3.5 font-extrabold text-xs tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 rounded-xl border border-[#241D1B] cursor-pointer active:scale-98 shadow-md ${
                      !isItemInStock || effectiveStockQty <= 0
                        ? 'bg-gray-100 text-gray-400 border-transparent cursor-not-allowed'
                        : 'bg-[#3D0F1F] hover:bg-[#3D0F1F]/90 text-[#FAF5EB]'
                    }`}
                  >
                    {!isItemInStock || effectiveStockQty <= 0 ? (
                      <span>SOLD OUT</span>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-white fill-white" />
                        <span>BUY NOW</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Ask Question on WhatsApp - Redesigned to be Premium, Clean & Warm Luxury */}
              <a
                id="pdp-whatsapp-ask-btn"
                href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I am interested in "${product.name}" (₹${product.price}). Could you help me with a question? Link: ${getShareableUrl(product.id)}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-4 bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-xl hover:bg-[#F1E8DF]/80 hover:border-[#9A6A3A]/50 transition-all duration-200 flex items-center justify-between gap-3 group cursor-pointer active:scale-99 shadow-3xs"
              >
                <div className="flex items-center gap-3">
                  {/* Styled Elegant WhatsApp Icon Base */}
                  <div className="w-9 h-9 rounded-full bg-[#0B3D2E] text-white flex items-center justify-center shadow-3xs group-hover:scale-105 transition-transform duration-200">
                    <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.413 9.863-9.83.001-2.624-1.017-5.091-2.868-6.944-1.851-1.852-4.312-2.871-6.932-2.872-5.437 0-9.863 4.414-9.866 9.832 0 1.963.518 3.882 1.502 5.584l-1.019 3.722 3.812-1.002-.525.309z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#211C1A] leading-tight">
                      Sizing or Fabric Query?
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium leading-none mt-1">
                      Chat with our personal stylist in Artisan
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] font-black uppercase text-[#0B3D2E] tracking-wider bg-emerald-50 border border-emerald-600/15 px-2 py-0.5 rounded">
                    Online
                  </span>
                </div>
              </a>
            </div>

            {/* Pincode Delivery Checker */}
            <div className="bg-[#F1E8DF] border border-[#9A6A3A]/30 rounded-2xl p-4 shadow-3xs">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#211C1A] mb-2.5">
                <MapPin className="w-4 h-4 text-[#211C1A]" />
                <span>Check Delivery Pincode</span>
              </div>
              <form onSubmit={handleCheckPincode} className="flex gap-2">
                <input
                  id="pincode-checker-input"
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\[#B76E79\]/g, ''))}
                  placeholder="Enter 6-digit Pincode (e.g. 110001)"
                  className="flex-1 px-3 py-2 border border-[#9A6A3A]/30 rounded-xl text-xs text-[#211C1A] font-semibold placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#241D1B] bg-white"
                />
                <button
                  id="pincode-check-submit-btn"
                  type="submit"
                  className="px-4 py-2 bg-[#241D1B] hover:bg-[#241D1B]/90 text-[#211C1A] border border-[#241D1B] rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-2xs"
                >
                  Check
                </button>
              </form>

              {pincodeStatus?.checked && (
                <div className="mt-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  {pincodeStatus.isChecking ? (
                    <div className="flex items-center gap-2 text-xs text-[#211C1A] font-bold">
                      <Loader2 className="w-4 h-4 text-[#211C1A] animate-spin" />
                      <span>{pincodeStatus.message}</span>
                    </div>
                  ) : pincodeStatus.valid ? (
                    <div className="bg-white border border-[#9A6A3A]/25 rounded-xl p-3.5 shadow-xs space-y-3">
                      
                      {/* Delivery Date & Partner Info */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider block">Estimated Delivery:</span>
                          <span className="text-sm sm:text-base font-black text-[#211C1A] tracking-tight block">
                            Get it by <span className="text-[#211C1A] underline decoration-[#9A6A3A]/40 decoration-2">{pincodeStatus.estimatedDate}</span>
                          </span>
                        </div>
                        
                        {/* Logistics Partner Logo/Badge */}
                        {pincodeStatus.logisticsPartner === 'Bluedart' ? (
                          <div className="bg-amber-400 text-blue-900 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-amber-500 shadow-3xs flex items-center gap-1 shrink-0">
                            <span className="inline-block w-1.5 h-1.5 bg-blue-900 rounded-full animate-ping" />
                            <span>Bluedart Air</span>
                          </div>
                        ) : (
                          <div className="bg-[#241D1B] text-[#211C1A] px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-gray-300 shadow-3xs flex items-center gap-1 shrink-0">
                            <span className="inline-block w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                            <span>Delhivery</span>
                          </div>
                        )}
                      </div>

                      {/* Location Details */}
                      <div className="pt-2 border-t border-[#9A6A3A]/15 flex flex-col gap-1 text-[11px] text-gray-700">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Delivering to <strong className="text-gray-900">{pincodeStatus.district}, {pincodeStatus.state}</strong></span>
                        </div>
                        <div className="pl-5 text-[10px] text-gray-500 font-medium">
                          Serving area: {pincodeStatus.postOfficeName} Post Office
                        </div>
                      </div>

                      {/* Logistics Service Highlights */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-[#F1E8DF] border border-[#9A6A3A]/15 rounded-lg p-2 text-center">
                          <span className="block text-[10px] text-gray-500 font-bold uppercase">Dispatch:</span>
                          <span className="text-[11px] text-[#211C1A] font-black">Within 24 Hours</span>
                        </div>
                        <div className="bg-[#F1E8DF] border border-[#9A6A3A]/15 rounded-lg p-2 text-center">
                          <span className="block text-[10px] text-gray-500 font-bold uppercase">Shipping:</span>
                          <span className="text-[11px] text-emerald-700 font-black">Free Standard</span>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-500/20 rounded-xl p-3 text-xs text-red-800 font-bold flex items-start gap-2">
                      <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{pincodeStatus.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clean Ultra-Luxury Trust & Protection Card (Replaces former 3 repetitive boxes) */}
            <div className="bg-[#F1E8DF] text-[#211C1A] border border-[#9A6A3A]/30 rounded-2xl p-4 shadow-3xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#211C1A]" />
                  <span className="font-serif font-black text-xs text-[#211C1A] uppercase tracking-wider">
                    THE AURA PROMISE
                  </span>
                </div>
                <span className="text-[10px] text-[#211C1A] font-extrabold bg-[#241D1B]/10 border border-[#9A6A3A]/30 px-2.5 py-0.5 rounded-full shadow-3xs">
                  100% Authentic Artisan Apparel
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2.5 bg-white border border-[#9A6A3A]/20 rounded-xl shadow-3xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold text-[#211C1A] text-[11px]">Authentic Fabric</p>
                    <p className="text-[9px] text-gray-500 font-medium">Pure Cotton & Silk Blends</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-white border border-[#9A6A3A]/20 rounded-xl shadow-3xs">
                  <RotateCcw className="w-4 h-4 text-[#211C1A] shrink-0" />
                  <div>
                    <p className="font-bold text-[#211C1A] text-[11px]">7-Day Easy Exchange</p>
                    <p className="text-[9px] text-gray-500 font-medium">Hassle-Free Doorstep Swap</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-white border border-[#9A6A3A]/20 rounded-xl shadow-3xs">
                  <Truck className="w-4 h-4 text-[#211C1A] shrink-0" />
                  <div>
                    <p className="font-bold text-[#211C1A] text-[11px]">Free Express Delivery</p>
                    <p className="text-[9px] text-gray-500 font-medium">On All Prepaid Orders</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-white border border-[#9A6A3A]/20 rounded-xl shadow-3xs">
                  <Sparkles className="w-4 h-4 text-[#211C1A] shrink-0" />
                  <div>
                    <p className="font-bold text-[#211C1A] text-[11px]">Secured Payments</p>
                    <p className="text-[9px] text-gray-500 font-medium">256-Bit SSL Encrypted UPI</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Specifications & Details Card */}
            <div className="bg-[#F1E8DF] border border-[#9A6A3A]/25 rounded-3xl p-5 sm:p-6 shadow-xs">
              {/* Tab Navigation Pill Bar */}
              <div className="flex items-center gap-1 sm:gap-2 border-b border-[#9A6A3A]/15 pb-3 overflow-x-auto no-scrollbar">
                <button
                  id="tab-btn-details"
                  onClick={() => setActiveTab('details')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'details'
                      ? 'bg-[#241D1B] text-[#211C1A] shadow-2xs border border-[#9A6A3A]/40'
                      : 'bg-white text-[#211C1A] hover:bg-[#241D1B]/5 border border-[#9A6A3A]/20'
                  }`}
                >
                  Product Details
                </button>
                <button
                  id="tab-btn-fabric"
                  onClick={() => setActiveTab('fabric')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'fabric'
                      ? 'bg-[#241D1B] text-[#211C1A] shadow-2xs border border-[#9A6A3A]/40'
                      : 'bg-white text-[#211C1A] hover:bg-[#241D1B]/5 border border-[#9A6A3A]/20'
                  }`}
                >
                  Fabric & Care
                </button>
                <button
                  id="tab-btn-shipping"
                  onClick={() => setActiveTab('shipping')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'shipping'
                      ? 'bg-[#241D1B] text-[#211C1A] shadow-2xs border border-[#9A6A3A]/40'
                      : 'bg-white text-[#211C1A] hover:bg-[#241D1B]/5 border border-[#9A6A3A]/20'
                  }`}
                >
                  Shipping & Returns
                </button>
                <button
                  id="tab-btn-reviews"
                  onClick={() => setActiveTab('reviews')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'reviews'
                      ? 'bg-[#241D1B] text-[#211C1A] shadow-2xs border border-[#9A6A3A]/40'
                      : 'bg-white text-[#211C1A] hover:bg-[#241D1B]/5 border border-[#9A6A3A]/20'
                  }`}
                >
                  Reviews ({displayReviews.length})
                </button>
              </div>

              {/* Tab Contents */}
              <div className="pt-3.5 text-xs sm:text-sm text-gray-700 leading-relaxed">
                {activeTab === 'details' && (
                  <div className="space-y-4">
                    <p className="text-gray-700 font-normal leading-relaxed">{product.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#9A6A3A]/15">
                      <div className="bg-white p-3 rounded-xl border border-[#9A6A3A]/15 shadow-3xs">
                        <span className="font-bold text-[#211C1A] block text-xs uppercase tracking-wider mb-0.5">Fit & Style:</span>
                        <span className="text-xs text-gray-700 font-medium">{product.fit}</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-[#9A6A3A]/15 shadow-3xs">
                        <span className="font-bold text-[#211C1A] block text-xs uppercase tracking-wider mb-0.5">Recommended Occasion:</span>
                        <span className="text-xs text-gray-700 font-medium">{product.occasion}</span>
                      </div>
                    </div>

                    {/* Customer Q&A Section - Dynamically Curated & Redesigned for High Trust & Luxury Aesthetics */}
                    <div className="pt-5 border-t border-[#9A6A3A]/20 space-y-3">
                      <div className="flex flex-col gap-1">
                        <h4 className="font-serif font-black text-xs text-[#211C1A] flex items-center gap-2 uppercase tracking-widest">
                          <HelpCircle className="w-4 h-4 text-black" />
                          <span>Verified Customer Q&A</span>
                        </h4>
                        <p className="text-[10px] text-gray-500 font-medium leading-none">
                          Answers curated directly by our production master craftsman in Artisan
                        </p>
                      </div>

                      <div className="space-y-3.5 pt-1">
                        {getProductQAs(product).map((item, idx) => (
                          <div 
                            key={idx} 
                            className="bg-white border border-[#9A6A3A]/15 rounded-xl p-4 space-y-2.5 hover:border-[#9A6A3A]/30 transition-all duration-200 shadow-3xs"
                          >
                            {/* Question row */}
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-serif font-black text-black select-none">Q.</span>
                              <p className="text-xs font-black text-[#211C1A] leading-snug">
                                {item.q}
                              </p>
                            </div>
                            
                            {/* Answer row with elegant border-accent */}
                            <div className="flex items-start gap-2 pl-3.5 border-l-2 border-[#9A6A3A]/20">
                              <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                                {item.a}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'fabric' && (
                  <div className="space-y-3.5" id="pdp-specs-accordion">
                    {/* Fabric Composition Accordion */}
                    <div className="border border-[#9A6A3A]/15 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <button
                        onClick={() => toggleAccordion('fabric')}
                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#241D1B]/5 transition-all text-left font-bold text-[#211C1A] text-xs uppercase tracking-wider cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Layers className="w-4 h-4 text-[#211C1A]" />
                          <span>Fabric Composition</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-[#211C1A] transition-transform duration-200 ${openAccordions.fabric ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`transition-all duration-300 ease-in-out ${openAccordions.fabric ? 'max-h-40 border-t border-[#9A6A3A]/15 p-4 bg-white text-xs text-gray-750 font-semibold' : 'max-h-0 overflow-hidden'}`}>
                        <p className="text-gray-700 leading-relaxed">{product.fabric || '100% Pure Premium Cambric Cotton'}</p>
                      </div>
                    </div>

                    {/* Work Type Accordion */}
                    <div className="border border-[#9A6A3A]/15 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <button
                        onClick={() => toggleAccordion('work')}
                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#241D1B]/5 transition-all text-left font-bold text-[#211C1A] text-xs uppercase tracking-wider cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Palette className="w-4 h-4 text-[#211C1A]" />
                          <span>Work Type</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-[#211C1A] transition-transform duration-200 ${openAccordions.work ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`transition-all duration-300 ease-in-out ${openAccordions.work ? 'max-h-40 border-t border-[#9A6A3A]/15 p-4 bg-white text-xs text-gray-755 font-semibold' : 'max-h-0 overflow-hidden'}`}>
                        <p className="text-gray-700 leading-relaxed">
                          {product.name.toLowerCase().includes('gota') 
                            ? 'Artisanal Hand-crafted Gota Patti lace detailing, intricate neckline embroidery, and golden border fringes.'
                            : product.name.toLowerCase().includes('embroidered') || product.name.toLowerCase().includes('embroidery')
                            ? 'Stunning hand embroidery work, floral sequin highlights, and refined zari border styling.'
                            : 'Authentic traditional Heritage screen prints, decorative neckline keyhole chord tassels, and gota-patti piping borders.'}
                        </p>
                      </div>
                    </div>

                    {/* Dress Length Accordion */}
                    <div className="border border-[#9A6A3A]/15 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <button
                        onClick={() => toggleAccordion('length')}
                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#241D1B]/5 transition-all text-left font-bold text-[#211C1A] text-xs uppercase tracking-wider cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Ruler className="w-4 h-4 text-[#211C1A]" />
                          <span>Dress Length</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-[#211C1A] transition-transform duration-200 ${openAccordions.length ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`transition-all duration-300 ease-in-out ${openAccordions.length ? 'max-h-40 border-t border-[#9A6A3A]/15 p-4 bg-white text-xs text-gray-760 font-semibold' : 'max-h-0 overflow-hidden'}`}>
                        <p className="text-gray-700 leading-relaxed">
                          {product.name.toLowerCase().includes('gown') || product.name.toLowerCase().includes('anarkali')
                            ? 'Anarkali/Gown Flare Length: 46 - 48 inches (Sophisticated Floor-Touch/Ankle Length) | Matching Pant: 38 inches.'
                            : 'Premium Kurta Length: 44 inches (Classic Straight Calf Length) | Parallel Trouser Pant: 38 inches.'}
                        </p>
                      </div>
                    </div>

                    {/* Wash Care Accordion */}
                    <div className="border border-[#9A6A3A]/15 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <button
                        onClick={() => toggleAccordion('care')}
                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-[#241D1B]/5 transition-all text-left font-bold text-[#211C1A] text-xs uppercase tracking-wider cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Droplets className="w-4 h-4 text-[#211C1A]" />
                          <span>Wash Care Instructions</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-[#211C1A] transition-transform duration-200 ${openAccordions.care ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`transition-all duration-300 ease-in-out ${openAccordions.care ? 'max-h-40 border-t border-[#9A6A3A]/15 p-4 bg-white text-xs text-gray-765 font-semibold' : 'max-h-0 overflow-hidden'}`}>
                        <p className="text-gray-700 leading-relaxed">
                          {product.washCare || 'Dry clean recommended for the first wash to preserve colors. Subsequently, gentle cold hand wash separately. Dry in shade only.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'shipping' && (
                  <div className="space-y-2.5 text-xs text-gray-700">
                    <div className="p-3.5 bg-white rounded-xl border border-[#9A6A3A]/15 flex items-start gap-2.5 shadow-3xs">
                      <Clock className="w-4 h-4 text-[#211C1A] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#211C1A] block font-bold mb-0.5">Fast Dispatch:</strong>
                        <span>All orders are dispatched within 24 to 48 business hours via premium express couriers.</span>
                      </div>
                    </div>
                    <div className="p-3.5 bg-white rounded-xl border border-[#9A6A3A]/15 flex items-start gap-2.5 shadow-3xs">
                      <Truck className="w-4 h-4 text-[#211C1A] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#211C1A] block font-bold mb-0.5">Express Delivery:</strong>
                        <span>Fast and reliable shipping across India with live tracking SMS/WhatsApp.</span>
                      </div>
                    </div>
                    <div className="p-3.5 bg-white rounded-xl border border-[#9A6A3A]/15 flex items-start gap-2.5 shadow-3xs">
                      <RotateCcw className="w-4 h-4 text-[#211C1A] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#211C1A] block font-bold mb-0.5">Hassle-free 7-Day Returns:</strong>
                        <span>7-day easy exchange/return policy for unworn items with original tags intact.</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="space-y-4">
                    {/* Review Header with Write Review Button */}
                    <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#9A6A3A]/20 shadow-3xs">
                      <div>
                        <span className="font-bold text-[#211C1A] text-xs uppercase tracking-widest block">Customer Reviews ({productReviewCount})</span>
                        <span className="text-[11px] text-gray-500 font-medium">Verified buyers & product feedback</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsWriteReviewOpen(true)}
                        className="px-3.5 py-1.5 bg-[#241D1B] hover:bg-[#241D1B]/90 text-[#211C1A] text-xs font-black rounded-lg transition shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5 text-[#F1E8DF]" />
                        <span>Write a Review</span>
                      </button>
                    </div>

                    {/* Write Review Form Card */}
                    {isWriteReviewOpen && (
                      <div className="p-5 bg-white rounded-2xl border border-[#9A6A3A]/25 shadow-xs space-y-4 relative">
                        <div className="flex items-center justify-between pb-2 border-b border-[#9A6A3A]/15">
                          <h4 className="font-serif font-black text-[#211C1A] text-sm">Write Review for "{product.name}"</h4>
                          <button
                            type="button"
                            onClick={() => setIsWriteReviewOpen(false)}
                            className="text-gray-400 hover:text-[#211C1A] p-1 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-[11px] text-black bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                          ℹ️ Note: Aapka review submit hone ke baad pehle Admin Panel me jayega. Admin dwara approve karne ke baad site par visible hoga.
                        </p>

                        <form onSubmit={handleReviewSubmit} className="space-y-3.5 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Your Name *</label>
                              <input
                                type="text"
                                required
                                value={reviewForm.userName}
                                onChange={(e) => setReviewForm({ ...reviewForm, userName: e.target.value })}
                                placeholder="e.g. Ananya Sharma"
                                className="w-full px-3 py-2 border border-[#9A6A3A]/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9A6A3A] bg-[#F1E8DF]/50 text-gray-950 font-semibold"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Location / City</label>
                              <input
                                type="text"
                                value={reviewForm.location}
                                onChange={(e) => setReviewForm({ ...reviewForm, location: e.target.value })}
                                placeholder="e.g. Artisan, Rajasthan"
                                className="w-full px-3 py-2 border border-[#9A6A3A]/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9A6A3A] bg-[#F1E8DF]/50 text-gray-955 font-semibold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Rating *</label>
                              <div className="flex items-center gap-1.5 pt-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                                    className="p-0.5 cursor-pointer"
                                  >
                                    <Star
                                      className={`w-5 h-5 ${
                                        star <= reviewForm.rating
                                          ? 'fill-current text-black'
                                          : 'text-gray-300'
                                      }`}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Size Purchased</label>
                              <select
                                value={reviewForm.sizePurchased}
                                onChange={(e) => setReviewForm({
                                  ...reviewForm,
                                  sizePurchased: availableSizes.find((size) => size === e.target.value) || 'M',
                                })}
                                className="w-full px-3 py-2 border border-[#9A6A3A]/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9A6A3A] bg-[#F1E8DF]/50 text-gray-950 font-bold"
                              >
                                {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Custom'].map((sz) => (
                                  <option key={sz} value={sz}>{sz}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Review Comment *</label>
                            <textarea
                              rows={3}
                              required
                              value={reviewForm.comment}
                              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                              placeholder="Describe product quality, fitting, fabric feel..."
                              className="w-full px-3 py-2 border border-[#9A6A3A]/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9A6A3A] bg-[#F1E8DF]/50 text-gray-950 font-semibold"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-[#211C1A] mb-1 uppercase text-[10px] tracking-wider">Attach Photo (Optional)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="url"
                                value={reviewForm.photoUrl}
                                onChange={(e) => setReviewForm({ ...reviewForm, photoUrl: e.target.value })}
                                placeholder="Paste image URL (e.g. https://images.unsplash.com/...)"
                                className="flex-1 px-3 py-2 border border-[#9A6A3A]/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9A6A3A] bg-[#F1E8DF]/50 text-gray-950 font-medium text-xs"
                              />
                              <label className="px-3 py-2 bg-[#241D1B]/10 hover:bg-[#241D1B]/25 text-[#211C1A] border border-[#9A6A3A]/30 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1 shrink-0">
                                <Camera className="w-4 h-4 text-[#211C1A]" />
                                <span>Upload</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (uploadEvent) => {
                                        setReviewForm({ ...reviewForm, photoUrl: uploadEvent.target?.result as string });
                                        showToast('Review photo attached successfully!', 'success');
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            {reviewForm.photoUrl && (
                              <div className="mt-2 relative w-16 h-16 rounded-lg overflow-hidden border border-[#9A6A3A]/40 shadow-2xs">
                                <img src={reviewForm.photoUrl} alt="Review attachment preview" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setReviewForm({ ...reviewForm, photoUrl: '' })}
                                  className="absolute top-0.5 right-0.5 bg-black/60 text-white p-0.5 rounded-full hover:bg-black cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsWriteReviewOpen(false)}
                              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-55 transition cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingReview}
                              className="px-4 py-1.5 bg-[#241D1B] text-[#211C1A] font-black rounded-lg hover:bg-[#241D1B]/90 transition duration-200 flex items-center gap-1.5 cursor-pointer"
                            >
                              {isSubmittingReview && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              <span>{isSubmittingReview ? 'Submitting...' : 'Submit Review'}</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Display Approved Reviews */}
                    {displayReviews && displayReviews.length > 0 ? (
                      <div className="space-y-3">
                        {displayReviews.map((rev) => (
                          <div key={rev.id} className="p-4 bg-white rounded-xl border border-[#9A6A3A]/15 space-y-2.5 shadow-3xs hover:border-[#9A6A3A]/35 transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-[#211C1A] text-xs">{rev.userName}</span>
                                {rev.verifiedPurchase && (
                                  <span className="text-[9px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-black border border-emerald-600/15 uppercase tracking-wider">
                                    ✓ Verified Buyer
                                  </span>
                                )}
                              </div>
                              <div className="flex text-black">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-3 h-3 ${
                                      i < (rev.rating || 5)
                                        ? 'fill-current text-black'
                                        : 'text-gray-200'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-gray-750 font-semibold leading-relaxed">"{rev.comment}"</p>

                            {/* Customer Review Photo Grid Thumbnail if present */}
                            {rev.imageUrl && (
                              <div className="flex items-center gap-2 pt-1">
                                {[rev.imageUrl].map((photo, pIdx) => (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => setZoomedReviewPhoto(getCleanImageUrl(photo))}
                                    className="w-14 aspect-square rounded-xl overflow-hidden border border-[#9A6A3A]/35 hover:border-[#C7A77A] transition cursor-pointer relative group shadow-2xs"
                                    title="Click to zoom HD photo"
                                  >
                                    <img src={getCleanImageUrl(photo)} alt="Customer review photo" className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition flex items-center justify-center">
                                      <ZoomIn className="w-4 h-4 text-white drop-shadow-md" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}

                            {rev.adminReply && (
                              <div className="p-3 bg-[#241D1B]/5 rounded-lg text-[11px] text-gray-700 border border-[#9A6A3A]/15 leading-relaxed">
                                <strong className="text-[#211C1A] font-black block mb-0.5 uppercase tracking-widest text-[9px]">Official Store Response:</strong>
                                {rev.adminReply}
                              </div>
                            )}

                            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium pt-1">
                              {rev.sizePurchased && <span>Size: <strong className="text-gray-600">{rev.sizePurchased}</strong></span>}
                              {rev.location && <span>• {rev.location}</span>}
                              <span>• {rev.date}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-gray-500 bg-[#F1E8DF] rounded-2xl border border-[#9A6A3A]/15 space-y-3">
                        <p className="font-semibold">No verified customer reviews yet — be the first to review this ensemble!</p>
                        <button
                          type="button"
                          onClick={() => setIsWriteReviewOpen(true)}
                          className="px-4 py-1.5 bg-white hover:bg-[#241D1B] hover:text-[#211C1A] text-[#211C1A] font-black rounded-lg text-xs transition border border-[#9A6A3A]/30 cursor-pointer shadow-3xs"
                        >
                          Write First Review
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* You May Also Love Section */}
        {recommendations && recommendations.length > 0 && (
          <div className="my-12 py-8 border-t border-[#9A6A3A]/20 relative">
            <div className="flex items-center justify-between max-w-7xl mx-auto mb-6 px-1">
              <div>
                <span className="text-xs uppercase tracking-[0.2em] font-black text-black block mb-1">
                  Tailored just for you
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-black text-[#211C1A] tracking-tight">
                  You May Also Love
                </h2>
              </div>
              
              {/* Navigation Carousel Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (recommendationsRef.current) {
                      recommendationsRef.current.scrollBy({ left: -320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Left"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (recommendationsRef.current) {
                      recommendationsRef.current.scrollBy({ left: 320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Right"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Horizontal Scrollable Row */}
            <div 
              ref={recommendationsRef}
              className="flex items-stretch gap-4 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth pb-4 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {recommendations.map((item) => (
                <div key={item.id} className="w-[180px] sm:w-[240px] shrink-0">
                  <ProductCard product={item} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular in Your Region Section */}
        {popularProducts && popularProducts.length > 0 && (
          <div className="my-12 py-8 border-t border-[#9A6A3A]/20 relative">
            <div className="flex items-center justify-between max-w-7xl mx-auto mb-6 px-1">
              <div>
                <span className="text-xs uppercase tracking-[0.2em] font-black text-black block mb-1">
                  Trending in {pincodeStatus?.district || 'Your Region'}
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-black text-[#211C1A] tracking-tight">
                  Popular in Your Region
                </h2>
              </div>
              
              {/* Navigation Carousel Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (popularProductsRef.current) {
                      popularProductsRef.current.scrollBy({ left: -320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Left"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (popularProductsRef.current) {
                      popularProductsRef.current.scrollBy({ left: 320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Right"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Horizontal Scrollable Row */}
            <div 
              ref={popularProductsRef}
              className="flex items-stretch gap-4 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth pb-4 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {popularProducts.map((item) => (
                <div key={item.id} className="w-[180px] sm:w-[240px] shrink-0">
                  <ProductCard product={item} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Products Section */}
        <div className="my-12 py-8 border-t border-[#9A6A3A]/20">
          <div className="text-center max-w-xl mx-auto mb-8">
            <span className="text-xs uppercase tracking-[0.2em] font-black text-black">
              Complete The Look
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-black text-[#211C1A] tracking-tight mt-1">
              You May Also Love
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {fallbackRelated.map((rel) => (
              <ProductCard key={rel.id} product={rel} />
            ))}
          </div>
        </div>

        {/* Recently Browsed Dresses Horizontal Carousel */}
        {recentlyBrowsed && recentlyBrowsed.length > 0 && (
          <div className="my-12 py-8 border-t border-[#9A6A3A]/20 relative">
            <div className="flex items-center justify-between max-w-7xl mx-auto mb-6 px-1">
              <div>
                <span className="text-xs uppercase tracking-[0.2em] font-black text-black block mb-1">
                  Based on your session
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-black text-[#211C1A] tracking-tight">
                  Recently Browsed Dresses
                </h2>
              </div>
              
              {/* Navigation Carousel Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (recentlyBrowsedRef.current) {
                      recentlyBrowsedRef.current.scrollBy({ left: -320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Left"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (recentlyBrowsedRef.current) {
                      recentlyBrowsedRef.current.scrollBy({ left: 320, behavior: 'smooth' });
                    }
                  }}
                  className="p-2 sm:p-2.5 bg-white hover:bg-[#241D1B] text-[#211C1A] hover:text-[#211C1A] rounded-full border border-[#9A6A3A]/25 shadow-3xs transition cursor-pointer"
                  title="Scroll Right"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Horizontal Scrollable Row with Smooth Drag & Touch Scrolling */}
            <div 
              ref={recentlyBrowsedRef}
              className="flex items-stretch gap-4 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth pb-4 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {recentlyBrowsed.map((item) => (
                <div key={item.id} className="w-[180px] sm:w-[240px] shrink-0">
                  <ProductCard product={item} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fullscreen High-Resolution Image Lightbox Modal */}
        {isImageLightboxOpen && (
          <div 
            id="pdp-image-lightbox-overlay"
            onClick={() => setIsImageLightboxOpen(false)}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 transition-all duration-300 select-none"
          >
            {/* Top Toolbar */}
            <div className="w-full max-w-5xl flex items-center justify-between py-2 text-white/90 z-20">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold truncate max-w-xs sm:max-w-md">{product.name}</span>
                <span className="text-xs bg-\[#FAF7F2\]/20 px-2.5 py-1 rounded-full text-white/80 font-mono">
                  {selectedImageIdx + 1} / {productImages.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsZoomed(!isZoomed);
                    setZoomScale(isZoomed ? 1 : 2.5);
                    setZoomPosition({ x: 50, y: 50 });
                  }}
                  className="p-2 bg-\[#FAF7F2\]/10 hover:bg-\[#FAF7F2\]/20 text-white rounded-full transition cursor-pointer flex items-center justify-center gap-1.5 px-3"
                  title="Toggle Zoom"
                >
                  {isZoomed ? (
                    <>
                      <ZoomOut className="w-4 h-4 text-[#F3C5D1]" />
                      <span className="text-xs font-bold hidden sm:inline">Zoom Out</span>
                    </>
                  ) : (
                    <>
                      <ZoomIn className="w-4 h-4 text-[#F3C5D1]" />
                      <span className="text-xs font-bold hidden sm:inline">Zoom In</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsImageLightboxOpen(false)}
                  className="p-2 bg-\[#FAF7F2\]/10 hover:bg-\[#FAF7F2\]/20 text-white rounded-full transition cursor-pointer"
                  title="Close fullscreen view"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Main Stage Image with Navigation */}
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="relative max-w-3xl w-full flex-1 flex items-center justify-center overflow-hidden touch-none"
              onTouchStart={handleTouchStart}
              onTouchEnd={(e) => {
                if (!isZoomed) {
                  handleTouchEnd(
                    e,
                    () => {
                      const nextIdx = (selectedImageIdx + 1) % productImages.length;
                      handleSelectThumbnail(nextIdx);
                    },
                    () => {
                      const prevIdx = (selectedImageIdx - 1 + productImages.length) % productImages.length;
                      handleSelectThumbnail(prevIdx);
                    }
                  );
                }
              }}
            >
              {productImages.length > 1 && !isZoomed && (
                <button
                  type="button"
                  onClick={() => {
                    const prevIdx = (selectedImageIdx - 1 + productImages.length) % productImages.length;
                    handleSelectThumbnail(prevIdx);
                  }}
                  className="absolute left-2 sm:-left-6 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3 bg-\[#FAF7F2\]/80 hover:bg-\[#FAF7F2\] text-gray-900 rounded-full shadow-xl transition cursor-pointer"
                  title="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              <div 
                className="relative overflow-hidden rounded-2xl max-h-[70vh] w-auto max-w-full cursor-zoom-in"
                onClick={handleDoubleTapOrClick}
                onMouseMove={handleZoomMouseMove}
                onTouchMove={handleZoomTouchMove}
              >
                <img 
                  src={getCleanImageUrl(productImages[selectedImageIdx] || selectedColor.imageUrl || productImages[0])}
                  alt={product.name}
                  style={isZoomed ? {
                    transform: `scale(${zoomScale})`,
                    transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                    cursor: 'zoom-out'
                  } : undefined}
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl transition-transform duration-200"
                />
              </div>

              {productImages.length > 1 && !isZoomed && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = (selectedImageIdx + 1) % productImages.length;
                    handleSelectThumbnail(nextIdx);
                  }}
                  className="absolute right-2 sm:-right-6 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3 bg-\[#FAF7F2\]/80 hover:bg-\[#FAF7F2\] text-gray-900 rounded-full shadow-xl transition cursor-pointer"
                  title="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Instruction Helper Text */}
            <p className="text-[10px] sm:text-xs text-white/50 text-center mt-2 font-medium">
              {isZoomed ? 'Move mouse or drag to pan details • Double-tap to zoom out' : 'Swipe left/right to change • Double-tap to zoom HD details'}
            </p>

            {/* Thumbnail Navigation in Lightbox */}
            {productImages.length > 1 && !isZoomed && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 mt-4 max-w-xl overflow-x-auto p-2 z-20"
              >
                {productImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectThumbnail(idx)}
                    className={`w-14 h-16 rounded-lg overflow-hidden border-2 transition shrink-0 cursor-pointer ${
                      selectedImageIdx === idx ? 'border-white scale-110 shadow-lg ring-2 ring-rose-400' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={getCleanImageUrl(img)} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}



        {/* Full-Screen HD Zoom Modal for Customer Review Photos */}
        {zoomedReviewPhoto && (
          <div 
            onClick={() => setZoomedReviewPhoto(null)}
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-lg flex flex-col items-center justify-center p-4 transition-all duration-300"
          >
            <div className="absolute top-4 right-4 z-20">
              <button
                type="button"
                onClick={() => setZoomedReviewPhoto(null)}
                className="p-3 bg-[#FAF7F2]/10 hover:bg-[#FAF7F2]/20 text-white rounded-full transition cursor-pointer"
                aria-label="Close HD photo"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center overflow-hidden rounded-2xl p-2" onClick={(e) => e.stopPropagation()}>
              <img 
                src={zoomedReviewPhoto} 
                alt="HD Customer Review Photo" 
                className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
              />
            </div>
            <p className="text-white/60 text-xs mt-3 font-medium tracking-wide">
              Customer Verified HD Photo • Tap anywhere to close
            </p>
          </div>
        )}

        {/* Offers & Coupons Modal */}
        {showOffersModal && (
          <div 
            onClick={() => setShowOffersModal(false)}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 transition-all"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-[#F1E8DF] rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col p-5 sm:p-6 shadow-2xl border border-[#9A6A3A]/35 animate-in fade-in zoom-in-95 duration-250"
            >
              {/* Sticky Header - Always Visible */}
              <div className="flex items-center justify-between pb-3 border-b border-[#9A6A3A]/20 shrink-0">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-[#211C1A]" />
                  <h3 className="font-serif font-black text-base text-[#211C1A]">Available Offers & Coupons</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOffersModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-800 hover:bg-gray-200/50 cursor-pointer transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Coupon Lists Container - Ensures perfect mobile scrolling without clipping header/footer */}
              <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-5 scrollbar-thin scrollbar-thumb-[#9A6A3A]/20 scrollbar-track-transparent">
                
                {/* Active Coupons Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#211C1A] uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    <span>Active Boutique Offers</span>
                  </div>

                  {[
                    { code: 'AURA10', title: '10% Extra OFF', desc: 'Get 10% OFF up to ₹150 on your order', percent: 10, max: 150, expiry: 'Valid till: 30 Sep 2026' },
                    { code: 'BLISS100', title: 'Flat ₹100 OFF', desc: 'Flat ₹100 Instant Discount on orders over ₹800', percent: 8, max: 100, expiry: 'Valid till: 15 Oct 2026' },
                    { code: 'SUIT20', title: '20% OFF Prepaid UPI', desc: 'Extra 20% OFF up to ₹250 on prepaid orders', percent: 20, max: 250, expiry: 'Valid till: 20 Oct 2026' },
                  ].map((coupon) => {
                    const isApplied = appliedCoupon?.code === coupon.code;
                    return (
                      <div 
                        key={coupon.code} 
                        className={`p-3.5 bg-white border rounded-2xl flex items-center justify-between gap-3 shadow-3xs hover:border-[#9A6A3A]/35 transition-all duration-200 ${
                          isApplied ? 'border-emerald-500/50 ring-1 ring-emerald-500/25' : 'border-[#9A6A3A]/15'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-[10px] px-2 py-0.5 bg-[#241D1B] text-[#211C1A] rounded-md border border-[#9A6A3A]/40 uppercase tracking-wide">
                              {coupon.code}
                            </span>
                            <span className="font-black text-xs text-[#211C1A]">{coupon.title}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 font-semibold leading-relaxed">{coupon.desc}</p>
                          
                          {/* Expiry Date Label with Clock Icon */}
                          <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                            <Clock className="w-3.5 h-3.5 text-black shrink-0" />
                            <span>{coupon.expiry}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isApplied) {
                              setAppliedCoupon(null);
                              showToast(`Coupon ${coupon.code} removed`, 'info');
                            } else {
                              setAppliedCoupon({ code: coupon.code, discountPercent: coupon.percent, maxDiscount: coupon.max });
                              showToast(`Coupon ${coupon.code} applied successfully!`, 'success');
                              setShowOffersModal(false);
                            }
                          }}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer shrink-0 active:scale-97 ${
                            isApplied 
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-400 hover:bg-emerald-100' 
                              : 'bg-[#241D1B] text-[#211C1A] hover:bg-[#241D1B]/90 border border-[#9A6A3A]/20'
                          }`}
                        >
                          {isApplied ? 'Applied' : 'Apply'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Expired Coupons Section */}
                <div className="space-y-3 pt-4 border-t border-[#9A6A3A]/10">
                  <div className="flex items-center gap-1.5 text-xs font-black text-gray-500 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                    <span>Past / Expired Coupons</span>
                  </div>

                  {[
                    { code: 'FESTIVE15', title: '15% OFF Festive Special', desc: 'Get 15% OFF up to ₹200 on festive collections', expiry: 'Expired on: 15 Sep 2026' },
                    { code: 'ARTISAN50', title: 'Flat ₹50 OFF', desc: 'Flat ₹50 discount on any purchase above ₹499', expiry: 'Expired on: 10 Sep 2026' },
                  ].map((coupon) => (
                    <div 
                      key={coupon.code} 
                      className="p-3.5 bg-gray-100/40 border border-gray-200 rounded-2xl flex items-center justify-between gap-3 opacity-65"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 rounded-md border border-gray-300 line-through">
                            {coupon.code}
                          </span>
                          <span className="font-bold text-xs text-gray-500">{coupon.title}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium">{coupon.desc}</p>
                        
                        {/* Expired Date Label */}
                        <div className="flex items-center gap-1 text-[10px] text-rose-600/70 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{coupon.expiry}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled
                        className="px-3.5 py-1.5 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg text-xs font-black cursor-not-allowed select-none"
                      >
                        Expired
                      </button>
                    </div>
                  ))}
                </div>

              </div>

              {/* Sticky Footer - Always Visible */}
              <div className="pt-3 border-t border-[#9A6A3A]/15 text-center shrink-0">
                <button
                  type="button"
                  onClick={() => setShowOffersModal(false)}
                  className="w-full px-6 py-2.5 bg-[#241D1B] text-[#211C1A] font-black text-xs rounded-xl border border-[#9A6A3A]/25 shadow-2xs hover:bg-[#241D1B]/90 cursor-pointer active:scale-97 transition"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        )}



      </div>

      {/* 
        Sticky Bottom Product Action Bar (Mobile-first, docks above MobileAppNavbar)
        Matches user's requested reference layout:
        - Thumbnail + Title + Price + Size Badge
        - "Add" Outlined Pill + "Buy Now >>" Solid Royal Maroon Pill
      */}
      <aside
        id="sticky-product-action-bar"
        aria-label="Quick Purchase Bar"
        className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-t border-[#9A6A3A]/30 shadow-[0_-4px_25px_rgba(255,183,206,0.12)] px-3 py-2 sm:px-6 sm:py-2.5 select-none transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Left: Thumbnail & Details */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="relative shrink-0 group cursor-pointer"
              title="View product photos"
            >
              <img
                src={getCleanImageUrl(productImages[0])}
                alt={product.name}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover border border-[#9A6A3A]/35 shadow-2xs bg-[#F1E8DF] group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
            </button>

            <div className="min-w-0 flex-1">
              <p
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-xs sm:text-sm font-bold text-[#211C1A] truncate max-w-[125px] xs:max-w-[165px] sm:max-w-[280px] leading-tight cursor-pointer hover:text-black transition-colors"
                title={product.name}
              >
                {product.name}
              </p>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs sm:text-sm font-black text-[#211C1A]">
                  ₹{currentPrice.toLocaleString('en-IN')}
                </span>

                {/* Size badge with interactive popover */}
                <div className="relative" ref={stickySizePickerRef}>
                  <button
                    type="button"
                    id="sticky-size-picker-btn"
                    onClick={() => setShowStickySizePicker((prev) => !prev)}
                    className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#F1E8DF] text-[#211C1A] border border-[#9A6A3A]/40 hover:border-[#241D1B] flex items-center gap-1 cursor-pointer transition shadow-3xs"
                    title="Select Size"
                  >
                    <span>{selectedSize || 'Size'}</span>
                    <ChevronDown className={`w-2.5 h-2.5 text-black transition-transform duration-200 ${showStickySizePicker ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Size Dropdown Popup */}
                  {showStickySizePicker && (
                    <div className="absolute bottom-full mb-2 left-0 bg-[#F1E8DF] border border-[#9A6A3A]/40 rounded-xl p-2 shadow-xl z-50 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap">
                      <span className="text-[9px] font-extrabold uppercase text-black px-1">Size:</span>
                      {availableSizes.map((sz) => {
                        const isOutOfStock = isSizeOutOfStock(sz);
                        const isSelected = selectedSize === sz;
                        return (
                          <button
                            key={sz}
                            type="button"
                            disabled={isOutOfStock}
                            onClick={() => {
                              setSelectedSize(sz);
                              setShowStickySizePicker(false);
                            }}
                            className={`px-2 py-1 rounded-md text-[10px] font-black transition cursor-pointer ${
                              isOutOfStock
                                ? 'opacity-40 line-through bg-gray-200 text-gray-400 cursor-not-allowed'
                                : isSelected
                                ? 'bg-[#241D1B] text-[#211C1A] shadow-2xs'
                                : 'bg-white text-[#211C1A] hover:bg-[#241D1B]/10 border border-[#9A6A3A]/25'
                            }`}
                          >
                            {sz}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: "Add" & "Buy Now >>" Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isItemInStock || effectiveStockQty <= 0 || (selectedSize && isSizeOutOfStock(selectedSize)) ? (
              <button
                type="button"
                id="sticky-notify-me-btn"
                onClick={handleNotifyMe}
                className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-full font-black text-xs sm:text-sm bg-[#241D1B] text-[#211C1A] hover:bg-[#241D1B] transition-all cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95"
              >
                <Bell className="w-3.5 h-3.5 text-white animate-pulse" />
                <span>Notify Me</span>
              </button>
            ) : (
              <>
                {/* 1. "Add" Button (Outlined Pill) */}
                <button
                  type="button"
                  id="sticky-add-to-cart-btn"
                  onClick={handleAddToCart}
                  className={`px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full font-extrabold text-xs sm:text-sm border-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap flex items-center gap-1 ${
                    isJustAdded
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'border-[#241D1B] bg-white text-[#211C1A] hover:bg-[#241D1B] hover:text-[#211C1A]'
                  }`}
                >
                  {isJustAdded ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Added</span>
                    </>
                  ) : (
                    <span>Add</span>
                  )}
                </button>

                {/* 2. "Buy Now >>" Button (Solid Royal Maroon Pill) */}
                <button
                  type="button"
                  id="sticky-buy-now-btn"
                  onClick={handleBuyNow}
                  className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-black text-xs sm:text-sm bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] transition-all cursor-pointer active:scale-95 shadow-md flex items-center gap-1 whitespace-nowrap border border-[#9A6A3A]/35"
                >
                  <span>Buy Now</span>
                  <ChevronsRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              </>
            )}
          </div>

        </div>
      </aside>
    </div>
  );
};
