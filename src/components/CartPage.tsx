import React from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { CartLines, CartTotals, EmptyBag, useBagTotal } from './CartContents';
import { ProductCard } from './ProductCard';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { LockIcon } from './StoreIcons';

export const CartPage: React.FC = () => {
  const { cart, cartCount, products = [], setActivePage, navigateToCategory } = useShop();
  const total = useBagTotal();
  const inBag = new Set(cart.map((item) => String(item.product.id)));
  const suggestions = products.filter((p) => p.inStock && !inBag.has(String(p.id))).slice(0, 4);

  if (cart.length === 0) {
    return (
      <div className="bg-[#FBF7F3] min-h-[65vh] flex items-center justify-center py-16 sm:py-24">
        <EmptyBag heading="h1" />
      </div>
    );
  }

  const checkout = () => setActivePage('checkout');

  return (
    <div id="cart-page" className="bg-[#FBF7F3] pt-6 pb-40 sm:pt-10 md:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-1.5 text-xs text-[#2A1A26]/60 mb-4" aria-label="Breadcrumb">
          <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-[#9C7A45]" aria-hidden="true" />
          <span className="font-semibold text-[#4B1D3F]" aria-current="page">Shopping bag</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="sag-eyebrow">Review your picks</p>
            <h1 className="mt-1.5 font-serif text-4xl sm:text-5xl leading-none text-[#4B1D3F]">
              Your bag <span className="align-middle font-sans text-sm font-semibold text-[#2A1A26]/60">({cartCount} {cartCount === 1 ? 'item' : 'items'})</span>
            </h1>
          </div>
          <button onClick={() => navigateToCategory('All')} className="hidden sm:inline-flex items-center gap-1.5 h-10 px-1 text-sm font-semibold text-[#4B1D3F] hover:underline underline-offset-4 cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Continue shopping
          </button>
        </div>

        <div className="mt-6 sm:mt-8 grid gap-5 lg:grid-cols-12 lg:gap-8 items-start">
          <div className="lg:col-span-7 sag-card rounded-3xl px-4 sm:px-6">
            <CartLines />
          </div>
          <aside className="lg:col-span-5 lg:sticky lg:top-36">
            <div className="sag-card rounded-3xl p-5 sm:p-7 space-y-5">
              <h2 className="font-serif text-2xl sm:text-[28px] leading-tight text-[#2A1A26]">Order summary</h2>
              <CartTotals />
              <button
                id="cart-checkout-btn"
                onClick={checkout}
                className="sag-btn-primary w-full h-[52px] text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <LockIcon className="w-4 h-4" mono live={false} /> Checkout securely
              </button>
              <p className="flex items-center justify-center gap-2 text-center text-xs text-[#2A1A26]/65">
                <LockIcon className="w-4 h-4" live={false} /> Secure online payment · UPI, cards &amp; net banking
              </p>
            </div>
            <button onClick={() => navigateToCategory('All')} className="sm:hidden mt-4 w-full h-11 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-[#4B1D3F] cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Continue shopping
            </button>
          </aside>
        </div>

        {suggestions.length > 0 && (
          <section className="mt-14 sm:mt-20">
            <p className="sag-eyebrow">Complete the look</p>
            <h2 className="mt-2 mb-6 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">You may also like</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {suggestions.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Phones: the total and checkout stay in reach, just above the bottom tab bar */}
      {typeof document !== 'undefined' && createPortal(
        <div className="md:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[44] border-t border-[#4B1D3F]/10 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-[0_-10px_24px_-20px_rgba(42,26,38,0.5)]">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#2A1A26]/60">Total</p>
              <p className="font-serif text-2xl leading-none font-semibold text-[#4B1D3F] tabular-nums lining-nums">₹{total.toLocaleString('en-IN')}</p>
            </div>
            <button
              type="button"
              onClick={checkout}
              className="sag-btn-primary flex-1 h-12 px-4 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <LockIcon className="w-4 h-4" mono live={false} /> Checkout
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
