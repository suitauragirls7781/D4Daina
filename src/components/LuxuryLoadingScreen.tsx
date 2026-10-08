import React, { useEffect, useState } from 'react';

// Everything the loader needs travels with it (colours with fallbacks, keyframes), so it looks right even
// before the main stylesheet has been parsed.
const LOADER_CSS = `
.sag-loader { background:
  radial-gradient(520px 520px at -8% 12%, rgba(184, 137, 74, 0.34), transparent 70%),
  radial-gradient(560px 560px at 108% 70%, rgba(122, 39, 66, 0.42), transparent 70%),
  #0F0D12; color: #F6F1EA; }
.sag-loader-dial { position: relative; width: 170px; height: 170px; }
.sag-loader-ring { position: absolute; inset: 0; border-radius: 9999px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.sag-loader-hand { position: absolute; inset: 8px; border-radius: 9999px; border: 2px solid transparent; border-top-color: #E0BB7C; animation: sag-loader-spin 2.6s linear infinite; }
.sag-loader-dot { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -4.5px; border-radius: 9999px; background: rgba(255, 255, 255, 0.22); transform: rotate(calc(var(--n) * 36deg)) translateY(-70px); animation: sag-loader-dot 2.6s linear infinite; animation-delay: calc(var(--n) * 0.2s); }
.sag-loader-mark { position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 9999px; background: #FFFFFF; object-fit: cover; }
.sag-loader-name { font-family: 'Fraunces', Georgia, serif; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; font-size: 19px; line-height: 24px; margin-top: 22px; }
.sag-loader-line { font-family: 'Figtree', system-ui, sans-serif; font-size: 11px; line-height: 16px; letter-spacing: 0.24em; text-transform: uppercase; color: #E0BB7C; margin-top: 10px; min-height: 16px; }
.sag-loader-line::after { content: ""; display: inline-block; width: 1px; height: 1em; background: #E0BB7C; margin-left: 3px; vertical-align: -2px; animation: sag-loader-blink 1s steps(1) infinite; }
.sag-loader-in { animation: sag-loader-in 320ms ease-out both; }
@keyframes sag-loader-spin { to { transform: rotate(360deg); } }
@keyframes sag-loader-dot { 0%, 8% { background: #E0BB7C; box-shadow: 0 0 12px rgba(224, 187, 124, 0.9); } 22%, 100% { background: rgba(255, 255, 255, 0.22); box-shadow: none; } }
@keyframes sag-loader-blink { 50% { opacity: 0; } }
@keyframes sag-loader-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .sag-loader-hand, .sag-loader-dot, .sag-loader-in, .sag-loader-line::after { animation: none; }
  .sag-loader-hand { display: none; }
  .sag-loader-dot { background: #E0BB7C; }
}
`;

const LINE = 'Dialing into the digital realm';
const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * First-load screen (owner's pick 1, 2026-10-08, "rotary dial"): the logo mark inside a glass dial whose ten
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
        <p className="sag-loader-line" aria-hidden="true">{LINE.slice(0, typed)}</p>
      </div>
    </div>
  );
};
