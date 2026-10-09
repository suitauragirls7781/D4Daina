import { useEffect } from 'react';
import { startReveal } from '../aura/revealEngine';
import { startRipple } from '../aura/ripple';

// Scroll reveal for the whole storefront. The work is done by the one shared mechanism of the Aura look
// (src/aura/revealEngine.ts): each section of #main-content (and anything marked data-reveal) rises in ONCE, the
// first time it comes into view (classes sag-reveal, then is-in); the children of a data-reveal-group follow
// one after another; [data-rv] elements and Aura titles use the same observer. The hidden start state is only
// ever set by that script, so without JavaScript, with reduced motion, or in a browser without
// IntersectionObserver everything is simply visible.
// The app calls this hook once at its root, so it also switches on the button ripple (src/aura/ripple.ts).

export const useScrollReveal = () => {
  useEffect(() => { startReveal(); startRipple(); }, []);
};
