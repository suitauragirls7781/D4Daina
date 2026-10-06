import { createHash } from 'node:crypto';
import { firestore } from './_lib/firebaseAdmin.js';
import { cleanText, getIdentity, isSameOrigin, isValidEmail, parseBody, reply } from './_lib/http.js';
import { escapeHtml, layout, sendEmail } from './_lib/email.js';

// Price-drop and back-in-stock emails, built only from real changes:
// the server remembers each product's last price/availability (alert_state) and compares with the
// live product. Nothing is sent on the first check, and every alert is sent at most once.

const SITE_URL = 'https://www.suitauragirls.in';
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const hash = (v) => createHash('sha256').update(v).digest('hex').slice(0, 32);
const available = (p) => p && p.hidden !== true && p.inStock !== false && Number(p.stockQuantity || 0) > 0;

const readFeatures = async (db) => {
  try {
    const snap = await db.collection('storefront_settings').doc('discovery').get();
    const f = snap.exists ? JSON.parse(snap.data().value_json || '{}').features || {} : {};
    return { priceDrop: f.priceDropAlerts !== false, restock: f.backInStockAlerts !== false };
  } catch {
    return { priceDrop: true, restock: true };
  }
};

const productBlock = (p, line) => {
  const img = (p.images || [])[0] || p.image || '';
  return `${img ? `<p style="margin:0 0 16px"><img src="${escapeHtml(img)}" alt="" width="220" style="border-radius:12px;max-width:100%"></p>` : ''}
<p style="margin:0 0 8px;font-size:16px"><strong>${escapeHtml(p.name)}</strong></p>
<p style="margin:0 0 20px;font-size:15px">${line}</p>
<p style="margin:0 0 8px"><a href="${SITE_URL}/product/${encodeURIComponent(p.id)}" style="display:inline-block;background:#0B1F3F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:1px">VIEW PRODUCT</a></p>`;
};

/** Compares the live product with what was last recorded and sends the alerts that are due. */
export const checkProduct = async (db, productId) => {
  const snap = await db.collection('products').doc(productId).get();
  if (!snap.exists) return { skipped: 'missing' };
  const p = { id: snap.id, ...snap.data() };
  const stateRef = db.collection('alert_state').doc(productId);
  const state = (await stateRef.get()).data();
  const now = new Date().toISOString();
  const current = { price: Number(p.price) || 0, available: available(p), updatedAt: now };
  await stateRef.set(current);
  if (!state) return { initialised: true };

  const features = await readFeatures(db);
  const sent = { priceDrop: 0, restock: 0 };

  // Price drop: only a real decrease, only to customers who saved it to their wishlist
  if (features.priceDrop && current.price > 0 && current.price < Number(state.price) && current.available) {
    const profiles = await db.collection('profiles').limit(5000).get();
    for (const doc of profiles.docs) {
      const prof = doc.data();
      if (!isValidEmail(prof.email || doc.id)) continue;
      if (!(prof.wishlist || []).some((w) => String(w?.id) === productId)) continue;
      const key = hash(`${doc.id}|${productId}|${current.price}`);
      const logRef = db.collection('alert_log').doc(`price_${key}`);
      if ((await logRef.get()).exists) continue;
      try {
        await sendEmail({
          to: prof.email || doc.id,
          name: prof.fullName || '',
          subject: `Price drop: ${p.name} is now ${inr(current.price)}`,
          html: layout('A wishlist favourite just got cheaper', productBlock(p, `Your wishlist item dropped from <s>${inr(state.price)}</s> to <strong>${inr(current.price)}</strong>.`)),
          text: `Your wishlist item ${p.name} dropped from ${inr(state.price)} to ${inr(current.price)}. ${SITE_URL}/product/${productId}`,
        });
        await logRef.set({ kind: 'price_drop', productId, email: prof.email || doc.id, from: state.price, to: current.price, at: now });
        sent.priceDrop += 1;
      } catch (error) {
        console.error('Price-drop email failed:', error?.message);
      }
    }
  }

  // Back in stock: product became available again
  if (features.restock && current.available && state.available === false) {
    const waiting = await db.collection('stock_alerts').where('productId', '==', productId).where('status', '==', 'waiting').limit(1000).get();
    for (const doc of waiting.docs) {
      const a = doc.data();
      const sizeOk = !a.size || (p.sizes || []).map(String).includes(a.size);
      if (!sizeOk) continue;
      try {
        await sendEmail({
          to: a.email,
          subject: `Back in stock: ${p.name}`,
          html: layout('It’s back in stock', productBlock(p, `${escapeHtml(p.name)}${a.size ? ` (size ${escapeHtml(a.size)})` : ''} is available again at <strong>${inr(p.price)}</strong>. Stock is limited.`)),
          text: `${p.name} is back in stock at ${inr(p.price)}. ${SITE_URL}/product/${productId}`,
        });
        await doc.ref.update({ status: 'sent', sentAt: now });
        sent.restock += 1;
      } catch (error) {
        console.error('Restock email failed:', error?.message);
      }
    }
  }
  return { sent };
};

