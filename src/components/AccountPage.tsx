import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { COLLECTIONS, emailKey, getDocById, saveDoc } from '../lib/dataStore';
import { ordersApi } from '../lib/api';
import { PendingPayment } from './PendingPayment';
import { WhatsAppIcon } from './BrandIcons';
import { CANCELLABLE_STATUSES, CourierCard, DeliveryAgentCard, ORDER_FILTERS, OrderFilter, OrderProgress, OrderWithRequests, ReturnProgress, StatusPill, formatDateTime, formatWindowEnd, isDelivered, latestUpdate, matchesOrderFilter, paymentFailed } from './OrderProgress';
import { isAvailable } from '../utils/smartQuery';
import { ReturnRequestForm, canStartReturn } from './ReturnRequestForm';
import { OrderInvoice, useDialogA11y } from './OrderInvoice';
import { StyleProfile, primeStylePrefs } from './StyleProfile';
import { LoginPage } from './LoginPage';
import { CheckCircle2, ChevronRight, Copy, Loader2, LogOut, Mail, Search, Star, X, XCircle } from 'lucide-react';
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
import { HeartIcon, HelpIcon, OrdersIcon, PinIcon, ReturnIcon, SupportIcon, TagIcon, TruckIcon, UserIcon } from './StoreIcons';
import { ReceiptIcon, StyleIcon } from './AccountIcons';

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

const inputClass = 'w-full h-12 px-4 bg-white border border-[#4B1D3F]/20 hover:border-[#4B1D3F]/35 focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8] rounded-full text-sm text-[#2A1A26] transition focus:outline-none disabled:opacity-60 disabled:bg-[#FBF7F3]';
const labelClass = 'block pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/65';
const actionClass = 'h-11 px-3 text-xs font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] whitespace-nowrap inline-flex items-center justify-center gap-2 cursor-pointer';
/** Soft lavender circle that holds an icon in empty states and info rows. */
const iconCircle = 'shrink-0 rounded-full ring-1 ring-[#4B1D3F]/8 flex items-center justify-center';

