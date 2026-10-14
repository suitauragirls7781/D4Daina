import React from 'react';

// Everything the loader needs travels with it (colours, fonts with fallbacks, keyframes), so it looks right
// even before the main stylesheet has been parsed.
const LOADER_CSS = `
.aura-ld { position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center; color: #111013; font-family: 'Figtree', system-ui, sans-serif; user-select: none; }
.aura-ld .p { position: absolute; left: 0; right: 0; height: 50.2%; background: #E8DFD1; }
.aura-ld .p.l { background: #EFDFDA; border-radius: 0 0 34px 34px; box-shadow: 0 14px 30px rgba(120,96,80,.22), inset 0 -4px 10px rgba(120,96,80,.1), inset 0 6px 14px rgba(255,255,255,.6); z-index: 1; }
.aura-ld .p.r { border-radius: 34px 34px 0 0; box-shadow: inset 0 6px 12px rgba(255,255,255,.65), inset 0 -4px 10px rgba(120,96,80,.08); }
.aura-ld .p.l { top: 0; }
.aura-ld .p.r { bottom: 0; }
.aura-ld .c { position: relative; z-index: 2; text-align: center; padding: 0 16px; }
.aura-ld .wd { margin: 0; font-weight: 800; font-size: clamp(20px, 6.4vw, 34px); line-height: 1.2; letter-spacing: 0.2em; padding-left: 0.2em; text-transform: uppercase; white-space: nowrap; animation: aura-ld-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.aura-ld .wd em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; font-size: 1.4em; line-height: 0; letter-spacing: 0; text-transform: none; color: #EAD7D1; }
.aura-ld svg { display: block; width: min(74vw, 330px); height: 18px; margin: 10px auto 0; overflow: visible; }
.aura-ld path { fill: none; stroke: #B76E79; stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: aura-ld-dash 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 250ms forwards; }
.aura-ld.open { pointer-events: none; }
.aura-ld.open .p.l { animation: aura-ld-up 550ms cubic-bezier(0.7, 0, 0.2, 1) both; }
.aura-ld.open .p.r { animation: aura-ld-down 550ms cubic-bezier(0.7, 0, 0.2, 1) both; }
.aura-ld.open .c { animation: aura-ld-out 200ms linear both; }
.aura-ld.open .wd { animation: none; }
.aura-ld.open path { animation: none; stroke-dashoffset: 0; }
@keyframes aura-ld-in { from { opacity: 0; transform: translate3d(0, 12px, 0); } }
@keyframes aura-ld-dash { to { stroke-dashoffset: 0; } }
@keyframes aura-ld-up { to { transform: translate3d(0, -101%, 0); } }
@keyframes aura-ld-down { to { transform: translate3d(0, 101%, 0); } }
@keyframes aura-ld-out { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .aura-ld .wd, .aura-ld path { animation: none; }
  .aura-ld path { stroke-dashoffset: 0; }
  .aura-ld.open { display: none; }
}
`;

/**
 * First-load screen (Claymorphism): two clay panels (blush over sand), the wordmark and a rose line that draws itself. It shows only
 * while the store is really loading; there are no made-up progress numbers and it never waits for its own
 * animation. The moment loading ends the app shows the page and renders this once more with `leaving`: the
 * two panels part (one up, one down) over the finished page, which can already be used underneath.
 * (The file keeps its old name so imports stay valid.)
 */
export const LuxuryLoadingScreen: React.FC<{ leaving?: boolean }> = ({ leaving = false }) => (
  <div
    id={leaving ? 'luxury-curtain-loader-leaving' : 'luxury-curtain-loader'}
    {...(leaving ? { 'aria-hidden': true } : { role: 'status', 'aria-live': 'polite' as const, 'aria-label': 'Loading Suit Aura Girls' })}
    className={`aura-ld${leaving ? ' open' : ''}`}
  >
    <style>{LOADER_CSS}</style>
    <div className="p l" />
    <div className="p r" />
    <div className="c" aria-hidden="true">
      <p className="wd">Suit <em>Aura</em> Girls</p>
      <svg viewBox="0 0 330 18" preserveAspectRatio="none" focusable="false">
        <path pathLength={1} d="M2 10C60 0 110 20 165 9s110-9 163 2" />
      </svg>
    </div>
  </div>
);
