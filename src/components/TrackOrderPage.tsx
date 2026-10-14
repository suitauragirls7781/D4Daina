import React, { useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
import { ordersApi } from '../lib/api';
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, ExternalLink, Loader2, Phone, Share2 } from 'lucide-react';
import { trackingLinkFor } from '../utils/courier';
import { PinIcon, ReturnIcon } from './StoreIcons';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl } from '../utils/imageHelper';
import { CourierCard, DeliveryAgentCard, OrderProgress, OrderWithRequests, StatusHistory, StatusPill, canRequestCancel, formatDateTime, formatWindowEnd, latestUpdate } from './OrderProgress';
import { ReturnRequestForm, canStartReturn } from './ReturnRequestForm';
import { AuraTitle, Icon, useArrive } from '../aura';

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
  // Presentation only: once an order is on the page the lookup form steps aside (one tap brings it back), so the
  // answer, not the form, is what a phone's first screen shows. `tries` replays the refusal on a repeated miss.
  const [editing, setEditing] = useState(false);
  const [tries, setTries] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

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
      setEditing(false);
    } catch (err: any) {
      setOrder(null);
      setTries((count) => count + 1);
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

  // A found order is shown from the top of the page, its parts arriving one after another; its number takes the
  // keyboard and screen-reader focus so the answer is read out
  const foundKey = order ? `${order.orderNumber}|${order.status}` : '';
  useEffect(() => {
    if (!foundKey) return;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    titleRef.current?.focus({ preventScroll: true });
  }, [foundKey]);
  useArrive(resultRef, foundKey);
  const compact = Boolean(order) && !editing;

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

  const cardTitle = 'text-[22px] leading-7 font-extrabold tracking-[-0.025em] text-ink';
  const moneyRow = 'flex justify-between gap-3';
  // On a phone the parts follow one another by their order-N; on desktop they sit in two columns
  const column = 'contents min-[900px]:flex min-[900px]:min-w-0 min-[900px]:flex-col min-[900px]:gap-4';

  return (
    <section data-th="sand" className="clay-pg aa-cen">
      <div className="aa-cen-in">
        <AuraTitle as="h1" label="Orders" title="Track your" accent="order" sub="Enter the order number from your confirmation email." className={compact ? 'sr-only' : ''} />

        <div className={`min-w-0 space-y-3 min-[900px]:mt-0 ${compact ? 'min-[900px]:col-span-2' : 'mt-6'}`}>
          {compact && (
            <button type="button" onClick={() => { setEditing(true); window.setTimeout(() => document.getElementById('track-order-number')?.focus(), 60); }} className="aura-lk -mt-3 text-[14px]">
              <ArrowLeft strokeWidth={1.6} aria-hidden="true" />
              <span>Track another order</span>
            </button>
          )}
          <form
            hidden={compact}
            onSubmit={(e) => { e.preventDefault(); search(orderQuery, contactQuery); }}
            className={`aura-card aura-blk space-y-3 px-4 pt-5 pb-[22px] sm:px-7 sm:pt-7 sm:pb-8${editing ? ' aco-open' : ''}`}
          >
            <label className="aura-field" htmlFor="track-order-number">
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
                className="aura-num"
              />
              <span>Order number</span>
              <i />
            </label>
            <div>
              <label className="aura-field" htmlFor="track-order-contact">
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
                />
                <span>Email or mobile{user ? ' (optional)' : ''}</span>
                <i />
              </label>
              {!user && <p className="mt-1.5 px-1 text-[13px] leading-[18px] text-ink-muted">The one you used when ordering.</p>}
            </div>
            <button type="submit" disabled={isSearching} className="aura-btn aura-btn-w">
              {isSearching && <Loader2 className="animate-spin" aria-hidden="true" />}
              <span>{isSearching ? 'Looking up your order…' : 'Track order'}</span>
              {!isSearching && <ArrowRight aria-hidden="true" />}
            </button>
          </form>

          {error && (
            <div key={tries} role="alert" className="aa-alert aa-refused">
              <AlertCircle strokeWidth={1.6} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* While the order is looked up: the shape of the answer (the ink card and the items card) */}
          {!order && isSearching && (
            <div className="aa-tsk" aria-hidden="true">
              <div><i className="w-24" /><i className="mt-4 h-8 w-4/5" /><i className="mt-6 w-3/5" /><i className="mt-5 w-2/5" /><i className="mt-5 w-1/2" /></div>
            </div>
          )}

          {!order && !isSearching && (
            <div className="space-y-2">
              <div className="aa-row cursor-default">
                <span className="aa-ic"><Icon name="box" size={20} /></span>
                <span className="aa-row-t">
                  <b>Where is my order number?</b>
                  <small>It starts with “SAG-” and is in your order confirmation email.</small>
                </span>
              </div>
              <button type="button" onClick={() => setActivePage(user ? 'account' : 'login')} className="aa-row">
                <span className="aa-ic"><Icon name="user" size={20} /></span>
                <span className="aa-row-t">
                  <b>{user ? 'See all your orders' : 'Have an account?'}</b>
                  <small>{user ? 'Every order you placed is in My account.' : 'Sign in to see every order in My account.'}</small>
                </span>
                <ChevronRight strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {order && (
        <div ref={resultRef} className={`mx-auto flex max-w-[1120px] flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:items-start min-[900px]:gap-x-[50px] ${compact ? 'mt-2 min-[900px]:mt-4' : 'mt-8 min-[900px]:mt-12'}`}>
          <div className={column}>
            {/* The order, its state in words and the timeline */}
            <section className="order-1 space-y-3" aria-labelledby="tracked-order-title">
              <div className="flex items-start justify-between gap-3 px-1" data-arr>
                <div className="min-w-0">
                  <p className="aura-lbl">Order</p>
                  <h2 id="tracked-order-title" ref={titleRef} tabIndex={-1} className="aura-h2 aura-h-sm aura-num mt-1.5 break-all focus:outline-none">#{order.orderNumber}</h2>
                  <p className="aura-num mt-1.5 text-[13.5px] leading-[18px] aura-mu">
                    Placed {formatDateTime(order.date)} · {pieces} {pieces === 1 ? 'item' : 'items'}
                  </p>
                  <StatusPill order={order} className="mt-2.5" />
                </div>
                <button type="button" onClick={share} aria-label="Share tracking link" className="aura-btn aura-btn-line aura-btn-sm shrink-0 px-4">
                  <Share2 strokeWidth={1.6} aria-hidden="true" /> Share
                </button>
              </div>

              <div data-arr><OrderProgress order={order} /></div>
            </section>

            <div className="order-3 flex gap-2.5" data-arr>
              {courierLink && (
                <a
                  href={courierLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={courierLink.label}
                  onClick={copyAwbForCourier}
                  className="aura-btn min-w-0 flex-1 px-3"
                >
                  Courier tracking <ExternalLink strokeWidth={1.6} aria-hidden="true" />
                </a>
              )}
              <a
                href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with order ${order.orderNumber}.`)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Help on WhatsApp"
                className="aura-btn aura-btn-line min-w-0 flex-1 px-3"
              >
                Help
              </a>
            </div>

            <section className="order-4 space-y-3 empty:hidden" aria-label="Order updates" data-arr>
              {latest && (
                <div className="aura-card px-4 py-4 text-[14px] leading-5">
                  <p className="aura-lbl">Latest update</p>
                  <p className="mt-1.5 text-ink">
                    <span className="text-[17px] font-extrabold tracking-[-0.02em]">{latest.label}</span>
                    <span className="aura-num text-ink-muted"> · {formatDateTime(latest.at)}</span>
                  </p>
                  {order.customerNote && <p className="mt-1 text-ink break-words">{order.customerNote}</p>}
                </div>
              )}

              <CourierCard order={order} />

              <DeliveryAgentCard order={order} />

              <StatusHistory order={order} />
            </section>
          </div>

          <div className={column}>
            <section className="order-2 aura-card aura-blk space-y-4 p-4 sm:p-6" aria-labelledby="tracked-items-title" data-arr>
              <h3 id="tracked-items-title" className={cardTitle}>Items in this order</h3>
              <ul className="divide-y divide-line">
                {order.items.map((item, index) => {
                  const image = item.product?.images?.[0] || (item.product as { image?: string })?.image || '';
                  const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
                  return (
                    <li key={item.id || index} className="flex items-start gap-[13px] py-3 first:pt-0 last:pb-0">
                      <span className="w-[62px] aspect-[4/5] shrink-0 overflow-hidden rounded-[14px] bg-sunken">
                        {image && <img src={getCleanImageUrl(image, 160)} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] leading-5 font-semibold text-ink line-clamp-2">{item.product?.name}</p>
                        <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{item.selectedSize && !/^free ?size$/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size'}{colour} · Qty {item.quantity}</p>
                      </div>
                      <p className="aura-num shrink-0 text-[15px] leading-5 font-bold text-ink">{inr((Number(item.product?.price) || 0) * (Number(item.quantity) || 1))}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="aura-num space-y-2 border-t border-line pt-4 text-[14px] leading-5 text-ink-muted" aria-label="Price details">
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
                    <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-3 text-ink"><span className="font-semibold">Order total</span><span className="font-bold">{inr(order.finalTotal)}</span></div>
                    <div className="flex justify-between gap-4 text-ink-muted"><span>Paid online</span><span>{inr(order.codAdvance || 0)}</span></div>
                    <div className="flex items-baseline justify-between gap-4 text-ink"><span className="text-[15px] leading-[22px] font-bold">Pay in cash on delivery</span><span className="text-[20px] leading-6 font-extrabold tracking-[-0.02em]">{inr(order.codDue || 0)}</span></div>
                  </>
                ) : (
                  <div className={`${moneyRow} mt-1 items-baseline border-t border-line pt-3 text-ink`}>
                    <span className="text-[15px] leading-[22px] font-bold">{paid ? 'Total paid' : 'Order total'}</span>
                    <span className="text-[20px] leading-6 font-extrabold tracking-[-0.02em]">{inr(order.finalTotal)}</span>
                  </div>
                )}
                <div className={`${moneyRow} text-[13px] leading-[18px]`}>
                  <span>Payment</span>
                  <span className="text-right text-ink">
                    {order.paymentMethod ? `${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod} · ` : ''}
                    {paid ? 'Paid' : order.paymentStatus === 'Refunded' ? 'Refunded' : order.paymentStatus || 'Payment pending'}
                  </span>
                </div>
              </div>
              {address && (address.fullName || address.city) && (
                <div className="flex gap-3 border-t border-line pt-4 text-[14px] leading-5">
                  <span className="aa-ic"><PinIcon className="w-5 h-5" mono live={false} /></span>
                  <div className="min-w-0 text-ink-muted">
                    <p className="font-bold text-ink">Delivering to {address.fullName}</p>
                    {[address.houseFlat, address.street, address.area].filter(Boolean).length > 0 && <p className="break-words">{[address.houseFlat, address.street, address.area].filter(Boolean).join(', ')}</p>}
                    <p>{`${[address.city, address.state].filter(Boolean).join(', ')} ${address.pincode || ''}`.trim()}</p>
                  </div>
                </div>
              )}
            </section>

            {isOwner && canStartReturn(order) && (
              <section className="order-5 aura-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                <span className="aa-ic hidden sm:grid"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] leading-6 font-extrabold tracking-[-0.02em] text-ink">Not the right fit?</p>
                  <p className="mt-0.5 text-[14px] leading-5 text-ink-muted">
                    Ask for a return or a size exchange{formatWindowEnd(order.returnEligibility?.windowEndsAt) ? ` by ${formatWindowEnd(order.returnEligibility?.windowEndsAt)}` : ' within 7 days of delivery'}.
                  </p>
                </div>
                <button type="button" onClick={() => setReturnOpen(true)} className="aura-btn aura-btn-line aura-btn-sm">
                  Return / exchange
                </button>
              </section>
            )}

            <section className="order-6 aura-card aura-blk space-y-3.5 p-4 sm:p-6" aria-label="Help with this order">
              <div>
                <p className={cardTitle}>Need help with this order?</p>
                <p className="mt-1 text-[14px] leading-5 text-ink-muted">Share your order number and we will take it from there.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with order ${order.orderNumber}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aura-btn aura-btn-sm"
                >
                  Chat on WhatsApp
                </a>
                <a href={`tel:+91${SUPPORT_PHONE}`} className="aura-btn aura-btn-line aura-btn-sm aura-num">
                  <Phone strokeWidth={1.6} aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
                </a>
                {user ? (
                  <button type="button" onClick={() => setActivePage('account')} className="aura-btn aura-btn-line aura-btn-sm">
                    All my orders
                  </button>
                ) : (
                  <button type="button" onClick={() => setActivePage('contact')} className="aura-btn aura-btn-line aura-btn-sm">
                    Contact us
                  </button>
                )}
              </div>
              {canCancel && (
                <div>
                  <button type="button" onClick={() => { navigate('/account?tab=orders'); window.scrollTo(0, 0); }} className="sag-link text-[14px] min-h-11">Need to cancel this order?</button>
                  <p className="text-[13px] leading-[18px] text-ink-muted">
                    {user ? 'You can ask to cancel it from My account → Orders.' : 'Sign in with the email used for this order, then open My account → Orders.'}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

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
    </section>
  );
};
