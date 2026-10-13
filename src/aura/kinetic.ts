import { useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion, useScrollFx } from './scroll';

// Aura Kinetic: the site-wide interaction layer of the motion-first preview.
//   startKinetic()  one pointer listener and one animation-frame loop (asleep unless something is moving) for
//                   - magnets: round and pill buttons lean a few pixels towards a mouse pointer and spring back;
//                   - the pointer label: a small rose disc with one word ("View", "Zoom", "Play") that follows
//                     the mouse over photos. Both are for a real mouse only (hover: hover and pointer: fine);
//                     a phone never runs them.
//   enterPage()     the first screen of a new page arrives piece by piece (the blocks that are on screen rise
//                   in one after another) while the page-change curtain leaves.
//   useFlip()       items of a list or grid glide from their old place to their new one when the list changes
//                   (sort, filter, an item removed) instead of jumping.
// Everything writes only `translate`, `scale`, `opacity` or `transform`, never layout properties, and none of
// it runs with prefers-reduced-motion. The `translate` / `scale` properties are used on purpose: they add to an
// element's own `transform` (a button's press, a card's tilt) instead of replacing it.

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
const finePointer = () => hasDom && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

// ---- Magnets and the pointer label ---------------------------------------------------------------------------
const MAGNET = '.aura-btn, .aura-rnd, .sag-btn-primary, .sag-btn-outline, .sag-btn-light, .aura-hb, .pdp-ic, .shop-fbtn, .shop-tool, .cdir-p, .aura-ft-so, [data-magnet]';
const LABELS: Array<[string, string]> = [
  ['[data-cur]', ''],
  ['.aura-pc-ph', 'View'],
  ['.hm-gc-f', 'View'],
  ['.hm-hero-clip', 'View'],
  ['.hm-hs-ph', 'View'],
  ['.hm-cc-in', 'Open'],
  ['.aura-rc', 'Play'],
  ['.pdp-s', 'Zoom'],
];
const LABEL_SELECTOR = LABELS.map((l) => l[0]).join(', ');

interface Magnet { el: HTMLElement; cx: number; cy: number; pull: number; x: number; y: number; tx: number; ty: number; }
let magnet: Magnet | null = null;
const leaving: Magnet[] = [];
let disc: HTMLElement | null = null;
let discOn = false;
let discX = 0, discY = 0, discTx = 0, discTy = 0;
let frame = 0;
let started = false;

const getDisc = () => {
  if (disc && disc.isConnected) return disc;
  disc = document.createElement('div');
  disc.className = 'kx-cur';
  disc.setAttribute('aria-hidden', 'true');
  disc.innerHTML = '<span></span>';
  document.body.append(disc);
  return disc;
};

const settle = (m: Magnet) => {
  m.x += (m.tx - m.x) * 0.2;
  m.y += (m.ty - m.y) * 0.2;
  const still = Math.abs(m.tx - m.x) < 0.1 && Math.abs(m.ty - m.y) < 0.1;
  if (still && m.tx === 0 && m.ty === 0) { m.el.style.removeProperty('translate'); return true; }
  m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
  return still;
};

const tick = () => {
  frame = 0;
  let busy = false;
  if (magnet && !settle(magnet)) busy = true;
  for (let i = leaving.length - 1; i >= 0; i--) {
    if (settle(leaving[i])) leaving.splice(i, 1); else busy = true;
  }
  if (disc && discOn) {
    discX += (discTx - discX) * 0.24;
    discY += (discTy - discY) * 0.24;
    disc.style.transform = `translate3d(${discX.toFixed(1)}px, ${discY.toFixed(1)}px, 0)`;
    if (Math.abs(discTx - discX) > 0.3 || Math.abs(discTy - discY) > 0.3) busy = true;
  }
  if (busy) frame = requestAnimationFrame(tick);
};
const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };

