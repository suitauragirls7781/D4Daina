import { flushSync } from 'react-dom';

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

const supported = () =>
  typeof document !== 'undefined'
  && typeof (document as ViewTransitionDocument).startViewTransition === 'function'
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let running = false;

if (typeof document !== 'undefined' && supported()) document.documentElement.classList.add('sag-vt');

/**
 * Runs a page change as an animated view transition (old page fades out, new one fades up;
 * a product photo marked `pdp-hero` grows into the product page photo). Browsers without
 * support, or with reduced motion, just change the page (the CSS fade still applies there).
 */
// A view transition shows still pictures of the old and the new page while it runs, so anything that should
// keep moving through a page change (the phone navigation's bubble gliding to the tapped tab) would stand
// still under it. A caller that needs live motion asks for the next page change to be a plain one: the new
// page then rises in with the CSS enter animation instead (class "sag-novt", see the end of index.css).
let plainNext = false;
let plainTimer = 0;
export const nextPageChangePlain = () => { plainNext = true; };

export const withPageTransition = (update: () => void) => {
  if (plainNext) {
    plainNext = false;
    const root = document.documentElement;
    root.classList.add('sag-novt');
    window.clearTimeout(plainTimer);
    plainTimer = window.setTimeout(() => root.classList.remove('sag-novt'), 700);
    update();
    return;
  }
  if (running || !supported()) {
    update();
    return;
  }
  running = true;
  try {
    const transition = (document as ViewTransitionDocument).startViewTransition!(() => {
      flushSync(update);
    });
    transition.finished.finally(() => {
      running = false;
      document.querySelectorAll<HTMLElement>('[data-vt-source]').forEach((el) => {
        el.style.viewTransitionName = '';
        el.removeAttribute('data-vt-source');
      });
    });
  } catch {
    running = false;
    update();
  }
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