/** Empty / "nothing here" card used across the tabs, so every one looks the same. */
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; text: React.ReactNode; children?: React.ReactNode }> = ({ icon, title, text, children }) => (
  <div className="sag-card rounded-3xl! py-12 sm:py-16 px-5 text-center">
    <span className={`${iconCircle} w-16 h-16 mx-auto bg-[#F3EEF8]`}>{icon}</span>
    <p className="mt-4 font-serif text-2xl text-[#2A1A26]">{title}</p>
    <p className="mt-1.5 text-sm text-[#2A1A26]/70 max-w-sm mx-auto leading-relaxed">{text}</p>
    {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
  </div>
);

/** Heading + one-line explanation at the top of a tab. */
const SectionIntro: React.FC<{ title: string; text?: React.ReactNode; action?: React.ReactNode }> = ({ title, text, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="font-serif text-2xl sm:text-[28px] leading-tight text-[#4B1D3F]">{title}</h2>
      {text && <p className="mt-1 text-sm text-[#2A1A26]/70 leading-relaxed">{text}</p>}
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

/**
 * Same rule as the server (api/_lib/orders.js cancelBlockReason): paid, not packed yet, no earlier request, and
 * within the owner's cancellation window after payment (Admin → Settings → Checkout; 0 = no time limit).
 */
const canRequestCancel = (order: OrderWithRequests, windowHours = 0) => {
  if (order.paymentStatus !== 'Paid' || !CANCELLABLE_STATUSES.includes(order.status) || order.cancelRequest) return false;
  const paid = new Date(order.paidAt || '').getTime();
  return !(windowHours > 0 && Number.isFinite(paid) && Date.now() - paid > windowHours * 60 * 60 * 1000);
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
    <div className="fixed inset-0 z-[80] bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={close}>
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        aria-describedby="cancel-order-desc"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#FBF7F3] w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-[var(--sag-shadow)] animate-in fade-in slide-in-from-bottom-5"
      >
        <span className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#4B1D3F]/15" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-[#4B1D3F]/10">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-11 h-11 shrink-0 rounded-full bg-[#F7E4EA] flex items-center justify-center text-[#8A2E55]"><XCircle className="w-5 h-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 id="cancel-order-title" className="font-serif text-2xl text-[#4B1D3F] leading-tight">Cancel this order?</h2>
              <p className="mt-0.5 text-sm text-[#2A1A26]/65 break-words">#{order.orderNumber} · {inr(order.finalTotal)} paid</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center text-[#4B1D3F] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5">
          <p id="cancel-order-desc" className="text-sm text-[#2A1A26]/75 leading-relaxed">
            You can ask to cancel until your order is packed. Our team reviews every request and emails you. Orders cancelled before dispatch are refunded in full to your original payment method.{' '}
            <button type="button" onClick={onPolicy} className="underline underline-offset-2 text-[#4B1D3F] font-medium cursor-pointer">Cancellation policy</button>
          </p>
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45] mb-2.5">Why do you want to cancel?</legend>
            {CANCEL_REASONS.map((reason, index) => (
              <label key={reason} className={`flex items-center gap-3 min-h-12 px-4 py-2.5 rounded-2xl border text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4B1D3F]/30 ${choice === reason ? 'border-[#4B1D3F] bg-white text-[#2A1A26] font-medium shadow-[var(--sag-shadow)]' : 'border-[#4B1D3F]/12 bg-white/70 text-[#2A1A26]/80 hover:bg-white hover:border-[#4B1D3F]/25'}`}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={reason}
                  checked={choice === reason}
                  onChange={() => { setChoice(reason); setError(''); }}
                  data-autofocus={index === 0 || undefined}
                  className="w-4 h-4 accent-[#4B1D3F]"
                />
                {reason}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1.5">
            <span className={labelClass}>{choice === 'Other reason' ? 'Tell us why *' : 'More details (optional)'}</span>
            <textarea
              rows={3}
              maxLength={250}
              value={details}
              onChange={(e) => { setDetails(e.target.value); setError(''); }}
              placeholder={choice === 'Other reason' ? 'A line or two is enough' : 'Anything our team should know'}
              className="w-full rounded-2xl border border-[#4B1D3F]/20 bg-white px-4 py-3 text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8] resize-none"
            />
            <span className="block text-right text-[11px] text-[#2A1A26]/50">{details.length}/250</span>
          </label>
          {error && <p role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 sm:px-6 py-4 border-t border-[#4B1D3F]/10 bg-[#FBF7F3] rounded-b-none sm:rounded-b-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={close} disabled={sending} className={`sag-btn-outline ${actionClass} disabled:opacity-60`}>
            Keep order
          </button>
          <button type="submit" disabled={sending} className={`sag-btn-primary ${actionClass} disabled:opacity-60`}>
            {sending && <Loader2 className="w-4 h-4 animate-spin text-current" />}
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
      <EmptyState icon={<TagIcon className="w-8 h-8" />} title="No coupons running right now" text="When the store runs an offer, its code appears here.">
        <button type="button" onClick={onShop} className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Continue shopping</button>
      </EmptyState>
    );
  }
  return (
    <section className="space-y-4" aria-label="Available coupons">
      <SectionIntro title="Your coupons" text="Copy a code and apply it in your bag. The final discount is confirmed at checkout." />
      <ul className="grid gap-3 sm:gap-4 sm:grid-cols-2">
        {coupons.map((c) => (
          <li key={c.id} className="sag-card rounded-3xl! overflow-hidden flex flex-col">
            <div className="flex items-stretch">
              <div className="w-[88px] sm:w-24 shrink-0 bg-[#4B1D3F] text-white flex flex-col items-center justify-center gap-1 px-2 py-4 text-center">
                <TagIcon className="w-6 h-6 text-white" mono />
                <span className="font-serif text-xl leading-none">{c.discountType === 'fixed' ? inr(c.discountValue) : `${c.discountValue}%`}</span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-white/80">off</span>
              </div>
              <div className="relative flex-1 min-w-0 p-4 sm:p-5 border-l-2 border-dashed border-[#4B1D3F]/15">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-block rounded-lg bg-[#F3EEF8] px-2.5 py-1 font-mono font-semibold text-base tracking-[0.12em] text-[#4B1D3F] break-all">{c.code}</p>
                    <p className="mt-1.5 text-sm font-medium text-emerald-800">{couponDiscountLabel(c)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(c.code)}
                    aria-label={`Copy coupon code ${c.code}`}
                    className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${copied === c.code ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-[#4B1D3F]/30 text-[#4B1D3F] hover:bg-[#F3EEF8]'}`}
                  >
                    {copied === c.code ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                    {copied === c.code ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {c.description && <p className="mt-2 text-sm text-[#2A1A26]/75 leading-relaxed">{c.description}</p>}
              </div>
            </div>
            <dl className="mt-auto grid grid-cols-2 gap-3 px-4 sm:px-5 py-3 bg-[#FBF7F3] border-t border-[#4B1D3F]/8 text-sm">
              <div><dt className="uppercase tracking-[0.14em] text-[11px] font-semibold text-[#9C7A45]">Min. order</dt><dd className="text-[#2A1A26]">{c.minOrderValue > 0 ? inr(c.minOrderValue) : 'No minimum'}</dd></div>
              <div><dt className="uppercase tracking-[0.14em] text-[11px] font-semibold text-[#9C7A45]">Valid until</dt><dd className="text-[#2A1A26]">{formatDate(c.expiryDate) || 'Until withdrawn'}</dd></div>
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
  const email = storeSettings?.storeEmail || 'suitauragirls@gmail.com';
  const contactClass = 'sag-card rounded-2xl! p-4 flex items-center gap-3 min-w-0 hover:bg-[#F3EEF8]! hover:border-[#4B1D3F]/20! transition-colors';
  const links: Array<{ label: string; hint: string; action: () => void }> = [
    { label: 'Where is my order?', hint: 'Track any order with its number', action: () => onGo('track-order') },
    { label: 'Returns & exchanges', hint: 'Start a return or size exchange', action: () => onTab('returns') },
    { label: 'Shipping policy', hint: 'Delivery areas, charges and timelines', action: () => onGo('shipping-policy') },
    { label: 'Return policy', hint: 'What can be returned and how', action: () => onGo('return-policy') },
    { label: 'Cancellation policy', hint: 'Cancelling before your order is packed', action: () => onGo('cancellation-policy') },
    { label: 'Privacy policy', hint: 'How we use and protect your details', action: () => onGo('privacy-policy') },
    { label: 'Terms & conditions', hint: 'Terms of using this store', action: () => onGo('terms-conditions') },
  ];
  return (
    <section className="space-y-5" aria-label="Help Center">
      <SectionIntro title="How can we help?" text="Reach our team directly, or find answers in our store policies." />
      <div className="grid gap-3 sm:grid-cols-3">
        <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I need some help.')} target="_blank" rel="noopener noreferrer" className={contactClass}>
          <span className={`${iconCircle} w-11 h-11 bg-[#F3EEF8]`}><WhatsAppIcon className="w-5 h-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#2A1A26]">WhatsApp</span><span className="block text-[13px] text-[#2A1A26]/65">Chat with our team</span></span>
          <ChevronRight className="w-4 h-4 shrink-0 text-[#4B1D3F]/40 sm:hidden" aria-hidden="true" />
        </a>
        <a href={`tel:+91${SUPPORT_PHONE}`} className={contactClass}>
          <span className={`${iconCircle} w-11 h-11 bg-[#F3EEF8]`}><SupportIcon className="w-5 h-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#2A1A26]">Call us</span><span className="block text-[13px] text-[#2A1A26]/65">{SUPPORT_PHONE_DISPLAY}</span></span>
          <ChevronRight className="w-4 h-4 shrink-0 text-[#4B1D3F]/40 sm:hidden" aria-hidden="true" />
        </a>
        <a href={`mailto:${email}`} className={contactClass}>
          <span className={`${iconCircle} w-11 h-11 bg-[#F3EEF8]`}><Mail className="w-5 h-5 text-[#4B1D3F]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#2A1A26]">Email</span><span className="block text-[13px] text-[#2A1A26]/65 break-all">{email}</span></span>
          <ChevronRight className="w-4 h-4 shrink-0 text-[#4B1D3F]/40 sm:hidden" aria-hidden="true" />
        </a>
      </div>
      <div className="sag-card rounded-3xl! p-2 sm:p-3">
        <p className="px-3 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Common questions</p>
        <ul className="divide-y divide-[#4B1D3F]/8">
          {links.map((link) => (
            <li key={link.label}>
              <button type="button" onClick={link.action} className="group w-full min-h-14 px-3 py-3 flex items-center justify-between gap-3 text-left rounded-2xl hover:bg-[#F3EEF8] cursor-pointer transition-colors">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#2A1A26]">{link.label}</span>
                  <span className="block text-[13px] text-[#2A1A26]/65">{link.hint}</span>
                </span>
                <span className="w-8 h-8 shrink-0 rounded-full bg-[#FBF7F3] group-hover:bg-white flex items-center justify-center transition-colors">
                  <ChevronRight className="w-4 h-4 text-[#4B1D3F]/60" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={() => onGo('contact')} className="sag-btn-outline w-full sm:w-auto h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
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
  const buyAgain = canBuyAgain(order);
  const canRate = isDelivered(order);
  const address = order.deliveryAddress;
  const streetLine = address ? [address.houseFlat, address.street, address.area].filter(Boolean).join(', ') : '';
  const placeLine = address ? `${[address.city, address.state].filter(Boolean).join(', ')} ${address.pincode || ''}`.trim() : '';
  const paid = order.paymentStatus === 'Paid';
  const awaitingPay = order.paymentStatus === 'Unpaid' && order.status === 'Pending';
  const latest = latestUpdate(order);
  const failed = paymentFailed(order);
  // Mobile: two buttons per row. "Return / exchange" has a row of its own; an odd last button fills its row.
  const halfButtons: Array<{ key: string; node: (wide: boolean) => React.ReactNode }> = [
    { key: 'track', node: (wide) => (
      <button type="button" onClick={onTrack} className={`sag-btn-primary ${actionClass} sm:px-5 ${wide ? 'col-span-2' : ''}`}>
        <TruckIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Track
      </button>
    ) },
    ...(hasReceipt(order) ? [{ key: 'receipt', node: (wide: boolean) => (
      <button type="button" onClick={onInvoice} className={`sag-btn-outline ${actionClass} sm:px-5 ${wide ? 'col-span-2' : ''}`}>
        <ReceiptIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Receipt
      </button>
    ) }] : []),
    ...(canCancel ? [{ key: 'cancel', node: (wide: boolean) => (
      <button type="button" onClick={onCancel} className={`sag-btn-outline ${actionClass} sm:px-5 ${wide ? 'col-span-2' : ''}`}>
        <XCircle className="w-4 h-4 shrink-0 text-current" /> Cancel order
      </button>
    ) }] : []),
    ...(buyAgain ? [{ key: 'again', node: (wide: boolean) => (
      <button type="button" onClick={onBuyAgain} className={`sag-btn-outline ${actionClass} sm:px-5 ${wide ? 'col-span-2' : ''}`}>
        <BagIcon className="w-4 h-4 shrink-0" mono live={false} /> Buy again
      </button>
    ) }] : []),
    { key: 'support', node: (wide) => (
      <a
        href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I need help with my order #${order.orderNumber}.`)}
        target="_blank"
        rel="noopener noreferrer"
        className={`sag-btn-outline ${actionClass} sm:px-5 ${wide ? 'col-span-2' : ''}`}
      >
        <WhatsAppIcon className="w-4 h-4 shrink-0" /> Support
      </a>
    ) },
  ];

  return (
    <article className="sag-card rounded-3xl! overflow-hidden" aria-labelledby={`order-${order.orderNumber}`}>
      <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 bg-[#FBF7F3]/70 border-b border-[#4B1D3F]/8 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Order</p>
            <h2 id={`order-${order.orderNumber}`} className="text-[#2A1A26] break-all leading-snug">
              <span className="font-sans font-semibold text-base tracking-wide">#{order.orderNumber}</span>
            </h2>
            <p className="text-[13px] text-[#2A1A26]/65 mt-0.5">
              Placed {formatDate(order.date)} · {pieces} {pieces === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2A1A26]/55">Total</p>
            <p className="font-serif text-2xl leading-tight text-[#4B1D3F]">{inr(order.finalTotal)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill order={order} />
          {!awaitingPay && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paid ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : order.paymentStatus === 'Refunded' ? 'bg-white border border-[#4B1D3F]/20 text-[#2A1A26]/75' : 'bg-[#F7E4EA] text-[#8A2E55]'}`}>
            <span className="sr-only">Payment: </span>{paid ? 'Paid online' : order.paymentStatus === 'Refunded' ? 'Refunded' : failed ? 'Payment failed' : 'Payment pending'}
          </span>}
        </div>
        {latest && (
          <p className="text-[13px] text-[#2A1A26]/70">
            <span className="font-semibold text-[#9C7A45]">Latest:</span> {latest.label} · {formatDateTime(latest.at)}
          </p>
        )}
      </header>

      <div className="p-4 sm:p-6 space-y-5">

      <PendingPayment order={order} />

      {/* An order still waiting for payment shows only the pay box (no delivery steps yet) */}
      {!awaitingPay && <OrderProgress order={order} compact />}

      <CourierCard order={order} />

      <DeliveryAgentCard order={order} />

      {order.customerNote && (
        <p className="rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#2A1A26]/80 leading-relaxed">
          <span className="font-semibold text-[#4B1D3F]">Note from our team:</span> {order.customerNote}
        </p>
      )}

      <ul className="rounded-2xl border border-[#4B1D3F]/10 divide-y divide-[#4B1D3F]/8" aria-label="Items in this order">
        {order.items.map((item) => {
          const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? ` · ${item.selectedColor.name}` : '';
          const unit = Number(item.product?.price) || 0;
          return (
            <li key={item.id} className="flex items-start gap-3 p-3">
              <button
                type="button"
                onClick={() => item.product?.id && onOpenProduct(String(item.product.id))}
                className="w-16 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] border border-[#4B1D3F]/10 cursor-pointer group"
                aria-label={`View ${item.product?.name || 'product'}`}
              >
                {item.product?.images?.[0] && (
                  <img src={getCleanImageUrl(item.product.images[0], 160)} alt="" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-serif text-[17px] text-[#2A1A26] leading-snug line-clamp-2">{item.product?.name}</p>
                  <p className="text-sm font-semibold text-[#2A1A26] shrink-0 pt-0.5">{inr(unit * item.quantity)}</p>
                </div>
                <p className="mt-0.5 text-[13px] text-[#2A1A26]/65">
                  {item.selectedSize ? `Size ${item.selectedSize}` : 'One size'}{colour} · {item.quantity} × {inr(unit)}
                </p>
                {canRate && item.product?.id && !item.lookParentId && (
                  <button
                    type="button"
                    onClick={() => onRate(String(item.product.id))}
                    className="mt-1.5 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full bg-[#FBF7F3] border border-[#4B1D3F]/10 text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer transition-colors"
                  >
                    <Star className="w-3.5 h-3.5 text-[#C5A46D] fill-[#C5A46D]" aria-hidden="true" /> Rate product
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {address && (address.fullName || placeLine) && (
        <div className="flex gap-3 rounded-2xl bg-[#FBF7F3] px-4 py-3.5 text-sm">
          <span className={`${iconCircle} w-10 h-10 bg-white`}><PinIcon className="w-5 h-5" /></span>
          <div className="min-w-0 text-[#2A1A26]/75 leading-relaxed">
            <p className="font-semibold text-[#2A1A26]">Delivering to {address.fullName}</p>
            {streetLine && <p className="break-words">{streetLine}</p>}
            {placeLine && <p>{placeLine}</p>}
            {address.mobile && <p>Phone: {address.mobile}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
        {halfButtons.map((button, index) => (
          <React.Fragment key={button.key}>
            {button.node(halfButtons.length % 2 === 1 && index === halfButtons.length - 1)}
          </React.Fragment>
        ))}
        {canStartReturn(order) && (
          <button type="button" onClick={onReturn} className={`sag-btn-outline ${actionClass} col-span-2 sm:px-5`}>
            <ReturnIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Return / exchange
          </button>
        )}
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
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  // Profile document from the read below, handed to the address book so it does not read it again
  const [profileDoc, setProfileDoc] = useState<Record<string, any> | null | undefined>(undefined);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [profile, setProfile] = useState({ fullName: '', phone: '', houseFlat: '', street: '', city: '', state: '', pincode: '' });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [returnFor, setReturnFor] = useState<OrderWithRequests | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<OrderWithRequests | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithRequests | null>(null);
  // Orders just updated by the server (e.g. after a cancel request), shown until the next order sync
  const [updatedOrders, setUpdatedOrders] = useState<Record<string, OrderWithRequests>>({});
  useEffect(() => setUpdatedOrders({}), [recentOrders]);

  useEffect(() => {
    if (!user?.email) return;
    setOrdersLoading(true);
    syncCustomerOrders(user.email).finally(() => setOrdersLoading(false));
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
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#FBF7F3]">
        <Loader2 className="w-6 h-6 animate-spin text-[#9C7A45]" />
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
  const openTab = (key: Tab) => {
    setActiveTab(key);
    window.setTimeout(() => document.getElementById(`account-tab-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 0);
  };
  const tiles: Array<{ key: Tab; label: string; icon: React.ElementType; note: string }> = [
    { key: 'orders', label: 'Orders', icon: OrdersIcon, note: recentOrders.length ? `${recentOrders.length} ${recentOrders.length === 1 ? 'order' : 'orders'}` : 'Track & manage' },
    { key: 'wishlist', label: 'Wishlist', icon: HeartIcon, note: wishlist.length ? `${wishlist.length} saved` : 'Saved styles' },
    { key: 'coupons', label: 'Coupons', icon: TagIcon, note: coupons.length ? `${coupons.length} available` : 'Offers' },
    { key: 'help', label: 'Help', icon: HelpIcon, note: 'Contact & FAQs' },
  ];
  const tileCount = (key: Tab) => (key === 'orders' ? recentOrders.length : key === 'wishlist' ? wishlist.length : key === 'coupons' ? coupons.length : 0);

  const displayName = profile.fullName || user.name || user.email.split('@')[0];
  const initial = (displayName.trim()[0] || 'S').toUpperCase();

  return (
    <div className="bg-[#FBF7F3] min-h-[70vh] pt-5 pb-10 sm:py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        <div className="sag-card rounded-3xl! p-4 sm:p-6 flex items-center gap-3.5 sm:gap-5">
          <span className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full bg-[#4B1D3F] text-white flex items-center justify-center font-serif text-2xl sm:text-3xl ring-4 ring-[#F3EEF8]" aria-hidden="true">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9C7A45]">My account</p>
            <h1 className="font-serif text-[26px] sm:text-4xl leading-tight text-[#2A1A26] truncate">
              Hello, <span className="sm:hidden">{displayName.trim().split(/\s+/)[0]}</span><span className="hidden sm:inline">{displayName}</span>
            </h1>
            <p className="text-[13px] sm:text-sm text-[#2A1A26]/65 truncate">{user.email}</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              showToast('You have been signed out.', 'info');
              setActivePage('home');
            }}
            aria-label="Sign out"
            className="sag-btn-outline shrink-0 inline-flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:px-5 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>

        <nav className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Account shortcuts">
          {tiles.map(({ key, label, icon: Icon, note }) => {
            const count = tileCount(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => openTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className={`sag-card rounded-2xl! px-1.5 py-3 sm:p-4 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left transition-colors cursor-pointer ${tab === key ? 'border-[#4B1D3F]/40! bg-[#F3EEF8]/70!' : 'hover:bg-[#F3EEF8]/60!'}`}
              >
                <span className="relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full bg-[#F3EEF8] ring-1 ring-[#4B1D3F]/8 flex items-center justify-center">
                  <Icon className="w-6 h-6" />
                  {count > 0 && (
                    <span className="sm:hidden absolute -top-1 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#4B1D3F] text-white text-[11px] font-semibold leading-5 text-center ring-2 ring-white">{count > 99 ? '99+' : count}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] sm:text-sm font-semibold text-[#2A1A26]">{label}</span>
                  <span className="hidden sm:block text-[13px] text-[#2A1A26]/65 truncate">{note}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 py-1" role="tablist" aria-label="My account">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              id={`account-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls="account-panel"
              onClick={() => setActiveTab(key)}
              className={`shrink-0 inline-flex items-center gap-2 h-11 pl-3 pr-4 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                tab === key ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white shadow-[var(--sag-shadow)]' : 'bg-white border-[#4B1D3F]/12 text-[#2A1A26]/75 hover:bg-[#F3EEF8] hover:text-[#2A1A26]'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" mono={tab === key} live={false} />
              {label}
              {key === 'wishlist' && wishlist.length > 0 && (
                <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] leading-5 text-center ${tab === key ? 'bg-white/20 text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>{wishlist.length}</span>
              )}
            </button>
          ))}
        </div>

        <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
          {tab === 'orders' && (
            <section className="space-y-4">
              {ordersLoading && recentOrders.length === 0 ? (
                <div className="py-16 flex justify-center" role="status" aria-label="Loading your orders"><Loader2 className="w-6 h-6 animate-spin text-[#9C7A45]" /></div>
              ) : recentOrders.length === 0 ? (
                <EmptyState icon={<BagIcon className="w-8 h-8" />} title="No orders yet" text={<>Orders placed with <span className="break-all">{user.email}</span> appear here on every device.</>}>
                  <button onClick={() => setActivePage('shop')} className="sag-btn-primary h-11 px-7 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">
                    Start shopping
                  </button>
                </EmptyState>
              ) : (
                <>
                  <SectionIntro title="My orders" text="Track deliveries, download receipts and manage returns." />
                  <div className="space-y-3">
                    <label className="relative block">
                      <span className="sr-only">Search your orders</span>
                      <Search className="w-4 h-4 text-[#4B1D3F]/55 absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type="search"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder="Search by order number or product"
                        className="w-full h-12 pl-11 pr-4 bg-white border border-[#4B1D3F]/15 hover:border-[#4B1D3F]/30 focus:border-[#4B1D3F]/70 focus:ring-4 focus:ring-[#F3EEF8] rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/45 shadow-[var(--sag-shadow)] transition focus:outline-none"
                      />
                    </label>
                    <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap py-0.5" role="group" aria-label="Filter orders by status">
                      {ORDER_FILTERS.map(({ key, label }) => {
                        const count = key === 'all' ? shownOrders.length : filterCount(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={orderFilter === key}
                            onClick={() => setOrderFilter(key)}
                            className={`shrink-0 inline-flex items-center gap-1.5 h-10 pl-4 pr-2 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                              orderFilter === key ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/12 text-[#2A1A26]/80 hover:bg-[#F3EEF8]'
                            }`}
                          >
                            {label}
                            <span className={`min-w-6 h-6 px-1.5 rounded-full text-[11px] leading-6 text-center ${orderFilter === key ? 'bg-white/20 text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {filteredOrders.length === 0 ? (
                    <EmptyState
                      icon={<Search className="w-7 h-7 text-[#4B1D3F]" />}
                      title="No orders match"
                      text={<>{searchText ? `Nothing found for “${orderSearch.trim()}”` : 'No orders with this status'}{orderFilter !== 'all' ? ` under ${ORDER_FILTERS.find((f) => f.key === orderFilter)?.label}` : ''}.</>}
                    >
                      <button type="button" onClick={() => { setOrderSearch(''); setOrderFilter('all'); }} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
                        Show all orders
                      </button>
                      <button type="button" onClick={() => goPage('shop')} className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">
                        Continue shopping
                      </button>
                    </EmptyState>
                  ) : (
                    filteredOrders.map((order) => (
                      <OrderCard
                        key={order.orderNumber}
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
                    ))
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
                <EmptyState icon={<HeartIcon className="w-8 h-8" />} title="Your wishlist is empty" text="Tap the heart on any product to save it here.">
                  <button type="button" onClick={() => goPage('shop')} className="sag-btn-primary h-11 px-7 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">Explore styles</button>
                </EmptyState>
              ) : (
                <>
                  <SectionIntro title="Wishlist" text={`${wishlist.length} ${wishlist.length === 1 ? 'style' : 'styles'} saved to your account.`} />
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {wishlist.map((saved) => {
                      const live = allProducts.find((p) => String(p.id) === String(saved.id));
                      return live ? <ProductCard key={saved.id} product={live} /> : (
                        <div key={saved.id} className="sag-card overflow-hidden flex flex-col">
                          <div className="aspect-[4/5] bg-[#F3EEF8] flex flex-col items-center justify-center gap-2 px-3 text-center">
                            <span className={`${iconCircle} w-12 h-12 bg-white`}><HeartIcon className="w-6 h-6" mono /></span>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4B1D3F]/70">No longer available</span>
                          </div>
                          <div className="p-3 sm:p-4 flex flex-1 flex-col justify-between gap-3">
                            <p className="font-serif text-base leading-snug text-[#2A1A26] line-clamp-2">{saved.name}</p>
                            <button onClick={() => toggleWishlist(saved)} className="sag-btn-outline h-10 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Remove</button>
                          </div>
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
              <form onSubmit={handleSaveProfile} className="sag-card rounded-3xl! p-5 sm:p-7 space-y-6">
                <div className="flex items-center gap-3 rounded-2xl bg-[#FBF7F3] px-4 py-3">
                  <span className={`${iconCircle} w-10 h-10 bg-white`}><UserIcon className="w-5 h-5" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9C7A45]">Signed in with</p>
                    <p className="text-sm font-medium text-[#2A1A26] break-all">{user.email}</p>
                  </div>
                </div>

                <fieldset className="grid gap-4 sm:grid-cols-2">
                  <legend className="mb-3 font-serif text-xl text-[#4B1D3F]">Contact</legend>
                  <label className="space-y-1.5">
                    <span className={labelClass}>Full name</span>
                    <input className={inputClass} disabled={!profileLoaded} autoComplete="name" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelClass}>Mobile</span>
                    <input className={inputClass} disabled={!profileLoaded} inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                  </label>
                </fieldset>

                <fieldset className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 pt-5 border-t border-[#4B1D3F]/8">
                  <legend className="sr-only">Address</legend>
                  <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-serif text-xl text-[#4B1D3F]">Address</p>
                    <p className="text-[13px] text-[#2A1A26]/65">
                      Saving more than one? Use{' '}
                      <button type="button" onClick={() => openTab('addresses')} className="font-semibold text-[#4B1D3F] underline underline-offset-2 cursor-pointer">Addresses</button>
                    </p>
                  </div>
                  <label className="space-y-1.5 col-span-2">
                    <span className={labelClass}>House / flat, building</span>
                    <input className={inputClass} disabled={!profileLoaded} autoComplete="address-line1" value={profile.houseFlat} onChange={(e) => setProfile({ ...profile, houseFlat: e.target.value })} />
                  </label>
                  <label className="space-y-1.5 col-span-2">
                    <span className={labelClass}>Street / area</span>
                    <input className={inputClass} disabled={!profileLoaded} autoComplete="address-line2" value={profile.street} onChange={(e) => setProfile({ ...profile, street: e.target.value })} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelClass}>PIN code</span>
                    <input className={inputClass} disabled={!profileLoaded} inputMode="numeric" autoComplete="postal-code" placeholder="6-digit PIN" value={profile.pincode} onChange={(e) => handlePincode(e.target.value)} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelClass}>City</span>
                    <input className={inputClass} disabled={!profileLoaded} autoComplete="address-level2" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                  </label>
                  <label className="space-y-1.5 col-span-2">
                    <span className={labelClass}>State</span>
                    <input className={inputClass} disabled={!profileLoaded} autoComplete="address-level1" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
                  </label>
                </fieldset>

                <div className="pt-1">
                  <button type="submit" disabled={savingProfile || !profileLoaded} className="sag-btn-primary w-full sm:w-auto h-12 px-8 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                    {savingProfile && <Loader2 className="w-4 h-4 animate-spin text-current" />}
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {tab === 'style' && <StyleProfile />}

          {tab === 'returns' && (
            <section className="space-y-4">
              <SectionIntro title="Returns & exchanges" />
              <div className="flex gap-3 rounded-3xl bg-[#F3EEF8] p-4 sm:p-5">
                <span className={`${iconCircle} w-11 h-11 bg-white`}><ReturnIcon className="w-6 h-6" /></span>
                <p className="min-w-0 text-sm text-[#2A1A26]/80 leading-relaxed">
                  You can ask for a return or a size exchange within 7 days of delivery. Pieces must be unused and unwashed, with their original tags; clearance pieces (50% or more off) can be exchanged for another size only. Add photos if something arrived damaged or wrong. Our team reviews every request and emails you.{' '}
                  <button onClick={() => setActivePage('return-policy')} className="font-semibold underline underline-offset-2 text-[#4B1D3F] cursor-pointer">Return policy</button>
                </p>
              </div>

              {returnable.length > 0 && (
                <div className="sag-card rounded-3xl! p-4 sm:p-6 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Ready to return or exchange</p>
                  <ul className="divide-y divide-[#4B1D3F]/8">
                    {returnable.map((order) => (
                      <li key={order.orderNumber} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="w-14 aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-[#F3EEF8] border border-[#4B1D3F]/10">
                            {order.items[0]?.product?.images?.[0] && <img src={getCleanImageUrl(order.items[0].product.images[0], 140)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#2A1A26] break-all">#{order.orderNumber}</p>
                            <p className="text-[13px] text-[#2A1A26]/65">
                              {order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {inr(order.finalTotal)}
                            </p>
                            {formatWindowEnd(order.returnEligibility?.windowEndsAt) && (
                              <p className="mt-1 inline-block rounded-full bg-[#F7E4EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#8A2E55]">Request by {formatWindowEnd(order.returnEligibility?.windowEndsAt)}</p>
                            )}
                          </div>
                        </div>
                        <button type="button" onClick={() => setReturnFor(order)} className={`sag-btn-primary ${actionClass} px-5 w-full sm:w-auto`}>
                          <ReturnIcon className="w-[18px] h-[18px]" mono live={false} /> Start return / exchange
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {withRequests.map((order) => (
                <div key={order.orderNumber} className="sag-card rounded-3xl! p-4 sm:p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">Order</p>
                      <p className="text-sm font-semibold text-[#2A1A26] break-all">#{order.orderNumber}</p>
                    </div>
                    <button type="button" onClick={() => openTrack(order)} className="inline-flex items-center gap-1 h-10 px-4 rounded-full border border-[#4B1D3F]/20 text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer transition-colors">
                      View order <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <ReturnProgress order={order} />
                </div>
              ))}

              {returnable.length === 0 && withRequests.length === 0 && (
                <EmptyState icon={<ReturnIcon className="w-8 h-8" />} title="Nothing to return right now" text="Delivered orders appear here for 7 days after delivery." />
              )}
            </section>
          )}
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
