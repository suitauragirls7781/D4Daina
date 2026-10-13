// Page changes: a two-layer curtain (rose, then ink) wipes up over the page with the wordmark in the middle,
// the page changes underneath, and the curtain leaves upwards. The whole thing takes about 0.8s.
// - Reduced motion, a hidden tab and the admin panel: the page simply changes.
// - A "plain" change (asked for by the phone tab bar): no curtain, the new page rises in, so the bar's
//   indicator is seen sliding to the tapped tab.
// - Back / Forward that only closes something open on top of the page (menu, search, a sheet: the address
//   stays the same): no curtain.
// - A change is never lost: it runs when the curtain has covered the page, and a safety timer runs it and
//   takes the curtain away even if a timer was dropped.
// (The curtain replaced the View Transitions animation. Preview "Aura Kinetic": a tapped product photo flies
//  to its place on the product page instead, see flight() below.)

const COVER_MS = 290;   // rose 230ms, ink 60ms later: the page is covered
const HOLD_MS = 60;     // the new page is put in place under the curtain
const LEAVE_MS = 420;   // ink 350ms, rose 70ms later
const SAFETY_MS = 1500;

import { isAdminAreaPath } from './adminEntry';

const hasDom = typeof document !== 'undefined';
const reduced = () => !hasDom || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const here = () => window.location.pathname + window.location.search;

// With this class the CSS rise-in of a new page is off (the curtain is the page change); a plain change
// switches it on again for one page change (class "sag-novt", see the end of index.css).
if (hasDom && !reduced()) document.documentElement.classList.add('sag-vt');

let plainNext = false;
let plainTimer = 0;
export const nextPageChangePlain = () => { plainNext = true; };

// The address the shopper is looking at, to tell a real Back / Forward from one that only closes a sheet
let lastPath = hasDom ? here() : '';
if (hasDom) {
  const note = () => { lastPath = here(); };
  window.addEventListener('pointerdown', note, { capture: true, passive: true });
  window.addEventListener('keydown', note, { capture: true, passive: true });
  window.addEventListener('popstate', () => { window.setTimeout(note, 0); });
}

let phase: 'idle' | 'cover' | 'leave' = 'idle';
let queue: Array<() => void> = [];
let timers: number[] = [];
let curtain: HTMLElement | null = null;

const getCurtain = () => {
  if (curtain && curtain.isConnected) return curtain;
  curtain = document.createElement('div');
  curtain.id = 'aura-cur';
  curtain.className = 'aura-cur';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<i class="x"></i><i class="y"></i><span>Suit <em>Aura</em> Girls</span>';
  document.body.append(curtain);
  return curtain;
};

// A product card may still carry the name used by the old photo animation: take it off again
const tidy = () => {
  document.querySelectorAll<HTMLElement>('[data-vt-source]').forEach((el) => {
    el.style.viewTransitionName = '';
    el.removeAttribute('data-vt-source');
  });
};

const runQueue = () => {
  const run = queue;
  queue = [];
  run.forEach((update) => { try { update(); } catch (error) { console.error(error); } });
  tidy();
  lastPath = here();
};

const finish = () => {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
  runQueue();
  phase = 'idle';
  if (curtain) curtain.className = 'aura-cur';
  document.querySelectorAll('.kx-fly').forEach((el) => el.remove());
};

const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

