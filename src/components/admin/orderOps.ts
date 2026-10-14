import { Order } from '../../types';
import { isReturnOpen } from '../OrderProgress';
import { orderMobile } from './adminAlerts';
import type { PillTone } from './PaymentBadge';

/**
 * The shared logic of the order pages (list, board, order page): which group an order is in, the customer's
 * earlier orders, plain facts about an order (never a score), the cash-on-delivery check, and the CSV export.
 * Everything is read from the store's own orders; nothing here writes.
 */

// ---------------------------------------------------------------- groups

/** The seven groups every order belongs to (exactly one each). */
export type Bucket = 'topack' | 'packed' | 'onway' | 'delivered' | 'returns' | 'cancelled' | 'unpaid';

/**
 * The one group an order belongs to. Checked in this order, first match wins:
 * unpaid attempt, cancelled, return / exchange, refunded, delivered, on the way, packed, and the rest is "to pack".
 */
export const bucketOf = (order: Order): Bucket => {
  const status = String(order.status);
  if (order.paymentStatus === 'Unpaid' && status === 'Pending') return 'unpaid';
  if (status === 'Cancelled') return 'cancelled';
  if (isReturnOpen(order) || status === 'Returned' || status === 'Refund Requested') return 'returns';
  if (status === 'Refunded' || order.paymentStatus === 'Refunded') return 'cancelled';
  if (status === 'Delivered') return 'delivered';
  if (status === 'Shipped' || status === 'In Transit' || status === 'Out for Delivery') return 'onway';
  if (status === 'Packed') return 'packed';
  return 'topack';
};

/** A customer's cancellation request that nobody has answered yet. */
export const cancelWaiting = (order: Order) => Boolean(order.cancelRequest && !order.cancelRequest.handledAt);

// ---------------------------------------------------------------- dates and money

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day in India ("2026-10-08"); '' when the saved date cannot be read. */
export const istDay = (value: unknown): string => {
  const raw = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return !raw || Number.isNaN(date.getTime()) ? '' : IST_DAY.format(date);
};
export const todayIst = () => IST_DAY.format(new Date());
export const istDayBack = (days: number) => IST_DAY.format(new Date(Date.now() - days * DAY_MS));

export const inr = (value: unknown) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/** "just now", "5 min", "3 h", "2 days": how long ago, for the cards. '' when the time cannot be read. */
export const ageOf = (iso: unknown, now = Date.now()) => {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
};
/** Whole days since the time (0 when it cannot be read). */
export const daysSince = (iso: unknown, now = Date.now()) => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY_MS)) : 0;
};

// ---------------------------------------------------------------- the customer's other orders

const keysOf = (order: Order) => {
  const phone = orderMobile(order);
  const email = String(order.customerEmail || '').trim().toLowerCase();
  return [phone ? `p:${phone}` : '', email ? `e:${email}` : ''].filter(Boolean);
};

export type CustomerIndex = Map<string, Order[]>;

/** Every order filed under the customer's mobile number and under their email. */
export const buildCustomerIndex = (orders: Order[]): CustomerIndex => {
  const index: CustomerIndex = new Map();
  orders.forEach((order) => keysOf(order).forEach((key) => {
    const list = index.get(key);
    if (list) list.push(order); else index.set(key, [order]);
  }));
  return index;
};

