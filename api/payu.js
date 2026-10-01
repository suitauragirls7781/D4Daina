import { firestore } from './_lib/firebaseAdmin.js';
import { alertStoreOfNewOrder, finalizePaidOrder, timelineEntry } from './_lib/orders.js';
import { sendOrderEmail } from './_lib/email.js';
import { payuResponseHash, payuVerifyTransaction, readGateways, resultToken, sameHex } from './_lib/payu.js';

/**
 * PayU sends the customer's browser here (surl / furl) with the transaction fields, and can also call it
 * server-to-server as a webhook (?webhook=1, set in PayU Dashboard → Webhooks for "Successful" and "Failed").
 * Nothing is trusted from the POST alone: the response hash is checked with the salt, and PayU's verify API
 * must confirm success and the full amount before the order is marked paid. Repeats are harmless because
 * finalizePaidOrder does nothing for an order that is already paid.
 */
const fieldsFrom = (req) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  try {
    return raw.trim().startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return {};
  }
};

const str = (value, max = 200) => String(value ?? '').slice(0, max);

const redirect = (res, url) => {
  res.status(303).setHeader('Location', url).setHeader('Cache-Control', 'no-store');
  res.end();
};

const json = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  const webhook = String(req.query?.webhook || '') === '1';
  // A shopper who opens the link directly just goes back to the bag
  if (req.method !== 'POST') return webhook ? json(res, 405, { error: 'Method not allowed.' }) : redirect(res, '/checkout');

  const f = Object.fromEntries(Object.entries(fieldsFrom(req)).map(([key, value]) => [key, str(value, 500)]));
  const txnid = str(f.txnid, 40);
  const orderNumber = str(f.udf1, 40).toUpperCase();
  // A signed result link is issued only after PayU's hash has been verified; before that the shopper just goes back to checkout
  let verifiedPost = false;
  const back = (state, extra = '') => (verifiedPost
    ? `/checkout?payment=${state}&order=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(resultToken(orderNumber))}${extra}`
    : `/checkout?payment=${state === 'done' ? 'pending' : state}`);

  try {
    if (!txnid || !orderNumber) return webhook ? json(res, 400, { error: 'Missing transaction.' }) : redirect(res, '/checkout?payment=failed');
    const db = firestore();
    const gateways = await readGateways(db, { fresh: true });
    const { merchantKey, salt } = gateways.payu;
    if (!merchantKey || !salt) throw new Error('PAYU_NOT_CONFIGURED');
    // Tampered or foreign posts are ignored (nothing is changed)
    if (f.key !== merchantKey || !sameHex(payuResponseHash(f, salt), f.hash)) {
      console.error(`PayU callback with a bad hash for ${orderNumber} / ${txnid}`);
      return webhook ? json(res, 401, { error: 'Invalid hash.' }) : redirect(res, back('failed'));
    }
    verifiedPost = true;

    const ref = db.collection('orders').doc(orderNumber);
    const snap = await ref.get();
    const order = snap.exists ? snap.data() : null;
    if (!order || !(order.payuTxnIds || []).includes(txnid)) {
      return webhook ? json(res, 200, { ignored: true }) : redirect(res, back('failed', '&reason=order'));
    }
    if (order.paymentStatus === 'Paid') return webhook ? json(res, 200, { ok: true, changed: false }) : redirect(res, back('done'));

    // PayU's own record decides (status and amount), not the browser's post
    const verified = await payuVerifyTransaction(gateways, txnid);
    if (verified.status === 'success' && Math.abs(verified.amount - Number(order.finalTotal)) <= 0.5) {
      const { order: paid, changed } = await finalizePaidOrder(db, orderNumber, { paymentId: verified.mihpayid || str(f.mihpayid, 60) || txnid, source: webhook ? 'payu-webhook' : 'payu' });
      if (changed && gateways.payu.mode !== 'live') {
        // Sandbox payment: flagged for the admin, no customer email (no real money moved)
        await ref.update({ testPayment: true, notes: [paid.notes, 'PayU TEST mode payment - no real money. Cancel this order after testing.'].filter(Boolean).join(' | ') }).catch(() => {});
      } else if (changed) {
        await sendOrderEmail('confirmed', paid)
          .then(() => ref.update({ emailLog: [...(paid.emailLog || []), { kind: 'confirmed', at: new Date().toISOString(), ok: true }] }))
          .catch((error) => console.error(`PayU confirmation email failed for ${orderNumber}:`, error?.message));
        await alertStoreOfNewOrder(db, paid);
      }
      return webhook ? json(res, 200, { ok: true, changed }) : redirect(res, back('done'));
    }

    if (verified.status === 'success') console.error(`PayU amount mismatch on ${orderNumber}: paid ${verified.amount}, order ${order.finalTotal}`);
    const pending = verified.status === 'pending';
    const reason = str(verified.error || f.error_Message || f.field9, 140);
    if (!pending) {
      await ref.update({
        timeline: [...(order.timeline || []), timelineEntry('Payment failed', reason ? `PayU: ${reason}` : 'PayU payment was not completed')],
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    return webhook ? json(res, 200, { ok: true, status: verified.status }) : redirect(res, back(pending ? 'pending' : 'failed', reason ? `&reason=${encodeURIComponent(reason)}` : ''));
  } catch (error) {
    console.error('PayU callback error:', error?.message);
    // The result page asks the server again, so a temporary error here never loses a payment
    return webhook ? json(res, 500, { error: 'Processing failed.' }) : redirect(res, back('pending'));
  }
}
