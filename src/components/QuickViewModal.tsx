import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { ProductSize, ProductColor } from '../types';
import { getCleanImageUrl, getShareableUrl } from '../utils/imageHelper';
import { getProductReviewCount } from '../utils/reviewsHelper';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Star, 
  Heart, 
  ShoppingBag, 
  Zap,
  Ruler, 
  Check, 
  Truck, 
  ShieldCheck, 
  ArrowRight,
  Share2
} from 'lucide-react';

export const QuickViewModal: React.FC = () => {
  const { 
    quickViewProduct, 
    setQuickViewProduct, 
    addToCart, 
    buyNow,
    toggleWishlist, 
    isInWishlist, 
    setIsSizeGuideOpen,
    navigateToProduct,
    showToast
  } = useShop();

  const productColors = Array.isArray(quickViewProduct?.colors) && quickViewProduct.colors.length > 0
    ? quickViewProduct.colors
    : [{ name: 'Standard', hex: '#241D1B' }];

  const availableSizes: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>('M');
  const [selectedColor, setSelectedColor] = useState<ProductColor>(productColors[0]);
  const [quantity, setQuantity] = useState(1);
  const [isJustAdded, setIsJustAdded] = useState(false);

  // Sync state & handle ESC key whenever quickViewProduct changes
  React.useEffect(() => {
    if (quickViewProduct) {
      setSelectedImageIdx(0);
      let pSizes = quickViewProduct.sizes;
      if (typeof pSizes === 'string') {
        try {
          pSizes = JSON.parse(pSizes);
        } catch {
          pSizes = [];
        }
      }
      setSelectedSize('M');
      const initialColors = (Array.isArray(quickViewProduct.colors) && quickViewProduct.colors.length > 0)
        ? quickViewProduct.colors
        : [{ name: 'Standard', hex: '#241D1B' }];
      setSelectedColor(initialColors[0]);
      setQuantity(1);
      setIsJustAdded(false);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickViewProduct(null);
      }
    };
    if (quickViewProduct) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickViewProduct?.id]);

  const handleSelectColor = (c: ProductColor) => {
    setSelectedColor(c);
    if (c.imageUrl && quickViewProduct?.images) {
      const idx = quickViewProduct.images.findIndex(
        (img) => img === c.imageUrl || (img && c.imageUrl && img.split('/').pop() === c.imageUrl.split('/').pop())
      );
      if (idx !== -1) {
        setSelectedImageIdx(idx);
      }
    }
  };

  const handleSelectThumbnail = (idx: number) => {
    setSelectedImageIdx(idx);
    const targetUrl = quickViewProduct?.images?.[idx];
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

  if (!quickViewProduct) return null;

  const productImages = quickViewProduct.images && quickViewProduct.images.length > 0 
    ? quickViewProduct.images 
    : ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80'];

  const handleAddToCart = () => {
    if (!selectedSize) {
      showToast('Please select a size first.', 'error');
      return;
    }
    addToCart(quickViewProduct, selectedSize, selectedColor, quantity, false);
    setIsJustAdded(true);
    setTimeout(() => {
      setIsJustAdded(false);
      setQuickViewProduct(null);
    }, 1200);
  };

  const handleBuyNow = () => {
    if (!selectedSize) {
      showToast('Please select a size first.', 'error');
      return;
    }
    buyNow(quickViewProduct, selectedSize, selectedColor, quantity);
    setQuickViewProduct(null);
  };

  const isFav = isInWishlist(quickViewProduct.id);

  const handleShare = async () => {
    const shareUrl = getShareableUrl(quickViewProduct.id);

    const shareData = {
      title: quickViewProduct.name,
      text: `Check out ${quickViewProduct.name} at Suit Aura Girls!`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Product link copied to clipboard!', 'success');
      } catch (err) {
        showToast('Failed to copy link.', 'error');
      }
    }
  };

  return (
    <div id="quick-view-modal-overlay" onClick={() => setQuickViewProduct(null)} className="fixed inset-0 z-50 bg-[#5C0B1B]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        id="quick-view-modal"
        onClick={(event) => event.stopPropagation()}
        className="bg-[#180306] rounded-md max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative border border-[#D7B77A]/15 p-6 sm:p-8 animate-in zoom-in-95 duration-200"
      >
        {/* Close Button */}
        <button
          id="close-quick-view-btn"
          onClick={() => setQuickViewProduct(null)}
          className="absolute top-4 right-4 p-2 text-[#F7F0E5]/55 hover:text-[#F7F0E5]/75 rounded-full hover:bg-[#2A0710]/20 transition z-10"
          aria-label="Close Quick View"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8">
          
          {/* Images Section */}
          <div className="md:col-span-6 space-y-3">
            <motion.div 
              className="relative aspect-[3/4] rounded overflow-hidden bg-[#2A0710]/20 border border-[#D7B77A]/15"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50) {
                  setSelectedImageIdx(prev => Math.min(prev + 1, productImages.length - 1));
                } else if (info.offset.x > 50) {
                  setSelectedImageIdx(prev => Math.max(prev - 1, 0));
                }
              }}
            >
              {(productImages[selectedImageIdx] || productImages[0]) ? (
                <img
                  src={getCleanImageUrl(productImages[selectedImageIdx] || productImages[0])}
                  alt={quickViewProduct.name}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full bg-[#5C0B1B] flex items-center justify-center text-[#F7F0E5]/55 text-xs">No image</div>
              )}
              <span className="absolute top-3 left-3 bg-[#5C0B1B] text-[#F7F0E5] text-[11px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                {quickViewProduct.discount}% OFF
              </span>
            </motion.div>

            {/* Thumbnail Selectors */}
            {productImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {productImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectThumbnail(idx)}
                    className={`w-16 h-20 rounded-lg overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                      selectedImageIdx === idx ? 'border-[#D7B77A]/40 scale-105 shadow-sm' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    {img && <img src={getCleanImageUrl(img)} alt="Thumbnail" className="w-full h-full object-cover" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Section */}
          <div className="md:col-span-6 flex flex-col justify-between">
            <div className="space-y-4">
              
              <div>
                <span className="text-xs uppercase tracking-widest font-semibold text-[#D7B77A]">
                  {quickViewProduct.category}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#F7F0E5] mt-1">
                  {quickViewProduct.name}
                </h3>
              </div>

              {/* Rating and Reviews */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#5C0B1B] text-[#FFF7F9] px-2 py-0.5 rounded text-xs font-semibold">
                  <span>{quickViewProduct.rating}</span>
                  <Star className="w-3 h-3 fill-[#D7B77A] text-[#F7F0E5]" />
                </div>
                <span className="text-xs text-[#F7F0E5]/55">
                  ({getProductReviewCount(quickViewProduct.id)} verified reviews)
                </span>
              </div>

              {/* Price Row */}
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-2xl sm:text-3xl font-bold text-[#F7F0E5]">
                  ₹{quickViewProduct.price.toLocaleString('en-IN')}
                </span>
                <span className="text-sm line-through text-[#F7F0E5]/55 font-medium">
                  ₹{quickViewProduct.originalPrice.toLocaleString('en-IN')}
                </span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded-full">
                  Save ₹{(quickViewProduct.originalPrice - quickViewProduct.price).toLocaleString('en-IN')}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#F7F0E5]/75 line-clamp-3 leading-relaxed">
                {quickViewProduct.description}
              </p>

              {/* Color Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 block">
                  Color: <span className="text-[#F7F0E5] font-extrabold normal-case">{selectedColor.name}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {productColors.map((c, idx) => {
                    const isSelected = selectedColor === c || (selectedColor.name === c.name && selectedColor.hex === c.hex && selectedColor.imageUrl === c.imageUrl);
                    return (
                      <button
                        key={`qv-col-${c.name}-${c.hex}-${idx}`}
                        id={`qv-color-${c.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${idx}`}
                        type="button"
                        onClick={() => handleSelectColor(c)}
                        className={`w-7 h-7 rounded-full border-2 p-0.5 transition cursor-pointer ${
                          isSelected 
                            ? 'border-[#D7B77A]/40 scale-110 shadow-sm ring-2 ring-[#D7B77A]/20' 
                            : 'border-[#D7B77A]/15 opacity-80 hover:opacity-100'
                        }`}
                        title={`${c.name} (${c.hex})`}
                      >
                        <div className="w-full h-full rounded-full" style={{ backgroundColor: c.hex }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Size Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75">
                    Select Size: <span className="text-[#C84B70]">*</span>
                  </label>
                  <button
                    id="qv-size-guide-btn"
                    type="button"
                    onClick={() => setIsSizeGuideOpen(true)}
                    className="text-xs text-[#F7F0E5] hover:text-[#C84B70] font-medium flex items-center gap-1 underline underline-offset-2 cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    Size Guide
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-2">
                  {availableSizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
                        selectedSize === sz
                          ? 'bg-[#5C0B1B] text-[#F7F0E5] border-[#D7B77A]/40 shadow-xs'
                          : 'bg-\[#FAF7F2\] text-[#F7F0E5] border-[#D7B77A]/15 hover:border-[#D7B77A]/40 hover:bg-[#2A0710]/50'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
                {!selectedSize && (
                  <p className="text-[11px] text-[#C84B70] mt-1.5 font-medium">
                    * Size selection required to add to bag
                  </p>
                )}
              </div>

            </div>

            {/* Actions: ADD TO BAG + BUY NOW */}
            <div className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="qv-add-to-cart-btn"
                  onClick={handleAddToCart}
                  className={`py-3.5 px-2 rounded font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    isJustAdded
                      ? 'bg-emerald-600 text-[#F7F0E5] border-2 border-emerald-600 shadow-md'
                      : 'bg-\[#FAF7F2\] hover:bg-[#2A0710]/20 border-2 border-[#D7B77A]/40 text-[#F7F0E5] shadow-2xs'
                  }`}
                >
                  {isJustAdded ? (
                    <>
                      <Check className="w-4 h-4 text-[#F7F0E5]" />
                      <span>ADDED!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4 text-[#F7F0E5]" />
                      <span>ADD TO BAG</span>
                    </>
                  )}
                </button>

                <button
                  id="qv-buy-now-btn"
                  onClick={handleBuyNow}
                  className="py-3.5 px-2 bg-luxury-gradient hover:brightness-110 active:scale-95 text-[#F7F0E5] rounded font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-[#F7F0E5] fill-[#D7B77A]" />
                  <span>BUY NOW</span>
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  id="qv-toggle-wishlist-btn"
                  onClick={() => toggleWishlist(quickViewProduct)}
                  className={`flex-1 py-2.5 rounded-lg border transition flex items-center justify-center gap-1.5 text-xs font-bold ${
                    isFav
                      ? 'bg-[#2A0710]/20 border-[#C84B70] text-[#C84B70]'
                      : 'border-[#D7B77A]/15 text-[#F7F0E5]/75 hover:text-[#C84B70] hover:border-[#C84B70]'
                  }`}
                  aria-label="Wishlist"
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                  <span>{isFav ? 'Saved in Wishlist' : 'Add to Wishlist'}</span>
                </button>

                <button
                  id="qv-share-btn"
                  onClick={handleShare}
                  className="px-4 py-2.5 rounded-lg border border-[#D7B77A]/15 text-[#F7F0E5]/75 hover:text-[#C84B70] hover:border-[#C84B70] transition flex items-center justify-center gap-1.5 text-xs font-bold"
                  aria-label="Share Product"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              <button
                id="qv-view-full-details-btn"
                onClick={() => {
                  navigateToProduct(quickViewProduct.id);
                  setQuickViewProduct(null);
                }}
                className="w-full text-center text-xs font-semibold text-[#F7F0E5] hover:text-[#C84B70] py-2 flex items-center justify-center gap-1 group"
              >
                <span>View Full Product Details & Reviews</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
