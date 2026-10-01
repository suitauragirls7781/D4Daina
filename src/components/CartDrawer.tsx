import React, { useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, useBagTotal } from './CartContents';
import { ArrowRight, X } from 'lucide-react';
import { LockIcon } from './StoreIcons';

export const CartDrawer: React.FC = () => {
  const { cart, cartCount, isCartDrawerOpen, setIsCartDrawerOpen, setActivePage } = useShop();
  const total = useBagTotal();
  const close = () => setIsCartDrawerOpen(false);

  useEffect(() => {
    if (!isCartDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [isCartDrawerOpen]);

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-300 ${isCartDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!isCartDrawerOpen}
    >
      <div className="absolute inset-0 bg-[#2A1A26]/40" onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`absolute right-0 top-0 h-full w-full sm:max-w-md bg-[#FBF7F3] shadow-2xl flex flex-col transition-transform duration-300 ${isCartDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 px-5 h-16 border-b border-[#4B1D3F]/10 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="font-serif text-[26px] leading-none text-[#4B1D3F]">Your bag</h2>
            {cartCount > 0 && (
              <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#F3EEF8] text-xs font-semibold text-[#4B1D3F]">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button onClick={close} aria-label="Close bag" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-[#F3EEF8] transition-colors cursor-pointer">
            <X className="w-5 h-5 text-[#4B1D3F]" />
          </button>
        </header>

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <EmptyBag onDone={close} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5">
              <CartLines onNavigate={close} />
              <div className="pt-5 pb-6 border-t border-[#4B1D3F]/10">
                <CartTotals />
              </div>
            </div>
            <footer className="shrink-0 border-t border-[#4B1D3F]/10 bg-white px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-20px_rgba(42,26,38,0.5)]">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <span className="text-sm text-[#2A1A26]/75">Total <span className="text-xs text-[#2A1A26]/55">(incl. taxes)</span></span>
                <span className="font-serif text-2xl leading-none font-semibold text-[#4B1D3F] tabular-nums lining-nums">₹{total.toLocaleString('en-IN')}</span>
              </div>
              <button
                id="drawer-checkout-btn"
                onClick={() => { close(); setActivePage('checkout'); }}
                className="sag-btn-primary w-full h-12 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <LockIcon className="w-4 h-4" mono live={false} /> Checkout securely
              </button>
              <button onClick={() => { close(); setActivePage('cart'); }} className="mt-1 w-full h-10 text-xs font-semibold uppercase tracking-[0.14em] text-[#4B1D3F] inline-flex items-center justify-center gap-1.5 hover:underline underline-offset-4 cursor-pointer">
                View full bag <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
