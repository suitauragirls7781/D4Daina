import { mediaVariant } from './media.js';
// Transactional email through Brevo. Every template is plain, flat HTML in the brand palette.
const SITE_URL = 'https://www.suitauragirls.in';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

export const sendEmail = async ({ to, name, subject, html, text }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact.suitauragirls@gmail.com';
  if (!apiKey) throw new Error('EMAIL_NOT_CONFIGURED');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Suit Aura Girls', email: senderEmail },
      to: [{ email: to, name: name || 'Customer' }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    console.error('Email provider rejected request:', response.status, result.code || result.message || 'unknown');
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
};

export const layout = (heading, body) => `<!doctype html><html><body style="margin:0;background:#FFFFFF;font-family:Arial,Helvetica,sans-serif;color:#161514">
<main style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#161514;padding:20px 24px;text-align:center;border-radius:16px 16px 0 0">
<p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:2px;color:#FFFFFF">SUIT AURA GIRLS</p>
<p style="margin:6px 0 0;font-size:11px;letter-spacing:3px;color:#A6824A">ETHNIC WEAR FOR EVERY YOU</p>
</div>
<div style="background:#FFFFFF;border:1px solid rgba(75,29,63,0.14);border-top:0;border-radius:0 0 16px 16px;padding:28px 24px">
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#161514">${heading}</h1>
${body}
</div>
<p style="text-align:center;font-size:11px;color:#6B6762;margin:16px 0 0">Suit Aura Girls · Asansol, West Bengal · <a href="${SITE_URL}" style="color:#6B6762">suitauragirls.in</a></p>
</main></body></html>`;

// Cash on delivery: only the advance was paid online; the rest is collected in cash at the door
const isCod = (order) => order?.payMode === 'cod';
const paidOnline = (order) => (isCod(order) ? Number(order.codAdvance) || 0 : Number(order?.finalTotal) || 0);

const itemsTable = (order) => {
  const rows = (order.items || []).map((item) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid rgba(75,29,63,0.12);font-size:14px">${escapeHtml(item.product?.name)}<br><span style="font-size:12px;color:#6B6762">Size ${escapeHtml(item.selectedSize)} · Qty ${Number(item.quantity) || 1}</span></td>
<td style="padding:10px 0;border-bottom:1px solid rgba(75,29,63,0.12);font-size:14px;text-align:right;white-space:nowrap">${inr((item.product?.price || 0) * (item.quantity || 1))}</td>
</tr>`).join('');
  const line = (label, value, bold = false) => `<tr><td style="padding:6px 0;font-size:13px;${bold ? 'font-weight:bold;font-size:15px' : 'color:#3A3A3A'}">${label}</td><td style="padding:6px 0;text-align:right;font-size:13px;${bold ? 'font-weight:bold;font-size:15px' : ''}">${value}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${rows}
${line('Subtotal', inr(order.subtotal))}
${order.comboDiscount ? line('Combo discount', `−${inr(order.comboDiscount)}`) : ''}
${order.couponDiscount ? line(`Coupon ${escapeHtml(order.couponCode)}`, `−${inr(order.couponDiscount)}`) : ''}
${order.prepaidDiscount ? line('Prepaid discount', `−${inr(order.prepaidDiscount)}`) : ''}
${line(isCod(order) ? 'Shipping (cash on delivery)' : 'Shipping', order.shippingCharge ? inr(order.shippingCharge) : 'Free')}
${isCod(order) ? `${line('Order total', inr(order.finalTotal), true)}
${line('Paid online', inr(paidOnline(order)))}
${line('Pay in cash on delivery', inr(order.codDue), true)}` : line('Total paid', inr(order.finalTotal), true)}
</table>`;
};

const addressBlock = (order) => {
  const a = order.deliveryAddress || {};
  const parts = [a.fullName, a.houseFlat, a.street, a.area, `${a.city || ''}${a.state ? `, ${a.state}` : ''} ${a.pincode || ''}`, a.mobile]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map(escapeHtml);
  return `<p style="font-size:13px;line-height:1.6;color:#3A3A3A;margin:0 0 16px"><strong style="color:#161514">Delivering to</strong><br>${parts.join('<br>')}</p>`;
};

export const button = (href, label) => `<p style="margin:20px 0 4px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#161514;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:1px">${escapeHtml(label)}</a></p>`;

const trackButton = (order) => button(`${SITE_URL}/track-order?order=${encodeURIComponent(order.orderNumber)}`, 'TRACK YOUR ORDER');

/** "5 Oct 2026" for an admin-entered YYYY-MM-DD date ('' when empty or invalid). */
const expectedDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
};

/** "Thu, 8 Oct" for the order's estimated delivery (ISO, computed from the owner's delivery days), '' when none. */
const estimatedDate = (value) => {
  const date = new Date(String(value || ''));
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })
    : '';
};

/** Delivery line for the confirmation: the admin's expected date, else the estimate (labelled as an estimate). */
const deliveryLine = (order) => {
  if (expectedDate(order.expectedDeliveryDate)) return ` Expected delivery by <strong>${expectedDate(order.expectedDeliveryDate)}</strong>.`;
  const estimate = order.deliveryEstimateSource === 'settings' ? estimatedDate(order.estimatedDeliveryDate) : '';
  return estimate ? ` Estimated delivery by <strong>${escapeHtml(estimate)}</strong>.` : '';
};

const TEMPLATES = {
  confirmed: (order) => ({
    subject: isCod(order) ? `Order ${order.orderNumber} confirmed — cash on delivery` : `Order ${order.orderNumber} confirmed — payment received`,
    heading: 'Thank you, your order is confirmed',
    intro: isCod(order)
      ? `We have received your advance of <strong>${inr(paidOnline(order))}</strong> (payment ref ${escapeHtml(order.paymentRef)}). Please keep <strong>${inr(order.codDue)}</strong> ready in cash to pay when the parcel arrives. We will now prepare your order.${deliveryLine(order)}`
      : `We have received your payment of <strong>${inr(order.finalTotal)}</strong> (payment ref ${escapeHtml(order.paymentRef)}). We will now prepare your order.${deliveryLine(order)}`,
    full: true,
  }),
  'In Transit': (order) => ({
    subject: `Order ${order.orderNumber} is in transit`,
    heading: 'Your order is in transit',
    intro: `Your parcel is moving through our courier partner's network${order.courierPartner ? ` (<strong>${escapeHtml(order.courierPartner)}</strong>)` : ''}.${order.trackingNumber ? ` Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>.` : ''}${expectedDate(order.expectedDeliveryDate) ? ` Expected delivery by <strong>${expectedDate(order.expectedDeliveryDate)}</strong>.` : ''}`,
  }),
  Packed: (order) => ({
    subject: `Order ${order.orderNumber} is packed`,
    heading: 'Your order is packed',
    intro: 'Your pieces have been checked and packed, and will be handed to our courier partner shortly.',
  }),
  Shipped: (order) => ({
    subject: `Order ${order.orderNumber} has shipped`,
    heading: 'Your order is on its way',
    intro: `Your order has been shipped${order.courierPartner ? ` with <strong>${escapeHtml(order.courierPartner)}</strong>` : ''}.${order.trackingNumber ? ` Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>.` : ''}${expectedDate(order.expectedDeliveryDate) ? ` Expected delivery by <strong>${expectedDate(order.expectedDeliveryDate)}</strong>.` : ''}${/^https:\/\//.test(order.trackingUrl || '') ? ` <a href="${escapeHtml(order.trackingUrl)}" style="color:#161514">Track it on the courier's website</a>.` : ''}`,
  }),
  'Out for Delivery': (order) => ({
    subject: `Order ${order.orderNumber} is out for delivery`,
    heading: 'Your order is out for delivery',
    intro: `Your order will reach you today.${order.deliveryAgentName ? ` Delivery executive: <strong>${escapeHtml(order.deliveryAgentName)}</strong>${order.deliveryAgentPhone ? ` (${escapeHtml(order.deliveryAgentPhone)})` : ''}.` : ''}`,
  }),
  Delivered: (order) => ({
    subject: `Order ${order.orderNumber} delivered`,
    heading: 'Your order has been delivered',
    intro: 'We hope you love your new outfit. If anything is not right, you can raise a return request from your account.',
  }),
  Cancelled: (order) => ({
    subject: `Order ${order.orderNumber} cancelled`,
    heading: 'Your order has been cancelled',
    intro: order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded'
      ? `Your order has been cancelled. Any amount paid (${inr(paidOnline(order))}) will be refunded to your original payment method.`
      : 'Your order has been cancelled.',
  }),
  Refunded: (order) => ({
    subject: `Refund processed for order ${order.orderNumber}`,
    heading: 'Your refund has been processed',
    intro: isCod(order)
      ? 'Your refund for this order has been processed. Banks usually take 5–7 working days to show it.'
      : `A refund of <strong>${inr(order.finalTotal)}</strong> has been issued to your original payment method. Banks usually take 5–7 working days to show it.`,
  }),
};

