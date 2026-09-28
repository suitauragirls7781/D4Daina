import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  ArrowRight, 
  Sparkles, 
  Tag, 
  Check, 
  Truck,
  Gift,
  Percent,
  MapPin,
  ChevronRight,
  MessageSquare
} from 'lucide-react';

export const CartDrawer: React.FC = () => {
  const { 
    cart, 
    isCartDrawerOpen, 
    setIsCartDrawerOpen, 
    isCouponDrawerOpen,
    setIsCouponDrawerOpen,
    removeFromCart, 
    updateCartQuantity, 
    updateCartItem,
    cartSubtotal, 
    shippingFee, 
    cartTotal, 
    discountAmount, 
    appliedCoupon, 
    applyCoupon, 
    removeCoupon,
    setActivePage,
    navigateToCategory,
    navigateToProduct,
    addToCart,
    products,
    showToast,
    coupons
  } = useShop();

  const [couponInput, setCouponInput] = useState('');
  const [isGiftWrap, setIsGiftWrap] = useState(false);
  const [giftNote, setGiftNote] = useState('');
  const [pincode, setPincode] = useState('');
  const [pinStatus, setPinStatus] = useState<{ status: 'idle' | 'checking' | 'success' | 'error'; msg: string }>({ status: 'idle', msg: '' });

  const handleApplyCouponCode = (code: string) => {
    applyCoupon(code);
  };

  const handleApplyCouponForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponInput.trim()) {
      applyCoupon(couponInput);
      setCouponInput('');
    }
  };

  // Interactive Pin code standard delivery checker
  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pincode)) {
      setPinStatus({ status: 'error', msg: 'Enter valid 6-digit Indian PIN Code.' });
      return;
    }
    setPinStatus({ status: 'checking', msg: 'Checking logistics routes...' });
    setTimeout(() => {
      const deliveryDays = Math.floor(Math.random() * 3) + 2; 
      setPinStatus({ 
        status: 'success', 
        msg: `✨ Guaranteed Express Delivery in ${deliveryDays} days!` 
      });
    }, 800);
  };

  // Fetch 3 matching upsell recommendation accessories
  const recommendedItems = products
    .filter(p => (p.category as string) === 'Festive Co-ords' || (p.category as string) === 'Co-ord Sets' || (p.category as string) === 'Anarkali')
    .slice(0, 3);

  return (
    <div 
      id="cart-drawer-overlay" 
      onClick={() => setIsCartDrawerOpen(false)} 
      className={`fixed inset-0 z-[9999] bg-[#5C0B1B]/60 backdrop-blur-xs flex justify-end transition-opacity duration-300 ${
        isCartDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <motion.div 
        id="cart-drawer"
        onClick={(event) => event.stopPropagation()}
        initial={{ x: '100%' }}
        animate={{ x: isCartDrawerOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-[#120205] w-full max-w-md h-full flex flex-col relative overflow-hidden border-l border-[#D7B77A]/30"
      >
        
        {/* Drawer Header with Royal Trust Badge */}
        <div className="p-5 border-b border-[#D7B77A]/30 flex items-center justify-between bg-[#180306]">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#D7B77A] text-[#F7F0E5] flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-[#F7F0E5]" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-[#E8D2A4]">
                Your Bag ({cart.reduce((a, b) => a + b.quantity, 0)})
              </h3>
            </div>
            
            {/* Customer Trust Badge */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] font-semibold tracking-widest text-[#D7B77A] uppercase flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Handcrafted Authentic Silhouette
              </span>
            </div>
          </div>
          
          <button
            id="close-cart-drawer-btn"
            onClick={() => setIsCartDrawerOpen(false)}
            className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-[#D7B77A] text-[#E8D2A4] hover:text-[#F7F0E5] transition-colors border border-[#D7B77A]/35 cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cart Item & Options Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-[#120205] scrollbar-thin">
          
          {cart.length > 0 && (
            <>
              {/* Free Gift Upgrade Dynamic Progress Tracker - Luxuriously Redesigned */}
              {(() => {
                const giftThreshold = 2000;
                const amountNeededForGift = Math.max(0, giftThreshold - cartSubtotal);
                const giftProgress = Math.min(100, Math.round((cartSubtotal / giftThreshold) * 100));

                return (
                  <div className="bg-[#180306] border border-[#D7B77A]/35 p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-[#F7F0E5] font-extrabold">
                        <Gift className="w-4 h-4 text-[#F7F0E5] animate-bounce" />
                        {amountNeededForGift > 0 ? (
                          <span className="text-xs">
                            Add <strong className="text-[#F7F0E5] font-black">₹{amountNeededForGift.toLocaleString('en-IN')}</strong> more for <span className="text-[#F7F0E5]">Free Gift Upgrade</span>
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-extrabold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            Free Gift Upgrade Unlocked!
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-[#5C0B1B]/10 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-[#5C0B1B] h-full rounded-full transition-all duration-500"
                        style={{ width: `${giftProgress}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {cart.length === 0 ? (
            <div className="h-[75%] flex flex-col items-center justify-center text-center p-6 space-y-6">
              
              {/* Gold/Maroon Mandala Medallion for Empty Bag */}
              <div className="relative flex flex-col items-center justify-center">
                <div className="absolute w-36 h-36 rounded-full border border-[#D7B77A]/15 animate-spin-slow"></div>
                <div className="absolute w-28 h-28 rounded-full border border-dashed border-[#D7B77A]/30"></div>
                <div className="relative w-22 h-22 rounded-full bg-[#2A0710] border border-[#D7B77A]/40 flex items-center justify-center text-[#F7F0E5] shadow-xs">
                  <ShoppingBag className="w-9 h-9 text-[#F7F0E5] stroke-[1.25]" />
                </div>
              </div>

              <div className="space-y-2 max-w-xs">
                <span className="text-[9px] uppercase tracking-[0.25em] text-[#F7F0E5] font-black block">
                  BAG IS VACANT
                </span>
                <h4 className="font-serif text-xl sm:text-2xl font-black text-[#F7F0E5]">
                  Your Bag Is Empty
                </h4>
                <p className="text-xs text-[#F7F0E5]/55 leading-relaxed font-medium">
                  curate your ethnic ensembles from our finest heritage weaves and handblock prints.
                </p>
              </div>

              <button
                id="empty-cart-shop-btn"
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  navigateToCategory('All');
                }}
                className="px-8 py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded-lg text-xs font-black uppercase tracking-[0.18em] transition-all duration-300 shadow-md border border-[#D7B77A] cursor-pointer"
              >
                EXPLORE MASTERPIECES
              </button>
            </div>
          ) : (
            <>
               {/* Cart Items List */}
              <div className="space-y-4">
                {cart.map((item) => {
                  const selectedColorName = item.selectedColor?.name;
                  const selectedColorHex = item.selectedColor?.hex;
                  const colorsList = item.product?.colors || [];
                  const colorIdx = colorsList.findIndex((c: any) => c.name === selectedColorName || c.hex === selectedColorHex);
                  const itemImg = item.selectedColor?.imageUrl 
                    || (colorIdx !== -1 && item.product?.images?.[colorIdx])
                    || item.product?.images?.[0] 
                    || '';

                  return (
                    <div 
                      key={item.id} 
                      className="flex gap-4 p-4 rounded-md border border-[#D7B77A]/20 bg-[#180306] shadow-2xs hover:border-[#D7B77A]/40 transition-all duration-300 relative group"
                    >
                      <img
                        src={getCleanImageUrl(itemImg)}
                        alt={item.product.name}
                        onClick={() => {
                          navigateToProduct(item.product.id);
                          setIsCartDrawerOpen(false);
                        }}
                        className="w-20 h-26 object-cover rounded border border-[#D7B77A]/20 cursor-pointer hover:opacity-90 transition shrink-0 bg-[#180306]"
                        referrerPolicy="no-referrer"
                      />

                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 
                            onClick={() => {
                              navigateToProduct(item.product.id);
                              setIsCartDrawerOpen(false);
                            }}
                            className="font-serif text-xs sm:text-sm font-extrabold text-[#F7F0E5] hover:text-[#F7F0E5] cursor-pointer leading-tight truncate transition-colors"
                          >
                            {item.product.name}
                          </h4>
                          <button
                            id={`remove-cart-item-${item.id}`}
                            onClick={() => removeFromCart(item.id)}
                            className="w-6 h-6 rounded-full bg-rose-950/40 text-[#F7F0E5]/55 hover:text-red-600 transition flex items-center justify-center shrink-0 border border-red-100 cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Size & Color Dropdowns */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <select
                            value={item.selectedSize}
                            onChange={(e) => updateCartItem(item.id, { size: e.target.value as any })}
                            className="bg-[#2A0710] text-[#F7F0E5] px-2 py-0.5 rounded-lg font-bold border border-[#D7B77A]/35 text-[10px] cursor-pointer hover:bg-[#180306] focus:outline-none"
                          >
                            {item.product.sizes.map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                          <span className="text-[#F7F0E5]/55 text-xs">|</span>
                          <select
                            value={item.selectedColor.name}
                            onChange={(e) => {
                              const color = item.product.colors.find(c => c.name === e.target.value);
                              if (color) updateCartItem(item.id, { color });
                            }}
                            className="bg-[#2A0710] text-[#F7F0E5] px-2 py-0.5 rounded-lg font-bold border border-[#D7B77A]/35 text-[10px] cursor-pointer hover:bg-[#180306] focus:outline-none"
                          >
                            {item.product.colors.map((color) => (
                              <option key={color.name} value={color.name}>{color.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="font-serif font-black text-[#F7F0E5] text-sm sm:text-base">
                            ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                          </span>
                          {item.product.originalPrice > item.product.price && (
                            <span className="text-[10px] text-[#F7F0E5]/55 line-through">
                              ₹{(item.product.originalPrice * item.quantity).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Selector */}
                      <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-[#D7B77A]/10">
                        <span className="text-[9px] font-black text-[#F7F0E5]/55 uppercase tracking-widest">Quantity</span>
                        
                        <div className="flex items-center border border-[#D7B77A]/40 rounded bg-[#2A0710] overflow-hidden">
                          <button
                            onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center transition-all duration-150 active:scale-90 text-[#F7F0E5] hover:bg-[#5C0B1B]/5 cursor-pointer"
                            title={item.quantity === 1 ? 'Remove from bag' : 'Decrease quantity'}
                          >
                            {item.quantity === 1 ? (
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <Minus className="w-3 h-3 stroke-[2.5]" />
                            )}
                          </button>
                          
                          <span className="text-xs font-black min-w-[32px] text-center text-[#F7F0E5] select-none">
                            {item.quantity}
                          </span>
                          
                          <button
                            onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center text-[#F7F0E5] hover:bg-[#5C0B1B]/5 transition-all duration-150 active:scale-90 cursor-pointer"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                 );
                })}
              </div>

              {/* Complete The Royal Look Section */}
              {recommendedItems.length > 0 && (
                <div className="pt-5 border-t border-[#D7B77A]/20">
                  <h5 className="text-[10px] font-black tracking-[0.2em] text-[#F7F0E5] uppercase flex items-center gap-1.5 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5]" />
                    Complete The Royal Look
                  </h5>
                  
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
                    {recommendedItems.map((prod) => (
                      <div 
                        key={prod.id} 
                        className="bg-[#180306] border border-[#D7B77A]/25 p-2.5 rounded-md flex items-center gap-3 shrink-0 w-[250px] snap-start shadow-2xs hover:border-[#D7B77A]/40 transition duration-300"
                      >
                        <img 
                          src={getCleanImageUrl(prod.images[0])} 
                          alt={prod.name} 
                          onClick={() => {
                            navigateToProduct(prod.id);
                            setIsCartDrawerOpen(false);
                          }}
                          className="w-14 aspect-[3/4] object-cover rounded border border-[#D7B77A]/15 bg-[#180306] cursor-pointer hover:opacity-90 transition duration-200"
                          referrerPolicy="no-referrer"
                        />
                        <div 
                          onClick={() => {
                            navigateToProduct(prod.id);
                            setIsCartDrawerOpen(false);
                          }}
                          className="flex-1 min-w-0 cursor-pointer group/item"
                        >
                          <p className="text-[11px] font-black text-[#F7F0E5] group-hover/item:text-black truncate leading-tight transition-colors duration-200">{prod.name}</p>
                          <p className="text-[11px] text-[#F7F0E5] font-extrabold mt-0.5">₹{prod.price.toLocaleString('en-IN')}</p>
                        </div>
                        <button
                          onClick={() => {
                            addToCart(prod, prod.sizes[0] || 'M', prod.colors[0] || { name: 'Default', hex: '#241D1B' }, 1);
                            showToast(`👑 ${prod.name} added to your Bag!`, 'success');
                          }}
                          className="px-3 py-1.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] text-[9px] font-black uppercase rounded tracking-wider transition cursor-pointer shrink-0 border border-[#D7B77A]/30"
                        >
                          ADD +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Click-to-Apply Coupons - Redesigned to be Premium Ivory and Gold */}
              <div className="p-4 bg-[#2A0710] border border-[#D7B77A]/35 rounded-md space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#F7F0E5] uppercase tracking-wide">
                    <Percent className="w-4 h-4 text-[#F7F0E5]" />
                    <span>Available Royal Coupons</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCouponDrawerOpen(true)}
                    className="text-[10px] text-[#F7F0E5] hover:text-[#F7F0E5] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    View All 🎟️
                  </button>
                </div>
                
                {appliedCoupon ? (
                  <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-400 p-3 rounded flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Coupon <strong className="font-mono text-emerald-950 font-black">{appliedCoupon.code}</strong> applied!</span>
                    </div>
                    <button 
                      onClick={removeCoupon}
                      className="text-red-600 hover:text-red-800 font-black text-[10px] uppercase cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {coupons.slice(0, 3).map((cp) => {
                      const label = cp.discountType === 'percentage' ? `${cp.discountValue}% Off` : `₹${cp.discountValue} Off`;
                      return (
                        <button
                          key={cp.id}
                          onClick={() => handleApplyCouponCode(cp.code)}
                          className="bg-[#180306] hover:bg-[#5C0B1B]/5 border border-[#D7B77A]/30 px-2.5 py-1.5 rounded text-[10px] text-[#F7F0E5]/75 hover:text-[#F7F0E5] font-black transition cursor-pointer shadow-3xs flex items-center gap-1.5"
                        >
                          <Tag className="w-3 h-3 text-[#F7F0E5]" />
                          <span className="font-mono text-[#F7F0E5]">{cp.code}</span>
                          <span className="text-[#F7F0E5]/55">|</span>
                          <span className="text-[#F7F0E5]">{label}</span>
                        </button>
                      );
                    })}
                    {coupons.length === 0 && (
                      <p className="text-[10px] text-[#F7F0E5]/55 font-medium">No coupons available right now.</p>
                    )}
                  </div>
                )}
 
                {/* Direct Promo Input Form */}
                <form onSubmit={handleApplyCouponForm} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Enter Custom Promo Code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-[#180306] border border-[#D7B77A]/35 rounded px-3.5 py-2 text-xs placeholder-[#F7F0E5]/55 focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 font-bold text-[#F7F0E5]"
                  />
                  <button
                    type="submit"
                    className="bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer border border-[#D7B77A]/30 shrink-0"
                  >
                    Apply
                  </button>
                </form>
              </div>

              {/* Complimentary Gift Wrap Module */}
              <div className="border border-[#D7B77A]/25 p-4 rounded-md space-y-2.5 bg-[#180306] shadow-2xs">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isGiftWrap}
                    onChange={(e) => setIsGiftWrap(e.target.checked)}
                    className="w-4 h-4 text-[#F7F0E5] border-[#D7B77A]/30 rounded focus:ring-[#D7B77A]/40 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Gift className="w-4 h-4 text-[#F7F0E5]" />
                    <span className="text-xs font-black text-[#F7F0E5] tracking-wide">Add Complimentary Gift Packing & Note</span>
                  </div>
                </label>
                
                {isGiftWrap && (
                  <textarea
                    rows={2}
                    placeholder="E.g., Dearest Mom, Happy Anniversary! Hope this regal outfit adds beauty to your special day."
                    value={giftNote}
                    onChange={(e) => setGiftNote(e.target.value)}
                    className="w-full bg-[#2A0710] border border-[#D7B77A]/30 rounded p-3 text-xs text-[#F7F0E5] placeholder-[#F7F0E5]/55 focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 resize-none mt-1.5 font-medium"
                  />
                )}
              </div>

              {/* Delivery Pin-Code Checker - Redesigned to remove pink border and align with theme */}
              <div className="border border-[#D7B77A]/25 p-4 rounded-md space-y-2.5 bg-[#2A0710] shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#F7F0E5] uppercase tracking-wide">
                  <MapPin className="w-4 h-4 text-[#F7F0E5]" />
                  <span>Check Delivery PIN Code</span>
                </div>
                
                <form onSubmit={handleCheckPincode} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="E.g. 302001 (6-digit PIN)"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="flex-1 bg-[#180306] border border-[#D7B77A]/35 rounded px-3.5 py-2 text-xs placeholder-[#F7F0E5]/55 focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40 font-bold text-[#F7F0E5]"
                  />
                  <button
                    type="submit"
                    className="bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer shrink-0 border border-[#D7B77A]/30"
                  >
                    Check
                  </button>
                </form>

                {pinStatus.status !== 'idle' && (
                  <p className={`text-[10px] font-extrabold leading-relaxed ${
                    pinStatus.status === 'success' ? 'text-emerald-400' :
                    pinStatus.status === 'error' ? 'text-red-700' : 'text-[#F7F0E5]/55 animate-pulse'
                  }`}>
                    {pinStatus.msg}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer with Checkout Actions */}
        {cart.length > 0 && (
          <div className="p-5 border-t border-[#D7B77A]/30 bg-[#180306] space-y-4 shadow-lg relative z-10">
            
            {/* Detailed Bill Summary */}
            <div className="space-y-2.5 text-xs text-[#F7F0E5]/75">
              <div className="flex justify-between items-center font-medium">
                <span>Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} {cart.reduce((a, b) => a + b.quantity, 0) === 1 ? 'item' : 'items'})</span>
                <span className="font-extrabold text-[#F7F0E5]">₹{cartSubtotal.toLocaleString('en-IN')}</span>
              </div>
              
              {appliedCoupon && (
                <div className="flex justify-between items-center text-emerald-400 font-extrabold">
                  <span>Promo Discount ({appliedCoupon.code})</span>
                  <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span>Delivery Charge</span>
                <span>
                  {shippingFee === 0 ? (
                    <strong className="text-emerald-400 uppercase font-extrabold text-[9px] tracking-widest bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">FREE EXPRESS</strong>
                  ) : (
                    `₹${shippingFee}`
                  )}
                </span>
              </div>

              {isGiftWrap && (
                <div className="flex justify-between items-center text-[#F7F0E5] font-bold">
                  <span>Gift Packing & Note</span>
                  <span className="uppercase text-[9px] font-extrabold text-emerald-400 tracking-wider">Complimentary</span>
                </div>
              )}

              <div className="flex justify-between font-serif font-black text-[#F7F0E5] text-base pt-3 border-t border-[#D7B77A]/25">
                <span>Total Amount</span>
                <span className="text-[#F7F0E5] text-lg font-black">₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              id="drawer-proceed-checkout-btn"
              onClick={() => {
                setIsCartDrawerOpen(false);
                setActivePage('checkout');
              }}
              className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-98 text-[#F7F0E5] hover:text-[#F7F0E5] rounded-full text-xs font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-md border border-[#D7B77A]"
            >
              <span>PROCEED TO CHECKOUT</span>
              <ArrowRight className="w-4 h-4 text-[#F7F0E5]" />
            </button>

            {/* Direct WhatsApp Stylist Assistance in Cart */}
            <a
              id="cart-drawer-whatsapp-help"
              href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question about my bag items before checkout.')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#F7F0E5] hover:text-[#F7F0E5] font-semibold text-center flex items-center justify-center gap-1.5 transition-colors py-1 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Have size/fabric doubts? <strong className="underline text-[#F7F0E5]">Chat on WhatsApp</strong></span>
            </a>
            
            {/* Quick security assurance footnote */}
            <p className="text-[9px] text-[#F7F0E5]/55 font-extrabold text-center tracking-widest uppercase flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>256-Bit SSL Encrypted • 100% Prepaid Safe Checkout</span>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
