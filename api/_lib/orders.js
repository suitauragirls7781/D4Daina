import { FieldValue } from 'firebase-admin/firestore';
import { randomInt } from 'node:crypto';
import { cleanText, isValidEmail } from './http.js';
import { sendNewOrderAlert } from './email.js';

export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 20;

/** Error whose message is safe to show to the shopper. */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.userFacing = true;
    this.status = status;
  }
}

export const readSetting = async (db, key) => {
  const snapshot = await db.collection('storefront_settings').doc(key).get();
  if (!snapshot.exists) return null;
  try {
    return JSON.parse(snapshot.data().value_json);
  } catch {
    return null;
  }
};

/** Where store alerts go: the store email from settings, else the verified sender. */
export const storeAlertAddress = async (db) => {
  const store = (await readSetting(db, 'storeSettings')) || {};
  const storeEmail = String(store.storeEmail || '').trim();
  return isValidEmail(storeEmail) ? storeEmail : (process.env.BREVO_SENDER_EMAIL || 'contact.suitauragirls@gmail.com');
};

/**
 * Emails the store about an order that has just been paid for the first time. Never throws (a missed alert
 * must never affect the payment); skipped for PayU sandbox payments. Returns whether the alert went out.
 */
export const alertStoreOfNewOrder = async (db, order, { send = sendNewOrderAlert } = {}) => {
  try {
    if (!order || order.testPayment) return false;
    await send(order, await storeAlertAddress(db));
    return true;
  } catch (error) {
    if (error?.message !== 'EMAIL_NOT_CONFIGURED') console.error(`New-order alert failed for ${order?.orderNumber}:`, error?.message);
    return false;
  }
};

/** Store-level pricing rules, always read on the server. */
export const readPricingRules = async (db) => {
  const [storeSetting, comboSetting] = await Promise.all([readSetting(db, 'storeSettings'), readSetting(db, 'comboOffer')]);
  const store = storeSetting || {};
  const combo = comboSetting || {};
  return {
    comboEnabled: Boolean(combo.enabled) && Number(combo.percent) > 0,
    comboPercent: Math.min(50, Math.max(0, Number(combo.percent) || 0)),
    comboMinItems: Math.max(2, Number(combo.minItems) || 2),
    shippingCharge: Math.max(0, Number(store.shippingCharge) || 0),
    freeShippingThreshold: Math.max(0, Number(store.freeShippingThreshold) || 0),
    prepaidDiscount: Math.max(0, Number(store.prepaidDiscount ?? 0) || 0),
    // Percent off for online payment (0 = off), only on products whose unit price is above prepaidMinPrice
    prepaidPercent: Math.min(50, wholeNumber(store.prepaidPercent)),
    prepaidMinPrice: wholeNumber(store.prepaidMinPrice),
    ...checkoutRulesFrom(store),
  };
};

const wholeNumber = (value) => Math.max(0, Math.floor(Number(value) || 0));

/** Owner's checkout rules from storeSettings (Admin → Settings → Checkout). 0 = no limit / not configured. */
export const checkoutRulesFrom = (store) => {
  const s = store && typeof store === 'object' ? store : {};
  const rawWindow = s.cancellationWindowHours;
  return {
    minOrderAmount: wholeNumber(s.minOrderAmount),
    maxOrderAmount: wholeNumber(s.maxOrderAmount),
    couponsEnabled: s.couponsEnabled !== false,
    cancellationWindowHours: rawWindow === undefined || rawWindow === null || rawWindow === '' ? 0 : wholeNumber(rawWindow),
    processingDays: wholeNumber(s.processingDays),
    deliveryMinDays: wholeNumber(s.deliveryMinDays),
    deliveryMaxDays: wholeNumber(s.deliveryMaxDays),
  };
};

export const COUPONS_OFF_MESSAGE = 'Coupons are not available right now.';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const IST_SHIFT_MS = 330 * 60 * 1000;

/** Adds working days (Sundays skipped) to a day counted in India time; returns the new day (UTC midnight of that IST date). */
const addWorkingDays = (istDay, days) => {
  const date = new Date(istDay.getTime());
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0) left -= 1;
  }
  return date;
};

/**
 * Delivery window from the owner's configured processing and delivery days (Sundays skipped, days counted
 * in India time): { min, max } as Dates (noon India time of each day), or null when delivery days are not set.
 * Same rule as estimateDelivery in src/utils/delivery.ts.
 */
export const estimateDelivery = (settings, from = new Date()) => {
  const s = settings && typeof settings === 'object' ? settings : {};
  let minDays = wholeNumber(s.deliveryMinDays);
  let maxDays = wholeNumber(s.deliveryMaxDays);
  if (!minDays && !maxDays) return null;
  if (!maxDays) maxDays = minDays;
  if (!minDays || minDays > maxDays) minDays = maxDays;
  const processing = wholeNumber(s.processingDays);
  const start = from instanceof Date ? from : new Date(from);
  if (!Number.isFinite(start.getTime())) return null;
  const shifted = new Date(start.getTime() + IST_SHIFT_MS);
  const istDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const toNoonIst = (day) => new Date(day.getTime() + 12 * 60 * 60 * 1000 - IST_SHIFT_MS);
  return {
    min: toNoonIst(addWorkingDays(istDay, processing + minDays)),
    max: toNoonIst(addWorkingDays(istDay, processing + maxDays)),
  };
};

/** Checks the order value (after discounts, before shipping) against the owner's minimum and maximum. */
export const checkOrderLimits = (amount, rules) => {
  const inr = (value) => `₹${Math.round(value).toLocaleString('en-IN')}`;
  if (rules?.minOrderAmount > 0 && amount < rules.minOrderAmount) {
    throw new UserError(`Minimum order is ${inr(rules.minOrderAmount)}. Please add ${inr(rules.minOrderAmount - amount)} more to your bag.`);
  }
  if (rules?.maxOrderAmount > 0 && amount > rules.maxOrderAmount) {
    throw new UserError(`Maximum order is ${inr(rules.maxOrderAmount)}. Please remove some items, or contact us on WhatsApp for a larger order.`);
  }
};

const couponWindowError = (coupon, now = new Date()) => {
  if (coupon.isActive === false) return 'This coupon is no longer active.';
  if (coupon.startDate) {
    const start = new Date(coupon.startDate);
    if (Number.isFinite(start.getTime()) && now < start) return 'This coupon is not active yet.';
  }
  if (coupon.expiryDate) {
    const end = new Date(coupon.expiryDate);
    if (Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (now > end) return 'This coupon has expired.';
    }
  }
  const limit = Number(coupon.usageLimit) || 0;
  if (limit > 0 && (Number(coupon.usageCount) || 0) >= limit) return 'This coupon has reached its usage limit.';
  return '';
};

export const findCoupon = async (db, code) => {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const snapshot = await db.collection('coupons').get();
  const match = snapshot.docs.find((docSnap) => String(docSnap.data().code || '').trim().toUpperCase() === clean);
  return match ? { id: match.id, ref: match.ref, ...match.data() } : null;
};

