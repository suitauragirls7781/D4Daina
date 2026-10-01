import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { firestore } from './_lib/firebaseAdmin.js';
import { cleanText, clientIp, getIdentity, isSameOrigin, isValidEmail, parseBody, reply } from './_lib/http.js';
import {
  ORDER_STATUSES,
  RETURN_PHOTO_FOLDER,
  UserError,
  alertStoreOfNewOrder,
  applyReturnAction,
  cancelRequestOutcome,
  cleanExpectedDate,
  cleanTrackingUrl,
  closeReturnOnRefund,
  estimateDelivery,
  finalizePaidOrder,
  newOrderNumber,
  normalizeReturnRequest,
  ownerOrderView,
  priceCart,
  publicOrderView,
  recordCancelRequestAlert,
  recordReturnRequestAlert,
  requestCancellation,
  restoreOrderStock,
  returnBlockReason,
  returnPhotoKey,
  returnableQty,
  storeAlertAddress,
  timelineEntry,
  validateCoupon,
  validateReturnInput,
} from './_lib/orders.js';
import { escapeHtml, hasOrderTemplate, layout, sendEmail, sendOrderEmail, sendReturnRequestAlert, sendReturnUpdateEmail } from './_lib/email.js';
import { checkResultToken, payuAmount, payuReady, payuRequestHash, payuUrls, payuVerifyTransaction, publicGateways, razorpayCreds, readGateways, resultToken } from './_lib/payu.js';

const SITE_URL = 'https://www.suitauragirls.in';


const safeEqualHex = (a, b) => {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
};

const createRazorpayOrder = async (gateways, { amountPaise, receipt, notes }) => {
  const { keyId, secret } = razorpayCreds(gateways);
  if (!keyId || !secret) throw new Error('PAYMENT_NOT_CONFIGURED');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) {
    console.error('Razorpay order creation failed:', response.status, result?.error?.code || '', result?.error?.description || '');
    throw new Error('PAYMENT_GATEWAY_ERROR');
  }
  return result;
};

// Fields for the browser to POST to PayU (the hash is made here; the salt never leaves the server)
const payuSession = (gateways, order, txnid) => {
  const { merchantKey: key, salt, mode } = gateways.payu;
  const fields = {
    key,
    txnid,
    amount: payuAmount(order.finalTotal),
    productinfo: `Order ${order.orderNumber}`,
    firstname: String(order.customerName || 'Customer').replace(/[^A-Za-z0-9 .]/g, ' ').trim().slice(0, 60) || 'Customer',
    email: order.customerEmail,
    phone: String(order.customerMobile || '').slice(-10),
    udf1: order.orderNumber,
    surl: `${SITE_URL}/api/payu`,
    furl: `${SITE_URL}/api/payu`,
  };
  fields.hash = payuRequestHash(fields, salt);
  return { payuAction: payuUrls(mode).pay, payuFields: fields };
};

// Which gateway pays this checkout: the customer's choice if it is on, else whichever is on.
const pickGateway = (available, wanted) => {
  if (wanted === 'payu' && available.payu) return 'payu';
  if (wanted === 'razorpay' && available.razorpay) return 'razorpay';
  if (available.razorpay) return 'razorpay';
  if (available.payu) return 'payu';
  throw new UserError('Online payment is paused for a few minutes. Please try again shortly.', 503);
};

const paymentSessionBody = async (gateways, order, gateway, extra = {}) => {
  if (gateway === 'payu') {
    return { gateway, orderNumber: order.orderNumber, order: publicOrderView(order), ...payuSession(gateways, order, extra.txnid || order.payuTxnId) };
  }
  return {
    gateway,
    orderNumber: order.orderNumber,
    razorpayOrderId: extra.razorpayOrderId || order.razorpayOrderId,
    amount: Math.round(order.finalTotal * 100),
    currency: 'INR',
    keyId: razorpayCreds(gateways).keyId,
    order: publicOrderView(order),
  };
};

/** Asks Razorpay whether any attempt on this order was captured (for payments whose browser never came back). */
const reconcileRazorpay = async (db, order, gateways) => {
  const { keyId, secret } = razorpayCreds(gateways);
  const ids = [...new Set([order.razorpayOrderId, ...(Array.isArray(order.razorpayOrderIds) ? order.razorpayOrderIds : [])].filter(Boolean))].slice(-5);
  if (!keyId || !secret || !ids.length) return null;
  for (const id of ids) {
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(id)}/payments`, {
      headers: { authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` },
    });
    const data = await response.json().catch(() => ({}));
    const captured = (data.items || []).find((payment) => payment.status === 'captured');
    if (captured) return finalizePaidOrder(db, order.orderNumber, { paymentId: captured.id, razorpayOrderId: id, source: 'reconcile' });
  }
  return null;
};

/** Asks PayU for the order's latest transaction and finalises it when PayU says it succeeded with the full amount. */
const reconcilePayu = async (db, order, gateways) => {
  if (!order.payuTxnId || !payuReady(gateways)) return null;
  const result = await payuVerifyTransaction(gateways, order.payuTxnId);
  if (result.status !== 'success') return { pending: result.status === 'pending', failed: result.status === 'failure', error: result.error };
  if (Math.abs(result.amount - Number(order.finalTotal)) > 0.5) {
    console.error(`PayU amount mismatch on ${order.orderNumber}: paid ${result.amount}, order ${order.finalTotal}`);
    return { failed: true, error: 'Amount mismatch' };
  }
  return finalizePaidOrder(db, order.orderNumber, { paymentId: result.mihpayid || order.payuTxnId, source: 'payu' });
};

