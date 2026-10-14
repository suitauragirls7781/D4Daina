/**
 * Invoice as a real A4 PDF file (vector text, brand colours, logo), built in the browser with jsPDF.
 * jsPDF is loaded only when someone downloads or shares an invoice, so it never slows the store down.
 * Amounts are the order's own server-calculated figures; tax lines are never invented (GST shown only
 * as "inclusive" and the seller GSTIN only when the owner has set it).
 */
import type { Order, StoreSettings } from '../types';
import { STORE_ADDRESS, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';

const PLUM: [number, number, number] = [17, 16, 19];       // ink (the name is kept from an earlier look)
const INK: [number, number, number] = [17, 16, 19];
const MUTED: [number, number, number] = [106, 100, 94];
const GOLD: [number, number, number] = [106, 100, 94];      // muted ink (labels, "payment pending")
const LAVENDER: [number, number, number] = [242, 239, 234];
const IVORY: [number, number, number] = [248, 246, 242];
const EMERALD: [number, number, number] = [30, 58, 52];    // forest (paid, savings)
const ROSE: [number, number, number] = [142, 76, 88];

// The standard PDF fonts only cover Western characters: common symbols are swapped for plain text and
// anything else (e.g. emoji) is dropped, so a line never turns into scrambled, letter-spaced text.
const pdfSafe = (value: string) => String(value ?? '')
  .replace(/₹\s?/g, 'Rs. ')
  .replace(/[→⟶➔]/g, '>')
  .replace(/[←]/g, '<')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E -ÿ–—•…]/g, '')
  .replace(/\s{2,}/g, ' ');

