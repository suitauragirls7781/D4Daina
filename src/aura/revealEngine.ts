import { prefersReducedMotion } from './scroll';

// Reveal: things rise in ONCE, the first time they come into view. One IntersectionObserver and one
// MutationObserver for the whole site, started once (startReveal) and shared by:
//   - [data-rv] (optional data-rv-delay="120"; data-rv="fade|card|photo" picks the move), class "in" when shown;
//   - links with a drawn underline (.aura-lk, .sag-lnk);
//   - the storefront's older automatic reveal: every section of #main-content, [data-reveal] and the children
//     of [data-reveal-group] get "sag-reveal", then "is-in" (the same class names as before);
//   - <Reveal> and <MaskLines>, through revealOnce().
// Rules kept from the older script: the hidden state is only ever set here, and never on something that is
// already on screen when it appears. So without JavaScript, with reduced motion or without
// IntersectionObserver everything is simply visible.
// It also marks a photo placeholder (.aura-sk) as loaded (class "ok") when its photo has arrived.

const LEGACY = '#main-content section, #main-content [data-reveal], #main-content [data-reveal-group] > *, footer [data-reveal]';
const LEGACY_SKIP = '[data-no-reveal], [role="dialog"], [aria-modal="true"], .fixed, .sticky, header, nav';
const AURA = '[data-rv]:not([data-rv-own]), .aura-lk, .sag-lnk';
// A section that carries Aura pieces moves through them, not as one block
const AURA_INSIDE = '[data-rv], .aura-mlw, .aura-pin, [data-thread]';

type Kind = 'aura' | 'legacy' | 'callback';
interface Pending { kind: Kind; delay: number | null; done?: () => void; }

const hasWindow = typeof window !== 'undefined';
const pending = new Map<Element, Pending>();
const seen = new WeakSet<Element>();
let io: IntersectionObserver | null = null;
let started = false;

const onScreen = (el: Element) => {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
};

const show = (el: Element, order = 0) => {
  const info = pending.get(el);
  if (!info) return;
  pending.delete(el);
  io?.unobserve(el);
  const node = el as HTMLElement;
  const delay = info.delay ?? Math.min(order, 6) * 70;
  if (info.kind === 'callback') { info.done?.(); return; }
  if (info.kind === 'legacy') { node.classList.add('is-in'); return; }
  node.style.setProperty('--d', `${delay}ms`);
  node.classList.add('aura-go', 'in');
  node.classList.remove('aura-w');
  // The transition belongs to the arrival only: afterwards the element is free for its own hover motion
  window.setTimeout(() => { node.classList.remove('aura-go'); node.style.removeProperty('--d'); }, 1900 + delay);
};

const watch = (el: Element, info: Pending) => {
  pending.set(el, info);
  io?.observe(el);
};

const adoptAura = (el: Element) => {
  if (seen.has(el)) return;
  seen.add(el);
  // Already on screen when it appears (the top of a page): never hidden
  if (onScreen(el)) { el.classList.add('in'); return; }
  const raw = (el as HTMLElement).dataset.rvDelay;
  el.classList.add('aura-w');
  watch(el, { kind: 'aura', delay: raw != null && raw !== '' ? Number(raw) || 0 : null });
};

const adoptLegacy = (el: Element) => {
  if (seen.has(el)) return;
  seen.add(el);
  if (el.closest(LEGACY_SKIP)) return;
  // A themed or pinned section, or one built from Aura pieces, is not moved as a whole
  if (el.matches('[data-th], [data-rv], .aura-pin-wrap') || el.querySelector(AURA_INSIDE)) return;
  // A section inside a section: only the outer one moves, so nothing slides twice
  if (el.parentElement?.closest('.sag-reveal, .aura-w')) return;
  if (onScreen(el)) return;
  const group = el.parentElement?.hasAttribute('data-reveal-group') ? el.parentElement : null;
  let delay: number | null = null;
  if (group) {
    delay = Math.min(Array.prototype.indexOf.call(group.children, el), 7) * 70;
    (el as HTMLElement).style.setProperty('--sag-reveal-delay', `${delay}ms`);
  }
  el.classList.add('sag-reveal');
  watch(el, { kind: 'legacy', delay: delay ?? 0 });
};

const markLoaded = (img: HTMLImageElement) => { img.closest('.aura-sk')?.classList.add('ok'); };

const scan = () => {
  document.querySelectorAll(AURA).forEach(adoptAura);
  document.querySelectorAll(LEGACY).forEach(adoptLegacy);
  document.querySelectorAll<HTMLImageElement>('.aura-sk:not(.ok) img').forEach((img) => { if (img.complete) markLoaded(img); });
};

/** Start the shared reveal (safe to call many times; it starts once). */
export const startReveal = () => {
  if (started || !hasWindow) return;
  started = true;
  // Photo placeholders are marked in every case, also with reduced motion
  const onMedia = (event: Event) => { const t = event.target as HTMLElement | null; if (t && t.tagName === 'IMG') markLoaded(t as HTMLImageElement); };
  document.addEventListener('load', onMedia, true);
  document.addEventListener('error', onMedia, true);

  const motion = 'IntersectionObserver' in window && !prefersReducedMotion();
  if (motion) {
    io = new IntersectionObserver((entries) => {
      let order = 0;
      for (const entry of entries) if (entry.isIntersecting) show(entry.target, order++);
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
  }
  const pass = motion ? scan : () => document.querySelectorAll<HTMLImageElement>('.aura-sk:not(.ok) img').forEach((img) => { if (img.complete) markLoaded(img); });

  pass();
  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; pass(); });
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // Safety net: anything still waiting although it is on screen (a missed observer callback) is shown
  window.setInterval(() => {
    if (!pending.size) return;
    for (const el of [...pending.keys()]) {
      if (!el.isConnected) { pending.delete(el); continue; }
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) show(el);
    }
  }, 1500);
};

/**
 * Call `done` once, the first time `el` comes into view (at once with reduced motion or without
 * IntersectionObserver). Returns the function that stops waiting. Used by <Reveal> and <MaskLines>.
 */
export const revealOnce = (el: Element, done: () => void, delay: number | null = null) => {
  startReveal();
  if (!io) { done(); return () => {}; }
  seen.add(el);
  watch(el, { kind: 'callback', delay, done });
  return () => { pending.delete(el); io?.unobserve(el); };
};
