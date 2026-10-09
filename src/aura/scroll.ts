import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type DependencyList, type RefObject } from 'react';

// The ONE scroll engine of the Aura look.
// - one passive scroll listener, one resize listener, one requestAnimationFrame loop for the whole site;
// - the loop runs only while something is registered, the page is visible and something is still moving;
// - positions are measured once and cached (again on resize, when a registered element or the page changes
//   size, when a photo loads, when the fonts arrive), never on every frame;
// - a component gets its section's progress in a callback and writes CSS variables / transforms there.
//   No React state changes on scroll.

export const clamp = (v: number, min = 0, max = 1) => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Ease in and out (smoothstep) for a 0..1 value. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

export interface ScrollFrame {
  /** The registered element. */
  el: HTMLElement;
  /** Scroll position this frame. It glides a little behind the finger (the real one with reduced motion). */
  y: number;
  /** The real scroll position, not smoothed. */
  rawY: number;
  vh: number;
  vw: number;
  /** The element's top in the document and its height, as last measured. */
  top: number;
  height: number;
  /** 0 when the element's top reaches the top of the screen, 1 when its bottom reaches the bottom of the
   *  screen: the scroll range of a tall wrapper with a sticky child. */
  progress: number;
  /** 0 when the element's top enters at the bottom of the screen, 1 when its bottom has left at the top. */
  enter: number;
  /** Smoothed scroll speed in px per frame (negative while scrolling up). */
  velocity: number;
  /** Frame time in ms, for motion that also drifts by itself. */
  time: number;
}

export interface ScrollFxOptions {
  /** Call on every frame while the element is near the screen, even when the page is not scrolling
   *  (a band that drifts by itself). The loop then keeps running while it is near the screen. */
  always?: boolean;
  /** Called whenever the engine re-measures: cache your own sizes here (a track's width, a card's step). */
  measure?: (el: HTMLElement, size: { vw: number; vh: number; top: number; height: number }) => void;
}

type Update = (frame: ScrollFrame) => void;
interface Item { el: HTMLElement; update: Update; opts: ScrollFxOptions; top: number; height: number; lastP: number; lastE: number; fresh: boolean; }

const hasWindow = typeof window !== 'undefined';
const items = new Set<Item>();
const S = { y: 0, raw: 0, prev: 0, v: 0, vw: 0, vh: 0 };
let rafId = 0;
let started = false;
let measureQueued = false;
let forceAll = true;
let sizeWatch: ResizeObserver | null = null;

const reducedQuery = hasWindow && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
/** True when the visitor asked for reduced motion. */
export const prefersReducedMotion = () => !!reducedQuery && reducedQuery.matches;

const supports = (prop: string, value: string) => { try { return hasWindow && !!window.CSS && CSS.supports(prop, value); } catch { return false; } };
// overflow: clip matters too: without it html / body fall back to overflow-x: hidden, which stops sticky from working
const canPin = supports('position', 'sticky') && supports('overflow', 'clip');
/** True when pinned sections must be shown as plain static sections: reduced motion, no sticky, or a very short screen. */
export const noPin = () => !hasWindow || prefersReducedMotion() || !canPin || window.innerHeight < 480;

const syncHtmlClasses = () => {
  if (!hasWindow) return;
  const html = document.documentElement;
  html.classList.add('aura-js');
  html.classList.toggle('aura-nopin', noPin());
  html.classList.toggle('aura-rm', prefersReducedMotion());
};

/** An element's top in the document, from the layout (not changed by transforms). Do not use on something inside a sticky box. */
export const docTop = (el: HTMLElement | null) => {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) { y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return y;
};

const measureNow = () => {
  measureQueued = false;
  S.vw = window.innerWidth;
  S.vh = window.innerHeight;
  for (const it of items) {
    it.top = docTop(it.el);
    it.height = it.el.offsetHeight;
    it.opts.measure?.(it.el, { vw: S.vw, vh: S.vh, top: it.top, height: it.height });
  }
  forceAll = true;
  wake();
};

/** Ask the engine to measure again on the next frame (after you changed the layout yourself). */
export const requestMeasure = () => {
  if (!hasWindow || measureQueued) return;
  measureQueued = true;
  requestAnimationFrame(measureNow);
};

const frame = (time: number) => {
  rafId = 0;
  if (!items.size || document.hidden) return;
  const raw = window.scrollY;
  const delta = raw - S.prev;
  S.prev = raw;
  S.raw = raw;
  S.v = lerp(S.v, delta, 0.25);
  if (Math.abs(S.v) < 0.02) S.v = 0;
  const before = S.y;
  S.y = prefersReducedMotion() ? raw : lerp(S.y, raw, 0.16);
  if (Math.abs(S.y - raw) < 0.15) S.y = raw;
  const moved = S.y !== before || S.v !== 0;
  let keep = moved;

  for (const it of items) {
    const range = it.height - S.vh;
    const progress = range > 0 ? clamp((S.y - it.top) / range) : (S.y >= it.top ? 1 : 0);
    const enter = clamp((S.y + S.vh - it.top) / (it.height + S.vh));
    const near = it.top < S.y + S.vh * 2 && it.top + it.height > S.y - S.vh;
    if (it.opts.always && near) keep = true;
    // Far away and already settled at 0 or 1: nothing to do
    if (!(forceAll || it.fresh || (it.opts.always && near) || (moved && near) || progress !== it.lastP || enter !== it.lastE)) continue;
    it.fresh = false;
    it.lastP = progress;
    it.lastE = enter;
    it.update({ el: it.el, y: S.y, rawY: raw, vh: S.vh, vw: S.vw, top: it.top, height: it.height, progress, enter, velocity: S.v, time });
  }
  forceAll = false;
  if (keep) rafId = requestAnimationFrame(frame);
};