const release = () => {
  if (!magnet) return;
  magnet.tx = 0; magnet.ty = 0;
  leaving.push(magnet);
  magnet = null;
  wake();
};
const hideDisc = () => {
  if (!discOn) return;
  discOn = false;
  disc?.classList.remove('on');
};

/** Start the magnets and the pointer label (safe to call many times; it does nothing on a touch screen). */
export const startKinetic = () => {
  if (started || !hasDom) return;
  started = true;
  if (!finePointer() || prefersReducedMotion()) return;
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const target = event.target instanceof Element ? event.target : null;
    // Magnet
    const el = target?.closest<HTMLElement>(MAGNET) || null;
    if (el !== (magnet?.el || null)) {
      release();
      if (el && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true') {
        const rect = el.getBoundingClientRect();
        // A wide button leans less than a round one
        const back = leaving.findIndex((m) => m.el === el);
        const from = back >= 0 ? leaving.splice(back, 1)[0] : null;
        magnet = { el, cx: rect.left + rect.width / 2 - (from?.x || 0), cy: rect.top + rect.height / 2 - (from?.y || 0), pull: rect.width > 260 ? 0.05 : rect.width > 120 ? 0.14 : 0.3, x: from?.x || 0, y: from?.y || 0, tx: 0, ty: 0 };
      }
    }
    if (magnet) {
      magnet.tx = Math.max(-9, Math.min(9, (event.clientX - magnet.cx) * magnet.pull));
      magnet.ty = Math.max(-7, Math.min(7, (event.clientY - magnet.cy) * (magnet.pull + 0.1)));
      wake();
    }
    // Pointer label
    const host = target?.closest<HTMLElement>(LABEL_SELECTOR) || null;
    // Not over a control that sits on the photo (the heart)
    const word = host && !target?.closest('button:not(.hm-hero-clip):not(.hm-cc-in):not(.aura-rc):not(.pdp-s), .aura-hrt')
      ? (host.dataset.cur || LABELS.find((l) => l[1] && host.matches(l[0]))?.[1] || '')
      : '';
    if (word) {
      const d = getDisc();
      discTx = event.clientX; discTy = event.clientY;
      if (!discOn) {
        discOn = true;
        discX = discTx; discY = discTy;
        d.style.transform = `translate3d(${discX}px, ${discY}px, 0)`;
        d.classList.add('on');
      }
      const span = d.firstElementChild as HTMLElement;
      if (span.textContent !== word) span.textContent = word;
      wake();
    } else hideDisc();
  }, { passive: true });
  const off = () => { release(); hideDisc(); };
  window.addEventListener('scroll', off, { passive: true });
  document.addEventListener('pointerdown', hideDisc, { passive: true });
  document.documentElement.addEventListener('pointerleave', off, { passive: true });
  window.addEventListener('blur', off);
};

// ---- The first screen of a new page arrives piece by piece -----------------------------------------------------
// Something that is (or holds) a fixed layer is never moved: a moved ancestor would carry the fixed bar with it.
const HOLDS_FIXED = '.fixed, [class*=":fixed"], .pdp-buy, .shop-orb, .kx-ch, [role="dialog"], .aura-pin, .hm-hero-pin';
const NEVER = '.fixed, [class*=":fixed"], .sticky, .aura-pin-wrap, .aura-pin, .hm-hero, .shop-fbar, .pdp-buy, .pdp-gi, .shop-orb, .kx-ch, .aura-thr, [role="dialog"], [role="status"], .aura-mq, .hm-cc, svg, script, style';
let enterToken = 0;

const pickBlocks = (root: Element) => {
  const picks: HTMLElement[] = [];
  const vh = window.innerHeight;
  const walk = (parent: Element, depth: number) => {
    for (const child of Array.from(parent.children)) {
      if (picks.length >= 10) return;
      if (!(child instanceof HTMLElement) || child.matches(NEVER)) continue;
      const rect = child.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0) continue;
      if (rect.top >= vh * 0.98) continue;
      const holds = Boolean(child.querySelector(HOLDS_FIXED));
      const tall = rect.height > vh * 0.5;
      if ((holds || tall) && depth < 5 && child.children.length > 1) { walk(child, depth + 1); continue; }
      if ((holds || tall) && depth < 5 && child.children.length === 1) { walk(child, depth + 1); continue; }
      if (holds) continue;
      picks.push(child);
    }
  };
  walk(root, 0);
  return picks;
};

