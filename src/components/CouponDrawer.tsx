import React, { useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { Check, Loader2, X } from 'lucide-react';
import { couponRestrictionNotes } from '../utils/coupons';
import { CouponError, useCouponApply } from './CartContents';

const validTill = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "View all offers": a bottom sheet on phones, a centred dialog on wider screens. Rendered only while open. */
export const CouponDrawer: React.FC = () => {
  const {
    isCouponDrawerOpen,
    setIsCouponDrawerOpen,
    appliedCoupon,
    removeCoupon,
    coupons,
    cartSubtotal,
    cart,
  } = useShop();
  const { apply, applying, error, failedCode } = useCouponApply();
  const close = () => setIsCouponDrawerOpen(false);

  useEffect(() => {
    if (!isCouponDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isCouponDrawerOpen]);

  const handleApply = async (code: string) => {
    if (applying) return;
    const ok = await apply(code);
    if (ok) close();
  };

  if (!isCouponDrawerOpen) return null;

  return (
    <div
      id="coupon-drawer-overlay"
      onClick={close}
      className="fixed inset-0 z-[10000] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
    >
      <div
        id="coupon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full sm:max-w-lg max-h-[85dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-5"
      >
        {/* Title row */}
        <div className="flex items-center justify-between gap-3 pl-4 pr-1.5 min-h-14 border-b border-line shrink-0">
          <div className="py-2.5 min-w-0">
            <h2 id="coupon-drawer-title" className="font-display text-[19px] leading-6 text-ink">Offers &amp; coupons</h2>
            <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">Tap apply to use a coupon on this bag</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close offers"
            className="w-11 h-11 shrink-0 flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer"
            id="close-coupon-drawer"
          >
            <X className="w-[22px] h-[22px]" strokeWidth={1.5} />
          </button>
        </div>

        {/* Coupons */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2.5">
          {coupons.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="font-display text-[19px] leading-6 text-ink">No coupons right now</p>
              <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">New offers appear here as soon as the store adds them.</p>
            </div>
          ) : (
            coupons.map((cp) => {
              const isApplied = appliedCoupon?.code === cp.code;
              const discountLabel = cp.discountType === 'percentage' ? `${cp.discountValue}% off` : `₹${cp.discountValue.toLocaleString('en-IN')} off`;
              const short = cart.length > 0 && cp.minOrderValue > 0 && cartSubtotal < cp.minOrderValue ? cp.minOrderValue - cartSubtotal : 0;
              const till = validTill(cp.expiryDate);
              const failed = Boolean(error) && failedCode === cp.code.trim().toUpperCase();
              return (
                <div
                  key={cp.id}
                  className={`border bg-surface p-3.5 ${isApplied ? 'border-ink ring-1 ring-inset ring-ink' : 'border-line'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 text-[13.5px] leading-5 sag-num">
                      <span className="font-semibold tracking-[0.04em] text-ink break-all">{cp.code}</span>
                      <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-sale whitespace-nowrap">{discountLabel}</span>
                    </p>
                    {isApplied ? (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink">
                          <Check className="w-4 h-4 text-sale" strokeWidth={1.5} aria-hidden="true" /> Applied
                        </span>
                        <button type="button" onClick={removeCoupon} className="sag-link text-[12.5px] decoration-1 underline-offset-4">
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApply(cp.code)}
                        disabled={Boolean(applying)}
                        aria-describedby={failed ? `coupon-drawer-error-${cp.id}` : undefined}
                        className="sag-btn-outline h-10 min-w-[84px] px-4 shrink-0"
                      >
                        {applying === cp.code.trim().toUpperCase() ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-label="Applying" /> : 'Apply'}
                      </button>
                    )}
                  </div>
                  {failed && <CouponError id={`coupon-drawer-error-${cp.id}`} message={error} className="mt-2" />}
                  <div className="mt-2 space-y-0.5 text-[11.5px] leading-4 text-ink-muted sag-num">
                    <p>{cp.minOrderValue > 0 ? `On orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}` : 'No minimum order'}{cp.maxDiscount ? ` · up to ₹${cp.maxDiscount.toLocaleString('en-IN')} off` : ''}</p>
                    {short > 0 && <p className="font-semibold text-sale">Add ₹{short.toLocaleString('en-IN')} more to use this coupon</p>}
                    {couponRestrictionNotes(cp).map((note) => (
                      <p key={note} className="text-ink">{note}</p>
                    ))}
                    {till && <p>Valid till {till}</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line shrink-0 text-center">
          <p className="text-[11.5px] leading-4 text-ink-muted">
            One coupon per order. The final discount is confirmed at checkout.
          </p>
        </div>
      </div>
    </div>
  );
};
