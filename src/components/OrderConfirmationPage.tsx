import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
import { ordersApi } from '../lib/api';
import { Order, Product } from '../types';
import { ChevronRight, Clock, Copy, FileText, Mail, Send } from 'lucide-react';
import { PinIcon, ReturnIcon, TruckIcon } from './StoreIcons';
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
import { SectionTitle } from './SectionTitle';
import { Icon, Odometer } from '../aura';
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
    // The shape of the page while the order is read again after a refresh: the mark, the heading, the ticket
    return (
      <div data-aura className="clay-pg px-4 pt-10 pb-16" role="status" aria-label="Loading your order">
        <div className="ocf-sk mx-auto max-w-xl" aria-hidden="true">
          <i className="h-[72px] w-[72px] rounded-full!" />
          <i className="mt-7 h-3.5 w-36" />
          <i className="mt-4 h-10 w-4/5" />
          <i className="mt-3 h-10 w-3/5" />
          <i className="mt-8 h-[190px] w-full rounded-[24px]!" />
        </div>
      </div>
    );
  }

  if (!confirmedOrder) {
    return (
      <div data-aura className="clay-pg px-4 py-16">
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <span className="kx-emptybag kx-drawn mx-auto"><Icon name="box" size={34} /></span>
          <h1 className="abag-empty-h">No recent order</h1>
          <p className="mt-3 text-[15px] leading-[1.5] text-ink-muted">You can look up any order from the Track Order page.</p>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <button type="button" onClick={() => setActivePage('shop')} className="aura-btn sm:order-2">Shop now</button>
            <button type="button" onClick={() => setActivePage('track-order')} className="aura-btn aura-btn-line">Track an order</button>
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
  const blockTitle = 'aura-lbl';
  const trackOrder = () => { setTrackOrderNumber(order.orderNumber); setActivePage('track-order'); };
  // A paid order that has not been shipped can still be cancelled, but only from My account (sign-in needed)
  const canCancel = canRequestCancel(order, storeSettings?.cancellationWindowHours ?? 0);

  const copyNumber = () => {
    if (!navigator.clipboard) { showToast(`Your order number is ${order.orderNumber}`, 'info'); return; }
    navigator.clipboard.writeText(order.orderNumber).then(() => showToast('Order number copied.', 'success')).catch(() => {});
  };
  const cod = order.payMode === 'cod';
  const place = [address.city, address.pincode].filter(Boolean).join(' ');
  // The two or three facts a shopper looks for first, each a real figure of this order
  const facts: Array<{ label: string; value: string; strong?: boolean }> = [];
  if (cod) {
    facts.push({ label: 'Paid online', value: inr(order.codAdvance || 0) });
    facts.push({ label: 'Cash on delivery', value: inr(order.codDue || 0), strong: true });
  } else {
    facts.push({ label: paid ? 'Total paid' : 'Order total', value: inr(order.finalTotal), strong: true });
  }
  if (expectedText) facts.push({ label: 'Expected delivery', value: expectedText });
  else if (estimatedText) facts.push({ label: 'Estimated delivery', value: estimatedText });
  else if (place && !cod) facts.push({ label: 'Delivering to', value: place });
  const email = order.customerEmail ? <span className="ocf-em aura-fg">{order.customerEmail}</span> : null;
  const stepRow = 'aa-row items-start py-3.5';

  return (
    <div id="order-confirmation-page" data-aura className="clay-pg">
      {/* The moment itself, on blush clay (sand while the payment is confirmed): the tick that draws
          itself, the heading, then the order as a ticket with what a shopper looks for first */}
      <section data-th={paid ? 'blush' : 'sand'} className="ocf-top" aria-labelledby="order-confirmed-title">
        <div className="ocf-in">
          <div className="min-w-0">
            {paid ? (
              <span className="ocf-mark"><i aria-hidden="true" /><DrawnTick tone="ink" className="relative h-[72px] w-[72px]" /></span>
            ) : (
              <span className="ocf-mark ocf-wait"><Clock className="h-8 w-8" strokeWidth={1.6} aria-hidden="true" /></span>
            )}
            <p className="aura-lbl mt-6">{paid ? 'Order confirmed' : 'Order received'}</p>
            <h1 id="order-confirmed-title" className="aura-h1 aura-h-lg mt-3 [overflow-wrap:anywhere]">
              {paid ? <>Thank you{firstName ? `, ${firstName}` : ''}, it's <em>yours</em></> : <>Thank <em>you</em>{firstName ? `, ${firstName}` : ''}!</>}
            </h1>
            <p className="aura-mu mt-4 max-w-md text-[15px] leading-[1.5]">
              {paid
                ? <>Your order is confirmed{cod ? <>. Keep <span className="aura-num aura-fg font-bold">{inr(order.codDue || 0)}</span> ready in cash for the delivery.</> : ' and paid.'} {email ? <>A confirmation email has been sent to {email}.</> : 'A confirmation email has been sent to you.'}</>
                : 'We are confirming your payment. This page will update once it is verified.'}
            </p>
          </div>

          <div className="min-w-0">
            <div className="ocf-tkt aura-lt" role="group" aria-label="Order summary">
              <div className="flex items-center justify-between gap-3">
                <p className="aura-lbl">Order number</p>
                <span className={`aura-tag shrink-0 ${paid ? 'aura-tag-ink' : ''}`}>
                  {paid ? (cod ? 'Advance paid' : 'Paid online') : order.paymentStatus || 'Payment pending'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 overflow-hidden text-[clamp(20px,6.4vw,28px)] leading-[1.2] font-extrabold tracking-[-0.02em] text-ink"><Odometer value={`#${order.orderNumber}`} /></p>
                <button type="button" onClick={copyNumber} aria-label="Copy order number" className="aa-ic shrink-0"><Copy className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /></button>
              </div>
              {placedAt && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Placed on {placedAt}</p>}

              <dl className="ocf-facts aura-num">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd className={fact.strong ? 'big' : ''}>{fact.value}</dd>
                  </div>
                ))}
              </dl>

              <OrderProgress order={order} compact />
            </div>

            {/* Main actions */}
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <button id="confirm-track-order-btn" type="button" onClick={trackOrder} className="aura-btn aura-btn-w">
                Track order <Icon name="arrow" />
              </button>
              <button id="confirm-continue-shopping-btn" type="button" onClick={() => navigateToCategory('All')} className="aura-btn aura-btn-line aura-btn-w">
                Continue shopping
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Its own (paper) section, so what is written outside the cards follows the colour in force while the
          blush block above is still under the reader's eye */}
      <section data-th="paper" className="ocf-body" aria-label="Order details">
        <div className="ocf-in">
          {/* What was bought, what it cost and where it goes */}
          <section className="aura-card min-w-0 overflow-hidden" aria-label="Order receipt" data-rv="card">
            <div className="px-[18px] pt-[18px] pb-4 sm:px-5 sm:pt-5">
              <p className={`${blockTitle} aura-num`}>{pieces} {pieces === 1 ? 'item' : 'items'} in this order</p>
              <ul className="mt-3">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="w-[52px] aspect-[4/5] shrink-0 overflow-hidden rounded-[12px]! bg-sunken">
                      {item.product?.images?.[0] && (
                        <img src={getCleanImageUrl(item.product.images[0], 160)} alt={item.product.name} className="w-full h-full rounded-none! object-cover object-top" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] leading-[1.3] font-semibold text-ink line-clamp-2">{item.product?.name}</p>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                        {item.selectedSize && !/^free ?size$/i.test(String(item.selectedSize)) ? `Size ${item.selectedSize}` : 'One size'}{item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : ''} · Qty {item.quantity}
                      </p>
                    </div>
                    <p className="aura-num text-[14.5px] leading-[18px] font-bold text-ink shrink-0">{inr(item.product.price * item.quantity)}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bill */}
            <div className="aura-num rounded-none! px-[18px] sm:px-5 py-4 border-t border-line space-y-2 text-[15px] leading-5 text-ink-muted">
              <p className={`${blockTitle} pb-1`}>Price details</p>
              <div className={moneyRow}><span>Subtotal</span><span className="font-semibold text-ink">{inr(order.subtotal)}</span></div>
              {(order.comboDiscount || 0) > 0 && <div className={moneyRow}><span>Combo discount</span><span className="font-semibold text-sale">−{inr(order.comboDiscount || 0)}</span></div>}
              {(order.couponDiscount || 0) > 0 && <div className={moneyRow}><span>Coupon {order.couponCode}</span><span className="font-semibold text-sale">−{inr(order.couponDiscount || 0)}</span></div>}
              {(order.prepaidDiscount || 0) > 0 && <div className={moneyRow}><span>Prepaid discount</span><span className="font-semibold text-sale">−{inr(order.prepaidDiscount || 0)}</span></div>}
              <div className={moneyRow}><span>Delivery</span>{order.shippingCharge === 0 ? <span className="font-semibold text-ink">Free</span> : <span className="font-semibold text-ink">{inr(order.shippingCharge)}</span>}</div>
              {cod ? (
                <>
                  <div className="flex justify-between items-baseline gap-4 rounded-none! pt-3 mt-1 border-t border-line text-ink"><span className="font-bold">Order total</span><span className="font-bold">{inr(order.finalTotal)}</span></div>
                  <div className="flex justify-between gap-4 text-[15px] leading-5 text-ink-muted"><span>Paid online</span><span>{inr(order.codAdvance || 0)}</span></div>
                  <div className="flex justify-between items-center gap-4 text-ink"><span className="text-[16px] leading-5 font-bold">Pay in cash on delivery</span><span className="text-[26px] leading-[30px] font-extrabold tracking-[-0.02em]">{inr(order.codDue || 0)}</span></div>
                </>
              ) : (
              <div className={`${moneyRow} items-center rounded-none! pt-3.5 mt-1 border-t border-line text-ink`}>
                <span className="text-[16px] leading-5 font-bold">{paid ? 'Total paid' : 'Total'}</span>
                <span className="text-[26px] leading-[30px] font-extrabold tracking-[-0.02em]">{inr(order.finalTotal)}</span>
              </div>
              )}
              {paid && order.paymentRef && <p className="text-[13px] leading-[18px] [overflow-wrap:anywhere]">Payment ID: {order.paymentRef}</p>}
            </div>

            {/* Address (not included when the order was looked up without signing in) */}
            {(address.fullName || address.city) && (
              <div className="rounded-none! px-[18px] sm:px-5 py-4 border-t border-line flex gap-3 text-[14.5px] leading-5">
                <span className="shrink-0 flex mt-0.5 text-ink"><PinIcon className="w-5 h-5" mono live={false} /></span>
                <div className="text-ink-muted min-w-0">
                  <p className="font-bold text-ink">Delivering to {address.fullName}</p>
                  {address.houseFlat && <p className="break-words">{[address.houseFlat, address.street, String(address.area || '').trim().toLowerCase() === String(address.street || '').trim().toLowerCase() ? '' : address.area].filter(Boolean).join(', ')}</p>}
                  <p>{[address.city, address.state].filter(Boolean).join(', ')} {address.pincode}</p>
                  {address.mobile && <p>Phone: {address.mobile}</p>}
                </div>
              </div>
            )}

            {order.giftNote && (
              <p className="rounded-none! px-[18px] sm:px-5 py-4 border-t border-line text-[14.5px] leading-5 text-ink break-words"><span className="text-ink-muted">Gift note:</span> {order.giftNote}</p>
            )}
          </section>

          <div className="min-w-0 space-y-4">
            {/* What happens next: each row is one thing the shopper can do now */}
            <section aria-labelledby="next-steps-title">
              <h2 id="next-steps-title" className="aura-h2 aura-h-sm px-1">What happens <em>next</em></h2>
              <div className="mt-3.5 space-y-2">
                {paid && (
                  <div className={`${stepRow} cursor-default`} data-rv>
                    <span className="aa-ic"><Mail className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" /></span>
                    <span className="aa-row-t">
                      <b>Check your email</b>
                      <small className="break-words">
                        Your order confirmation{order.customerEmail ? <> was sent to <span className="ocf-em">{order.customerEmail}</span></> : ' was sent to you'}. Look in spam if you cannot see it.
                      </small>
                    </span>
                  </div>
                )}
                <button type="button" onClick={trackOrder} className={stepRow} data-rv>
                  <span className="aa-ic"><TruckIcon className="w-5 h-5" mono live={false} /></span>
                  <span className="aa-row-t">
                    <b>Follow your order</b>
                    <small>Every update shows on the tracking page. Keep your order number handy.</small>
                  </span>
                  <ChevronRight className="mt-3" strokeWidth={1.6} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => { setActivePage('return-policy'); window.scrollTo(0, 0); }} className={stepRow} data-rv>
                  <span className="aa-ic"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
                  <span className="aa-row-t">
                    <b>7-day returns & exchange</b>
                    <small>If something is not right after delivery, ask for a return or a size exchange.</small>
                  </span>
                  <ChevronRight className="mt-3" strokeWidth={1.6} aria-hidden="true" />
                </button>
                <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about my order #${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" className={stepRow} data-rv>
                  <span className="aa-ic"><WhatsAppIcon mono className="w-5 h-5" /></span>
                  <span className="aa-row-t">
                    <b>Need help? Chat on WhatsApp</b>
                    <small>Send us your order number and we will take it from there.</small>
                  </span>
                  <ChevronRight className="mt-3" strokeWidth={1.6} aria-hidden="true" />
                </a>
              </div>
            </section>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={shareOrder} className="aura-btn aura-btn-line aura-btn-sm aura-btn-w sm:last:col-span-2">
                <Send className="w-[18px] h-[18px]" strokeWidth={1.6} aria-hidden="true" /> Send order details
              </button>
              {(paid || order.paymentStatus === 'Refunded') && Boolean(address.fullName) && (
                <button type="button" onClick={() => setShowReceipt(true)} className="aura-btn aura-btn-line aura-btn-sm aura-btn-w">
                  <FileText className="w-[18px] h-[18px]" strokeWidth={1.6} aria-hidden="true" /> View / print receipt
                </button>
              )}
            </div>

            {canCancel && (
              <div className="text-center">
                <button type="button" onClick={() => { navigate('/account?tab=orders'); window.scrollTo(0, 0); }} className="aura-lk text-[14px]">Need to cancel this order?</button>
                <p className="aura-mu text-[13px] leading-[18px]">
                  {user ? 'You can ask to cancel it from My account → Orders.' : 'Sign in with the email used for this order, then open My account → Orders.'}
                </p>
              </div>
            )}

            {paid && nextCoupons.length > 0 && (
              <section className="aura-card p-[18px] sm:p-5 space-y-3" aria-label="Coupons for your next order" data-rv="card">
                <h2 className="aco-sum-h font-sans">For your next order</h2>
                <ul className="space-y-2">
                  {nextCoupons.map((coupon) => (
                    <li key={coupon.id} className="flex items-center justify-between gap-3 rounded-[20px] border-[1.5px] border-dashed border-ink pl-4 pr-2 py-2">
                      <div className="min-w-0">
                        <p className="sag-caps aco-cp-code">{String(coupon.code).toUpperCase()}</p>
                        <p className="aura-num text-[13.5px] leading-[18px] text-ink-muted">
                          {coupon.discountType === 'fixed' ? `₹${coupon.discountValue} off` : `${coupon.discountValue}% off`}
                          {coupon.minOrderValue ? ` on orders above ₹${coupon.minOrderValue.toLocaleString('en-IN')}` : ''}
                          {coupon.expiryDate ? ` · till ${new Date(coupon.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(String(coupon.code).toUpperCase()).then(() => showToast(`Copied ${String(coupon.code).toUpperCase()}`, 'success')).catch(() => {})}
                        className="sag-link inline-flex items-center min-h-11 shrink-0 gap-1.5 px-2 text-[14px] font-bold"
                        aria-label={`Copy coupon ${coupon.code}`}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" /> Copy
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {suggestions.length > 0 && (
          <section className="mx-auto max-w-[1120px] pt-14 space-y-6" aria-labelledby="also-like-title">
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
      </section>
      {showReceipt && <OrderInvoice order={order} onClose={() => setShowReceipt(false)} />}
    </div>
  );
};