/**
 * The blocks of the new page that are on screen rise in one after another (a short stagger). Call it right
 * after the page has been put in place (App does, in a layout effect). Nothing is hidden by a class: the hidden
 * start is the first frame of a Web Animation, so if anything fails the page is simply there.
 */
export const enterPage = (delay = 0) => {
  if (!hasDom || prefersReducedMotion() || typeof Element.prototype.animate !== 'function') return;
  // The phone tab bar's plain change already lets the whole page rise
  if (document.documentElement.classList.contains('sag-novt')) return;
  const main = document.getElementById('main-content');
  if (!main) return;
  const token = ++enterToken;
  const run = () => {
    if (token !== enterToken) return;
    const blocks = pickBlocks(main);
    blocks.forEach((el, i) => {
      try {
        el.animate(
          [{ opacity: 0, translate: '0 34px' }, { opacity: 1, offset: 0.5 }, { opacity: 1, translate: '0 0' }],
          { duration: 780, delay: delay + i * 60, easing: 'cubic-bezier(0.16, 0.84, 0.24, 1)', fill: 'backwards' },
        );
      } catch { /* an old browser without the translate property in keyframes: the page is simply there */ }
    });
  };
  // A page whose code is still arriving shows a placeholder first: wait for the real page (3s at most)
  const waiting = () => !main.firstElementChild || Boolean(main.querySelector(':scope > [role="status"]'));
  if (!waiting()) { run(); return; }
  const mo = new MutationObserver(() => { if (!waiting()) { mo.disconnect(); run(); } });
  mo.observe(main, { childList: true });
  window.setTimeout(() => mo.disconnect(), 3000);
};

// ---- Arrive: the parts of something that has just been put on the page come in one after another ----------------
/**
 * When `dep` changes to something truthy (an order was found, a list has loaded, a step was opened), the
 * container's parts marked `data-arr` that are on screen rise in one after another. Like `enterPage`, the hidden
 * start is only the first frame of a Web Animation, so nothing can be left hidden; it does nothing with reduced
 * motion. Pass `first: false` to skip the very first time (a page that is itself arriving already moves).
 */
