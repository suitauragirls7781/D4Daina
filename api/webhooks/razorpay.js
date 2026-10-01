import { createHmac, timingSafeEqual } from 'node:crypto';
import { firestore } from '../_lib/firebaseAdmin.js';
import { alertStoreOfNewOrder, finalizePaidOrder } from '../_lib/orders.js';
import { sendOrderEmail } from '../_lib/email.js';
import { razorpayCreds, readGateways } from '../_lib/payu.js';

// Razorpay signs the exact raw body, so it is read from the stream instead of the parsed JSON.
export const config = { api: { bodyParser: false } };

const readRawBody = async (req) => {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

/**
 * Backup path for payments whose browser never reached /api/orders verify (closed tab, lost network).
 * Configure in Razorpay Dashboard → Webhooks: URL https://www.suitauragirls.in/api/webhooks/razorpay,
 * events payment.captured and order.paid, secret = RAZORPAY_WEBHOOK_SECRET.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const raw = await readRawBody(req);
  let secrets = process.env.RAZORPAY_WEBHOOK_SECRET ? [process.env.RAZORPAY_WEBHOOK_SECRET] : [];
  try {
    secrets = razorpayCreds(await readGateways(firestore())).webhookSecrets;
  } catch (error) {
    console.error('Webhook could not read gateway settings:', error?.message);
  }
  if (!secrets.length) return send(res, 503, { error: 'Webhook not configured.' });

  const signature = Buffer.from(String(req.headers['x-razorpay-signature'] || ''));
  const valid = secrets.some((secret) => {
    const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  });
  if (!valid) return send(res, 401, { error: 'Invalid signature.' });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return send(res, 400, { error: 'Invalid JSON.' });
  }
  if (!['payment.captured', 'order.paid'].includes(event.event)) return send(res, 200, { ignored: true });

  const payment = event.payload?.payment?.entity || {};
  const razorpayOrderId = payment.order_id || event.payload?.order?.entity?.id;
  if (!razorpayOrderId) return send(res, 200, { ignored: true });

  try {
    const db = firestore();
    let orderNumber = event.payload?.order?.entity?.receipt || payment.notes?.order_number || '';
    if (!orderNumber) {
      const match = await db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1).get();
      orderNumber = match.empty ? '' : match.docs[0].id;
    }
    if (!orderNumber) return send(res, 200, { ignored: true, reason: 'order not found' });

    const { order, changed } = await finalizePaidOrder(db, orderNumber, { paymentId: payment.id, razorpayOrderId, source: 'webhook' });
    if (changed) {
      await sendOrderEmail('confirmed', order)
        .then(() => db.collection('orders').doc(orderNumber).update({ emailLog: [...(order.emailLog || []), { kind: 'confirmed', at: new Date().toISOString(), ok: true }] }))
        .catch((error) => console.error('Webhook confirmation email failed:', error?.message));
      await alertStoreOfNewOrder(db, order);
    }
    return send(res, 200, { ok: true, changed });
  } catch (error) {
    console.error('Razorpay webhook error:', error?.message);
    // Non-2xx makes Razorpay retry later.
    return send(res, 500, { error: 'Processing failed.' });
  }
}
