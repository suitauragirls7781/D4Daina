import React from 'react';
import { Printer } from 'lucide-react';
import { Order } from '../../types';
import { useAdmin } from '../../context/AdminContext';

/**
 * A small packing slip for one order, printed black on white. The slip is written into its own hidden
 * frame and only that frame is printed, so nothing of the admin panel appears on the paper.
 */

export interface PackingSlipStore {
  name?: string;
  address?: string;
  phone?: string;
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
)[c]);
const money = (value: unknown) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const clean = (value: unknown) => String(value ?? '').trim();

/** The slip of one order, without the page around it, so several slips can share one print. */
const slipBody = (order: Order, store: PackingSlipStore) => {
  const a = (order.deliveryAddress || {}) as unknown as Record<string, unknown>;
  const time = Date.parse(order.date || '');
  const date = Number.isFinite(time)
    ? new Date(time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const name = clean(a.fullName) || clean(order.customerName);
  const phone = clean(order.customerMobile) || clean(a.mobile);
  const other = clean(a.altMobile);
  const city = clean(a.city);
  const district = clean(a.district);
  const lines = [
    [a.houseFlat, a.street, a.addressLine1, a.addressLine2].map(clean).filter(Boolean).join(', '),
    [clean(a.area), clean(a.landmark) ? `Landmark: ${clean(a.landmark)}` : ''].filter(Boolean).join(', '),
    [clean(a.tehsil), city, district && district !== city ? district : '', clean(a.state)].filter(Boolean).join(', '),
    clean(a.pincode) ? `PIN code: ${clean(a.pincode)}` : '',
  ].filter(Boolean);

  const items = Array.isArray(order.items) ? order.items : [];
  const pieces = items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
  const rows = items.map((item, i) => {
    const colour = clean((item?.selectedColor as { name?: string } | undefined)?.name);
    const sku = clean(item?.product?.sku);
    const withOutfit = clean(item?.lookParentName);
    return `<tr>
      <td class="n">${i + 1}</td>
      <td><b>${esc(item?.product?.name || 'Item')}</b>${sku ? `<br><span class="s">SKU ${esc(sku)}</span>` : ''}${withOutfit ? `<br><span class="s">With: ${esc(withOutfit)}</span>` : ''}</td>
      <td>${esc(clean(item?.selectedSize) || '-')}</td>
      <td>${esc(colour || '-')}</td>
      <td class="q">${Math.max(1, Number(item?.quantity) || 1)}</td>
    </tr>`;
  }).join('');

  const cod = order.payMode === 'cod';
  const payment = order.paymentStatus === 'Refunded' ? 'Payment refunded'
    : order.paymentStatus !== 'Paid' ? 'Payment not received yet'
    : cod ? `Cash on delivery: collect ${money(order.codDue)}`
    : 'Paid online';
  const paymentNote = order.paymentStatus === 'Paid' && cod
    ? `Order total ${money(order.finalTotal)} · ${money(order.codAdvance)} already paid online`
    : order.paymentStatus === 'Paid' ? `Order total ${money(order.finalTotal)} · nothing to collect` : '';
  const gift = clean(order.giftNote);
  const from = [clean(store.address), clean(store.phone) ? `Phone: ${clean(store.phone)}` : ''].filter(Boolean);

  return `<div class="slip">
  <div class="top">
    <div><h1>${esc(clean(store.name) || 'Suit Aura Girls')}</h1><div class="s">Packing slip</div></div>
    <div class="right"><b>Order ${esc(order.orderNumber)}</b>${date ? `<br><span class="s">${esc(date)}</span>` : ''}</div>
  </div>
  <div class="label">Deliver to</div>
  <div class="to">
    <b>${esc(name || 'Customer')}</b><br>
    ${lines.map(esc).join('<br>')}${lines.length ? '<br>' : ''}
    ${phone ? `Phone: <b>${esc(phone)}</b>` : ''}${other ? ` · Other phone: ${esc(other)}` : ''}
  </div>
  <div class="label">Items in this parcel (${pieces} ${pieces === 1 ? 'piece' : 'pieces'})</div>
  <table>
    <thead><tr><th class="n">#</th><th>Item</th><th>Size</th><th>Colour</th><th class="q">Qty</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No items on this order.</td></tr>'}</tbody>
  </table>
  ${gift ? `<div class="label">Gift note</div><div>${esc(gift)}</div>` : ''}
  <div class="pay">${esc(payment)}${paymentNote ? `<small>${esc(paymentNote)}</small>` : ''}</div>
  ${from.length ? `<div class="label">From</div><div class="s"><b>${esc(clean(store.name) || 'Suit Aura Girls')}</b><br>${from.map(esc).join('<br>')}</div>` : ''}
</div>`;
};

/** The printable page: one slip per order, each on its own sheet. */
const slipHtml = (orders: Order[], store: PackingSlipStore) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${orders.length === 1 ? `Packing slip ${esc(orders[0].orderNumber)}` : `${orders.length} packing slips`}</title>
<style>
  @page { margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12pt; line-height: 1.4; }
  .slip { max-width: 180mm; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 2px solid #000; padding-bottom: 3mm; }
  h1 { margin: 0; font-size: 18pt; }
  .s { font-size: 9.5pt; }
  .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; margin: 5mm 0 1mm; }
  .to { border: 1.5px solid #000; padding: 3mm 4mm; font-size: 13pt; }
  .to b { font-size: 15pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 2mm; text-align: left; vertical-align: top; font-size: 11pt; }
  th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .n { width: 8mm; } .q { width: 14mm; text-align: center; font-weight: bold; }
  .pay { margin-top: 5mm; border: 2.5px solid #000; padding: 4mm; text-align: center; font-size: 20pt; font-weight: bold; }
  .pay small { display: block; margin-top: 1mm; font-size: 10pt; font-weight: normal; }
  .right { text-align: right; }
  .slip + .slip { break-before: page; page-break-before: always; }
</style></head>
<body>${orders.map((order) => slipBody(order, store)).join('\n')}</body></html>`;

/** Opens the printer window with the packing slips of the given orders, one per sheet. Returns false when the browser would not allow it. */
export const printPackingSlips = (orders: Order[], store: PackingSlipStore = {}): boolean => {
  if (orders.length === 0) return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(slipHtml(orders, store));
  doc.close();
  win.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 500));
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      frame.remove();
    }
  }, 150);
  // Some browsers never report that printing ended: tidy up anyway
  window.setTimeout(() => frame.remove(), 5 * 60 * 1000);
  return true;
};

/** Opens the printer window with one order's packing slip. Returns false when the browser would not allow it. */
export const printPackingSlip = (order: Order, store: PackingSlipStore = {}): boolean => printPackingSlips([order], store);

interface PackingSlipButtonProps {
  order: Order;
  /** Defaults to the glass pill. */
  className?: string;
  label?: string;
}

/** "Print packing slip" for one order; the store's name, address and phone come from Admin → Settings. */
export const PackingSlipButton: React.FC<PackingSlipButtonProps> = ({ order, className = 'sag-btn-outline', label = 'Print packing slip' }) => {
  const { storeSettings } = useAdmin();
  return (
    <button
      type="button"
      className={className}
      onClick={() => printPackingSlip(order, { name: storeSettings?.storeName, address: storeSettings?.address, phone: storeSettings?.phone })}
    >
      <Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> {label}
    </button>
  );
};
