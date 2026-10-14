import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { COLLECTIONS, emailKey, getDocById, saveDoc } from '../lib/dataStore';
import { ordersApi } from '../lib/api';
import { PendingPayment } from './PendingPayment';
import { WhatsAppIcon } from './BrandIcons';
import { CourierCard, canRequestCancel, cancelClosedNote, DeliveryAgentCard, ORDER_FILTERS, OrderFilter, OrderProgress, OrderWithRequests, ReturnProgress, StatusPill, formatDateTime, formatWindowEnd, isDelivered, latestUpdate, matchesOrderFilter, paymentFailed } from './OrderProgress';
import { isAvailable } from '../utils/smartQuery';
import { ReturnRequestForm, canStartReturn } from './ReturnRequestForm';
import { OrderInvoice, useDialogA11y } from './OrderInvoice';
import { StyleProfile, primeStylePrefs } from './StyleProfile';
import { LoginPage } from './LoginPage';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Copy, Loader2, LogOut, Mail, Search, WifiOff, X } from 'lucide-react';
import { getCleanImageUrl } from '../utils/imageHelper';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { useAdmin } from '../context/AdminContext';
import { AddressBook } from './AddressBook';
import { requestReviewFor } from './ProductReviews';
import { syncAddressBook } from '../lib/addressBook';
import type { ActivePage, CartItem, Coupon, Product, ProductColor, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { ProductCard } from './ProductCard';
import { BagIcon } from './BrandIcons';
import { HeartIcon, HelpIcon, OrdersIcon, PinIcon, ReturnIcon, SupportIcon, TagIcon, UserIcon } from './StoreIcons';
import { ReceiptIcon, StyleIcon } from './AccountIcons';
import { AuraTitle, useFlip } from '../aura';

type Tab = 'orders' | 'wishlist' | 'addresses' | 'coupons' | 'profile' | 'style' | 'returns' | 'help';

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: 'orders', label: 'Orders', icon: OrdersIcon },
  { key: 'wishlist', label: 'Wishlist', icon: HeartIcon },
  { key: 'addresses', label: 'Addresses', icon: PinIcon },
  { key: 'coupons', label: 'Coupons', icon: TagIcon },
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'style', label: 'Style profile', icon: StyleIcon },
  { key: 'returns', label: 'Returns', icon: ReturnIcon },
  { key: 'help', label: 'Help Center', icon: HelpIcon },
];
const TAB_KEYS: string[] = TABS.map((t) => t.key);

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Want a different size or colour',
  'Delivery address or phone number is wrong',
  'Found something else I prefer',
  'Other reason',
];

/** Small pill buttons inside cards (the 54px pill is for the one main action on a screen). */
const smallBtn = 'aura-btn-sm';
const sectionTitle = 'aura-h2 aura-h-md';
const noteClass = 'text-[13px] leading-[18px] text-ink-muted';
/** A bold link whose underline draws in ("My account" on a phone). */
const capsLink = 'aura-lk text-[14px]';
/** A heading inside a white card. */
const panelTitle = 'text-[22px] leading-7 font-extrabold tracking-[-0.025em] text-ink';
/** A plain label over a white field. */
const fieldLbl = 'aa-flbl';
/** A link inside running text. */
const textLink = 'font-bold text-ink underline decoration-[1.5px] underline-offset-4 cursor-pointer';
/** A white sheet over the page: from the bottom on a phone, centred from tablet width up. */
const sheet = 'bg-surface text-ink w-full max-h-[85dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] animate-in fade-in slide-in-from-bottom-5';

/** Phones open on the account menu; a link that names a tab (or /my-profile) opens that tab straight away. */
const initialMobileView = (): 'menu' | 'panel' => {
  if (typeof window === 'undefined') return 'menu';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return (tab && TAB_KEYS.includes(tab)) || window.location.pathname === '/my-profile' ? 'panel' : 'menu';
};

/** Empty / "nothing here" card used across the tabs, so every one looks the same. */
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; text: React.ReactNode; children?: React.ReactNode }> = ({ icon, title, text, children }) => (
  <div className="aura-card aura-blk px-5 py-10 text-center">
    <span className="aa-ic aa-ic-blush kx-pop mx-auto h-14 w-14">{icon}</span>
    <p className="mt-4 text-[26px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink">{title}</p>
    <p className="mt-2 text-[14.5px] leading-[21px] text-ink-muted max-w-sm mx-auto">{text}</p>
    {children && <div className="mt-5 flex flex-col sm:flex-row sm:justify-center gap-2">{children}</div>}
  </div>
);

/** Heading + one-line explanation at the top of a tab. */
const SectionIntro: React.FC<{ title: string; text?: React.ReactNode; action?: React.ReactNode }> = ({ title, text, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 px-1">
    <div className="min-w-0">
      <h2 className={sectionTitle}>{title}</h2>
      {text && <p className="aura-sub mt-2">{text}</p>}
    </div>
    {action}
  </div>
);

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "Buy again" is offered on finished orders: delivered (or returned) and cancelled ones. */
const canBuyAgain = (order: OrderWithRequests) => (isDelivered(order) || order.status === 'Cancelled') && order.items.some((item) => !item.lookParentId);
const hasReceipt = (order: OrderWithRequests) => order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded';

const initialTab = (): Tab => {
  if (typeof window === 'undefined') return 'orders';
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab && TAB_KEYS.includes(tab)) return tab as Tab;
  if (window.location.pathname === '/my-profile') return 'profile';
  return 'orders';
};

