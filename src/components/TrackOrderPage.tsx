import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ordersApi } from '../lib/api';
import { AlertCircle, Loader2, Phone, Search, Share2 } from 'lucide-react';
import { HelpIcon, OrdersIcon, PackageIcon, PinIcon, ReturnIcon } from './StoreIcons';
import { WhatsAppIcon } from './BrandIcons';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl } from '../utils/imageHelper';
import { CourierCard, DeliveryAgentCard, OrderProgress, OrderWithRequests, StatusHistory, StatusPill, formatDateTime, formatWindowEnd, latestUpdate } from './OrderProgress';
import { ReturnRequestForm, canStartReturn } from './ReturnRequestForm';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  razorpay: 'Online payment (Razorpay)',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
};

/** Tracking link without the customer's email or phone (whoever opens it enters their own details). */
const trackingLinkOf = (orderNumber: string) => `${window.location.origin}/track-order?order=${encodeURIComponent(orderNumber)}`;
const fieldClass = 'w-full h-12 px-4 bg-[#FBF7F3] border border-[#4B1D3F]/20 focus:border-[#4B1D3F]/60 rounded-full text-sm text-[#2A1A26] focus:outline-none';

/** The email saved at checkout for this browser tab's last order (see CheckoutPage), when it is that order. */
const savedContactFor = (orderNumber: string) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('sag_last_order') || 'null');
    return saved?.orderNumber && orderNumber && String(saved.orderNumber).toUpperCase() === orderNumber.trim().toUpperCase() ? String(saved.contact || '') : '';
  } catch {
    return '';
  }
};

