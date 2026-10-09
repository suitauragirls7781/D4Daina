import React, { useEffect } from 'react';
import { useBackToClose } from '../utils/backClose';
import { useShop } from '../context/ShopContext';
import { BagFacts, CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { Icon, Odometer } from '../aura';

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
      data-aura
      className={`fixed inset-0 z-[9999] transition-opacity duration-300 ${isCartDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!isCartDrawerOpen}
    >
      <div className="absolute inset-0 bg-[color:var(--sag-scrim)]" onClick={close} />
      {/* A white sheet with 28px corners: it rises to just under the top edge on phones, and floats at the right on wider screens */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`abag-sheet absolute bottom-0 right-0 top-3 w-full overflow-hidden rounded-t-[28px] flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:bottom-3 sm:right-3 sm:max-w-md sm:rounded-[28px] ${isCartDrawerOpen ? 'translate-x-0' : 'translate-x-[calc(100%+12px)]'}`}
      >
        <header className="flex items-center justify-between gap-3 pl-5 pr-3 pt-4 pb-3 shrink-0">
          <h2 className="aco-sheet-h">
            Your bag{cartCount > 0 && <span className="text-[14px] font-normal tracking-normal text-ink-muted aura-num"> · {cartCount} {cartCount === 1 ? 'item' : 'items'}</span>}
          </h2>
          <button onClick={close} aria-label="Close bag" className="aco-x">
            <Icon name="close" size={20} />
          </button>
        </header>

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <EmptyBag onDone={close} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-5">
              {/* What the bag saves, as a small blush notice; then the lines as cards */}
              <SavingsStrip className="mb-2.5" />
              <CartLines onNavigate={close} />
              <div className="mt-5 space-y-5">
                {/* On the bag page the page's own coupon field owns id="bag-coupon" */}
                <CartTotals idPrefix={activePage === 'cart' ? 'drawer' : 'bag'} />
                <BagFacts />
              </div>
              <div className="mt-3 flex justify-center">
                <button onClick={() => { close(); setActivePage('cart'); }} className="aura-lk">
                  View full bag
                </button>
              </div>
            </div>
            <footer className="shrink-0 border-t border-line px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-4 pl-2">
                <div className="shrink-0 min-w-0">
                  <p className="text-[13px] leading-4 text-ink-muted">Total{shippingFee === 0 && <> · <span className="text-sale">Free delivery</span></>}</p>
                  <p className="text-[18px] leading-6 font-extrabold text-ink aura-num"><Odometer value={`₹${total.toLocaleString('en-IN')}`} roll={false} /></p>
                </div>
                <button
                  id="drawer-checkout-btn"
                  onClick={() => { close(); setActivePage('checkout'); }}
                  className="aura-btn flex-1 min-w-0"
                >
                  Checkout <Icon name="arrow" size={19} />
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