export const couponDiscountFor = (coupon, subtotal) => {
  if (!coupon) return 0;
  const value = Math.max(0, Number(coupon.discountValue) || 0);
  let discount = coupon.discountType === 'fixed' ? value : Math.round((subtotal * value) / 100);
  const cap = Number(coupon.maxDiscount) || 0;
  if (coupon.discountType !== 'fixed' && cap > 0) discount = Math.min(discount, cap);
  return Math.min(discount, subtotal);
};

const couponKey = (value) => String(value || '').trim().toLowerCase();
const couponList = (value) => (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean);

/**
 * Subtotal of the lines a coupon applies to. A coupon limited to categories and/or products (admin → Coupons)
 * applies to lines in any allowed category or any allowed product; with no limit it applies to every line.
 * Same rule as couponEligibleSubtotal in src/utils/coupons.ts (browser preview).
 */
export const couponEligibleSubtotal = (coupon, lines) => {
  const categories = couponList(coupon?.allowedCategories).map(couponKey);
  const productIds = couponList(coupon?.allowedProductIds);
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => (!categories.length && !productIds.length)
      || productIds.includes(String(line?.product?.id || ''))
      || categories.includes(couponKey(line?.product?.category)))
    .reduce((sum, line) => sum + Math.max(0, Number(line?.product?.price) || 0) * Math.max(0, Number(line?.quantity) || 0), 0);
};

/**
 * Paid orders by this customer (same email or same mobile) that used the coupon, read with at most one
 * query per identifier, each stopped at `limit` documents. Equality filters only, so no composite index is needed.
 */
export const couponUsesByCustomer = async (db, code, customer, limit) => {
  const email = couponKey(customer?.email);
  const mobile = String(customer?.phone || customer?.mobile || '').replace(/\D/g, '').slice(-10);
  const base = () => db.collection('orders').where('couponCode', '==', String(code || '').trim().toUpperCase()).where('paymentStatus', '==', 'Paid');
  const snaps = await Promise.all([
    email ? base().where('customerEmail', '==', email).limit(limit).get() : null,
    mobile ? base().where('customerMobile', '==', mobile).limit(limit).get() : null,
  ]);
  return new Set(snaps.flatMap((snap) => (snap ? snap.docs.map((docSnap) => docSnap.id) : []))).size;
};

/**
 * Validates a coupon for a subtotal; returns { coupon, discount, eligibleSubtotal } or throws a UserError.
 * With `lines` (priced cart lines), a category / product limit is enforced; with `customer` ({ email, phone }),
 * the per-customer limit is enforced too.
 */
export const validateCoupon = async (db, code, subtotal, { lines, customer, couponsEnabled } = {}) => {
  // The owner can switch every coupon off (Admin → Settings → Checkout); read here unless the caller already has it.
  const enabled = couponsEnabled === undefined ? checkoutRulesFrom(await readSetting(db, 'storeSettings')).couponsEnabled : couponsEnabled;
  if (!enabled) throw new UserError(COUPONS_OFF_MESSAGE);
  const coupon = await findCoupon(db, code);
  if (!coupon) throw new UserError('This coupon code is not valid.');
  const windowError = couponWindowError(coupon);
  if (windowError) throw new UserError(windowError);
  const minimum = Number(coupon.minOrderValue) || 0;
  if (subtotal < minimum) {
    throw new UserError(`Add ₹${(minimum - subtotal).toLocaleString('en-IN')} more to use ${String(coupon.code).toUpperCase()} (minimum order ₹${minimum.toLocaleString('en-IN')}).`);
  }
  let eligibleSubtotal = subtotal;
  if (Array.isArray(lines)) {
    eligibleSubtotal = Math.min(subtotal, couponEligibleSubtotal(coupon, lines));
    if (eligibleSubtotal <= 0) {
      const categories = couponList(coupon.allowedCategories);
      const where = categories.length ? `${categories.join(', ')}${couponList(coupon.allowedProductIds).length ? ' and selected products' : ''}` : 'selected products';
      throw new UserError(`${String(coupon.code).toUpperCase()} is valid only on ${where}. Add an eligible item to use it.`);
    }
  }
  const perUser = Math.floor(Number(coupon.perUserLimit) || 0);
  if (perUser > 0 && customer && (customer.email || customer.phone || customer.mobile)) {
    const used = await couponUsesByCustomer(db, coupon.code, customer, perUser);
    if (used >= perUser) {
      throw new UserError(`You have already used ${String(coupon.code).toUpperCase()}${perUser > 1 ? ` ${perUser} times` : ''}. It can be used ${perUser === 1 ? 'once' : `${perUser} times`} per customer.`);
    }
  }
  return { coupon, discount: couponDiscountFor(coupon, eligibleSubtotal), eligibleSubtotal };
};

export const ACCESSORY_ONLY_MESSAGE = 'Bags, heels and jewellery are sold only with their outfit. Please add the outfit back to your bag or remove the accessory.';

/**
 * "Complete the look" accessories are never sold on their own. Each accessory line must name its outfit
 * (parentId): a published combo / set product that is in the same order, that the admin allows the accessory
 * for (storefront_settings/lookRelations; no published picks = every accessory), and never more of an
 * accessory than pieces of its outfit. Same rules as lookFor / enforceLooks in the storefront.
 */
const checkLookAccessories = async (db, requests, products) => {
  const accessoryLines = requests.filter((request) => products.get(request.productId)?.productType === 'accessory');
  if (accessoryLines.length === 0) return;
  const outfitQty = new Map();
  for (const request of requests) {
    const product = products.get(request.productId);
    if (product && product.productType !== 'accessory') outfitQty.set(request.productId, (outfitQty.get(request.productId) || 0) + request.quantity);
  }
  const relations = (await readSetting(db, 'lookRelations')) || {};
  // Picks that point to accessories not in this order: read them to know whether they are still published
  const pickIds = [...new Set(accessoryLines.flatMap((request) => (Array.isArray(relations[request.parentId]) ? relations[request.parentId] : []).map(String)))]
    .filter((id) => id && !products.has(id)).slice(0, 60);
  const pickDocs = pickIds.length ? await db.getAll(...pickIds.map((id) => db.collection('products').doc(id))) : [];
  const published = new Set([
    ...pickDocs.filter((snap) => snap.exists && !snap.data().hidden && snap.data().productType === 'accessory').map((snap) => snap.id),
    ...[...products.values()].filter((p) => p.productType === 'accessory' && !p.hidden).map((p) => p.id),
  ]);
  const used = new Map();
  for (const request of accessoryLines) {
    const accessory = products.get(request.productId);
    const parent = products.get(request.parentId);
    const outfitPieces = outfitQty.get(request.parentId) || 0;
    const isCombo = parent && !parent.hidden && parent.productType !== 'accessory' && String(parent.setType || '').trim();
    if (!request.parentId || !isCombo || outfitPieces <= 0) throw new UserError(ACCESSORY_ONLY_MESSAGE, 409);
    const picks = (Array.isArray(relations[request.parentId]) ? relations[request.parentId] : []).map(String).filter((id) => published.has(id));
    if (picks.length > 0 && !picks.includes(accessory.id)) throw new UserError(`${accessory.name} is not part of the look for ${parent.name}. Please remove it from your bag.`, 409);
    const key = `${request.parentId}|${accessory.id}`;
    const total = (used.get(key) || 0) + request.quantity;
    if (total > outfitPieces) throw new UserError(`You can add up to ${outfitPieces} × ${accessory.name} with ${parent.name}.`, 409);
    used.set(key, total);
  }
};

