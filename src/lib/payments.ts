import { ordersApi } from './api';
import { Order } from '../types';

export type Gateway = 'razorpay' | 'payu';

type MethodSwitches = { enableUpi?: boolean; enableCards?: boolean; enableNetBanking?: boolean };

/** Razorpay window blocks, following the admin's method switches (all off counts as all on, so paying always works). */
/** The UPI apps the checkout offers as one-tap choices (Razorpay's own app codes). */
export const UPI_APPS = [
  { id: 'google_pay', name: 'Google Pay' },
  { id: 'phonepe', name: 'PhonePe' },
  { id: 'paytm', name: 'Paytm' },
] as const;
export type UpiAppId = typeof UPI_APPS[number]['id'];

export const razorpayDisplayConfig = (settings?: MethodSwitches, preferredApp?: UpiAppId | '') => {
  const none = !settings?.enableUpi && !settings?.enableCards && !settings?.enableNetBanking;
  const upi = none || Boolean(settings?.enableUpi);
  const cards = none || Boolean(settings?.enableCards);
  const banking = none || Boolean(settings?.enableNetBanking);
  const blocks: Record<string, { name: string; instruments: Array<Record<string, unknown>> }> = {};
  if (upi) {
    // The app the shopper tapped on the checkout page comes first; every other way to pay still follows it
    const picked = UPI_APPS.find((app) => app.id === preferredApp);
    if (picked) blocks.upiPicked = { name: `Pay with ${picked.name}`, instruments: [{ method: 'upi', flows: ['intent'], apps: [picked.id] }] };
    // No app list: Razorpay then offers every UPI app installed on the phone (GPay, PhonePe, Paytm, BHIM, CRED, bank apps...)
    blocks.upiApps = { name: 'Pay with any UPI app', instruments: [{ method: 'upi', flows: ['intent'] }] };
    // Laptops and phones without a UPI app: scan the QR with any UPI app, or type a UPI ID
    blocks.upiOther = { name: 'Scan QR or enter UPI ID', instruments: [{ method: 'upi', flows: ['qr', 'collect'] }] };
  }
  const other = [...(cards ? [{ method: 'card' }] : []), ...(banking ? [{ method: 'netbanking' }, { method: 'wallet' }] : [])];
  if (other.length) blocks.other = { name: cards && banking ? 'Cards, net banking & wallets' : cards ? 'Debit & credit cards' : 'Net banking & wallets', instruments: other };
  // Methods the admin switched off are hidden everywhere in the window, not only left out of the blocks
  const hide = [
    ...(cards ? [] : [{ method: 'card' }, { method: 'emi' }]),
    ...(banking ? [] : [{ method: 'netbanking' }, { method: 'wallet' }, { method: 'paylater' }, { method: 'cardless_emi' }]),
  ];
  return { display: { blocks, sequence: Object.keys(blocks).map((key) => `block.${key}`), preferences: { show_default_blocks: false }, ...(hide.length ? { hide } : {}) } };
};

export const loadRazorpaySDK = (): Promise<boolean> => new Promise((resolve) => {
  if ((window as any).Razorpay) return resolve(true);
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  const script = existing || document.createElement('script');
  script.addEventListener('load', () => resolve(true));
  script.addEventListener('error', () => resolve(false));
  if (!existing) {
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }
});

/** PayU takes the customer to its own secure page: the server-signed fields are posted with a normal form. */
export const submitToPayu = (action: string, fields: Record<string, string>) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
};

type PaymentSession = {
  gateway?: Gateway; alreadyPaid?: boolean; orderNumber: string; order: Order;
  razorpayOrderId?: string; amount?: number; currency?: string; keyId?: string;
  payuAction?: string; payuFields?: Record<string, string>;
};

/**
 * Pays an order that is still awaiting payment (same order number and prices). Resolves with the verified
 * order when paid in the Razorpay window, 'redirect' when the customer is sent to PayU, or 'dismissed'.
 */
export const payPendingOrder = async (
  orderNumber: string,
  { prefill, methods }: { prefill?: { name?: string; email?: string; contact?: string }; methods?: MethodSwitches } = {},
): Promise<Order | 'redirect' | 'dismissed'> => {
  const sdk = loadRazorpaySDK();
  const session = await ordersApi<PaymentSession>('pay-again', { orderNumber });
  if (session.alreadyPaid) return session.order;
  if (session.gateway === 'payu' && session.payuAction && session.payuFields) {
    submitToPayu(session.payuAction, session.payuFields);
    return 'redirect';
  }
  if (!(await sdk) || !(window as any).Razorpay) throw new Error('Could not load the payment window. Check your connection and try again.');
  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      amount: session.amount,
      currency: session.currency,
      name: 'Suit Aura Girls',
      description: `Order ${orderNumber}`,
      image: '/suit-aura-logo-512.png',
      prefill: prefill || {},
      notes: { order_number: orderNumber },
      theme: { color: '#161514' },
      config: razorpayDisplayConfig(methods),
      retry: { enabled: true },
      handler: async (response: any) => {
        try {
          const verified = await ordersApi<{ order: Order }>('verify', {
            orderNumber,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          resolve(verified.order);
        } catch (error) {
          reject(error);
        }
      },
      modal: { confirm_close: true, ondismiss: () => resolve('dismissed') },
    });
    rzp.open();
  });
};
