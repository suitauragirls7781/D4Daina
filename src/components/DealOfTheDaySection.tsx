import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useShop } from '../context/ShopContext';
import { ProductSize } from '../types';
import { 
  Flame, 
  Sparkles, 
  ShoppingBag, 
  Heart, 
  Star, 
  Zap,
  Check,
  Crown,
  Clock,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';

export const DealOfTheDaySection: React.FC = () => {
  const { dealOfTheDay } = useAdmin();
  const { products = [], navigateToProduct, toggleWishlist, isInWishlist, addToCart, buyNow, showToast } = useShop();

  // Selected Product resolution
  const targetProductId = dealOfTheDay?.productId || (products[0]?.id || '');
  const product = products.find((p) => p.id === targetProductId) || products[0];

  const [selectedSize, setSelectedSize] = useState<ProductSize>('M');
  const [isAddedToBag, setIsAddedToBag] = useState<boolean>(false);

  // Time remaining state
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number }>({
    hours: 6,
    minutes: 45,
    seconds: 19
  });

  // Synchronize size selection on product change
  useEffect(() => {
    if (product && product.sizes && product.sizes.length > 0) {
      setSelectedSize(product.sizes[0]);
    }
  }, [product?.id]);

  // Live Timer Countdown Effect (Always 24H or Admin Custom End Time)
  useEffect(() => {
    const calculateTimeLeft = () => {
      let diffMs = 0;
      if (dealOfTheDay?.endTime) {
        const endMs = new Date(dealOfTheDay.endTime).getTime();
        const nowMs = Date.now();
        diffMs = endMs - nowMs;
      }

      // Fallback: If no endTime or if past, default to 24-hour daily countdown to midnight
      if (diffMs <= 0) {
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        diffMs = endOfDay.getTime() - now.getTime();
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs / 1000 / 60) % 60);
      const seconds = Math.floor((diffMs / 1000) % 60);

      return { hours, minutes, seconds };
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [dealOfTheDay?.endTime]);

  // Early return if deal explicitly disabled or no valid product
  if ((dealOfTheDay && dealOfTheDay.enabled === false) || !product) {
    return null;
  }

  // Pricing calculations
  const prodPrice = Number(product.price) || 0;
  const originalPrice = Number(product.originalPrice) || Math.round(prodPrice * 1.85);
  // Show exactly what the bag charges: the cart and checkout use the product's own price,
  // so a separate "deal price" would promise a price the customer never gets.
  const dealPrice = prodPrice;
  const discountPercent = (originalPrice > dealPrice && originalPrice > 0)
    ? Math.round(((originalPrice - dealPrice) / originalPrice) * 100)
    : 0;
  const stockLeft = Math.max(0, Number(product.stockQuantity) || 0);
  const stockNotice = stockLeft > 0 && stockLeft <= 10 ? `Only ${stockLeft} left in stock` : 'In stock, ships in 24–48 hours';

  // Images list
  const productImages = (product.images && product.images.length > 0) 
    ? product.images 
    : [product.image || ELEGANT_PLACEHOLDER_SVG];
  
  // The admin can upload a deal-only photo; otherwise the product's first photo is used
  const heroImage = getCleanImageUrl(dealOfTheDay?.bannerImage || productImages[0]);
  const isWishlisted = isInWishlist(product.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product, selectedSize);
    setIsAddedToBag(true);
    showToast(`Added ${product.name} to Bag at ₹${dealPrice.toLocaleString('en-IN')}!`, 'success');
    setTimeout(() => setIsAddedToBag(false), 2000);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    buyNow(product, selectedSize);
  };

  return (
    <section 
      id="deal-of-the-day-section" 
      className="py-3 sm:py-5 bg-[#2A0710] border-b border-[#D7B77A]/25 relative overflow-hidden"
    >
      <div className="max-w-4xl mx-auto px-3 sm:px-6 relative z-10">

        {/* ============================================================ */}
        {/* 1. HIGH-LEVEL ULTRA LUXURY DIGITAL COUNTDOWN TIMER HEADER   */}
        {/* ============================================================ */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 sm:mb-6 gap-3 sm:gap-4">
          
          {/* Section Pill Badge & Title (Matching FRESH OFF THE LOOM / New Arrivals Exactly) */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2.5 border border-[#D7B77A]/40 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />
              <span>LIMITED TIME OFFER</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F7F0E5] tracking-tight">
              Deal of the Day
            </h2>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/80 mt-1.5 max-w-xl font-normal leading-relaxed">
              Handpicked artisanal ensembles with exclusive festive pricing and limited-time deals.
            </p>
          </div>

          {/* Sleek Compact Micro-Timer Pill (Non-disturbing, Premium Aesthetic) */}
          <div className="inline-flex items-center gap-2 bg-[#5C0B1B] text-[#F7F0E5] px-3 py-1.5 rounded border border-[#D7B77A]/50 shadow-md shrink-0 self-start md:self-end">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#F7F0E5] animate-spin" style={{ animationDuration: '8s' }} />
              <span className="text-[10px] font-serif font-bold uppercase text-[#F7F0E5] tracking-wider">
                ENDS IN
              </span>
            </div>

            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="bg-[#5C0B1B] border border-[#D7B77A]/40 text-[#F7F0E5] font-black px-1.5 py-0.5 rounded text-[11px]">
                {String(timeLeft.hours).padStart(2, '0')}h
              </span>
              <span className="text-[#F7F0E5] font-bold text-[10px] animate-pulse">:</span>
              <span className="bg-[#5C0B1B] border border-[#D7B77A]/40 text-[#F7F0E5] font-black px-1.5 py-0.5 rounded text-[11px]">
                {String(timeLeft.minutes).padStart(2, '0')}m
              </span>
              <span className="text-[#F7F0E5] font-bold text-[10px] animate-pulse">:</span>
              <span className="bg-rose-950 border border-rose-500/60 text-rose-300 font-black px-1.5 py-0.5 rounded text-[11px] animate-pulse">
                {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </div>
          </div>

        </div>

        {/* ============================================================ */}
        {/* 2. COMPACT SINGLE SPOTLIGHT CARD (HERO MATCHING COLOR SYSTEM)*/}
        {/* ============================================================ */}
        <div className="bg-[#180306] rounded-md sm:rounded-md border-2 border-[#D7B77A]/40 shadow-xl overflow-hidden max-w-3xl mx-auto">
          
          {/* Top Dark Banner Header (Matching Hero Slide Style) */}
          <div className="bg-[#5C0B1B] text-[#F7F0E5] px-3.5 sm:px-5 py-2 flex items-center justify-between border-b border-[#D7B77A]/35">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <Crown className="w-3.5 h-3.5 text-[#F7F0E5] shrink-0 animate-pulse" />
              <span className="font-serif font-bold text-[11px] sm:text-xs tracking-wider uppercase text-[#F7F0E5] truncate">
                {dealOfTheDay?.badgeText || `DEAL OF THE DAY - ${product.name}`}
              </span>
            </div>
            
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2A0710]/10 border border-[#D7B77A]/40 text-[#F7F0E5] text-[8px] sm:text-[9px] font-black uppercase tracking-widest shrink-0">
              <Sparkles className="w-2.5 h-2.5 text-[#F7F0E5]" />
              <span>EXCLUSIVE OFFER</span>
            </span>
          </div>

          {/* Card Content: Side-by-Side Horizontal Layout */}
          <div className="p-2.5 sm:p-4 flex flex-row items-center gap-3 sm:gap-4">
            
            {/* Left Image Column (100% Uncropped Aspect Ratio) */}
            <div className="w-[110px] sm:w-[150px] md:w-[170px] shrink-0 relative">
              <div 
                onClick={() => navigateToProduct(product.id)}
                className="relative aspect-[3/4] sm:aspect-[4/5] rounded overflow-hidden border border-[#D7B77A]/30 cursor-pointer group bg-[#2A0710] shadow-2xs p-0.5 flex items-center justify-center"
              >
                <img 
                  src={heroImage} 
                  alt={product.name} 
                  className="w-full h-full object-contain object-center transition-transform duration-500 group-hover:scale-102"
                />

                {/* Wishlist Heart Overlay */}
                <button
                  type="button"
                  id="deal-wishlist-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWishlist(product);
                  }}
                  className={`absolute top-1.5 right-1.5 p-1.5 rounded-full border transition cursor-pointer shadow-xs ${
                    isWishlisted 
                      ? 'bg-[#2A0710] border-rose-300 text-rose-300' 
                      : 'bg-[#180306]/90 border-[#D7B77A]/40 text-[#F7F0E5]/75 hover:text-[#F7F0E5] backdrop-blur-xs'
                  }`}
                  title="Wishlist Product"
                >
                  <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-rose-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Right Details Column */}
            <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2 flex flex-col justify-between">
              
              <div className="space-y-1">
                
                {/* Category & Rating Row */}
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-[#2A0710] text-[#F7F0E5] font-mono font-bold text-[9px] sm:text-[10px] uppercase tracking-wider border border-[#D7B77A]/30 truncate">
                    {product.category || 'KURTIS'}
                  </span>

                  <div className="flex items-center gap-0.5 text-[#F7F0E5] text-[10px] sm:text-xs font-bold shrink-0">
                    <Star className="w-3 h-3 fill-[#D7B77A] text-[#F7F0E5]" />
                    <span>{product.rating ? product.rating.toFixed(1) : '4.9'}</span>
                  </div>
                </div>

                {/* Product Name */}
                <h3 
                  onClick={() => navigateToProduct(product.id)}
                  className="font-serif text-xs sm:text-base font-bold text-[#F7F0E5] leading-tight line-clamp-2 hover:text-[#F7F0E5] transition cursor-pointer"
                >
                  {product.name}
                </h3>

                {/* Pricing Row */}
                <div className="flex items-baseline gap-1.5 flex-wrap pt-0.5">
                  <span className="font-serif text-base sm:text-xl font-black text-[#F7F0E5]">
                    ₹{dealPrice.toLocaleString('en-IN')}
                  </span>

                  {originalPrice > dealPrice && (
                    <span className="text-[10px] sm:text-xs text-[#F7F0E5]/55 line-through font-medium">
                      ₹{originalPrice.toLocaleString('en-IN')}
                    </span>
                  )}

                  {discountPercent > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-[#5C0B1B] text-[#F7F0E5] font-extrabold text-[9px] sm:text-[10px] border border-[#D7B77A]/40">
                      {discountPercent}% OFF
                    </span>
                  )}
                </div>

                {/* Stock Urgency Notice */}
                <div className="text-[10px] sm:text-xs font-bold text-[#F7F0E5] flex items-center gap-1 pt-0.5">
                  <Flame className="w-3 h-3 text-[#F7F0E5] shrink-0" />
                  <span className="truncate">{stockNotice}</span>
                </div>

              </div>

              {/* Action Buttons: ADD TO BAG & BUY NOW (Matching Hero Slides Style) */}
              <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-[#D7B77A]/15">
                <button
                  type="button"
                  id="deal-add-to-bag-btn"
                  onClick={handleAddToCart}
                  className="py-1.5 sm:py-2 px-2 bg-[#2A0710] hover:bg-[#180306] text-[#F7F0E5] font-serif font-bold text-[10px] sm:text-xs uppercase tracking-wider rounded-lg border border-[#D7B77A]/50 flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  {isAddedToBag ? <Check className="w-3 h-3 text-emerald-400" /> : <ShoppingBag className="w-3 h-3 text-[#F7F0E5]" />}
                  <span>{isAddedToBag ? 'ADDED' : 'ADD TO BAG'}</span>
                </button>

                <button
                  type="button"
                  id="deal-buy-now-btn"
                  onClick={handleBuyNow}
                  className="py-1.5 sm:py-2 px-2 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] font-serif font-bold text-[10px] sm:text-xs uppercase tracking-wider rounded-lg border border-[#D7B77A] flex items-center justify-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-[#F7F0E5] fill-[#D7B77A]" />
                  <span>BUY NOW</span>
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