/**
 * Re-prices a cart from Firestore. The browser only supplies product ids, sizes and quantities
 * (and, for "Complete the look" accessories, the outfit they go with).
 * `customer` ({ email, phone }), when known, enforces a coupon's per-customer limit.
 */
export const priceCart = async (db, rawItems, couponCode, customer = null) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new UserError('Your bag is empty.');
  if (rawItems.length > MAX_LINES) throw new UserError(`A single order can hold up to ${MAX_LINES} different items.`);

  const requests = rawItems.map((item) => ({
    productId: cleanText(item?.productId, 120),
    size: cleanText(item?.size, 20),
    color: { name: cleanText(item?.color?.name, 60), hex: cleanText(item?.color?.hex, 20) },
    quantity: Math.floor(Number(item?.quantity) || 0),
    parentId: cleanText(item?.parentId, 120),
  }));
  for (const request of requests) {
    if (!request.productId) throw new UserError('One of the items in your bag is invalid. Please remove it and try again.');
    if (request.quantity < 1 || request.quantity > MAX_QTY_PER_LINE) {
      throw new UserError(`Quantity must be between 1 and ${MAX_QTY_PER_LINE} per item.`);
    }
  }

  const ids = [...new Set(requests.map((request) => request.productId))];
  const snapshots = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));
  const products = new Map(snapshots.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
  for (const request of requests) {
    const product = products.get(request.productId);
    if (!product || product.hidden) throw new UserError('An item in your bag is no longer available. Please remove it and try again.', 409);
  }
  await checkLookAccessories(db, requests, products);

  const perProductQty = new Map();
  const lines = requests.map((request) => {
    const product = products.get(request.productId);
    if (!product || product.hidden) throw new UserError('An item in your bag is no longer available. Please remove it and try again.', 409);
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    if (sizes.length > 0 && !sizes.includes(request.size)) {
      throw new UserError(`Size ${request.size || '(none)'} is not available for ${product.name}.`, 409);
    }
    perProductQty.set(product.id, (perProductQty.get(product.id) || 0) + request.quantity);
    const price = Math.max(0, Math.round(Number(product.price) || 0));
    if (price <= 0) throw new UserError(`${product.name} cannot be ordered right now.`, 409);
    // The photo of the colour the shopper chose (each colour may carry its own photo), else the first photo
    const wantedColour = String(request.color.name || '').trim().toLowerCase();
    const colourPhoto = wantedColour
      ? (Array.isArray(product.colors) ? product.colors : []).find((c) => String(c?.name || '').trim().toLowerCase() === wantedColour)?.imageUrl
      : '';
    const image = (typeof colourPhoto === 'string' && /^https:\/\//.test(colourPhoto) ? colourPhoto : '')
      || (Array.isArray(product.images) ? product.images[0] : '') || product.image || '';
    const parent = product.productType === 'accessory' ? products.get(request.parentId) : null;
    return {
      id: `${product.id}-${request.size}-${request.color.name || 'default'}${parent ? `-look-${parent.id}` : ''}`,
      ...(parent ? { lookParentId: parent.id, lookParentName: parent.name || 'Outfit' } : {}),
      product: {
        id: product.id,
        name: product.name || 'Product',
        sku: product.sku || '',
        category: product.category || '',
        image,
        images: image ? [image] : [],
        price,
        originalPrice: Math.max(price, Math.round(Number(product.originalPrice) || price)),
      },
      selectedSize: request.size,
      selectedColor: request.color.name ? request.color : { name: 'Default', hex: '' },
      quantity: request.quantity,
    };
  });

  for (const [id, quantity] of perProductQty) {
    const product = products.get(id);
    const available = Math.max(0, Number(product.stockQuantity) || 0);
    if (product.inStock === false || available <= 0) throw new UserError(`${product.name} is sold out.`, 409);
    if (quantity > available) throw new UserError(`Only ${available} piece${available === 1 ? '' : 's'} of ${product.name} left in stock.`, 409);
  }

  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  // Only outfit pieces unlock the combo offer: accessories (sold in "Complete the look") never count towards
  // its minimum; the percentage still comes off the whole subtotal. Same rule as comboPiecesIn in src/utils/looks.ts.
  const outfitPieces = requests.reduce((sum, request) => sum + (products.get(request.productId)?.productType === 'accessory' ? 0 : request.quantity), 0);
  const rules = await readPricingRules(db);
  // Combo first (on the full subtotal), then the coupon on what remains, then the prepaid discount.
  const comboDiscount = rules.comboEnabled && outfitPieces >= rules.comboMinItems ? Math.round((subtotal * rules.comboPercent) / 100) : 0;
  const afterCombo = subtotal - comboDiscount;
  let coupon = null;
  let couponDiscount = 0;
  if (String(couponCode || '').trim()) {
    const result = await validateCoupon(db, couponCode, subtotal, { lines, customer, couponsEnabled: rules.couponsEnabled });
    coupon = result.coupon;
    // A category / product-limited coupon applies to its lines' share of the post-combo amount
    const couponBase = result.eligibleSubtotal < subtotal ? Math.round((afterCombo * result.eligibleSubtotal) / subtotal) : afterCombo;
    couponDiscount = Math.min(couponDiscountFor(coupon, couponBase), afterCombo);
  }
  const shippingCharge = rules.freeShippingThreshold > 0 && subtotal >= rules.freeShippingThreshold ? 0 : rules.shippingCharge;
  const afterCoupon = Math.max(0, afterCombo - couponDiscount);
  // Online payment discount: the flat amount per order plus a percentage on the products priced above the
  // owner's minimum (strictly above). Those products carry their share of the combo / coupon reductions,
  // like couponBase above. Same formula as prepaidDiscountFor in src/utils/prepaid.ts (browser preview).
  const eligibleSubtotal = rules.prepaidPercent > 0
    ? lines.reduce((sum, line) => sum + (line.product.price > rules.prepaidMinPrice ? line.product.price * line.quantity : 0), 0)
    : 0;
  const eligibleShare = eligibleSubtotal === subtotal ? afterCoupon : Math.round((afterCoupon * eligibleSubtotal) / subtotal);
  const percentPart = Math.round((eligibleShare * rules.prepaidPercent) / 100);
  const prepaidDiscount = Math.min(rules.prepaidDiscount + percentPart, Math.max(0, afterCoupon - 1));
  // The owner's minimum / maximum order value: the amount after every discount, before shipping
  checkOrderLimits(afterCoupon - prepaidDiscount, rules);
  const finalTotal = afterCoupon - prepaidDiscount + shippingCharge;
  if (finalTotal < 1) throw new UserError('Order total must be at least ₹1.');

  return {
    lines,
    subtotal,
    couponCode: coupon ? String(coupon.code).toUpperCase() : '',
    couponId: coupon ? coupon.id : '',
    couponDiscount,
    comboDiscount,
    prepaidDiscount,
    shippingCharge,
    discountAmount: comboDiscount + couponDiscount + prepaidDiscount,
    finalTotal,
    // Owner's delivery days from the same settings read (for the order's delivery estimate)
    deliveryRules: { processingDays: rules.processingDays, deliveryMinDays: rules.deliveryMinDays, deliveryMaxDays: rules.deliveryMaxDays },
  };
};

export const newOrderNumber = () => {
  const now = new Date();
  const date = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let index = 0; index < 5; index += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `SAG-${date}-${suffix}`;
};

const timelineEntry = (status, note = '') => ({ status, at: new Date().toISOString(), note: String(note || '').slice(0, 300) });

/**
 * Marks an order paid exactly once: deducts stock (never below zero) and counts coupon usage in one transaction.
 * Returns { order, changed } where changed is false when the order was already paid.
 */
export const finalizePaidOrder = async (db, orderNumber, { paymentId, razorpayOrderId, source }) => {
  const orderRef = db.collection('orders').doc(orderNumber);
  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new UserError('Order not found.', 404);
    const order = orderSnap.data();
    // "Pay again" gives an unpaid order a new Razorpay order; a payment on any of them belongs to this order
    const knownRazorpayIds = [order.razorpayOrderId, ...(Array.isArray(order.razorpayOrderIds) ? order.razorpayOrderIds : [])].filter(Boolean);
    if (razorpayOrderId && !knownRazorpayIds.includes(razorpayOrderId)) throw new UserError('Payment does not match this order.', 400);
    if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded') return { order, changed: false };

    const quantities = new Map();
    for (const item of order.items || []) {
      const id = String(item.product?.id || '');
      if (id) quantities.set(id, (quantities.get(id) || 0) + (Number(item.quantity) || 0));
    }
    const productRefs = [...quantities.keys()].map((id) => db.collection('products').doc(id));
    const productSnaps = productRefs.length ? await tx.getAll(...productRefs) : [];
    const couponRef = order.couponId ? db.collection('coupons').doc(order.couponId) : null;
    const couponSnap = couponRef ? await tx.get(couponRef) : null;

    const deducted = {};
    const shortfall = [];
    for (const snap of productSnaps) {
      if (!snap.exists) {
        shortfall.push({ productId: snap.id, requested: quantities.get(snap.id), available: 0 });
        continue;
      }
      const data = snap.data();
      const available = Math.max(0, Number(data.stockQuantity) || 0);
      const wanted = quantities.get(snap.id) || 0;
      const take = Math.min(available, wanted);
      if (take < wanted) shortfall.push({ productId: snap.id, name: data.name || '', requested: wanted, available });
      const next = available - take;
      deducted[snap.id] = take;
      tx.update(snap.ref, { stockQuantity: next, inStock: next > 0 && data.inStock !== false, updatedAt: new Date().toISOString() });
    }
    if (couponSnap?.exists) tx.update(couponRef, { usageCount: FieldValue.increment(1) });

    const paidAt = new Date().toISOString();
    const update = {
      paymentStatus: 'Paid',
      paymentRef: paymentId || order.paymentRef || '',
      paidAt,
      paidVia: source,
      status: 'Processing',
      stockDeducted: true,
      deductedQuantities: deducted,
      stockShortfall: shortfall,
      timeline: [...(order.timeline || []), timelineEntry('Processing', 'Payment received')],
      updatedAt: paidAt,
    };
    if (shortfall.length) {
      update.notes = `${order.notes ? `${order.notes}\n` : ''}Stock shortfall at payment time — check before packing: ${shortfall.map((s) => `${s.name || s.productId} (wanted ${s.requested}, had ${s.available})`).join(', ')}`;
    }
    tx.update(orderRef, update);
    // Admin dashboard purchase count: counted only here, when a payment is actually verified
    const day = paidAt.slice(0, 10);
    tx.set(db.collection('daily_analytics').doc(day), { date: day, purchases: FieldValue.increment(1) }, { merge: true });
    return { order: { ...order, ...update }, changed: true };
  });
};

