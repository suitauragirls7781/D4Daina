import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { adminDb } from '../../lib/firebase';
import { ordersApi } from '../../lib/api';
import { CANCELLABLE_STATUSES, CancelRequest, RETURN_STATUS_LABEL, formatExpectedDate, returnRequestOf, returnStatusOf, timelineLabel } from '../OrderProgress';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { findCourier, trackingLinkFor } from '../../utils/courier';
import { formatDeliveryDate } from '../../utils/delivery';
import { formatOrderDate } from '../../utils/orderDate';
import { EmptyState, InfoRow, OrderStatusBadge, Panel, PaymentBadge, Pill, adminUi } from './PaymentBadge';
import { downloadInvoicePdf, invoiceDetails, shareInvoicePdf } from '../../lib/invoicePdf';
import { PackingSlipButton } from './AdminPackingSlip';
import { useCancelReason } from './orderMoney';
import { orderWhatsAppLink } from './adminAlerts';
import { WhatsAppIcon } from '../BrandIcons';
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Truck,
  MapPin,
  CreditCard,
  User,
  Phone,
  Mail,
  Printer,
  Loader2,
  Share2,
  Save,
  ShieldCheck,
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  RotateCcw,
  XCircle,
  ExternalLink,
  StickyNote,
  X
} from 'lucide-react';
import { Order, AdminOrderStatus, ReturnRequest } from '../../types';

/** Which admin buttons a return / exchange request offers in each state (same rules as api/_lib/orders.js). */
const RETURN_BUTTONS: Record<string, Array<'approve' | 'reject' | 'receive' | 'refund' | 'exchange'>> = {
  requested: ['approve', 'reject'],
  approved: ['receive', 'refund', 'exchange', 'reject'],
  received: ['refund', 'exchange', 'reject'],
};

const ORDER_STATUSES: AdminOrderStatus[] = [
  'Pending',
  'Processing',
  'Packed',
  'Shipped',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'Returned',
  'Cancelled',
  'Refund Requested',
  'Refunded',
];

const inr = (value: unknown) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;
const eyebrow = 'text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted';
const small = 'text-[13px] leading-[18px] text-ink-muted';

interface AdminOrderDetailsProps {
  orderId: string;
}

