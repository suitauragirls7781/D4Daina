import React from 'react';
import { Ornament } from './SectionTitle';

/** A thin emerald circle that draws itself, then the tick inside it (the "order placed" mark). */
export const DrawnTick: React.FC<{ className?: string }> = ({ className = 'h-24 w-24' }) => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`text-brand ${className}`}>
    <circle cx="32" cy="32" r="31" strokeWidth="1" pathLength={1} transform="rotate(-90 32 32)" className="sag-ring-draw" />
    <g className="sag-tick-draw"><path d="M21 33.5l7.5 7.5L44 24.5" strokeWidth="1.5" pathLength={26} style={{ animationDelay: '450ms' }} /></g>
  </svg>
);

// Full-screen "Order placed" moment shown for ~1.7s after a verified payment, before the confirmation page.
export const OrderPlacedOverlay: React.FC = () => (
  <div role="status" aria-live="assertive" className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-page">
    <div className="relative flex flex-col items-center text-center px-6">
      <DrawnTick />
      <p className="mt-8 text-[10.5px] leading-4 font-semibold uppercase tracking-[0.24em] text-brand sag-placed-rise">Payment verified</p>
      <h2 className="mt-2.5 font-display text-[40px] leading-[1.05] text-ink sag-placed-rise">Order placed</h2>
      <Ornament className="mt-4 sag-placed-rise" />
      <p className="mt-4 text-[13.5px] leading-5 text-ink-muted sag-placed-rise [animation-delay:120ms]">Opening your order details…</p>
    </div>
  </div>
);
