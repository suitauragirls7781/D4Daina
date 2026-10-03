import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { Assurance } from './Assurance';
import { ArrowLeft, Lock } from 'lucide-react';

export const CartPage: React.FC = () => {
  const { cart, cartCount, products = [], setActivePage, navigateToCategory } = useShop();
  const total = useBagTotal();
  const inBag = new Set(cart.map((item) => String(item.product.id)));
  const suggestions = products.filter((p) => p.inStock && !inBag.has(String(p.id))).slice(0, 4);

  if (cart.length === 0) {
    return (
      <div className="bg-page min-h-[65vh] flex items-center justify-center py-16 sm:py-24">
        <EmptyBag heading="h1" />
      </div>
    );
  }

  const checkout = () => setActivePage('checkout');

  return (
    <div id="cart-page" className="bg-page pt-5 pb-28 sm:pt-8 md:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[28px] leading-8 text-ink">
            Your bag <span className="font-sans text-sm font-normal tracking-normal text-ink-muted">({cartCount} {cartCount === 1 ? 'item' : 'items'})</span>
          </h1>
          <button onClick={() => navigateToCategory('All')} className="hidden sm:inline-flex sag-link gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Continue shopping
          </button>
        </div>

        <div className="mt-4 sm:mt-6 grid gap-3 lg:grid-cols-12 lg:gap-8 items-start">
          <div className="lg:col-span-7 sag-card px-4">
            <CartLines />
          </div>
          {/* Desktop header = 68px bar + 48px category row + hairlines (118px); the summary sticks 16px below it */}
          <aside className="lg:col-span-5 lg:sticky lg:top-[134px]">
            <div className="sag-card p-4 sm:p-6 space-y-4">
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="sag-btn-primary hidden md:inline-flex w-full gap-2"
              >
                <Lock className="w-[18px] h-[18px]" aria-hidden="true" /> Checkout securely
              </button>
              <Assurance variant="line" />
            </div>
            <button onClick={() => navigateToCategory('All')} className="sm:hidden mt-2 w-full sag-link justify-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Continue shopping
            </button>
          </aside>
        </div>

        {suggestions.length > 0 && (
          <section className="mt-8 sm:mt-12">
            <h2 className="mb-4 font-display text-[22px] leading-7 text-ink">You may also like</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones: the total and the checkout button stay in reach (the bottom tab bar is hidden on this page) */}
      {typeof document !== 'undefined' && createPortal(
        <div className="sag-bar md:hidden fixed inset-x-0 bottom-0 z-[44]">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-lg leading-[22px] font-bold text-ink sag-num">₹{total.toLocaleString('en-IN')}</p>
              <p className="text-[11px] leading-[14px] text-ink-muted">Total, incl. taxes</p>
            </div>
            <button type="button" onClick={checkout} className="sag-btn-primary flex-1 min-w-0 px-3 gap-2">
              <Lock className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> Checkout securely
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
