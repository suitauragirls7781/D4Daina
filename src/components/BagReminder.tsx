import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';

// "Your bag is waiting": one slim row in the page flow (not fixed) for a shopper who already has
// something in the bag. It shows the real number of items and the bag's real total, nothing else.
// The close button hides it until the browser is closed.

const HIDE_KEY = 'sag_bag_reminder_hidden';

const readHidden = () => {
  try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
};

export const BagReminder: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { cart, cartCount, cartTotal, setActivePage } = useShop();
  const [hidden, setHidden] = useState(readHidden);

  const first = cart[0];
  if (hidden || !first || cartCount < 1) return null;

  const images = Array.isArray(first.product?.images) ? first.product.images.filter((img) => typeof img === 'string' && img.trim()) : [];
  const photo = images[0] || first.product?.image;

  const close = () => {
    setHidden(true);
    try { sessionStorage.setItem(HIDE_KEY, '1'); } catch {}
  };

  return (
    <aside aria-label="Your bag" className={`sag-glass sag-glass-strong flex items-center gap-2.5 p-2 sm:gap-3 sm:p-2.5 ${className}`}>
      <img
        src={getCleanImageUrl(photo, 160)}
        alt=""
        width={44}
        height={55}
        loading="lazy"
        decoding="async"
        className="h-[55px] w-11 shrink-0 rounded-lg bg-sunken object-cover object-top"
      />
      <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-ink">
        <span className="block font-medium">Your bag has {cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
        <span className="sag-num block text-[12.5px] leading-[18px] text-ink-muted">Total ₹{Math.round(cartTotal).toLocaleString('en-IN')}</span>
      </p>
      <button
        type="button"
        onClick={() => setActivePage('cart')}
        className="sag-btn-primary h-11 shrink-0 px-4 sm:px-5"
      >
        Checkout
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Hide this reminder"
        className="flex h-11 w-9 shrink-0 items-center justify-center text-ink-muted cursor-pointer hover:text-ink sm:w-11"
      >
        <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </aside>
  );
};
