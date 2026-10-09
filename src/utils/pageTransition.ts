// Page changes: a two-layer curtain (rose, then ink) wipes up over the page with the wordmark in the middle,
// the page changes underneath, and the curtain leaves upwards. The whole thing takes about 0.8s.
// - Reduced motion, a hidden tab and the admin panel: the page simply changes.
// - A "plain" change (asked for by the phone tab bar): no curtain, the new page rises in, so the bar's
//   indicator is seen sliding to the tapped tab.
// - Back / Forward that only closes something open on top of the page (menu, search, a sheet: the address
//   stays the same): no curtain.
// - A change is never lost: it runs when the curtain has covered the page, and a safety timer runs it and
//   takes the curtain away even if a timer was dropped.
// (The curtain replaced the View Transitions animation, the growing product photo included.)

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
};

const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

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
