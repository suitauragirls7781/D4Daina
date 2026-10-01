import React from 'react';

// Keyframes live with the loader so it animates even before the main stylesheet is parsed.
const LOADER_CSS = `
@keyframes sag-loader-slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(330%); } }
@keyframes sag-loader-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
.sag-loader-bar { animation: sag-loader-slide 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
.sag-loader-logo { animation: sag-loader-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.sag-loader-copy { animation: sag-loader-in 700ms 150ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) { .sag-loader-bar, .sag-loader-logo, .sag-loader-copy { animation: none; } .sag-loader-bar { left: 33%; } }
`;

/** Calm first-load screen: the logo on ivory with a slim moving line. No fake progress numbers. */
export const LuxuryLoadingScreen: React.FC = () => (
  <div
    id="luxury-curtain-loader"
    role="status"
    aria-live="polite"
    aria-label="Loading Suit Aura Girls"
    className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#FBF7F3] px-6 select-none"
  >
    <style>{LOADER_CSS}</style>
    <div className="flex flex-col items-center">
      <img
        src="/suit-aura-logo-480.webp"
        alt="Suit Aura Girls"
        width={480}
        height={240}
        className="sag-loader-logo w-56 sm:w-72 h-auto"
      />
      <div className="relative mt-6 h-[3px] w-44 overflow-hidden rounded-full bg-[#E6DDF0]" aria-hidden="true">
        <span className="sag-loader-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#4B1D3F]" />
      </div>
      <p className="sag-loader-copy mt-6 font-serif text-xl sm:text-2xl italic text-[#4B1D3F]/80">Elegance That Feels Like You</p>
    </div>
  </div>
);
