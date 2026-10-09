import { createElement, useEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { revealOnce, startReveal } from './revealEngine';
import { prefersReducedMotion } from './scroll';

/**
 * Makes its content rise in once, the first time it comes into view.
 * For plain markup the attribute does the same without a component: <div data-rv data-rv-delay="120">.
 * `kind`: "up" (default), "fade", "card" (a card that tips up) or "photo" (a photo frame that unveils from below).
 */
export const Reveal = ({ as = 'div', delay, kind = 'up', className = '', style, children, ...rest }: {
  as?: ElementType;
  /** Milliseconds to wait after it comes into view. Without it, things that arrive together follow one another. */
  delay?: number;
  kind?: 'up' | 'fade' | 'card' | 'photo';
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) => {
  const ref = useRef<HTMLElement | null>(null);
  // "wait" hides it, "go" is the arrival (with the transition), "rest" is the plain element again
  const [phase, setPhase] = useState<'idle' | 'wait' | 'go' | 'rest'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return undefined;
    startReveal();
    const rect = el.getBoundingClientRect();
    // Already on screen when it appears: never hidden
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) return undefined;
    setPhase('wait');
    let timer = 0;
    const stop = revealOnce(el, () => {
      setPhase('go');
      timer = window.setTimeout(() => setPhase('rest'), 1900 + (delay || 0));
    });
    return () => { stop(); window.clearTimeout(timer); };
  }, [delay]);

  const cls = `${className}${phase === 'wait' ? ' aura-w' : ''}${phase === 'go' ? ' aura-go in' : ''}${phase === 'rest' ? ' in' : ''}`.trim();
  const vars = delay != null ? ({ ...style, '--d': `${delay}ms` } as CSSProperties) : style;
  return createElement(as, { ...rest, ref, 'data-rv': kind === 'up' ? '' : kind, 'data-rv-own': '', className: cls, style: vars }, children);
};
