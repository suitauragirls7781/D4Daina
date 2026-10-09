import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { BagFacts, CartLines, CartTotals, EmptyBag, SavingsStrip, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { ArrowLeft } from 'lucide-react';
import { SectionTitle } from './SectionTitle';
import { AuraTitle, Icon, Odometer } from '../aura';

// Aura: the bold link whose underline draws in
const LINK = 'aura-lk';

export const CartPage: React.FC = () => {
  const { cart, cartCount, products = [], shippingFee, setActivePage, navigateToCategory } = useShop();
  const total = useBagTotal();
  const inBag = new Set(cart.map((item) => String(item.product.id)));
  const suggestions = products.filter((p) => p.inStock && !inBag.has(String(p.id))).slice(0, 4);

  if (cart.length === 0) {
    return (
      <div data-aura className="min-h-[65vh] flex items-center justify-center py-16 sm:py-24">
        <EmptyBag heading="h1" />
      </div>
    );
  }

  const checkout = () => setActivePage('checkout');

  return (
    <div id="cart-page" data-aura className="pb-32 lg:pb-16">
      <div className="max-w-[1120px] mx-auto px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
        {/* The band: a sand block with the label, the big heading and the real count of items */}
        <div className="abag-band">
          {/* Desktop keeps the three steps to an order as small pills: the bag is step 1 */}
          <ol aria-label="Steps to place the order" className="mb-7 hidden items-center gap-2 text-[13px] leading-none font-bold lg:flex">
            {['Bag', 'Address', 'Pay'].map((step, index) => (
              <React.Fragment key={step}>
                {index > 0 && <li aria-hidden="true" className="h-px w-8 bg-control" />}
                <li aria-current={index === 0 ? 'step' : undefined} className={`aura-num inline-flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3.5 ${index === 0 ? 'bg-ink text-on-dark' : 'text-ink-muted ring-1 ring-inset ring-control'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${index === 0 ? 'bg-page text-ink' : 'bg-surface'}`}>{index + 1}</span> {step}
                </li>
              </React.Fragment>
            ))}
          </ol>
          <AuraTitle as="h1" label="Shopping bag" title="Your" accent="bag" sub={<span className="aura-num">{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>} />
          <div className="mt-3 hidden sm:flex">
            <button onClick={() => navigateToCategory('All')} className={LINK}>
              <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.6} /> Continue shopping
            </button>
          </div>
        </div>

        <div className="mx-auto mt-5 grid max-w-[720px] gap-5 px-1 lg:max-w-none lg:grid-cols-12 lg:gap-10 items-start">
          {/* The lines: white cards. On a touch screen a line can also be swiped to the left to remove it. */}
          <div className="lg:col-span-7">
            {/* Phones and tablets: what the bag saves, as a small blush notice above the lines
                (from desktop width the price details beside the list say it) */}
            <SavingsStrip className="mb-2.5 lg:hidden" />
            <CartLines />
            <p className="abag-hint">Swipe an item left to remove it</p>
          </div>
          {/* The summary sticks under the site header on desktop */}
          <aside className="lg:col-span-5 lg:sticky lg:top-[134px]">
            <div className="space-y-5">
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="aura-btn aura-btn-w hidden! lg:flex!"
              >
                <Icon name="lock" size={19} /> Checkout
              </button>
              <BagFacts />
            </div>
            <div className="mt-3 flex justify-center sm:hidden">
              <button onClick={() => navigateToCategory('All')} className={LINK}>
                <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.6} /> Continue shopping
              </button>
            </div>
          </aside>
        </div>

        {suggestions.length > 0 && (
          <section className="mt-14 px-1 sm:mt-20">
            <SectionTitle title="You may also like" className="mb-6 sm:mb-8" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-[18px] sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones and tablets: the total and the one "Checkout" stay in reach, on an ink pill bar.
          This is the one fixed bar here (the bottom tab bar is hidden on this page).
          "Free delivery" shows only when the delivery charge is 0. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="lg:hidden fixed inset-x-3 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-[44]">
          <div className="abag-bar max-w-2xl mx-auto">
            <div className="shrink-0 min-w-0">
              <p className="text-[13px] leading-4 aura-mu">Total{shippingFee === 0 && <> · <span className="aura-sa">Free delivery</span></>}</p>
              <p className="text-[18px] leading-6 font-extrabold aura-num"><Odometer value={`₹${total.toLocaleString('en-IN')}`} roll={false} /></p>
            </div>
            <button type="button" onClick={checkout} className="aura-btn flex-1 min-w-0">
              Checkout <Icon name="arrow" size={19} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
