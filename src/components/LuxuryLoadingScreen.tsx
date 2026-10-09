import React, { useEffect, useState } from 'react';

// Everything the loader needs travels with it (colours with fallbacks, keyframes), so it looks right even
// before the main stylesheet has been parsed.
const LOADER_CSS = `
.sag-loader { background: var(--sag-page, #F8F4EC); color: var(--sag-brand, #0F3D33); }
.sag-loader-dial { position: relative; width: 170px; height: 170px; }
.sag-loader-ring { position: absolute; inset: 0; border-radius: 9999px; border: 1px solid var(--sag-brand, #0F3D33); background: var(--sag-surface, #FFFFFF); }
.sag-loader-ring::after { content: ""; position: absolute; inset: 5px; border-radius: 9999px; border: 1px solid var(--sag-champagne, #CDB58A); }
.sag-loader-hand { position: absolute; inset: 10px; border-radius: 9999px; border: 2px solid transparent; border-top-color: var(--sag-brand, #0F3D33); animation: sag-loader-spin 2.6s linear infinite; }
.sag-loader-dot { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -4.5px; border-radius: 9999px; background: var(--sag-line, #E5DDCC); transform: rotate(calc(var(--n) * 36deg)) translateY(-66px); animation: sag-loader-dot 2.6s linear infinite; animation-delay: calc(var(--n) * 0.2s); }
.sag-loader-mark { position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 9999px; border: 1px solid var(--sag-champagne, #CDB58A); background: var(--sag-surface, #FFFFFF); object-fit: cover; }
.sag-loader-name { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; letter-spacing: 0.2em; padding-left: 0.2em; text-transform: uppercase; font-size: 23px; line-height: 26px; margin-top: 24px; }
.sag-loader-orn { display: flex; align-items: center; justify-content: center; gap: 6px; height: 7px; margin-top: 10px; color: var(--sag-champagne, #CDB58A); }
.sag-loader-orn::before, .sag-loader-orn::after { content: ""; width: 40px; height: 1px; background: currentColor; }
.sag-loader-orn > i { width: 5px; height: 5px; border: 1px solid currentColor; transform: rotate(45deg); }
.sag-loader-line { font-family: 'Figtree', system-ui, sans-serif; font-size: 10.5px; font-weight: 600; line-height: 16px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--sag-brand, #0F3D33); margin-top: 12px; min-height: 16px; }
.sag-loader-line::after { content: ""; display: inline-block; width: 1px; height: 1em; background: var(--sag-brand, #0F3D33); margin-left: 3px; vertical-align: -2px; animation: sag-loader-blink 1s steps(1) infinite; }
.sag-loader-in { animation: sag-loader-in 320ms ease-out both; }
@keyframes sag-loader-spin { to { transform: rotate(360deg); } }
@keyframes sag-loader-dot { 0%, 8% { background: var(--sag-brand, #0F3D33); } 22%, 100% { background: var(--sag-line, #E5DDCC); } }
@keyframes sag-loader-blink { 50% { opacity: 0; } }
@keyframes sag-loader-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .sag-loader-hand, .sag-loader-dot, .sag-loader-in, .sag-loader-line::after { animation: none; }
  .sag-loader-hand { display: none; }
  .sag-loader-dot { background: var(--sag-brand, #0F3D33); }
}
`;

const LINE = 'Dialing into the digital realm';
const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * First-load screen (owner's pick 1, 2026-10-08, "rotary dial"): the logo mark inside a white dial with an emerald edge whose ten
 * points light up one after another, the brand name, and the line "Dialing into the digital realm" typing
 * itself. It shows only while the store is really loading; there are no made-up progress numbers.
 * (The file keeps its old name so imports stay valid.)
 */
export const LuxuryLoadingScreen: React.FC = () => {
  // The line types itself; with reduced motion it is simply shown whole
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setTyped(LINE.length); return undefined; }
    const timer = window.setInterval(() => setTyped((n) => (n >= LINE.length ? n : n + 1)), 55);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      id="luxury-curtain-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading Suit Aura Girls"
      className="sag-loader fixed inset-0 z-[99999] flex flex-col items-center justify-center px-4 text-center select-none"
    >
      <style>{LOADER_CSS}</style>
      <div className="sag-loader-in flex flex-col items-center">
        <div className="sag-loader-dial" aria-hidden="true">
          <div className="sag-loader-ring" />
          <div className="sag-loader-hand" />
          {DOTS.map((n) => <i key={n} className="sag-loader-dot" style={{ '--n': n } as React.CSSProperties} />)}
          <img src="/suit-aura-mark-132.webp" alt="" width={132} height={132} className="sag-loader-mark" />
        </div>
        <p className="sag-loader-name" aria-hidden="true">Suit Aura Girls</p>
        <span className="sag-loader-orn" aria-hidden="true"><i /></span>
        <p className="sag-loader-line" aria-hidden="true">{LINE.slice(0, typed)}</p>
      </div>
    </div>
  );
};
