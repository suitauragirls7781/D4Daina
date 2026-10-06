import { useEffect, useRef } from 'react';

/**
 * The phone's Back button closes whatever is open on top of the page (menu, search, bag drawer, a sheet,
 * the full-size photo) instead of leaving the page.
 *
 * While something is open it owns one entry in the browser history, at the same address. Back removes that
 * entry and the thing closes. Closing it by a tap removes the entry too, so one Back press still means one
 * step. If the shopper went on to another page from inside it (a menu link, a search result), the entry is
 * left behind and simply skipped when Back reaches it.
 */
let counter = 0;
const openNow = new Set<string>();
let listening = false;

const skipLeftovers = () => {
  const id = window.history.state?.sagOverlay;
  // An entry whose overlay is no longer open: go one more step, so Back never seems to do nothing
  if (id && !openNow.has(id)) window.history.back();
};

export const useBackToClose = (isOpen: boolean, close: () => void) => {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    if (!listening) {
      listening = true;
      window.addEventListener('popstate', skipLeftovers);
    }
    counter += 1;
    const id = `overlay-${counter}`;
    openNow.add(id);
    let closedByBack = false;
    try {
      window.history.pushState({ sagOverlay: id }, '', window.location.href);
    } catch {
      // History is not available (rare in-app browsers): the overlay still works, Back just leaves the page
    }
    const onPop = () => {
      if (window.history.state?.sagOverlay === id) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      openNow.delete(id);
      if (closedByBack) return;
      // Closed by a tap. A page change started from inside it lands in the history a moment later, so wait
      // before deciding: only when our entry is still the newest one is it taken off.
      window.setTimeout(() => {
        if (window.history.state?.sagOverlay === id) window.history.back();
      }, 400);
    };
  }, [isOpen]);
};

const SEEDED_KEY = 'sag_entry_seeded';

/**
 * A shopper who lands straight on an inner page (a product from an ad, a shared link) has nothing to go back
 * to, so Back would leave the store. Once per visit the homepage is placed under that page in the history:
 * Back then shows the homepage, and one more Back leaves as usual. Payment, checkout and admin pages are
 * left alone.
 */
export const seedHomeUnderFirstPage = () => {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(SEEDED_KEY)) return;
    sessionStorage.setItem(SEEDED_KEY, '1');
    const { pathname, search, hash } = window.location;
    if (pathname === '/' || /^\/(checkout|order|payment|admin|drdaina|d4daina)(\/|$)/i.test(pathname)) return;
    window.history.replaceState(null, '', '/');
    window.history.pushState(null, '', `${pathname}${search}${hash}`);
  } catch {
    // Storage or history blocked: nothing is changed
  }
};
