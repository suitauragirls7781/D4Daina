import React from 'react';
import { Check, Sparkles } from 'lucide-react';

// Full-screen "Order placed" moment shown for ~1.7s after a verified payment, before the confirmation page.
export const OrderPlacedOverlay: React.FC = () => (
  <div role="status" aria-live="assertive" className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-page">
    <div aria-hidden="true" className="absolute h-[440px] w-[440px] max-w-[120vw] max-h-[120vw] rounded-full bg-sunken sag-placed-glow" />
    <div className="relative flex flex-col items-center text-center px-6">
      <div className="relative">
        <Sparkles aria-hidden="true" className="absolute -left-10 -top-6 h-6 w-6 text-ink-muted sag-placed-spark" />
        <Sparkles aria-hidden="true" className="absolute -right-10 top-2 h-5 w-5 text-ink-muted sag-placed-spark [animation-delay:120ms]" />
        <Sparkles aria-hidden="true" className="absolute -right-6 -bottom-6 h-4 w-4 text-ink-muted sag-placed-spark [animation-delay:240ms]" />
        <span aria-hidden="true" className="absolute -inset-3 rounded-full border border-dashed border-line sag-placed-pop" />
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-emerald-700 shadow-[var(--sag-shadow)] sag-placed-pop">
          <Check className="h-14 w-14 text-white sag-placed-check" strokeWidth={3} />
        </div>
      </div>
      <p className="mt-9 sag-eyebrow sag-placed-rise">Payment verified</p>
      <h2 className="mt-2 font-display text-5xl leading-none text-ink sag-placed-rise">Order placed</h2>
      <p className="mt-3 text-sm text-ink-muted sag-placed-rise [animation-delay:120ms]">Opening your order details…</p>
    </div>
  </div>
);