const wake = () => { if (!rafId && items.size && !document.hidden) rafId = requestAnimationFrame(frame); };

const start = () => {
  if (started || !hasWindow) return;
  started = true;
  S.vw = window.innerWidth;
  S.vh = window.innerHeight;
  S.y = S.raw = S.prev = window.scrollY;
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', () => {
    syncHtmlClasses();
    // A phone's address bar sliding away changes the height a little: that is not a new layout
    if (Math.abs(window.innerWidth - S.vw) > 1 || Math.abs(window.innerHeight - S.vh) > 120) requestMeasure();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.prev = window.scrollY; wake(); } });
  // A photo that loads can move everything under it
  document.addEventListener('load', (event) => { if ((event.target as HTMLElement | null)?.tagName === 'IMG' && items.size) requestMeasure(); }, true);
  window.addEventListener('load', requestMeasure);
  document.fonts?.ready.then(requestMeasure).catch(() => {});
  reducedQuery?.addEventListener?.('change', () => { syncHtmlClasses(); requestMeasure(); });
  if ('ResizeObserver' in window) {
    sizeWatch = new ResizeObserver(requestMeasure);
    sizeWatch.observe(document.body);
  }
};

if (hasWindow) syncHtmlClasses();

/**
 * Register an element with the engine (outside React, or from your own effect). Returns the function that
 * removes it again. `update` runs inside requestAnimationFrame: write only transforms, opacity, clip-path
 * or CSS variables there.
 */
export const addScrollFx = (el: HTMLElement, update: Update, opts: ScrollFxOptions = {}) => {
  if (!hasWindow) return () => {};
  start();
  const item: Item = { el, update, opts, top: 0, height: 0, lastP: -1, lastE: -1, fresh: true };
  items.add(item);
  sizeWatch?.observe(el);
  requestMeasure();
  return () => {
    items.delete(item);
    if (el !== document.body) sizeWatch?.unobserve(el);
  };
};

const useIsoLayoutEffect = hasWindow ? useLayoutEffect : useEffect;

/**
 * Scroll-driven motion for one element. `update` is called (inside requestAnimationFrame) on every frame where
 * the scroll position or the layout changed, with the element's progress. It may change between renders: the
 * newest one is always used. Pass `deps` to register again when the element itself is replaced.
 */
export const useScrollFx = <T extends HTMLElement>(ref: RefObject<T | null>, update: Update, deps: DependencyList = [], opts: ScrollFxOptions = {}) => {
  const latest = useRef(update);
  const latestOpts = useRef(opts);
  useIsoLayoutEffect(() => { latest.current = update; latestOpts.current = opts; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    return addScrollFx(el, (frameInfo) => latest.current(frameInfo), {
      always: opts.always,
      measure: (node, size) => latestOpts.current.measure?.(node, size),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, opts.always, ...deps]);
};

const written = new WeakMap<Element, Record<string, string>>();
/**
 * Write a CSS variable (or, with a name that does not start with "--", a style property) only when its
 * value really changed. Numbers are rounded to `digits` decimals (3 by default).
 */
export const setVar = (el: HTMLElement | SVGElement | null, name: string, value: number | string, digits = 3) => {
  if (!el) return;
  const text = typeof value === 'number' ? String(+value.toFixed(digits)) : value;
  let cache = written.get(el);
  if (!cache) { cache = {}; written.set(el, cache); }
  if (cache[name] === text) return;
  cache[name] = text;
  if (name.startsWith('--')) el.style.setProperty(name, text);
  else (el.style as unknown as Record<string, string>)[name] = text;
};

/** The engine's current numbers, for code that runs outside an update. */
export const getScroll = () => ({ y: S.y, rawY: S.raw, velocity: S.v, vw: S.vw || (hasWindow ? window.innerWidth : 0), vh: S.vh || (hasWindow ? window.innerHeight : 0) });

const subscribeEnv = (onChange: () => void) => {
  if (!hasWindow) return () => {};
  window.addEventListener('resize', onChange, { passive: true });
  reducedQuery?.addEventListener?.('change', onChange);
  return () => { window.removeEventListener('resize', onChange); reducedQuery?.removeEventListener?.('change', onChange); };
};

/** True when a pinned section must render its static layout (the same rule as the class aura-nopin on <html>). */
export const useNoPin = () => useSyncExternalStore(subscribeEnv, noPin, () => true);
/** True when the visitor asked for reduced motion. */
export const useReducedMotion = () => useSyncExternalStore(subscribeEnv, prefersReducedMotion, () => false);
