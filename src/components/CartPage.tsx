import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { Assurance } from './Assurance';
import { ArrowLeft } from 'lucide-react';

// Noir & Champagne: a small text link with a thin underline
const LINK = 'sag-link text-[12.5px] decoration-1 underline-offset-4';

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
      <div className="max-w-6xl mx-auto px-4 pt-[22px] sm:px-6 sm:pt-8 lg:px-8">
        {/* Desktop keeps the three steps to an order as small capital text: the bag is step 1 */}
        <ol aria-label="Steps to place the order" className="mb-6 hidden items-center gap-2.5 text-[11.5px] leading-4 uppercase tracking-[0.1em] lg:flex">
          {['Bag', 'Address', 'Pay'].map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 && <li aria-hidden="true" className="h-px w-[26px] bg-line" />}
              <li aria-current={index === 0 ? 'step' : undefined} className={`sag-num ${index === 0 ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                {index + 1} {step}
              </li>
            </React.Fragment>
          ))}
        </ol>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[23px] leading-7 text-ink">Your bag</h1>
            <p className="mt-1 text-[13px] leading-[18px] text-ink-muted sag-num">{cartCount} {cartCount === 1 ? 'item' : 'items'}</p>
          </div>
          <button onClick={() => navigateToCategory('All')} className={`hidden sm:inline-flex gap-1.5 ${LINK}`}>
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Continue shopping
          </button>
        </div>

        {/* Phones and tablets: what the bag saves, as a small quiet notice under the title
            (from desktop width the price details beside the list say it) */}
        <SavingsStrip className="mt-4 lg:hidden" />

        <div className="mt-[18px] sm:mt-6 grid gap-5 lg:grid-cols-12 lg:gap-12 items-start">
          {/* The lines: one plain list separated by hairlines */}
          <div className="lg:col-span-7 lg:border-t lg:border-line lg:pt-[18px]">
            <CartLines />
          </div>
          {/* Desktop header = 68px bar + 48px category row + hairlines (118px); the summary sticks 16px below it */}
          <aside className="lg:col-span-5 lg:sticky lg:top-[134px]">
            <div className="space-y-[18px] lg:border lg:border-line lg:bg-surface lg:p-6">
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="sag-btn-primary hidden lg:inline-flex w-full"
              >
                Checkout
              </button>
              <Assurance variant="line" />
            </div>
            <button onClick={() => navigateToCategory('All')} className={`sm:hidden mt-2 w-full justify-center gap-1.5 ${LINK}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Continue shopping
            </button>
          </aside>
        </div>

        {suggestions.length > 0 && (
          <section className="mt-10 border-t border-line pt-8 sm:mt-14 sm:pt-10">
            <h2 className="mb-4 font-display text-[19px] leading-6 text-ink">You may also like</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-[18px] sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones and tablets: the total and the one black "Checkout" stay in reach, on a white bar with a top
          hairline. This is the one fixed bar here (the bottom tab bar is hidden on this page).
          "Free delivery" shows only when the delivery charge is 0. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="sag-bar shadow-none lg:hidden fixed inset-x-0 bottom-0 z-[44]">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <div className="shrink-0 min-w-0">
              <p className="text-[11.5px] leading-4 text-ink-muted">Total{shippingFee === 0 && <> · <span className="text-sale">Free delivery</span></>}</p>
              <p className="text-[17px] leading-6 font-semibold text-ink sag-num">₹{total.toLocaleString('en-IN')}</p>
            </div>
            <button type="button" onClick={checkout} className="sag-btn-primary flex-1 min-w-0 px-4">
              Checkout
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
