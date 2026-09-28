import React from 'react';
import { useShop } from '../context/ShopContext';
import { Heart, ShoppingBag, Trash2, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';

export const WishlistPage: React.FC = () => {
  const { 
    wishlist, 
    toggleWishlist, 
    moveToCartFromWishlist, 
    setActivePage, 
    navigateToProduct, 
    navigateToCategory,
    products = []
  } = useShop();

  const getCategoryCount = (categoryName: string) => {
    if (!products) return 0;
    const activeProds = products.filter(p => p.inStock);
    if (categoryName === 'Sale') {
      return activeProds.filter(p => p.isSale || p.discount >= 36).length;
    }
    if (categoryName === 'Festive Wear') {
      return activeProds.filter(p => p.category === 'Festive Wear' || p.isFestive).length;
    }
    return activeProds.filter(p => p.category === categoryName).length;
  };

  if (wishlist.length === 0) {
    return (
      <div id="wishlist-empty-state" className="py-16 sm:py-24 bg-[#120205] px-4">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          
          {/* Elegant Artisan Traditional Arch Ornament & Medallion */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Subtle rotating background pattern */}
            <div className="absolute w-44 h-44 rounded-full border border-[#D7B77A]/20 animate-spin-slow opacity-60"></div>
            <div className="absolute w-36 h-36 rounded-full border border-dashed border-[#D7B77A]/30 opacity-80"></div>
            
            {/* The Royal Medallion */}
            <div className="relative w-28 h-28 rounded-full bg-[#180306] border-2 border-[#D7B77A]/50 flex items-center justify-center text-[#F7F0E5] shadow-lg">
              {/* Inner glowing ring */}
              <div className="absolute inset-1.5 rounded-full border border-[#D7B77A]/30 bg-[#5C0B1B]/5 flex items-center justify-center">
                <Heart className="w-11 h-11 text-[#F7F0E5] fill-[#D7B77A]/10 stroke-[1.25] transform group-hover:scale-110 transition duration-300" />
              </div>
              
              {/* Small accent sparkles */}
              <span className="absolute -top-1 -right-1 p-1 bg-[#2A0710] rounded-full border border-[#D7B77A]/40 text-[#F7F0E5]">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Typography & Messaging */}
          <div className="space-y-3 max-w-lg mx-auto">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#F7F0E5] font-black block">
              YOUR PERSONAL VAULT
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-black text-[#F7F0E5] tracking-wide leading-tight">
              Your Wishlist Is Empty
            </h2>
            <div className="w-16 h-0.5 bg-[#D7B77A]/40 mx-auto"></div>
            <p className="text-xs sm:text-sm text-[#F7F0E5]/75 font-medium leading-relaxed pt-2">
              Tap the heart icon on any design while exploring our collections to curate your dream wardrobe of elegant handpicked Artisan couture here.
            </p>
          </div>

          {/* Action Call to Explore */}
          <div className="pt-2">
            <button
              id="empty-wishlist-shop-btn"
              onClick={() => navigateToCategory('All')}
              className="px-10 py-4 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] hover:text-[#F7F0E5] rounded-full text-xs sm:text-sm font-black tracking-[0.2em] uppercase transition-all duration-300 shadow-md border-2 border-[#D7B77A] cursor-pointer"
            >
              DISCOVER FAVORITES
            </button>
          </div>

          {/* Curated Collection Discovery Section */}
          <div className="pt-10 border-t border-[#D7B77A]/20 max-w-xl mx-auto space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#F7F0E5]">
              Or Browse Royal Collections
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { name: 'Suits', label: 'Suits', count: getCategoryCount('Suits') },
                { name: 'Kurtis', label: 'Kurtis', count: getCategoryCount('Kurtis') },
                { name: 'Anarkali', label: 'Anarkalis', count: getCategoryCount('Anarkali') },
                { name: 'Dresses', label: 'Dresses', count: getCategoryCount('Dresses') },
                { name: 'Festive Wear', label: 'Festive Wear', count: getCategoryCount('Festive Wear') },
                { name: 'Sale', label: 'Sale Edition', count: getCategoryCount('Sale'), isSale: true }
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => navigateToCategory(item.name as any)}
                  className="p-3.5 rounded-md bg-[#180306] hover:bg-[#5C0B1B] text-[#F7F0E5] hover:text-[#F7F0E5] border border-[#D7B77A]/30 transition-all duration-300 text-left flex flex-col justify-between min-h-[75px] shadow-2xs group cursor-pointer"
                >
                  <span className={`text-[8px] font-black uppercase tracking-wider ${item.isSale ? 'text-red-600 group-hover:text-red-200' : 'text-[#F7F0E5] group-hover:text-[#F7F0E5]'}`}>
                    {item.count}+ Designs
                  </span>
                  <span className="font-serif text-xs sm:text-sm font-extrabold tracking-wide flex items-center justify-between mt-1">
                    {item.label}
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#F7F0E5]" />
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div id="wishlist-page-container" className="py-12 sm:py-20 bg-[#120205]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-[10px] sm:text-xs text-[#E8D2A4]/55 mb-8 w-fit">
          <button onClick={() => setActivePage('home')} className="hover:text-[#E8D2A4] font-medium">Home</button>
          <ChevronRight className="w-3 h-3 text-[#D7B77A]" />
          <span className="text-[#E8D2A4] font-semibold">My Wishlist</span>
        </nav>

        {/* Title Header with elegant alignment */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10 border-b border-[#D7B77A]/30 pb-6">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#D7B77A] font-semibold block">
              Curated Masterpieces
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#E8D2A4]">
              My Wishlist <span className="font-sans text-lg font-bold text-[#F7F0E5]/55 ml-1">({wishlist.length} {wishlist.length === 1 ? 'Item' : 'Items'})</span>
            </h1>
          </div>
          <button
            onClick={() => navigateToCategory('All')}
            className="text-xs sm:text-sm text-[#E8D2A4] hover:text-[#D7B77A] font-semibold cursor-pointer flex items-center gap-1.5 transition-colors group w-fit"
          >
            Continue Shopping
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Wishlist Items Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {wishlist.map((product) => (
            <div
              key={product.id}
              className="group bg-[#120205] rounded-lg overflow-hidden border border-[#D7B77A]/25 hover:border-[#D7B77A]/60 transition-colors duration-300 flex flex-col justify-between"
            >
              {/* Product Image Stage */}
              <div 
                className="relative aspect-[4/5] overflow-hidden bg-[#180306] cursor-pointer group"
                onClick={() => navigateToProduct(product.id)}
              >
                {product.images[0] ? (
                  <img
                    src={getCleanImageUrl(product.images[0])}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-[#5C0B1B]/5 flex items-center justify-center">
                    <span className="text-[10px] uppercase tracking-wider text-[#F7F0E5]">No Image</span>
                  </div>
                )}

                {/* Exclusive Elegant Off Badge */}
                {product.discount > 0 && (
                    <span className="absolute top-3 left-3 bg-[#D7B77A] text-[#F7F0E5] text-[9px] font-semibold px-2.5 py-1 border border-[#D7B77A]/30 tracking-wider uppercase">
                    {product.discount}% OFF
                  </span>
                )}

                {/* Quick Delete Overlay Button */}
                <button
                  id={`remove-wishlist-item-${product.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWishlist(product);
                  }}
                  className="absolute top-3 right-3 w-8.5 h-8.5 rounded-full bg-[#180306]/95 hover:bg-rose-950/40 text-[#F7F0E5]/55 hover:text-red-600 flex items-center justify-center shadow-xs transition-all duration-200 border border-[#D7B77A]/20 cursor-pointer"
                  title="Remove from wishlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Product Info & CTA */}
              <div className="p-4 flex flex-col flex-1 justify-between bg-[#180306]">
                <div className="space-y-1.5">
                  <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] font-black text-[#F7F0E5]">
                    {product.category}
                  </span>
                  <h3 
                    onClick={() => navigateToProduct(product.id)}
                    className="font-serif text-sm sm:text-base font-bold text-[#F7F0E5] hover:text-[#F7F0E5] truncate cursor-pointer transition-colors"
                  >
                    {product.name}
                  </h3>
                  
                  {/* Pricing Matrix */}
                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="font-serif font-black text-base text-[#F7F0E5]">
                      ₹{product.price.toLocaleString('en-IN')}
                    </span>
                    {product.originalPrice > product.price && (
                      <span className="text-xs line-through text-[#F7F0E5]/55 font-medium">
                        ₹{product.originalPrice.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Royal Move To Bag Button */}
                <div className="pt-4 mt-3 border-t border-[#D7B77A]/10">
                  <button
                    id={`move-to-bag-${product.id}`}
                    onClick={() => moveToCartFromWishlist(product, 'M')}
                    className="w-full py-3 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-97 text-[#F7F0E5] hover:text-[#F7F0E5] rounded text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-1.5 border border-[#D7B77A]/40 shadow-xs cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Move To Bag (M)
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