export const hasOrderTemplate = (kind) => Boolean(TEMPLATES[kind]);

export const sendOrderEmail = async (kind, order) => {
  const template = TEMPLATES[kind];
  if (!template || !order.customerEmail) return false;
  const t = template(order);
  const note = order.customerNote ? `<p style="font-size:13px;color:#3A3A3A;margin:0 0 12px"><strong style="color:#161514">Note from our team:</strong> ${escapeHtml(order.customerNote)}</p>` : '';
  const body = `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">Dear ${escapeHtml(order.customerName || 'Customer')},</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 16px">${t.intro}</p>
${note}
<p style="font-size:12px;letter-spacing:1px;color:#6B6762;margin:0">ORDER ${escapeHtml(order.orderNumber)}</p>
${t.full ? itemsTable(order) + addressBlock(order) : ''}
${trackButton(order)}`;
  await sendEmail({
    to: order.customerEmail,
    name: order.customerName,
    subject: t.subject,
    html: layout(t.heading, body),
    text: `${t.heading}. Order ${order.orderNumber}. Track it at ${SITE_URL}/track-order?order=${order.orderNumber}`,
  });
  return true;
};

const PAYMENT_LABELS = { razorpay: 'Online · Razorpay', payu: 'Online · PayU' };

/**
 * Alert to the store that a new order has just been paid: order number, items, amount, payment method,
 * customer name and city, and a link to the order in the admin panel.
 */
