import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * One notice at a time, anchored at the top just under the header, so it never covers a buy, checkout or
 * pay bar or the bottom navigation. On the product page the photos sit right under the header, so there it
 * is anchored at the bottom instead: just above the phone buy bar, and in the right-hand column on desktop.
 * A small near-black box with ivory text and a thin rule on the left: champagne for done and for plain
 * information, red for an error (always with an icon and words). A message may carry a second line after "\n" (the product name),
 * shown truncated so the first line, which says what happened, is always readable.
 */
export const Toast: React.FC = () => {
  const { toast, activePage, isCartDrawerOpen, setIsCartDrawerOpen } = useShop();
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(false); }, [toast?.message]);

  const atBottom = activePage === 'product-detail';
  // Top: 8px under the header wherever it is right now (the announcement line above it may have scrolled away).
  // Bottom (product page): 8px above the fixed buy bar when one is on screen.
  const [offset, setOffset] = useState(12);
  useLayoutEffect(() => {
    if (!toast) return;
    if (atBottom) {
      const bar = Array.from(document.querySelectorAll<HTMLElement>('.sag-bar.fixed')).find((el) => el.getBoundingClientRect().height > 0);
      setOffset(bar ? Math.max(12, Math.round(window.innerHeight - bar.getBoundingClientRect().top) + 8) : 16);
      return;
    }
    // The first sticky header that is actually on screen (checkout hides the site header and shows its own)
    const header = Array.from(document.querySelectorAll('header.sticky')).find((el) => el.getBoundingClientRect().height > 0);
    setOffset(header ? Math.max(12, Math.round(header.getBoundingClientRect().bottom) + 8) : 12);
  }, [toast?.message, atBottom]);

  if (!toast || hidden) return null;

  const tone = toast.type === 'error'
    ? { Icon: AlertCircle, icon: 'text-on-dark', bar: 'bg-danger' }
    : toast.type === 'info'
      ? { Icon: Info, icon: 'text-highlight', bar: 'bg-highlight' }
      : { Icon: CheckCircle2, icon: 'text-highlight', bar: 'bg-highlight' };
  const { Icon } = tone;
  const [headline, ...rest] = toast.message.split('\n');
  const detail = rest.join(' ').trim();
  // "Added to bag" carries a way to the bag, unless the shopper is already looking at it
  const viewBag = toast.type === 'success' && toast.message.startsWith('Added to bag')
    && !isCartDrawerOpen && activePage !== 'cart' && activePage !== 'checkout';

  return (
    <div
      id="app-toast"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={atBottom ? { bottom: offset } : { top: offset }}
      className={`fixed left-1/2 -translate-x-1/2 z-[10000] w-[calc(100%-24px)] sm:w-auto sm:min-w-[340px] max-w-md ${atBottom ? 'lg:left-auto lg:right-6 lg:translate-x-0 lg:w-[360px] lg:min-w-0 slide-in-from-bottom-2' : 'slide-in-from-top-2'} bg-ink text-on-dark rounded-lg! shadow-[var(--sag-shadow-pop)] pl-4 pr-1 py-0.5 flex items-center gap-2.5 overflow-hidden animate-in fade-in`}
    >
      <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-[3px] ${tone.bar}`} />
      <Icon className={`w-[18px] h-[18px] shrink-0 ${tone.icon}`} strokeWidth={1.5} aria-hidden="true" />
      {/* The padding sits on the wrapper: on the clamped line itself it would let a third line show through */}
      <div className="flex-1 min-w-0 py-2">
        <p className={`text-[13.5px] leading-5 break-words ${detail ? 'font-semibold line-clamp-1' : 'line-clamp-2'}`}>{headline}</p>
        {detail && <p className="text-[13px] leading-5 text-on-dark-muted truncate">{detail}</p>}
      </div>
      {viewBag && (
        <button type="button" onClick={() => { setIsCartDrawerOpen(true); setHidden(true); }} className="sag-caps shrink-0 h-11 px-2 text-[11px] leading-5 font-semibold uppercase tracking-[0.16em] text-highlight underline underline-offset-4 decoration-1 whitespace-nowrap cursor-pointer">
          View bag
        </button>
      )}
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-on-dark-muted hover:text-on-dark cursor-pointer">
        <X className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
};