/** The customer's other orders (same mobile number or same email), newest first. */
export const otherOrdersOf = (order: Order, index: CustomerIndex): Order[] => {
  const seen = new Map<string, Order>();
  keysOf(order).forEach((key) => (index.get(key) || []).forEach((o) => {
    if (o.orderNumber !== order.orderNumber) seen.set(o.orderNumber, o);
  }));
  return [...seen.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

/** A fact about an order, in words, with the colour of a pill. Facts only: no score is made up. */
export interface OrderFact { key: string; label: string; tone: PillTone }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Plain facts that help decide whether to call before shipping: the customer's earlier orders placed before
 * this one (from the same mobile number or email), and checks on the address itself.
 */
export const orderFacts = (order: Order, others: Order[]): OrderFact[] => {
  const placed = String(order.date || '');
  const earlier = others.filter((o) => String(o.date || '') < placed);
  const real = earlier.filter((o) => bucketOf(o) !== 'unpaid');
  const delivered = real.filter((o) => o.status === 'Delivered').length;
  const cancelled = real.filter((o) => o.status === 'Cancelled').length;
  const returned = real.filter((o) => o.status === 'Returned' || o.returnRequest?.status === 'refunded').length;
  const facts: OrderFact[] = [];
  facts.push(real.length === 0
    ? { key: 'first', label: 'First order', tone: 'plain' }
    : { key: 'earlier', label: `${plural(real.length, 'earlier order', 'earlier orders')}`, tone: 'plain' });
  if (delivered > 0) facts.push({ key: 'delivered', label: `${delivered} delivered before`, tone: 'good' });
  if (cancelled > 0) facts.push({ key: 'cancelled', label: `${cancelled} cancelled before`, tone: 'danger' });
  if (returned > 0) facts.push({ key: 'returned', label: `${returned} returned before`, tone: 'danger' });
  const pin = String(order.deliveryAddress?.pincode || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) facts.push({ key: 'pin', label: pin ? 'PIN code is not 6 digits' : 'No PIN code', tone: 'danger' });
  const deliveryPhone = String(order.deliveryAddress?.mobile || '').replace(/\D/g, '').slice(-10);
  const orderPhone = String(order.customerMobile || '').replace(/\D/g, '').slice(-10);
  if (deliveryPhone.length === 10 && orderPhone.length === 10 && deliveryPhone !== orderPhone) facts.push({ key: 'phone', label: 'Delivery phone is different', tone: 'muted' });
  if (!orderMobile(order)) facts.push({ key: 'nophone', label: 'No valid mobile number', tone: 'danger' });
  return facts;
};

// ---------------------------------------------------------------- cash on delivery check

/** The line written at the top of the internal notes when the owner has confirmed a cash-on-delivery order. */
export const COD_MARK = 'COD confirmed with the customer';

/** The saved confirmation line ('' when the order has not been confirmed). */
export const codConfirmation = (order: Order) => (order.notes || '').split('\n').find((line) => line.startsWith(COD_MARK)) || '';

/** A cash-on-delivery order that is not shipped yet and has not been confirmed with the customer. */
export const needsCodCheck = (order: Order) => order.payMode === 'cod'
  && order.paymentStatus === 'Paid'
  && (bucketOf(order) === 'topack' || bucketOf(order) === 'packed')
  && !codConfirmation(order);

/** The internal notes with the confirmation line put on top (the notes keep everything they had). */
export const notesWithCodMark = (order: Order, how: 'call' | 'whatsapp') => {
  const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const line = `${COD_MARK} ${how === 'call' ? 'on a call' : 'on WhatsApp'} · ${stamp}`;
  return [line, (order.notes || '').trim()].filter(Boolean).join('\n');
};

/** The WhatsApp message that asks the customer to confirm a cash-on-delivery order. */
export const codConfirmMessage = (order: Order) => {
  const first = String(order.customerName || order.deliveryAddress?.fullName || '').trim().split(/\s+/)[0];
  const a = order.deliveryAddress;
  const place = [a?.city, a?.pincode].filter(Boolean).join(' ');
  return [
    `Hello${first ? ` ${first}` : ''}, this is Suit Aura Girls.`,
    `Thank you for your order ${order.orderNumber}.`,
    `It is cash on delivery: please keep ${inr(order.codDue)} ready in cash at delivery${place ? ` (${place})` : ''}.`,
    'Please reply YES to confirm, and we will ship it.',
  ].join(' ');
};

/** The WhatsApp message for a shopper whose payment did not finish. */
export const paymentHelpMessage = (order: Order) => {
  const first = String(order.customerName || order.deliveryAddress?.fullName || '').trim().split(/\s+/)[0];
  const first1 = order.items?.[0]?.product?.name;
  return `Hello${first ? ` ${first}` : ''}, this is Suit Aura Girls. We saw that your payment for ${first1 ? `"${first1}"` : 'your order'} (${inr(order.finalTotal)}) did not go through. Can we help you complete the order?`;
};

/** wa.me link with a message typed in; '' when the order has no valid mobile number. */
export const waLink = (order: Order, text: string) => {
  const mobile = orderMobile(order);
  return mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}` : '';
};

// ---------------------------------------------------------------- address

/** The delivery address as lines a courier can read. */
export const addressLines = (order: Order) => {
  const a = order.deliveryAddress || ({} as Order['deliveryAddress']);
  const clean = (v: unknown) => String(v ?? '').trim();
  return [
    clean(a.fullName) || clean(order.customerName),
    [a.houseFlat, a.street].map(clean).filter(Boolean).join(', '),
    [clean(a.area), clean(a.landmark) ? `Landmark: ${clean(a.landmark)}` : ''].filter(Boolean).join(', '),
    [clean(a.city), clean(a.district) && clean(a.district) !== clean(a.city) ? clean(a.district) : '', clean(a.state)].filter(Boolean).join(', '),
    clean(a.pincode) ? `PIN ${clean(a.pincode)}` : '',
    orderMobile(order) ? `Phone ${orderMobile(order)}` : '',
  ].filter(Boolean);
};

/** A Google Maps search for the address (opens the map; nothing is sent anywhere by the admin). */
export const mapLink = (order: Order) => {
  const a = order.deliveryAddress;
  const query = [a?.houseFlat, a?.street, a?.area, a?.city, a?.state, a?.pincode].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
};

// ---------------------------------------------------------------- CSV

const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  // A cell that starts like a formula is opened as text by spreadsheet apps
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The orders as a spreadsheet (one row per order), with what was paid online and the cash still to collect. */
export const ordersCsv = (orders: Order[]) => {
  const head = ['Order', 'Placed (India)', 'Status', 'Payment', 'Pay mode', 'Total', 'Paid online', 'Cash to collect', 'Customer', 'Mobile', 'Email',
    'Address', 'City', 'State', 'PIN code', 'Items', 'Pieces', 'Coupon', 'Courier', 'Tracking number', 'Payment ref', 'Cancel reason', 'Refund ref'];
  const rows = orders.map((o) => {
    const cod = o.payMode === 'cod';
    const paidNow = o.paymentStatus === 'Paid' ? (cod ? Number(o.codAdvance) || 0 : Number(o.finalTotal) || 0) : 0;
    const a = o.deliveryAddress || ({} as Order['deliveryAddress']);
    const placed = Date.parse(String(o.date || ''));
    return [
      o.orderNumber,
      Number.isFinite(placed) ? new Date(placed).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      o.status,
      o.paymentStatus || '',
      cod ? 'Cash on delivery' : 'Prepaid',
      Math.round(Number(o.finalTotal) || 0),
      Math.round(paidNow),
      cod && o.paymentStatus === 'Paid' ? Math.round(Number(o.codDue) || 0) : 0,
      o.customerName,
      o.customerMobile,
      o.customerEmail,
      [a.houseFlat, a.street, a.area].map((v) => String(v ?? '').trim()).filter(Boolean).join(', '),
      a.city || '',
      a.state || '',
      a.pincode || '',
      (o.items || []).map((item) => `${item.product?.name || 'Item'}${item.selectedSize ? ` (${item.selectedSize})` : ''} x ${item.quantity}`).join('; '),
      (o.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      o.couponCode || '',
      o.courierPartner || '',
      o.trackingNumber || '',
      o.paymentRef || '',
      o.cancelReason || '',
      o.refundRef || '',
    ];
  });
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
};

/** Saves text as a file on this device (a CSV opens in Excel and Google Sheets; the mark at the start keeps the ₹ sign readable). */
export const downloadText = (name: string, text: string, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};
