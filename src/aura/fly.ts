import { prefersReducedMotion } from './scroll';

// "Added to bag": a small round copy of the product photo flies along a curve to the bag button that is on
// screen, and that button bumps once. The target is whatever carries data-bag-target and is visible: the tab
// bar's bag on phones, the header's bag otherwise (the site frame puts the attribute on both).

const visibleTarget = () => {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-bag-target]'));
  const onScreen = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
  // On a phone the tab bar's bag is the lower one: prefer it
  return onScreen.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[window.innerWidth < 900 ? 0 : onScreen.length - 1] || null;
};

/** Bump a bag button once (also used after a plain add without the flight). */
export const bumpBag = (target: HTMLElement | null = typeof document === 'undefined' ? null : visibleTarget()) => {
  if (!target || prefersReducedMotion()) return;
  target.classList.remove('aura-bump');
  void target.offsetWidth;
  target.classList.add('aura-bump');
};

/**
 * Fly the photo from `fromEl` (the card's photo or the add button) to the bag. Resolves when it has landed.
 * Does nothing (and resolves at once) with reduced motion, without a visible bag button or without a photo.
 */
export const flyToBag = (fromEl: Element | null, imageUrl: string | null | undefined): Promise<void> => new Promise((resolve) => {
  if (typeof document === 'undefined' || !fromEl || !imageUrl || prefersReducedMotion()) { resolve(); return; }
  const target = visibleTarget();
  if (!target || typeof target.animate !== 'function') { resolve(); return; }
  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = '';
  img.className = 'aura-fly';
  img.setAttribute('aria-hidden', 'true');
  document.body.append(img);

  const x0 = a.left + a.width / 2 - 28;
  const y0 = a.top + a.height / 2 - 28;
  const x1 = b.left + b.width / 2 - 28;
  const y1 = b.top + b.height / 2 - 28;
  // One control point above both ends gives the arc
  const cx = x0 + (x1 - x0) * 0.15;
  const cy = Math.min(y0, y1) - 110;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1.25 - 0.9 * t).toFixed(3)})`, opacity: t > 0.94 ? 0.4 : 1 });
  }
  const done = () => { img.remove(); bumpBag(target); resolve(); };
  const run = img.animate(frames, { duration: 820, easing: 'cubic-bezier(.45,0,.4,1)' });
  run.onfinish = done;
  run.oncancel = done;
});