const validateAddress = (raw) => {
  const address = {
    fullName: cleanText(raw?.fullName, 100),
    mobile: String(raw?.mobile || '').replace(/\D/g, '').slice(-10),
    email: cleanText(raw?.email, 160).toLowerCase(),
    houseFlat: cleanText(raw?.houseFlat, 200),
    street: cleanText(raw?.street, 200),
    area: cleanText(raw?.area, 120),
    city: cleanText(raw?.city, 80),
    state: cleanText(raw?.state, 80),
    pincode: String(raw?.pincode || '').replace(/\D/g, '').slice(0, 6),
    landmark: cleanText(raw?.landmark, 120),
    altMobile: String(raw?.altMobile || '').replace(/\D/g, '').slice(-10),
    tehsil: cleanText(raw?.tehsil, 80),
    district: cleanText(raw?.district, 80),
    type: raw?.type === 'Work' ? 'Work' : raw?.type === 'Other' ? 'Other' : 'Home',
  };
  if (address.altMobile && !/^[6-9]\d{9}$/.test(address.altMobile)) address.altMobile = '';
  if (address.fullName.length < 2) throw new UserError('Please enter your full name.');
  if (!/^[6-9]\d{9}$/.test(address.mobile)) throw new UserError('Please enter a valid 10-digit Indian mobile number.');
  if (!isValidEmail(address.email)) throw new UserError('Please enter a valid email address.');
  if (address.houseFlat.length < 3) throw new UserError('Please enter your house / flat and street address.');
  if (!address.city) throw new UserError('Please enter your city.');
  if (!address.state) throw new UserError('Please choose your state.');
  if (!/^[1-9]\d{5}$/.test(address.pincode)) throw new UserError('Please enter a valid 6-digit PIN code.');
  return address;
};

// Appends to the order's email log. The in-memory order is updated too, so two emails sent in one request both stay logged.
const logEmail = async (db, order, kind, ok) => {
  order.emailLog = [...(order.emailLog || []), { kind, at: new Date().toISOString(), ok }];
  await db.collection('orders').doc(order.orderNumber).update({ emailLog: order.emailLog }).catch((error) => {
    console.error(`Email log update failed for ${order.orderNumber}:`, error?.message);
  });
};

const notify = async (db, kind, order) => {
  if (!hasOrderTemplate(kind)) return false;
  let ok = true;
  try {
    await sendOrderEmail(kind, order);
  } catch (error) {
    ok = false;
    console.error(`Order email "${kind}" failed for ${order.orderNumber}:`, error?.message);
  }
  await logEmail(db, order, kind, ok);
  return ok;
};