export const TrackOrderPage: React.FC = () => {
  const { trackOrderNumber, confirmedOrder, setActivePage, showToast } = useShop();
  const { user } = useAuth();

  const [orderQuery, setOrderQuery] = useState(trackOrderNumber || confirmedOrder?.orderNumber || '');
  const [contactQuery, setContactQuery] = useState(() => confirmedOrder?.customerEmail || savedContactFor(trackOrderNumber || confirmedOrder?.orderNumber || ''));
  const [order, setOrder] = useState<OrderWithRequests | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);

  const search = async (orderNumber: string, contact: string) => {
    const cleanOrder = orderNumber.trim().toUpperCase();
    if (!cleanOrder) {
      setError('Enter your order number.');
      return;
    }
    if (!user && !contact.trim()) {
      setError('Enter the email or mobile number used when ordering.');
      return;
    }
    setIsSearching(true);
    setError('');
    try {
      const result = await ordersApi<{ order: OrderWithRequests }>('track', { orderNumber: cleanOrder, contact: contact.trim() });
      setOrder(result.order);
    } catch (err: any) {
      setOrder(null);
      setError(err?.message || 'Could not look up that order. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('order') || params.get('order_id') || params.get('orderNumber') || '';
    const contact = params.get('email') || params.get('mobile') || params.get('phone') || '';
    const initialOrder = fromUrl || trackOrderNumber || confirmedOrder?.orderNumber || '';
    const initialContact = contact || confirmedOrder?.customerEmail || savedContactFor(initialOrder);
    if (fromUrl) setOrderQuery(fromUrl);
    if (initialContact) setContactQuery((current) => current || initialContact);
    if (initialOrder && (user || initialContact)) search(initialOrder, initialContact);
  }, [user?.email]);

  // Only the signed-in owner gets the full view (address, return eligibility) from the server; the return
  // card also needs the customer's own sign-in (not an admin session), since the request is sent as them.
  const signedInEmail = String(user?.email || '').trim().toLowerCase();
  const isOwner = Boolean(order?.returnEligibility) && Boolean(signedInEmail) && signedInEmail === String(order?.customerEmail || '').trim().toLowerCase();
  const latest = order ? latestUpdate(order) : null;
  const address = isOwner ? order?.deliveryAddress : null;
  const pieces = order ? order.items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) : 0;
  const paid = order?.paymentStatus === 'Paid';

  const share = async () => {
    if (!order) return;
    const url = trackingLinkOf(order.orderNumber);
    const text = `Track Suit Aura Girls order #${order.orderNumber}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Track your order', text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Tracking link copied.', 'success');
    } catch {
      showToast(`Could not copy. The link is ${url}`, 'info');
    }
  };

  return (
    <div className="bg-[#FBF7F3] min-h-[70vh] py-8 sm:py-14 px-4">
      <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
        <div className="text-center">
          <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#F3EEF8] flex items-center justify-center"><OrdersIcon className="w-7 h-7" /></span>
          <p className="sag-eyebrow">Order status</p>
          <h1 className="mt-2 font-serif text-4xl sm:text-5xl leading-none text-[#4B1D3F]">Track your order</h1>
          <p className="mt-3 text-sm text-[#2A1A26]/70">Enter the order number from your confirmation email.</p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); search(orderQuery, contactQuery); }}
          className="sag-card rounded-3xl p-4 sm:p-6 grid gap-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-[#2A1A26]/70 pl-1">Order number</span>
            <input
              id="track-order-number"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value.toUpperCase())}
              placeholder="SAG-260928-XXXXX"
              autoComplete="off"
              className={`${fieldClass} font-mono`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-[#2A1A26]/70 pl-1">Email or mobile{user ? ' (optional)' : ''}</span>
            <input
              id="track-order-contact"
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            disabled={isSearching}
            className="sag-btn-primary h-12 px-7 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Search className="w-4 h-4 text-current" />}
            <span>Track</span>
          </button>
        </form>

        {error && (
          <div role="alert" className="rounded-2xl p-4 border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {!order && !isSearching && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#4B1D3F]/10 bg-white/70 p-4 flex gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><HelpIcon className="w-5 h-5" live={false} /></span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#2A1A26]">Where is my order number?</p>
                <p className="mt-0.5 text-[#2A1A26]/70 leading-relaxed">It starts with “SAG-” and is in your order confirmation email.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#4B1D3F]/10 bg-white/70 p-4 flex gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><OrdersIcon className="w-5 h-5" live={false} /></span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#2A1A26]">{user ? 'See all your orders' : 'Have an account?'}</p>
                <p className="mt-0.5 text-[#2A1A26]/70 leading-relaxed">
                  {user ? 'Every order you placed is in ' : 'Sign in to see every order in '}
                  <button type="button" onClick={() => setActivePage(user ? 'account' : 'login')} className="font-semibold text-[#4B1D3F] underline underline-offset-4 decoration-[#4B1D3F]/30 hover:decoration-[#4B1D3F] cursor-pointer">My account</button>.
                </p>
              </div>
            </div>
          </div>
        )}

        {order && (
          <>
            <section className="sag-card rounded-3xl p-5 sm:p-7 space-y-5 sag-fade" aria-labelledby="tracked-order-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2A1A26]/55">Order</p>
                  <h2 id="tracked-order-title" className="mt-0.5 text-lg sm:text-xl text-[#2A1A26] break-all">
                    <span className="font-sans font-semibold tracking-wide">#{order.orderNumber}</span>
                  </h2>
                  <p className="text-xs text-[#2A1A26]/60 mt-0.5">
                    Placed {formatDateTime(order.date)} · {pieces} {pieces === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill order={order} className="text-xs px-3 py-1" />
                  <button
                    type="button"
                    onClick={share}
                    aria-label="Share tracking link"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#4B1D3F]/15 text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
                  </button>
                </div>
              </div>

              {latest && (
                <div className="rounded-2xl bg-[#F3EEF8] px-4 py-3.5 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Latest update</p>
                  <p className="mt-0.5 text-[#2A1A26]">
                    <span className="font-semibold text-[#4B1D3F]">{latest.label}</span>
                    <span className="text-[#2A1A26]/65"> · {formatDateTime(latest.at)}</span>
                  </p>
                  {order.customerNote && <p className="mt-1 text-[#2A1A26]/80 break-words">{order.customerNote}</p>}
                </div>
              )}

              <OrderProgress order={order} />

              <CourierCard order={order} />

              <DeliveryAgentCard order={order} />

              <StatusHistory order={order} />
            </section>

            {isOwner && canStartReturn(order) && (
              <section className="sag-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <span className="w-11 h-11 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center">
                  <ReturnIcon className="w-6 h-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-xl text-[#2A1A26]">Not the right fit?</p>
                  <p className="text-sm text-[#2A1A26]/70">
                    Ask for a return or a size exchange{formatWindowEnd(order.returnEligibility?.windowEndsAt) ? ` by ${formatWindowEnd(order.returnEligibility?.windowEndsAt)}` : ' within 7 days of delivery'}.
                  </p>
                </div>
                <button type="button" onClick={() => setReturnOpen(true)} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
                  Return / exchange
                </button>
              </section>
            )}

            <section className="sag-card rounded-3xl p-5 sm:p-7 space-y-5" aria-labelledby="tracked-items-title">
              <h3 id="tracked-items-title" className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full bg-[#F3EEF8] flex items-center justify-center"><PackageIcon className="w-5 h-5" live={false} /></span>
                <span className="font-serif text-2xl leading-none text-[#2A1A26]">Items in this order</span>
              </h3>
              <ul className="divide-y divide-[#4B1D3F]/10">
                {order.items.map((item, index) => {
                  const image = item.product?.images?.[0] || (item.product as { image?: string })?.image || '';
                  const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
                  return (
                    <li key={item.id || index} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                      <span className="w-16 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] border border-[#4B1D3F]/10">
                        {image && <img src={getCleanImageUrl(image, 160)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#2A1A26] leading-snug line-clamp-2">{item.product?.name}</p>
                        <p className="mt-1 text-xs text-[#2A1A26]/65">{item.selectedSize && !/^free ?size$/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour} · Qty {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-[#2A1A26] shrink-0 tabular-nums">{inr((Number(item.product?.price) || 0) * (Number(item.quantity) || 1))}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/10 p-4 space-y-2 text-sm text-[#2A1A26]/75" aria-label="Price details">
                {Number(order.subtotal) > 0 && <div className="flex justify-between"><span>Subtotal</span><span className="text-[#2A1A26]">{inr(order.subtotal)}</span></div>}
                {(order.comboDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Combo discount</span><span>−{inr(order.comboDiscount || 0)}</span></div>}
                {(order.couponDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Coupon{order.couponCode ? ` ${order.couponCode}` : ''}</span><span>−{inr(order.couponDiscount || 0)}</span></div>}
                {(order.prepaidDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Prepaid discount</span><span>−{inr(order.prepaidDiscount || 0)}</span></div>}
                {!(order.comboDiscount || order.couponDiscount || order.prepaidDiscount) && (order.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-800"><span>Discount</span><span>−{inr(order.discountAmount)}</span></div>
                )}
                {Number(order.subtotal) > 0 && <div className="flex justify-between"><span>Shipping</span><span className="text-[#2A1A26]">{Number(order.shippingCharge) > 0 ? inr(order.shippingCharge) : 'Free'}</span></div>}
                <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-[#4B1D3F]/10 text-[#2A1A26]">
                  <span className="font-medium">{paid ? 'Total paid' : 'Order total'}</span>
                  <span className="font-serif font-semibold text-2xl leading-none text-[#4B1D3F] tabular-nums lining-nums">{inr(order.finalTotal)}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs pt-1">
                  <span>Payment</span>
                  <span className="text-right text-[#2A1A26]">
                    {order.paymentMethod ? `${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod} · ` : ''}
                    {paid ? 'Paid' : order.paymentStatus === 'Refunded' ? 'Refunded' : order.paymentStatus || 'Payment pending'}
                  </span>
                </div>
              </div>
              {address && (address.fullName || address.city) && (
                <div className="flex gap-3 text-sm pt-1">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><PinIcon className="w-5 h-5" live={false} /></span>
                  <div className="min-w-0 text-[#2A1A26]/75 leading-relaxed">
                    <p className="font-medium text-[#2A1A26]">Delivering to {address.fullName}</p>
                    {[address.houseFlat, address.street, address.area].filter(Boolean).length > 0 && <p>{[address.houseFlat, address.street, address.area].filter(Boolean).join(', ')}</p>}
                    <p>{`${[address.city, address.state].filter(Boolean).join(', ')} ${address.pincode || ''}`.trim()}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-[#4B1D3F]/12 bg-white/70 p-5 sm:p-6 space-y-4" aria-label="Help with this order">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 shrink-0 rounded-full bg-[#F3EEF8] flex items-center justify-center"><HelpIcon className="w-6 h-6" /></span>
                <div className="min-w-0">
                  <p className="font-serif text-2xl leading-tight text-[#2A1A26]">Need help with this order?</p>
                  <p className="text-sm text-[#2A1A26]/65">Share your order number and we will take it from there.</p>
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <a
                  href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with order ${order.orderNumber}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sag-btn-outline h-11 px-4 text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2"
                >
                  <WhatsAppIcon className="w-4 h-4" aria-hidden="true" /> WhatsApp us
                </a>
                <a href={`tel:+91${SUPPORT_PHONE}`} className="sag-btn-outline h-11 px-4 text-xs font-semibold tracking-[0.06em] inline-flex items-center justify-center gap-2">
                  <Phone className="w-4 h-4 text-current" aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
                </a>
                {user ? (
                  <button type="button" onClick={() => setActivePage('account')} className="sag-btn-primary h-11 px-4 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
                    All my orders
                  </button>
                ) : (
                  <button type="button" onClick={() => setActivePage('contact')} className="sag-btn-outline h-11 px-4 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
                    Contact us
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {order && returnOpen && (
        <ReturnRequestForm
          order={order}
          onClose={() => setReturnOpen(false)}
          onPolicy={() => { setReturnOpen(false); setActivePage('return-policy'); }}
          onDone={(message, updated) => {
            setReturnOpen(false);
            if (updated) setOrder(updated);
            showToast(message, 'success');
          }}
        />
      )}
    </div>
  );
};