/** Puts deducted stock back when a paid order is cancelled or refunded. Safe to call more than once. */
export const restoreOrderStock = async (tx, db, order) => {
  if (!order.stockDeducted) return {};
  const entries = Object.entries(order.deductedQuantities || {}).filter(([, qty]) => Number(qty) > 0);
  if (!entries.length) return { stockDeducted: false, deductedQuantities: {} };
  const refs = entries.map(([id]) => db.collection('products').doc(id));
  const snaps = await tx.getAll(...refs);
  return {
    apply: () => {
      snaps.forEach((snap, index) => {
        if (!snap.exists) return;
        const current = Math.max(0, Number(snap.data().stockQuantity) || 0);
        const next = current + Number(entries[index][1]);
        tx.update(snap.ref, { stockQuantity: next, inStock: next > 0, updatedAt: new Date().toISOString() });
      });
    },
    stockDeducted: false,
    deductedQuantities: {},
  };
};

export const ORDER_STATUSES = ['Pending', 'Processing', 'Packed', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled', 'Refund Requested', 'Refunded'];

export { timelineEntry };

/** Statuses in which a customer may still ask to cancel (nothing has been packed yet). */
export const CANCELLABLE_STATUSES = ['Pending', 'Processing'];

/** Statuses in which the order is not going ahead (money back to the customer). */
const STOPPED_STATUSES = ['Cancelled', 'Refund Requested', 'Refunded'];

/**
 * How an admin update closes a customer's open cancellation request: 'cancelled', 'kept', or null when it stays open.
 * The admin choosing "Keep order", or moving the order past Processing (packed, shipped, delivered), keeps it;
 * cancelling or refunding closes it as cancelled. nextStatus is the status the update sets ('' = unchanged).
 */
export const cancelRequestOutcome = (order, { nextStatus = '', keep = false } = {}) => {
  const request = order?.cancelRequest;
  if (!request || request.handledAt) return null;
  const status = nextStatus || order.status;
  if (STOPPED_STATUSES.includes(status)) return 'cancelled';
  if (keep || !CANCELLABLE_STATUSES.includes(status)) return 'kept';
  return null;
};

/** Notes on the request whether the store's email alert went out, so a missed alert shows in the admin panel. */
export const recordCancelRequestAlert = async (db, orderNumber, sent) => {
  const ref = db.collection('orders').doc(orderNumber);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const request = snap.exists ? snap.data().cancelRequest : null;
    if (request) tx.update(ref, { cancelRequest: { ...request, storeNotified: Boolean(sent) } });
  });
};

