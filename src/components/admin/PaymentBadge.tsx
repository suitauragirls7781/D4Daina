import React from 'react';
import { Order } from '../../types';
import { paymentFailed } from '../OrderProgress';

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
  Paid: 'Paid',
  Refunded: 'Refunded',
  Failed: 'Payment failed',
  Pending: 'Payment pending',
};

const TONE: Record<PaymentState, { badge: string; dot: string }> = {
  Paid: { badge: 'bg-ok-tint text-ok border-ok-line', dot: 'bg-ok' },
  Refunded: { badge: 'bg-sunken text-ink border-line', dot: 'bg-ink/50' },
  Failed: { badge: 'bg-danger-tint text-danger border-danger-line', dot: 'bg-danger' },
  Pending: { badge: 'bg-page text-ink-muted border-line', dot: 'bg-line' },
};

export const PaymentBadge: React.FC<{ order: Order; className?: string }> = ({ order, className = '' }) => {
  const state = paymentStateOf(order);
  return (
    <span className={`px-2.5 py-1 border rounded-md font-semibold text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap ${TONE[state].badge} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE[state].dot}`} aria-hidden="true" />
      <span className="sr-only">Payment: </span>{LABEL[state]}
    </span>
  );
};

/** Brand-palette tone (badge classes + dot) for an order's fulfilment status, shared by the admin order screens. */
export const orderStatusTone = (status: string): { badge: string; dot: string } => {
  switch (status) {
    case 'Delivered':
      return { badge: 'bg-ok-tint text-ok border-ok-line', dot: 'bg-ok' };
    case 'Shipped':
    case 'In Transit':
    case 'Out for Delivery':
      return { badge: 'bg-sunken text-ink border-line', dot: 'bg-brand' };
    case 'Packed':
      return { badge: 'bg-sunken-deep text-ink border-line', dot: 'bg-ink/50' };
    case 'Processing':
    case 'Paid':
      return { badge: 'bg-page text-ink border-line', dot: 'bg-line' };
    case 'Pending':
      return { badge: 'bg-white text-ink-muted border-line', dot: 'bg-ink/50' };
    case 'Refund Requested':
    case 'Returned':
      return { badge: 'bg-sale-tint text-sale border-sale-line', dot: 'bg-sale' };
    case 'Cancelled':
    case 'Refunded':
      return { badge: 'bg-danger-tint text-danger border-danger-line', dot: 'bg-danger' };
    default:
      return { badge: 'bg-white text-ink-muted border-line', dot: 'bg-ink/50' };
  }
};

export const OrderStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
  const tone = orderStatusTone(status);
  return (
    <span className={`px-2.5 py-1 border rounded-md font-semibold text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap ${tone.badge} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {status}
    </span>
  );
};
