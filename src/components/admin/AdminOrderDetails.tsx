import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { adminDb } from '../../lib/firebase';
import { ordersApi } from '../../lib/api';
import { CANCELLABLE_STATUSES, CancelRequest, RETURN_STATUS_LABEL, formatExpectedDate, returnRequestOf, returnStatusOf } from '../OrderProgress';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { findCourier, trackingLinkFor } from '../../utils/courier';
import { formatDeliveryDate } from '../../utils/delivery';
import { formatOrderDate } from '../../utils/orderDate';
import { PaymentBadge, OrderStatusBadge } from './PaymentBadge';
import { tone, ui } from './kidsToysShared';
import { downloadInvoicePdf, invoiceDetails, shareInvoicePdf } from '../../lib/invoicePdf';
import { WhatsAppIcon } from '../BrandIcons';
import {
  ArrowLeft,
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
  CheckCircle2,
  Clock,
  IndianRupee,
  FileText,
  AlertCircle,
  RotateCcw,
  XCircle,
  ExternalLink,
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

interface AdminOrderDetailsProps {
  orderId: string;
}

export const AdminOrderDetails: React.FC<AdminOrderDetailsProps> = ({ orderId }) => {
  const { orders = [], ordersLoaded, updateOrderStatus, storeSettings } = useAdmin();
  const [invoiceBusy, setInvoiceBusy] = useState<'' | 'download' | 'share'>('');
  const { showToast } = useShop();
  const { navigate } = useRouter();

  const order = orders.find((o) => o.orderNumber === orderId || o.orderNumber.endsWith(orderId));

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
      <div role="status" className={`${ui.empty} space-y-3`}>
        <Loader2 className="mx-auto w-6 h-6 animate-spin text-ink" aria-hidden="true" />
        <p className="text-sm text-ink-muted">Loading order #{orderId}…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={`${ui.empty} space-y-3`}>
        <AlertCircle className="mx-auto w-6 h-6 text-sale" aria-hidden="true" />
        <h3 className={`${ui.h2} break-all`}>Order #{orderId} not found</h3>
        <p className="text-sm leading-5 text-ink-muted max-w-md mx-auto">
          This order does not exist, or it may have been deleted.
        </p>
        <button
          onClick={() => navigate('/admin/orders')}
          className={ui.primary}
        >
          Back to orders
        </button>
      </div>
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingUrl.trim() && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(trackingUrl.trim())) {
      showToast('The tracking link must be a full https:// web address.', 'error');
      return;
    }
    if (status === 'Cancelled' && order.status !== 'Cancelled' && !window.confirm('Cancel this order? Its stock will be returned to inventory. Refund the payment from your Razorpay dashboard.')) return;
    // Shipping the order (or any later status) closes an open cancellation request on the server.
    if (cancelRequestOpen && status !== order.status && status !== 'Cancelled' && !CANCELLABLE_STATUSES.includes(status)) {
      const kept = ['Shipped', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned'].includes(status);
      const question = kept
        ? `The customer asked to cancel this order. Saving it as ${status} closes the request as "order kept"${notifyCustomer ? ' and emails the customer that the order is going ahead' : ' (the customer is not emailed because the email box is unticked)'}. Continue?`
        : `The customer asked to cancel this order. Saving it as ${status} closes the request as cancelled. Continue?`;
      if (!window.confirm(question)) return;
    }
    setIsSaving(true);
    try {
      await updateOrderStatus(order.orderNumber, status, trackingNumber, notes, {
        courierPartner,
        customerNote,
        notify: notifyCustomer,
        deliveryAgentName: agentName.trim(),
        deliveryAgentPhone: agentPhone.trim(),
        // Sent only once the saved values were read (or typed), so a failed live read never clears them.
        trackingUrl: requests || trackingUrl.trim() ? trackingUrl.trim() : undefined,
        expectedDeliveryDate: requests || expectedDate ? expectedDate : undefined,
      });
      showToast(`Order ${order.orderNumber} saved as ${status}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the order. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Same cancel as choosing "Cancelled" in the form: stock goes back and the request is closed by the server.
  const handleCancelNow = async () => {
    if (!window.confirm(`Cancel order ${order.orderNumber}? Its stock will be returned to inventory. Refund ₹${(order.payMode === 'cod' ? order.codAdvance || 0 : order.finalTotal).toLocaleString('en-IN')} from your Razorpay dashboard.`)) return;
    setIsSaving(true);
    try {
      await updateOrderStatus(order.orderNumber, 'Cancelled', trackingNumber, notes, { courierPartner, customerNote, notify: notifyCustomer });
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

  return (
    <div id="admin-order-details-page" className="space-y-4 sm:space-y-5 pb-10">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-4 border-b border-line">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/admin/orders')}
            className="w-11 h-11 -ml-2 shrink-0 flex items-center justify-center hover:bg-sunken text-ink rounded-full transition-colors cursor-pointer"
            title="Back to Orders"
            aria-label="Back to Orders"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 ${ui.eyebrow} min-w-0`}>
              <span>Orders</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{order.orderNumber}</span>
            </div>
            <h2 className={`mt-0.5 ${ui.h1Name} break-all sm:break-normal`}>
              Order #{order.orderNumber}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentBadge order={order} />
              {order.testPayment && <span className={`${ui.badge} ${tone.muted}`}>Test payment</span>}
              <span className="text-[13px] leading-[18px] text-ink-muted inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatOrderDate(order.date)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadInvoice}
            disabled={Boolean(invoiceBusy)}
            className={ui.outline}
          >
            {invoiceBusy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span>Invoice PDF</span>
          </button>
          <button
            type="button"
            onClick={handleShareInvoice}
            disabled={Boolean(invoiceBusy)}
            className={ui.outline}
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
              className={`${ui.outline} col-span-2`}
              title="Open WhatsApp chat with the customer (attach the downloaded PDF)"
            >
              <WhatsAppIcon className="w-4 h-4" live={false} />
              <span>WhatsApp customer</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate('/admin/orders')}
            className="hidden lg:inline-flex sag-link px-2"
          >
            Back to orders
          </button>
        </div>
      </div>

      {/* Customer cancellation request */}
      {cancelRequest && (
        <div role="status" className={`p-3.5 sm:p-5 rounded-2xl border space-y-3 ${cancelRequestOpen ? 'bg-sale-tint border-sale-line' : 'bg-white border-line'}`}>
          <div className="flex items-start gap-3">
            <XCircle className={`w-5 h-5 shrink-0 mt-0.5 ${cancelRequestOpen ? 'text-sale' : 'text-ink-muted'}`} />
            <div className="min-w-0 text-sm leading-5 text-ink space-y-1.5">
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
                <strong>Reason:</strong> {cancelRequest.reason}
              </p>
              {cancelRequestOpen && (
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  Cancelling returns the stock automatically and emails the customer (if the email box below is ticked). Refund ₹{(order.payMode === 'cod' ? order.codAdvance || 0 : order.finalTotal).toLocaleString('en-IN')} from your Razorpay dashboard{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then set the status to Refunded. Keeping the order, or saving it as Shipped or Delivered, closes the request and emails the customer that it is going ahead.
                </p>
              )}
              {cancelRequestPending && cancelRequest.storeNotified === false && (
                <p className="text-[13px] leading-[18px] font-medium text-danger">
                  The email alert for this request could not be sent to the store email (email not set up, or it failed). Check the orders list for new requests.
                </p>
              )}
              {cancelRequestStale && (
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  Close the request so the customer no longer sees it as under review{orderStopped ? '.' : '; they are emailed that the order is going ahead.'}
                </p>
              )}
              {cancelRequest.handledAt && cancelRequest.outcome === 'kept' && (
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  {!keptEmail
                    ? 'The customer was not emailed about this (the email box was unticked). Tell them on WhatsApp if needed.'
                    : keptEmail.ok
                      ? `The customer was emailed that the order is going ahead (${formatWhen(keptEmail.at)}).`
                      : 'The email to the customer failed. Please tell them on WhatsApp.'}
                </p>
              )}
              {!cancelRequestOpen && order.status === 'Cancelled' && order.paymentStatus === 'Paid' && (
                <p className="text-[13px] leading-[18px] text-ink-muted">Payment is still marked Paid. After refunding in Razorpay, set the status to Refunded.</p>
              )}
            </div>
          </div>
          {cancelRequestOpen && (
            <div className="flex flex-wrap gap-2 sm:pl-8 [&>*]:flex-1 sm:[&>*]:flex-none">
              <button
                type="button"
                onClick={handleCancelNow}
                disabled={isSaving}
                className={ui.danger}
              >
                Cancel order now
              </button>
              <button
                type="button"
                onClick={handleKeepOrder}
                disabled={isSaving}
                className={ui.outline}
              >
                Keep order (close request)
              </button>
            </div>
          )}
          {cancelRequestStale && (
            <div className="flex flex-wrap gap-2 sm:pl-8 [&>*]:flex-1 sm:[&>*]:flex-none">
              <button
                type="button"
                onClick={handleKeepOrder}
                disabled={isSaving}
                className={ui.outline}
              >
                Close request
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer return / exchange request */}
      {returnRequest && returnState && (
        <div role="status" className={`p-3.5 sm:p-5 rounded-2xl border space-y-4 ${returnOpen ? 'bg-sale-tint border-sale-line' : 'bg-white border-line'}`}>
          <div className="flex items-start gap-3">
            <RotateCcw className={`w-5 h-5 shrink-0 mt-0.5 ${returnOpen ? 'text-sale' : 'text-ink-muted'}`} />
            <div className="min-w-0 text-sm leading-5 text-ink space-y-1.5">
              <p className="text-[15px] font-semibold text-ink">
                {returnKind === 'exchange' ? 'Exchange' : 'Return'} request · {RETURN_STATUS_LABEL[returnState]}
              </p>
              <p className="text-ink-muted">
                {formatWhen(returnRequest.at) ? `Requested ${formatWhen(returnRequest.at)}` : 'Request date not recorded'}{returnRequest.updatedAt && returnRequest.updatedAt !== returnRequest.at && formatWhen(returnRequest.updatedAt) ? ` · updated ${formatWhen(returnRequest.updatedAt)}` : ''}
              </p>
              {returnRequest.legacy || !returnRequest.status ? (
                <p className="text-[13px] leading-[18px] text-ink-muted">
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
              <p className={ui.eyebrow}>Items</p>
              {returnItems.map((item) => (
                <div key={item.line} className="flex items-center gap-3 p-2 rounded-xl bg-white border border-line">
                  {item.image ? (
                    <img src={getCleanImageUrl(item.image, 120)} alt="" className="w-10 aspect-[4/5] shrink-0 object-cover object-top rounded-lg bg-sunken" />
                  ) : (
                    <span className="w-10 aspect-[4/5] shrink-0 rounded-lg bg-sunken" />
                  )}
                  <div className="min-w-0 text-[13px] leading-[18px]">
                    <p className="font-semibold text-ink truncate">{item.name}</p>
                    <p className="text-ink-muted">
                      Size {item.size || '—'}
                      {returnKind === 'exchange' && <> → <strong className="text-ink">{item.exchangeSize || 'see note'}</strong></>}
                      {' '}· Qty {item.qty}
                    </p>
                    {item.clearance && <span className={`mt-0.5 ${ui.badge} ${tone.danger}`}>Clearance · exchange only</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <p className={ui.eyebrow}>Reason</p>
              <p className="font-semibold text-ink">{returnRequest.status ? returnRequest.reason : 'Other'}</p>
              {(returnRequest.details || (!returnRequest.status && returnRequest.reason)) && (
                <p className="text-ink-muted whitespace-pre-line break-words">{returnRequest.details || returnRequest.reason}</p>
              )}
              {(returnRequest.photos || []).length > 0 && (
                <div className="pt-1">
                  <p className={`${ui.eyebrow} mb-1.5`}>Customer photos (tap to enlarge)</p>
                  <div className="flex flex-wrap gap-2">
                    {(returnRequest.photos || []).map((url, index) => (
                      <button key={url} type="button" onClick={() => setPhotoOpen(url)} className="w-16 aspect-[4/5] rounded-[10px] overflow-hidden bg-sunken cursor-pointer" aria-label={`Open photo ${index + 1}`}>
                        <img src={getCleanImageUrl(url, 200)} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {returnRequest.adminNote && (
                <p className="text-[13px] leading-[18px] text-ink-muted break-words"><strong>Note shown to the customer ({RETURN_STATUS_LABEL[returnState].toLowerCase()} step):</strong> {returnRequest.adminNote}</p>
              )}
            </div>
          </div>

          {(returnRequest.history || []).length > 0 && (
            <div className="sm:pl-8 space-y-1">
              <p className={ui.eyebrow}>History (each step's note)</p>
              {(returnRequest.history || []).slice().reverse().map((entry, index) => (
                <p key={index} className="text-[13px] leading-[18px] text-ink-muted break-words">
                  <strong>{RETURN_STATUS_LABEL[entry.status as keyof typeof RETURN_STATUS_LABEL] || entry.status}</strong> · {formatWhen(entry.at) || 'date not recorded'}{entry.note ? ` — ${entry.note}` : ''}
                </p>
              ))}
            </div>
          )}

          {pastReturns.length > 0 && (
            <div className="sm:pl-8 space-y-1.5">
              <p className={ui.eyebrow}>Earlier requests on this order</p>
              {pastReturns.map((past, index) => {
                const pastState = past.status as keyof typeof RETURN_STATUS_LABEL;
                const pieces = (past.items || []).map((item) => `${item.name || 'Item'} (${item.size || 'one size'}${item.exchangeSize ? ` → ${item.exchangeSize}` : ''}) × ${item.qty}`).join(', ');
                return (
                  <p key={`${past.at}-${index}`} className="text-[13px] leading-[18px] text-ink-muted break-words">
                    <strong>{past.type === 'exchange' ? 'Exchange' : 'Return'} · {RETURN_STATUS_LABEL[pastState] || past.status}</strong> · requested {formatWhen(past.at) || '—'}{past.updatedAt ? ` · closed ${formatWhen(past.updatedAt)}` : ''}
                    {pieces ? ` · ${pieces}` : ''}{past.adminNote ? ` — ${past.adminNote}` : ''}
                  </p>
                );
              })}
              <p className="text-[13px] leading-[18px] text-ink-muted">Pieces already refunded or exchanged cannot be asked for again.</p>
            </div>
          )}

          {returnOpen && (
            <div className="sm:pl-8 space-y-3">
              {returnKind === 'return' ? (
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  Refund the payment in Razorpay{order.paymentRef ? ` (payment ${order.paymentRef})` : ''}, then mark refunded. Items value ₹{returnValue.toLocaleString('en-IN')} at the prices paid, before order discounts and shipping. Stock is not changed automatically; add a piece back in Products if it can be sold again.
                </p>
              ) : (
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  Arrange the replacement (check the new size is in stock), then mark exchanged. Stock is not changed automatically.
                </p>
              )}
              <label className="block">
                <span className={ui.label}>
                  Note to the customer for this step {returnState === 'requested' ? '(required: next steps to approve, or the reason to reject)' : '(optional; required to reject)'}
                </span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder={returnState === 'requested' ? 'e.g. Please pack the piece with its tags; we will share the courier details on WhatsApp.' : 'e.g. Refund sent to your UPI on 30 Sept.'}
                  className={ui.textarea}
                />
                <span className="block mt-1.5 text-[13px] leading-[18px] text-ink-muted">Each step has its own note; an earlier step's note is not repeated to the customer.</span>
              </label>
              <label className="min-h-11 flex items-center gap-2.5 text-sm leading-5 text-ink cursor-pointer">
                <input type="checkbox" checked={returnNotify} onChange={(e) => setReturnNotify(e.target.checked)} className="w-[22px] h-[22px] shrink-0 accent-brand" />
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
                      className={primary ? ui.primary : action === 'reject' ? ui.danger : ui.outline}
                    >
                      {returnBusy === action ? 'Saving…' : label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {photoOpen && (
        <div className="fixed inset-0 z-[90] bg-dark/95 flex items-center justify-center p-4" onClick={() => setPhotoOpen('')} role="dialog" aria-modal="true" aria-label="Customer photo">
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={getCleanImageUrl(photoOpen, 1600)} alt="Customer photo" className="max-h-[78dvh] w-auto mx-auto rounded-xl bg-white" />
            <div className="mt-3 flex justify-center gap-2">
              <a href={photoOpen} target="_blank" rel="noopener noreferrer" className="h-11 px-4 bg-white text-ink text-sm font-semibold rounded-xl inline-flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </a>
              <button type="button" onClick={() => setPhotoOpen('')} className="h-11 px-4 bg-white text-ink text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer">
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

        {/* Left 2 Columns: Order Items & Customer Address */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">

          {/* Items Table Card */}
          <div className={`${ui.card} space-y-4`}>
            <h3 className={`${ui.h2} flex items-center gap-2 pb-3 border-b border-line`}>
              <ShoppingBag className="w-[18px] h-[18px] text-ink-muted" />
              Items ({(order.items || []).length})
            </h3>

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
                  <div key={idx} className="py-3 first:pt-0 flex items-start gap-3">
                    <img
                      src={itemImg}
                      alt={item.product?.name || 'Item'}
                      loading="lazy"
                      className="w-14 sm:w-16 aspect-[4/5] shrink-0 object-cover object-top rounded-[10px] bg-sunken"
                    />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-5 font-semibold text-ink line-clamp-2">
                      {item.product.name}
                    </p>
                    <p className="text-xs leading-4 text-ink-muted mt-0.5 break-words">
                      {item.product.category} · SKU {item.product.sku || item.product.id}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[13px] leading-[18px] text-ink-muted">
                      <span className={`${ui.badge} ${tone.neutral}`}>
                        Size {item.selectedSize}
                      </span>
                      <span className="flex items-center gap-1">
                        <span
                           className="w-3 h-3 rounded-full border border-control"
                          style={{ backgroundColor: item.selectedColor.hex }}
                        />
                        <span>{item.selectedColor.name}</span>
                      </span>
                      <span className="text-ink font-semibold">
                        Qty {item.quantity}
                      </span>
                    </div>
                    {lookParent && (
                      <p className="mt-1.5 text-xs leading-4 font-semibold text-ink-muted break-words">
                        Complete the look · with <span className="text-ink">{lookParent}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-ink tabular-nums">
                      ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      ₹{item.product.price.toLocaleString('en-IN')} each
                    </p>
                  </div>
                </div>
               );
              })}
            </div>

            {/* Financial Summary */}
            <div className="pt-3 border-t border-line space-y-1.5 text-sm leading-5 text-ink-muted tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-ink">₹{order.subtotal.toLocaleString('en-IN')}</span>
              </div>
              {(order.comboDiscount || 0) > 0 && (
                <div className="flex justify-between text-sale font-semibold">
                  <span>Combo discount</span>
                  <span>- ₹{(order.comboDiscount || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
              {(order.couponDiscount || 0) > 0 && (
                <div className="flex justify-between text-sale font-semibold">
                  <span>Coupon ({order.couponCode})</span>
                  <span>- ₹{(order.couponDiscount || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
              {(order.prepaidDiscount || 0) > 0 && (
                <div className="flex justify-between text-sale font-semibold">
                  <span>Online payment discount</span>
                  <span>- ₹{(order.prepaidDiscount || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
              {!order.couponDiscount && !order.prepaidDiscount && !order.comboDiscount && order.discountAmount > 0 && (
                <div className="flex justify-between text-sale font-semibold">
                  <span>Discount ({order.couponCode || 'applied'})</span>
                  <span>- ₹{order.discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="font-semibold text-ink">
                  {order.shippingCharge === 0 ? 'Free' : `₹${order.shippingCharge}`}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-line text-[15px] font-semibold text-ink">
                <span>{order.payMode === 'cod' ? 'Order total' : paid ? 'Total paid' : 'Order total'}</span>
                <span className="text-lg font-bold text-ink">₹{order.finalTotal.toLocaleString('en-IN')}</span>
              </div>
              {order.payMode === 'cod' && (
                <div id="admin-order-cod" className="rounded-control bg-peach p-3 text-sm leading-5 text-ink">
                  <p className="font-bold">Cash on delivery</p>
                  <p>Paid online: ₹{(order.codAdvance || 0).toLocaleString('en-IN')}</p>
                  <p className="font-bold">Collect in cash at delivery: ₹{(order.codDue || 0).toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer & Shipping Address Card */}
          <div className={`${ui.card} space-y-4`}>
            <h3 className={`${ui.h2} flex items-center gap-2 pb-3 border-b border-line`}>
              <MapPin className="w-[18px] h-[18px] text-ink-muted" />
              Customer and delivery address
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm leading-5 text-ink-muted">
              <div className="space-y-1 p-3 bg-page rounded-xl min-w-0">
                <p className={ui.eyebrow}>Customer</p>
                <p className="font-semibold text-ink flex items-center gap-2">
                  <User className="w-4 h-4 shrink-0 text-ink-muted" />
                  {order.customerName}
                </p>
                <p className="flex items-center gap-2 text-ink break-all">
                  <Mail className="w-4 h-4 shrink-0 text-ink-muted" />
                  {order.customerEmail}
                </p>
                <p className="flex items-center gap-2 text-ink">
                  <Phone className="w-4 h-4 shrink-0 text-ink-muted" />
                  +91 {order.customerMobile}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-page rounded-xl min-w-0">
                <p className={ui.eyebrow}>
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
          </div>

        </div>

        {/* Right 1 Column: Status Workflow & Payment Details */}
        <div className="space-y-4 sm:space-y-5">

          {/* Fulfillment Status Card */}
          <form onSubmit={handleSave} className={`${ui.card} space-y-4`}>
            <h3 className={`${ui.h2} flex items-center gap-2 pb-3 border-b border-line`}>
              <Truck className="w-[18px] h-[18px] text-ink-muted" />
              Status and tracking
            </h3>

            <div>
              <label htmlFor="admin-order-status" className={ui.label}>
                Order status
              </label>
              <select
                id="admin-order-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AdminOrderStatus)}
                className={`${ui.select} pl-3.5 font-semibold`}
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-order-courier" className={ui.label}>
                Courier partner
              </label>
              <input
                id="admin-order-courier"
                type="text"
                value={courierPartner}
                onChange={(e) => setCourierPartner(e.target.value)}
                placeholder="e.g. BlueDart, Delhivery, DTDC"
                className={ui.field}
              />
            </div>

            {status === 'Out for Delivery' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-page p-3">
                <div>
                  <label htmlFor="admin-order-agent-name" className={ui.label}>Delivery executive name</label>
                  <input id="admin-order-agent-name" type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={80} placeholder="Optional"
                    className={ui.field} />
                </div>
                <div>
                  <label htmlFor="admin-order-agent-phone" className={ui.label}>Delivery executive phone</label>
                  <input id="admin-order-agent-phone" type="tel" inputMode="tel" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} maxLength={15} placeholder="Optional"
                    className={ui.field} />
                </div>
                <p className="sm:col-span-2 text-[13px] leading-[18px] text-ink-muted">Shown to the customer only while the order is out for delivery.</p>
              </div>
            )}

            <div>
              <label htmlFor="admin-order-awb" className={ui.label}>
                Courier AWB / tracking number
              </label>
              <input
                id="admin-order-awb"
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. BLUEDART-882910"
                className={`${ui.field} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="admin-order-tracking-url" className={ui.label}>
                Tracking link <span className={ui.optional}>(optional)</span>
              </label>
              <input
                id="admin-order-tracking-url"
                type="url"
                inputMode="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://… (only if the courier gave you a link)"
                className={ui.field}
              />
              <p className={ui.hint}>
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
              <label htmlFor="admin-order-expected" className={ui.label}>
                Expected delivery date <span className={ui.optional}>(optional)</span>
              </label>
              <input
                id="admin-order-expected"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={ui.field}
              />
              <p className={ui.hint}>Shown to the customer as "Expected by …" only when you set it. Leave empty if unsure.</p>
            </div>

            <div>
              <label htmlFor="admin-order-customer-note" className={ui.label}>
                Message to customer <span className={ui.optional}>(shown on tracking and in the email)</span>
              </label>
              <textarea
                id="admin-order-customer-note"
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Optional, e.g. Your order will ship on Monday."
                className={ui.textarea}
              />
            </div>

            <div>
              <label htmlFor="admin-order-notes" className={ui.label}>
                Internal notes <span className={ui.optional}>(admin only)</span>
              </label>
              <textarea
                id="admin-order-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Only visible to admins"
                className={ui.textarea}
              />
            </div>

            <label className="min-h-11 flex items-center gap-2.5 text-sm leading-5 text-ink cursor-pointer">
              <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} className="w-[22px] h-[22px] shrink-0 accent-brand" />
              Email the customer when the status changes
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="sag-btn-primary w-full gap-2"
            >
              <Save className="w-[18px] h-[18px]" />
              <span>{isSaving ? 'Saving…' : 'Save order'}</span>
            </button>
            {lastEmail && (
              <p className="text-[13px] leading-[18px] text-ink-muted">
                Last email: {lastEmail.kind} · {new Date(lastEmail.at).toLocaleString('en-IN')} · {lastEmail.ok ? 'sent' : 'failed'}
              </p>
            )}
            {(order.timeline || []).length > 0 && (
              <div className="pt-3 border-t border-line space-y-1.5">
                <p className={ui.eyebrow}>History</p>
                {(order.timeline || []).slice().reverse().map((entry, index) => (
                  <p key={index} className="text-[13px] leading-[18px] text-ink-muted">
                    <strong>{entry.status}</strong> · {new Date(entry.at).toLocaleString('en-IN')}{entry.note ? ` — ${entry.note}` : ''}
                  </p>
                ))}
              </div>
            )}
          </form>

          {/* Payment Card */}
          <div className={`${ui.card} space-y-3`}>
            <h3 className={`${ui.h2} flex items-center gap-2 pb-3 border-b border-line`}>
              <CreditCard className="w-[18px] h-[18px] text-ink-muted" />
              Payment
            </h3>

            <div className="space-y-2 text-sm leading-5 text-ink-muted">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentBadge order={order} />
                {paid && <span className="text-[13px] leading-[18px] text-ok font-medium inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Verified with the gateway</span>}
                {order.testPayment && <span className={`${ui.badge} ${tone.warn}`}>Test payment (no real money)</span>}
              </div>
              <p className="text-[13px] leading-[18px] text-ink-muted">Payment status is separate from the order status above.</p>
              {(order.stockShortfall || []).length > 0 && (
                <div role="alert" className={ui.alert}>
                  Stock was short when this order was paid: {(order.stockShortfall || []).map((s) => `${s.name || s.productId} (wanted ${s.requested}, had ${s.available})`).join(', ')}
                </div>
              )}
              {order.giftNote && (
                <div className="p-3 bg-page rounded-xl text-ink break-words"><strong>Gift note:</strong> {order.giftNote}</div>
              )}

              <div className="pt-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Method</span>
                  <span className="font-semibold text-ink capitalize">{order.paymentMethod}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted shrink-0">Gateway ref</span>
                  <span className="font-mono text-xs font-semibold text-ink break-all text-right">{order.paymentRef || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Expected delivery</span>
                  <span className="font-semibold text-ink">{formatExpectedDate(liveExpected) || 'Not set'}</span>
                </div>
                {!liveExpected && formatDeliveryDate(requests?.estimatedDeliveryDate) && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Estimate at checkout</span>
                    <span className="text-ink">{formatDeliveryDate(requests?.estimatedDeliveryDate)}</span>
                  </div>
                )}
                {liveTrackingUrl && (
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-muted shrink-0">Tracking link</span>
                    <a href={liveTrackingUrl} target="_blank" rel="noopener noreferrer" className={ui.link}>Open</a>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