export default async function handler(req, res) {
  // Shared wishlist (read-only list of product ids; no customer details are stored or returned)
  if (req.method === 'GET') {
    const id = String(req.query?.wishlist || '').replace(/[^a-f0-9]/g, '').slice(0, 20);
    if (!id) return reply(res, 400, { error: 'Wishlist link is invalid.' });
    const snap = await firestore().collection('shared_wishlists').doc(id).get();
    if (!snap.exists) return reply(res, 404, { error: 'This wishlist link has expired or does not exist.' });
    return reply(res, 200, { productIds: snap.data().productIds || [] });
  }
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Forbidden.' });
  const body = parseBody(req);
  const db = firestore();

  try {
    // Customer (or guest with an email) asks to be told when a product is back
    if (body.action === 'restock-subscribe') {
      const identity = await getIdentity(req);
      const email = (identity.email || cleanText(body.email, 160)).toLowerCase();
      if (!isValidEmail(email)) return reply(res, 400, { error: 'Please enter a valid email address.' });
      const productId = cleanText(body.productId, 60);
      const size = cleanText(body.size, 12);
      const colour = cleanText(body.colour, 40);
      const product = await db.collection('products').doc(productId).get();
      if (!product.exists || product.data().hidden === true) return reply(res, 404, { error: 'Product not found.' });
      const id = hash(`${email}|${productId}|${size}|${colour}`);
      await db.collection('stock_alerts').doc(id).set({ email, productId, productName: product.data().name || '', size, colour, status: 'waiting', createdAt: new Date().toISOString() });
      // Make sure the product's current state is recorded, so the return to stock is noticed
      const stateRef = db.collection('alert_state').doc(productId);
      if (!(await stateRef.get()).exists) {
        const p = product.data();
        await stateRef.set({ price: Number(p.price) || 0, available: available(p), updatedAt: new Date().toISOString() });
      }
      return reply(res, 200, { ok: true });
    }

    if (body.action === 'share-wishlist') {
      const ids = [...new Set((Array.isArray(body.productIds) ? body.productIds : []).map((x) => cleanText(String(x), 60)).filter(Boolean))].slice(0, 50);
      if (!ids.length) return reply(res, 400, { error: 'Your wishlist is empty.' });
      const snaps = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));
      const valid = snaps.filter((snap) => snap.exists && snap.data().hidden !== true).map((snap) => snap.id);
      if (!valid.length) return reply(res, 400, { error: 'None of these styles are available.' });
      const id = hash(`${valid.join('|')}`).slice(0, 16);
      await db.collection('shared_wishlists').doc(id).set({ productIds: valid, createdAt: new Date().toISOString() });
      return reply(res, 200, { id });
    }

    // Admin saved a product (price or stock may have changed)
    if (body.action === 'check-product') {
      const identity = await getIdentity(req);
      if (!identity.admin) return reply(res, 401, { error: 'Admin only.' });
      const productId = cleanText(body.productId, 60);
      if (!productId) return reply(res, 400, { error: 'Product required.' });
      return reply(res, 200, { ok: true, ...(await checkProduct(db, productId)) });
    }

    return reply(res, 400, { error: 'Invalid action.' });
  } catch (error) {
    console.error('Alerts API error:', error?.message || error);
    return reply(res, 500, { error: 'Could not process the request.' });
  }
}
