import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from './scroll';

export type SegOption<V extends string = string> = V | { value: V; label?: ReactNode; ariaLabel?: string; disabled?: boolean };

/**
 * The pill segmented control: real buttons (aria-pressed) and ONE ink indicator that slides to the chosen
 * one. `variant="pill"` (default) is a row of outlined pills (filters); `variant="box"` is a white box with
 * equal parts (sizes). With `scroll` the row sits in its own sideways scroller and the chosen pill is brought
 * into view (only that row moves, never the page).
 */
export const Seg = <V extends string>({ options, value, onChange, scroll = false, variant = 'pill', ariaLabel, className = '', id }: {
  options: readonly SegOption<V>[];
  value: V | null | undefined;
  onChange: (value: V) => void;
  scroll?: boolean;
  variant?: 'pill' | 'box';
  /** Names the group for screen readers ("Category", "Size"). */
  ariaLabel?: string;
  className?: string;
  id?: string;
}) => {
  const root = useRef<HTMLDivElement | null>(null);
  const ind = useRef<HTMLElement | null>(null);
  const first = useRef(true);
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o as ReactNode } : { ...o, label: o.label ?? o.value }));

  // Put the indicator under the pressed button. Sizes are read here (on mount, on change, on resize), never on scroll.
  const place = useCallback((animate: boolean) => {
    const box = root.current;
    const bar = ind.current;
    if (!box || !bar) return;
    const on = box.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!on || !on.offsetWidth) { bar.classList.remove('on'); return; }
    bar.classList.toggle('mv', animate && !prefersReducedMotion());
    bar.style.width = `${on.offsetWidth}px`;
    bar.style.transform = `translate3d(${on.offsetLeft}px,0,0)`;
    bar.classList.add('on');
    const scroller = scroll ? box.parentElement : null;
    if (scroller && animate) scroller.scrollTo({ left: on.offsetLeft - 60, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [scroll]);

  const signature = list.map((o) => o.value).join('|');
  useLayoutEffect(() => {
    place(!first.current);
    first.current = false;
  }, [place, value, signature]);

  useEffect(() => {
    const box = root.current;
    if (!box) return undefined;
    const again = () => place(false);
    const watch = 'ResizeObserver' in window ? new ResizeObserver(again) : null;
    watch?.observe(box);
    document.fonts?.ready.then(again).catch(() => {});
    return () => watch?.disconnect();
  }, [place]);

  const row = (
    <div ref={root} id={id} role="group" aria-label={ariaLabel} className={`aura-seg${variant === 'box' ? ' aura-seg-box' : ''}${scroll ? '' : ` ${className}`}`}>
      <i ref={ind} aria-hidden="true" className="aura-seg-ind" />
      {list.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} aria-label={o.ariaLabel} disabled={o.disabled} onClick={() => { if (o.value !== value) onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
  return scroll ? <div className={`aura-seg-sc ${className}`}>{row}</div> : row;
};
