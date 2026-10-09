import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
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
import { OrderProgress, canRequestCancel } from './OrderProgress';
import { OrderInvoice } from './OrderInvoice';
import { ProductCard } from './ProductCard';
import { Ornament, SectionTitle } from './SectionTitle';
import { DrawnTick } from './OrderPlacedOverlay';

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
  const { user } = useAuth();
  const { storeSettings } = useAdmin();
  const { navigate } = useRouter();
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
      <div className="py-24 flex justify-center" role="status" aria-label="Loading your order">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!confirmedOrder) {
    return (
      <div className="px-4 py-16">
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <span className="mx-auto flex justify-center text-brand"><OrdersIcon className="w-7 h-7" mono /></span>
          <h1 className="mt-4 font-display text-[30px] leading-[1.08] text-ink">No recent order</h1>
          <Ornament className="mt-3.5" />
          <p className="mt-3.5 text-[13.5px] leading-5 text-ink-muted">You can look up any order from the Track Order page.</p>
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
      order.payMode === 'cod' ? `Order total: ${inr(order.finalTotal)} (paid ${inr(order.codAdvance || 0)}, ${inr(order.codDue || 0)} in cash on delivery)` : `Total ${paid ? 'paid' : ''}: ${inr(order.finalTotal)}`.replace('  ', ' '),
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
  const blockTitle = 'text-[10.5px] leading-4 font-semibold uppercase tracking-[0.22em] text-ink';
  const trackOrder = () => { setTrackOrderNumber(order.orderNumber); setActivePage('track-order'); };
  // A paid order that has not been shipped can still be cancelled, but only from My account (sign-in needed)
  const canCancel = canRequestCancel(order, storeSettings?.cancellationWindowHours ?? 0);

  return (
    <div id="order-confirmation-page" className="px-4 pb-10 lg:py-12">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Confirmation, centred on ivory at every width: a thin emerald circle with a drawn tick, the eyebrow,
            the serif title and the ornament */}
        <div className="pt-10 pb-3 text-center sag-fade lg:pt-2">
          {paid ? (
            <DrawnTick className="mx-auto h-[72px] w-[72px]" />
          ) : (
            <span className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-brand text-brand">
              <Clock className="w-7 h-7" strokeWidth={1.25} aria-hidden="true" />
            </span>
          )}
          <p className="mt-6 text-[10.5px] leading-4 font-semibold uppercase tracking-[0.24em] text-brand">{paid ? 'Order confirmed' : 'Order received'}</p>
          <h1 className="mt-2.5 font-display text-[30px] leading-[1.08] sm:text-[36px] lg:text-[44px] text-ink">
            {paid ? `Thank you${firstName ? `, ${firstName}` : ''}, it's yours` : `Thank you${firstName ? `, ${firstName}` : ''}!`}
          </h1>
          <Ornament className="mt-4" />
          <p className="mt-4 text-[13.5px] leading-5 text-ink-muted max-w-md mx-auto">
            {paid
              ? <>Order <span className="sag-num font-medium text-ink break-all">#{order.orderNumber}</span> is confirmed{order.payMode === 'cod' ? <>. Keep <span className="sag-num font-medium text-ink">{inr(order.codDue || 0)}</span> ready in cash for the delivery.</> : ' and paid.'}</>
              : 'We are confirming your payment. This page will update once it is verified.'}
          </p>
          {paid && (
            <p className="mt-1 text-[13.5px] leading-5 text-ink-muted max-w-md mx-auto">
              {order.customerEmail
                ? <>A confirmation email has been sent to <span className="text-ink break-all">{order.customerEmail}</span>.</>
                : 'A confirmation email has been sent to you.'}
            </p>
          )}
        </div>

        {/* Receipt */}
        <section className="sag-glass overflow-hidden" aria-label="Order receipt">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={blockTitle}>Order number</p>
              <p className="sag-num mt-1.5 text-[19px] leading-6 font-semibold text-ink break-all">#{order.orderNumber}</p>
              {placedAt && <p className="mt-1 text-[12px] leading-4 text-ink-muted">Placed on {placedAt}</p>}
            </div>
            <span className={`sag-badge shrink-0 mt-1 border bg-surface font-semibold ${paid ? 'border-brand-line text-brand' : 'border-sale-line text-brand'}`}>
              {paid ? 'Paid online' : order.paymentStatus || 'Payment pending'}
            </span>
          </div>

          <div className="px-4 sm:px-5 pb-4 space-y-3">
            <OrderProgress order={order} compact />

            {expectedText && (
              <p className="flex items-center gap-2.5 text-[13px] leading-[18px] text-ink">
                <span className="flex shrink-0 text-sale"><TruckIcon className="h-5 w-5" mono live={false} /></span> <span>Expected delivery by <span className="font-medium">{expectedText}</span></span>
              </p>
            )}
            {estimatedText && (
              <p className="flex items-center gap-2.5 text-[13px] leading-[18px] text-ink">
                <span className="flex shrink-0 text-sale"><TruckIcon className="h-5 w-5" mono live={false} /></span> <span>Estimated delivery by <span className="font-medium">{estimatedText}</span></span>
              </p>
            )}
          </div>

          {/* Items */}
          <div className="rounded-none! px-4 sm:px-5 py-4 border-t border-line">
            <p className={`${blockTitle} sag-num`}>{pieces} {pieces === 1 ? 'item' : 'items'} in this order</p>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-[52px] aspect-[3/4] shrink-0 overflow-hidden rounded-[4px]! bg-sunken">
                    {item.product?.images?.[0] && (
                      <img src={getCleanImageUrl(item.product.images[0], 160)} alt={item.product.name} className="w-full h-full rounded-none! object-cover object-top" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-[18px] font-medium text-ink line-clamp-2">{item.product?.name}</p>
                    <p className="mt-1 text-[12px] leading-4 text-ink-muted">
                      {item.selectedSize && !/^free ?size$/i.test(String(item.selectedSize)) ? `Size ${item.selectedSize}` : 'One size'}{item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : ''} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="sag-num text-[14px] leading-[18px] font-semibold text-ink shrink-0">{inr(item.product.price * item.quantity)}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Bill */}
          <div className="sag-num rounded-none! px-4 sm:px-5 py-4 border-t border-line space-y-2 text-[14px] leading-5 text-ink-muted">
            <p className={`${blockTitle} pb-1`}>Price details</p>
            <div className={moneyRow}><span>Subtotal</span><span className="text-ink">{inr(order.subtotal)}</span></div>
            {(order.comboDiscount || 0) > 0 && <div className={moneyRow}><span>Combo discount</span><span className="font-semibold text-accent">−{inr(order.comboDiscount || 0)}</span></div>}
            {(order.couponDiscount || 0) > 0 && <div className={moneyRow}><span>Coupon {order.couponCode}</span><span className="font-semibold text-accent">−{inr(order.couponDiscount || 0)}</span></div>}
            {(order.prepaidDiscount || 0) > 0 && <div className={moneyRow}><span>Prepaid discount</span><span className="font-semibold text-accent">−{inr(order.prepaidDiscount || 0)}</span></div>}
            <div className={moneyRow}><span>Delivery</span>{order.shippingCharge === 0 ? <span className="text-sale">Free</span> : <span className="text-ink">{inr(order.shippingCharge)}</span>}</div>
            {order.payMode === 'cod' ? (
              <>
                <div className="flex justify-between items-baseline gap-4 rounded-none! pt-3 mt-1 border-t border-line text-ink"><span className="font-medium">Order total</span><span className="font-semibold">{inr(order.finalTotal)}</span></div>
                <div className="flex justify-between gap-4 text-sm leading-5 text-ink-muted"><span>Paid online</span><span>{inr(order.codAdvance || 0)}</span></div>
                <div className="flex justify-between items-baseline gap-4 text-ink"><span className="font-display text-[21px] leading-6 font-semibold">Pay in cash on delivery</span><span className="text-[21px] leading-6 font-semibold">{inr(order.codDue || 0)}</span></div>
              </>
            ) : (
            <div className={`${moneyRow} items-baseline rounded-none! pt-3.5 mt-1 border-t border-line text-ink`}>
              <span className="font-display text-[21px] leading-6 font-semibold">{paid ? 'Total paid' : 'Total'}</span>
              <span className="text-[21px] leading-6 font-semibold">{inr(order.finalTotal)}</span>
            </div>
            )}
            {paid && order.paymentRef && <p className="text-[11.5px] leading-4 break-all">Payment ID: {order.paymentRef}</p>}
          </div>

          {/* Address (not included when the order was looked up without signing in) */}
          {(address.fullName || address.city) && (
            <div className="rounded-none! px-4 sm:px-5 py-4 border-t border-line flex gap-3 text-[13px] leading-[18px]">
              <span className="shrink-0 flex mt-0.5 text-brand"><PinIcon className="w-5 h-5" mono live={false} /></span>
              <div className="text-ink-muted min-w-0">
                <p className="font-medium text-ink">Delivering to {address.fullName}</p>
                {address.houseFlat && <p className="break-words">{[address.houseFlat, address.street, String(address.area || '').trim().toLowerCase() === String(address.street || '').trim().toLowerCase() ? '' : address.area].filter(Boolean).join(', ')}</p>}
                <p>{[address.city, address.state].filter(Boolean).join(', ')} {address.pincode}</p>
                {address.mobile && <p>Phone: {address.mobile}</p>}
              </div>
            </div>
          )}

          {order.giftNote && (
            <p className="rounded-none! px-4 sm:px-5 py-4 border-t border-line text-[13px] leading-[18px] text-ink break-words"><span className="text-ink-muted">Gift note:</span> {order.giftNote}</p>
          )}
        </section>

        {/* Main actions */}
        <div className="grid gap-2 sm:grid-cols-2">
          <button id="confirm-track-order-btn" type="button" onClick={trackOrder} className="sag-btn-primary w-full h-[54px]">
            Track order
          </button>
          <button id="confirm-continue-shopping-btn" type="button" onClick={() => navigateToCategory('All')} className="sag-btn-outline w-full h-[54px]">
            Continue shopping
          </button>
        </div>

        {/* What happens next */}
        <section className="sag-glass px-4 sm:px-5" aria-labelledby="next-steps-title">
          <h2 id="next-steps-title" className={`font-sans ${blockTitle} pt-4 pb-1`}>What happens next</h2>
          {paid && (
            <div className="sag-row font-normal border-t-0 items-start py-3">
              <Mail className="w-5 h-5 shrink-0 mt-0.5 text-sale" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block">Check your email</span>
                <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted break-words">
                  Your order confirmation{order.customerEmail ? <> was sent to <span className="break-all">{order.customerEmail}</span></> : ' was sent to you'}. Look in spam if you cannot see it.
                </span>
              </span>
            </div>
          )}
          <button type="button" onClick={trackOrder} className={`sag-row font-normal w-full items-start py-3 text-left cursor-pointer ${paid ? '' : 'border-t-0'}`}>
            <span className="shrink-0 flex mt-0.5 text-sale"><TruckIcon className="w-5 h-5" mono live={false} /></span>
            <span className="min-w-0 flex-1">
              <span className="block">Follow your order</span>
              <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted">Every update shows on the tracking page. Keep your order number handy.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { setActivePage('return-policy'); window.scrollTo(0, 0); }} className="sag-row font-normal w-full items-start py-3 text-left cursor-pointer">
            <span className="shrink-0 flex mt-0.5 text-sale"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
            <span className="min-w-0 flex-1">
              <span className="block">7-day returns & exchange</span>
              <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted">If something is not right after delivery, ask for a return or a size exchange.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about my order #${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" className="sag-row font-normal items-start py-3">
            <WhatsAppIcon mono className="w-5 h-5 shrink-0 mt-0.5 text-sale" />
            <span className="min-w-0 flex-1">
              <span className="block">Need help? Chat on WhatsApp</span>
              <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted">Send us your order number and we will take it from there.</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
          </a>
        </section>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={shareOrder} className="sag-btn-outline w-full h-12 gap-2 sm:last:col-span-2">
            <Send className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> Send order details
          </button>
          {(paid || order.paymentStatus === 'Refunded') && Boolean(address.fullName) && (
            <button type="button" onClick={() => setShowReceipt(true)} className="sag-btn-outline w-full h-12 gap-2">
              <FileText className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> View / print receipt
            </button>
          )}
        </div>

        {canCancel && (
          <div className="text-center">
            <button type="button" onClick={() => { navigate('/account?tab=orders'); window.scrollTo(0, 0); }} className="sag-link min-h-11 text-[12.5px]">Need to cancel this order?</button>
            <p className="text-[11.5px] leading-4 text-ink-muted">
              {user ? 'You can ask to cancel it from My account → Orders.' : 'Sign in with the email used for this order, then open My account → Orders.'}
            </p>
          </div>
        )}

        {paid && nextCoupons.length > 0 && (
          <section className="sag-glass p-4 sm:p-5 space-y-3" aria-label="Coupons for your next order">
            <h2 className={`font-sans ${blockTitle}`}>For your next order</h2>
            <ul className="space-y-2">
              {nextCoupons.map((coupon) => (
                <li key={coupon.id} className="flex items-center justify-between gap-3 border border-dashed border-[color:var(--sag-champagne)] bg-surface pl-3.5 pr-2 py-2">
                  <div className="min-w-0">
                    <p className="sag-caps font-display text-[18px] leading-6 font-semibold tracking-[0.06em] text-brand break-all">{String(coupon.code).toUpperCase()}</p>
                    <p className="sag-num text-[13px] leading-[18px] text-ink-muted">
                      {coupon.discountType === 'fixed' ? `₹${coupon.discountValue} off` : `${coupon.discountValue}% off`}
                      {coupon.minOrderValue ? ` on orders above ₹${coupon.minOrderValue.toLocaleString('en-IN')}` : ''}
                      {coupon.expiryDate ? ` · till ${new Date(coupon.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(String(coupon.code).toUpperCase()).then(() => showToast(`Copied ${String(coupon.code).toUpperCase()}`, 'success')).catch(() => {})}
                    className="sag-link min-h-11 shrink-0 gap-1.5 px-2 text-[12.5px]"
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
          <section className="pt-8 space-y-6" aria-labelledby="also-like-title">
            <SectionTitle id="also-like-title" title="You may also like" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-4 lg:gap-y-6">
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
