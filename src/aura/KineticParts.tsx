import { createElement, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { clamp, setVar, useReducedMotion, useScrollFx } from './scroll';

/**
 * Drift: a photo that moves a little slower than the page inside its own frame (parallax). The frame is the
 * element this renders (it clips); its child photo is the layer that moves. One CSS variable per frame, turned
 * into a transform by CSS (.kx-drift). `amount` is the travel in percent of the photo's height (6 by default).
 */
export const Drift = ({ children, amount = 6, className = '', style }: { children: ReactNode; amount?: number; className?: string; style?: CSSProperties }) => {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFx(ref, ({ el, enter }) => setVar(el, '--dy', (enter - 0.5) * 2));
  return <div ref={ref} className={`kx-drift ${className}`} style={{ ...style, '--da': amount } as CSSProperties}>{children}</div>;
};

/**
 * A sentence that lights up word by word as it travels up the screen. A word between *stars* is the serif
 * accent. The class of a word changes only when the count of lit words changes (never per frame), and with
 * reduced motion the sentence is simply there. The text is the store's own wording: pass real copy only.
 */
export const ScrollWords = ({ text, as = 'p', className = '', from = 0.16, to = 0.58 }: { text: string; as?: 'p' | 'h2' | 'h3' | 'div'; className?: string; from?: number; to?: number }) => {
  const ref = useRef<HTMLElement | null>(null);
  const lit = useRef(-1);
  const still = useReducedMotion();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean).map((raw) => {
    const accent = /^\*.*\*[.,;:!?]?$/.test(raw);
    return { accent, word: accent ? raw.replace(/\*/g, '') : raw };
  }), [text]);

  useScrollFx(ref, ({ el, enter }) => {
    if (still) return;
    const n = Math.round(clamp((enter - from) / (to - from)) * words.length);
    if (n === lit.current) return;
    lit.current = n;
    const spans = el.children;
    for (let i = 0; i < spans.length; i += 1) spans[i].classList.toggle('lit', i < n);
  }, [still, words.length, from, to]);

  return createElement(
    as,
    { ref, className: `kx-words${still ? ' all' : ''}${className ? ` ${className}` : ''}` },
    words.map((w, i) => <span key={i} className={w.accent ? 'k' : undefined}>{w.word}{i < words.length - 1 ? ' ' : ''}</span>),
  );
};
