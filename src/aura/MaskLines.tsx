import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { revealOnce } from './revealEngine';

/**
 * A title whose lines rise from below, one after another, each going from light (300) to bold (800).
 * Every entry of `lines` is one masked line (a string or nodes); an <em> inside a line is the serif accent
 * when the heading carries aura-h1 / aura-h2. A long line may wrap: it then rises as one block.
 * It plays once, when the title comes into view; with reduced motion the title is simply there.
 */
export const MaskLines = ({ lines, as = 'h2', className = '', id, delay = 0, step = 90, nowrap = false, style }: {
  lines: ReactNode[];
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span';
  className?: string;
  id?: string;
  /** Milliseconds before the first line starts. */
  delay?: number;
  /** Milliseconds between two lines. */
  step?: number;
  /** Keep every line on one line (only for short lines that surely fit a phone). */
  nowrap?: boolean;
  style?: CSSProperties;
}) => {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return undefined;
    return revealOnce(el, () => setShown(true));
  }, [shown]);

  return createElement(
    as,
    { ref, id, style, className: `aura-mlw${shown ? ' in' : ''}${className ? ` ${className}` : ''}` },
    lines.map((line, i) => (
      <span key={i} className={nowrap ? 'aura-ml aura-ml-nw' : 'aura-ml'}>
        <span style={{ '--d': `${delay + i * step}ms` } as CSSProperties}>{line}</span>
      </span>
    )),
  );
};