export const sendNewOrderAlert = async (order, to) => {
  if (!to) throw new Error('NO_STORE_EMAIL');
  const adminUrl = `${SITE_URL}/drdaina/orders/${encodeURIComponent(order.orderNumber)}`;
  const city = [order.deliveryAddress?.city, order.deliveryAddress?.state].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  const method = PAYMENT_LABELS[order.paymentMethod] || 'Online';
  const count = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const itemsText = (order.items || []).map((item) => `${item.product?.name || 'Item'} (Size ${item.selectedSize || '-'} × ${Number(item.quantity) || 1})`).join(', ');
  await sendEmail({
    to,
    name: 'Suit Aura Girls',
    subject: isCod(order) ? `New COD order ${order.orderNumber} · ${inr(paidOnline(order))} paid, collect ${inr(order.codDue)}` : `New order ${order.orderNumber} · ${inr(order.finalTotal)} paid`,
    html: layout('You have a new order', [
      p(`Order <strong>${escapeHtml(order.orderNumber)}</strong> · <strong>${inr(paidOnline(order))}</strong> paid${isCod(order) ? ` · <strong>collect ${inr(order.codDue)} in cash on delivery</strong>` : ''} · ${escapeHtml(method)}${order.paymentRef ? ` (${escapeHtml(order.paymentRef)})` : ''}`),
      p(`Customer: ${escapeHtml(order.customerName || '')}${city ? ` · ${escapeHtml(city)}` : ''}`),
      itemsTable(order),
      button(adminUrl, 'OPEN ORDER'),
    ].join('\n')),
    text: `New ${isCod(order) ? 'COD ' : ''}order ${order.orderNumber}: ${inr(paidOnline(order))} paid${isCod(order) ? `, collect ${inr(order.codDue)} in cash` : ''} (${method}) by ${order.customerName || 'customer'}${city ? `, ${city}` : ''}. ${count} piece${count === 1 ? '' : 's'}: ${itemsText}. Open it at ${adminUrl}`,
  });
};