/** Why a customer cannot ask to cancel this order right now; an empty string means they can. */
export const cancelBlockReason = (order, { windowHours = 0, now = Date.now() } = {}) => {
  if (!order) return 'Order not found.';
  if (order.status === 'Cancelled') return 'This order is already cancelled.';
  if (order.cancelRequest) return 'A cancellation request for this order is already with our team.';
  if (order.paymentStatus === 'Refunded' || order.status === 'Refunded') return 'This order has already been refunded.';
  if (order.paymentStatus !== 'Paid') return 'Only paid orders can be cancelled from your account.';
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return 'This order has already been packed or shipped, so it can no longer be cancelled here. Please contact us on WhatsApp.';
  }
  // The owner's extra time limit (Admin → Settings → Checkout), counted from payment; 0 = none
  const paid = new Date(order.paidAt || '').getTime();
  if (windowHours > 0 && Number.isFinite(paid) && now - paid > windowHours * 60 * 60 * 1000) {
    return `Orders can be cancelled here within ${windowHours} hour${windowHours === 1 ? '' : 's'} of payment. Please contact us on WhatsApp.`;
  }
  return '';
};

/**
 * Records a signed-in customer's request to cancel their own paid, not-yet-packed order.
 * Nothing is refunded here: the admin reviews the request, cancels the order and refunds by hand.
 * Returns the updated order.
 */
export const requestCancellation = async (db, { orderNumber, email, reason }) => {
  const owner = String(email || '').trim().toLowerCase();
  if (!owner) throw new UserError('Please sign in to cancel an order.', 401);
  const number = cleanText(orderNumber, 40).toUpperCase();
  const cleanReason = cleanText(reason, 300);
  if (!number) throw new UserError('Order not found.', 404);
  if (cleanReason.length < 3) throw new UserError('Please tell us briefly why you want to cancel.');
  const ref = db.collection('orders').doc(number);
  const { cancellationWindowHours } = checkoutRulesFrom(await readSetting(db, 'storeSettings'));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || String(data.customerEmail || '').trim().toLowerCase() !== owner) throw new UserError('Order not found.', 404);
    const blocked = cancelBlockReason(data, { windowHours: cancellationWindowHours });
    if (blocked) throw new UserError(blocked, 409);
    const at = new Date().toISOString();
    const update = {
      cancelRequest: { reason: cleanReason, at },
      timeline: [...(data.timeline || []), timelineEntry('Cancellation requested', cleanReason)],
      updatedAt: at,
    };
    tx.update(ref, update);
    return { ...data, ...update };
  });
};

// ---------------------------------------------------------------------------------------------
// Returns and exchanges
//
// A delivered, paid order can have one open return / exchange request at a time (order.returnRequest).
// Its own lifecycle: requested → approved | rejected; approved → received | refunded / exchanged | rejected;
// received → refunded (return) / exchanged (exchange) | rejected. The order itself stays Delivered while the
// request runs; only when every piece has been returned and refunded does the whole order become Refunded.
// Refunds are made by the owner in Razorpay by hand; "refunded" only records that. Stock is not changed
// automatically. A finished (or rejected) request moves to order.pastReturnRequests when the customer asks
// again, and pieces already returned or exchanged cannot be asked for twice.
// Older requests were stored as { reason, at } with the order status 'Refund Requested', or (older still) only
// as that status plus a "[RETURN/EXCHANGE REQUEST]" line in the order notes. Both are read through
// normalizeReturnRequest and converted the first time the admin acts on them.
// ---------------------------------------------------------------------------------------------

export const RETURN_WINDOW_DAYS = 7;
export const RETURN_REASONS = ["Size doesn't fit", 'Damaged / defective', 'Wrong item received', 'Colour or quality not as expected', 'Other'];
/** Reasons for which at least one photo is required. */
export const RETURN_PHOTO_REASONS = ['Damaged / defective', 'Wrong item received'];
export const RETURN_MAX_PHOTOS = 4;
export const RETURN_MAX_REQUESTS = 3;
export const RETURN_STATES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'exchanged'];
export const RETURN_OPEN_STATES = ['requested', 'approved', 'received'];
/** Finished requests: their pieces cannot be asked for again. */
export const RETURN_DONE_STATES = ['refunded', 'exchanged'];
export const RETURN_PHOTO_FOLDER = 'suitauragirls/returns';
const DAY_MS = 24 * 60 * 60 * 1000;
/** India Standard Time is UTC+5:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** When the order was delivered (latest 'Delivered' timeline entry), in ms, or null when unknown. */
export const deliveredAt = (order) => {
  const entries = (Array.isArray(order?.timeline) ? order.timeline : []).filter((entry) => entry?.status === 'Delivered');
  const times = entries.map((entry) => new Date(entry.at).getTime()).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
};

/**
 * Last moment to ask for a return / exchange: 11:59:59 pm India time on the 7th day after the delivery day,
 * so the date customers are shown ("request by 17 Sept") is a whole day. Null when the delivery date is unknown.
 */