/** Asks the server to record a cancellation request; the store reviews it and refunds by hand. */
const CancelOrderDialog: React.FC<{
  order: OrderWithRequests;
  onClose: () => void;
  onDone: (message: string, updated?: OrderWithRequests) => void;
  onPolicy: () => void;
}> = ({ order, onClose, onDone, onPolicy }) => {
  const panelRef = useRef<HTMLFormElement>(null);
  const [choice, setChoice] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!sending) onClose(); };
  useDialogA11y(panelRef, close);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const extra = details.trim();
    if (!choice) {
      setError('Please choose a reason.');
      return;
    }
    if (choice === 'Other reason' && extra.length < 3) {
      setError('Please tell us briefly why you want to cancel.');
      return;
    }
    const reason = (choice === 'Other reason' ? extra : extra ? `${choice} — ${extra}` : choice).slice(0, 300);
    setSending(true);
    setError('');
    try {
      const result = await ordersApi<{ message?: string; order?: OrderWithRequests }>('request-cancel', { orderNumber: order.orderNumber, reason });
      onDone(result.message || 'Cancellation request sent. Our team will email you.', result.order);
    } catch (err: any) {
      setError(err?.message || 'Could not send your request. Please try again.');
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        aria-describedby="cancel-order-desc"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className={`${sheet} sm:max-w-lg`}
      >
        <span className="sm:hidden mx-auto mt-2.5 h-1 w-9 rounded-full bg-control" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 pl-5 pr-3 sm:pl-7 sm:pr-5 pt-3 sm:pt-5 pb-3">
          <div className="min-w-0 pt-1">
            <h2 id="cancel-order-title" className="aura-h2 aura-h-sm">Cancel this order?</h2>
            <p className="aura-num mt-1.5 text-[13.5px] leading-[18px] text-ink-muted break-words">#{order.orderNumber} · {order.payMode === 'cod' ? `${inr(order.codAdvance || 0)} paid, ${inr(order.codDue || 0)} cash on delivery` : `${inr(order.finalTotal)} paid`}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="aa-ic">
            <X className="w-5 h-5" strokeWidth={1.6} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-7 pt-1 pb-4 space-y-5">
          <p id="cancel-order-desc" className="text-[14px] leading-[21px] text-ink-muted">
            You can ask to cancel until your order is handed to the courier. Our team reviews every request and emails you. Orders cancelled before dispatch are refunded in full to your original payment method.{' '}
            <button type="button" onClick={onPolicy} className={textLink}>Cancellation policy</button>
          </p>
          <fieldset className="space-y-2">
            <legend className={`${fieldLbl} mb-2`}>Why do you want to cancel?</legend>
            {CANCEL_REASONS.map((reason, index) => (
              <label key={reason} data-selected={choice === reason} className="flex items-center gap-3 min-h-[52px] rounded-[16px] bg-page px-4 py-2.5 text-[15px] leading-5 text-ink cursor-pointer transition-shadow data-[selected=true]:shadow-[inset_0_0_0_2px_var(--aura-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                <input
                  type="radio"
                  name="cancel-reason"
                  value={reason}
                  checked={choice === reason}
                  onChange={() => { setChoice(reason); setError(''); }}
                  data-autofocus={index === 0 || undefined}
                  className="w-5 h-5 shrink-0 accent-brand focus:outline-none"
                />
                <span className={choice === reason ? 'font-bold' : ''}>{reason}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="cancel-details" className={fieldLbl}>{choice === 'Other reason' ? 'Tell us why' : 'More details (optional)'}</label>
            <textarea
              id="cancel-details"
              rows={3}
              maxLength={250}
              value={details}
              onChange={(e) => { setDetails(e.target.value); setError(''); }}
              placeholder={choice === 'Other reason' ? 'A line or two is enough' : 'Anything our team should know'}
              className="sag-input resize-none"
            />
            <span className={`aura-num block mt-1 text-right ${noteClass}`}>{details.length}/250</span>
          </div>
          {error && (
            <p role="alert" className="aa-alert"><AlertCircle strokeWidth={1.6} aria-hidden="true" /><span>{error}</span></p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 sm:px-7 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line">
          <button type="button" onClick={close} disabled={sending} className="aura-btn aura-btn-line px-3">
            Keep order
          </button>
          <button type="submit" disabled={sending} className="aura-btn px-3">
            {sending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

const couponDiscountLabel = (c: Coupon) =>
  c.discountType === 'fixed'
    ? `${inr(c.discountValue)} off`
    : `${c.discountValue}% off${c.maxDiscount ? ` (up to ${inr(c.maxDiscount)})` : ''}`;

/** Live coupons (the same list as the coupon drawer). Every code is checked again by the server at checkout. */
const CouponsPanel: React.FC<{ coupons: Coupon[]; onShop: () => void }> = ({ coupons, onShop }) => {
  const [copied, setCopied] = useState('');
  const { showToast } = useShop();
  const copy = (code: string) => {
    if (!navigator.clipboard) {
      showToast(`Copy is not available here. Your code is ${code}.`, 'info');
      return;
    }
    navigator.clipboard.writeText(code)
      .then(() => { setCopied(code); window.setTimeout(() => setCopied(''), 1800); })
      .catch(() => showToast(`Could not copy. Your code is ${code}.`, 'info'));
  };
  if (coupons.length === 0) {
    return (
      <EmptyState icon={<TagIcon className="w-7 h-7" mono />} title="No coupons running right now" text="When the store runs an offer, its code appears here.">
        <button type="button" onClick={onShop} className={`aura-btn aura-btn-line ${smallBtn}`}>Continue shopping</button>
      </EmptyState>
    );
  }
  return (
    <section className="space-y-4" aria-label="Available coupons">
      <SectionIntro title="Your coupons" text="Copy a code and apply it in your bag. The final discount is confirmed at checkout." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {coupons.map((c) => (
          <li key={c.id} className="aura-card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="sag-caps text-[13px] leading-5 font-bold uppercase tracking-[0.16em] text-ink-muted break-all">{c.code}</p>
                <p className="aura-num mt-1 text-[26px] leading-[1.05] font-extrabold tracking-[-0.03em] text-sale">{couponDiscountLabel(c)}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(c.code)}
                aria-label={`Copy coupon code ${c.code}`}
                className={`aura-btn shrink-0 px-4 ${smallBtn}`}
              >
                {copied === c.code ? <CheckCircle2 strokeWidth={1.6} aria-hidden="true" /> : <Copy strokeWidth={1.6} aria-hidden="true" />}
                {copied === c.code ? 'Copied' : 'Copy'}
              </button>
            </div>
            {c.description && <p className="text-[14px] leading-5 text-ink">{c.description}</p>}
            <dl className="aura-num mt-auto grid grid-cols-2 gap-3 pt-3 border-t border-line text-[14px] leading-5">
              <div><dt className={noteClass}>Min. order</dt><dd className="font-semibold text-ink">{c.minOrderValue > 0 ? inr(c.minOrderValue) : 'No minimum'}</dd></div>
              <div><dt className={noteClass}>Valid until</dt><dd className="font-semibold text-ink">{formatDate(c.expiryDate) || 'Until withdrawn'}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Help Center: the store's real contact details and links to its policy pages. */
const HelpCenter: React.FC<{ onGo: (page: ActivePage) => void; onTab: (tab: Tab) => void }> = ({ onGo, onTab }) => {
  const { storeSettings } = useAdmin();
  const email = storeSettings?.storeEmail || 'contact.suitauragirls@gmail.com';
  const links: Array<{ label: string; hint: string; action: () => void }> = [
    { label: 'Where is my order?', hint: 'Track any order with its number', action: () => onGo('track-order') },
    { label: 'Returns & exchanges', hint: 'Start a return or size exchange', action: () => onTab('returns') },
    { label: 'Shipping policy', hint: 'Delivery areas, charges and timelines', action: () => onGo('shipping-policy') },
    { label: 'Return policy', hint: 'What can be returned and how', action: () => onGo('return-policy') },
    { label: 'Cancellation policy', hint: 'Cancelling before your order is shipped', action: () => onGo('cancellation-policy') },
    { label: 'Privacy policy', hint: 'How we use and protect your details', action: () => onGo('privacy-policy') },
    { label: 'Terms & conditions', hint: 'Terms of using this store', action: () => onGo('terms-conditions') },
  ];
  const rowText = (title: string, sub: string, breakAll = false) => (
    <span className="aa-row-t">
      <b>{title}</b>
      <small className={breakAll ? 'break-all' : ''}>{sub}</small>
    </span>
  );
  const chevron = <ChevronRight strokeWidth={1.6} aria-hidden="true" />;
  return (
    <section className="space-y-4" aria-label="Help Center">
      <SectionIntro title="How can we help?" text="Reach our team directly, or find answers in our store policies." />
      <div className="space-y-2">
        <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I need some help.')} target="_blank" rel="noopener noreferrer" className="aa-row">
          <span className="aa-ic"><WhatsAppIcon mono className="w-5 h-5" aria-hidden="true" /></span>
          {rowText('Chat on WhatsApp', 'Chat with our team')}
          {chevron}
        </a>
        <a href={`tel:+91${SUPPORT_PHONE}`} className="aa-row">
          <span className="aa-ic"><SupportIcon className="w-5 h-5" mono /></span>
          {rowText('Call us', SUPPORT_PHONE_DISPLAY)}
          {chevron}
        </a>
        <a href={`mailto:${email}`} className="aa-row">
          <span className="aa-ic"><Mail className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" /></span>
          {rowText('Email', email, true)}
          {chevron}
        </a>
      </div>
      <div className="aura-card aura-blk px-4 pt-5 pb-2 sm:px-6">
        <p className="aura-lbl pb-1">Common questions</p>
        <ul>
          {links.map((link) => (
            <li key={link.label} className="border-t border-line first:border-t-0">
              <button type="button" onClick={link.action} className="aa-row rounded-none px-0">
                {rowText(link.label, link.hint)}
                {chevron}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={() => onGo('contact')} className={`aura-btn aura-btn-line w-full sm:w-auto ${smallBtn}`}>
        Contact us page
      </button>
    </section>
  );
};

/** One order in Account → Orders: status, payment, tracking, progress, items, address and actions. */
const OrderCard: React.FC<{
  order: OrderWithRequests;
  onTrack: () => void;
  onInvoice: () => void;
  onCancel: () => void;
  onReturn: () => void;
  onOpenProduct: (id: string) => void;
  onRate: (id: string) => void;
  onBuyAgain: () => void;
  cancelWindowHours: number;
}> = ({ order, onTrack, onInvoice, onCancel, onReturn, onOpenProduct, onRate, onBuyAgain, cancelWindowHours }) => {
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const canCancel = canRequestCancel(order, cancelWindowHours);
  // Why there is no "Cancel order" button on a paid order that is still on its way ('' when there is nothing to say)
  const cancelNote = canCancel ? '' : cancelClosedNote(order, cancelWindowHours);
  const buyAgain = canBuyAgain(order);
  const canRate = isDelivered(order);
  const address = order.deliveryAddress;
  const streetLine = address ? [address.houseFlat, address.street, address.area].filter(Boolean).join(', ') : '';
  const placeLine = address ? `${[address.city, address.state].filter(Boolean).join(', ')} ${address.pincode || ''}`.trim() : '';
  const paid = order.paymentStatus === 'Paid';
  const awaitingPay = order.paymentStatus === 'Unpaid' && order.status === 'Pending';
  const latest = latestUpdate(order);
  const failed = paymentFailed(order);
  const paymentTone = paid ? '' : order.paymentStatus === 'Refunded' ? 'is-mu' : 'is-wait';
  // Two per row on a phone; a button left alone on its row stretches to fill it.
  const action = `aura-btn aura-btn-line ${smallBtn} px-3 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:px-5`;

  return (
    <article className="aura-card aura-blk overflow-hidden" aria-labelledby={`order-${order.orderNumber}`}>
      <header className="px-4 sm:px-6 pt-5 pb-4 border-b border-line space-y-2.5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`order-${order.orderNumber}`} className="aura-num min-w-0 text-[19px] leading-6 font-extrabold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">
              <span className="sr-only">Order </span>#{order.orderNumber}
            </h2>
            <p className="aura-num shrink-0 text-right text-[19px] leading-6 font-extrabold tracking-[-0.02em] text-ink">
              <span className="sr-only">Total </span>{inr(order.finalTotal)}
            </p>
          </div>
          <p className={`${noteClass} mt-0.5`}>
            Placed {formatDate(order.date)} · {pieces} {pieces === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill order={order} />
          {!awaitingPay && (
            <span className={`aa-pill ${paymentTone}`}>
              <span className="sr-only">Payment: </span>{paid ? (order.payMode === 'cod' ? 'Advance paid' : 'Paid online') : order.paymentStatus === 'Refunded' ? 'Refunded' : failed ? 'Payment failed' : 'Payment pending'}
            </span>
          )}
          {order.payMode === 'cod' && Number(order.codDue) > 0 && !['Cancelled', 'Refunded', 'Returned'].includes(order.status) && (
            <span className="aa-pill is-line aura-num">{inr(order.codDue || 0)} cash on delivery</span>
          )}
        </div>
        {latest && (
          <p className={noteClass}>
            <span className="font-semibold text-ink">Latest:</span> {latest.label} · {formatDateTime(latest.at)}
          </p>
        )}
      </header>

      <div className="p-4 sm:p-6 space-y-4">
        <PendingPayment order={order} />

        {/* An order still waiting for payment shows only the pay box (no delivery steps yet) */}
        {!awaitingPay && <OrderProgress order={order} compact />}

        <div className="space-y-3 empty:hidden [&>section]:bg-page">
          <CourierCard order={order} />

          <DeliveryAgentCard order={order} />
        </div>

        {order.customerNote && (
          <p className="aa-note">
            <span className="font-bold">Note from our team:</span> {order.customerNote}
          </p>
        )}

        <ul className="divide-y divide-line border-y border-line" aria-label="Items in this order">
          {order.items.map((item) => {
            const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
            const unit = Number(item.product?.price) || 0;
            return (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <button
                  type="button"
                  onClick={() => item.product?.id && onOpenProduct(String(item.product.id))}
                  className="w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-[14px] bg-sunken cursor-pointer"
                  aria-label={`View ${item.product?.name || 'product'}`}
                >
                  {item.product?.images?.[0] && (
                    <img src={getCleanImageUrl(item.product.images[0], 160)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14.5px] leading-5 font-semibold text-ink line-clamp-2">{item.product?.name}</p>
                    <p className="aura-num text-[15px] leading-5 font-bold text-ink shrink-0">{inr(unit * item.quantity)}</p>
                  </div>
                  <p className={`aura-num ${noteClass}`}>
                    {item.selectedSize ? `Size ${item.selectedSize}` : 'One size'}{colour} · {item.quantity} × {inr(unit)}
                  </p>
                  {canRate && item.product?.id && !item.lookParentId && (
                    <button type="button" onClick={() => onRate(String(item.product.id))} className="sag-link -mb-2 text-[13.5px]">
                      Rate this product
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {address && (address.fullName || placeLine) && (
          <div className="flex gap-3 text-[14px] leading-5">
            <span className="aa-ic"><PinIcon className="w-5 h-5" mono /></span>
            <div className="min-w-0 text-ink-muted">
              <p className="font-bold text-ink">Delivering to {address.fullName}</p>
              {streetLine && <p className="break-words">{streetLine}</p>}
              {placeLine && <p>{placeLine}</p>}
              {address.mobile && <p>Phone: {address.mobile}</p>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <button type="button" onClick={onTrack} className={`aura-btn aura-btn-w ${awaitingPay ? 'aura-btn-line' : ''}`}>
            Track order
          </button>
          <div className="flex flex-wrap gap-2">
            {hasReceipt(order) && (
              <button type="button" onClick={onInvoice} className={action}>
                <ReceiptIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Receipt
              </button>
            )}
            {buyAgain && (
              <button type="button" onClick={onBuyAgain} className={action}>
                <BagIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Buy again
              </button>
            )}
            {canStartReturn(order) && (
              <button type="button" onClick={onReturn} className={action}>
                <ReturnIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Return / exchange
              </button>
            )}
            {canCancel && (
              <button type="button" onClick={onCancel} className={action}>
                Cancel order
              </button>
            )}
            <a
              href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with my order #${order.orderNumber}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className={action}
            >
              <WhatsAppIcon className="w-[18px] h-[18px] shrink-0" /> Help
            </a>
          </div>
          {cancelNote && <p className={`${noteClass} pt-1`}>{cancelNote}</p>}
        </div>
      </div>
    </article>
  );
};

export const AccountPage: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const {
    setActivePage,
    recentOrders,
    syncCustomerOrders,
    wishlist,
    toggleWishlist,
    showToast,
    setTrackOrderNumber,
    navigateToProduct,
    allProducts = [],
    coupons = [],
    getProductById,
    addToCart,
    addLookToBag,
    setIsCartDrawerOpen,
  } = useShop();
  const { features } = useDiscovery();
  const { storeSettings } = useAdmin();
  const cancelWindowHours = storeSettings?.cancellationWindowHours ?? 0;

  /**
   * "Buy again": the same pieces (same size and colour) go back into the bag when the live product is still
   * published, in stock and still offers that size / colour. "Complete the look" accessories come back with their
   * outfit (the shop never sells them alone). The server re-prices everything at checkout.
   */
  const buyAgain = (order: OrderWithRequests) => {
    const liveFor = (item: CartItem): Product | null => {
      const live = item.product?.id ? getProductById(String(item.product.id)) : undefined;
      if (!live || !isAvailable(live)) return null;
      const sizes = live.sizes || [];
      if (sizes.length > 0 && item.selectedSize && !sizes.includes(item.selectedSize)) return null;
      return live;
    };
    const colourFor = (live: Product, item: CartItem): ProductColor | undefined | null => {
      const name = item.selectedColor?.name || '';
      const colours = live.colors || [];
      if (!name || ['Default', 'Standard'].includes(name) || colours.length === 0) return undefined;
      return colours.find((c) => c.name.toLowerCase() === name.toLowerCase()) || null;
    };
    const added: string[] = [];
    const missing: string[] = [];
    const outfits = order.items.filter((item) => !item.lookParentId);
    for (const item of outfits) {
      const name = item.product?.name || 'An item';
      const live = liveFor(item);
      const colour = live ? colourFor(live, item) : null;
      if (!live || colour === null) {
        missing.push(name);
        continue;
      }
      const size = (item.selectedSize || (live.sizes?.[0] ?? 'Free Size')) as ProductSize;
      const qty = Math.max(1, Math.min(Number(item.quantity) || 1, Number(live.stockQuantity) || 1));
      // Accessories bought with this outfit ("Complete the look")
      const picks: Array<{ product: Product; size: ProductSize; color?: ProductColor }> = [];
      for (const acc of order.items.filter((line) => line.lookParentId && String(line.lookParentId) === String(item.product?.id))) {
        const liveAcc = liveFor(acc);
        const accColour = liveAcc ? colourFor(liveAcc, acc) : null;
        if (!liveAcc || accColour === null) missing.push(acc.product?.name || 'An accessory');
        else picks.push({ product: liveAcc, size: acc.selectedSize, color: accColour });
      }
      if (picks.length > 0) addLookToBag(live, size, colour, qty, picks);
      else addToCart(live, size, colour, qty, false);
      added.push(name);
    }
    // Accessories whose outfit was not in the order (should not happen) cannot be sold alone
    order.items.filter((line) => line.lookParentId && !outfits.some((item) => String(item.product?.id) === String(line.lookParentId)))
      .forEach((line) => missing.push(line.product?.name || 'An accessory'));
    if (added.length > 0) setIsCartDrawerOpen(true);
    if (added.length === 0) {
      showToast('These pieces are no longer available in the same size and colour.', 'error');
    } else if (missing.length > 0) {
      showToast(`Added ${added.length} ${added.length === 1 ? 'item' : 'items'} to your bag. Not available now: ${missing.join(', ')}.`, 'info');
    } else {
      showToast(`Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from order #${order.orderNumber} to your bag.`, 'success');
    }
  };

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mobileView, setMobileView] = useState<'menu' | 'panel'>(initialMobileView);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  // Profile document from the read below, handed to the address book so it does not read it again
  const [profileDoc, setProfileDoc] = useState<Record<string, any> | null | undefined>(undefined);
  const [ordersLoading, setOrdersLoading] = useState(true);
  // True when the last read of the orders failed (a dropped connection, an expired sign-in)
  const [ordersFailed, setOrdersFailed] = useState(false);
  const loadOrders = () => {
    if (!user?.email) return;
    setOrdersLoading(true);
    syncCustomerOrders(user.email).then((ok) => setOrdersFailed(ok === false)).finally(() => setOrdersLoading(false));
  };
  const [profile, setProfile] = useState({ fullName: '', phone: '', houseFlat: '', street: '', city: '', state: '', pincode: '' });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [returnFor, setReturnFor] = useState<OrderWithRequests | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<OrderWithRequests | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithRequests | null>(null);
  // Orders just updated by the server (e.g. after a cancel request), shown until the next order sync
  const [updatedOrders, setUpdatedOrders] = useState<Record<string, OrderWithRequests>>({});
  useEffect(() => setUpdatedOrders({}), [recentOrders]);
  // Aura Kinetic: after a filter or a search the order cards glide to their new places (looks only)
  const ordersListRef = useRef<HTMLDivElement>(null);
  useFlip(ordersListRef, `${orderFilter}|${orderSearch.trim().toLowerCase()}|${recentOrders.length}`, { selector: ':scope > [data-flip]' });

  useEffect(() => {
    if (!user?.email) return;
    loadOrders();
    getDocById(COLLECTIONS.profiles, emailKey(user.email))
      .then((data) => {
        // The same read also gives the style profile (no second read for the Style tab or home rail)
        primeStylePrefs(user.email, data?.stylePrefs);
        // ...and the saved addresses (moves the old single address into the address book on first use)
        setProfileDoc(data || null);
        syncAddressBook(user.email, data || null).catch((err) => console.warn('Could not load saved addresses:', err));
        if (data) {
          setProfile({
            fullName: data.fullName || data.name || user.name || '',
            phone: data.phone || '',
            houseFlat: data.houseFlat || data.streetAddress || '',
            street: data.street || '',
            city: data.city || '',
            state: data.state || '',
            pincode: data.pincode || '',
          });
        }
      })
      .catch((err) => console.warn('Could not load profile:', err))
      .finally(() => setProfileLoaded(true));
  }, [user?.email]);

  if (authLoading) {
    // The shape of the account while the sign-in is read: the greeting band and the rows
    return (
      <div data-aura className="clay-pg min-h-[70vh] px-3 pt-4 pb-14 sm:px-6 lg:px-8 lg:pt-8" role="status" aria-label="Loading your account">
        <div className="aa-ask mx-auto max-w-[1120px]" aria-hidden="true"><b /><i /><i /><i /><i /></div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const tabs = TABS.filter((t) => t.key !== 'style' || features.styleProfile);
  const tab: Tab = activeTab === 'style' && !features.styleProfile ? 'orders' : activeTab;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.phone && !/^[6-9]\d{9}$/.test(profile.phone)) {
      showToast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
    if (profile.pincode && !/^[1-9]\d{5}$/.test(profile.pincode)) {
      showToast('Please enter a valid 6-digit PIN code.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const email = emailKey(user.email);
      await saveDoc(COLLECTIONS.profiles, email, { email, ...profile, name: profile.fullName, streetAddress: profile.houseFlat });
      try {
        localStorage.setItem(`sag_user_profile_${email}`, JSON.stringify({ ...profile, email, streetAddress: profile.houseFlat }));
      } catch {}
      showToast('Profile saved.', 'success');
    } catch (err) {
      console.warn('Profile save failed:', err);
      showToast('Could not save your profile. Please try again.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePincode = async (value: string) => {
    const pin = value.replace(/\D/g, '').slice(0, 6);
    setProfile((prev) => ({ ...prev, pincode: pin }));
    if (pin.length !== 6) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data = await res.json();
      const po = data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : null;
      if (po) setProfile((prev) => ({ ...prev, city: po.District || prev.city, state: po.State || prev.state }));
    } catch {}
  };

  const shownOrders = (recentOrders as OrderWithRequests[]).map((listed) => updatedOrders[listed.orderNumber] || listed);
  const withRequests = shownOrders.filter((order) => order.returnRequest);
  const returnable = shownOrders.filter((order) => canStartReturn(order));
  const openTrack = (order: OrderWithRequests) => {
    setTrackOrderNumber(order.orderNumber);
    setActivePage('track-order');
  };
  // Orders placed on this phone BEFORE signing in (as a guest, perhaps with another email than the account's).
  // The account's own list comes from the server by the sign-in email, so these would otherwise be missing and
  // the page would say "No orders yet" to someone who has just paid. They are read from this browser (it kept
  // them when the order was placed) and each opens the Track order page with its number and the contact used
  // at checkout already filled in, where the server shows the real, current state.
  const deviceOrders: OrderWithRequests[] = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sag_guest_orders') || '[]');
      const listed = new Set(shownOrders.map((order) => order.orderNumber));
      return (Array.isArray(saved) ? saved : []).filter((order: OrderWithRequests) => order?.orderNumber && !listed.has(order.orderNumber)).slice(0, 10);
    } catch {
      return [];
    }
  })();
  const openDeviceOrder = (order: OrderWithRequests) => {
    try { sessionStorage.setItem('sag_last_order', JSON.stringify({ orderNumber: order.orderNumber, contact: order.customerEmail || order.customerMobile || '' })); } catch {}
    setTrackOrderNumber(order.orderNumber);
    setActivePage('track-order');
    window.scrollTo(0, 0);
  };
  const deviceOrdersBlock = deviceOrders.length > 0 && (
    <div id="account-device-orders" className="aura-card aura-blk p-4 sm:p-5">
      <p className="text-[17px] leading-6 font-extrabold tracking-[-0.02em] text-ink">Ordered on this phone before you signed in</p>
      <p className="mt-1 text-[13.5px] leading-5 text-ink-muted">These were placed without signing in, so they are tracked with the order number.</p>
      <ul className="mt-3 divide-y divide-line">
        {deviceOrders.map((order) => (
          <li key={order.orderNumber} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="sag-num text-[14.5px] leading-5 font-semibold text-ink">{order.orderNumber}</p>
              <p className="sag-num mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                {[order.items?.length ? `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'}` : '', Number(order.finalTotal) > 0 ? `₹${Number(order.finalTotal).toLocaleString('en-IN')}` : ''].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type="button" onClick={() => openDeviceOrder(order)} className="aura-btn aura-btn-sm shrink-0">Track order</button>
          </li>
        ))}
      </ul>
    </div>
  );

  const searchText = orderSearch.trim().toLowerCase();
  const filteredOrders = shownOrders.filter((order) =>
    matchesOrderFilter(order, orderFilter) &&
    (!searchText ||
      String(order.orderNumber || '').toLowerCase().includes(searchText) ||
      order.items.some((item) => String(item.product?.name || '').toLowerCase().includes(searchText))));
  const filterCount = (key: OrderFilter) => shownOrders.filter((order) => matchesOrderFilter(order, key)).length;
  const rateProduct = (productId: string) => {
    requestReviewFor(productId);
    navigateToProduct(productId);
  };
  const goPage = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };
  /** Opens a tab; on a phone this also leaves the account menu and shows the tab from its top. */
  const openTab = (key: Tab) => {
    setActiveTab(key);
    setMobileView('panel');
    window.scrollTo(0, 0);
  };
  const backToMenu = () => {
    setMobileView('menu');
    window.scrollTo(0, 0);
  };

  const displayName = profile.fullName || user.name || user.email.split('@')[0];
  const firstName = displayName.trim().split(/\s+/)[0];
  // Real numbers only: what the account already holds
  const tabNote: Partial<Record<Tab, string>> = {
    orders: recentOrders.length ? `${recentOrders.length} ${recentOrders.length === 1 ? 'order' : 'orders'}` : 'Track and manage',
    wishlist: wishlist.length ? `${wishlist.length} saved` : 'Saved styles',
    addresses: 'For faster checkout',
    coupons: coupons.length ? `${coupons.length} available` : 'Offers and codes',
    profile: 'Name and contact details',
    style: 'Colours, sizes and budget you like',
    returns: withRequests.length ? `${withRequests.length} ${withRequests.length === 1 ? 'request' : 'requests'}` : 'Within 7 days of delivery',
    help: 'Contact us and store policies',
  };
  const newestOrder = shownOrders.length
    ? [...shownOrders].sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0))[0]
    : null;
  const newestUpdate = newestOrder ? latestUpdate(newestOrder) : null;
  const tabLabel = tabs.find((t) => t.key === tab)?.label || 'My account';

  return (
    <div data-aura className="clay-pg min-h-[70vh] px-3 pt-4 pb-14 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16">
      <div className="max-w-[1120px] mx-auto lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10 lg:items-start">
        <aside className={`${mobileView === 'panel' ? 'hidden lg:block' : ''} space-y-3 lg:sticky lg:top-24`}>
          <div className="aa-band aa-band-blush min-w-0">
            <AuraTitle as="h1" label={`Hello, ${firstName}`} title="My" accent="account" size="lg" titleClassName="lg:text-[46px]" />
            <p className="mt-3 text-[14px] leading-5 aura-mu truncate">{user.email}</p>
          </div>

          {newestOrder && (() => {
            // How far the order has come, as seven dots (none for a cancelled, returned or refunded order)
            const stage = ['Pending', 'Processing', 'Packed', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'].indexOf(String(newestOrder.status));
            const first = newestOrder.items?.[0];
            const photo = first?.product?.images?.[0] || first?.product?.image || '';
            const more = (newestOrder.items?.length || 0) - 1;
            return (
              <section aria-labelledby="account-latest-order" className="aa-tlc aura-dk">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="account-latest-order" className="aura-lbl" style={{ fontSizeAdjust: 'none' }}>Latest order</h2>
                  <StatusPill order={newestOrder} />
                </div>
                <button type="button" onClick={() => openTab('orders')} className="mt-4 grid w-full grid-cols-[62px_minmax(0,1fr)] items-start gap-3.5 text-left cursor-pointer">
                  {photo
                    ? <img src={getCleanImageUrl(photo, 160)} alt="" loading="lazy" className="w-[62px] aspect-[4/5] rounded-[14px] object-cover object-top bg-sunken" />
                    : <span className="w-[62px] aspect-[4/5] rounded-[14px] bg-sunken" />}
                  <span className="min-w-0">
                    <span className="aura-num block truncate text-[13px] leading-[18px] text-on-dark-muted">#{newestOrder.orderNumber}</span>
                    {newestUpdate && <span className="mt-1 block text-[26px] leading-[1.02] font-extrabold tracking-[-0.03em]">{newestUpdate.label}</span>}
                    {newestUpdate && <span className="aura-num mt-1 block text-[13px] leading-[18px] text-on-dark-muted">{formatDateTime(newestUpdate.at)}</span>}
                    {first?.product?.name && <span className="mt-1.5 block text-[14px] leading-5 line-clamp-2">{first.product.name}{more > 0 ? ` + ${more} more` : ''}</span>}
                  </span>
                </button>
                {stage >= 0 && (
                  <span className="aa-dots mt-5" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                      <React.Fragment key={index}>
                        {index > 0 && <s className={index <= stage ? 'on' : ''} />}
                        <i className={`${index <= stage ? 'on' : ''}${index === stage && stage < 6 ? ' cur' : ''}`} style={{ '--i': index } as React.CSSProperties} />
                      </React.Fragment>
                    ))}
                  </span>
                )}
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => openTab('orders')} className="aura-btn aura-btn-sm flex-1 min-w-0 px-3">Track order</button>
                  <button type="button" onClick={() => openTab('help')} className="aura-btn aura-btn-line aura-btn-sm flex-1 min-w-0 px-3">Need help?</button>
                </div>
              </section>
            );
          })()}

          <div className="space-y-2" role="tablist" aria-label="My account" aria-orientation="vertical">
            {tabs.map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                id={`account-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={tab === key}
                aria-controls="account-panel"
                onClick={() => openTab(key)}
                className="aa-row"
              >
                <span className="aa-ic">
                  <TabIcon className="w-5 h-5" mono live={false} />
                </span>
                <span className="aa-row-t">
                  <b>{label}</b>
                  {tabNote[key] && <small className="aura-num">{tabNote[key]}</small>}
                </span>
                <ChevronRight strokeWidth={1.6} aria-hidden="true" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={async () => {
              await logout();
              showToast('You have been signed out.', 'info');
              setActivePage('home');
            }}
            className="aura-btn aura-btn-line aura-btn-sm mt-2"
          >
            <LogOut strokeWidth={1.6} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </aside>

        <div className={`${mobileView === 'menu' ? 'hidden lg:block' : ''} min-w-0 px-1 lg:px-0`}>
          <button type="button" onClick={backToMenu} className={`lg:hidden ${capsLink} mb-3`} aria-label={`Back to My account from ${tabLabel}`}>
            <ArrowLeft strokeWidth={1.6} aria-hidden="true" />
            <span>My account</span>
          </button>

          <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`} key={tab} className="sag-step-in">
            {tab === 'orders' && (
              <section className="space-y-4">
                {ordersLoading && recentOrders.length === 0 ? (
                  // The shape of two order cards while the list is read
                  <div className="aa-osk" role="status" aria-label="Loading your orders">
                    {[0, 1].map((n) => <div key={n} aria-hidden="true"><i className="w-2/5" /><i className="mt-3 w-3/5" /><i className="mt-6 h-1! w-full" /><b /><i className="mt-5 h-[54px]! w-full" /></div>)}
                  </div>
                ) : ordersFailed && recentOrders.length === 0 ? (
                  // The list could not be read: say so, never "No orders yet" to someone who may have paid
                  <>
                    <EmptyState icon={<WifiOff className="w-6 h-6" strokeWidth={1.6} aria-hidden="true" />} title="We could not load your orders" text="Your orders are safe. Check your connection and try again, or track an order with its number.">
                      <button type="button" onClick={loadOrders} className="aura-btn">Try again</button>
                      <button type="button" onClick={() => { setActivePage('track-order'); window.scrollTo(0, 0); }} className="aura-btn aura-btn-line">Track with order number</button>
                    </EmptyState>
                    {deviceOrdersBlock}
                  </>
                ) : recentOrders.length === 0 ? (
                  <>
                    {deviceOrdersBlock}
                    <EmptyState
                      icon={<BagIcon className="w-7 h-7" mono />}
                      title={deviceOrders.length ? 'No orders under this email' : 'No orders under this email yet'}
                      text={<>Orders placed while signed in as <span className="ocf-em">{user.email}</span> appear here. Ordered without signing in, or with another email? Track it with your order number and the mobile number or email you gave at checkout.</>}
                    >
                      <button type="button" id="account-track-guest-order" onClick={() => { setActivePage('track-order'); window.scrollTo(0, 0); }} className="aura-btn">
                        Track with order number
                      </button>
                      <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I placed an order but I cannot see it in my account (${user.email}). Please help me find it.`)} target="_blank" rel="noopener noreferrer" className="aura-btn aura-btn-line">
                        Ask us on WhatsApp
                      </a>
                      <button type="button" onClick={() => setActivePage('shop')} className="aura-btn aura-btn-line">
                        Start shopping
                      </button>
                    </EmptyState>
                  </>
                ) : (
                  <>
                    {deviceOrdersBlock}
                    <SectionIntro title="My orders" text="Track deliveries, download receipts and manage returns." />
                    <div className="space-y-3">
                      <div className="relative">
                        <label htmlFor="order-search" className="sr-only">Search your orders</label>
                        <Search className="w-[18px] h-[18px] text-ink-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                        <input
                          id="order-search"
                          type="search"
                          enterKeyHint="search"
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          placeholder="Search by order number or product"
                          className="sag-input pl-12"
                        />
                      </div>
                      <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap py-0.5" role="group" aria-label="Filter orders by status">
                        {ORDER_FILTERS.map(({ key, label }) => {
                          const count = key === 'all' ? shownOrders.length : filterCount(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={orderFilter === key}
                              onClick={() => setOrderFilter(key)}
                              className="sag-chip aura-num shrink-0 h-11 min-w-0 gap-1.5 text-[14px] font-semibold whitespace-nowrap"
                            >
                              {label}
                              <span className="font-normal opacity-80">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {filteredOrders.length === 0 ? (
                      <EmptyState
                        icon={<Search className="w-6 h-6" />}
                        title="No orders match"
                        text={<>{searchText ? `Nothing found for “${orderSearch.trim()}”` : 'No orders with this status'}{orderFilter !== 'all' ? ` under ${ORDER_FILTERS.find((f) => f.key === orderFilter)?.label}` : ''}.</>}
                      >
                        <button type="button" onClick={() => { setOrderSearch(''); setOrderFilter('all'); }} className={`aura-btn ${smallBtn}`}>
                          Show all orders
                        </button>
                        <button type="button" onClick={() => goPage('shop')} className={`aura-btn aura-btn-line ${smallBtn}`}>
                          Continue shopping
                        </button>
                      </EmptyState>
                    ) : (
                      <div ref={ordersListRef} className="space-y-4">
                        {filteredOrders.map((order) => (
                          <div key={order.orderNumber} data-flip={order.orderNumber}>
                            <OrderCard
                              order={order}
                              onTrack={() => openTrack(order)}
                              onInvoice={() => setInvoiceOrder(order)}
                              onCancel={() => setCancelOrder(order)}
                              onReturn={() => setReturnFor(order)}
                              onOpenProduct={navigateToProduct}
                              onRate={rateProduct}
                              onBuyAgain={() => buyAgain(order)}
                              cancelWindowHours={cancelWindowHours}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {tab === 'addresses' && (
              <AddressBook
                profile={profileDoc}
                onChange={(list) => {
                  const def = list.find((a) => a.isDefault);
                  if (def) setProfile((prev) => ({ ...prev, houseFlat: def.houseFlat, street: def.street, city: def.city, state: def.state, pincode: def.pincode }));
                }}
              />
            )}

            {tab === 'coupons' && <CouponsPanel coupons={coupons} onShop={() => goPage('shop')} />}

            {tab === 'help' && <HelpCenter onGo={goPage} onTab={openTab} />}

            {tab === 'wishlist' && (
              <section className="space-y-4">
                {wishlist.length === 0 ? (
                  <EmptyState icon={<HeartIcon className="w-7 h-7" mono />} title="Your wishlist is empty" text="Tap the heart on any product to save it here.">
                    <button type="button" onClick={() => goPage('shop')} className="aura-btn">Explore styles</button>
                  </EmptyState>
                ) : (
                  <>
                    <SectionIntro title="Wishlist" text={`${wishlist.length} ${wishlist.length === 1 ? 'style' : 'styles'} saved to your account.`} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-2.5 gap-y-4 sm:gap-x-4 sm:gap-y-6">
                      {wishlist.map((saved) => {
                        const live = allProducts.find((p) => String(p.id) === String(saved.id));
                        return live ? <ProductCard key={saved.id} product={live} /> : (
                          <div key={saved.id} className="aura-card flex flex-col gap-2 p-1.5 pb-3">
                            <div className="aspect-[3/4] rounded-[17px] bg-sunken flex items-center justify-center px-3 text-center">
                              <span className="text-sm leading-5 text-ink-muted">No longer available</span>
                            </div>
                            <p className="px-1.5 text-[14px] leading-5 font-semibold text-ink line-clamp-2">{saved.name}</p>
                            <button type="button" onClick={() => toggleWishlist(saved)} className={`aura-btn aura-btn-line mx-1.5 mt-auto ${smallBtn}`}>Remove</button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            )}

            {tab === 'profile' && (
              <section className="space-y-4">
                <SectionIntro title="Profile" text="Your contact details, used to fill in checkout faster." />
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div className="aura-card aura-blk p-4 sm:p-6 space-y-4">
                    <h3 className={panelTitle}>Contact</h3>
                    <p className="aa-note text-ink-muted">
                      Signed in with <span className="ocf-em font-bold! text-ink">{user.email}</span>
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="profile-name" className={fieldLbl}>Full name</label>
                        <input id="profile-name" name="name" className="sag-input" disabled={!profileLoaded} autoComplete="name" autoCapitalize="words" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} />
                      </div>
                      <div>
                        <label htmlFor="profile-mobile" className={fieldLbl}>Mobile number</label>
                        <input id="profile-mobile" name="mobile" type="tel" className="sag-input" disabled={!profileLoaded} inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                      </div>
                    </div>
                  </div>

                  <fieldset className="aura-card aura-blk p-4 sm:p-6 min-w-0">
                    <legend className="sr-only">Address</legend>
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <h3 className={panelTitle}>Address</h3>
                      <button type="button" onClick={() => openTab('addresses')} className="sag-link text-[13.5px]">Saving more than one? Use Addresses</button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-4">
                      <div className="col-span-2">
                        <label htmlFor="profile-house" className={fieldLbl}>House / flat, building</label>
                        <input id="profile-house" className="sag-input" disabled={!profileLoaded} autoComplete="address-line1" value={profile.houseFlat} onChange={(e) => setProfile({ ...profile, houseFlat: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="profile-street" className={fieldLbl}>Street / area</label>
                        <input id="profile-street" className="sag-input" disabled={!profileLoaded} autoComplete="address-line2" value={profile.street} onChange={(e) => setProfile({ ...profile, street: e.target.value })} />
                      </div>
                      <div>
                        <label htmlFor="profile-pin" className={fieldLbl}>PIN code</label>
                        <input id="profile-pin" className="sag-input" disabled={!profileLoaded} inputMode="numeric" autoComplete="postal-code" maxLength={6} placeholder="6-digit PIN" value={profile.pincode} onChange={(e) => handlePincode(e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="profile-city" className={fieldLbl}>City</label>
                        <input id="profile-city" className="sag-input" disabled={!profileLoaded} autoComplete="address-level2" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="profile-state" className={fieldLbl}>State</label>
                        <input id="profile-state" className="sag-input" disabled={!profileLoaded} autoComplete="address-level1" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
                      </div>
                    </div>
                  </fieldset>

                  <button type="submit" disabled={savingProfile || !profileLoaded} className="aura-btn aura-btn-w sm:inline-flex sm:w-auto sm:px-10">
                    {savingProfile && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </form>
              </section>
            )}

            {tab === 'style' && <StyleProfile />}

            {tab === 'returns' && (
              <section className="space-y-4">
                <SectionIntro title="Returns & exchanges" />
                <div className="rounded-[26px] bg-blush p-4 sm:p-5 flex gap-3">
                  <span className="aa-ic"><ReturnIcon className="w-5 h-5" mono live={false} /></span>
                  <p className="min-w-0 text-[14px] leading-[21px] text-ink">
                    You can ask for a return or a size exchange within 7 days of delivery. Pieces must be unused and unwashed, with their original tags; clearance pieces (50% or more off) can be exchanged for another size only. Add photos if something arrived damaged or wrong. Our team reviews every request and emails you.{' '}
                    <button type="button" onClick={() => setActivePage('return-policy')} className={textLink}>Return policy</button>
                  </p>
                </div>

                {returnable.length > 0 && (
                  <div className="aura-card aura-blk px-4 sm:px-6">
                    <p className={`${panelTitle} pt-5`}>Ready to return or exchange</p>
                    <ul className="divide-y divide-line">
                      {returnable.map((order) => (
                        <li key={order.orderNumber} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-3">
                            <span className="w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-[14px] bg-sunken">
                              {order.items[0]?.product?.images?.[0] && <img src={getCleanImageUrl(order.items[0].product.images[0], 140)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                            </span>
                            <div className="min-w-0">
                              <p className="aura-num text-[15px] leading-5 font-bold text-ink break-all">#{order.orderNumber}</p>
                              <p className={`aura-num ${noteClass}`}>
                                {order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {inr(order.finalTotal)}
                              </p>
                              {formatWindowEnd(order.returnEligibility?.windowEndsAt) && (
                                <p className="aa-pill mt-1.5">Request by {formatWindowEnd(order.returnEligibility?.windowEndsAt)}</p>
                              )}
                            </div>
                          </div>
                          <button type="button" onClick={() => setReturnFor(order)} className={`aura-btn ${smallBtn} w-full sm:w-auto`}>
                            <ReturnIcon className="w-[18px] h-[18px]" mono live={false} /> Start return / exchange
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {withRequests.map((order) => (
                  <div key={order.orderNumber} className="aura-card aura-blk pt-2">
                    <div className="flex items-center justify-between gap-2 px-4">
                      <p className="aura-num min-w-0 text-[15px] leading-5 font-bold text-ink break-all"><span className="sr-only">Order </span>#{order.orderNumber}</p>
                      <button type="button" onClick={() => openTrack(order)} className="sag-link shrink-0 gap-1 text-[13.5px]">
                        View order <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </div>
                    <ReturnProgress order={order} />
                  </div>
                ))}

                {returnable.length === 0 && withRequests.length === 0 && (
                  <EmptyState icon={<ReturnIcon className="w-7 h-7" mono />} title="Nothing to return right now" text="Delivered orders appear here for 7 days after delivery." />
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {invoiceOrder && <OrderInvoice order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />}
      {returnFor && (
        <ReturnRequestForm
          order={returnFor}
          onClose={() => setReturnFor(null)}
          onPolicy={() => { setReturnFor(null); setActivePage('return-policy'); }}
          onDone={(message, updated) => {
            setReturnFor(null);
            if (updated?.orderNumber) setUpdatedOrders((prev) => ({ ...prev, [updated.orderNumber]: updated }));
            showToast(message, 'success');
            syncCustomerOrders(user.email);
          }}
        />
      )}
      {cancelOrder && (
        <CancelOrderDialog
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          onPolicy={() => { setCancelOrder(null); setActivePage('cancellation-policy'); }}
          onDone={(message, updated) => {
            setCancelOrder(null);
            if (updated?.orderNumber) setUpdatedOrders((prev) => ({ ...prev, [updated.orderNumber]: updated }));
            showToast(message, 'success');
            syncCustomerOrders(user.email);
          }}
        />
      )}
    </div>
  );
};
