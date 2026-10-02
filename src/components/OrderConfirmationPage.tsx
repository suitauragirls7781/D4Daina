import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { ordersApi } from '../lib/api';
import { Order, Product } from '../types';
import { Check, ChevronRight, Clock, Copy, FileText, Loader2, Mail, Send } from 'lucide-react';
import { OrdersIcon, PinIcon, ReturnIcon, TruckIcon } from './StoreIcons';
import { WhatsAppIcon } from './BrandIcons';
import { getCleanImageUrl } from '../utils/imageHelper';
import { formatDeliveryDate } from '../utils/delivery';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { similarProducts } from '../utils/recommend';
import { isAvailable } from '../utils/smartQuery';
import { trackItem } from '../utils/visitorTracker';
import { OrderProgress } from './OrderProgress';
import { OrderInvoice } from './OrderInvoice';
import { ProductCard } from './ProductCard';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/**
 * Up to `limit` available styles similar to what was just bought (purchased styles excluded).
 * Candidates from each purchased item are taken in turn so every item gets a say.
 */
const alsoLike = (order: Order, catalogue: Product[], limit = 4) => {
  const bought = new Set(order.items.map((item) => String(item.product?.id || '')));
  const byId = new Map(catalogue.map((p) => [String(p.id), p]));
  // Prefer the live product (full colour/occasion data); fall back to the snapshot saved on the order
  const sources = order.items
    .map((item) => byId.get(String(item.product?.id || '')) || (item.product as Product | undefined))
    .filter((p): p is Product => Boolean(p?.id));
  const lists = sources.map((p) => similarProducts(p, catalogue, 12).filter((c) => !bought.has(String(c.id)) && !c.hidden && isAvailable(c)));
  const picked: Product[] = [];
  for (let round = 0; picked.length < limit && lists.some((list) => list.length > round); round += 1) {
    for (const list of lists) {
      const candidate = list[round];
      if (candidate && !picked.some((p) => p.id === candidate.id)) picked.push(candidate);
      if (picked.length >= limit) break;
    }
  }
  return picked;
};

const formatDateTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const OrderConfirmationPage: React.FC = () => {
  const { confirmedOrder, setConfirmedOrder, setActivePage, navigateToCategory, setTrackOrderNumber, allProducts = [], coupons = [], showToast } = useShop();
  const [loading, setLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const suggestions = useMemo(() => (confirmedOrder ? alsoLike(confirmedOrder, allProducts) : []), [confirmedOrder, allProducts]);

  // After a refresh the in-memory order is gone; reload it from the server.
  useEffect(() => {
    if (confirmedOrder) return;
    let saved: { orderNumber?: string; contact?: string } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem('sag_last_order') || 'null');
    } catch {}
    if (!saved?.orderNumber) return;
    const contact = saved.contact || '';
    setLoading(true);
    ordersApi<{ order: Order }>('track', { orderNumber: saved.orderNumber, contact })
      // A guest reload gets the short view (no email): keep the email this tab saved at checkout, so
      // "Track this order" can look the order up again straight away.
      .then((result) => setConfirmedOrder(result.order.customerEmail || !contact ? result.order : { ...result.order, customerEmail: contact }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [confirmedOrder]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center bg-page" role="status" aria-label="Loading your order">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!confirmedOrder) {
    return (
      <div className="bg-page px-4 py-16">
        <div className="sag-card max-w-md mx-auto px-4 py-10 text-center">
          <span className="mx-auto w-14 h-14 rounded-full bg-sunken text-ink-muted flex items-center justify-center"><OrdersIcon className="w-7 h-7" mono /></span>
          <h1 className="mt-4 font-display text-[28px] leading-8 text-ink">No recent order</h1>
          <p className="mt-1.5 text-sm leading-5 text-ink-muted">You can look up any order from the Track Order page.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setActivePage('shop')} className="sag-btn-primary h-12 sm:order-2">Shop now</button>
            <button type="button" onClick={() => setActivePage('track-order')} className="sag-btn-outline h-12">Track an order</button>
          </div>
        </div>
      </div>
    );
  }

  const order = confirmedOrder as Order;
  const paid = order.paymentStatus === 'Paid';
  const address = order.deliveryAddress || ({} as Order['deliveryAddress']);
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const placedAt = formatDateTime(order.paidAt || order.date);
  // The date the store itself set, else the estimate made from the owner's configured delivery days (labelled)
  const expected = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null;
  const expectedText = expected && !Number.isNaN(expected.getTime()) ? expected.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const estimatedText = !expectedText && paid ? formatDeliveryDate(order.estimatedDeliveryDate) : '';
  // Live store coupons the customer can use next time (not expired, not used up, not the one just used)
  const now = Date.now();
  const nextCoupons = coupons.filter((c) => c.isActive !== false
    && String(c.code).toUpperCase() !== String(order.couponCode || '').toUpperCase()
    && (!c.expiryDate || new Date(c.expiryDate).getTime() > now)
    && (!c.startDate || new Date(c.startDate).getTime() <= now)
    && (!c.usageLimit || (c.usageCount || 0) < c.usageLimit)).slice(0, 3);

  const shareOrder = async () => {
    const link = `${window.location.origin}/track-order?order=${encodeURIComponent(order.orderNumber)}`;
    const text = [
      `Suit Aura Girls order #${order.orderNumber}`,
      ...order.items.map((item) => `• ${item.product?.name}${item.selectedSize ? ` (${item.selectedSize})` : ''} × ${item.quantity}`),
      `Total ${paid ? 'paid' : ''}: ${inr(order.finalTotal)}`.replace('  ', ' '),
      `Track: ${link}`,
    ].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: `Order #${order.orderNumber}`, text });
        return;
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const firstName = order.customerName ? order.customerName.split(' ')[0] : '';
  const moneyRow = 'flex justify-between gap-3';
  const blockTitle = 'text-base leading-[22px] font-semibold text-ink';
  const trackOrder = () => { setTrackOrderNumber(order.orderNumber); setActivePage('track-order'); };

  return (
    <div id="order-confirmation-page" className="bg-page px-4 pt-6 pb-10 sm:py-12">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Confirmation */}
        <div className="text-center sag-fade">
          <span className={`sag-placed-pop mx-auto w-14 h-14 rounded-full flex items-center justify-center ${paid ? 'bg-ok text-white' : 'bg-sale-tint text-sale'}`}>
            {paid ? <Check className="w-7 h-7" strokeWidth={2.5} aria-hidden="true" /> : <Clock className="w-7 h-7" aria-hidden="true" />}
          </span>
          <p className={`mt-3 text-sm leading-5 font-semibold ${paid ? 'text-ok' : 'text-sale'}`}>{paid ? 'Payment successful' : 'Order received'}</p>
          <h1 className="mt-1 font-display text-[28px] leading-8 text-ink">
            Thank you{firstName ? `, ${firstName}` : ''}!
          </h1>
          <p className="mt-2 text-sm leading-5 text-ink-muted max-w-md mx-auto">
            {paid
              ? order.customerEmail
                ? <>Your order is confirmed. A confirmation email has been sent to <span className="font-medium text-ink break-all">{order.customerEmail}</span>.</>
                : 'Your order is confirmed. A confirmation email has been sent to you.'
              : 'We are confirming your payment. This page will update once it is verified.'}
          </p>
        </div>

        {/* Receipt */}
        <section className="sag-card overflow-hidden" aria-label="Order receipt">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="sag-eyebrow">Order number</p>
              <p className="sag-num mt-0.5 text-[22px] leading-7 font-bold text-ink break-all">#{order.orderNumber}</p>
              {placedAt && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Placed on {placedAt}</p>}
            </div>
            <span className={`sag-badge shrink-0 mt-1 ${paid ? 'bg-ok-tint text-ok' : 'bg-sale-tint text-sale'}`}>
              {paid ? 'Paid online' : order.paymentStatus || 'Payment pending'}
            </span>
          </div>

          <div className="px-4 sm:px-5 pb-4 space-y-3">
            <OrderProgress order={order} compact />

            {expectedText && (
              <p className="flex items-center gap-2.5 rounded-control bg-sunken px-3.5 py-3 text-sm leading-5 text-ink">
                <TruckIcon className="h-5 w-5 shrink-0" mono live={false} /> <span>Expected delivery by <span className="font-semibold">{expectedText}</span></span>
              </p>
            )}
            {estimatedText && (
              <p className="flex items-center gap-2.5 rounded-control bg-sunken px-3.5 py-3 text-sm leading-5 text-ink">
                <TruckIcon className="h-5 w-5 shrink-0" mono live={false} /> <span>Estimated delivery by <span className="font-semibold">{estimatedText}</span></span>
              </p>
            )}
          </div>

          {/* Items */}
          <div className="px-4 sm:px-5 py-4 border-t border-line">
            <p className={blockTitle}>{pieces} {pieces === 1 ? 'item' : 'items'} in this order</p>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-chip bg-sunken">
                    {item.product?.images?.[0] && (
                      <img src={getCleanImageUrl(item.product.images[0], 160)} alt={item.product.name} className="w-full h-full object-cover object-top" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-5 font-medium text-ink line-clamp-2">{item.product?.name}</p>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                      {item.selectedSize && !/^free ?size$/i.test(String(item.selectedSize)) ? `Size ${item.selectedSize}` : 'One size'}{item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : ''} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="sag-num text-sm leading-5 font-semibold text-ink shrink-0">{inr(item.product.price * item.quantity)}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Bill */}
          <div className="sag-num px-4 sm:px-5 py-4 border-t border-line space-y-2 text-sm leading-5 text-ink-muted">
            <p className={blockTitle}>Price details</p>
            <div className={moneyRow}><span>Subtotal</span><span className="text-ink">{inr(order.subtotal)}</span></div>
            {(order.comboDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Combo discount</span><span>−{inr(order.comboDiscount || 0)}</span></div>}
            {(order.couponDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Coupon {order.couponCode}</span><span>−{inr(order.couponDiscount || 0)}</span></div>}
            {(order.prepaidDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Prepaid discount</span><span>−{inr(order.prepaidDiscount || 0)}</span></div>}
            <div className={moneyRow}><span>Shipping</span>{order.shippingCharge === 0 ? <span className="font-semibold text-sale">Free</span> : <span className="text-ink">{inr(order.shippingCharge)}</span>}</div>
            <div className={`${moneyRow} items-baseline pt-3 mt-1 border-t border-line text-ink`}>
              <span className="text-base leading-[22px] font-semibold">{paid ? 'Total paid' : 'Total'}</span>
              <span className="text-[22px] leading-7 font-bold">{inr(order.finalTotal)}</span>
            </div>
            {paid && order.paymentRef && <p className="text-[13px] leading-[18px] break-all">Payment ID: {order.paymentRef}</p>}
          </div>

          {/* Address (not included when the order was looked up without signing in) */}
          {(address.fullName || address.city) && (
            <div className="px-4 sm:px-5 py-4 border-t border-line flex gap-3 text-sm leading-5">
              <span className="shrink-0 flex mt-0.5 text-ink-muted"><PinIcon className="w-5 h-5" mono live={false} /></span>
              <div className="text-ink-muted min-w-0">
                <p className="font-semibold text-ink">Delivering to {address.fullName}</p>
                {address.houseFlat && <p className="break-words">{[address.houseFlat, address.street, address.area].filter(Boolean).join(', ')}</p>}
                <p>{[address.city, address.state].filter(Boolean).join(', ')} {address.pincode}</p>
                {address.mobile && <p>Phone: {address.mobile}</p>}
              </div>
            </div>
          )}

          {order.giftNote && (
            <p className="px-4 sm:px-5 py-4 border-t border-line text-sm leading-5 text-ink break-words"><span className="text-ink-muted">Gift note:</span> {order.giftNote}</p>
          )}
        </section>

        {/* Main actions */}
        <div className="grid gap-2 sm:grid-cols-2">
          <button id="confirm-track-order-btn" type="button" onClick={trackOrder} className="sag-btn-primary w-full gap-2">
            <TruckIcon className="w-[18px] h-[18px]" mono live={false} /> Track this order
          </button>
          <button id="confirm-continue-shopping-btn" type="button" onClick={() => navigateToCategory('All')} className="sag-btn-outline w-full">
            Continue shopping
          </button>
        </div>

        {/* What happens next */}
        <section className="sag-card px-4 sm:px-5" aria-labelledby="next-steps-title">
          <h2 id="next-steps-title" className={`${blockTitle} pt-4 pb-1`}>What happens next</h2>
          {paid && (
            <div className="sag-row border-t-0 items-start py-3">
              <Mail className="w-5 h-5 shrink-0 mt-0.5 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block">Check your email</span>
                <span className="block font-normal text-[13px] leading-[18px] text-ink-muted break-words">
                  Your order confirmation{order.customerEmail ? <> was sent to <span className="break-all">{order.customerEmail}</span></> : ' was sent to you'}. Look in spam if you cannot see it.
                </span>
              </span>
            </div>
          )}
          <button type="button" onClick={trackOrder} className={`sag-row w-full items-start py-3 text-left cursor-pointer ${paid ? '' : 'border-t-0'}`}>
            <span className="shrink-0 flex mt-0.5 text-ink-muted"><TruckIcon className="w-5 h-5" mono live={false} /></span>
            <span className="min-w-0 flex-1">
              <span className="block">Follow your order</span>
              <span className="block font-normal text-[13px] leading-[18px] text-ink-muted">Every update shows on the tracking page. Keep your order number handy.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { setActivePage('return-policy'); window.scrollTo(0, 0); }} className="sag-row w-full items-start py-3 text-left cursor-pointer">
            <span className="shrink-0 flex mt-0.5 text-ink-muted"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
            <span className="min-w-0 flex-1">
              <span className="block">7-day returns & exchange</span>
              <span className="block font-normal text-[13px] leading-[18px] text-ink-muted">If something is not right after delivery, ask for a return or a size exchange.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" aria-hidden="true" />
          </button>
          <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about my order #${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" className="sag-row items-start py-3">
            <WhatsAppIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block">Need help? Chat on WhatsApp</span>
              <span className="block font-normal text-[13px] leading-[18px] text-ink-muted">Send us your order number and we will take it from there.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" aria-hidden="true" />
          </a>
        </section>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={shareOrder} className="sag-btn-outline w-full h-12 gap-2 text-[15px] sm:last:col-span-2">
            <Send className="w-[18px] h-[18px]" aria-hidden="true" /> Send order details
          </button>
          {(paid || order.paymentStatus === 'Refunded') && Boolean(address.fullName) && (
            <button type="button" onClick={() => setShowReceipt(true)} className="sag-btn-outline w-full h-12 gap-2 text-[15px]">
              <FileText className="w-[18px] h-[18px]" aria-hidden="true" /> View / print receipt
            </button>
          )}
        </div>

        {paid && nextCoupons.length > 0 && (
          <section className="sag-card p-4 sm:p-5 space-y-3" aria-label="Coupons for your next order">
            <h2 className={blockTitle}>For your next order</h2>
            <ul className="space-y-2">
              {nextCoupons.map((coupon) => (
                <li key={coupon.id} className="flex items-center justify-between gap-3 rounded-control border-[1.5px] border-dashed border-sale-line bg-sale-tint pl-3.5 pr-2 py-2">
                  <div className="min-w-0">
                    <p className="sag-caps text-[13px] leading-[18px] font-bold tracking-wide text-ink break-all">{String(coupon.code).toUpperCase()}</p>
                    <p className="sag-num text-[13px] leading-[18px] text-sale">
                      {coupon.discountType === 'fixed' ? `₹${coupon.discountValue} off` : `${coupon.discountValue}% off`}
                      {coupon.minOrderValue ? ` on orders above ₹${coupon.minOrderValue.toLocaleString('en-IN')}` : ''}
                      {coupon.expiryDate ? ` · till ${new Date(coupon.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(String(coupon.code).toUpperCase()).then(() => showToast(`Copied ${String(coupon.code).toUpperCase()}`, 'success')).catch(() => {})}
                    className="sag-link shrink-0 gap-1.5 px-2"
                    aria-label={`Copy coupon ${coupon.code}`}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" /> Copy
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {suggestions.length > 0 && (
          <section className="pt-6 space-y-4" aria-labelledby="also-like-title">
            <h2 id="also-like-title" className="font-display text-[22px] leading-7 text-ink">You may also like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-6">
              {suggestions.map((p) => (
                <div key={p.id} onClickCapture={() => trackItem('feature_use', 'reco_click')}>
                  <ProductCard product={p} compact />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {showReceipt && <OrderInvoice order={order} onClose={() => setShowReceipt(false)} />}
    </div>
  );
};