const para = (html) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${html}</p>`;

// Tells the customer their cancellation request was reviewed and the order is going ahead (with the team's note, if any).
const notifyCustomerCancelKept = async (db, order) => {
  const already = { Packed: 'It has already been packed and will be shipped to you.', Shipped: 'It has already been shipped and is on its way to you.', 'In Transit': 'It has already been shipped and is on its way to you.', 'Out for Delivery': 'It is already out for delivery.', Delivered: 'It has already been delivered.' }[order.status];
  const ordersUrl = `${SITE_URL}/my-orders`;
  let ok = true;
  try {
    if (!order.customerEmail) throw new Error('NO_CUSTOMER_EMAIL');
    await sendEmail({
      to: order.customerEmail,
      name: order.customerName,
      subject: `Update on your cancellation request for order ${order.orderNumber}`,
      html: layout('Your order is going ahead', [
        para(`Dear ${escapeHtml(order.customerName || 'Customer')},`),
        para(`We have reviewed your request to cancel order <strong>${escapeHtml(order.orderNumber)}</strong>. The order has not been cancelled, so it is going ahead.${already ? ` ${already}` : ''}`),
        order.customerNote ? para(`<strong>Note from our team:</strong> ${escapeHtml(order.customerNote)}`) : '',
        para(`If you still need help, please <a href="${SITE_URL}/contact" style="color:#4B1D3F">contact us</a> with your order number.`),
        `<p style="margin:20px 0 4px"><a href="${ordersUrl}" style="display:inline-block;background:#4B1D3F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:1px">VIEW YOUR ORDER</a></p>`,
      ].join('\n')),
      text: `We have reviewed your request to cancel order ${order.orderNumber}. The order has not been cancelled, so it is going ahead.${already ? ` ${already}` : ''}${order.customerNote ? ` Note from our team: ${order.customerNote}` : ''} See it at ${ordersUrl}`,
    });
  } catch (error) {
    ok = false;
    console.error(`Cancel-kept email failed for ${order.orderNumber}:`, error?.message);
  }
  await logEmail(db, order, 'cancelKept', ok);
  return ok;
};

// Tells the store (storeAlertAddress: store email from settings, else the verified sender) that a customer asked to cancel.
// Returns false instead of failing when email is not configured, so the request itself is never lost.

const notifyStoreOfCancelRequest = async (db, order) => {
  try {
    const to = await storeAlertAddress(db);
    const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
    const adminUrl = `${SITE_URL}/admin/orders/${encodeURIComponent(order.orderNumber)}`;
    const reason = order.cancelRequest?.reason || '';
    await sendEmail({
      to,
      name: 'Suit Aura Girls',
      subject: `Cancellation requested: order ${order.orderNumber}`,
      html: layout('A customer asked to cancel an order', [
        para(`Order <strong>${escapeHtml(order.orderNumber)}</strong> · ${inr(order.finalTotal)} paid · status <strong>${escapeHtml(order.status)}</strong>`),
        para(`Customer: ${escapeHtml(order.customerName || '')} (${escapeHtml(order.customerEmail || '')})`),
        para(`<strong>Reason:</strong> ${escapeHtml(reason)}`),
        para(`If it has not been packed, set the order to Cancelled in the admin panel (its stock goes back automatically) and refund the payment${order.paymentRef ? ` (${escapeHtml(order.paymentRef)})` : ''} from your Razorpay dashboard.`),
        `<p style="margin:20px 0 4px"><a href="${adminUrl}" style="display:inline-block;background:#4B1D3F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:1px">OPEN ORDER</a></p>`,
      ].join('\n')),
      text: `Cancellation requested for order ${order.orderNumber} (${inr(order.finalTotal)} paid) by ${order.customerEmail}. Reason: ${reason}. Review it at ${adminUrl}`,
    });
    return true;
  } catch (error) {
    if (error?.message !== 'EMAIL_NOT_CONFIGURED') console.error(`Cancel-request email failed for ${order.orderNumber}:`, error?.message);
    return false;
  }
};

// Tells the store that a customer asked for a return / exchange. Returns false instead of failing, so the
// request itself is never lost; the result is recorded on the request for the admin panel.
const notifyStoreOfReturnRequest = async (db, order) => {
  try {
    await sendReturnRequestAlert({ to: await storeAlertAddress(db), order, adminUrl: `${SITE_URL}/admin/orders/${encodeURIComponent(order.orderNumber)}` });
    return true;
  } catch (error) {
    if (error?.message !== 'EMAIL_NOT_CONFIGURED') console.error(`Return-request email failed for ${order.orderNumber}:`, error?.message);
    return false;
  }
};

// Emails the customer the admin's decision on their return / exchange (logged on the order like other emails).
const notifyCustomerOfReturnUpdate = async (db, order) => {
  let ok = true;
  try {
    if (!(await sendReturnUpdateEmail(order))) ok = false;
  } catch (error) {
    ok = false;
    console.error(`Return update email failed for ${order.orderNumber}:`, error?.message);
  }
  await logEmail(db, order, `return-${order.returnRequest?.status || 'update'}`, ok);
  return ok;
};

const emailHash = (email) => createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 32);

/**
 * Upload signature for exactly one return photo: a server-chosen public id under suitauragirls/returns,
 * image formats only and no overwrite (same signing scheme as api/_lib/cloudinary.js). The full public id is
 * signed rather than a folder, so the delivery URL is the same in fixed and dynamic folder mode.
 */
const returnPhotoSignature = (key) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('CLOUDINARY_CONFIG_MISSING');
  const fields = { allowed_formats: 'jpg,png,webp,heic,heif', overwrite: 'false', public_id: `${RETURN_PHOTO_FOLDER}/${key}`, timestamp: Math.floor(Date.now() / 1000) };
  const toSign = Object.keys(fields).sort().map((name) => `${name}=${fields[name]}`).join('&');
  return { cloudName, apiKey, fields, signature: createHash('sha1').update(toSign + apiSecret).digest('hex') };
};

/** The signed-in customer's own order, or a 404 (never says whether someone else's order exists). */
const ownOrder = async (db, orderNumber, email) => {
  const snap = await db.collection('orders').doc(orderNumber).get();
  const order = snap.exists ? snap.data() : null;
  if (!order || String(order.customerEmail || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) throw new UserError('Order not found.', 404);
  return order;
};

// Very small fixed-window limiter stored in Firestore (shared across serverless instances).
const rateLimit = async (db, key, limit, windowMs) => {
  const ref = db.collection('rate_limits').doc(key.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 300));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    if (!data || now - data.windowStart > windowMs) {
      tx.set(ref, { windowStart: now, count: 1, expiresAt: new Date(now + windowMs) });
      return true;
    }
    if (data.count >= limit) return false;
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
};

const actions = {
  // Price preview for the bag and checkout (also validates coupons). Nothing is written.
  async quote(db, body) {
    const priced = await priceCart(db, body.items, body.couponCode);
    return { status: 200, body: { quote: { ...priced, lines: undefined, deliveryRules: undefined } } };
  },

  async 'check-coupon'(db, body) {
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    const { coupon, discount } = await validateCoupon(db, body.couponCode, subtotal);
    return {
      status: 200,
      body: {
        coupon: {
          id: coupon.id,
          code: String(coupon.code).toUpperCase(),
          discountType: coupon.discountType === 'fixed' ? 'fixed' : 'percentage',
          discountValue: Number(coupon.discountValue) || 0,
          maxDiscount: coupon.maxDiscount != null ? Number(coupon.maxDiscount) : undefined,
          minOrderValue: Number(coupon.minOrderValue) || 0,
          description: coupon.description || '',
        },
        discount,
      },
    };
  },

  // Which prepaid gateways the checkout can offer right now (admin switches; secrets are never sent).
  async gateways(db, body, req, identity) {
    return { status: 200, body: { gateways: publicGateways(await readGateways(db), { admin: identity.admin }) } };
  },

  async create(db, body, req, identity) {
    const address = validateAddress(body.address);
    const attemptKey = /^[A-Za-z0-9_-]{16,64}$/.test(String(body.attemptKey || '')) ? String(body.attemptKey) : '';
    // The attempt limit, the pricing, the gateway switches and an earlier attempt of this same checkout are read together
    const [allowed, priced, gateways, earlier] = await Promise.all([
      rateLimit(db, `order:${clientIp(req)}`, 20, 60 * 60 * 1000),
      priceCart(db, body.items, body.couponCode, { email: identity.email || address.email, phone: address.mobile }),
      readGateways(db),
      attemptKey ? db.collection('orders').where('attemptKey', '==', attemptKey).limit(1).get() : null,
    ]);
    if (!allowed) throw new UserError('Too many checkout attempts. Please wait a few minutes and try again.', 429);
    const gateway = pickGateway(publicGateways(gateways, { admin: identity.admin }), String(body.gateway || ''));
    const customerEmail = identity.email || address.email;
    const giftNote = cleanText(body.giftNote, 300);
    const now = new Date();

    // Same checkout tried again (closed payment window, double tap, refresh): reuse its order instead of making another
    const previous = earlier && !earlier.empty ? earlier.docs[0].data() : null;
    if (previous && previous.customerEmail === customerEmail) {
      if (previous.paymentStatus === 'Paid') {
        return { status: 200, body: { alreadyPaid: true, orderNumber: previous.orderNumber, order: ownerOrderView(previous) } };
      }
      const fresh = Date.now() - new Date(previous.createdAt).getTime() < 30 * 60 * 1000;
      const sameCart = Math.round(previous.finalTotal) === Math.round(priced.finalTotal) && previous.status === 'Pending';
      if (fresh && sameCart && previous.paymentStatus === 'Unpaid') {
        const ref = db.collection('orders').doc(previous.orderNumber);
        const update = { deliveryAddress: address, customerName: address.fullName, customerMobile: address.mobile, giftNote, updatedAt: now.toISOString() };
        const extra = {};
        if (gateway === 'payu') {
          extra.txnid = `${previous.orderNumber}-${(previous.payuTxnIds || []).length + 1}`;
          Object.assign(update, { paymentMethod: 'payu', payuTxnId: extra.txnid, payuTxnIds: [...(previous.payuTxnIds || []), extra.txnid] });
        } else if (!previous.razorpayOrderId) {
          const razorpayOrder = await createRazorpayOrder(gateways, { amountPaise: Math.round(previous.finalTotal * 100), receipt: previous.orderNumber, notes: { order_number: previous.orderNumber, customer_email: customerEmail } });
          extra.razorpayOrderId = razorpayOrder.id;
          Object.assign(update, { paymentMethod: 'razorpay', razorpayOrderId: razorpayOrder.id, razorpayOrderIds: [...(previous.razorpayOrderIds || []), razorpayOrder.id] });
        } else {
          update.paymentMethod = 'razorpay';
        }
        await ref.update(update);
        return { status: 200, body: await paymentSessionBody(gateways, { ...previous, ...update }, gateway, extra) };
      }
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const orderNumber = newOrderNumber();
      const orderRef = db.collection('orders').doc(orderNumber);
      // The order-number check and the Razorpay order are made together (a clash is practically impossible)
      const [existing, razorpayOrder] = await Promise.all([
        orderRef.get(),
        gateway === 'razorpay'
          ? createRazorpayOrder(gateways, {
            amountPaise: Math.round(priced.finalTotal * 100),
            receipt: orderNumber,
            notes: { order_number: orderNumber, customer_email: customerEmail },
          })
          : null,
      ]);
      if (existing.exists) continue;
      const payuTxnId = gateway === 'payu' ? `${orderNumber}-1` : '';

      const order = {
        orderNumber,
        date: now.toISOString(),
        status: 'Pending',
        paymentStatus: 'Unpaid',
        paymentMethod: gateway,
        paymentRef: '',
        razorpayOrderId: razorpayOrder?.id || '',
        razorpayOrderIds: razorpayOrder ? [razorpayOrder.id] : [],
        payuTxnId,
        payuTxnIds: payuTxnId ? [payuTxnId] : [],
        attemptKey,
        customerEmail,
        customerName: address.fullName,
        customerMobile: address.mobile,
        customerUid: identity.uid || '',
        deliveryAddress: address,
        items: priced.lines,
        subtotal: priced.subtotal,
        couponCode: priced.couponCode,
        couponId: priced.couponId,
        couponDiscount: priced.couponDiscount,
        comboDiscount: priced.comboDiscount,
        prepaidDiscount: priced.prepaidDiscount,
        discountAmount: priced.discountAmount,
        shippingCharge: priced.shippingCharge,
        finalTotal: priced.finalTotal,
        giftNote,
        // From the owner's processing + delivery days (Sundays skipped); '' when not configured
        estimatedDeliveryDate: estimateDelivery(priced.deliveryRules, now)?.max.toISOString() || '',
        deliveryEstimateSource: estimateDelivery(priced.deliveryRules, now) ? 'settings' : '',
        expectedDeliveryDate: '',
        trackingNumber: '',
        courierPartner: '',
        trackingUrl: '',
        notes: '',
        timeline: [timelineEntry('Pending', 'Order created, awaiting payment')],
        stockDeducted: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      try {
        await orderRef.create(order);
      } catch (error) {
        if (error?.code === 6) continue; // ALREADY_EXISTS: pick another number
        throw error;
      }
      return { status: 200, body: await paymentSessionBody(gateways, order, gateway) };
    }
    throw new Error('ORDER_NUMBER_EXHAUSTED');
  },

  // Result page after PayU sends the customer back (signed link), or a customer checking a pending payment.
  // The order is looked up on the server and, while unpaid, the gateway itself is asked for the payment status.
  async 'payment-result'(db, body, req, identity) {
    const orderNumber = cleanText(body.orderNumber, 40).toUpperCase();
    if (!orderNumber) throw new UserError('Order not found.', 404);
    const signed = checkResultToken(orderNumber, body.token);
    if (!signed && !identity.email) throw new UserError('Please sign in to see this order.', 401);
    if (!(await rateLimit(db, `result:${clientIp(req)}`, 60, 10 * 60 * 1000))) throw new UserError('Too many checks. Please wait a minute.', 429);
    let order = signed ? (await db.collection('orders').doc(orderNumber).get()).data() : await ownOrder(db, orderNumber, identity.email).catch(() => null);
    if (!order) throw new UserError('Order not found.', 404);
    let gatewayNote = '';
    if (order.paymentStatus === 'Unpaid') {
      try {
        const outcome = order.paymentMethod === 'payu' ? await reconcilePayu(db, order, await readGateways(db, { fresh: true })) : await reconcileRazorpay(db, order, await readGateways(db));
        if (outcome?.order) {
          order = outcome.order;
          if (outcome.changed) await notify(db, 'confirmed', order);
          if (outcome.changed) await alertStoreOfNewOrder(db, order);
        } else if (outcome?.pending) gatewayNote = 'pending';
        else if (outcome?.failed) gatewayNote = 'failed';
      } catch (error) {
        console.error(`Payment check failed for ${orderNumber}:`, error?.message);
        gatewayNote = 'unknown';
      }
    }
    return { status: 200, body: { order: ownerOrderView(order), paid: order.paymentStatus === 'Paid', gatewayNote } };
  },

  // Signed-in customer pays an order that is still awaiting payment (same order number, same prices).
  async 'pay-again'(db, body, req, identity) {
    if (!identity.email) throw new UserError('Please sign in to pay for this order.', 401);
    if (!(await rateLimit(db, `order:${clientIp(req)}`, 20, 60 * 60 * 1000))) throw new UserError('Too many checkout attempts. Please wait a few minutes and try again.', 429);
    const orderNumber = cleanText(body.orderNumber, 40).toUpperCase();
    const order = await ownOrder(db, orderNumber, identity.email);
    if (order.paymentStatus === 'Paid') return { status: 200, body: { alreadyPaid: true, orderNumber, order: ownerOrderView(order) } };
    if (order.paymentStatus !== 'Unpaid' || order.status !== 'Pending') throw new UserError('This order cannot be paid any more. Please place a new order.', 409);
    if (Date.now() - new Date(order.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000) throw new UserError('This order has expired. Please place a new order.', 409);
    const gateways = await readGateways(db);
    const gateway = pickGateway(publicGateways(gateways, { admin: identity.admin }), String(body.gateway || order.paymentMethod || ''));
    const ref = db.collection('orders').doc(orderNumber);
    const update = { paymentMethod: gateway, updatedAt: new Date().toISOString() };
    const extra = {};
    if (gateway === 'payu') {
      extra.txnid = `${orderNumber}-${(order.payuTxnIds || []).length + 1}`;
      Object.assign(update, { payuTxnId: extra.txnid, payuTxnIds: [...(order.payuTxnIds || []), extra.txnid] });
    } else {
      const razorpayOrder = await createRazorpayOrder(gateways, { amountPaise: Math.round(order.finalTotal * 100), receipt: orderNumber, notes: { order_number: orderNumber, customer_email: order.customerEmail } });
      extra.razorpayOrderId = razorpayOrder.id;
      Object.assign(update, { razorpayOrderId: razorpayOrder.id, razorpayOrderIds: [...new Set([...(order.razorpayOrderIds || []), order.razorpayOrderId, razorpayOrder.id].filter(Boolean))] });
    }
    await ref.update(update);
    return { status: 200, body: await paymentSessionBody(gateways, { ...order, ...update }, gateway, extra) };
  },

  async verify(db, body) {
    const orderNumber = cleanText(body.orderNumber, 40);
    const razorpayOrderId = cleanText(body.razorpay_order_id, 60);
    const paymentId = cleanText(body.razorpay_payment_id, 60);
    const signature = cleanText(body.razorpay_signature, 200);
    if (!orderNumber || !razorpayOrderId || !paymentId || !signature) throw new UserError('Payment details are incomplete.');
    const { secret } = razorpayCreds(await readGateways(db));
    if (!secret) throw new Error('PAYMENT_NOT_CONFIGURED');
    const expected = createHmac('sha256', secret).update(`${razorpayOrderId}|${paymentId}`).digest('hex');
    if (!safeEqualHex(expected, signature)) throw new UserError('Payment could not be verified. If money was deducted, contact us with your order number.', 400);

    const { order, changed } = await finalizePaidOrder(db, orderNumber, { paymentId, razorpayOrderId, source: 'checkout' });
    if (changed) await notify(db, 'confirmed', order);
    if (changed) await alertStoreOfNewOrder(db, order);
    // The verified payer gets the full address and payment reference for their receipt.
    return { status: 200, body: { order: ownerOrderView(order) } };
  },

  // Guest lookup: order number plus the email or phone used at checkout.
  async track(db, body, req, identity) {
    const orderNumber = cleanText(body.orderNumber, 40).toUpperCase();
    const contact = cleanText(body.contact, 160).toLowerCase();
    if (!orderNumber) throw new UserError('Enter your order number.');
    if (!(await rateLimit(db, `track:${clientIp(req)}`, 30, 10 * 60 * 1000))) {
      throw new UserError('Too many lookups. Please wait a few minutes.', 429);
    }
    const snap = await db.collection('orders').doc(orderNumber).get();
    const order = snap.exists ? snap.data() : null;
    const digits = contact.replace(/\D/g, '').slice(-10);
    const owns = order && (
      identity.admin
      || (identity.email && identity.email === order.customerEmail)
      || (contact && contact === String(order.customerEmail || '').toLowerCase())
      || (digits.length === 10 && digits === String(order.customerMobile || '').slice(-10))
    );
    if (!owns) throw new UserError('No order matches that order number and email / phone.', 404);
    // Only the signed-in owner (or the admin) sees the full address; a guest lookup gets the short view.
    if (identity.email && identity.email === order.customerEmail) return { status: 200, body: { order: ownerOrderView(order) } };
    if (identity.admin) {
      // The admin looking from the storefront: no customer actions (returns need the customer's own sign-in).
      const { returnEligibility, ...view } = ownerOrderView(order);
      return { status: 200, body: { order: view } };
    }
    return { status: 200, body: { order: publicOrderView(order) } };
  },

  async 'my-orders'(db, body, req, identity) {
    if (!identity.email) throw new UserError('Please sign in to see your orders.', 401);
    const snapshot = await db.collection('orders').where('customerEmail', '==', identity.email).get();
    const orders = snapshot.docs
      .map((docSnap) => docSnap.data())
      // Unpaid orders from the last 3 days stay listed with a "Pay" button; older abandoned ones are hidden
      .filter((order) => order.paymentStatus !== 'Unpaid' || (order.status === 'Pending' && Date.now() - new Date(order.createdAt || order.date).getTime() < 3 * 24 * 60 * 60 * 1000))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(ownerOrderView);
    return { status: 200, body: { orders } };
  },

  // Signature for one direct browser upload of one return photo (signed-in owner of an order that can be returned).
  async 'return-photo-sign'(db, body, req, identity) {
    if (!identity.email) throw new UserError('Please sign in to add photos.', 401);
    const orderNumber = cleanText(body.orderNumber, 40).toUpperCase();
    if (!orderNumber) throw new UserError('Order not found.', 404);
    if (!(await rateLimit(db, `return-photo:${emailHash(identity.email)}`, 24, 60 * 60 * 1000))
      || !(await rateLimit(db, `return-photo-ip:${clientIp(req)}`, 60, 60 * 60 * 1000))) {
      throw new UserError('Too many photo uploads. Please wait a while and try again.', 429);
    }
    const order = await ownOrder(db, orderNumber, identity.email);
    const blocked = returnBlockReason(order);
    if (blocked) throw new UserError(blocked, 409);
    const key = `rt_${randomBytes(12).toString('hex')}`;
    let signed;
    try {
      signed = returnPhotoSignature(key);
    } catch {
      throw new UserError('Photo upload is not available right now. Please try again later or contact us on WhatsApp.', 503);
    }
    // Server-only record: a photo can be attached only to this customer's request on this order.
    await db.collection('return_photos').doc(key).create({ owner: emailHash(identity.email), orderNumber, attachedAt: '', issuedAt: new Date().toISOString() });
    return { status: 200, body: signed };
  },

  // Return or exchange request from the signed-in owner of a delivered order (within 7 days of delivery).
  // Everything is checked here; the store is emailed, and the admin approves or rejects it in the admin panel.
  async 'return-request'(db, body, req, identity) {
    if (!identity.email) throw new UserError('Please sign in to request a return or exchange.', 401);
    const orderNumber = cleanText(body.orderNumber, 40).toUpperCase();
    if (!orderNumber) throw new UserError('Order not found.', 404);
    if (!(await rateLimit(db, `return:${emailHash(identity.email)}`, 10, 60 * 60 * 1000))) {
      throw new UserError('Too many requests. Please wait a while and try again.', 429);
    }
    const first = await ownOrder(db, orderNumber, identity.email);
    // Older pages sent only { orderNumber, reason }: that is a return of every piece not yet returned or exchanged.
    const input = body.type
      ? body
      : { type: 'return', items: returnableQty(first).map((qty, line) => ({ line, qty })).filter((entry) => entry.qty > 0), reason: 'Other', details: body.reason, photos: [] };
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    const isPhotoUrl = (url) => Boolean(returnPhotoKey(url, cloudName));
    const blockedEarly = returnBlockReason(first);
    if (blockedEarly) throw new UserError(blockedEarly, 409);
    // Exchange sizes are checked against the live catalogue.
    let products = new Map();
    if (input.type === 'exchange') {
      const ids = [...new Set((first.items || []).map((item) => String(item.product?.id || '')).filter(Boolean))];
      const snaps = ids.length ? await db.getAll(...ids.map((id) => db.collection('products').doc(id))) : [];
      products = new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, { sizes: Array.isArray(snap.data().sizes) ? snap.data().sizes : [] }]));
    }
    const clean = validateReturnInput(first, input, { products, isPhotoUrl });
    const photoKeys = clean.photos.map((url) => returnPhotoKey(url, cloudName));

    const ref = db.collection('orders').doc(orderNumber);
    const order = await db.runTransaction(async (tx) => {
      const photoRefs = photoKeys.map((key) => db.collection('return_photos').doc(key));
      const [snap, ...photoSnaps] = await tx.getAll(ref, ...photoRefs);
      const data = snap.exists ? snap.data() : null;
      if (!data || String(data.customerEmail || '').trim().toLowerCase() !== identity.email.trim().toLowerCase()) throw new UserError('Order not found.', 404);
      const blocked = returnBlockReason(data);
      if (blocked) throw new UserError(blocked, 409);
      const request = validateReturnInput(data, input, { products, isPhotoUrl });
      const owner = emailHash(identity.email);
      for (const photoSnap of photoSnaps) {
        const record = photoSnap.exists ? photoSnap.data() : null;
        if (!record || record.owner !== owner || record.orderNumber !== orderNumber || record.attachedAt) {
          throw new UserError('One of the photos could not be used. Please remove it and upload it again.');
        }
      }
      const at = new Date().toISOString();
      const previous = normalizeReturnRequest(data);
      const update = {
        returnRequest: { ...request, status: 'requested', at, updatedAt: at, adminNote: '', history: [{ status: 'requested', at, note: '' }] },
        timeline: [...(data.timeline || []), timelineEntry(request.type === 'exchange' ? 'Exchange requested' : 'Return requested', request.reason)],
        updatedAt: at,
      };
      // An earlier request (rejected, refunded or exchanged) is kept for the record; its pieces cannot be asked for again.
      if (previous && data.returnRequest) update.pastReturnRequests = [...(Array.isArray(data.pastReturnRequests) ? data.pastReturnRequests : []), data.returnRequest];
      photoRefs.forEach((photoRef) => tx.update(photoRef, { attachedAt: at }));
      tx.update(ref, update);
      return { ...data, ...update };
    });

    const alerted = await notifyStoreOfReturnRequest(db, order);
    await recordReturnRequestAlert(db, order.orderNumber, alerted).catch((error) => {
      console.error(`Could not record the return-request alert for ${order.orderNumber}:`, error?.message);
    });
    const kind = order.returnRequest.type === 'exchange' ? 'exchange' : 'return';
    return {
      status: 200,
      body: {
        order: ownerOrderView(order),
        message: `Your ${kind} request has been sent. Our team will review it and email you the next steps.`,
      },
    };
  },

  // Signed-in customer asks to cancel their own paid order before it is packed. Nothing is refunded
  // automatically: the store is emailed and the admin cancels and refunds from the admin panel.
  async 'request-cancel'(db, body, req, identity) {
    if (!identity.email) throw new UserError('Please sign in to cancel an order.', 401);
    if (!(await rateLimit(db, `cancel:${identity.email}`, 10, 60 * 60 * 1000))) {
      throw new UserError('Too many requests. Please wait a while and try again.', 429);
    }
    const order = await requestCancellation(db, { orderNumber: body.orderNumber, email: identity.email, reason: body.reason });
    // The request is saved either way; a missed alert is recorded so the admin panel can flag it.
    const alerted = await notifyStoreOfCancelRequest(db, order);
    await recordCancelRequestAlert(db, order.orderNumber, alerted).catch((error) => {
      console.error(`Could not record the cancel-request alert for ${order.orderNumber}:`, error?.message);
    });
    return {
      status: 200,
      body: {
        order: ownerOrderView(order),
        message: 'Cancellation request sent. Our team will review it and email you. If the order is cancelled before dispatch, the full amount is refunded to your original payment method.',
      },
    };
  },

  async 'admin-test-email'(db, body, req, identity) {
    if (!identity.admin) throw new UserError('Admin session expired. Please sign in again.', 401);
    const email = cleanText(body.email, 160).toLowerCase();
    if (!isValidEmail(email)) throw new UserError('Enter a valid email address.');
    try {
      await sendEmail({
        to: email,
        name: 'Suit Aura Girls admin',
        subject: 'Suit Aura Girls test email',
        html: '<p style="font-family:Arial,sans-serif;color:#3D0F1F">This is a test email from your Suit Aura Girls store. Transactional email is working.</p>',
        text: 'This is a test email from your Suit Aura Girls store. Transactional email is working.',
      });
    } catch (error) {
      throw new UserError(error?.message === 'EMAIL_NOT_CONFIGURED' ? 'BREVO_API_KEY is not set in Vercel.' : 'Brevo rejected the email. Check the API key and verified sender.', 502);
    }
    return { status: 200, body: { success: true } };
  },

  // Admin: Brevo delivery events for one address (delivered, blocked, bounced...).
  async 'admin-email-events'(db, body, req, identity) {
    if (!identity.admin) throw new UserError('Admin session expired. Please sign in again.', 401);
    const email = cleanText(body.email, 160).toLowerCase();
    if (!isValidEmail(email) || !process.env.BREVO_API_KEY) throw new UserError('Enter a valid email address.');
    const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=20&email=${encodeURIComponent(email)}`, {
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new UserError(`Brevo: ${result.message || response.status}`, 502);
    const sendersResponse = await fetch('https://api.brevo.com/v3/senders', { headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY } });
    const senders = ((await sendersResponse.json().catch(() => ({}))).senders || []).map((s) => ({ email: s.email, name: s.name, active: s.active }));
    return {
      status: 200,
      body: { configuredSender: process.env.BREVO_SENDER_EMAIL || '(not set — using fallback)', senders, events:(result.events || []).map((e) => ({ event: e.event, date: e.date, subject: e.subject, reason: e.reason || '', from: e.from || '' })) },
    };
  },

  // Admin: approve / reject / mark received / refunded / exchanged. Refunds themselves are made in Razorpay by hand.
  async 'admin-return'(db, body, req, identity) {
    if (!identity.admin) throw new UserError('Admin session expired. Please sign in again.', 401);
    const orderNumber = cleanText(body.orderNumber, 40);
    if (!orderNumber) throw new UserError('Order not found.', 404);
    const ref = db.collection('orders').doc(orderNumber);
    const order = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError('Order not found.', 404);
      const data = snap.data();
      const { update } = applyReturnAction(data, String(body.returnAction || ''), { note: body.note });
      tx.update(ref, update);
      return { ...data, ...update };
    });
    const customerEmailed = body.notify === false ? null : await notifyCustomerOfReturnUpdate(db, order);
    return { status: 200, body: { order, customerEmailed } };
  },

  // Admin: change status / tracking. Cancelling or refunding a paid order restores its stock.
  async 'admin-update'(db, body, req, identity) {
    if (!identity.admin) throw new UserError('Admin session expired. Please sign in again.', 401);
    const orderNumber = cleanText(body.orderNumber, 40);
    const ref = db.collection('orders').doc(orderNumber);
    const nextStatus = body.status ? cleanText(body.status, 40) : '';
    if (nextStatus && !ORDER_STATUSES.includes(nextStatus)) throw new UserError('Unknown order status.');
    // Checked before anything is written: an https tracking link and a real expected date.
    const trackingUrl = 'trackingUrl' in body ? cleanTrackingUrl(body.trackingUrl) : undefined;
    const expectedDeliveryDate = 'expectedDeliveryDate' in body ? cleanExpectedDate(body.expectedDeliveryDate) : undefined;
    let nextPayment = body.paymentStatus ? cleanText(body.paymentStatus, 40) : '';
    if (nextPayment && !['Paid', 'Unpaid', 'Refunded'].includes(nextPayment)) throw new UserError('Unknown payment status.');
    // Marking an order paid by hand runs the same finalisation as a verified payment (stock + coupon usage).
    if (nextPayment === 'Paid') {
      const current = await db.collection('orders').doc(orderNumber).get();
      if (!current.exists) throw new UserError('Order not found.', 404);
      if (current.data().paymentStatus !== 'Paid') {
        await finalizePaidOrder(db, orderNumber, { paymentId: cleanText(body.paymentRef, 80) || 'manual-by-admin', source: 'admin' });
      }
      nextPayment = '';
    }

    const { order, statusChanged, requestKept } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError('Order not found.', 404);
      const data = snap.data();
      const update = { updatedAt: new Date().toISOString() };
      if ('trackingNumber' in body) update.trackingNumber = cleanText(body.trackingNumber, 80);
      if ('courierPartner' in body) update.courierPartner = cleanText(body.courierPartner, 80);
      if ('deliveryAgentName' in body) update.deliveryAgentName = cleanText(body.deliveryAgentName, 80);
      if ('deliveryAgentPhone' in body) update.deliveryAgentPhone = String(body.deliveryAgentPhone || '').replace(/[^\d+]/g, '').slice(0, 15);
      if (trackingUrl !== undefined) update.trackingUrl = trackingUrl;
      if (expectedDeliveryDate !== undefined) update.expectedDeliveryDate = expectedDeliveryDate;
      if ('notes' in body) update.notes = cleanText(body.notes, 2000);
      if ('customerNote' in body) update.customerNote = cleanText(body.customerNote, 500);
      if (nextPayment) update.paymentStatus = nextPayment;

      let restore = null;
      const changed = Boolean(nextStatus && nextStatus !== data.status);
      // An open cancellation request is closed when the admin keeps the order, moves it past Processing, or cancels / refunds it.
      const outcome = cancelRequestOutcome(data, { nextStatus: changed ? nextStatus : '', keep: body.cancelRequestHandled === true });
      if (outcome) update.cancelRequest = { ...data.cancelRequest, handledAt: update.updatedAt, outcome };
      if (changed) {
        update.status = nextStatus;
        update.timeline = [...(data.timeline || []), timelineEntry(nextStatus, cleanText(body.timelineNote, 300))];
        if (nextStatus === 'Refunded') {
          update.paymentStatus = 'Refunded';
          // An open return request on the order is closed as refunded too.
          const closedReturn = closeReturnOnRefund(data, update.updatedAt);
          if (closedReturn) update.returnRequest = closedReturn;
        }
        if (nextStatus === 'Cancelled' || nextStatus === 'Refunded') {
          restore = await restoreOrderStock(tx, db, data);
        }
      }
      if (restore) {
        restore.apply?.();
        update.stockDeducted = false;
        update.deductedQuantities = {};
      }
      tx.update(ref, update);
      return { order: { ...data, ...update }, statusChanged: changed, requestKept: outcome === 'kept' };
    });

    // "Keep order" always tells the customer; closing the request by a status change follows the admin's email tick.
    let customerEmailed = null;
    if (requestKept && (body.cancelRequestHandled === true || body.notify !== false)) customerEmailed = await notifyCustomerCancelKept(db, order);
    if (statusChanged && body.notify !== false) await notify(db, order.status, order);
    return { status: 200, body: { order, ...(customerEmailed === null ? {} : { cancelKeptEmailSent: customerEmailed }) } };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Cross-origin request rejected.' });
  const body = parseBody(req);
  const action = actions[String(body.action || '')];
  if (!action) return reply(res, 400, { error: 'Unknown action.' });

  try {
    const db = firestore();
    const identity = await getIdentity(req);
    let budgetTimer;
    const budget = new Promise((_, reject) => { budgetTimer = setTimeout(() => reject(new Error('ORDERS_TIMEOUT')), 25000); });
    const result = await Promise.race([action(db, body, req, identity), budget]).finally(() => clearTimeout(budgetTimer));
    return reply(res, result.status, result.body);
  } catch (error) {
    if (error?.userFacing) return reply(res, error.status || 400, { error: error.message });
    const message = error?.message || 'unknown';
    console.error('Orders API error:', message);
    if (message === 'ORDERS_TIMEOUT' || error?.code === 8 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
      return reply(res, 503, { error: 'The store is very busy right now. Please try again in a few minutes. No money has been taken.' });
    }
    if (message === 'PAYMENT_NOT_CONFIGURED') return reply(res, 503, { error: 'Online payment is not configured yet. Please contact us on WhatsApp to order.' });
    if (message === 'PAYU_VERIFY_FAILED') return reply(res, 502, { error: 'Could not reach PayU to check the payment. Please try again in a minute.' });
    if (message === 'PAYMENT_GATEWAY_ERROR') return reply(res, 502, { error: 'The payment gateway is not responding. Please try again in a minute.' });
    if (message === 'SERVER_CONFIG_MISSING') return reply(res, 503, { error: 'Checkout is temporarily unavailable.' });
    return reply(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
