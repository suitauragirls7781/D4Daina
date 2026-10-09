import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
import { ordersApi } from '../lib/api';
import { AlertCircle, ChevronRight, ExternalLink, Loader2, Phone, Share2 } from 'lucide-react';
import { trackingLinkFor } from '../utils/courier';
import { PinIcon, ReturnIcon } from './StoreIcons';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl } from '../utils/imageHelper';
import { CourierCard, DeliveryAgentCard, OrderProgress, OrderWithRequests, StatusHistory, StatusPill, canRequestCancel, formatDateTime, formatWindowEnd, latestUpdate } from './OrderProgress';
import { ReturnRequestForm, canStartReturn } from './ReturnRequestForm';
import { SectionTitle } from './SectionTitle';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  razorpay: 'Online payment (Razorpay)',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
};

/** Tracking link without the customer's email or phone (whoever opens it enters their own details). */
const trackingLinkOf = (orderNumber: string) => `${window.location.origin}/track-order?order=${encodeURIComponent(orderNumber)}`;

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
  const { storeSettings } = useAdmin();
  const { navigate } = useRouter();

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
  // A paid order that has not been shipped can still be cancelled, but only from My account (sign-in needed)
  const canCancel = order ? canRequestCancel(order, storeSettings?.cancellationWindowHours ?? 0) : false;

  // The courier's own tracking page, only when the order really has one
  const courierLink = order ? trackingLinkFor(order) : null;
  const copyAwbForCourier = () => {
    const awb = String(order?.trackingNumber || '').trim();
    // The courier's page takes no number in its link: copy it so the customer can paste it there
    if (!courierLink || courierLink.hasAwb || !awb || !navigator.clipboard) return;
    navigator.clipboard.writeText(awb).then(() => showToast('AWB number copied. Paste it on the courier page.', 'success')).catch(() => {});
  };

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

  const cardTitle = 'font-display text-[22px] leading-7 font-semibold text-ink';
  const fieldLabel = 'sag-label mb-1.5 block text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-ink-muted';
  const eyebrow = 'text-[10.5px] leading-4 font-semibold uppercase tracking-[0.2em] text-sale';
  const moneyRow = 'flex justify-between gap-3';

  return (
    <div className="min-h-[70vh] px-4 pt-7 pb-16 sm:py-12">
      <div className="max-w-2xl mx-auto space-y-5">
        <SectionTitle as="h1" eyebrow="Orders" title="Track your order" sub="Enter the order number from your confirmation email." className="pb-2" />

        <form
          onSubmit={(e) => { e.preventDefault(); search(orderQuery, contactQuery); }}
          className="sag-glass p-4 sm:p-5 grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="track-order-number" className={fieldLabel}>Order number</label>
            <input
              id="track-order-number"
              name="orderNumber"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value.toUpperCase())}
              placeholder="SAG-260928-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className="sag-input sag-num"
            />
          </div>
          <div>
            <label htmlFor="track-order-contact" className={fieldLabel}>Email or mobile{user ? ' (optional)' : ''}</label>
            <input
              id="track-order-contact"
              name="contact"
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="sag-input"
            />
            {!user && <p className="mt-1.5 text-[11.5px] leading-4 text-ink-muted">The one you used when ordering.</p>}
          </div>
          <button type="submit" disabled={isSearching} className="sag-btn-primary w-full gap-2 sm:col-span-2">
            {isSearching && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{isSearching ? 'Looking up your order…' : 'Track order'}</span>
          </button>
        </form>

        {error && (
          <div role="alert" className="rounded-[10px] border border-danger-line bg-surface px-3.5 py-3 text-sm leading-5 text-danger flex items-start gap-2">
            <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!order && !isSearching && (
          <div className="sag-glass px-4">
            <div className="sag-row font-normal min-h-14 items-start py-3">
              <span className="min-w-0">
                <span className="block">Where is my order number?</span>
                <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted">It starts with “SAG-” and is in your order confirmation email.</span>
              </span>
            </div>
            <button type="button" onClick={() => setActivePage(user ? 'account' : 'login')} className="sag-row font-normal min-h-14 w-full py-3 text-left cursor-pointer">
              <span className="min-w-0 flex-1">
                <span className="block">{user ? 'See all your orders' : 'Have an account?'}</span>
                <span className="block font-normal text-[11.5px] leading-4 mt-0.5 text-ink-muted">
                  {user ? 'Every order you placed is in My account.' : 'Sign in to see every order in My account.'}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        )}

        {order && (
          <div className="flex flex-col gap-5">
            {/* At every width: the status box and timeline, the items, the two buttons, then updates and help */}
            <section className="order-1 space-y-3 sag-fade" aria-labelledby="tracked-order-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={eyebrow}>Order</p>
                  <h2 id="tracked-order-title" className="sag-num mt-1 font-sans text-[17px] leading-6 font-semibold text-ink break-all">#{order.orderNumber}</h2>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">
                    Placed {formatDateTime(order.date)} · {pieces} {pieces === 1 ? 'item' : 'items'}
                  </p>
                  <StatusPill order={order} className="mt-2" />
                </div>
                <button
                  type="button"
                  onClick={share}
                  aria-label="Share tracking link"
                  className="shrink-0 inline-flex min-h-11 items-center gap-1.5 text-[10.5px] leading-none font-semibold uppercase tracking-[0.16em] text-brand underline underline-offset-4 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> Share
                </button>
              </div>

              <OrderProgress order={order} />
            </section>

            <div className="order-3 flex gap-2.5">
              {courierLink && (
                <a
                  href={courierLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={courierLink.label}
                  onClick={copyAwbForCourier}
                  className="sag-btn-primary flex-1 min-w-0 px-3 gap-2"
                >
                  Courier tracking <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                </a>
              )}
              <a
                href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with order ${order.orderNumber}.`)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Help on WhatsApp"
                className="sag-btn-outline flex-1 min-w-0 px-3 gap-2"
              >
                Help
              </a>
            </div>

            <section className="order-4 space-y-3 empty:hidden" aria-label="Order updates">
              {latest && (
                <div className="sag-glass sag-glass-strong px-4 py-3.5 text-[13px] leading-[18px]">
                  <p className={eyebrow}>Latest update</p>
                  <p className="mt-1 text-ink">
                    <span className="font-medium">{latest.label}</span>
                    <span className="text-ink-muted"> · {formatDateTime(latest.at)}</span>
                  </p>
                  {order.customerNote && <p className="mt-1 text-ink break-words">{order.customerNote}</p>}
                </div>
              )}

              <CourierCard order={order} />

              <DeliveryAgentCard order={order} />

              <StatusHistory order={order} />
            </section>

            {isOwner && canStartReturn(order) && (
              <section className="order-5 sag-glass p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="hidden sm:flex shrink-0 text-sale"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[20px] leading-6 font-semibold text-ink">Not the right fit?</p>
                  <p className="text-[13px] leading-[18px] text-ink-muted">
                    Ask for a return or a size exchange{formatWindowEnd(order.returnEligibility?.windowEndsAt) ? ` by ${formatWindowEnd(order.returnEligibility?.windowEndsAt)}` : ' within 7 days of delivery'}.
                  </p>
                </div>
                <button type="button" onClick={() => setReturnOpen(true)} className="sag-btn-outline h-11 px-4">
                  Return / exchange
                </button>
              </section>
            )}

            <section className="order-2 sag-glass p-4 sm:p-6 space-y-4" aria-labelledby="tracked-items-title">
              <h3 id="tracked-items-title" className={cardTitle}>Items in this order</h3>
              <ul className="divide-y divide-line">
                {order.items.map((item, index) => {
                  const image = item.product?.images?.[0] || (item.product as { image?: string })?.image || '';
                  const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
                  return (
                    <li key={item.id || index} className="flex items-start gap-[13px] py-3 first:pt-0 last:pb-0">
                      <span className="w-[62px] aspect-[4/5] shrink-0 overflow-hidden rounded-lg bg-sunken">
                        {image && <img src={getCleanImageUrl(image, 160)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-[18px] text-ink line-clamp-2">{item.product?.name}</p>
                        <p className="mt-1 text-[11.5px] leading-4 text-ink-muted">{item.selectedSize && !/^free ?size$/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour} · Qty {item.quantity}</p>
                      </div>
                      <p className="sag-num text-sm leading-5 font-medium text-ink shrink-0">{inr((Number(item.product?.price) || 0) * (Number(item.quantity) || 1))}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="sag-num pt-4 border-t border-line space-y-2 text-[13.5px] leading-5 text-ink-muted" aria-label="Price details">
                {Number(order.subtotal) > 0 && <div className={moneyRow}><span>Subtotal</span><span className="text-ink">{inr(order.subtotal)}</span></div>}
                {(order.comboDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Combo discount</span><span>−{inr(order.comboDiscount || 0)}</span></div>}
                {(order.couponDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Coupon{order.couponCode ? ` ${order.couponCode}` : ''}</span><span>−{inr(order.couponDiscount || 0)}</span></div>}
                {(order.prepaidDiscount || 0) > 0 && <div className={`${moneyRow} text-sale`}><span>Prepaid discount</span><span>−{inr(order.prepaidDiscount || 0)}</span></div>}
                {!(order.comboDiscount || order.couponDiscount || order.prepaidDiscount) && (order.discountAmount || 0) > 0 && (
                  <div className={`${moneyRow} text-sale`}><span>Discount</span><span>−{inr(order.discountAmount)}</span></div>
                )}
                {Number(order.subtotal) > 0 && (
                  <div className={moneyRow}><span>Shipping</span>{Number(order.shippingCharge) > 0 ? <span className="text-ink">{inr(order.shippingCharge)}</span> : <span className="text-sale">Free</span>}</div>
                )}
                {order.payMode === 'cod' ? (
              <>
                <div className="flex justify-between items-baseline gap-4 pt-3 mt-1 border-t border-line text-ink"><span className="font-medium">Order total</span><span className="font-semibold">{inr(order.finalTotal)}</span></div>
                <div className="flex justify-between gap-4 text-sm leading-5 text-ink-muted"><span>Paid online</span><span>{inr(order.codAdvance || 0)}</span></div>
                <div className="flex justify-between items-baseline gap-4 text-ink"><span className="text-[15px] leading-[22px] font-semibold">Pay in cash on delivery</span><span className="text-[17px] leading-6 font-semibold">{inr(order.codDue || 0)}</span></div>
              </>
            ) : (
                <div className={`${moneyRow} items-baseline pt-3 mt-1 border-t border-line text-ink`}>
                  <span className="text-[15px] leading-[22px] font-semibold">{paid ? 'Total paid' : 'Order total'}</span>
                  <span className="text-[17px] leading-6 font-semibold">{inr(order.finalTotal)}</span>
                </div>
                )}
                <div className={`${moneyRow} text-[11.5px] leading-4`}>
                  <span>Payment</span>
                  <span className="text-right text-ink">
                    {order.paymentMethod ? `${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod} · ` : ''}
                    {paid ? 'Paid' : order.paymentStatus === 'Refunded' ? 'Refunded' : order.paymentStatus || 'Payment pending'}
                  </span>
                </div>
              </div>
              {address && (address.fullName || address.city) && (
                <div className="flex gap-3 pt-4 border-t border-line text-[13px] leading-[18px]">
                  <span className="shrink-0 flex mt-0.5 text-sale"><PinIcon className="w-5 h-5" mono live={false} /></span>
                  <div className="min-w-0 text-ink-muted">
                    <p className="font-medium text-ink">Delivering to {address.fullName}</p>
                    {[address.houseFlat, address.street, address.area].filter(Boolean).length > 0 && <p className="break-words">{[address.houseFlat, address.street, address.area].filter(Boolean).join(', ')}</p>}
                    <p>{`${[address.city, address.state].filter(Boolean).join(', ')} ${address.pincode || ''}`.trim()}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="order-6 sag-glass p-4 sm:p-5 space-y-3" aria-label="Help with this order">
              <div>
                <p className="font-display text-[20px] leading-6 font-semibold text-ink">Need help with this order?</p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Share your order number and we will take it from there.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <a
                  href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with order ${order.orderNumber}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sag-btn-outline h-12 px-3 gap-2"
                >
                  Chat on WhatsApp
                </a>
                <a href={`tel:+91${SUPPORT_PHONE}`} className="sag-btn-outline sag-num h-12 px-3 gap-2">
                  <Phone className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
                </a>
                {user ? (
                  <button type="button" onClick={() => setActivePage('account')} className="sag-btn-outline h-12 px-3">
                    All my orders
                  </button>
                ) : (
                  <button type="button" onClick={() => setActivePage('contact')} className="sag-btn-outline h-12 px-3">
                    Contact us
                  </button>
                )}
              </div>
              {canCancel && (
                <div>
                  <button type="button" onClick={() => { navigate('/account?tab=orders'); window.scrollTo(0, 0); }} className="sag-link text-[12.5px]">Need to cancel this order?</button>
                  <p className="text-[11.5px] leading-4 text-ink-muted">
                    {user ? 'You can ask to cancel it from My account → Orders.' : 'Sign in with the email used for this order, then open My account → Orders.'}
                  </p>
                </div>
              )}
            </section>
          </div>
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
