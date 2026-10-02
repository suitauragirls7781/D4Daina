import React, { useEffect, useId, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { prepaidDiscountFor, prepaidPercentApplies } from '../utils/prepaid';
import { Product } from '../types';
import { BadgePercent, CircleAlert, CircleCheck, Loader2, MapPin, RotateCw, ShieldCheck, Truck } from 'lucide-react';
import { fromCatalogOrLive } from '../lib/catalog';
import { useAdmin } from '../context/AdminContext';
import { deliveryEstimateText } from '../utils/delivery';

const PIN_KEY = 'sag_user_pincode';
const PIN_RE = /^[1-9]\d{5}$/;
const LOOKUP_TIMEOUT_MS = 8000;

type Place = { district: string; state: string };
type Status = 'idle' | 'loading' | 'ok' | 'invalid' | 'not-found' | 'error';

// PIN codes are looked up in the India Post directory (the same service the checkout uses),
// once per PIN code per visit. A failed lookup is forgotten so Retry asks again.
const lookups = new Map<string, Promise<Place | null>>();
const lookupPincode = (pin: string): Promise<Place | null> => {
  const cached = lookups.get(pin);
  if (cached) return cached;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const request = fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      return res.json();
    })
    .then((data): Place | null => {
      const office = data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : null;
      if (!office) return null;
      return { district: String(office.District || office.Name || '').trim(), state: String(office.State || '').trim() };
    })
    .finally(() => window.clearTimeout(timer));
  lookups.set(pin, request);
  request.catch(() => lookups.delete(pin));
  return request;
};

const readSavedPin = () => {
  try {
    const saved = localStorage.getItem(PIN_KEY) || '';
    return PIN_RE.test(saved) ? saved : '';
  } catch {
    return '';
  }
};

const inr = (value: number) => `₹${value.toLocaleString('en-IN')}`;

interface DeliveryCheckProps {
  product: Product;
  /** Pieces chosen on the product page; the shipping and prepaid preview use it. */
  quantity?: number;
  /** Extra classes for the outer card (e.g. spacing). */
  className?: string;
}

/**
 * PIN code check for the product page. It only says what is actually known: that the PIN code
 * exists (and where), the store's shipping rule for this item and the prepaid offer. A delivery date
 * is shown only when the owner has set delivery days (Admin → Settings → Checkout), labelled
 * "Estimated delivery". Every amount is a preview; the server recalculates the order before payment.
 */