export const AdminOrderDetails: React.FC<AdminOrderDetailsProps> = ({ orderId }) => {
  const { orders = [], ordersLoaded, updateOrderStatus, storeSettings } = useAdmin();
  const [invoiceBusy, setInvoiceBusy] = useState<'' | 'download' | 'share'>('');
  const { showToast } = useShop();
  const { navigate } = useRouter();

  const order = orders.find((o) => o.orderNumber === orderId || o.orderNumber.endsWith(orderId));

  // Asked before any cancel (orderMoney.tsx). A hook: it stays above the early returns below.
  const cancelReason = useCancelReason();
  const [status, setStatus] = useState<AdminOrderStatus>('Processing');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnNotify, setReturnNotify] = useState(true);
  const [returnBusy, setReturnBusy] = useState('');
  const [photoOpen, setPhotoOpen] = useState('');

  useEffect(() => {
    if (order) {
      setStatus(order.status);
      setTrackingNumber(order.trackingNumber || '');
      setCourierPartner(order.courierPartner || '');
      setAgentName((order as any).deliveryAgentName || '');
      setAgentPhone((order as any).deliveryAgentPhone || '');
      setNotes(order.notes || '');
      setCustomerNote(order.customerNote || '');
    }
  }, [order?.orderNumber, order?.status, order?.trackingNumber, order?.courierPartner, order?.notes, order?.customerNote]);

  // Customer requests and tracking extras are read live from the order document (the shared order list does not carry them all).
  const [requests, setRequests] = useState<{ cancelRequest: CancelRequest | null; returnRequest: ReturnRequest | null; pastReturnRequests: ReturnRequest[]; trackingUrl: string; expectedDeliveryDate: string; estimatedDeliveryDate: string } | null>(null);
  useEffect(() => {
    if (!order?.orderNumber) return;
    setRequests(null);
    return onSnapshot(
      doc(adminDb, 'orders', order.orderNumber),
      (snap) => {
        const data = snap.data() || {};
        setRequests({
          cancelRequest: data.cancelRequest || null,
          returnRequest: data.returnRequest || null,
          pastReturnRequests: Array.isArray(data.pastReturnRequests) ? data.pastReturnRequests.filter((past: unknown) => past && typeof past === 'object') : [],
          trackingUrl: typeof data.trackingUrl === 'string' ? data.trackingUrl : '',
          expectedDeliveryDate: typeof data.expectedDeliveryDate === 'string' ? data.expectedDeliveryDate : '',
          // Only estimates made from the owner's delivery days (older orders may hold an automatic date)
          estimatedDeliveryDate: data.deliveryEstimateSource === 'settings' && typeof data.estimatedDeliveryDate === 'string' ? data.estimatedDeliveryDate : '',
        });
      },
      () => setRequests(null),
    );
  }, [order?.orderNumber]);
  useEffect(() => {
    if (!requests) return;
    setTrackingUrl(requests.trackingUrl);
    setExpectedDate(requests.expectedDeliveryDate);
  }, [requests?.trackingUrl, requests?.expectedDeliveryDate]);

  // The orders list is still on its way: say so instead of "Not Found"
  if (!order && !ordersLoaded) {
    return (
      <div role="status" className="sag-glass px-5 py-12 text-center space-y-3">
        <Loader2 className="mx-auto w-6 h-6 animate-spin text-brand" aria-hidden="true" />
        <p className="text-sm text-ink-muted">Loading order #{orderId}…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon={<AlertCircle />}
        title={<span className="break-all">Order #{orderId} not found</span>}
        line="This order does not exist, or it may have been deleted."
      >
        <button
          onClick={() => navigate('/admin/orders')}
          className={adminUi.primary}
        >
          Back to orders
        </button>
      </EmptyState>
    );
  }

  const paid = order.paymentStatus === 'Paid';
  const lastEmail = (order.emailLog || []).slice(-1)[0];
  const cancelRequest: CancelRequest | null = requests?.cancelRequest ?? (order as typeof order & { cancelRequest?: CancelRequest | null }).cancelRequest ?? null;
  // Includes the oldest requests, saved only as the status 'Refund Requested' plus a line in the notes.
  const returnRequest: ReturnRequest | null = returnRequestOf({ status: order.status, notes: order.notes, returnRequest: requests?.returnRequest ?? order.returnRequest ?? null });
  const pastReturns = (requests?.pastReturnRequests || []).filter((past) => past.status);
  const returnState = returnStatusOf({ status: order.status, returnRequest });
  const returnKind = returnRequest?.type === 'exchange' ? 'exchange' : 'return';
  const returnButtons = returnState ? RETURN_BUTTONS[returnState] || [] : [];
  const returnOpen = returnButtons.length > 0;
  const returnItems = returnRequest?.items?.length
    ? returnRequest.items
    : (order.items || []).map((item, line) => ({ line, name: item.product?.name || 'Item', image: item.product?.images?.[0] || '', size: item.selectedSize || '', qty: item.quantity, price: item.product?.price, clearance: false, exchangeSize: '' }));
  const returnValue = returnItems.reduce((sum, item) => sum + (Number(item.price ?? order.items?.[item.line]?.product?.price) || 0) * (Number(item.qty) || 1), 0);
  const liveTrackingUrl = requests?.trackingUrl ?? '';
  const liveExpected = requests?.expectedDeliveryDate ?? '';
  const courierLink = trackingLinkFor({ courierPartner, trackingNumber, trackingUrl });
  const cancelRequestPending = Boolean(cancelRequest && !cancelRequest.handledAt);
  // Actionable until the order is shipped. A request still open on a later status can just be closed.
  const cancelRequestOpen = cancelRequestPending && CANCELLABLE_STATUSES.includes(order.status);
  const cancelRequestStale = cancelRequestPending && !cancelRequestOpen;
  const orderStopped = ['Cancelled', 'Refund Requested', 'Refunded'].includes(order.status);
  const keptEmail = (order.emailLog || []).filter((entry) => entry.kind === 'cancelKept').slice(-1)[0];
  const formatWhen = (value?: string) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  };

  /** Saves the whole form with the given status: the "Save order" button and the ink next-step button both end here. */
  const saveWith = async (nextStatus: AdminOrderStatus) => {
    if (trackingUrl.trim() && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(trackingUrl.trim())) {
      showToast('The tracking link must be a full https:// web address.', 'error');
      return;
    }
    // Cancelling always asks why first (orderMoney.tsx); backing out changes nothing
    const reason = nextStatus === 'Cancelled' && order.status !== 'Cancelled' ? await cancelReason.ask(order) : '';
    if (reason === null) return;
    // Shipping the order (or any later status) closes an open cancellation request on the server.
    if (cancelRequestOpen && nextStatus !== order.status && nextStatus !== 'Cancelled' && !CANCELLABLE_STATUSES.includes(nextStatus)) {
      const kept = ['Shipped', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned'].includes(nextStatus);
      const question = kept
        ? `The customer asked to cancel this order. Saving it as ${nextStatus} closes the request as "order kept"${notifyCustomer ? ' and emails the customer that the order is going ahead' : ' (the customer is not emailed because the email box is unticked)'}. Continue?`
        : `The customer asked to cancel this order. Saving it as ${nextStatus} closes the request as cancelled. Continue?`;
      if (!window.confirm(question)) return;
    }
    setIsSaving(true);
    try {
      await updateOrderStatus(order.orderNumber, nextStatus, trackingNumber, notes, {
        courierPartner,
        customerNote,
        notify: notifyCustomer,
        deliveryAgentName: agentName.trim(),
        deliveryAgentPhone: agentPhone.trim(),
        // Sent only once the saved values were read (or typed), so a failed live read never clears them.
        trackingUrl: requests || trackingUrl.trim() ? trackingUrl.trim() : undefined,
        expectedDeliveryDate: requests || expectedDate ? expectedDate : undefined,
        ...(reason ? { cancelReason: reason } : {}),
      });
      showToast(`Order ${order.orderNumber} saved as ${nextStatus}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the order. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveWith(status);
  };

  // Same cancel as choosing "Cancelled" in the form: stock goes back and the request is closed by the server.
  const handleCancelNow = async () => {
    const reason = await cancelReason.ask(order);
    if (reason === null) return;
    setIsSaving(true);
    try {
      await updateOrderStatus(order.orderNumber, 'Cancelled', trackingNumber, notes, { courierPartner, customerNote, notify: notifyCustomer, cancelReason: reason });
      setStatus('Cancelled');
      showToast(`Order ${order.orderNumber} cancelled. Remember to refund it in Razorpay.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not cancel the order. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Closes the request without cancelling. The server emails the customer that the order is going ahead,
  // including the "Message to customer" typed below (saved with this click).
  const handleKeepOrder = async () => {
    const note = customerNote.trim();
    const question = orderStopped
      ? `Close this cancellation request? The order is already ${order.status}.`
      : `Keep this order and close the cancellation request?\n\nThe customer will be emailed that the order is going ahead${note ? ', with your "Message to customer".' : '. To tell them why, first write it in "Message to customer" below; it is included in the email.'}`;
    if (!window.confirm(question)) return;
    setIsSaving(true);
    try {
      const result = await ordersApi<{ cancelKeptEmailSent?: boolean }>('admin-update', { orderNumber: order.orderNumber, cancelRequestHandled: true, customerNote });
      if (result.cancelKeptEmailSent === false) {
        showToast('Request closed, but the email to the customer could not be sent. Please tell them on WhatsApp.', 'error');
      } else {
        showToast(result.cancelKeptEmailSent ? 'Request closed. The customer was emailed that the order is going ahead.' : 'Cancellation request closed.', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not update the request. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Approve / reject / received / refunded / exchanged. The server emails the customer (with this step's note) when ticked.
  const handleReturnAction = async (action: 'approve' | 'reject' | 'receive' | 'refund' | 'exchange') => {
    const note = returnNote.trim();
    if (action === 'approve' && note.length < 3) {
      showToast('Write the next steps for the customer first (for example how to send the piece back). They are emailed with the approval.', 'error');
      return;
    }
    if (action === 'reject' && note.length < 3) {
      showToast('Write a short note for the customer explaining why the request is not approved.', 'error');
      return;
    }
    const questions: Record<typeof action, string> = {
      approve: `Approve this ${returnKind} request?\n\nYour next steps are shown to the customer in their account${returnNotify ? ' and emailed to them' : ''}.${returnRequest?.legacy || !returnRequest?.status ? `\n\nThis older request covers the whole order, and the order goes back to Delivered.` : ''}`,
      reject: `Reject this ${returnKind} request?${returnNotify ? ' The customer is emailed your note.' : ''}`,
      receive: 'Mark the returned pieces as received?',
      refund: `Mark this return as refunded?\n\nFirst refund the payment in your Razorpay dashboard${order.paymentRef ? ` (payment ${order.paymentRef})` : ''}. This button only records it.`,
      exchange: 'Mark this exchange as completed (replacement arranged)?',
    };
    if (!window.confirm(questions[action])) return;
    setReturnBusy(action);
    try {
      const result = await ordersApi<{ customerEmailed: boolean | null }>('admin-return', { orderNumber: order.orderNumber, returnAction: action, note, notify: returnNotify });
      setReturnNote('');
      if (result.customerEmailed === false) showToast('Saved, but the email to the customer could not be sent. Please tell them on WhatsApp.', 'error');
      else showToast(result.customerEmailed ? 'Saved. The customer was emailed.' : 'Saved.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the request. Please try again.', 'error');
    } finally {
      setReturnBusy('');
    }
  };

  // Invoice as a real PDF file: download it, or share it straight to WhatsApp / email from a phone
  const handleDownloadInvoice = async () => {
    if (!order || invoiceBusy) return;
    setInvoiceBusy('download');
    try {
      const name = await downloadInvoicePdf(order, storeSettings);
      showToast(`${name} downloaded.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not create the invoice PDF.', 'error');
    } finally {
      setInvoiceBusy('');
    }
  };
  const handleShareInvoice = async () => {
    if (!order || invoiceBusy) return;
    setInvoiceBusy('share');
    try {
      const shared = await shareInvoicePdf(order, storeSettings);
      if (!shared) {
        await downloadInvoicePdf(order, storeSettings);
        showToast('Sharing files is not supported on this device, so the PDF was downloaded — attach it in WhatsApp or email.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not share the invoice.', 'error');
    } finally {
      setInvoiceBusy('');
    }
  };
  const customerWhatsApp = (() => {
    if (!order) return '';
    const digits = String(order.deliveryAddress?.mobile || order.customerMobile || '').replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return '';
    const inv = invoiceDetails(order, storeSettings);
    const msg = `Hi ${(order.customerName || '').split(' ')[0] || 'there'}, thank you for shopping with Suit Aura Girls! ${inv.number ? `Here is your invoice ${inv.number}` : 'Here are the details'} for order #${order.orderNumber} (total ₹${Math.round(order.finalTotal).toLocaleString('en-IN')}). I am attaching the PDF.`;
    return `https://wa.me/91${digits}?text=${encodeURIComponent(msg)}`;
  })();

  // ---------------------------------------------------------------- the one next step

  const isCod = order.payMode === 'cod';
  const unpaidAttempt = order.paymentStatus === 'Unpaid' && order.status === 'Pending';
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // A one-tap step saves the whole form with the next status, exactly like choosing it below and pressing "Save order"
  const stepTo = (next: AdminOrderStatus) => {
    if (!window.confirm(`Mark this order as ${next}?${notifyCustomer ? ' The customer is emailed about it (the email box below is ticked).' : ' The customer is not emailed (the email box below is unticked).'}`)) return;
    setStatus(next);
    void saveWith(next);
  };
  const nextStep: { label: string; hint: string; run?: () => void } = (() => {
    if (cancelRequestOpen) return { label: 'Answer the cancellation request', hint: 'The customer asked to cancel this order. Cancel it or keep it.', run: () => jumpTo('admin-order-cancel-request') };
    if (cancelRequestStale) return { label: 'Close the cancellation request', hint: `The customer asked to cancel, but the order is already ${order.status}.`, run: () => jumpTo('admin-order-cancel-request') };
    if (returnOpen) return { label: `Handle the ${returnKind} request`, hint: `The customer sent ${returnKind === 'exchange' ? 'an exchange' : 'a return'} request for this order.`, run: () => jumpTo('admin-order-return-request') };
    if (unpaidAttempt) return { label: '', hint: 'The payment was never completed, so there is nothing to pack.' };
    switch (order.status) {
      case 'Pending':
      case 'Processing':
        return { label: 'Mark packed', hint: 'Pack the pieces, then tap here.', run: () => stepTo('Packed') };
      case 'Packed':
        return { label: 'Mark shipped', hint: 'First type the courier and tracking number under “Shipping and tracking”; they are saved with this button.', run: () => stepTo('Shipped') };
      case 'Shipped':
      case 'In Transit':
      case 'Out for Delivery':
        return { label: 'Mark delivered', hint: isCod ? `Tap once the parcel has reached the customer and ${inr(order.codDue)} was collected in cash.` : 'Tap once the parcel has reached the customer.', run: () => stepTo('Delivered') };
      case 'Delivered':
        return { label: '', hint: 'Delivered. Nothing more to do.' };
      case 'Cancelled':
        return { label: '', hint: paid ? 'Cancelled. The payment is still marked Paid: refund it in Razorpay, then set the status to Refunded.' : 'Cancelled. Nothing more to do.' };
      default:
        return { label: '', hint: '' };
    }
  })();

  // ---------------------------------------------------------------- customer requests (shown on top while they wait)

  const cancelPanel = cancelRequest && (
    <section id="admin-order-cancel-request" role="status" className={`${adminUi.panel} ${cancelRequestPending ? 'sag-glass-strong' : ''} space-y-3 scroll-mt-24`}>
      <div className="flex items-start gap-3">
        <XCircle className={`w-5 h-5 shrink-0 mt-0.5 ${cancelRequestOpen ? 'text-sale' : 'text-ink-muted'}`} />
        <div className="min-w-0 text-sm leading-5 text-ink space-y-1.5">
          <p className={eyebrow}>Cancellation request</p>
          <p className="text-[15px] font-semibold text-ink">
            {cancelRequestOpen
              ? 'The customer asked to cancel this order'
              : cancelRequestStale
                ? `The customer asked to cancel, but the order is already ${order.status}`
                : cancelRequest.outcome === 'kept'
                  ? 'Cancellation request closed — order kept'
                  : 'Cancellation request closed — order cancelled'}
          </p>
          <p className="break-words">
            <span className="text-ink-muted">Requested {formatWhen(cancelRequest.at)}{cancelRequest.handledAt ? ` · closed ${formatWhen(cancelRequest.handledAt)}` : ''}.</span>{' '}
            <strong className="font-semibold">Reason:</strong> {cancelRequest.reason}
          </p>
          {cancelRequestOpen && (
            <p className={small}>
              Cancelling returns the stock automatically and emails the customer (if the email box below is ticked). Refund ₹{(order.payMode === 'cod' ? order.codAdvance || 0 : order.finalTotal).toLocaleString('en-IN')} from your Razorpay dashboard{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then set the status to Refunded. Keeping the order, or saving it as Shipped or Delivered, closes the request and emails the customer that it is going ahead.
            </p>
          )}
          {cancelRequestPending && cancelRequest.storeNotified === false && (
            <p className="text-[13px] leading-[18px] font-medium text-danger">
              The email alert for this request could not be sent to the store email (email not set up, or it failed). Check the orders list for new requests.
            </p>
          )}
          {cancelRequestStale && (
            <p className={small}>
              Close the request so the customer no longer sees it as under review{orderStopped ? '.' : '; they are emailed that the order is going ahead.'}
            </p>
          )}
          {cancelRequest.handledAt && cancelRequest.outcome === 'kept' && (
            <p className={small}>
              {!keptEmail
                ? 'The customer was not emailed about this (the email box was unticked). Tell them on WhatsApp if needed.'
                : keptEmail.ok
                  ? `The customer was emailed that the order is going ahead (${formatWhen(keptEmail.at)}).`
                  : 'The email to the customer failed. Please tell them on WhatsApp.'}
            </p>
          )}
          {!cancelRequestOpen && order.status === 'Cancelled' && order.paymentStatus === 'Paid' && (
            <p className={small}>Payment is still marked Paid. After refunding in Razorpay, set the status to Refunded.</p>
          )}
        </div>
      </div>
      {cancelRequestOpen && (
        <div className="flex flex-wrap gap-2 sm:pl-8 [&>*]:flex-1 sm:[&>*]:flex-none">
          <button
            type="button"
            onClick={handleKeepOrder}
            disabled={isSaving}
            className={adminUi.outline}
          >
            Keep order (close request)
          </button>
          <button
            type="button"
            onClick={handleCancelNow}
            disabled={isSaving}
            className={adminUi.danger}
          >
            Cancel order now
          </button>
        </div>
      )}
      {cancelRequestStale && (
        <div className="flex flex-wrap gap-2 sm:pl-8 [&>*]:flex-1 sm:[&>*]:flex-none">
          <button
            type="button"
            onClick={handleKeepOrder}
            disabled={isSaving}
            className={adminUi.outline}
          >
            Close request
          </button>
        </div>
      )}
    </section>
  );

  const returnPanel = returnRequest && returnState && (
    <section id="admin-order-return-request" role="status" className={`${adminUi.panel} ${returnOpen ? 'sag-glass-strong' : ''} space-y-4 scroll-mt-24`}>
      <div className="flex items-start gap-3">
        <RotateCcw className={`w-5 h-5 shrink-0 mt-0.5 ${returnOpen ? 'text-sale' : 'text-ink-muted'}`} />
        <div className="min-w-0 text-sm leading-5 text-ink space-y-1.5">
          <p className={eyebrow}>{returnKind === 'exchange' ? 'Exchange' : 'Return'} request</p>
          <p className="text-[15px] font-semibold text-ink flex flex-wrap items-center gap-2">
            <span>{returnKind === 'exchange' ? 'Exchange' : 'Return'} request · {RETURN_STATUS_LABEL[returnState]}</span>
            <Pill tone={returnOpen ? 'good' : returnState === 'rejected' ? 'danger' : 'muted'}>{returnOpen ? 'Waiting for you' : 'Closed'}</Pill>
          </p>
          <p className="text-ink-muted">
            {formatWhen(returnRequest.at) ? `Requested ${formatWhen(returnRequest.at)}` : 'Request date not recorded'}{returnRequest.updatedAt && returnRequest.updatedAt !== returnRequest.at && formatWhen(returnRequest.updatedAt) ? ` · updated ${formatWhen(returnRequest.updatedAt)}` : ''}
          </p>
          {returnRequest.legacy || !returnRequest.status ? (
            <p className={small}>
              Older request (saved before item-level returns): it covers the whole order{returnRequest.at ? '' : ' and was saved only as the status "Refund Requested"'}. Approving it moves the order back to Delivered and tracks the {returnKind} here. If this order was never delivered, reject the request and set the right status below.
            </p>
          ) : null}
          {returnRequest.storeNotified === false && returnOpen && (
            <p className="text-[13px] leading-[18px] font-medium text-danger">The email alert for this request could not be sent to the store email. Check the orders list for new requests.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 sm:pl-8">
        <div className="space-y-2">
          <p className={eyebrow}>Items</p>
          {returnItems.map((item) => (
            <div key={item.line} className="flex items-center gap-3 p-2 rounded-[16px] bg-page">
              {item.image ? (
                <img src={getCleanImageUrl(item.image, 120)} alt="" className="w-10 aspect-[4/5] shrink-0 object-cover object-top rounded-[12px] bg-sunken" />
              ) : (
                <span className="w-10 aspect-[4/5] shrink-0 rounded-[12px] bg-sunken-deep" />
              )}
              <div className="min-w-0 text-[13px] leading-[18px]">
                <p className="font-semibold text-ink truncate">{item.name}</p>
                <p className="text-ink-muted">
                  Size {item.size || '—'}
                  {returnKind === 'exchange' && <> → <strong className="text-ink">{item.exchangeSize || 'see note'}</strong></>}
                  {' '}· Qty {item.qty}
                </p>
                {item.clearance && <Pill tone="danger" className="mt-1">Clearance · exchange only</Pill>}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 text-sm">
          <p className={eyebrow}>Reason</p>
          <p className="font-semibold text-ink">{returnRequest.status ? returnRequest.reason : 'Other'}</p>
          {(returnRequest.details || (!returnRequest.status && returnRequest.reason)) && (
            <p className="text-ink-muted whitespace-pre-line break-words">{returnRequest.details || returnRequest.reason}</p>
          )}
          {returnRequest.refundUpi && <p className="font-semibold text-ink break-all">Refund to UPI ID (cash on delivery order): {returnRequest.refundUpi}</p>}
          {(returnRequest.photos || []).length > 0 && (
            <div className="pt-1">
              <p className={`${eyebrow} mb-1.5`}>Customer photos (tap to enlarge)</p>
              <div className="flex flex-wrap gap-2">
                {(returnRequest.photos || []).map((url, index) => (
                  <button key={url} type="button" onClick={() => setPhotoOpen(url)} className="w-16 aspect-[4/5] rounded-[12px] overflow-hidden bg-sunken cursor-pointer" aria-label={`Open photo ${index + 1}`}>
                    <img src={getCleanImageUrl(url, 200)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {returnRequest.adminNote && (
            <p className={`${small} break-words`}><strong className="font-semibold text-ink">Note shown to the customer ({RETURN_STATUS_LABEL[returnState].toLowerCase()} step):</strong> {returnRequest.adminNote}</p>
          )}
        </div>
      </div>

      {(returnRequest.history || []).length > 0 && (
        <div className="sm:pl-8 space-y-1">
          <p className={eyebrow}>History (each step's note)</p>
          {(returnRequest.history || []).slice().reverse().map((entry, index) => (
            <p key={index} className={`${small} break-words`}>
              <strong className="font-semibold text-ink">{RETURN_STATUS_LABEL[entry.status as keyof typeof RETURN_STATUS_LABEL] || entry.status}</strong> · {formatWhen(entry.at) || 'date not recorded'}{entry.note ? ` — ${entry.note}` : ''}
            </p>
          ))}
        </div>
      )}

      {pastReturns.length > 0 && (
        <div className="sm:pl-8 space-y-1.5">
          <p className={eyebrow}>Earlier requests on this order</p>
          {pastReturns.map((past, index) => {
            const pastState = past.status as keyof typeof RETURN_STATUS_LABEL;
            const pieces = (past.items || []).map((item) => `${item.name || 'Item'} (${item.size || 'one size'}${item.exchangeSize ? ` → ${item.exchangeSize}` : ''}) × ${item.qty}`).join(', ');
            return (
              <p key={`${past.at}-${index}`} className={`${small} break-words`}>
                <strong className="font-semibold text-ink">{past.type === 'exchange' ? 'Exchange' : 'Return'} · {RETURN_STATUS_LABEL[pastState] || past.status}</strong> · requested {formatWhen(past.at) || '—'}{past.updatedAt ? ` · closed ${formatWhen(past.updatedAt)}` : ''}
                {pieces ? ` · ${pieces}` : ''}{past.adminNote ? ` — ${past.adminNote}` : ''}
              </p>
            );
          })}
          <p className={small}>Pieces already refunded or exchanged cannot be asked for again.</p>
        </div>
      )}

      {returnOpen && (
        <div className="sm:pl-8 pt-4 border-t border-line space-y-3">
          {returnKind === 'return' ? (
            <p className={small}>
              Refund the payment in Razorpay{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then mark refunded. Items value ₹{returnValue.toLocaleString('en-IN')} at the prices paid, before order discounts and shipping. Stock is not changed automatically; add a piece back in Products if it can be sold again.
            </p>
          ) : (
            <p className={small}>
              Arrange the replacement (check the new size is in stock), then mark exchanged. Stock is not changed automatically.
            </p>
          )}
          <label className="block">
            <span className={adminUi.label}>
              Note to the customer for this step {returnState === 'requested' ? '(required: next steps to approve, or the reason to reject)' : '(optional; required to reject)'}
            </span>
            <textarea
              rows={3}
              maxLength={1000}
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder={returnState === 'requested' ? 'e.g. Please pack the piece with its tags; we will share the courier details on WhatsApp.' : 'e.g. Refund sent to your UPI on 30 Sept.'}
              className={adminUi.textarea}
            />
            <span className={`block ${adminUi.hint}`}>Each step has its own note; an earlier step's note is not repeated to the customer.</span>
          </label>
          <label className={adminUi.checkRow}>
            <input type="checkbox" checked={returnNotify} onChange={(e) => setReturnNotify(e.target.checked)} className={adminUi.check} />
            Email the customer about this step
          </label>
          <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            {returnButtons.map((action) => {
              const label = { approve: 'Approve', reject: 'Reject', receive: 'Mark received', refund: 'Mark refunded', exchange: 'Mark exchanged' }[action];
              if ((action === 'refund' && returnKind !== 'return') || (action === 'exchange' && returnKind !== 'exchange')) return null;
              const primary = action === 'approve' || action === 'refund' || action === 'exchange';
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleReturnAction(action)}
                  disabled={Boolean(returnBusy)}
                  className={primary ? adminUi.primary : action === 'reject' ? adminUi.danger : adminUi.outline}
                >
                  {returnBusy === action ? 'Saving…' : label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );

  const timeline = (order.timeline || []).slice().reverse();

  return (
    <div id="admin-order-details-page" className="space-y-4 sm:space-y-5 pb-10">
      {cancelReason.dialog}

      {/* Top summary: which order, where it stands, and the one next step */}
      <section className="sag-glass sag-glass-strong p-4 sm:p-6">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/admin/orders')}
            className={`${adminUi.iconBtn} -ml-2`}
            title="Back to Orders"
            aria-label="Back to Orders"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 ${eyebrow} min-w-0`}>
              <span>Orders</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{order.orderNumber}</span>
            </div>
            <h2 className="mt-1 font-sans text-[22px] leading-7 sm:text-[26px] sm:leading-8 font-semibold text-ink sag-num break-all sm:break-normal">
              Order #{order.orderNumber}
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentBadge order={order} />
              {order.testPayment && <Pill tone="muted">Test payment</Pill>}
              <span className="text-[13px] leading-[18px] text-ink-muted inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Placed {formatOrderDate(order.date)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/orders')}
            className="hidden lg:inline-flex sag-link px-2 shrink-0"
          >
            Back to orders
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-line grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className={eyebrow}>Order total</dt>
              <dd className="mt-0.5 text-[26px] leading-8 font-semibold text-ink sag-num">{inr(order.finalTotal)}</dd>
            </div>
            {isCod && (
              <div>
                <dt className={eyebrow}>Collect in cash</dt>
                <dd className="mt-0.5 text-[26px] leading-8 font-semibold text-sale sag-num">{inr(order.codDue)}</dd>
              </div>
            )}
            <div>
              <dt className={eyebrow}>Customer</dt>
              <dd className="mt-0.5 text-[15px] leading-8 font-medium text-ink break-words">{order.customerName}</dd>
            </div>
          </dl>
          <div className="sm:justify-self-end sm:text-right min-w-0">
            <p className={eyebrow}>Next step</p>
            {nextStep.label && nextStep.run ? (
              <button type="button" onClick={nextStep.run} disabled={isSaving} className={`${adminUi.primary} mt-1.5 w-full sm:w-auto h-12 px-6`}>
                {isSaving ? 'Saving…' : nextStep.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <p className="mt-1 text-[15px] leading-6 font-medium text-ink">{nextStep.hint || 'Nothing to do right now.'}</p>
            )}
            {nextStep.label && nextStep.hint && <p className={`mt-1.5 ${small} sm:max-w-sm sm:ml-auto`}>{nextStep.hint}</p>}
          </div>
        </div>
      </section>

      {/* Requests that are waiting for an answer come first */}
      {cancelRequestPending && cancelPanel}
      {returnOpen && returnPanel}

      {photoOpen && (
        <div className="fixed inset-0 z-[90] bg-dark/95 flex items-center justify-center p-4" onClick={() => setPhotoOpen('')} role="dialog" aria-modal="true" aria-label="Customer photo">
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={getCleanImageUrl(photoOpen, 1600)} alt="Customer photo" className="max-h-[78dvh] w-auto mx-auto rounded-[16px]" />
            <div className="mt-3 flex justify-center gap-2">
              <a href={photoOpen} target="_blank" rel="noopener noreferrer" className={adminUi.outline}>
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </a>
              <button type="button" onClick={() => setPhotoOpen('')} className={adminUi.outline}>
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">

        {/* Left: who, what and how it was paid */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-5 min-w-0">

          <Panel title="Customer and delivery address" icon={<MapPin />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm leading-5 text-ink-muted">
              <div className={`${adminUi.inset} space-y-1.5 min-w-0`}>
                <p className={eyebrow}>Customer</p>
                <p className="font-semibold text-ink flex items-center gap-2">
                  <User className="w-4 h-4 shrink-0 text-ink-muted" />
                  {order.customerName}
                </p>
                <p className="flex items-center gap-2 text-ink break-all">
                  <Mail className="w-4 h-4 shrink-0 text-ink-muted" />
                  {order.customerEmail}
                </p>
                <p className="flex items-center gap-2 text-ink sag-num">
                  <Phone className="w-4 h-4 shrink-0 text-ink-muted" />
                  +91 {order.customerMobile}
                </p>
              </div>

              <div className={`${adminUi.inset} space-y-1.5 min-w-0`}>
                <p className={eyebrow}>
                  Delivery address
                </p>
                <p className="font-semibold text-ink break-words">
                  {order.deliveryAddress.houseFlat}, {order.deliveryAddress.street}
                </p>
                <p className="text-ink-muted">
                  {order.deliveryAddress.area}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                </p>
                <p className="text-ink-muted">
                  {order.deliveryAddress.state}, India
                </p>
              </div>
            </div>
            {order.giftNote && (
              <div className={`${adminUi.inset} mt-3 text-sm leading-5 text-ink break-words`}><strong className="font-semibold">Gift note:</strong> {order.giftNote}</div>
            )}
          </Panel>

          <Panel title={<>Items <span className="font-normal text-ink-muted sag-num">({(order.items || []).length})</span></>} icon={<ShoppingBag />}>
            {(order.stockShortfall || []).length > 0 && (
              <div role="alert" className={`${adminUi.alert} mb-4`}>
                Stock was short when this order was paid: {(order.stockShortfall || []).map((s) => `${s.name || s.productId} (wanted ${s.requested}, had ${s.available})`).join(', ')}
              </div>
            )}
            <div className="divide-y divide-line">
              {(order.items || []).map((item, idx) => {
                const selectedColorName = item.selectedColor?.name;
                const selectedColorHex = item.selectedColor?.hex;
                const colorsList = item.product?.colors || [];
                const colorIdx = colorsList.findIndex((c: any) => c.name === selectedColorName || c.hex === selectedColorHex);
                const itemImg = item.selectedColor?.imageUrl
                  || (colorIdx !== -1 && item.product?.images?.[colorIdx])
                  || item.product?.images?.[0]
                  || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80';
                // Accessory lines bought with an outfit ("Complete the look") name that outfit; set by the server.
                const lookLine = item as typeof item & { lookParentId?: unknown; lookParentName?: unknown };
                const lookParent = lookLine.lookParentId || lookLine.lookParentName
                  ? String(lookLine.lookParentName || '').trim() || 'its outfit'
                  : '';

                return (
                  <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                    <img
                      src={itemImg}
                      alt={item.product?.name || 'Item'}
                      loading="lazy"
                      className="w-14 sm:w-16 aspect-[4/5] shrink-0 object-cover object-top rounded-[12px] bg-sunken"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-5 font-semibold text-ink line-clamp-2">
                        {item.product.name}
                      </p>
                      <p className="text-xs leading-4 text-ink-muted mt-0.5 break-words">
                        {item.product.category} · SKU {item.product.sku || item.product.id}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[13px] leading-[18px] text-ink-muted">
                        <Pill>Size {item.selectedSize}</Pill>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-3 h-3 rounded-full border border-control"
                            style={{ backgroundColor: item.selectedColor.hex }}
                          />
                          <span>{item.selectedColor.name}</span>
                        </span>
                        <span className="text-ink font-semibold sag-num">
                          Qty {item.quantity}
                        </span>
                      </div>
                      {lookParent && (
                        <p className="mt-1.5 text-xs leading-4 font-medium text-ink-muted break-words">
                          Complete the look · with <span className="text-ink">{lookParent}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-semibold text-ink sag-num">
                        ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                      </p>
                      <p className="text-xs text-ink-muted sag-num">
                        ₹{item.product.price.toLocaleString('en-IN')} each
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* How the total was reached */}
            <div className="mt-4 pt-4 border-t border-line space-y-2">
              <InfoRow label="Subtotal">₹{order.subtotal.toLocaleString('en-IN')}</InfoRow>
              {(order.comboDiscount || 0) > 0 && (
                <InfoRow label="Combo discount"><span className="text-sale font-medium">- ₹{(order.comboDiscount || 0).toLocaleString('en-IN')}</span></InfoRow>
              )}
              {(order.couponDiscount || 0) > 0 && (
                <InfoRow label={`Coupon (${order.couponCode})`}><span className="text-sale font-medium">- ₹{(order.couponDiscount || 0).toLocaleString('en-IN')}</span></InfoRow>
              )}
              {(order.prepaidDiscount || 0) > 0 && (
                <InfoRow label="Online payment discount"><span className="text-sale font-medium">- ₹{(order.prepaidDiscount || 0).toLocaleString('en-IN')}</span></InfoRow>
              )}
              {!order.couponDiscount && !order.prepaidDiscount && !order.comboDiscount && order.discountAmount > 0 && (
                <InfoRow label={`Discount (${order.couponCode || 'applied'})`}><span className="text-sale font-medium">- ₹{order.discountAmount.toLocaleString('en-IN')}</span></InfoRow>
              )}
              <InfoRow label="Shipping">{order.shippingCharge === 0 ? 'Free' : `₹${order.shippingCharge}`}</InfoRow>
              <div className="flex justify-between items-baseline pt-3 border-t border-line text-[15px] font-semibold text-ink">
                <span>{order.payMode === 'cod' ? 'Order total' : paid ? 'Total paid' : 'Order total'}</span>
                <span className="text-xl leading-7 font-semibold text-ink sag-num">₹{order.finalTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Payment" icon={<CreditCard />} hint="Payment status is separate from the order status above.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentBadge order={order} />
                {paid && <span className="text-[13px] leading-[18px] text-ok font-medium inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Verified with the gateway</span>}
                {order.testPayment && <Pill tone="muted">Test payment (no real money)</Pill>}
              </div>

              {order.payMode === 'cod' ? (
                <div id="admin-order-cod" className="grid grid-cols-2 gap-2.5">
                  <div className={adminUi.inset}>
                    <p className={eyebrow}>Paid online</p>
                    <p className="mt-0.5 text-xl leading-7 font-semibold text-ink sag-num">₹{(order.codAdvance || 0).toLocaleString('en-IN')}</p>
                    <p className="text-xs leading-4 text-ink-muted">Cash on delivery advance</p>
                  </div>
                  <div className="rounded-[16px] border border-brand-line bg-brand-wash p-3.5">
                    <p className={eyebrow}>Collect in cash at delivery</p>
                    <p className="mt-0.5 text-xl leading-7 font-semibold text-sale sag-num">₹{(order.codDue || 0).toLocaleString('en-IN')}</p>
                    <p className="text-xs leading-4 text-ink-muted">Cash on delivery</p>
                  </div>
                </div>
              ) : (
                <div className={adminUi.inset}>
                  <p className={eyebrow}>{paid ? 'Paid online' : order.paymentStatus === 'Refunded' ? 'Refunded' : 'Not paid yet'}</p>
                  <p className="mt-0.5 text-xl leading-7 font-semibold text-ink sag-num">₹{order.finalTotal.toLocaleString('en-IN')}</p>
                  <p className="text-xs leading-4 text-ink-muted">{paid ? 'The full order total' : 'Order total'}</p>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <InfoRow label="Method" strong><span className="capitalize">{order.paymentMethod}</span></InfoRow>
                <InfoRow label="Gateway ref"><span className="font-mono text-xs break-all">{order.paymentRef || '—'}</span></InfoRow>
              </div>
            </div>
          </Panel>

          {/* Requests that are already closed stay here for the record */}
          {!cancelRequestPending && cancelPanel}
          {!returnOpen && returnPanel}

        </div>

        {/* Right: shipping, what happened, notes and the invoice */}
        <div className="space-y-4 sm:space-y-5 min-w-0">

          <form id="admin-order-form" onSubmit={handleSave} className={`${adminUi.panel} space-y-4`}>
            <div className="pb-3 border-b border-line">
              <h3 className={`${adminUi.h2} flex items-center gap-2`}>
                <Truck className="w-[18px] h-[18px] text-brand" />
                Shipping and tracking
              </h3>
              <p className={`mt-1 ${small}`}>Set the status and the courier details, then save. The customer sees them on the tracking page.</p>
            </div>

            <div className={`${adminUi.inset} space-y-2`}>
              <InfoRow label="Expected delivery" strong>{formatExpectedDate(liveExpected) || 'Not set'}</InfoRow>
              {!liveExpected && formatDeliveryDate(requests?.estimatedDeliveryDate) && (
                <InfoRow label="Estimate at checkout">{formatDeliveryDate(requests?.estimatedDeliveryDate)}</InfoRow>
              )}
              {liveTrackingUrl && (
                <InfoRow label="Tracking link"><a href={liveTrackingUrl} target="_blank" rel="noopener noreferrer" className={adminUi.link}>Open</a></InfoRow>
              )}
            </div>

            <div>
              <label htmlFor="admin-order-status" className={adminUi.label}>
                Order status
              </label>
              <select
                id="admin-order-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AdminOrderStatus)}
                className={`${adminUi.select} font-medium`}
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-order-courier" className={adminUi.label}>
                Courier partner
              </label>
              <input
                id="admin-order-courier"
                type="text"
                value={courierPartner}
                onChange={(e) => setCourierPartner(e.target.value)}
                placeholder="e.g. BlueDart, Delhivery, DTDC"
                className={adminUi.field}
              />
            </div>

            {status === 'Out for Delivery' && (
              <div className={`${adminUi.inset} grid grid-cols-1 sm:grid-cols-2 gap-3`}>
                <div>
                  <label htmlFor="admin-order-agent-name" className={adminUi.label}>Delivery executive name</label>
                  <input id="admin-order-agent-name" type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={80} placeholder="Optional"
                    className={adminUi.field} />
                </div>
                <div>
                  <label htmlFor="admin-order-agent-phone" className={adminUi.label}>Delivery executive phone</label>
                  <input id="admin-order-agent-phone" type="tel" inputMode="tel" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} maxLength={15} placeholder="Optional"
                    className={adminUi.field} />
                </div>
                <p className={`sm:col-span-2 ${small}`}>Shown to the customer only while the order is out for delivery.</p>
              </div>
            )}

            <div>
              <label htmlFor="admin-order-awb" className={adminUi.label}>
                Courier AWB / tracking number
              </label>
              <input
                id="admin-order-awb"
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. BLUEDART-882910"
                className={`${adminUi.field} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="admin-order-tracking-url" className={adminUi.label}>
                Tracking link <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="admin-order-tracking-url"
                type="url"
                inputMode="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://… (only if the courier gave you a link)"
                className={adminUi.field}
              />
              <p className={adminUi.hint}>
                {trackingUrl.trim()
                  ? 'Customers get this link on the tracking page.'
                  : courierLink
                    ? `Without a link, customers get ${courierLink.hasAwb ? 'the' : 'the tracking page of the'} ${findCourier(courierPartner)?.name || 'courier'} website${courierLink.hasAwb ? ' for this AWB' : ' (they paste the AWB)'}.`
                    : findCourier(courierPartner)
                      ? `The ${findCourier(courierPartner)?.name} website is not linked (it does not open safely right now), so customers get the AWB to copy. Paste a tracking link if the courier gave you one.`
                      : 'Known couriers (Delhivery, Blue Dart, DTDC, Ekart, XpressBees, Shadowfax, India Post, Shiprocket, Amazon Shipping) get a link automatically.'}
              </p>
            </div>

            <div>
              <label htmlFor="admin-order-expected" className={adminUi.label}>
                Expected delivery date <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="admin-order-expected"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={adminUi.field}
              />
              <p className={adminUi.hint}>Shown to the customer as "Expected by …" only when you set it. Leave empty if unsure.</p>
            </div>

            <div>
              <label htmlFor="admin-order-customer-note" className={adminUi.label}>
                Message to customer <span className="normal-case tracking-normal">(shown on tracking and in the email)</span>
              </label>
              <textarea
                id="admin-order-customer-note"
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Optional, e.g. Your order will ship on Monday."
                className={adminUi.textarea}
              />
            </div>

            <label className={adminUi.checkRow}>
              <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} className={adminUi.check} />
              Email the customer when the status changes
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className={`${adminUi.primary} w-full h-12`}
            >
              <Save className="w-[18px] h-[18px]" />
              <span>{isSaving ? 'Saving…' : 'Save order'}</span>
            </button>
            <p className={small}>Saves the status, the courier details, the message and the internal notes together.</p>
          </form>

          <Panel title="Timeline" icon={<Clock />} hint="What happened with this order, newest first.">
            {timeline.length > 0 ? (
              <ol className="space-y-3.5">
                {timeline.map((entry, index) => (
                  <li key={index} className="relative pl-6">
                    <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ${index === 0 ? 'bg-brand' : 'bg-control'}`} aria-hidden="true" />
                    {index < timeline.length - 1 && <span className="absolute left-[4.5px] top-5 -bottom-3 w-px bg-line" aria-hidden="true" />}
                    <p className="text-sm leading-5 font-medium text-ink break-words">
                      {timelineLabel(entry.status)}
                      {timelineLabel(entry.status) !== entry.status && <span className="font-normal text-ink-muted"> · {entry.status}</span>}
                    </p>
                    <p className="text-xs leading-4 text-ink-muted sag-num">{new Date(entry.at).toLocaleString('en-IN')}</p>
                    {entry.note && <p className={`mt-0.5 ${small} break-words`}>{entry.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={small}>No steps are recorded for this order yet. It was placed {formatOrderDate(order.date)}.</p>
            )}
            {(order.cancelReason || order.refundedAt) && (
              <div id="admin-order-money-notes" className="mt-4 pt-3 border-t border-line space-y-1">
                {order.cancelReason && <p className={`${small} break-words`}><span className="font-medium text-ink">Why it was cancelled:</span> {order.cancelReason}{order.cancelledBy === 'customer request' ? ' (the customer asked)' : ''}</p>}
                {order.refundedAt && <p className={`${small} break-words`}><span className="font-medium text-ink">Marked refunded:</span> <span className="sag-num">{new Date(order.refundedAt).toLocaleString('en-IN')}</span>{order.refundRef ? ` · refund ${order.refundRef}` : ''}</p>}
              </div>
            )}
            {(order.payTries || []).length > 0 && (
              <div id="admin-order-pay-tries" className="mt-4 pt-3 border-t border-line">
                <p className="text-sm leading-5 font-medium text-ink">Payment tries that did not finish</p>
                <ul className="mt-1.5 space-y-1.5">
                  {(order.payTries || []).slice().reverse().map((t, index) => (
                    <li key={index} className={`${small} break-words`}>
                      <span className="sag-num">{new Date(t.at).toLocaleString('en-IN')}</span> · {t.kind === 'closed' ? 'Customer closed the payment window' : `Failed: ${t.reason || t.code || 'no reason given'}`}
                      {[t.method, t.browser].filter(Boolean).length > 0 && <> · {[t.method, t.browser].filter(Boolean).join(' · ')}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lastEmail && (
              <p className={`mt-4 pt-3 border-t border-line ${small} flex items-start gap-2`}>
                <Mail className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <span>Last email: {lastEmail.kind} · {new Date(lastEmail.at).toLocaleString('en-IN')} · <span className={lastEmail.ok ? 'text-ink' : 'font-medium text-danger'}>{lastEmail.ok ? 'sent' : 'failed'}</span></span>
              </p>
            )}
          </Panel>

          <Panel title="Internal notes" icon={<StickyNote />} hint="Only you and other admins see these. The customer never does.">
            <label htmlFor="admin-order-notes" className={adminUi.label}>
              Internal notes <span className="normal-case tracking-normal">(admin only)</span>
            </label>
            <textarea
              id="admin-order-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Only visible to admins"
              className={adminUi.textarea}
            />
            <button type="submit" form="admin-order-form" disabled={isSaving} className={`${adminUi.outline} mt-3 w-full`}>
              <Save className="w-4 h-4" /> {isSaving ? 'Saving…' : 'Save notes'}
            </button>
          </Panel>

          <Panel title="Packing slip and messages" icon={<Printer />} hint="Print the slip that goes in the parcel, or send the customer a ready-made WhatsApp message.">
            <div className="grid grid-cols-1 gap-2">
              <PackingSlipButton order={order} className={`${adminUi.outline} px-3`} />
              {(['packed', 'shipped', 'delivered'] as const).map((kind) => {
                const link = orderWhatsAppLink(order, kind);
                return link ? (
                  <a key={kind} href={link} target="_blank" rel="noopener noreferrer" className={`${adminUi.outline} px-3`}>
                    WhatsApp: order {kind}
                  </a>
                ) : null;
              })}
            </div>
          </Panel>

          <Panel title="Invoice" icon={<FileText />} hint="A PDF invoice for this order, to keep or to send to the customer.">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownloadInvoice}
                disabled={Boolean(invoiceBusy)}
                className={`${adminUi.outline} px-3`}
              >
                {invoiceBusy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>Invoice PDF</span>
              </button>
              <button
                type="button"
                onClick={handleShareInvoice}
                disabled={Boolean(invoiceBusy)}
                className={`${adminUi.outline} px-3`}
                title="Share the PDF to WhatsApp, email and more (phones)"
              >
                {invoiceBusy === 'share' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                <span>Share PDF</span>
              </button>
              {customerWhatsApp && (
                <a
                  href={customerWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${adminUi.outline} col-span-2`}
                  title="Open WhatsApp chat with the customer (attach the downloaded PDF)"
                >
                  <WhatsAppIcon className="w-4 h-4" live={false} />
                  <span>WhatsApp customer</span>
                </a>
              )}
            </div>
          </Panel>

        </div>

      </div>

    </div>
  );
};
