import React, { useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { Loader2 } from 'lucide-react';
import { Icon } from '../aura';
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
      data-aura
      onClick={close}
      className="fixed inset-0 z-[10000] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
    >
      <div
        id="coupon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="aco-sheet w-full sm:max-w-lg max-h-[85dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-5"
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 pl-5 pr-3 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h2 id="coupon-drawer-title" className="aco-sheet-h">Offers &amp; coupons</h2>
            <p className="mt-2 text-[14px] leading-5 text-ink-muted">Tap apply to use a coupon on this bag</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close offers"
            className="aco-x"
            id="close-coupon-drawer"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Coupons */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4 space-y-2.5">
          {coupons.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="abag-empty-h">No coupons right now</p>
              <p className="mt-3 text-[15px] leading-[1.5] text-ink-muted">New offers appear here as soon as the store adds them.</p>
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
                  className={`aco-cp${isApplied ? ' on' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 aura-num">
                      <span className="aco-cp-code">{cp.code}</span>
                      <span className="ml-2.5 align-middle text-[14px] leading-5 font-bold text-sale whitespace-nowrap">{discountLabel}</span>
                    </p>
                    {isApplied ? (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex items-center gap-1 text-[14px] font-bold text-ink">
                          <Icon name="check" size={18} strokeWidth={2} className="sag-tick-draw" /> Applied
                        </span>
                        <button type="button" onClick={removeCoupon} className="abag-mini text-ink!">
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApply(cp.code)}
                        disabled={Boolean(applying)}
                        aria-describedby={failed ? `coupon-drawer-error-${cp.id}` : undefined}
                        className="aura-btn aura-btn-sm min-w-[84px] shrink-0"
                      >
                        {applying === cp.code.trim().toUpperCase() ? <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.6} aria-label="Applying" /> : 'Apply'}
                      </button>
                    )}
                  </div>
                  {failed && <CouponError id={`coupon-drawer-error-${cp.id}`} message={error} className="mt-2" />}
                  <div className="mt-2 space-y-0.5 text-[13.5px] leading-5 text-ink-muted aura-num">
                    <p>{cp.minOrderValue > 0 ? `On orders above ₹${cp.minOrderValue.toLocaleString('en-IN')}` : 'No minimum order'}{cp.maxDiscount ? ` · up to ₹${cp.maxDiscount.toLocaleString('en-IN')} off` : ''}</p>
                    {short > 0 && <p className="font-bold text-ink">Add ₹{short.toLocaleString('en-IN')} more to use this coupon</p>}
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
        <div className="rounded-none! px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line shrink-0 text-center">
          <p className="text-[13px] leading-[18px] text-ink-muted">
            One coupon per order. The final discount is confirmed at checkout.
          </p>
        </div>
      </div>
    </div>
  );
};
