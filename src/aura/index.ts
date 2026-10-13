// The shared pieces of the Aura look. Read README.md in this folder first.
import { startReveal } from './revealEngine';
import { startRipple } from './ripple';
import { startKinetic } from './kinetic';

export { clamp, lerp, smooth, useScrollFx, addScrollFx, setVar, requestMeasure, getScroll, docTop, noPin, useNoPin, prefersReducedMotion, useReducedMotion } from './scroll';
export type { ScrollFrame, ScrollFxOptions } from './scroll';
export { startReveal, revealOnce } from './revealEngine';
export { Reveal } from './Reveal';
export { MaskLines } from './MaskLines';
export { AuraTitle } from './AuraTitle';
export { Odometer } from './Odometer';
export { flyToBag, bumpBag } from './fly';
export { ripple, startRipple } from './ripple';
export { Seg } from './Seg';
export type { SegOption } from './Seg';
export { Thread } from './Thread';
export type { ThreadPoint } from './Thread';
export { Backdrop, refreshBackdrop } from './Backdrop';
export type { AuraTheme } from './Backdrop';
export { Icon, ICON_NAMES } from './icons';
export { startKinetic, enterPage, useFlip, useColumnDrift, useArrive } from './kinetic';
export { Drift, ScrollWords } from './KineticParts';
export type { IconName } from './icons';

// Loading this folder switches on the two site-wide helpers: reveal on scroll and the button ripple
if (typeof window !== 'undefined') {
  startRipple();
  startKinetic();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startReveal, { once: true });
  else startReveal();
}