export const sendOtpEmail = async ({ email, name, code, purpose }) => {
  const labels = { signup: 'Create your account', login: 'Sign in to your account' };
  await sendEmail({
    to: email,
    name,
    subject: `${code} is your Suit Aura Girls verification code`,
    html: layout(escapeHtml(labels[purpose] || 'Verify your email'), `<p style="font-size:14px;margin:0 0 8px">Your one-time code is:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px;color:#161514">${code}</p>
<p style="font-size:13px;line-height:1.6;color:#3A3A3A;margin:0">This code expires in 10 minutes and can be used only once. If you did not request it, you can ignore this email.</p>`),
    text: `Your Suit Aura Girls code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  });
};

// ---- Returns and exchanges ----

const p = (html) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${html}</p>`;

/** Small JPEG of a stored photo (JPEG opens in every mail app; other URLs are used as they are). */
const photoThumb = (url) => mediaVariant(url, 'j480.jpg');

const returnItemsTable = (request) => {
  const rows = (request.items || []).map((item) => {
    const size = item.size ? `Size ${escapeHtml(item.size)}` : 'One size';
    const change = item.exchangeSize ? ` → <strong>${escapeHtml(item.exchangeSize)}</strong>` : '';
    return `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(75,29,63,0.12);font-size:14px">${escapeHtml(item.name || 'Item')}<br><span style="font-size:12px;color:#6B6762">${size}${change} · Qty ${Number(item.qty) || 1}${item.clearance ? ' · clearance' : ''}</span></td></tr>`;
  }).join('');
  return rows ? `<table style="width:100%;border-collapse:collapse;margin:4px 0 16px">${rows}</table>` : '';
};

const kindOf = (request) => (request?.type === 'exchange' ? 'exchange' : 'return');

/** Alert to the store that a customer asked for a return / exchange (with the photos they sent). */
export const sendReturnRequestAlert = async ({ to, order, adminUrl }) => {
  const request = order.returnRequest || {};
  const kind = kindOf(request);
  const photos = (request.photos || []).map((url) => `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 8px 8px 0"><img src="${escapeHtml(photoThumb(url, 240))}" alt="Customer photo" width="120" style="border-radius:8px;border:1px solid rgba(75,29,63,0.15)"></a>`).join('');
  await sendEmail({
    to,
    name: 'Suit Aura Girls',
    subject: `${kind === 'exchange' ? 'Exchange' : 'Return'} requested: order ${order.orderNumber}`,
    html: layout(`A customer asked for ${kind === 'exchange' ? 'an exchange' : 'a return'}`, [
      p(`Order <strong>${escapeHtml(order.orderNumber)}</strong> · ${inr(order.finalTotal)} paid · customer ${escapeHtml(order.customerName || '')} (${escapeHtml(order.customerEmail || '')})`),
      returnItemsTable(request),
      p(`<strong>Reason:</strong> ${escapeHtml(request.reason || '')}${request.details ? `<br><strong>Details:</strong> ${escapeHtml(request.details)}` : ''}`),
      photos ? `<div style="margin:0 0 12px">${photos}</div>` : p('No photos were added.'),
      p(`Approve or reject it in the admin panel. The customer is emailed your decision and your note, so write the next steps (for example how to send the piece back) in the note.${kind === 'return' ? ' Refunds are made by you in Razorpay; then mark the request refunded.' : ''}`),
      button(adminUrl, 'OPEN ORDER'),
    ].join('\n')),
    text: `${kind === 'exchange' ? 'Exchange' : 'Return'} requested for order ${order.orderNumber} by ${order.customerEmail}. Reason: ${request.reason || ''}. ${request.details || ''} Review it at ${adminUrl}`,
  });
};

const RETURN_UPDATES = {
  approved: (kind) => ({
    subject: `Your ${kind} request is approved`,
    heading: `Your ${kind} request is approved`,
    intro: `We have approved your ${kind} request. Please keep the pieces unused and unwashed, with their original tags.`,
    noteLabel: 'Next steps from our team',
    noNote: 'Our team will contact you with the next steps.',
  }),
  rejected: (kind) => ({
    subject: `Update on your ${kind} request`,
    heading: `We could not approve your ${kind} request`,
    intro: `We have reviewed your ${kind} request and could not approve it.`,
    noteLabel: 'Reason',
    noNote: '',
  }),
  received: (kind) => ({
    subject: `We have received your ${kind}`,
    heading: 'Your returned pieces have reached us',
    intro: kind === 'exchange' ? 'We have received the pieces you sent back. We will email you when your replacement is on its way.' : 'We have received the pieces you sent back. We will email you when the refund is issued.',
    noteLabel: 'Note from our team',
    noNote: '',
  }),
  refunded: () => ({
    subject: 'Your refund has been issued',
    heading: 'Your refund has been issued',
    intro: 'We have issued the refund for your returned pieces to your original payment method. Banks usually take 5–7 working days to show it.',
    noteLabel: 'Note from our team',
    noNote: '',
  }),
  exchanged: () => ({
    subject: 'Your exchange is complete',
    heading: 'Your exchange is complete',
    intro: 'Your exchange has been completed by our team.',
    noteLabel: 'Note from our team',
    noNote: '',
  }),
};

/** Tells the customer what the store decided on their return / exchange request (with the team's note). */
export const sendReturnUpdateEmail = async (order) => {
  const request = order.returnRequest || {};
  const build = RETURN_UPDATES[request.status];
  if (!build || !order.customerEmail) return false;
  const kind = kindOf(request);
  const t = build(kind);
  const note = String(request.adminNote || '').trim();
  const ordersUrl = `${SITE_URL}/my-orders`;
  await sendEmail({
    to: order.customerEmail,
    name: order.customerName,
    subject: `${t.subject} · order ${order.orderNumber}`,
    html: layout(escapeHtml(t.heading), [
      p(`Dear ${escapeHtml(order.customerName || 'Customer')},`),
      p(`${t.intro}`),
      note ? p(`<strong style="color:#161514">${t.noteLabel}:</strong> ${escapeHtml(note)}`) : (t.noNote ? p(t.noNote) : ''),
      `<p style="font-size:12px;letter-spacing:1px;color:#6B6762;margin:0">ORDER ${escapeHtml(order.orderNumber)} · ${kind.toUpperCase()}</p>`,
      returnItemsTable(request),
      p(`Questions? <a href="${SITE_URL}/contact" style="color:#161514">Contact us</a> with your order number.`),
      button(ordersUrl, 'VIEW YOUR ORDER'),
    ].join('\n')),
    text: `${t.heading}. Order ${order.orderNumber}. ${t.intro}${note ? ` ${t.noteLabel}: ${note}` : ''} See it at ${ordersUrl}`,
  });
  return true;
};
