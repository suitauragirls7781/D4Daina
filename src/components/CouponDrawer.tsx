import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useShop } from '../context/ShopContext';
import { Check, Loader2, X } from 'lucide-react';
import { couponRestrictionNotes } from '../utils/coupons';
import { TagIcon } from './StoreIcons';

const validTill = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const CouponDrawer: React.FC = () => {
  const {
    isCouponDrawerOpen,
    setIsCouponDrawerOpen,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    coupons,
    cartSubtotal,
    cart,
  } = useShop();
  const [applying, setApplying] = useState('');
  const close = () => setIsCouponDrawerOpen(false);

  useEffect(() => {
    if (!isCouponDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isCouponDrawerOpen]);

  const handleApply = async (code: string) => {
    if (applying) return;
    setApplying(code);
    const ok = await applyCoupon(code);
    setApplying('');
    if (ok) close();
  };

  return (
    <div
      id="coupon-drawer-overlay"
      onClick={close}
      className={`fixed inset-0 z-[10000] bg-[#2A1A26]/40 flex justify-end transition-opacity duration-300 ${
        isCouponDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <motion.div
        id="coupon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-drawer-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: '100%' }}
        animate={{ x: isCouponDrawerOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="bg-[#FBF7F3] w-full sm:max-w-md h-full flex flex-col relative overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 h-[72px] border-b border-[#4B1D3F]/10 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center">
              <TagIcon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 id="coupon-drawer-title" className="font-serif text-2xl leading-tight text-[#4B1D3F]">Offers &amp; coupons</h3>
              <p className="text-xs text-[#2A1A26]/65">Tap apply to use a coupon on this bag</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close offers"
            className="w-10 h-10 -mr-2 shrink-0 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
            id="close-coupon-drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Coupons */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
          {coupons.length === 0 ? (
            <div className="text-center py-16 px-4">
              <span className="mx-auto w-20 h-20 rounded-full bg-[#F3EEF8] flex items-center justify-center">
                <TagIcon className="w-9 h-9" />
              </span>
              <p className="mt-5 font-serif text-2xl text-[#2A1A26]">No coupons right now</p>
              <p className="mt-1.5 text-sm text-[#2A1A26]/65">New offers appear here as soon as the store adds them.</p>
            </div>
          ) : (
            coupons.map((cp) => {
              const isApplied = appliedCoupon?.code === cp.code;
              const discountLabel = cp.discountType === 'percentage' ? `${cp.discountValue}% off` : `₹${cp.discountValue.toLocaleString('en-IN')} off`;
              const short = cart.length > 0 && cp.minOrderValue > 0 && cartSubtotal < cp.minOrderValue ? cp.minOrderValue - cartSubtotal : 0;
              const till = validTill(cp.expiryDate);
              return (
                <div
                  key={cp.id}
                  className={`rounded-2xl bg-white border transition-colors ${isApplied ? 'border-emerald-200 ring-2 ring-emerald-50' : 'border-[#4B1D3F]/12 hover:border-[#4B1D3F]/30'} shadow-[var(--sag-shadow)]`}
                >
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-serif text-[26px] leading-tight font-semibold text-[#4B1D3F] lining-nums">{discountLabel}</p>
                      <span className="mt-2 inline-flex items-center h-7 px-3 rounded-full border border-dashed border-[#C5A46D] bg-[#FBF7F3] text-sm font-semibold tracking-[0.08em] text-[#2A1A26]">
                        {cp.code}
                      </span>
                    </div>
                    {isApplied ? (
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                          <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> Applied
                        </span>
                        <button type="button" onClick={removeCoupon} className="h-9 px-3 rounded-full text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer">
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApply(cp.code)}
                        disabled={Boolean(applying)}
                        className="sag-btn-primary shrink-0 h-10 min-w-[92px] px-5 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center cursor-pointer disabled:opacity-60"
                      >
                        {applying === cp.code ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Applying" /> : 'Apply'}
                      </button>
                    )}
                  </div>
                  <div className="relative border-t border-dashed border-[#4B1D3F]/15 px-4 sm:px-5 py-3 text-xs leading-relaxed text-[#2A1A26]/70 space-y-1">
                    <span aria-hidden="true" className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-[#FBF7F3]" />
                    <span aria-hidden="true" className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-[#FBF7F3]" />
                    <p>{cp.minOrderValue > 0 ? `On orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}` : 'No minimum order'}{cp.maxDiscount ? ` · up to ₹${cp.maxDiscount.toLocaleString('en-IN')} off` : ''}</p>
                    {short > 0 && <p className="font-semibold text-[#8A2E55]">Add ₹{short.toLocaleString('en-IN')} more to use this coupon</p>}
                    {couponRestrictionNotes(cp).map((note) => (
                      <p key={note} className="font-medium text-[#4B1D3F]">{note}</p>
                    ))}
                    {till && <p className="text-[#2A1A26]/60">Valid till {till}</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-[#4B1D3F]/10 bg-white text-center">
          <p className="text-xs leading-relaxed text-[#2A1A26]/65 max-w-xs mx-auto">
            One coupon per order. The final discount is confirmed at checkout.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
