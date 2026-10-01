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
    <div className="rounded-2xl border border-[#8A2E55]/15 bg-[#F7E4EA] p-4 sm:p-5 space-y-4" role="region" aria-label="Payment pending">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center"><LockIcon className="w-5 h-5" live={false} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#8A2E55]">Payment pending · ₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-[#8A2E55]/90">
            This order is confirmed only after the payment is verified. If money was already deducted, tap “Check payment” instead of paying again.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:flex">
        <button type="button" onClick={pay} disabled={Boolean(busy)} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
          {busy === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockIcon className="h-4 w-4" mono live={false} />} Pay ₹{Number(order.finalTotal || 0).toLocaleString('en-IN')}
        </button>
        <button type="button" onClick={check} disabled={Boolean(busy)} className="sag-btn-outline bg-white h-11 px-5 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
          {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check payment
        </button>
      </div>
    </div>
  );
};
