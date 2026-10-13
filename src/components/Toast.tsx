import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { AlertCircle, Info, X } from 'lucide-react';

/**
 * One notice at a time (Aura): an ink pill that drops from under the header, so it never covers a buy,
 * checkout or pay bar or the tab bar. When the header has slid away it sits near the top edge instead.
 * Done: a rose tick that draws itself. Plain information: a rose "i". An error: red, always with an icon and
 * words. A message may carry a second line after "\n" (the product name), shown truncated so the first line,
 * which says what happened, is always readable.
 */
export const Toast: React.FC = () => {
  const { toast, activePage, isCartDrawerOpen, setIsCartDrawerOpen } = useShop();
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(false); }, [toast?.message]);

  // 10px under the header wherever it is right now (checkout hides the site header and shows its own)
  const [offset, setOffset] = useState(12);
  useLayoutEffect(() => {
    if (!toast) return;
    // A page with its own top bar (checkout) marks it: the notice drops under it, never over its back button or "Help"
    const own = document.querySelector('[data-toast-under]');
    const header = own || Array.from(document.querySelectorAll('header.fixed, header.sticky')).find((el) => el.getBoundingClientRect().height > 0);
    // The bar inside the site header is what is seen (the header's own box keeps its full height)
    const bar = header?.querySelector('.aura-hd-bar') || header;
    setOffset(bar ? Math.max(12, Math.round(bar.getBoundingClientRect().bottom) + 10) : 12);
  }, [toast?.message, activePage]);

  if (!toast || hidden) return null;

  const [headline, ...rest] = toast.message.split('\n');
  const detail = rest.join(' ').trim();
  // "Added to bag" carries a way to the bag, unless the shopper is already looking at it
  const viewBag = toast.type === 'success' && toast.message.startsWith('Added to bag')
    && !isCartDrawerOpen && activePage !== 'cart' && activePage !== 'checkout';

  return (
    <div
      id="app-toast"
      key={toast.message}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={{ top: offset }}
      className={`aura-toast ${toast.type === 'error' ? 'is-error' : ''}`}
    >
      {toast.type === 'error'
        ? <AlertCircle className="aura-toast-ic" strokeWidth={1.6} aria-hidden="true" />
        : toast.type === 'info'
          ? <Info className="aura-toast-ic" strokeWidth={1.6} aria-hidden="true" />
          : (
            <svg className="aura-toast-ic aura-toast-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
      {/* The padding sits on the wrapper: on the clamped line itself it would let a third line show through */}
      <div className="min-w-0 flex-1 py-1.5">
        <p className={`break-words text-[14px] font-semibold leading-5 ${detail ? 'line-clamp-1' : 'line-clamp-2'}`}>{headline}</p>
        {detail && <p className="truncate text-[13px] font-normal leading-5 text-on-dark-muted">{detail}</p>}
      </div>
      {viewBag && (
        <button type="button" onClick={() => { setIsCartDrawerOpen(true); setHidden(true); }} className="h-11 shrink-0 cursor-pointer whitespace-nowrap px-1.5 text-[14px] font-bold text-highlight underline decoration-1 underline-offset-4">
          View bag
        </button>
      )}
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-dark-muted hover:text-on-dark">
        <X className="h-4 w-4" strokeWidth={1.6} />
      </button>
    </div>
  );
};