// Standard PDF fonts have no ₹ glyph, so amounts read "Rs. 1,299" (the usual form on Indian invoices)
const rs = (value: number) => `Rs. ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const day = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const invoiceDetails = (order: Order, settings?: Partial<StoreSettings> | null) => {
  const prefix = settings?.invoicePrefix?.trim() || 'SAG-INV';
  const paid = order.paymentStatus === 'Paid';
  const refunded = order.paymentStatus === 'Refunded' || order.status === 'Refunded';
  const number = paid || refunded ? `${prefix}-${order.orderNumber}` : '';
  return { number, paid, refunded, fileName: `${number || `Order-${order.orderNumber}`}.pdf` };
};

// The logo as a PNG data URL (the site's .webp is redrawn on a canvas so the PDF can embed it)
const logoDataUrl = async (): Promise<{ data: string; ratio: number } | null> => {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/suit-aura-logo-480.webp';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    return { data: canvas.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight };
  } catch {
    return null;
  }
};

/** Builds the invoice PDF and returns it as a Blob plus its file name. */
export const buildInvoicePdf = async (order: Order, settings?: Partial<StoreSettings> | null) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;
  const { number, paid, refunded, fileName } = invoiceDetails(order, settings);

  const storeName = settings?.storeName?.trim() || 'Suit Aura Girls';
  const legalName = settings?.legalName?.trim() || '';
  const gstin = settings?.gstin?.trim() || '';
  const sellerAddress = settings?.invoiceAddress?.trim() || settings?.address?.trim() || STORE_ADDRESS;
  const sellerPhone = settings?.phone?.trim() || SUPPORT_PHONE_DISPLAY;
  const sellerEmail = settings?.storeEmail?.trim() || '';
  const note = settings?.invoiceNote?.trim() || '';

  const text = (value: string, x: number, y: number, opts: { size?: number; color?: [number, number, number]; bold?: boolean; font?: 'helvetica' | 'times'; align?: 'left' | 'right' | 'center'; maxWidth?: number } = {}) => {
    doc.setFont(opts.font || 'helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9.5);
    doc.setTextColor(...(opts.color || INK));
    const safe = pdfSafe(value);
    const lines = opts.maxWidth ? doc.splitTextToSize(safe, opts.maxWidth) : [safe];
    doc.text(lines, x, y, { align: opts.align || 'left' });
    return lines.length;
  };

  // ---- Header band
  doc.setFillColor(...PLUM);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, W, 1.1, 'F');
  const logo = await logoDataUrl();
  if (logo) {
    doc.setFillColor(...IVORY);
    doc.roundedRect(M, 7, 50, 24, 3, 3, 'F');
    const h = 20;
    const w = Math.min(46, h * logo.ratio);
    doc.addImage(logo.data, 'PNG', M + (50 - w) / 2, 9, w, h);
  } else {
    text(storeName, M, 22, { size: 20, font: 'times', color: [255, 255, 255] });
  }
  text(number ? 'TAX INVOICE' : 'ORDER RECEIPT', W - M, 17, { size: 18, font: 'times', bold: true, color: [255, 255, 255], align: 'right' });
  text(number || `Order #${order.orderNumber}`, W - M, 24, { size: 10, color: [234, 215, 209], align: 'right' });
  const status = refunded ? 'REFUNDED' : paid ? 'PAID' : 'PAYMENT PENDING';
  doc.setFillColor(...(refunded ? ROSE : paid ? EMERALD : GOLD));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const pillW = doc.getTextWidth(status) + 8;
  doc.roundedRect(W - M - pillW, 27.5, pillW, 6, 3, 3, 'F');
  text(status, W - M - pillW / 2, 31.6, { size: 8, bold: true, color: [255, 255, 255], align: 'center' });

  // ---- Seller + invoice facts
  let y = 50;
  text('SOLD BY', M, y, { size: 8, bold: true, color: GOLD });
  y += 5;
  text(legalName || storeName, M, y, { size: 11, bold: true });
  y += 5;
  y += text(sellerAddress, M, y, { size: 9, color: MUTED, maxWidth: 88 }) * 4.2;
  text(`Phone ${sellerPhone}${sellerEmail ? `  ·  ${sellerEmail}` : ''}`, M, y, { size: 9, color: MUTED });
  if (gstin) text(`GSTIN ${gstin}`, M, y + 4.6, { size: 9, bold: true });

  const facts: Array<[string, string]> = [
    number ? ['Invoice no.', number] : ['Receipt for', `Order #${order.orderNumber}`],
    ...(number ? [['Invoice date', day(order.paidAt || order.date)] as [string, string]] : []),
    ['Order no.', `#${order.orderNumber}`],
    ['Order date', day(order.date)],
    ['Payment', `Online · ${order.paymentMethod === 'payu' ? 'PayU' : 'Razorpay'}`],
    ...(order.paymentRef ? [['Payment ref.', order.paymentRef] as [string, string]] : []),
  ];
  doc.setFillColor(...LAVENDER);
  doc.roundedRect(116, 45, W - M - 116, 8 + facts.length * 5.4, 3, 3, 'F');
  facts.forEach(([k, v], i) => {
    text(k, 121, 52 + i * 5.4, { size: 8.5, color: MUTED });
    text(v, W - M - 5, 52 + i * 5.4, { size: 8.5, bold: true, align: 'right' });
  });

  // ---- Bill to / Ship to
  y = Math.max(y + (gstin ? 12 : 8), 53 + facts.length * 5.4 + 8);
  const a = order.deliveryAddress || ({} as Order['deliveryAddress']);
  const addressLines = [
    a.fullName || order.customerName || '',
    [a.houseFlat, a.street].filter(Boolean).join(', '),
    [a.area, (a as any).landmark].filter(Boolean).join(', '),
    [[a.city, (a as any).district, a.state].filter(Boolean).join(', '), a.pincode].filter(Boolean).join(' - '),
    a.mobile ? `Mobile ${a.mobile}` : '',
    order.customerEmail || a.email || '',
  ].filter(Boolean);
  const colW = (W - 2 * M - 6) / 2;
  // Long address lines are wrapped first, so the box grows and lines never overlap
  const wrapped = addressLines.flatMap((line, j) => {
    doc.setFont('helvetica', j === 0 ? 'bold' : 'normal');
    doc.setFontSize(j === 0 ? 10 : 9);
    return (doc.splitTextToSize(pdfSafe(line), colW - 10) as string[]).map((part) => ({ part, first: j === 0 }));
  });
  const boxH = 10 + wrapped.length * 4.6;
  (['BILL TO', 'SHIP TO'] as const).forEach((label, i) => {
    const x = M + i * (colW + 6);
    doc.setDrawColor(230, 221, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, colW, boxH, 3, 3, 'S');
    text(label, x + 5, y + 6, { size: 8, bold: true, color: GOLD });
    wrapped.forEach(({ part, first }, j) => text(part, x + 5, y + 11.5 + j * 4.6, { size: first ? 10 : 9, bold: first, color: first ? INK : MUTED }));
  });
  y += boxH + 9;

  // ---- Items table
  const cols = { item: M + 3, qty: 128, mrp: 146, price: 168, amount: W - M - 3 };
  const header = () => {
    doc.setFillColor(...PLUM);
    doc.roundedRect(M, y, W - 2 * M, 9, 2, 2, 'F');
    const hy = y + 6;
    text('ITEM', cols.item, hy, { size: 8, bold: true, color: [255, 255, 255] });
    text('QTY', cols.qty, hy, { size: 8, bold: true, color: [255, 255, 255], align: 'right' });
    text('MRP', cols.mrp, hy, { size: 8, bold: true, color: [255, 255, 255], align: 'right' });
    text('PRICE', cols.price, hy, { size: 8, bold: true, color: [255, 255, 255], align: 'right' });
    text('AMOUNT', cols.amount, hy, { size: 8, bold: true, color: [255, 255, 255], align: 'right' });
    y += 13;
  };
  header();
  order.items.forEach((item, index) => {
    const unit = Number(item.product?.price) || 0;
    const mrp = Math.max(unit, Number(item.product?.originalPrice) || unit);
    const qty = Number(item.quantity) || 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(pdfSafe(item.product?.name || 'Item'), cols.qty - cols.item - 14);
    const colour = item.selectedColor?.name && !['Default', 'Standard'].includes(item.selectedColor.name) ? item.selectedColor.name : '';
    const variant = [item.selectedSize && !/free/i.test(item.selectedSize) ? `Size ${item.selectedSize}` : 'One size', colour, item.lookParentName ? `Complete the look · ${item.lookParentName}` : ''].filter(Boolean).join('  ·  ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const variantLines = doc.splitTextToSize(pdfSafe(variant), cols.qty - cols.item - 14).length;
    const rowH = nameLines.length * 4.4 + variantLines * 3.6 + 4;
    if (y + rowH > 262) { doc.addPage(); y = 20; header(); }
    if (index % 2 === 1) { doc.setFillColor(...IVORY); doc.rect(M, y - 4.5, W - 2 * M, rowH, 'F'); }
    nameLines.forEach((line: string, i: number) => text(line, cols.item, y + i * 4.4, { size: 9.5, bold: true }));
    text(variant, cols.item, y + nameLines.length * 4.4, { size: 8, color: MUTED, maxWidth: cols.qty - cols.item - 14 });
    text(String(qty), cols.qty, y, { size: 9.5, align: 'right' });
    text(mrp > unit ? rs(mrp) : '—', cols.mrp, y, { size: 9, color: MUTED, align: 'right' });
    text(rs(unit), cols.price, y, { size: 9.5, align: 'right' });
    text(rs(unit * qty), cols.amount, y, { size: 9.5, bold: true, align: 'right' });
    y += rowH;
  });

  // ---- Totals
  if (y > 222) { doc.addPage(); y = 24; }
  y += 3;
  const mrpSavings = order.items.reduce((sum, item) => {
    const unit = Number(item.product?.price) || 0;
    return sum + (Math.max(unit, Number(item.product?.originalPrice) || unit) - unit) * (Number(item.quantity) || 0);
  }, 0);
  const rows: Array<[string, string, 'discount'?]> = [['Subtotal', rs(order.subtotal)]];
  if ((order.comboDiscount || 0) > 0) rows.push(['Combo discount', `- ${rs(order.comboDiscount || 0)}`, 'discount']);
  if ((order.couponDiscount || 0) > 0) rows.push([`Coupon ${order.couponCode || ''}`.trim(), `- ${rs(order.couponDiscount || 0)}`, 'discount']);
  if ((order.prepaidDiscount || 0) > 0) rows.push(['Online payment discount', `- ${rs(order.prepaidDiscount || 0)}`, 'discount']);
  const named = (order.comboDiscount || 0) + (order.couponDiscount || 0) + (order.prepaidDiscount || 0);
  if (!named && (order.discountAmount || 0) > 0) rows.push(['Discount', `- ${rs(order.discountAmount)}`, 'discount']);
  rows.push(['Shipping', order.shippingCharge ? rs(order.shippingCharge) : 'Free']);
  const tx = 116;
  rows.forEach(([k, v, kind], i) => {
    text(k, tx, y + i * 6, { size: 9.5, color: kind ? EMERALD : MUTED });
    text(v, W - M, y + i * 6, { size: 9.5, color: kind ? EMERALD : INK, align: 'right' });
  });
  y += rows.length * 6 + 2;
  doc.setFillColor(...PLUM);
  doc.roundedRect(tx - 4, y - 1, W - M - tx + 4, 13, 3, 3, 'F');
  const cod = order.payMode === 'cod';
  text(cod ? `Total (${rs(order.codAdvance || 0)} paid, ${rs(order.codDue || 0)} cash on delivery)` : paid || refunded ? 'Total paid' : 'Total', tx, y + 7.4, { size: cod ? 8.5 : 11, bold: true, color: [255, 255, 255] });
  text(rs(order.finalTotal), W - M - 3, y + 7.6, { size: 13, bold: true, color: [255, 255, 255], align: 'right' });
  const totalSavings = mrpSavings + named;
  if (totalSavings > 0) text(`You saved ${rs(totalSavings)} on this order`, W - M, y + 19, { size: 9, bold: true, color: EMERALD, align: 'right' });
  text('Prices are inclusive of all taxes (GST).', M, y + 7.4, { size: 8.5, color: MUTED });

  // ---- Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(230, 221, 240);
    doc.line(M, 270, W - M, 270);
    if (note && p === pages) text(note, M, 276, { size: 8.5, color: INK, maxWidth: W - 2 * M });
    text('Thank you for shopping with Suit Aura Girls.', M, note ? 284 : 277, { size: 9, bold: true, color: PLUM });
    text(`Questions? WhatsApp ${sellerPhone}${sellerEmail ? ` or email ${sellerEmail}` : ''}  ·  www.suitauragirls.in`, M, note ? 289 : 282, { size: 8, color: MUTED });
    text('This is a computer-generated document and does not need a signature.', M, note ? 293.5 : 286.5, { size: 7.5, color: MUTED });
    if (pages > 1) text(`Page ${p} of ${pages}`, W - M, 286.5, { size: 7.5, color: MUTED, align: 'right' });
  }

  return { blob: doc.output('blob') as Blob, fileName };
};

/** Saves the invoice PDF to the device. */
export const downloadInvoicePdf = async (order: Order, settings?: Partial<StoreSettings> | null) => {
  const { blob, fileName } = await buildInvoicePdf(order, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return fileName;
};

/**
 * Shares the PDF through the phone's share sheet (WhatsApp, Gmail…). Returns false where sharing files is
 * not supported (most desktops), so the caller can download instead.
 */
export const shareInvoicePdf = async (order: Order, settings?: Partial<StoreSettings> | null) => {
  const { blob, fileName } = await buildInvoicePdf(order, settings);
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title: fileName, text: `Invoice for order #${order.orderNumber} — Suit Aura Girls` });
  } catch (error: any) {
    if (error?.name !== 'AbortError') throw error;
  }
  return true;
};
