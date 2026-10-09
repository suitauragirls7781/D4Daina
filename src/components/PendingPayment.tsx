import React, { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { LockIcon } from './StoreIcons';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import { ordersApi } from '../lib/api';
import { payPendingOrder } from '../lib/payments';
import { Order } from '../types';

/** "Pay ₹X" for an order still awaiting payment, plus a server-side check for payments made but not yet confirmed. */
export const PendingPayment: React.FC<{ order: Order }> = ({ order }) => {
  const { showToast, syncCustomerOrders } = useShop();
  const { paymentSettings } = useAdmin();
  const { user } = useAuth();
  const [busy, setBusy] = useState<'' | 'pay' | 'check'>('');

  if (order.paymentStatus !== 'Unpaid' || order.status !== 'Pending') return null;

  const refresh = () => { if (user?.email) syncCustomerOrders(user.email); };

  const pay = async () => {
    if (busy) return;
    setBusy('pay');
    try {
      const result = await payPendingOrder(order.orderNumber, {
        prefill: { name: order.customerName, email: order.customerEmail || user?.email || '' },
        methods: paymentSettings,
      });
      if (result === 'redirect') return;
      if (result === 'dismissed') showToast('Payment cancelled. No money was taken.', 'info');
      else {
        showToast('Payment received. Your order is confirmed.', 'success');
        refresh();
      }
    } catch (error: any) {
      showToast(error?.message || 'Could not start the payment. Please try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const check = async () => {
    if (busy) return;
    setBusy('check');
    try {
      const result = await ordersApi<{ paid: boolean; gatewayNote: string }>('payment-result', { orderNumber: order.orderNumber });
      if (result.paid) {
        showToast('Payment found. Your order is confirmed.', 'success');
        refresh();
      } else {
        showToast(result.gatewayNote === 'pending' ? 'Your bank has not confirmed the payment yet. Please check again in a few minutes.' : 'No completed payment found for this order yet.', 'info');
      }
    } catch (error: any) {
      showToast(error?.message || 'Could not check the payment right now.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="aco-note block! p-[18px]! space-y-4" role="region" aria-label="Payment pending">
      <div className="min-w-0">
        <p className="aura-lbl flex items-center gap-2 text-ink!">
          <LockIcon className="w-[18px] h-[18px] shrink-0" mono live={false} /> Payment pending
        </p>
        <p className="aura-num mt-2 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ink">₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}</p>
        <p className="mt-2 text-[14.5px] leading-5 text-ink">
          This order is confirmed only after the payment is verified. If money was already deducted, tap “Check payment” instead of paying again.
        </p>
      </div>
      <div className="grid gap-2.5 sm:flex">
        <button type="button" onClick={pay} disabled={Boolean(busy)} className="aura-btn aura-num px-6!">
          {busy === 'pay' ? <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.6} aria-hidden="true" /> : <LockIcon className="h-[18px] w-[18px]" mono live={false} />} Pay ₹{Number(order.finalTotal || 0).toLocaleString('en-IN')} securely
        </button>
        <button type="button" onClick={check} disabled={Boolean(busy)} className="aura-btn aura-btn-line px-6!">
          {busy === 'check' ? <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.6} aria-hidden="true" /> : <RefreshCw className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />} Check payment
        </button>
      </div>
    </div>
  );
};
