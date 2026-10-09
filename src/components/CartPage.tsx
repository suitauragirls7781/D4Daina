import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { Assurance } from './Assurance';
import { ArrowLeft } from 'lucide-react';
import { SectionTitle } from './SectionTitle';

// Emerald Heritage: the small-capitals link with a thin line
const LINK = 'sag-lnk';

export const CartPage: React.FC = () => {
  const { cart, cartCount, products = [], shippingFee, setActivePage, navigateToCategory } = useShop();
  const total = useBagTotal();
  const inBag = new Set(cart.map((item) => String(item.product.id)));
  const suggestions = products.filter((p) => p.inStock && !inBag.has(String(p.id))).slice(0, 4);

  if (cart.length === 0) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center py-16 sm:py-24">
        <EmptyBag heading="h1" />
      </div>
    );
  }

  const checkout = () => setActivePage('checkout');

  return (
    <div id="cart-page" className="pb-32 lg:pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-7 sm:px-6 sm:pt-10 lg:px-8">
        {/* Desktop keeps the three steps to an order as small capital text: the bag is step 1 */}
        <ol aria-label="Steps to place the order" className="mb-7 hidden items-center justify-center gap-3 text-[10.5px] leading-4 font-semibold uppercase tracking-[0.2em] lg:flex">
          {['Bag', 'Address', 'Pay'].map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 && <li aria-hidden="true" className="h-px w-10 bg-control" />}
              <li aria-current={index === 0 ? 'step' : undefined} className={`sag-num inline-flex items-center gap-2 ${index === 0 ? 'text-brand' : 'text-ink-muted'}`}>
                <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11.5px] tracking-normal ${index === 0 ? 'border-brand bg-brand text-[color:var(--sag-on-gold)]' : 'border-control bg-page'}`}>{index + 1}</span> {step}
              </li>
            </React.Fragment>
          ))}
        </ol>
        {/* The page title, centred, with the real item count under it */}
        <SectionTitle as="h1" title="Your bag" sub={<span className="sag-num">{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>} />
        <div className="mt-1 hidden justify-center sm:flex">
          <button onClick={() => navigateToCategory('All')} className={LINK}>
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Continue shopping
          </button>
        </div>

        {/* Phones and tablets: what the bag saves, as a small quiet notice under the title
            (from desktop width the price details beside the list say it) */}
        <SavingsStrip className="mx-auto mt-5 max-w-[560px] lg:hidden" />

        <div className="mx-auto mt-5 grid max-w-[560px] gap-5 sm:mt-6 lg:max-w-none lg:grid-cols-12 lg:gap-12 items-start">
          {/* The lines, separated by thin lines */}
          <div className="lg:col-span-7">
            <CartLines />
          </div>
          {/* Desktop header = 68px bar + 48px category row + hairlines (118px); the summary sticks 16px below it */}
          <aside className="lg:col-span-5 lg:sticky lg:top-[134px]">
            <div className="space-y-[18px]">
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="sag-btn-primary hidden lg:inline-flex w-full h-[54px]"
              >
                Checkout
              </button>
              <Assurance variant="line" />
            </div>
            <div className="mt-2 flex justify-center sm:hidden">
              <button onClick={() => navigateToCategory('All')} className={LINK}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Continue shopping
              </button>
            </div>
          </aside>
        </div>

        {suggestions.length > 0 && (
          <section className="mt-12 border-t border-line pt-10 sm:mt-16 sm:pt-12">
            <SectionTitle title="You may also like" className="mb-6 sm:mb-8" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-[18px] sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones and tablets: the total and the one emerald "Checkout" stay in reach, on a white bar.
          This is the one fixed bar here (the bottom tab bar is hidden on this page).
          "Free delivery" shows only when the delivery charge is 0. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="lg:hidden fixed inset-x-3 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-[44]">
          <div className="sag-glass-bar max-w-2xl mx-auto flex items-center gap-4 py-2 pl-5 pr-2">
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