const returnWindowEndMs = (order) => {
  const delivered = deliveredAt(order);
  if (delivered === null) return null;
  const deliveryDayStart = Math.floor((delivered + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return deliveryDayStart + (RETURN_WINDOW_DAYS + 1) * DAY_MS - 1;
};

/** End of the return / exchange window (ISO), or '' when the delivery date is unknown (the admin decides). */
export const returnWindowEndsAt = (order) => {
  const end = returnWindowEndMs(order);
  return end === null ? '' : new Date(end).toISOString();
};

/** An order line bought at 50% or more off (final clearance): size exchange only, per the return policy. */
export const isClearanceLine = (item) => {
  const price = Number(item?.product?.price) || 0;
  const original = Number(item?.product?.originalPrice) || 0;
  return price > 0 && original > 0 && price <= original * 0.5;
};

/**
 * The oldest requests (before api/orders.js) were saved only as the order status 'Refund Requested' plus a
 * notes line "[RETURN/EXCHANGE REQUEST] Type: Exchange | Reason: … | Note: …". Returns what the last such line says.
 */
export const legacyNotesRequest = (notes) => {
  const lines = [...String(notes || '').matchAll(/\[RETURN\/EXCHANGE REQUEST\]\s*Type:\s*([^|\n]*?)\s*\|\s*Reason:\s*([^|\n]*?)\s*\|\s*Note:\s*([^\n]*)/g)];
  const last = lines[lines.length - 1];
  if (!last) return { type: 'return', details: '' };
  const note = cleanText(last[3], 700);
  const reason = cleanText(last[2], 200);
  return {
    type: /exchange/i.test(last[1]) ? 'exchange' : 'return',
    details: [reason, note && note.toLowerCase() !== 'none' ? note : ''].filter(Boolean).join(' — '),
  };
};

/**
 * The order's return / exchange request in the current shape, or null. Older requests ({ reason, at }, or
 * only the order status) get their state from the order status: 'Refund Requested' = requested,
 * 'Refunded' = refunded, else closed.
 */
export const normalizeReturnRequest = (order) => {
  const request = order?.returnRequest;
  if (!request || typeof request !== 'object') {
    if (order?.status !== 'Refund Requested') return null;
    const fromNotes = legacyNotesRequest(order.notes);
    return {
      legacy: true,
      type: fromNotes.type,
      status: 'requested',
      items: [],
      reason: 'Other',
      details: fromNotes.details,
      photos: [],
      at: '',
      updatedAt: '',
      adminNote: '',
      history: [],
    };
  }
  if (RETURN_STATES.includes(request.status)) {
    return {
      ...request,
      items: Array.isArray(request.items) ? request.items : [],
      photos: Array.isArray(request.photos) ? request.photos : [],
      history: Array.isArray(request.history) ? request.history : [],
    };
  }
  const status = order.status === 'Refund Requested' ? 'requested' : order.status === 'Refunded' ? 'refunded' : 'closed';
  return {
    legacy: true,
    type: 'return',
    status,
    items: [],
    reason: 'Other',
    details: String(request.reason || ''),
    photos: [],
    at: request.at || '',
    updatedAt: request.at || '',
    adminNote: '',
    history: [],
  };
};

export const isReturnOpen = (order) => RETURN_OPEN_STATES.includes(normalizeReturnRequest(order)?.status);

const pastRequestsOf = (order) => (Array.isArray(order?.pastReturnRequests) ? order.pastReturnRequests : []).filter((request) => request && typeof request === 'object');

/** Pieces of each order line (by index) in the given requests that reached one of `states`. */
const piecesByLine = (requests, states) => {
  const pieces = new Map();
  for (const request of requests) {
    if (!request || !states.includes(request.status)) continue;
    for (const item of Array.isArray(request.items) ? request.items : []) {
      const line = Number(item?.line);
      if (Number.isInteger(line) && line >= 0) pieces.set(line, (pieces.get(line) || 0) + Math.max(0, Math.floor(Number(item?.qty) || 0)));
    }
  }
  return pieces;
};

/** How many pieces of each order line (by index) can still go into a new request: bought minus already returned or exchanged. */
export const returnableQty = (order) => {
  const settled = piecesByLine([...pastRequestsOf(order), order?.returnRequest], RETURN_DONE_STATES);
  return (Array.isArray(order?.items) ? order.items : []).map((item, line) => Math.max(0, Math.max(1, Math.floor(Number(item?.quantity) || 1)) - (settled.get(line) || 0)));
};

const shortIndianDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** Why the customer cannot start a return / exchange now; an empty string means they can. */
export const returnBlockReason = (order, now = Date.now()) => {
  if (!order) return 'Order not found.';
  const current = normalizeReturnRequest(order);
  if (current && RETURN_OPEN_STATES.includes(current.status)) return 'A return / exchange request for this order is already with our team.';
  // An older request the store handled before item-level returns: what came back is not recorded.
  if (current && current.status === 'closed') return 'A return / exchange for this order has already been handled. For more help, please contact us on WhatsApp.';
  if (order.paymentStatus === 'Refunded' || order.status === 'Refunded') return 'This order has already been refunded.';
  if (order.status !== 'Delivered') return 'Returns and exchanges can be requested once the order has been delivered.';
  if (order.paymentStatus !== 'Paid') return 'Only paid orders can be returned or exchanged from your account.';
  if (returnableQty(order).every((qty) => qty <= 0)) {
    return 'Every piece of this order has already been returned or exchanged. For more help, please contact us on WhatsApp.';
  }
  if (pastRequestsOf(order).length + (current ? 1 : 0) >= RETURN_MAX_REQUESTS) {
    return 'This order has had several return requests already. Please contact us on WhatsApp.';
  }
  const end = returnWindowEndMs(order);
  if (end !== null && now > end) {
    return `The ${RETURN_WINDOW_DAYS}-day return / exchange window for this order ended on ${shortIndianDate(end)}.`;
  }
  return '';
};

/** Key of a return photo uploaded with a signature from this server (see api/orders.js), or null for any other URL. */
export const returnPhotoKey = (value, cloudName = process.env.CLOUDINARY_CLOUD_NAME || '') => {
  const url = String(value || '').trim();
  const cloud = String(cloudName || '');
  if (!url || url.length > 400 || !/^[A-Za-z0-9_-]+$/.test(cloud)) return null;
  const pattern = new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/image/upload/(?:v\\d+/)?${RETURN_PHOTO_FOLDER}/(rt_[a-f0-9]{24})\\.(?:jpe?g|png|webp|heic|heif)$`);
  const match = url.match(pattern);
  return match ? match[1] : null;
};

const lineName = (item) => cleanText(item?.product?.name, 120) || 'Item';

/**
 * Checks a customer's return / exchange form against the order (and, for exchanges, the live catalogue sizes).
 * input: { type: 'return' | 'exchange', items: [{ line, qty, exchangeSize? }], reason, details, photos: [url] }
 * options.products: Map of product id → { sizes } for the products that still exist; options.isPhotoUrl: url → boolean.
 * Pieces already returned or exchanged in earlier requests cannot be asked for again.
 * Returns the clean request fields, or throws a UserError the customer can act on.
 */
export const validateReturnInput = (order, input, { products = new Map(), isPhotoUrl = () => false } = {}) => {
  const type = input?.type === 'exchange' ? 'exchange' : input?.type === 'return' ? 'return' : '';
  if (!type) throw new UserError('Please choose return or exchange.');
  const reason = RETURN_REASONS.find((option) => option === String(input?.reason || '').trim());
  if (!reason) throw new UserError('Please choose a reason.');
  const details = cleanText(input?.details, 1000);
  if (reason === 'Other' && details.length < 5) throw new UserError('Please tell us a little more about the problem.');

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const raw = Array.isArray(input?.items) ? input.items : [];
  if (!raw.length) throw new UserError('Please choose at least one item.');
  if (raw.length > orderItems.length) throw new UserError('One of the chosen items is not in this order.');
  const left = returnableQty(order);
  const seen = new Set();
  const items = raw.map((entry) => {
    const line = Number(entry?.line);
    if (!Number.isInteger(line) || line < 0 || line >= orderItems.length || seen.has(line)) throw new UserError('One of the chosen items is not in this order.');
    seen.add(line);
    const item = orderItems[line];
    const name = lineName(item);
    const available = left[line];
    if (available <= 0) throw new UserError(`${name} has already been returned or exchanged. Please untick it.`);
    const qty = Number(entry?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > available) throw new UserError(`Please choose a quantity between 1 and ${available} for ${name}.`);
    const clearance = isClearanceLine(item);
    if (type === 'return' && clearance) {
      throw new UserError(`${name} was bought on clearance (50% or more off), so it can only be exchanged for another size.`);
    }
    const colour = cleanText(item?.selectedColor?.name, 60);
    const clean = {
      line,
      productId: cleanText(item?.product?.id, 120),
      name,
      image: cleanText(item?.product?.image || item?.product?.images?.[0], 400),
      size: cleanText(item?.selectedSize, 20),
      color: ['Default', 'Standard'].includes(colour) ? '' : colour,
      qty,
      price: Math.max(0, Math.round(Number(item?.product?.price) || 0)),
      clearance,
    };
    if (type === 'exchange') {
      const exchangeSize = cleanText(entry?.exchangeSize, 20);
      const product = products.get(clean.productId);
      const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
      if (exchangeSize) {
        // Like checkout: a product saved without sizes accepts the size shown in the shop.
        if (!product || (sizes.length > 0 && !sizes.includes(exchangeSize))) throw new UserError(`Size ${exchangeSize} is not offered for ${name}. Please choose another size.`);
      } else if (clearance) {
        throw new UserError(`Please choose the size you want for ${name}.`);
      } else if (details.length < 3) {
        throw new UserError(`Please choose the size you want for ${name}, or tell us in the note what you would like instead.`);
      }
      clean.exchangeSize = exchangeSize;
    }
    return clean;
  });

  const photos = [...new Set((Array.isArray(input?.photos) ? input.photos : []).map((url) => String(url || '').trim()).filter(Boolean))];
  if (photos.length > RETURN_MAX_PHOTOS) throw new UserError(`Please add at most ${RETURN_MAX_PHOTOS} photos.`);
  if (photos.some((url) => !isPhotoUrl(url))) throw new UserError('One of the photos could not be used. Please remove it and upload it again.');
  if (RETURN_PHOTO_REASONS.includes(reason) && !photos.length) throw new UserError('Please add at least one photo that shows the problem.');
  return { type, reason, details, items, photos };
};

/**
 * The admin's buttons: which request states each one is allowed from, and the state it moves to.
 * Approving needs the next steps written for the customer (the approval email carries them); rejecting needs the reason.
 */
export const RETURN_ACTIONS = {
  approve: { from: ['requested'], to: 'approved', noteRequired: 'Please write the next steps for the customer (for example how to send the piece back). They are emailed with the approval.' },
  reject: { from: ['requested', 'approved', 'received'], to: 'rejected', noteRequired: 'Please write a short note for the customer explaining why.' },
  receive: { from: ['approved'], to: 'received' },
  refund: { from: ['approved', 'received'], to: 'refunded', type: 'return' },
  exchange: { from: ['approved', 'received'], to: 'exchanged', type: 'exchange' },
};

const RETURN_TIMELINE = {
  requested: (label) => `${label} requested`,
  approved: (label) => `${label} approved`,
  rejected: (label) => `${label} rejected`,
  received: (label) => `${label} item received`,
  refunded: () => 'Refund issued',
  exchanged: () => 'Exchange completed',
};

/** Every piece of the order has now been returned and refunded (this request plus earlier refunded ones). */
const everyPieceRefunded = (order, request) => {
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  if (!orderItems.length) return false;
  const refunded = piecesByLine([...pastRequestsOf(order).filter((past) => past.type !== 'exchange'), request], ['refunded']);
  return orderItems.every((item, line) => (refunded.get(line) || 0) >= Math.max(1, Math.floor(Number(item?.quantity) || 1)));
};

/** An older request ({ reason, at }, or only the order status) as a whole-order request in the current shape. */
const upgradeLegacy = (order, request) => {
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const { legacy, ...rest } = request;
  return {
    ...rest,
    items: orderItems.map((item, line) => ({
      line,
      productId: cleanText(item?.product?.id, 120),
      name: lineName(item),
      image: cleanText(item?.product?.image || item?.product?.images?.[0], 400),
      size: cleanText(item?.selectedSize, 20),
      color: '',
      qty: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      price: Math.max(0, Math.round(Number(item?.product?.price) || 0)),
      clearance: isClearanceLine(item),
    })),
    history: [{ status: 'requested', at: request.at || '', note: '' }],
  };
};

/**
 * Applies one admin decision (approve / reject / receive / refund / exchange) to the order's request.
 * Returns { update, request } with the order fields to write, or throws a UserError.
 */
export const applyReturnAction = (order, action, { note = '', at = new Date().toISOString() } = {}) => {
  const rule = Object.hasOwn(RETURN_ACTIONS, action) ? RETURN_ACTIONS[action] : null;
  if (!rule) throw new UserError('Unknown return action.');
  let current = normalizeReturnRequest(order);
  if (!current) throw new UserError('This order has no return or exchange request.', 404);
  if (current.legacy) {
    if (current.status !== 'requested') throw new UserError('This older return request has already been handled.', 409);
    current = upgradeLegacy(order, current);
  }
  if (rule.type && current.type !== rule.type) {
    throw new UserError(current.type === 'exchange' ? 'This is an exchange request: mark it exchanged instead.' : 'This is a return request: mark it refunded instead.', 409);
  }
  if (!rule.from.includes(current.status)) throw new UserError(`This request is already ${current.status}, so it cannot be changed that way.`, 409);
  const adminNote = cleanText(note, 1000);
  if (rule.noteRequired && adminNote.length < 3) throw new UserError(rule.noteRequired);

  const next = rule.to;
  const request = {
    ...current,
    status: next,
    // The note belongs to this step only (shown to the customer and emailed with it); earlier notes stay in the history.
    adminNote,
    updatedAt: at,
    [`${next}At`]: at,
    history: [...(current.history || []), { status: next, at, note: adminNote }],
  };
  const label = current.type === 'exchange' ? 'Exchange' : 'Return';
  const update = { returnRequest: request, updatedAt: at };
  let timelineStatus = RETURN_TIMELINE[next](label);
  if (next === 'refunded' && everyPieceRefunded(order, request)) {
    // Every piece of the order came back and was refunded.
    update.status = 'Refunded';
    update.paymentStatus = 'Refunded';
    timelineStatus = 'Refunded';
  } else if (order.status === 'Refund Requested') {
    // An older request: the order goes back to Delivered and the request carries the return from now on.
    update.status = 'Delivered';
  }
  update.timeline = [...(Array.isArray(order.timeline) ? order.timeline : []), { status: timelineStatus, at, note: adminNote.slice(0, 300) }];
  return { update, request };
};

/**
 * When the admin sets a whole order to Refunded while a return request is still open, that request is
 * closed as refunded too (so the customer does not keep seeing it as under review). Null when nothing changes.
 */
export const closeReturnOnRefund = (order, at = new Date().toISOString()) => {
  let current = normalizeReturnRequest(order);
  if (!current || !RETURN_OPEN_STATES.includes(current.status) || current.type !== 'return') return null;
  if (current.legacy) current = upgradeLegacy(order, current);
  return {
    ...current,
    status: 'refunded',
    // An earlier step's note (e.g. how to send the piece back) no longer applies once the order is refunded.
    adminNote: '',
    updatedAt: at,
    refundedAt: at,
    history: [...(current.history || []), { status: 'refunded', at, note: 'Order marked Refunded' }],
  };
};

/** Notes on the request whether the store's email alert went out, so a missed alert shows in the admin panel. */
export const recordReturnRequestAlert = async (db, orderNumber, sent) => {
  const ref = db.collection('orders').doc(orderNumber);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const request = snap.exists ? snap.data().returnRequest : null;
    if (request && RETURN_STATES.includes(request.status)) tx.update(ref, { returnRequest: { ...request, storeNotified: Boolean(sent) } });
  });
};

/** One request as the customer sees it (see returnRequestView). */
const requestView = (request, owner) => {
  const base = {
    type: request.type === 'exchange' ? 'exchange' : 'return',
    status: request.status,
    at: request.at || '',
    updatedAt: request.updatedAt || request.at || '',
    items: request.items.map((item) => ({
      line: Number(item.line) || 0,
      name: item.name || '',
      image: item.image || '',
      size: item.size || '',
      qty: Number(item.qty) || 1,
      ...(item.exchangeSize ? { exchangeSize: item.exchangeSize } : {}),
    })),
    history: request.history.map((entry) => ({ status: entry.status, at: entry.at })),
    ...(request.legacy ? { legacy: true } : {}),
  };
  if (!owner) return base;
  return {
    ...base,
    reason: request.reason || '',
    details: request.details || '',
    photos: request.photos,
    adminNote: request.adminNote || '',
  };
};

/**
 * What the customer sees of their return / exchange request. Guests (order number + email / phone lookup)
 * get only the progress; the signed-in owner also gets the details, photos and the team's note for the current step.
 */
export const returnRequestView = (order, { owner = false } = {}) => {
  const request = normalizeReturnRequest(order);
  return request ? requestView(request, owner) : null;
};

/** The owner's earlier requests on this order (rejected or finished), oldest first, without photos. */
const pastRequestViews = (order) => pastRequestsOf(order)
  .filter((request) => RETURN_STATES.includes(request.status))
  .map((request) => {
    const { photos, ...view } = requestView(normalizeReturnRequest({ returnRequest: request }), true);
    return view;
  });

/** Tracking link the admin entered: https only, no credentials, at most 500 characters ('' clears it). */
export const cleanTrackingUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UserError('The tracking link must be a full https:// web address.');
  }
  if (raw.length > 500 || parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.')) {
    throw new UserError('The tracking link must be a full https:// web address.');
  }
  return parsed.href;
};

/** Expected delivery date the admin entered, as YYYY-MM-DD ('' clears it). */
export const cleanExpectedDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== raw || Number(match[1]) < 2024 || Number(match[1]) > 2100) {
    throw new UserError('Enter the expected delivery date as a real date.');
  }
  return raw;
};

// ---------------------------------------------------------------------------------------------
// What customers see of an order
// ---------------------------------------------------------------------------------------------

/** The customer's cancellation request: guests get only its progress; the reason (free text that can hold a phone number or address) is for the owner. */
const cancelRequestView = (order, { owner = false } = {}) => (order.cancelRequest
  ? {
    ...(owner ? { reason: order.cancelRequest.reason || '' } : {}),
    at: order.cancelRequest.at || '',
    ...(order.cancelRequest.handledAt ? { handledAt: order.cancelRequest.handledAt, outcome: order.cancelRequest.outcome || 'kept' } : {}),
  }
  : null);

/**
 * Guest lookup (order number + the email or phone used at checkout): progress, courier details and the
 * items, but never the address, phone, email, name or payment references.
 */
export const publicOrderView = (order) => ({
  orderNumber: order.orderNumber,
  date: order.date,
  status: order.status,
  paymentStatus: order.paymentStatus,
  items: (order.items || []).map((item) => {
    const image = item?.product?.image || item?.product?.images?.[0] || '';
    return {
      id: item?.id || '',
      product: {
        id: item?.product?.id || '',
        name: item?.product?.name || 'Item',
        image,
        images: image ? [image] : [],
        price: Number(item?.product?.price) || 0,
        originalPrice: Number(item?.product?.originalPrice) || Number(item?.product?.price) || 0,
      },
      selectedSize: item?.selectedSize || '',
      selectedColor: { name: item?.selectedColor?.name || '', hex: item?.selectedColor?.hex || '' },
      quantity: Number(item?.quantity) || 1,
    };
  }),
  subtotal: order.subtotal || 0,
  couponCode: order.couponCode || '',
  couponDiscount: order.couponDiscount || 0,
  comboDiscount: order.comboDiscount || 0,
  prepaidDiscount: order.prepaidDiscount || 0,
  discountAmount: order.discountAmount || 0,
  shippingCharge: order.shippingCharge || 0,
  finalTotal: order.finalTotal || 0,
  trackingNumber: order.trackingNumber || '',
  courierPartner: order.courierPartner || '',
  trackingUrl: order.trackingUrl || '',
  expectedDeliveryDate: order.expectedDeliveryDate || '',
  // Estimate from the owner's delivery days when the order was placed; the admin's expected date wins when set
  // (older orders may hold an automatic date that was never the owner's: only 'settings' estimates are shown).
  estimatedDeliveryDate: !order.expectedDeliveryDate && order.deliveryEstimateSource === 'settings' ? String(order.estimatedDeliveryDate || '') : '',
  customerNote: order.customerNote || '',
  // The delivery executive is shown only while the parcel is out for delivery
  ...(order.status === 'Out for Delivery' && (order.deliveryAgentName || order.deliveryAgentPhone)
    ? { deliveryAgentName: order.deliveryAgentName || '', deliveryAgentPhone: order.deliveryAgentPhone || '' }
    : {}),
  // Status and time only: notes can hold internal remarks.
  timeline: (order.timeline || []).map((entry) => ({ status: String(entry?.status || ''), at: String(entry?.at || '') })),
  paidAt: order.paidAt || '',
  returnRequest: returnRequestView(order),
  cancelRequest: cancelRequestView(order),
});

/**
 * What the order's owner sees (signed in with the order's email, or the payer right after a verified
 * payment): the guest view plus the full items, delivery address, contact, payment reference, the full
 * return request (and earlier ones), the cancellation reason and whether a return / exchange can be started.
 */
export const ownerOrderView = (order) => {
  const a = order.deliveryAddress || null;
  const blocked = returnBlockReason(order);
  return {
    ...publicOrderView(order),
    items: order.items || [],
    paymentMethod: order.paymentMethod || 'razorpay',
    paymentRef: order.paymentRef || '',
    customerName: order.customerName || '',
    customerEmail: order.customerEmail || '',
    customerMobile: order.customerMobile ? `••••••${String(order.customerMobile).slice(-4)}` : '',
    giftNote: order.giftNote || '',
    deliveryAddress: a
      ? {
        fullName: a.fullName || '',
        mobile: a.mobile || '',
        email: a.email || '',
        houseFlat: a.houseFlat || '',
        street: a.street || '',
        area: a.area || '',
        city: a.city || '',
        state: a.state || '',
        pincode: a.pincode || '',
      }
      : null,
    returnRequest: returnRequestView(order, { owner: true }),
    pastReturnRequests: pastRequestViews(order),
    cancelRequest: cancelRequestView(order, { owner: true }),
    // remaining: pieces of each order line (by index) that can still go into a request.
    returnEligibility: { canRequest: !blocked, reason: blocked, windowEndsAt: returnWindowEndsAt(order), remaining: returnableQty(order) },
  };
};
