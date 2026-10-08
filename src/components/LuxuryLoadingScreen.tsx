import React from 'react';

// Keyframes live with the loader so it animates even before the main stylesheet is parsed.
const LOADER_CSS = `
@keyframes sag-loader-slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(330%); } }
@keyframes sag-loader-in { from { opacity: 0; } to { opacity: 1; } }
.sag-loader-bar { animation: sag-loader-slide 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
.sag-loader-logo { animation: sag-loader-in 240ms ease-out both; }
.sag-loader-copy { animation: sag-loader-in 240ms 120ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .sag-loader-bar, .sag-loader-logo, .sag-loader-copy { animation: none; } .sag-loader-bar { left: 33%; } }
`;

/**
 * First-load screen: the logo on white with a slim teal line that shows the page is loading.
 * No fake progress numbers. (The file keeps its old name so imports stay valid.)
 */
export const LuxuryLoadingScreen: React.FC = () => (
  <div
    id="luxury-curtain-loader"
    role="status"
    aria-live="polite"
    aria-label="Loading Suit Aura Girls"
    className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[color:var(--sag-page)] px-4 select-none"
  >
    <style>{LOADER_CSS}</style>
    <div className="sag-glass flex flex-col items-center px-8 py-9">
      <img
        src="/suit-aura-mark-132.webp"
        alt="Suit Aura Girls"
        width={132}
        height={132}
        className="sag-loader-logo h-[84px] w-[84px] rounded-full border border-line object-cover"
      />
      <p className="sag-loader-logo mt-4 font-display text-[19px] leading-6 font-medium uppercase tracking-[0.14em] text-ink" aria-hidden="true">Suit Aura Girls</p>
      <div className="relative mt-5 h-[3px] w-40 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="sag-loader-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand" />
      </div>
      <p className="sag-loader-copy mt-5 font-display text-lg leading-6 text-ink-muted">Elegance That Feels Like You</p>
    </div>
  </div>
);
