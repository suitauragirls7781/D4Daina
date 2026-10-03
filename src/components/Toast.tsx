import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * One notice at a time, anchored at the top just under the header, so it never covers a buy, checkout or
 * pay bar or the bottom navigation. White card with a coloured rule on the left: green for done, red for
 * an error (always with an icon and words), ink for plain information.
 */
export const Toast: React.FC = () => {
  const { toast, activePage, isCartDrawerOpen, setIsCartDrawerOpen } = useShop();
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(false); }, [toast?.message]);

  // Sit 8px under the header wherever it is right now (the announcement line above it may have scrolled away)
  const [top, setTop] = useState(12);
  useLayoutEffect(() => {
    if (!toast) return;
    // The first sticky header that is actually on screen (checkout hides the site header and shows its own)
    const header = Array.from(document.querySelectorAll('header.sticky')).find((el) => el.getBoundingClientRect().height > 0);
    setTop(header ? Math.max(12, Math.round(header.getBoundingClientRect().bottom) + 8) : 12);
  }, [toast?.message]);

  if (!toast || hidden) return null;

  const tone = toast.type === 'error'
    ? { Icon: AlertCircle, icon: 'text-danger', bar: 'bg-danger' }
    : toast.type === 'info'
      ? { Icon: Info, icon: 'text-ink', bar: 'bg-ink' }
      : { Icon: CheckCircle2, icon: 'text-ok', bar: 'bg-ok' };
  const { Icon } = tone;
  // "Added to bag" carries a way to the bag, unless the shopper is already looking at it
  const viewBag = toast.type === 'success' && toast.message.startsWith('Added to bag')
    && !isCartDrawerOpen && activePage !== 'cart' && activePage !== 'checkout';

  return (
    <div
      id="app-toast"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={{ top }}
      className="fixed left-1/2 -translate-x-1/2 z-[10000] w-[calc(100%-24px)] sm:w-auto sm:min-w-[340px] max-w-md rounded-control bg-white text-ink border border-line pl-4 pr-1 py-1 shadow-[var(--sag-shadow-pop)] flex items-center gap-2.5 overflow-hidden animate-in fade-in slide-in-from-top-2"
    >
      <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-1 ${tone.bar}`} />
      <Icon className={`w-[18px] h-[18px] shrink-0 ${tone.icon}`} aria-hidden="true" />
      {/* The padding sits on the wrapper: on the clamped line itself it would let a third line show through */}
      <div className="flex-1 min-w-0 py-2">
        <p className="text-sm leading-5 text-ink line-clamp-2 break-words">{toast.message}</p>
      </div>
      {viewBag && (
        <button type="button" onClick={() => { setIsCartDrawerOpen(true); setHidden(true); }} className="shrink-0 h-11 px-2 text-sm leading-5 font-semibold text-brand underline underline-offset-[3px] whitespace-nowrap cursor-pointer">
          View bag
        </button>
      )}
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