export function useArrive(ref: RefObject<HTMLElement | null>, dep: unknown, options: { selector?: string; first?: boolean; step?: number } = {}) {
  const ran = useRef(false);
  const selector = options.selector || '[data-arr]';
  const step = options.step ?? 70;
  const first = options.first !== false;
  useLayoutEffect(() => {
    const host = ref.current;
    const isFirst = !ran.current;
    ran.current = true;
    if (!host || !dep || (isFirst && !first) || prefersReducedMotion() || typeof host.animate !== 'function') return;
    const vh = window.innerHeight;
    let n = 0;
    host.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (n >= 12) return;
      const rect = el.getBoundingClientRect();
      if (!rect.height || rect.bottom <= 0 || rect.top >= vh) return;
      try {
        el.animate(
          [{ opacity: 0, translate: '0 22px' }, { opacity: 1, offset: 0.55 }, { opacity: 1, translate: '0 0' }],
          { duration: 680, delay: n * step, easing: 'cubic-bezier(0.16, 0.84, 0.24, 1)', fill: 'backwards' },
        );
      } catch { /* no translate keyframes: the part is simply there */ }
      n += 1;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}

// ---- FLIP: list items glide to their new place -------------------------------------------------------------------
interface FlipOptions {
  /** The items inside the container (default: its direct children). Each needs an id or a data-flip key. */
  selector?: string;
  /** Skip the glide for this change (the list was replaced by something unrelated). */
  skip?: boolean;
}
const keyOf = (el: Element) => (el as HTMLElement).dataset.flip || el.id || '';

/**
 * When `dep` changes, the container's items that changed place glide there from where they were, and items that
 * are new to the list grow in. Only items near the screen move (40 at most); transforms only.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, dep: unknown, options: FlipOptions = {}) {
  const rects = useRef(new Map<string, { x: number; y: number }>());
  const first = useRef(true);
  const selector = options.selector || ':scope > *';
  const skip = Boolean(options.skip);

  const read = (host: HTMLElement) => {
    const out = new Map<string, { x: number; y: number; el: HTMLElement }>();
    const sx = window.scrollX, sy = window.scrollY;
    host.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const key = keyOf(el);
      if (!key) return;
      const rect = el.getBoundingClientRect();
      if (rect.width) out.set(key, { x: rect.left + sx, y: rect.top + sy, el });
    });
    return out;
  };

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const now = read(host);
    const before = rects.current;
    const canMove = !first.current && !skip && before.size > 0 && !prefersReducedMotion() && typeof host.animate === 'function';
    first.current = false;
    if (canMove) {
      const top = window.scrollY - window.innerHeight * 0.4;
      const bottom = window.scrollY + window.innerHeight * 1.4;
      let moved = 0;
      now.forEach((item, key) => {
        if (moved >= 40 || item.y > bottom || item.y + item.el.offsetHeight < top) return;
        if (item.el.classList.contains('aura-w')) return;
        const was = before.get(key);
        try {
          if (!was) {
            item.el.animate([{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }], { duration: 520, delay: Math.min(moved, 8) * 30, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
            moved += 1;
            return;
          }
          const dx = was.x - item.x;
          const dy = was.y - item.y;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
          // An item that comes from far away only travels the last part of the way
          const far = Math.hypot(dx, dy);
          const k = far > 900 ? 900 / far : 1;
          item.el.animate([{ translate: `${(dx * k).toFixed(1)}px ${(dy * k).toFixed(1)}px` }, { translate: '0 0' }], { duration: 620, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
          moved += 1;
        } catch { /* no translate keyframes: the item is simply in its new place */ }
      });
    }
    const store = (map: Map<string, { x: number; y: number }>) => { rects.current = new Map(Array.from(map, ([k, v]) => [k, { x: v.x, y: v.y }])); };
    store(now);
    // Keep the remembered places true when the layout changes for another reason (a photo loaded, the window resized)
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (ref.current) store(read(ref.current)); });
    ro.observe(host);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}

// ---- Column drift: the columns of a small grid travel at slightly different speeds -----------------------------
/**
 * The cards of a grid move a few pixels against each other while the grid crosses the screen (odd columns up,
 * even columns down); a card that spans columns stays put. For SMALL grids only (a dozen cards at most): every
 * card becomes its own layer. Columns are read in the engine's measure pass, never on a scroll frame.
 */
export function useColumnDrift(ref: RefObject<HTMLElement | null>, amount = 14, selector = ':scope > *') {
  const cards = useRef<Array<{ el: HTMLElement; dir: number }>>([]);
  useScrollFx(ref, ({ enter }) => {
    if (prefersReducedMotion()) return;
    const v = (enter - 0.5) * 2 * amount;
    for (const card of cards.current) card.el.style.translate = `0 ${(v * card.dir).toFixed(1)}px`;
  }, [amount, selector], {
    measure: (host) => {
      const width = host.offsetWidth || 1;
      const next: Array<{ el: HTMLElement; dir: number }> = [];
      host.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        const w = el.offsetWidth;
        if (!w || w > width * 0.6 || prefersReducedMotion()) { el.style.removeProperty('translate'); el.classList.remove('kx-col'); return; }
        el.classList.add('kx-col');
        next.push({ el, dir: Math.round(el.offsetLeft / w) % 2 ? -1 : 1 });
      });
      cards.current = next.slice(0, 12);
    },
  });
}