export const DeliveryCheck: React.FC<DeliveryCheckProps> = ({ product, quantity = 1, className = '' }) => {
  const { storeOffers, cart = [], cartSubtotal = 0, setActivePage } = useShop();
  const { storeSettings } = useAdmin();
  const estimateText = deliveryEstimateText(storeSettings);
  const inputId = useId();
  const resultId = useId();
  const [pincode, setPincode] = useState(readSavedPin);
  const [status, setStatus] = useState<Status>('idle');
  const [place, setPlace] = useState<Place | null>(null);
  // The PIN code whose answer is still wanted (typing a new one discards an older answer)
  const pending = useRef('');

  // Shipping amounts are shown only once the store's shipping settings have actually loaded,
  // so a slow or failed read can never show "Free shipping" by mistake.
  const [offersReady, setOffersReady] = useState(false);
  useEffect(() => fromCatalogOrLive(
    () => setOffersReady(true),
    () => onSnapshot(doc(db, 'storefront_settings', 'storeSettings'), () => setOffersReady(true), () => setOffersReady(false)),
  ), []);

  /** `quiet`: an automatic re-check of a saved PIN code; if it fails, the form simply waits for the shopper. */
  const check = async (pin: string, quiet = false) => {
    if (!PIN_RE.test(pin)) {
      pending.current = '';
      setPlace(null);
      setStatus('invalid');
      return;
    }
    pending.current = pin;
    setStatus('loading');
    try {
      const found = await lookupPincode(pin);
      if (pending.current !== pin) return;
      setPlace(found);
      setStatus(found ? 'ok' : quiet ? 'idle' : 'not-found');
      if (found) {
        try { localStorage.setItem(PIN_KEY, pin); } catch {}
      }
    } catch {
      if (pending.current !== pin) return;
      setPlace(null);
      setStatus(quiet ? 'idle' : 'error');
    }
  };

  // A PIN code checked on an earlier visit is checked again straight away.
  useEffect(() => {
    if (pincode) check(pincode, true);
    return () => { pending.current = ''; };
  }, []);

  const onChange = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setPincode(next);
    if (next.length === 6) {
      check(next);
    } else if (status !== 'idle') {
      pending.current = '';
      setPlace(null);
      setStatus('idle');
    }
  };

  // Same rules as the server (api/_lib/orders.js): free at or above the threshold, else the flat charge.
  const price = Math.max(0, Number(product.price) || 0);
  const pieces = Math.max(1, Math.floor(Number(quantity) || 1));
  const itemTotal = price * pieces;
  const { shippingCharge, freeShippingThreshold, prepaidDiscount } = storeOffers;
  const percentHere = prepaidPercentApplies(storeOffers, price);
  const freeAlone = shippingCharge === 0 || (freeShippingThreshold > 0 && itemTotal >= freeShippingThreshold);
  // Only when this style is not in the bag yet, so the bag total plus this item is exactly the next order.
  const inBag = cart.some((item) => String(item.product.id) === String(product.id));
  const freeWithBag = !freeAlone && !inBag && cartSubtotal > 0 && freeShippingThreshold > 0 && cartSubtotal + itemTotal >= freeShippingThreshold;
  // This item on its own: the flat amount per order, plus the percent when its price is above the owner's minimum.
  const prepaidOff = prepaidDiscountFor(storeOffers, [{ price, quantity: pieces }], itemTotal);
  const prepaidLine = () => {
    if (!percentHere) return `${inr(prepaidOff)} off on every prepaid order, applied at checkout.`;
    if (prepaidDiscount > 0) return `${storeOffers.prepaidPercent}% off this item and ${inr(prepaidDiscount)} off the order with online payment, applied at checkout.`;
    return `${storeOffers.prepaidPercent}% off (${inr(prepaidOff)}) with online payment, applied at checkout.`;
  };
  const placeName = place ? [place.district, place.state].filter(Boolean).join(', ') : '';

  const shippingLine = () => {
    if (!offersReady) return 'Shipping charges, if any, are shown at checkout before you pay.';
    if (freeAlone) return shippingCharge === 0 ? 'Free shipping' : `Free shipping (orders above ${inr(freeShippingThreshold)} ship free)`;
    if (freeWithBag) return `Free shipping with the items already in your bag (orders above ${inr(freeShippingThreshold)})`;
    if (freeShippingThreshold <= 0) return `Shipping ${inr(shippingCharge)} per order`;
    return `Shipping ${inr(shippingCharge)} for this item on its own · free on orders above ${inr(freeShippingThreshold)}`;
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); check(pincode); }}
      className={`rounded-2xl border border-[#4B1D3F]/10 bg-white p-4 ${className}`}
      aria-busy={status === 'loading'}
      noValidate
    >
      <label htmlFor={inputId} className="text-sm text-[#2A1A26] flex items-center gap-2">
        <MapPin className="w-4 h-4 text-[#9C7A45]" aria-hidden="true" /> Check delivery
      </label>
      <div className="mt-2.5 flex gap-2">
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={pincode}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter PIN code"
          aria-describedby={status === 'idle' ? undefined : resultId}
          aria-invalid={status === 'invalid' || status === 'not-found'}
          className="flex-1 min-w-0 h-11 rounded-full border border-[#4B1D3F]/15 px-4 text-sm focus:outline-none focus:border-[#4B1D3F]/50"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="h-11 min-w-[84px] px-5 rounded-full bg-[#F3EEF8] text-[#4B1D3F] text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center hover:bg-[#E6DDF0] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
        >
          {status === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /><span className="sr-only">Checking</span></> : 'Check'}
        </button>
      </div>
      {estimateText && (
        <p className="mt-2.5 flex items-start gap-2 text-sm text-[#2A1A26]/80">
          <Truck className="w-4 h-4 mt-0.5 shrink-0 text-[#4B1D3F]" aria-hidden="true" />
          <span>{estimateText} <span className="text-[#2A1A26]/60">(if ordered today)</span></span>
        </p>
      )}

      <div id={resultId} aria-live="polite">
        {status === 'invalid' && <p className="sag-fade mt-2.5 text-sm text-rose-700">Enter a valid 6-digit PIN code.</p>}
        {status === 'not-found' && <p className="sag-fade mt-2.5 text-sm text-rose-700">We could not find this PIN code. Please check it.</p>}
        {status === 'error' && (
          <div className="sag-fade mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex items-start gap-2 text-sm text-rose-700">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> Could not check this PIN code right now.
            </p>
            <button type="button" onClick={() => check(pincode)} className="h-10 px-3 -mx-3 inline-flex items-center gap-1.5 rounded-full text-sm text-[#4B1D3F] underline underline-offset-2 hover:bg-[#F3EEF8] cursor-pointer">
              <RotateCw className="w-4 h-4" aria-hidden="true" /> Retry
            </button>
            <p className="w-full text-sm text-[#2A1A26]/70">You can still place your order. We ship across India.</p>
          </div>
        )}
        {status === 'ok' && (
          <div className="sag-fade mt-3">
            <p className="flex items-start gap-2 text-sm text-emerald-800">
              <CircleCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>We ship to {placeName ? <>{placeName} ({pincode})</> : pincode}.</span>
            </p>
            <ul className="mt-2.5 space-y-2 text-sm text-[#2A1A26]/80">
              <li className="flex items-start gap-2">
                <Truck className="w-4 h-4 mt-0.5 shrink-0 text-[#4B1D3F]" aria-hidden="true" />
                <span>{shippingLine()}</span>
              </li>
              {offersReady && prepaidOff > 0 && (
                <li className="flex items-start gap-2">
                  <BadgePercent className="w-4 h-4 mt-0.5 shrink-0 text-[#4B1D3F]" aria-hidden="true" />
                  <span>{prepaidLine()}</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#4B1D3F]" aria-hidden="true" />
                <span>Pay securely online with UPI, cards or net banking.</span>
              </li>
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
              <p className="text-xs text-[#2A1A26]/65">We email you as soon as your order ships. Final amounts are confirmed at checkout.</p>
              <button type="button" onClick={() => setActivePage('shipping-policy')} className="h-10 inline-flex items-center text-sm text-[#4B1D3F] underline underline-offset-2 cursor-pointer">
                Shipping policy
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
};
