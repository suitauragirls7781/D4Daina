// Checkout steps shared by the order scenarios: what the storefront sends to /api/orders and what Razorpay
// and PayU send back, built the way those parties build them.
import { createHash, createHmac, randomBytes } from 'node:crypto';

/** A delivery address that passes validation, for a made-up customer. */
export const addressFor = (email, overrides = {}) => ({
  fullName: 'Harness Customer',
  mobile: '9876543210',
  email,
  houseFlat: '12 Test Lane',
  street: 'Harness Road',
  area: 'Test Nagar',
  city: 'Asansol',
  state: 'West Bengal',
  pincode: '713301',
  ...overrides,
});

export const newAttemptKey = () => randomBytes(16).toString('hex');

/** The signature Razorpay Checkout hands the browser after a payment: HMAC(key secret, "<order id>|<payment id>"). */
export const razorpaySignature = (secret, razorpayOrderId, paymentId) => createHmac('sha256', secret).update(`${razorpayOrderId}|${paymentId}`).digest('hex');

/** The signature Razorpay puts on a webhook: HMAC(webhook secret, the exact body bytes). */
export const webhookSignature = (secret, rawBody) => createHmac('sha256', secret).update(rawBody).digest('hex');

const sha512 = (text) => createHash('sha512').update(text, 'utf8').digest('hex');

/** PayU's request hash, from its documentation: key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT */
export const payuRequestHash = (f, salt) => sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1 || '', f.udf2 || '', f.udf3 || '', f.udf4 || '', f.udf5 || '', '', '', '', '', '', salt].join('|'));

/** PayU's response hash, from its documentation: SALT|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key */
export const payuResponseHash = (f, salt) => sha512([salt, f.status, '', '', '', '', '', f.udf5 || '', f.udf4 || '', f.udf3 || '', f.udf2 || '', f.udf1 || '', f.email, f.firstname, f.productinfo, f.amount, f.txnid, f.key].join('|'));

/** The first exported product that can be put in a bag on its own: an outfit with sizes and a price. */
export const pickOutfit = (products, skip = 0) => products.filter((row) => row.data.productType !== 'accessory' && !row.data.hidden
  && Array.isArray(row.data.sizes) && row.data.sizes.length > 0 && Number(row.data.price) > 0)[skip];

/** One bag line as the storefront sends it. */
export const lineOf = (product, quantity = 1) => ({ productId: product.id, size: product.data.sizes[0], quantity });

/**
 * Starts a Razorpay checkout. Returns the response; `response.body.orderNumber` and `.razorpayOrderId` identify the order.
 */
export const createOrder = (h, { email, items, couponCode, token, ip, attemptKey = newAttemptKey(), gateway, address = {} }) => h.post('/api/orders', {
  action: 'create', items, couponCode, attemptKey, gateway, address: addressFor(email, address),
}, { token, ip: ip || h.nextIp() });

/** The browser's call after Razorpay Checkout succeeded. */
export const verifyPayment = (h, { orderNumber, razorpayOrderId, paymentId, signature }) => h.post('/api/orders', {
  action: 'verify',
  orderNumber,
  razorpay_order_id: razorpayOrderId,
  razorpay_payment_id: paymentId,
  razorpay_signature: signature ?? razorpaySignature(h.env.RAZORPAY_KEY_SECRET, razorpayOrderId, paymentId),
});

/** A paid order, made the way a shopper makes one: create, then verify. Returns the stored order's number. */
export const placePaidOrder = async (h, options) => {
  const created = await createOrder(h, options);
  if (created.status !== 200) throw new Error(`Order creation failed in test setup: ${created.status} ${created.text}`);
  const { orderNumber, razorpayOrderId } = created.body;
  const verified = await verifyPayment(h, { orderNumber, razorpayOrderId, paymentId: `pay_${orderNumber.replace(/-/g, '')}` });
  if (verified.status !== 200) throw new Error(`Payment verification failed in test setup: ${verified.status} ${verified.text}`);
  return orderNumber;
};

/** A Razorpay webhook delivery (server to server: no Origin, no browser user agent). */
export const sendRazorpayWebhook = (h, event, { secret = h.env.RAZORPAY_WEBHOOK_SECRET, signature, raw = JSON.stringify(event) } = {}) => h.call('/api/webhooks/razorpay', {
  method: 'POST',
  raw,
  contentType: 'application/json',
  origin: null,
  ua: 'Razorpay-Webhook/v1',
  headers: { 'x-razorpay-signature': signature ?? webhookSignature(secret, raw) },
});
