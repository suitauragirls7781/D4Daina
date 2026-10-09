import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { Order } from '../types';
import { STORE_ADDRESS, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';

const inr = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatDay = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal behaviour: focus moves into the dialog (to `[data-autofocus]` if present),
 * Tab stays inside, Escape closes, page scroll is locked, and focus returns to the opener on close.
 */
export const useDialogA11y = (ref: React.RefObject<HTMLElement | null>, onClose: () => void) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
    const initial = ref.current?.querySelector<HTMLElement>('[data-autofocus]') || focusables()[0] || ref.current;
    initial?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
};

// While the receipt is open, printing shows only the receipt (everything else on the page is hidden).
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  :root { color-scheme: light !important; }
  html, body, #root { background: #fff !important; overflow: visible !important; }
  body::before { display: none !important; }
  body > *:not(.sag-invoice-root) { display: none !important; }
  .sag-invoice-root, .sag-invoice-root * { color: #000 !important; background: transparent !important; border-color: #9a9a9a !important; box-shadow: none !important; text-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  .sag-invoice-root { position: static !important; inset: auto !important; display: block !important; background: #fff !important; padding: 0 !important; animation: none !important; }
  .sag-invoice-panel { max-height: none !important; overflow: visible !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; width: 100% !important; max-width: none !important; animation: none !important; }
  .sag-invoice-panel * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sag-no-print { display: none !important; }
  .sag-invoice-body { padding: 0 !important; }
}`;

/** Printable receipt built only from the real order record (no invented tax numbers or lines). */
export const OrderInvoice: React.FC<{ order: Order; onClose: () => void }> = ({ order, onClose }) => {
  const { storeSettings } = useAdmin();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, onClose);

  const storeName = storeSettings?.storeName?.trim() || 'Suit Aura Girls';
  const storeAddress = storeSettings?.address?.trim() || STORE_ADDRESS;
  const storePhone = storeSettings?.phone?.trim() || SUPPORT_PHONE_DISPLAY;
  const storeEmail = storeSettings?.storeEmail?.trim() || '';
  // Seller details and the GST number are shown only if the owner has configured them; tax lines are never made up.
  const gstin = storeSettings?.gstin?.trim() || '';
  const legalName = storeSettings?.legalName?.trim() || '';
  const invoiceAddress = storeSettings?.invoiceAddress?.trim() || '';
  const invoiceNote = storeSettings?.invoiceNote?.trim() || '';
  const invoicePrefix = storeSettings?.invoicePrefix?.trim() || 'SAG-INV';

  const paid = order.paymentStatus === 'Paid';
  const refunded = order.paymentStatus === 'Refunded' || order.status === 'Refunded';
  // An invoice number exists once the order has been paid; before that this is only an order receipt.
  const invoiceNumber = paid || refunded ? `${invoicePrefix}-${order.orderNumber}` : '';
  const title = invoiceNumber ? 'Invoice' : 'Order receipt';
  const gateway = order.paymentMethod === 'payu' ? 'PayU' : 'Razorpay';
  const paymentStatus = refunded ? 'Refunded' : paid ? 'Paid' : 'Payment pending';
  const address = order.deliveryAddress || ({} as Order['deliveryAddress']);
  const shipLines = [
    [address.houseFlat, address.street].filter(Boolean).join(', '),
    address.area,
    [[address.city, address.state].filter(Boolean).join(', '), address.pincode].filter(Boolean).join(' - '),
  ].filter(Boolean);
  const phone = address.mobile || order.customerMobile || '';
  const mrpSavings = order.items.reduce((sum, item) => {
    const unit = Number(item.product?.price) || 0;
    const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
    return sum + (mrp - unit) * (Number(item.quantity) || 0);
  }, 0);
  const namedDiscounts = (order.comboDiscount || 0) + (order.couponDiscount || 0) + (order.prepaidDiscount || 0);

  const totals: Array<[string, string, string?]> = [['Subtotal', inr(order.subtotal)]];
  if ((order.comboDiscount || 0) > 0) totals.push(['Combo discount', `−${inr(order.comboDiscount || 0)}`, 'discount']);
  if ((order.couponDiscount || 0) > 0) totals.push([`Coupon ${order.couponCode || ''}`.trim(), `−${inr(order.couponDiscount || 0)}`, 'discount']);
  if ((order.prepaidDiscount || 0) > 0) totals.push(['Prepaid discount', `−${inr(order.prepaidDiscount || 0)}`, 'discount']);
  if (!namedDiscounts && (order.discountAmount || 0) > 0) totals.push(['Discount', `−${inr(order.discountAmount)}`, 'discount']);
  totals.push(['Shipping', order.shippingCharge ? inr(order.shippingCharge) : 'Free']);

  const meta: Array<[string, string]> = [
    ['Invoice number', invoiceNumber],
    ['Invoice date', invoiceNumber ? formatDay(order.paidAt || order.date) : ''],
    ['Order number', `#${order.orderNumber}`],
    ['Order date', formatDate(order.date)],
    ['Payment date', paid || refunded ? formatDate(order.paidAt) : ''],
    ['Payment method', `Online · ${gateway}`],
    ['Payment status', paymentStatus],
    ['Payment reference', order.paymentRef || ''],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  const cell = 'py-2.5 align-top border-b border-line';
  const boxTitle = 'aura-lbl mb-1.5 text-[12px]';

  // "Download invoice": a real PDF file (the same document the store sends from the admin panel)
  const [downloading, setDownloading] = React.useState(false);
  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { downloadInvoicePdf } = await import('../lib/invoicePdf');
      await downloadInvoicePdf(order, storeSettings);
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="sag-invoice-root fixed inset-0 z-[80] bg-[color:var(--sag-scrim)] flex items-end sm:items-center justify-center sm:p-4 sag-fade" onClick={onClose}>
      <style>{PRINT_CSS}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sag-invoice-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sag-invoice-panel bg-surface text-ink w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] focus:outline-none animate-in fade-in slide-in-from-bottom-5"
      >
        <div className="sag-no-print sticky top-0 z-10 flex items-center gap-2 pl-4 pr-3 sm:pl-6 sm:pr-5 py-3 bg-surface border-b border-line rounded-t-[28px]">
          <button
            type="button"
            onClick={() => window.print()}
            className="aura-btn aura-btn-sm px-5"
          >
            <Printer aria-hidden="true" /> Print<span className="hidden sm:inline"> / Save as PDF</span>
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            aria-label={`Download ${invoiceNumber ? 'invoice' : 'receipt'} as PDF`}
            className="aura-btn aura-btn-line aura-btn-sm px-5"
          >
            <Download aria-hidden="true" /> Download<span className="hidden sm:inline"> {invoiceNumber ? 'invoice' : 'receipt'}</span>
          </button>
          <span className="flex-1" aria-hidden="true" />
          <button type="button" onClick={onClose} aria-label="Close receipt" className="aa-ic">
            <X className="w-5 h-5" strokeWidth={1.6} />
          </button>
        </div>

        <article className="sag-invoice-body aura-num p-5 sm:p-8 text-ink space-y-6">
          <header className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-line">
            <div className="min-w-0 text-sm leading-5 text-ink-muted">
              <p className="text-[22px] leading-7 font-extrabold tracking-[-0.025em] text-ink">{storeName}</p>
              <p className="mt-1">{storeAddress}</p>
              <p>Phone: {storePhone}</p>
              {storeEmail && <p className="break-all">Email: {storeEmail}</p>}
              {legalName && legalName !== storeName && <p className="text-ink">{legalName}</p>}
              {invoiceAddress && invoiceAddress !== storeAddress && <p>Registered address: {invoiceAddress}</p>}
              {gstin && <p>GSTIN: {gstin}</p>}
            </div>
            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2">
              <h2 id="sag-invoice-title" className="text-[34px] leading-9 font-extrabold tracking-[-0.035em] text-ink">{title}</h2>
              <span className={`aa-pill ${paid ? 'is-ok' : refunded ? 'is-mu' : 'is-wait'}`}>{paymentStatus}</span>
            </div>
          </header>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm leading-5 rounded-[18px] bg-sunken p-4 print:bg-transparent print:p-0">
            {meta.map(([label, value]) => (
              <div key={label} className="flex justify-between sm:block gap-3">
                <dt className="text-ink-muted shrink-0">{label}</dt>
                <dd className="text-ink font-medium text-right sm:text-left break-all min-w-0">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid sm:grid-cols-2 gap-3 text-sm leading-5">
            <section className="rounded-[18px] border border-line p-4">
              <p className={boxTitle}>Billed to</p>
              <p className="font-medium">{order.customerName || address.fullName}</p>
              {order.customerEmail && <p className="text-ink-muted break-all">{order.customerEmail}</p>}
              {phone && <p className="text-ink-muted">{phone}</p>}
              {shipLines.map((line) => <p key={`bill-${line}`} className="text-ink-muted">{line}</p>)}
            </section>
            <section className="rounded-[18px] border border-line p-4">
              <p className={boxTitle}>Shipped to</p>
              <p className="font-medium">{address.fullName || order.customerName}</p>
              {shipLines.map((line) => <p key={line} className="text-ink-muted">{line}</p>)}
            </section>
          </div>

          <table className="w-full text-sm leading-5 border-collapse">
            <caption className="sr-only">Items in order {order.orderNumber}</caption>
            <thead>
              <tr className="text-[10.5px] leading-4 uppercase tracking-[0.08em] text-ink-muted text-left border-b border-line">
                <th scope="col" className="pb-2 font-medium">Item</th>
                <th scope="col" className="pb-2 font-medium text-right px-2 hidden sm:table-cell print:table-cell">MRP</th>
                <th scope="col" className="pb-2 font-medium text-right px-2">Price</th>
                <th scope="col" className="pb-2 font-medium text-right px-2 hidden sm:table-cell print:table-cell">Discount</th>
                <th scope="col" className="pb-2 font-medium text-center px-2">Qty</th>
                <th scope="col" className="pb-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
                const unit = Number(item.product?.price) || 0;
                const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
                const lineOff = (mrp - unit) * item.quantity;
                return (
                  <tr key={item.id}>
                    <td className={`${cell} pr-2`}>
                      <p className="text-ink">{item.product?.name}</p>
                      <p className="text-[13px] leading-[18px] text-ink-muted">{[item.selectedSize ? `Size ${item.selectedSize}` : '', colour].filter(Boolean).join(' · ')}</p>
                      {mrp > unit && <p className="text-[13px] leading-[18px] text-ink-muted sm:hidden print:hidden">MRP {inr(mrp)} · you save {inr(lineOff)}</p>}
                    </td>
                    <td className={`${cell} text-right px-2 whitespace-nowrap hidden sm:table-cell print:table-cell text-ink-muted`}>{inr(mrp)}</td>
                    <td className={`${cell} text-right px-2 whitespace-nowrap`}>{inr(unit)}</td>
                    <td className={`${cell} text-right px-2 whitespace-nowrap hidden sm:table-cell print:table-cell text-sale`}>{lineOff > 0 ? `−${inr(lineOff)}` : '—'}</td>
                    <td className={`${cell} text-center px-2`}>{item.quantity}</td>
                    <td className={`${cell} text-right whitespace-nowrap font-medium`}>{inr(unit * item.quantity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="sm:ml-auto sm:max-w-xs space-y-1.5 text-sm leading-5 rounded-[18px] border border-line p-4 print:border-0 print:p-0">
            {totals.map(([label, value, kind]) => (
              <div key={label} className={`flex justify-between gap-4 ${kind === 'discount' ? 'text-sale' : 'text-ink-muted'}`}>
                <span>{label}</span>
                <span className="whitespace-nowrap">{value}</span>
              </div>
            ))}
            {order.payMode === 'cod' ? (
              <>
                <div className="flex justify-between items-baseline gap-4 pt-2.5 mt-1 border-t border-line text-ink"><span className="font-semibold">Order total</span><span className="font-semibold">{inr(order.finalTotal)}</span></div>
                <div className="flex justify-between gap-4 text-sm leading-5 text-ink-muted"><span>Paid online</span><span>{inr(order.codAdvance || 0)}</span></div>
                <div className="flex justify-between items-baseline gap-4 text-ink"><span className="text-base leading-[22px] font-semibold">Pay in cash on delivery</span><span className="text-lg leading-[22px] whitespace-nowrap font-semibold">{inr(order.codDue || 0)}</span></div>
              </>
            ) : (
            <div className="flex justify-between items-baseline gap-4 pt-2.5 mt-1 border-t border-line text-ink">
              <span className="font-semibold">{paid || refunded ? 'Total paid' : 'Order total'}</span>
              <span className="font-semibold text-lg leading-[22px] whitespace-nowrap">{inr(order.finalTotal)}</span>
            </div>
            )}
            {refunded && <p className="text-[13px] leading-[18px] text-ink-muted">This order has been refunded to the original payment method.</p>}
            {mrpSavings > 0 && <p className="text-[13px] leading-[18px] text-sale">You saved {inr(mrpSavings)} on MRP.</p>}
          </div>

          <footer className="pt-5 border-t border-line text-[13px] leading-[18px] text-ink-muted space-y-1">
            {invoiceNote && <p className="mb-2 whitespace-pre-line">{invoiceNote}</p>}
            <p>Thank you for shopping with {storeName}. This {invoiceNumber ? 'invoice' : 'receipt'} is generated from your order record; all amounts are in Indian Rupees.</p>
            <p>For help with this order, contact us on {storePhone}{storeEmail ? ` or ${storeEmail}` : ''} and quote #{order.orderNumber}.</p>
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  );
};
