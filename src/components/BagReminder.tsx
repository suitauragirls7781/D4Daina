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
    <aside aria-label="Your bag" className={`aura-card aura-lt flex items-center gap-2.5 py-2 pl-2 pr-1 sm:gap-3 sm:pl-2.5 ${className}`}>
      <img
        src={getCleanImageUrl(photo, 160)}
        alt=""
        width={44}
        height={55}
        loading="lazy"
        decoding="async"
        className="h-[58px] w-[46px] shrink-0 rounded-[14px] bg-sunken object-cover object-top"
      />
      <p className="min-w-0 flex-1 text-[14.5px] leading-5 text-ink">
        <span className="block font-bold">Your bag has {cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
        <span className="aura-num block text-[13px] leading-[18px] text-ink-muted">Total ₹{Math.round(cartTotal).toLocaleString('en-IN')}</span>
      </p>
      <button
        type="button"
        onClick={() => setActivePage('cart')}
        className="aura-btn aura-btn-sm shrink-0 px-5"
      >
        Checkout
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Hide this reminder"
        className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted cursor-pointer hover:text-ink sm:w-11"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
      </button>
    </aside>
  );
};