// ---- The photo flight (preview "Aura Kinetic") ----------------------------------------------------------------
// A tap on a product card marks its photo (data-vt-source, see ProductCard). Instead of the curtain, a paper
// veil comes over the page, the page changes underneath, and a copy of the tapped photo travels to the place of
// the product page's large photo (data-vt-hero) and hands over to it. Transforms and opacity only, on two
// elements; if the product page is not there in time the copy simply fades. Returns false when there is nothing
// to fly (then the curtain is used).
const VEIL_MS = 190;
const FLY_MS = 560;
const flight = (update: () => void) => {
  const source = document.querySelector<HTMLImageElement>('img[data-vt-source]');
  if (!source || typeof source.animate !== 'function') return false;
  // The photo's frame is what the eye sees (a gallery photo is wider than its frame)
  const from = (source.closest('.aura-sk') || source).getBoundingClientRect();
  if (from.width < 40 || from.height < 40 || from.bottom < 20 || from.top > window.innerHeight - 20) return false;
  let box: HTMLElement;
  let copy: HTMLImageElement;
  try {
    box = document.createElement('div');
    box.className = 'kx-fly';
    box.setAttribute('aria-hidden', 'true');
    const veil = document.createElement('i');
    copy = new Image();
    copy.alt = '';
    copy.decoding = 'sync';
    copy.src = source.currentSrc || source.src;
    copy.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    box.append(veil, copy);
    document.body.append(box);
    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: VEIL_MS, easing: 'ease-out', fill: 'forwards' });
    copy.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }], { duration: VEIL_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' });
  } catch { return false; }
  phase = 'cover';
  queue.push(update);
  const leave = (ms: number) => {
    phase = 'leave';
    try { box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }); } catch { /* removed below */ }
    later(finish, ms + 20);
  };
  later(() => {
    runQueue();
    let tries = 0;
    const land = () => {
      if (phase !== 'cover' || !box.isConnected) return;
      const hero = document.querySelector<HTMLImageElement>('#main-content img[data-vt-hero]');
      const frame = hero?.closest<HTMLElement>('.pdp-fr') || hero;
      const to = frame?.getBoundingClientRect();
      if (!hero || !to || to.width < 40) {
        // The product page is still arriving: wait a little (about half a second), then give up quietly
        if (++tries < 34) { window.requestAnimationFrame(land); return; }
        leave(220);
        return;
      }
      phase = 'leave';
      const k = to.width / from.width;
      const veil = box.firstElementChild as HTMLElement;
      // The copy keeps its proportions and is cut to the frame's shape on the way
      const cut = Math.max(0, 1 - to.height / (from.height * k)) * 100;
      const radius = (px: number) => `${(px / k).toFixed(1)}px`;
      try {
        copy.animate(
          [
            { transform: 'scale(1.035)', clipPath: 'inset(0 0 0 0 round 17px)' },
            { transform: `translate3d(${(to.left - from.left).toFixed(1)}px, ${(to.top - from.top).toFixed(1)}px, 0) scale(${k.toFixed(4)})`, clipPath: `inset(0 0 ${cut.toFixed(2)}% 0 round ${radius(26)})` },
          ],
          { duration: FLY_MS, easing: 'cubic-bezier(0.3, 0.75, 0.12, 1)', fill: 'forwards' },
        );
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 90, easing: 'ease-out', fill: 'forwards' });
      } catch { leave(200); return; }
      // Hand over once the copy has landed and the page's own photo is there (it was preloaded by the card)
      later(() => {
        let waits = 0;
        const hand = () => {
          if (!hero.isConnected || hero.complete || ++waits > 12) { leave(200); return; }
          later(hand, 50);
        };
        hand();
      }, FLY_MS + 10);
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(land));
  }, VEIL_MS);
  later(finish, SAFETY_MS + 900);
  return true;
};

export const withPageTransition = (update: () => void) => {
  if (!hasDom) { update(); return; }
  if (plainNext) {
    plainNext = false;
    const root = document.documentElement;
    root.classList.add('sag-novt');
    window.clearTimeout(plainTimer);
    plainTimer = window.setTimeout(() => root.classList.remove('sag-novt'), 700);
    update();
    tidy();
    lastPath = here();
    return;
  }
  // The curtain is already covering the page: this change happens under it too
  if (phase === 'cover') { queue.push(update); return; }
  const event = window.event;
  const sheetClosed = Boolean(event && event.type === 'popstate' && here() === lastPath);
  // The admin panel lives under its own entry address (utils/adminEntry.ts), not under /admin
  const admin = isAdminAreaPath(window.location.pathname) || isAdminAreaPath(lastPath.split('?')[0]) || window.location.pathname.startsWith('/admin');
  if (phase === 'leave' || reduced() || document.hidden || sheetClosed || admin) {
    update();
    tidy();
    lastPath = here();
    return;
  }
  // A tapped product photo travels to the product page instead of the curtain
  if (flight(update)) return;
  let el: HTMLElement;
  try { el = getCurtain(); } catch { update(); return; }
  phase = 'cover';
  queue.push(update);
  // Start from the resting state, so the wipe always runs from below
  el.className = 'aura-cur';
  void el.offsetWidth;
  el.className = 'aura-cur a';
  later(() => {
    runQueue();
    later(() => {
      phase = 'leave';
      el.className = 'aura-cur b';
      later(finish, LEAVE_MS + 30);
    }, HOLD_MS);
  }, COVER_MS);
  // Whatever happens to the timers above, the change is made and the curtain goes
  later(finish, SAFETY_MS);
};

/** Loads an image (up to `maxWait` ms) so the product page photo is ready when the animation lands. */
export const preloadImage = (src: string, maxWait = 280, responsive?: { srcSet?: string; sizes?: string }) =>
  new Promise<void>((resolve) => {
    if (!src) return resolve();
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    // The same srcset as the page's photo, so the browser picks (and keeps) the very file the page will show
    if (responsive?.srcSet) {
      img.sizes = responsive.sizes || '';
      img.srcset = responsive.srcSet;
    }
    img.src = src;
    if (img.complete) return resolve();
    setTimeout(done, maxWait);
  });
