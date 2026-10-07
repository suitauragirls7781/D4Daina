import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { Assurance } from './Assurance';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export const CartPage: React.FC = () => {
  const { cart, cartCount, products = [], shippingFee, setActivePage, navigateToCategory } = useShop();
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
    <div id="cart-page" className="bg-page pb-28 lg:pb-16">
      {/* Phones and tablets (owner's pick 2, 2026-10-07): what the bag saves, on a pale gold strip at the very top */}
      <SavingsStrip className="lg:hidden" />
      <div className="max-w-6xl mx-auto px-4 pt-3 sm:px-6 sm:pt-8 lg:px-8">
        {/* Desktop keeps the three steps to an order: the bag is step 1 */}
        <ol aria-label="Steps to place the order" className="mb-4 hidden items-center gap-1.5 text-xs font-bold lg:flex lg:max-w-md">
          {['Bag', 'Address', 'Pay'].map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 && <li aria-hidden="true" className="h-0.5 flex-1 bg-line" />}
              <li aria-current={index === 0 ? 'step' : undefined} className={`flex items-center gap-1.5 ${index === 0 ? 'text-ink' : 'text-ink-muted'}`}>
                <span className={`sag-num flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] ${index === 0 ? 'bg-brand text-white' : 'bg-line text-ink-muted'}`}>{index + 1}</span>
                {step}
              </li>
            </React.Fragment>
          ))}
        </ol>
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[24px] leading-8 text-ink">
            Your bag <span className="font-sans text-sm font-normal tracking-normal text-ink-muted">({cartCount} {cartCount === 1 ? 'item' : 'items'})</span>
          </h1>
          <button onClick={() => navigateToCategory('All')} className="hidden sm:inline-flex sag-link gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Continue shopping
          </button>
        </div>

        <div className="mt-4 sm:mt-6 grid gap-3 lg:grid-cols-12 lg:gap-8 items-start">
          {/* Each line is its own white card; from desktop width they are one divided card */}
          <div className="lg:col-span-7 lg:rounded-card lg:bg-surface lg:px-4 lg:shadow-[var(--sag-shadow)]">
            <CartLines />
          </div>
          {/* Desktop header = 68px bar + 48px category row + hairlines (118px); the summary sticks 16px below it */}
          <aside className="lg:col-span-5 lg:sticky lg:top-[134px]">
            <div className="sag-card p-4 sm:p-6 space-y-4">
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="sag-btn-primary hidden lg:inline-flex w-full gap-2"
              >
                Continue to address <ChevronRight className="w-[18px] h-[18px]" aria-hidden="true" />
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones and tablets: the total and a gold "Checkout" pill stay in reach. This is the one fixed bar here
          (the bottom tab bar is hidden on this page). "Free delivery" shows only when the delivery charge is 0. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="sag-bar lg:hidden fixed inset-x-0 bottom-0 z-[44]">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-4 text-ink-muted">Total{shippingFee === 0 && <> · <span className="font-semibold text-sale">Free delivery</span></>}</p>
              <p className="text-[19px] leading-6 font-extrabold text-ink sag-num">₹{total.toLocaleString('en-IN')}</p>
            </div>
            <button type="button" onClick={checkout} className="sag-btn-primary sag-btn-buy shrink-0 px-6 gap-1.5">
              Checkout <ChevronRight className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
