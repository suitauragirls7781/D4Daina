import { useEffect } from 'react';

// Scroll reveal for the whole storefront: each section (and anything marked data-reveal) rises in ONCE,
// the first time it comes into view; the children of a data-reveal-group follow one after another.
// The hidden start state is only ever set by this script, so without JavaScript, with reduced motion,
// or in a browser without IntersectionObserver everything is simply visible.

const SELECTOR = '#main-content section, #main-content [data-reveal], #main-content [data-reveal-group] > *, footer [data-reveal]';
const SKIP = '[data-no-reveal], [role="dialog"], [aria-modal="true"], .fixed, .sticky, header, nav';

export const useScrollReveal = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const seen = new WeakSet<Element>();
    const show = (el: Element) => { el.classList.add('is-in'); };
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target);
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });

    const adopt = (el: Element) => {
      if (seen.has(el) || el.closest(SKIP)) return;
      // A section inside a section: only the outer one moves, so nothing slides twice
      if (el.parentElement?.closest('.sag-reveal')) return;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      // Already on screen when it appears (the top of a page): no hiding, the page fade covers it
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) return;
      const group = el.parentElement?.hasAttribute('data-reveal-group') ? el.parentElement : null;
      if (group) (el as HTMLElement).style.setProperty('--sag-reveal-delay', `${Math.min(Array.prototype.indexOf.call(group.children, el), 7) * 70}ms`);
      el.classList.add('sag-reveal');
      io.observe(el);
    };
    const scan = (root: ParentNode) => root.querySelectorAll(SELECTOR).forEach(adopt);

    scan(document);
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; scan(document); });
    });
    mo.observe(document.getElementById('app-main-content') || document.body, { childList: true, subtree: true });
    // Safety net: anything still hidden after a while (a missed observer callback) is shown
    const net = window.setInterval(() => {
      document.querySelectorAll('.sag-reveal:not(.is-in)').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) show(el);
      });
    }, 1500);

    return () => { io.disconnect(); mo.disconnect(); window.clearInterval(net); };
  }, []);
};
