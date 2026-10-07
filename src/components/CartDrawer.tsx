import React, { useEffect } from 'react';
import { useBackToClose } from '../utils/backClose';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { Assurance } from './Assurance';
import { ChevronRight, X } from 'lucide-react';

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
      <div className="absolute inset-0 bg-ink/50" onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`absolute right-0 top-0 h-full w-full sm:max-w-md bg-page flex flex-col transition-transform duration-[240ms] ${isCartDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 pl-4 pr-1.5 h-14 border-b border-line bg-white shrink-0">
          <h2 className="font-display text-[22px] leading-7 text-ink">
            Your bag{cartCount > 0 && <span className="font-sans text-sm font-normal tracking-normal text-ink-muted"> ({cartCount} {cartCount === 1 ? 'item' : 'items'})</span>}
          </h2>
          <button onClick={close} aria-label="Close bag" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer">
            <X className="w-[22px] h-[22px]" />
          </button>
        </header>

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <EmptyBag onDone={close} />
          </div>
        ) : (
          <>
            {/* What the bag saves, on a pale gold strip; each line is its own white card (owner's pick 2, 2026-10-07) */}
            <SavingsStrip className="shrink-0" />
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
              <CartLines onNavigate={close} layout="cards" />
              <div className="sag-card p-4 space-y-4">
                {/* On the bag page the page's own coupon field owns id="bag-coupon" */}
                <CartTotals idPrefix={activePage === 'cart' ? 'drawer' : 'bag'} />
                <Assurance variant="line" />
              </div>
              <button onClick={() => { close(); setActivePage('cart'); }} className="w-full sag-link justify-center">
                View full bag
              </button>
            </div>
            <footer className="sag-bar shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-4 text-ink-muted">Total{shippingFee === 0 && <> · <span className="font-semibold text-sale">Free delivery</span></>}</p>
                  <p className="text-[19px] leading-6 font-extrabold text-ink sag-num">₹{total.toLocaleString('en-IN')}</p>
                </div>
                <button
                  id="drawer-checkout-btn"
                  onClick={() => { close(); setActivePage('checkout'); }}
                  className="sag-btn-primary sag-btn-buy shrink-0 px-6 gap-1.5"
                >
                  Checkout <ChevronRight className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
