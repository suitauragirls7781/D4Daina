import React from 'react';

/**
 * A big circle that draws itself, then the tick inside it (the "order placed" mark).
 * Ink by default; `tone="paper"` for a dark surface.
 */
export const DrawnTick: React.FC<{ className?: string; tone?: 'ink' | 'paper' }> = ({ className = 'h-24 w-24', tone = 'ink' }) => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`${tone === 'paper' ? 'text-on-dark' : 'text-brand'} ${className}`}>
    <circle cx="32" cy="32" r="30.5" strokeWidth="1.5" pathLength={1} transform="rotate(-90 32 32)" className="sag-ring-draw" />
    <g className="sag-tick-draw"><path d="M21 33.5l7.5 7.5L44 24.5" strokeWidth="2.5" pathLength={26} style={{ animationDelay: '450ms' }} /></g>
  </svg>
);

// Full-screen "Order placed" moment shown for ~1.7s after a verified payment, before the confirmation page.
// Aura: a forest screen, the big tick that draws itself, the label and the huge heading rising in.
export const OrderPlacedOverlay: React.FC = () => (
  <div role="status" aria-live="assertive" className="clay-placed fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden">
    <div className="relative flex flex-col items-center text-center px-6">
      {/* Clay preview: the tick draws itself on a raised clay medallion; two rings open out from it */}
      <span className="clay-medal">
        <span className="aco-done" aria-hidden="true"><i /><i /></span>
        <DrawnTick className="relative h-28 w-28" />
      </span>
      <p className="aura-lbl aco-rise mt-8" style={{ '--d': '350ms' } as React.CSSProperties}>Payment verified</p>
      <h2 className="aura-h2 aco-rise mt-3" style={{ '--d': '430ms' } as React.CSSProperties}>Order <em>placed</em></h2>
      <p className="aura-sub aco-rise mt-5" style={{ '--d': '560ms' } as React.CSSProperties}>Opening your order details…</p>
    </div>
  </div>
);
