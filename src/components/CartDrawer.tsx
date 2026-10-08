import React, { useEffect } from 'react';
import { useBackToClose } from '../utils/backClose';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { Assurance } from './Assurance';
import { X } from 'lucide-react';

export const CartDrawer: React.FC = () => {
  const { cart, cartCount, shippingFee, isCartDrawerOpen, setIsCartDrawerOpen, setActivePage, activePage } = useShop();
  const total = useBagTotal();
  const close = () => setIsCartDrawerOpen(false);

  useBackToClose(isCartDrawerOpen, () => setIsCartDrawerOpen(false));

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
      className={`fixed inset-0 z-[9999] transition-opacity duration-200 ${isCartDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!isCartDrawerOpen}
    >
      <div className="absolute inset-0 bg-[color:var(--sag-scrim)]" onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`absolute right-0 top-0 h-full w-full sm:max-w-md bg-surface sm:rounded-l-[26px] sm:border-l sm:border-[color:var(--sag-edge)] flex flex-col transition-transform duration-[240ms] ${isCartDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 pl-4 pr-1.5 h-14 border-b border-line shrink-0">
          <h2 className="font-display text-[19px] leading-6 text-ink">
            Your bag{cartCount > 0 && <span className="font-sans text-[13px] font-normal tracking-normal text-ink-muted sag-num"> · {cartCount} {cartCount === 1 ? 'item' : 'items'}</span>}
          </h2>
          <button onClick={close} aria-label="Close bag" className="w-10 h-10 mr-1.5 flex items-center justify-center rounded-full border border-[color:var(--sag-edge)] bg-[color:var(--sag-glass)] text-ink hover:bg-[color:var(--sag-glass-strong)] transition-colors cursor-pointer">
            <X className="w-[22px] h-[22px]" strokeWidth={1.5} />
          </button>
        </header>

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <EmptyBag onDone={close} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-5">
              {/* What the bag saves, as a small glass pill; then the lines, one glass card each */}
              <SavingsStrip className="mb-3.5" />
              <CartLines onNavigate={close} />
              <div className="mt-5 space-y-[18px]">
                {/* On the bag page the page's own coupon field owns id="bag-coupon" */}
                <CartTotals idPrefix={activePage === 'cart' ? 'drawer' : 'bag'} />
                <Assurance variant="line" />
              </div>
              <button onClick={() => { close(); setActivePage('cart'); }} className="mt-3 w-full sag-link justify-center text-[12.5px] font-semibold decoration-1 underline-offset-4">
                View full bag
              </button>
            </div>
            <footer className="shrink-0 px-3 pt-1 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              <div className="sag-glass-bar flex items-center gap-4 py-2 pl-5 pr-2">
                <div className="shrink-0 min-w-0">
                  <p className="text-[11.5px] leading-4 text-ink-muted">Total{shippingFee === 0 && <> · <span className="text-sale">Free delivery</span></>}</p>
                  <p className="text-[17px] leading-6 font-semibold text-ink sag-num">₹{total.toLocaleString('en-IN')}</p>
                </div>
                <button
                  id="drawer-checkout-btn"
                  onClick={() => { close(); setActivePage('checkout'); }}
                  className="sag-btn-primary flex-1 min-w-0 px-4"
                >
                  Checkout
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
