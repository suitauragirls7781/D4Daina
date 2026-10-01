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
  Paid: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600' },
  Refunded: { badge: 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15', dot: 'bg-[#4B1D3F]/50' },
  Failed: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-600' },
  Pending: { badge: 'bg-[#FBF7F3] text-[#2A1A26]/80 border-[#C5A46D]/50', dot: 'bg-[#C5A46D]' },
};

export const PaymentBadge: React.FC<{ order: Order; className?: string }> = ({ order, className = '' }) => {
  const state = paymentStateOf(order);
  return (
    <span className={`px-2.5 py-1 border rounded-full font-semibold text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap ${TONE[state].badge} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE[state].dot}`} aria-hidden="true" />
      <span className="sr-only">Payment: </span>{LABEL[state]}
    </span>
  );
};

/** Brand-palette tone (badge classes + dot) for an order's fulfilment status, shared by the admin order screens. */
export const orderStatusTone = (status: string): { badge: string; dot: string } => {
  switch (status) {
    case 'Delivered':
      return { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600' };
    case 'Shipped':
    case 'In Transit':
    case 'Out for Delivery':
      return { badge: 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/20', dot: 'bg-[#4B1D3F]' };
    case 'Packed':
      return { badge: 'bg-[#E6DDF0] text-[#4B1D3F] border-[#4B1D3F]/20', dot: 'bg-[#4B1D3F]/60' };
    case 'Processing':
    case 'Paid':
      return { badge: 'bg-[#FBF7F3] text-[#2A1A26] border-[#C5A46D]/60', dot: 'bg-[#C5A46D]' };
    case 'Pending':
      return { badge: 'bg-white text-[#2A1A26]/70 border-[#4B1D3F]/15', dot: 'bg-[#2A1A26]/35' };
    case 'Refund Requested':
    case 'Returned':
      return { badge: 'bg-[#F7E4EA] text-[#8A2E55] border-[#8A2E55]/20', dot: 'bg-[#8A2E55]' };
    case 'Cancelled':
    case 'Refunded':
      return { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-600' };
    default:
      return { badge: 'bg-white text-[#2A1A26]/70 border-[#4B1D3F]/15', dot: 'bg-[#2A1A26]/35' };
  }
};

export const OrderStatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
  const tone = orderStatusTone(status);
  return (
    <span className={`px-2.5 py-1 border rounded-full font-semibold text-[11px] inline-flex items-center gap-1.5 whitespace-nowrap ${tone.badge} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {status}
    </span>
  );
};
