import React from 'react';
import { motion } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { X, Tag, Check, Gift, Sparkles } from 'lucide-react';

export const CouponDrawer: React.FC = () => {
  const { 
    isCouponDrawerOpen, 
    setIsCouponDrawerOpen, 
    appliedCoupon, 
    applyCoupon, 
    removeCoupon,
    coupons
  } = useShop();

  const handleApply = (code: string) => {
    applyCoupon(code);
    setIsCouponDrawerOpen(false);
  };

  return (
    <div 
      id="coupon-drawer-overlay" 
      onClick={() => setIsCouponDrawerOpen(false)} 
      className={`fixed inset-0 z-[10000] bg-[#5C0B1B]/60 backdrop-blur-xs flex justify-end transition-opacity duration-300 ${
        isCouponDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <motion.div 
        id="coupon-drawer"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: '100%' }}
        animate={{ x: isCouponDrawerOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-[#120205] w-full max-w-md h-full flex flex-col relative overflow-hidden border-l border-[#D7B77A]/30"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#D7B77A]/30 flex items-center justify-between bg-[#180306]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#D7B77A] text-[#F7F0E5]">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#E8D2A4]">Available Offers</h3>
              <p className="text-[10px] text-[#F7F0E5]/55 font-bold uppercase tracking-wider">Tap to apply instant savings</p>
            </div>
          </div>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsCouponDrawerOpen(false)}
            className="p-2 hover:bg-[#120205] text-[#E8D2A4]/55 hover:text-[#E8D2A4] transition-colors cursor-pointer"
            id="close-coupon-drawer"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Coupons List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {coupons.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Tag className="w-10 h-10 text-[#F7F0E5]/55 mx-auto" />
              <p className="text-sm text-[#F7F0E5]/55 font-bold">No active coupons available right now.</p>
              <p className="text-[11px] text-[#F7F0E5]/55">Check back during upcoming festive sales!</p>
            </div>
          ) : (
            coupons.map((cp) => {
              const isApplied = appliedCoupon?.code === cp.code;
              const discountLabel = cp.discountType === 'percentage' 
                ? `${cp.discountValue}% Flat Discount`
                : `₹${cp.discountValue} Flat Discount`;
              
              const minOrderHint = cp.minOrderValue > 0 ? `Valid on orders above ₹${cp.minOrderValue}` : 'No minimum order required';

              return (
                <div 
                  key={cp.id} 
                  className={`relative border-2 rounded-md overflow-hidden transition-all duration-300 ${
                    isApplied 
                      ? 'border-[#D7B77A]/40 bg-[#180306]' 
                        : 'border-[#D7B77A]/25 bg-[#120205] hover:border-[#D7B77A] hover:bg-[#180306]'
                  }`}
                >
                  {/* Active Indicator Left Bar */}
                  <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D7B77A]" />

                  <div className="p-5 pl-7 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 bg-[#180306] text-[#F7F0E5]/75 text-[9px] font-black uppercase tracking-widest rounded-full border border-[#D7B77A]/15 shadow-3xs">
                        Royal Special
                      </span>
                      {isApplied && (
                        <span className="px-2.5 py-0.5 bg-emerald-600 text-[#F7F0E5] text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1 shadow-3xs animate-pulse">
                          <Check className="w-3 h-3 stroke-[3]" /> Applied
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-1">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-[#F7F0E5]" />
                          <span className="font-mono text-base font-extrabold tracking-wider text-[#F7F0E5]">
                            {cp.code}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-[#F7F0E5]">
                          {discountLabel}
                        </p>
                      </div>

                      {isApplied ? (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={removeCoupon}
                          className="px-4 py-2 bg-[#2A0710]/40 hover:bg-[#2A0710] text-rose-300 text-[10px] font-black uppercase tracking-wider rounded transition cursor-pointer"
                        >
                          Remove
                        </motion.button>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleApply(cp.code)}
                          className="px-4 py-2 bg-[#D7B77A] text-[#F7F0E5] text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-[#D7B77A]/90 cursor-pointer"
                        >
                          Apply
                        </motion.button>
                      )}
                    </div>

                    <div className="text-[11px] text-[#F7F0E5]/55 leading-relaxed font-medium pt-2 border-t border-dashed border-[#D7B77A]/15 space-y-1">
                      <p>{minOrderHint}</p>
                      <p className="text-[10px] text-[#F7F0E5]/55">Valid until: {new Date(cp.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Dynamic Interactive Hint Footer */}
        <div className="p-4 border-t border-[#D7B77A]/15 bg-[#2A0710]/20 text-center space-y-1.5">
          <p className="text-[10px] text-[#F7F0E5]/55 font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#F7F0E5] fill-[#D7B77A]" /> Maximize Festive Savings!
          </p>
          <p className="text-[11px] text-[#F7F0E5]/75 leading-relaxed max-w-xs mx-auto">
            You can copy or apply any coupon directly. Multiple coupon codes cannot be combined on a single order.
          </p>
        </div>
        </motion.div>
    </div>
  );
};
