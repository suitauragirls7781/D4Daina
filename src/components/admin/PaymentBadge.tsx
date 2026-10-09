import React from 'react';
import { Order } from '../../types';
import { paymentFailed } from '../OrderProgress';

/**
 * The shared pieces of the admin sales pages (orders, order details, returns, cancellations, abandoned
 * checkouts, customers, leads, reviews) in the "Aura" look: status pills, the page title, the row
 * of key numbers, titled white cards, and the class names for buttons, fields, chips and tables.
 * Every page is built in the same order: title, key numbers, filters, the list, an honest empty state.
 */

// ---------------------------------------------------------------- class names

export const adminUi = {
  /** A few large panels per page (white cards, 22px corners, no line). */
  panel: 'sag-glass p-4 sm:p-5',
  /** Panel without padding, for tables and lists that run edge to edge. */
  panelFlush: 'sag-glass overflow-hidden',
  /** One of many repeated cards in a list (the same white card). */
  card: 'sag-card p-4 sm:p-5',
  /** A quiet box inside a panel: paper, 16px corners. */
  inset: 'rounded-[16px] bg-page p-3.5',
  primary: 'sag-btn-primary h-11 px-5 gap-2 whitespace-nowrap disabled:cursor-not-allowed',
  outline: 'sag-btn-outline h-11 px-5 gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
  /** Compact buttons for table rows. */
  primarySmall: 'sag-btn-primary h-10 px-4 gap-1.5 whitespace-nowrap disabled:cursor-not-allowed',
  outlineSmall: 'sag-btn-outline h-10 px-4 gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
  /** "Say no" or delete: always with words, kept apart from the main action. */
  danger: 'h-11 px-5 rounded-full border border-danger-line bg-danger-tint text-danger text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors hover:bg-sunken-deep disabled:opacity-50 disabled:cursor-not-allowed',
  iconBtn: 'w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center text-ink cursor-pointer transition-colors hover:bg-sunken-deep disabled:opacity-40',
  field: 'sag-input h-11',
  search: 'sag-input h-11 pl-10',
  select: 'sag-input h-11 pr-8 cursor-pointer',
  textarea: 'sag-input min-h-[76px]',
  label: 'sag-label',
  hint: 'mt-1.5 text-[13px] leading-[18px] text-ink-muted',
  /** Filter chip: pass aria-pressed, or data-selected for a tab. Selected is an ink pill with paper text. */
  chip: 'sag-chip h-10 shrink-0 gap-1.5 whitespace-nowrap',
  chipRow: 'flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0',
  link: 'font-bold text-brand underline underline-offset-[3px] decoration-brand-line hover:text-brand-dark cursor-pointer',
  h2: 'font-sans text-[18px] leading-6 font-extrabold tracking-[-0.015em] text-ink',
  /** Table header cell: small muted capitals that stay in view while the list scrolls. */
  th: 'sticky top-0 z-10 bg-surface py-3 px-3 text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted border-b border-line whitespace-nowrap',
  td: 'py-3.5 px-3 align-top',
  row: 'transition-colors hover:bg-sunken',
  check: 'w-[22px] h-[22px] shrink-0 accent-brand',
  checkRow: 'min-h-11 flex items-center gap-2.5 text-sm leading-5 text-ink cursor-pointer',
  alert: 'rounded-[16px] border border-danger-line bg-danger-tint px-4 py-3 text-sm leading-5 font-medium text-danger',
  avatar: 'shrink-0 rounded-full bg-sunken text-ink text-sm font-semibold flex items-center justify-center',
  photo: 'shrink-0 aspect-[4/5] rounded-[12px] object-cover object-top bg-sunken',
};

// ---------------------------------------------------------------- pills

/** good = fine or the current step (forest), plain = done (sand with ink text), muted = finished or nothing to do, danger = a real problem. */
export type PillTone = 'good' | 'plain' | 'muted' | 'danger';

const PILL_TONE: Record<PillTone, string> = {
  good: 'border-ok-line bg-ok-tint text-ok',
  plain: 'border-transparent bg-sunken text-ink',
  muted: 'border-transparent bg-sunken text-ink-muted',
  danger: 'border-danger-line bg-danger-tint text-danger',
};
const PILL_DOT: Record<PillTone, string> = { good: 'bg-ok', plain: 'bg-ink', muted: 'bg-ink-faint', danger: 'bg-danger' };
const PILL = 'inline-flex items-center gap-1.5 min-h-6 px-2.5 py-0.5 rounded-full border text-xs leading-4 font-semibold whitespace-nowrap';

export const pillClass = (tone: PillTone) => `${PILL} ${PILL_TONE[tone]}`;

export const Pill: React.FC<{ tone?: PillTone; dot?: boolean; className?: string; children: React.ReactNode }> = ({ tone = 'plain', dot, className = '', children }) => (
  <span className={`${pillClass(tone)} ${className}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${PILL_DOT[tone]}`} aria-hidden="true" />}
    {children}
  </span>
);

// ---------------------------------------------------------------- page skeleton

