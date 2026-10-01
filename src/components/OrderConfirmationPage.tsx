import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { ordersApi } from '../lib/api';
import { Order, Product } from '../types';
import { ArrowRight, Check, Copy, FileText, Loader2, Send } from 'lucide-react';
import { OrdersIcon, PinIcon, TagIcon, TruckIcon } from './StoreIcons';
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
      <div className="py-24 flex justify-center bg-[#FBF7F3]">
        <Loader2 className="w-6 h-6 animate-spin text-[#4B1D3F]" />
      </div>
    );
  }

  if (!confirmedOrder) {
    return (
      <div className="py-20 text-center bg-[#FBF7F3]">
        <div className="max-w-md mx-auto px-4 space-y-4">
          <span className="mx-auto w-20 h-20 rounded-full bg-[#F3EEF8] flex items-center justify-center"><OrdersIcon className="w-9 h-9" /></span>
          <h2 className="font-serif text-3xl text-[#4B1D3F]">No recent order</h2>
          <p className="text-sm text-[#2A1A26]/70">You can look up any order from the Track Order page.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setActivePage('track-order')} className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">Track an order</button>
            <button onClick={() => setActivePage('shop')} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">Shop now</button>
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

  return (
    <div id="order-confirmation-page" className="py-8 sm:py-14 bg-[#FBF7F3]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-5">
        {/* Hero */}
        <div className="text-center space-y-3 pb-2 sag-fade">
          <div className="relative mx-auto w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <span aria-hidden="true" className="absolute -inset-2 rounded-full border border-dashed border-emerald-200" />
            <Check className="w-9 h-9 text-emerald-700" strokeWidth={2.5} />
          </div>
          <p className="pt-2 sag-eyebrow">{paid ? 'Payment successful' : 'Order received'}</p>
          <h1 className="font-serif text-[40px] sm:text-5xl text-[#4B1D3F] leading-[1.05]">
            Thank you{order.customerName ? `, ${order.customerName.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-sm text-[#2A1A26]/70 max-w-md mx-auto">
            {paid
              ? order.customerEmail
                ? <>Your order is confirmed. A confirmation email has been sent to <span className="text-[#2A1A26] break-all">{order.customerEmail}</span>.</>
                : 'Your order is confirmed. A confirmation email has been sent to you.'
              : 'We are confirming your payment. This page will update once it is verified.'}
          </p>
        </div>

        {/* Order summary card */}
        <section className="sag-card rounded-3xl p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2A1A26]/55">Order number</p>
              <p className="mt-0.5 font-semibold text-lg sm:text-xl text-[#2A1A26] tracking-wide break-all">#{order.orderNumber}</p>
              {placedAt && <p className="text-xs text-[#2A1A26]/60 mt-0.5">Placed on {placedAt}</p>}
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-[#F7E4EA] text-[#8A2E55]'}`}>
              {paid ? 'Paid online' : order.paymentStatus || 'Payment pending'}
            </span>
          </div>

          <OrderProgress order={order} compact />

          {expectedText && (
            <p className="flex items-center gap-3 rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#2A1A26]">
              <TruckIcon className="h-5 w-5 shrink-0" live={false} /> <span>Expected delivery by <span className="font-semibold text-[#4B1D3F]">{expectedText}</span></span>
            </p>
          )}
          {estimatedText && (
            <p className="flex items-center gap-3 rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#2A1A26]">
              <TruckIcon className="h-5 w-5 shrink-0" live={false} /> <span>Estimated delivery by <span className="font-semibold text-[#4B1D3F]">{estimatedText}</span></span>
            </p>
          )}

          {/* Items */}
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2A1A26]/60 mb-3">
              <OrdersIcon className="w-4 h-4" live={false} /> {pieces} {pieces === 1 ? 'item' : 'items'} in this order
            </p>
            <ul className="divide-y divide-[#4B1D3F]/10">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                  <div className="w-16 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] border border-[#4B1D3F]/10">
                    {item.product?.images?.[0] && (
                      <img src={getCleanImageUrl(item.product.images[0], 160)} alt={item.product.name} className="w-full h-full object-cover object-top" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#2A1A26] leading-snug line-clamp-2">{item.product?.name}</p>
                    <p className="text-xs text-[#2A1A26]/65 mt-1">
                      {item.selectedSize && !/^free ?size$/i.test(String(item.selectedSize)) ? `Size ${item.selectedSize}` : 'One size'}{item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : ''} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#2A1A26] shrink-0 tabular-nums">{inr(item.product.price * item.quantity)}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Bill */}
          <div className="rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/10 p-4 space-y-2 text-sm text-[#2A1A26]/75">
            <div className="flex justify-between"><span>Subtotal</span><span className="text-[#2A1A26]">{inr(order.subtotal)}</span></div>
            {(order.comboDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Combo discount</span><span>−{inr(order.comboDiscount || 0)}</span></div>}
            {(order.couponDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Coupon {order.couponCode}</span><span>−{inr(order.couponDiscount || 0)}</span></div>}
            {(order.prepaidDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Prepaid discount</span><span>−{inr(order.prepaidDiscount || 0)}</span></div>}
            <div className="flex justify-between"><span>Shipping</span><span className="text-[#2A1A26]">{order.shippingCharge === 0 ? 'Free' : inr(order.shippingCharge)}</span></div>
            <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-[#4B1D3F]/10 text-[#2A1A26]">
              <span className="font-medium">{paid ? 'Total paid' : 'Total'}</span>
              <span className="font-serif font-semibold text-[26px] leading-none text-[#4B1D3F] tabular-nums lining-nums">{inr(order.finalTotal)}</span>
            </div>
            {paid && order.paymentRef && <p className="text-xs text-[#2A1A26]/55 pt-1 break-all">Payment ID: {order.paymentRef}</p>}
          </div>

          {/* Address (not included when the order was looked up without signing in) */}
          {(address.fullName || address.city) && (
            <div className="flex gap-3">
              <span className="w-9 h-9 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><PinIcon className="w-5 h-5" live={false} /></span>
              <div className="text-sm text-[#2A1A26]/75 leading-relaxed min-w-0">
                <p className="font-medium text-[#2A1A26]">Delivering to {address.fullName}</p>
                {address.houseFlat && <p>{[address.houseFlat, address.street, address.area].filter(Boolean).join(', ')}</p>}
                <p>{[address.city, address.state].filter(Boolean).join(', ')} {address.pincode}</p>
                {address.mobile && <p>Phone: {address.mobile}</p>}
              </div>
            </div>
          )}

          {order.giftNote && <p className="text-sm text-[#2A1A26]/70"><span className="text-[#9C7A45]">Gift note:</span> {order.giftNote}</p>}
        </section>

        {/* Actions */}
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            id="confirm-track-order-btn"
            onClick={() => { setTrackOrderNumber(order.orderNumber); setActivePage('track-order'); }}
            className="sag-btn-primary h-12 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <TruckIcon className="w-4 h-4" mono live={false} /> Track this order
          </button>
          <button
            id="confirm-continue-shopping-btn"
            onClick={() => navigateToCategory('All')}
            className="sag-btn-outline h-12 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            Continue shopping <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={shareOrder}
          className="w-full h-12 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold uppercase tracking-[0.14em] text-[#4B1D3F] inline-flex items-center justify-center gap-2 hover:bg-[#F3EEF8] cursor-pointer"
        >
          <Send className="w-4 h-4" /> Send order details
        </button>

        {paid && nextCoupons.length > 0 && (
          <section className="sag-card rounded-3xl p-5 sm:p-6 space-y-3" aria-label="Coupons for your next order">
            <p className="sag-eyebrow flex items-center gap-2"><TagIcon className="h-4 w-4" live={false} /> For your next order</p>
            <ul className="space-y-2">
              {nextCoupons.map((coupon) => (
                <li key={coupon.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#C5A46D] bg-[#FBF7F3] px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold tracking-wider text-[#4B1D3F]">{String(coupon.code).toUpperCase()}</p>
                    <p className="text-xs text-[#2A1A26]/65">
                      {coupon.discountType === 'fixed' ? `₹${coupon.discountValue} off` : `${coupon.discountValue}% off`}
                      {coupon.minOrderValue ? ` on orders above ₹${coupon.minOrderValue.toLocaleString('en-IN')}` : ''}
                      {coupon.expiryDate ? ` · till ${new Date(coupon.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(String(coupon.code).toUpperCase()).then(() => showToast(`Copied ${String(coupon.code).toUpperCase()}`, 'success')).catch(() => {})}
                    className="shrink-0 h-9 px-3 rounded-full bg-[#4B1D3F] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    aria-label={`Copy coupon ${coupon.code}`}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap justify-center gap-2 text-sm">
          <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about my order #${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/70 border border-[#4B1D3F]/10 font-medium text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors">
            <WhatsAppIcon className="w-4 h-4" /> Need help? WhatsApp us
          </a>
          {(paid || order.paymentStatus === 'Refunded') && Boolean(address.fullName) && (
            <button type="button" onClick={() => setShowReceipt(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/70 border border-[#4B1D3F]/10 font-medium text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer">
              <FileText className="w-4 h-4" /> View / print receipt
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <section className="pt-6 space-y-4" aria-labelledby="also-like-title">
            <div className="text-center">
              <p className="sag-eyebrow">Complete your wardrobe</p>
              <h2 id="also-like-title" className="mt-1 font-serif text-3xl text-[#4B1D3F]">You may also like</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
