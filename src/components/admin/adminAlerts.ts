import { useCallback, useEffect, useRef, useState } from 'react';
import { Order } from '../../types';
import { rupees } from './adminStats';

/**
 * New-order alerts for the open admin panel (a toast, the tab title and an optional chime), and the
 * ready-made WhatsApp messages to a customer. Everything is built from the order's own saved fields.
 */

// ---------------------------------------------------------------- the chime (Web Audio, no file)

const SOUND_KEY = 'sag_admin_order_sound';
const readSoundOn = () => {
  try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; }
};

let audio: AudioContext | null = null;
const audioContext = (): AudioContext | null => {
  if (audio) return audio;
  const Ctor: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try { audio = new Ctor(); } catch { audio = null; }
  return audio;
};

/** Browsers allow sound only after a click or key press: call this from one. */
export const unlockOrderSound = () => {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
};

/** A short, soft two-tone chime. */
export const playOrderChime = () => {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.02;
  [[659.25, 0], [880, 0.18]].forEach(([frequency, at]) => {
    const tone = ctx.createOscillator();
    const volume = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start + at);
    volume.gain.exponentialRampToValueAtTime(0.16, start + at + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.55);
    tone.connect(volume);
    volume.connect(ctx.destination);
    tone.start(start + at);
    tone.stop(start + at + 0.6);
  });
};

// ---------------------------------------------------------------- new paid orders

export interface OrderAlert {
  orderNumber: string;
  text: string;
}

/** "New order SAG-… · ₹…", with what is still to be collected for cash on delivery. */
export const newOrderLine = (order: Order) => {
  const base = `New order ${order.orderNumber} · ${rupees(Number(order.finalTotal) || 0)}`;
  return order.payMode === 'cod' ? `${base} · COD · collect ${rupees(Number(order.codDue) || 0)}` : base;
};

// Only an order paid in the last half hour is "new" (a list that fills late must not announce old orders)
const RECENT_MS = 30 * 60 * 1000;
const isRecent = (order: Order) => {
  const time = Date.parse(order.paidAt || order.date || '');
  return Number.isFinite(time) && Math.abs(Date.now() - time) < RECENT_MS;
};
const stripCount = (title: string) => title.replace(/^\(\d+\)\s/, '');

/**
 * Watches the live orders list while the admin is open. A paid order that was not in the list before is
 * announced once: a toast, "(1) " in the tab title until the tab is looked at, and the chime when the
 * owner has switched the sound on. Orders already there on the first load are never announced.
 */
export const useNewOrderAlerts = (orders: Order[], ordersLoaded: boolean) => {
  const [soundOn, setSoundState] = useState(readSoundOn);
  const [alerts, setAlerts] = useState<OrderAlert[]>([]);
  const [unseen, setUnseen] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    if (!ordersLoaded) return;
    const paid = orders.filter((o) => o.paymentStatus === 'Paid' && !o.testPayment && o.orderNumber);
    if (known.current === null) {
      known.current = new Set(paid.map((o) => o.orderNumber));
      return;
    }
    const seen = known.current;
    const fresh = paid.filter((o) => !seen.has(o.orderNumber));
    if (!fresh.length) return;
    fresh.forEach((o) => seen.add(o.orderNumber));
    const recent = fresh.filter(isRecent);
    if (!recent.length) return;
    setAlerts((old) => [...recent.map((o) => ({ orderNumber: o.orderNumber, text: newOrderLine(o) })), ...old].slice(0, 4));
    if (document.visibilityState !== 'visible' || !document.hasFocus()) setUnseen((n) => n + recent.length);
    if (soundRef.current) playOrderChime();
  }, [orders, ordersLoaded]);

  // "(2) " in front of the tab title until the owner looks at the tab
  useEffect(() => {
    document.title = unseen > 0 ? `(${unseen}) ${stripCount(document.title)}` : stripCount(document.title);
  }, [unseen]);
  useEffect(() => {
    const looked = () => { if (document.visibilityState === 'visible') setUnseen(0); };
    window.addEventListener('focus', looked);
    document.addEventListener('visibilitychange', looked);
    return () => {
      window.removeEventListener('focus', looked);
      document.removeEventListener('visibilitychange', looked);
      document.title = stripCount(document.title);
    };
  }, []);

  // After a reload the sound is still switched on, but the browser waits for the first click or key
  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => unlockOrderSound();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [soundOn]);

  /** Call from the switch's click: turning it on plays the chime once, so the owner hears what it is. */
  const setSoundOn = useCallback((on: boolean) => {
    setSoundState(on);
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* the switch still works for this visit */ }
    if (on) playOrderChime();
  }, []);

  const dismissAlert = useCallback((orderNumber: string) => {
    setAlerts((old) => old.filter((a) => a.orderNumber !== orderNumber));
  }, []);

  return { alerts, dismissAlert, soundOn, setSoundOn };
};

// ---------------------------------------------------------------- WhatsApp to the customer

export type OrderMessageKind = 'packed' | 'shipped' | 'delivered';

/** The customer's 10-digit Indian mobile number, or '' when the order has none that is valid. */
export const orderMobile = (order: Order) => {
  const pick = (value: unknown) => {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? digits : '';
  };
  return pick(order.customerMobile) || pick(order.deliveryAddress?.mobile);
};

/** The ready-made message for one stage, from the order's own number, courier and tracking number. */
export const orderMessage = (order: Order, kind: OrderMessageKind) => {
  const first = String(order.customerName || order.deliveryAddress?.fullName || '').trim().split(/\s+/)[0];
  const hello = `Hello${first ? ` ${first}` : ''}, this is Suit Aura Girls.`;
  if (kind === 'packed') {
    return `${hello} Your order ${order.orderNumber} is packed and will be given to the courier soon. Thank you for shopping with us.`;
  }
  if (kind === 'delivered') {
    return `${hello} Your order ${order.orderNumber} has been delivered. We hope you like it. If you need any help, please reply to this message. Thank you.`;
  }
  const courier = String(order.courierPartner || '').trim();
  const tracking = String(order.trackingNumber || '').trim();
  const link = String(order.trackingUrl || '').trim();
  const due = order.payMode === 'cod' ? Number(order.codDue) || 0 : 0;
  return [
    `${hello} Your order ${order.orderNumber} has been shipped.`,
    courier ? `Courier: ${courier}.` : '',
    tracking ? `Tracking number: ${tracking}.` : '',
    /^https:\/\//i.test(link) ? `Track it here: ${link}` : '',
    due > 0 ? `Please keep ${rupees(due)} ready in cash for the delivery.` : '',
    'Thank you for shopping with us.',
  ].filter(Boolean).join(' ');
};

/** A wa.me link that opens WhatsApp with the message typed in; null when the order has no valid mobile number. */
export const orderWhatsAppLink = (order: Order, kind: OrderMessageKind): string | null => {
  const mobile = orderMobile(order);
  return mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(orderMessage(order, kind))}` : null;
};