interface PageTitleProps {
  title: React.ReactNode;
  /** One plain line: what this page is for. */
  line?: React.ReactNode;
  /** The page's own buttons (refresh, export, add). */
  actions?: React.ReactNode;
  id?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({ title, line, actions, id }) => (
  <header id={id} className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-6">
    <div className="min-w-0 flex-1">
      <h2 className="font-display text-[28px] leading-8 sm:text-[32px] sm:leading-9 text-ink break-words">{title}</h2>
      {line && <p className="mt-1.5 text-sm leading-5 text-ink-muted max-w-2xl">{line}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">{actions}</div>}
  </header>
);

export interface KeyNumber {
  label: string;
  value: React.ReactNode;
  /** A short line under the number, in plain words. */
  note?: React.ReactNode;
  /** Dark rose when the number asks for attention. */
  highlight?: boolean;
}

/** The row of key numbers under the page title. Real counts only. */
export const KeyNumbers: React.FC<{ items: KeyNumber[]; label?: string }> = ({ items, label = 'Key numbers' }) => (
  <dl aria-label={label} className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${items.length >= 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : ''}`}>
    {items.map((item) => (
      <div key={item.label} className="sag-glass min-w-0 px-4 py-3.5">
        <dt className="text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted">{item.label}</dt>
        <dd className={`mt-1 text-[28px] leading-8 font-extrabold tracking-[-0.02em] sag-num break-words ${item.highlight ? 'text-sale' : 'text-ink'}`}>{item.value}</dd>
        {item.note && <dd className="mt-0.5 text-xs leading-4 text-ink-muted">{item.note}</dd>}
      </div>
    ))}
  </dl>
);

/** A titled white card: the building block of forms and detail pages. */
export const Panel: React.FC<{ title: React.ReactNode; icon?: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; id?: string; className?: string; children: React.ReactNode }> = ({ title, icon, hint, action, id, className = '', children }) => (
  <section id={id} className={`${adminUi.panel} ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-4 border-b border-line">
      <div className="min-w-0">
        <h3 className={`${adminUi.h2} flex items-center gap-2`}>
          {icon && <span className="shrink-0 text-brand [&>svg]:w-[18px] [&>svg]:h-[18px]" aria-hidden="true">{icon}</span>}
          <span className="min-w-0">{title}</span>
        </h3>
        {hint && <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** Honest empty state: says plainly that there is nothing here. */
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; line?: React.ReactNode; children?: React.ReactNode }> = ({ icon, title, line, children }) => (
  <div className="sag-glass px-5 py-12 text-center">
    {icon && <span className="mx-auto mb-3 flex justify-center text-ink-muted [&>svg]:w-7 [&>svg]:h-7" aria-hidden="true">{icon}</span>}
    <p className="text-base leading-6 font-bold text-ink">{title}</p>
    {line && <p className="mt-1 text-sm leading-5 text-ink-muted max-w-md mx-auto">{line}</p>}
    {children && <div className="mt-4 flex justify-center">{children}</div>}
  </div>
);

/** Label and value on one line (payment rows, totals). */
export const InfoRow: React.FC<{ label: React.ReactNode; children: React.ReactNode; strong?: boolean }> = ({ label, children, strong }) => (
  <div className="flex items-baseline justify-between gap-4 text-sm leading-5">
    <span className="shrink-0 text-ink-muted">{label}</span>
    <span className={`min-w-0 text-right break-words text-ink sag-num ${strong ? 'font-semibold' : ''}`}>{children}</span>
  </div>
);

// ---------------------------------------------------------------- payment and order status

export type PaymentState = 'Paid' | 'Refunded' | 'Failed' | 'Pending';

/**
 * Payment state for the admin panel, kept separate from the order status: Paid, Refunded, Failed (unpaid and the
 * latest update is a 'Payment failed' entry from the gateway) or Pending.
 */
export const paymentStateOf = (order: Order): PaymentState => {
  if (order.paymentStatus === 'Paid') return 'Paid';
  if (order.paymentStatus === 'Refunded') return 'Refunded';
  return paymentFailed(order) ? 'Failed' : 'Pending';
};

const LABEL: Record<PaymentState, string> = {
  Paid: 'Paid online',
  Refunded: 'Refunded',
  Failed: 'Payment failed',
  Pending: 'Not paid yet',
};

const PAYMENT_TONE: Record<PaymentState, PillTone> = { Paid: 'good', Refunded: 'muted', Failed: 'danger', Pending: 'muted' };

export const PaymentBadge: React.FC<{ order: Order; className?: string }> = ({ order, className = '' }) => {
  const state = paymentStateOf(order);
  // A cash-on-delivery order is "paid" once its advance was paid online; the rest is cash at the door
  const label = state === 'Paid' && order.payMode === 'cod' ? 'Cash on delivery' : LABEL[state];
  return (
    <Pill tone={PAYMENT_TONE[state]} dot className={className}>
      <span className="sr-only">Payment: </span>{label}
    </Pill>
  );
};

/** Tone of an order's status: forest while it is moving or needs you, plain once delivered, muted once stopped. */
export const orderStatusPillTone = (status: string): PillTone => {
  switch (status) {
    case 'Pending':
    case 'Processing':
    case 'Paid':
    case 'Packed':
    case 'Shipped':
    case 'In Transit':
    case 'Out for Delivery':
    case 'Refund Requested':
      return 'good';
    case 'Delivered':
      return 'plain';
    default:
      return 'muted';
  }
};

/** Badge classes and dot colour for an order's status, shared by the admin order screens. */
export const orderStatusTone = (status: string): { badge: string; dot: string } => {
  const tone = orderStatusPillTone(status);
  return { badge: PILL_TONE[tone], dot: PILL_DOT[tone] };
};

export const OrderStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => (
  <Pill tone={orderStatusPillTone(status)} dot className={className}>{status}</Pill>
);
