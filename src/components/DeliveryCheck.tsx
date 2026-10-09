import React, { useEffect, useId, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { Product } from '../types';
import { CircleAlert, CircleCheck, Loader2, RotateCw } from 'lucide-react';
import { fromCatalogOrLive } from '../lib/catalog';
import { useAdmin } from '../context/AdminContext';
import { deliveryEstimateText } from '../utils/delivery';

export const PIN_KEY = 'sag_user_pincode';
export const PIN_RE = /^[1-9]\d{5}$/;
const LOOKUP_TIMEOUT_MS = 8000;

type Place = { district: string; state: string };
type Status = 'idle' | 'loading' | 'ok' | 'invalid' | 'not-found' | 'error';

// PIN codes are looked up in the India Post directory (the same service the checkout uses),
// once per PIN code per visit. A failed lookup is forgotten so Retry asks again.
const lookups = new Map<string, Promise<Place | null>>();
export const lookupPincode = (pin: string): Promise<Place | null> => {
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
  /** Pieces chosen on the product page; the shipping preview uses it. */
  quantity?: number;
  /** Extra classes for the outer form (spacing, a divider). */
  className?: string;
}

/**
 * PIN code check for the product page: one row (PIN field and a Check button) and a one-line answer.
 * It only says what is actually known: that the PIN code exists (and where) and the store's shipping
 * rule for this item. A delivery date is shown only when the owner has set delivery days
 * (Admin → Settings → Checkout), labelled as an estimate. Every amount is a preview; the server
 * recalculates the order before payment.
 */
export const DeliveryCheck: React.FC<DeliveryCheckProps> = ({ product, quantity = 1, className = '' }) => {
  const { storeOffers, cart = [], cartSubtotal = 0 } = useShop();
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
  const { shippingCharge, freeShippingThreshold } = storeOffers;
  const freeAlone = shippingCharge === 0 || (freeShippingThreshold > 0 && itemTotal >= freeShippingThreshold);
  // Only when this style is not in the bag yet, so the bag total plus this item is exactly the next order.
  const inBag = cart.some((item) => String(item.product.id) === String(product.id));
  const freeWithBag = !freeAlone && !inBag && cartSubtotal > 0 && freeShippingThreshold > 0 && cartSubtotal + itemTotal >= freeShippingThreshold;
  const placeName = place ? [place.district, place.state].filter(Boolean).join(', ') : '';

  const shippingLine = () => {
    if (!offersReady) return 'Shipping charges, if any, are shown at checkout before you pay.';
    if (freeAlone) return shippingCharge === 0 ? 'Free shipping.' : `Free shipping (orders above ${inr(freeShippingThreshold)} ship free).`;
    if (freeWithBag) return `Free shipping with the items already in your bag (orders above ${inr(freeShippingThreshold)}).`;
    if (freeShippingThreshold <= 0) return `Shipping ${inr(shippingCharge)} per order.`;
    return `Shipping ${inr(shippingCharge)} for this item on its own, free on orders above ${inr(freeShippingThreshold)}.`;
  };

  const failed = status === 'invalid' || status === 'not-found';

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); check(pincode); }}
      className={className}
      aria-busy={status === 'loading'}
      noValidate
    >
      <label htmlFor={inputId} className="aura-lbl mb-2.5 block">Check delivery to your PIN code</label>
      <div className="flex gap-2">
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="postal-code"
          enterKeyHint="done"
          maxLength={6}
          value={pincode}
          onChange={(e) => onChange(e.target.value)}
          placeholder="6-digit PIN code"
          aria-describedby={status === 'idle' ? undefined : resultId}
          aria-invalid={failed}
          className="sag-input aura-num flex-1 min-w-0 aria-invalid:border-danger!"
        />
        <button type="submit" disabled={status === 'loading'} className="aura-btn shrink-0 min-h-[58px] min-w-[96px] px-7 disabled:cursor-wait">
          {status === 'loading' ? <><Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.6} aria-hidden="true" /><span className="sr-only">Checking</span></> : 'Check'}
        </button>
      </div>

      <div id={resultId} aria-live="polite" className="aura-num text-[13.5px] leading-5">
        {status === 'invalid' && (
          <p className="mt-3 flex items-start gap-2 text-danger"><CircleAlert className="mt-0.5 w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /> Enter a valid 6-digit PIN code.</p>
        )}
        {status === 'not-found' && (
          <p className="mt-3 flex items-start gap-2 text-danger"><CircleAlert className="mt-0.5 w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /> We could not find this PIN code. Please check it.</p>
        )}
        {status === 'error' && (
          <div className="mt-3">
            <p className="flex items-start gap-2 text-danger">
              <CircleAlert className="mt-0.5 w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /> Could not check this PIN code right now.
            </p>
            <p className="flex flex-wrap items-center gap-x-3 text-ink-muted">
              <span>You can still place your order. We ship across India.</span>
              <button type="button" onClick={() => check(pincode)} className="sag-link text-[13.5px] gap-1.5">
                <RotateCw className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" /> Retry
              </button>
            </p>
          </div>
        )}
        {status === 'ok' && (
          <p className="mt-3 flex items-start gap-2 text-ink-muted">
            <CircleCheck className="mt-0.5 w-4 h-4 shrink-0 text-ok" strokeWidth={1.6} aria-hidden="true" />
            <span>
              <span className="font-bold text-ink">We ship
 to {placeName ? <>{placeName} ({pincode})</> : pincode}.</span>{' '}
              {shippingLine()}
            </span>
          </p>
        )}
        {estimateText && status !== 'error' && (
          <p className="mt-1 text-ink-muted">{estimateText} (if ordered today)</p>
        )}
      </div>
    </form>
  );
};
