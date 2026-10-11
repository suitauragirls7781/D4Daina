import { createHash, createHmac, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from './_lib/firebaseAdmin.js';
import { cleanText, clientIp, getIdentity, isSameOrigin, parseBody, reply } from './_lib/http.js';
import { createMediaGrant, deleteMedia, mediaImage } from './_lib/media.js';
import { emailVariants } from './_lib/emailFix.js';

// Product reviews from the storefront. Every review waits for the admin's approval (status 'pending').
// "Verified purchase" is decided here, never by the browser: only a signed-in customer whose paid order
// contains the product gets it. Reviews are publicly readable, so no email is stored on them; a signed-in
// customer's review id is a keyed hash of email + product, which makes a second submission update the first.
//
// Review photos: every upload signature is for one server-chosen public id, recorded in the server-only
// `review_photos` collection ({ owner, reviewId, url }). A photo is attached only to its owner's review and
// only ever deleted through that record, never because of what a review document says.

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const LIMITS = { submitPerIp: 12, helpfulPerIp: 60, signPerCustomer: 10, signPerIp: 30 };
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const DAY_MS = 24 * 60 * 60 * 1000;
// Photo ids keep the form they had on the old image host ("suitauragirls/reviews/<key>"), so existing reviews still match
const PHOTO_FOLDER = 'suitauragirls/reviews';
const PHOTO_FORMATS = 'jpg,png,webp,heic,heif';
const PHOTO_KEY = /^rv_[a-f0-9]{24}$/;

const hash = (value, length = 24) => createHash('sha256').update(value).digest('hex').slice(0, length);
const today = () => new Date().toISOString().slice(0, 10);

/** Key of a server-issued review photo from its photo id, or null for any other image. */
const photoKeyOf = (photoId) => {
  const key = String(photoId || '').startsWith(`${PHOTO_FOLDER}/`) ? String(photoId).slice(PHOTO_FOLDER.length + 1) : '';
  return PHOTO_KEY.test(key) ? key : null;
};

class ReviewError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Review text keeps its line breaks (at most one blank line); other control characters become spaces. */
export const cleanComment = (value) => String(value ?? '')
  .slice(0, 4000)
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/**
 * A review photo stored by this store (media.suitauragirls.in, folder "reviews"): returns its address and
 * photo id, or null for any other URL.
 */
export const reviewPhoto = (value) => {
  const photo = mediaImage(value, 'reviews');
  return photo ? { url: photo.url, photoId: `${PHOTO_FOLDER}/${photo.id}` } : null;
};

/**
 * Id of a signed-in customer's review of a product. Keyed with the server's private key, so nobody can
 * check a guessed email address against the public reviews.
 */
const customerReviewId = (email, productId) => {
  let secret = '';
  try {
    secret = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').private_key || '';
  } catch {
    secret = '';
  }
  return `rv_${createHmac('sha256', secret || 'suitauragirls-reviews').update(`${email}|${productId}`).digest('hex').slice(0, 32)}`;
};

/**
 * Permission to upload exactly one photo under a server-chosen id in the "reviews" folder (see
 * api/_lib/media.js): it cannot be used for more photos, and it stops working after 30 minutes.
 */
const photoUploadSignature = (key) => createMediaGrant('reviews', 'image', { id: key });

/**
 * Deletes a review photo from storage, but only when the server's own record binds it to `reviewId`.
 * The URL comes from that record (checked when the photo was attached), never from the review document.
 */
const destroyReviewPhoto = async (db, key, reviewId) => {
  const ref = db.collection('review_photos').doc(key);
  const record = (await ref.get()).data();
  if (!record || record.reviewId !== reviewId) return false;
  const photo = reviewPhoto(record.url);
  if (!photo || photo.photoId !== `${PHOTO_FOLDER}/${key}`) return false;
  await deleteMedia(photo.url);
  await ref.delete();
  return true;
};

/** Daily counter per key (an IP or customer hash); false once `limit` is reached. Shared across instances. */
const withinDailyLimit = async (db, key, limit) => {
  const day = today();
  const ref = db.collection('rate_limits').doc(`reviews_${day}_${key}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((Number(snap.data()?.count) || 0) >= limit) return false;
    tx.set(ref, { day, count: FieldValue.increment(1), expiresAt: new Date(Date.now() + 2 * DAY_MS) }, { merge: true });
    return true;
  });
};

const reviewPhotosEnabled = async (db) => {
  try {
    const snap = await db.collection('storefront_settings').doc('discovery').get();
    const features = snap.exists ? JSON.parse(snap.data().value_json || '{}').features || {} : {};
    return features.reviewPhotos !== false;
  } catch {
    return false;
  }
};

/** The line of a paid order from this customer that contains the product, or null. */
const paidOrderLine = async (db, email, productId) => {
  const snapshot = await db.collection('orders').where('customerEmail', 'in', emailVariants(email)).limit(300).get();
  for (const doc of snapshot.docs) {
    const order = doc.data();
    if (order.paymentStatus !== 'Paid') continue;
    const line = (Array.isArray(order.items) ? order.items : []).find((item) => String(item?.product?.id ?? '') === productId);
    if (line) return line;
  }
  return null;
};

/** Same rule as the admin panel: product rating = average of its approved reviews. */
const syncProductRating = async (db, productId) => {
  const snapshot = await db.collection('reviews').where('productId', '==', productId).where('status', '==', 'approved').get();
  const ratings = snapshot.docs.map((doc) => Number(doc.data().rating) || 0);
  const reviewCount = ratings.length;
  const rating = reviewCount ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / reviewCount) * 10) / 10 : 0;
  await db.collection('products').doc(productId).update({ rating, reviewCount });
};

export const actions = {
  async submit(db, body, req) {
    const productId = cleanText(body.productId, 120);
    if (!ID.test(productId)) throw new ReviewError('This product could not be found.', 404);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('Please choose a rating from 1 to 5 stars.');
    const userName = cleanText(body.userName, 200).replace(/\s+/g, ' ');
    if (userName.length < 2 || userName.length > 60) throw new ReviewError('Please enter your name (2 to 60 characters).');
    const comment = cleanComment(body.comment);
    if (comment.length < 10) throw new ReviewError('Please write at least 10 characters about the product.');
    if (comment.length > 1000) throw new ReviewError('Please keep your review within 1000 characters.');

    const { email } = await getIdentity(req);
    let photo = null;
    if (body.photoUrl) {
      if (!email) throw new ReviewError('Please sign in to add a photo to your review.', 401);
      photo = reviewPhoto(body.photoUrl);
      // Only a photo uploaded with a signature this server issued (checked against its record below)
      const key = photo ? photoKeyOf(photo.photoId) : null;
      if (!key) throw new ReviewError('That photo could not be used. Please upload it again.');
      photo = { ...photo, key };
      // If the owner switched review photos off meanwhile, the review is kept without the photo
      if (!(await reviewPhotosEnabled(db))) photo = null;
    }

    if (!(await withinDailyLimit(db, `submit_${hash(clientIp(req))}`, LIMITS.submitPerIp))) {
      throw new ReviewError('Too many reviews from this network today. Please try again tomorrow.', 429);
    }
    const productSnap = await db.collection('products').doc(productId).get();
    if (!productSnap.exists || productSnap.data().hidden === true) throw new ReviewError('This product could not be found.', 404);

    const line = email ? await paidOrderLine(db, email, productId) : null;
    const sizePurchased = line ? cleanText(line.selectedSize, 20) : '';
    const now = new Date().toISOString();
    const review = {
      productId,
      productName: cleanText(productSnap.data().name, 200),
      userName,
      rating,
      comment,
      status: 'pending',
      verifiedPurchase: Boolean(line),
      date: now,
      updatedAt: now,
      source: 'storefront',
    };

    if (!email) {
      const ref = db.collection('reviews').doc();
      await ref.set({ ...review, createdAt: now, helpfulCount: 0 });
      return { ok: true, verifiedPurchase: false, updated: false };
    }

    const ref = db.collection('reviews').doc(customerReviewId(email, productId));
    const photoRef = photo ? db.collection('review_photos').doc(photo.key) : null;

    // One review per signed-in customer per product: a new submission replaces the earlier text
    // (keeping its helpful votes and the store's reply) and goes back to moderation.
    const previous = await db.runTransaction(async (tx) => {
      const [snap, photoSnap] = photoRef ? await tx.getAll(ref, photoRef) : [await tx.get(ref)];
      if (photoRef) {
        // The photo must have been signed for this customer, and belongs to one review only
        const record = photoSnap?.data();
        if (!record || record.owner !== hash(email) || (record.reviewId && record.reviewId !== ref.id)) {
          throw new ReviewError('That photo could not be used. Please upload it again.');
        }
        tx.update(photoRef, { reviewId: ref.id, url: photo.url, attachedAt: now });
      }
      const old = snap.exists ? snap.data() : null;
      tx.set(ref, {
        ...review,
        ...(old ? {} : { createdAt: now, helpfulCount: 0 }),
        imageUrl: photo ? photo.url : FieldValue.delete(),
        photoId: photo ? photo.photoId : FieldValue.delete(),
        sizePurchased: sizePurchased || FieldValue.delete(),
      }, { merge: true });
      return old;
    });

    // A replaced photo goes, but only if the server's record says it was uploaded for this review
    const oldKey = photoKeyOf(previous?.photoId);
    if (oldKey && oldKey !== photo?.key) {
      await destroyReviewPhoto(db, oldKey, ref.id).catch((error) => console.warn('Old review photo not deleted:', error?.message));
    }
    // An approved review that was edited is hidden until re-approved, so the product's rating must drop it
    if (previous?.status === 'approved') {
      await syncProductRating(db, productId).catch((error) => console.error('Product rating sync failed:', error?.message));
    }
    return { ok: true, verifiedPurchase: Boolean(line), updated: Boolean(previous) };
  },

  async helpful(db, body, req) {
    const reviewId = cleanText(body.reviewId, 120);
    if (!ID.test(reviewId)) throw new ReviewError('This review is not available.', 404);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    if (!ua || BOT.test(ua)) throw new ReviewError('Forbidden.', 403);
    const ip = clientIp(req);
    const day = today();
    const reviewRef = db.collection('reviews').doc(reviewId);
    const voteRef = db.collection('review_votes').doc(hash(`${reviewId}|${ip}|${ua}`, 32));
    const ipRef = db.collection('rate_limits').doc(`reviews_${day}_helpful_${hash(ip)}`);
    return db.runTransaction(async (tx) => {
      const [reviewSnap, voteSnap, ipSnap] = await tx.getAll(reviewRef, voteRef, ipRef);
      if (!reviewSnap.exists || reviewSnap.data().status !== 'approved') throw new ReviewError('This review is not available.', 404);
      const current = Math.max(0, Number(reviewSnap.data().helpfulCount) || 0);
      // Each visitor (IP + browser) counts once per review
      if (voteSnap.exists) return { ok: true, counted: false, helpfulCount: current };
      if ((Number(ipSnap.data()?.count) || 0) >= LIMITS.helpfulPerIp) throw new ReviewError('Too many votes from this network today.', 429);
      tx.set(voteRef, { reviewId, createdAt: new Date().toISOString() });
      tx.set(ipRef, { day, count: FieldValue.increment(1), expiresAt: new Date(Date.now() + 2 * DAY_MS) }, { merge: true });
      tx.update(reviewRef, { helpfulCount: FieldValue.increment(1) });
      return { ok: true, counted: true, helpfulCount: current + 1 };
    });
  },

  // Signature for one direct browser upload of one photo to suitauragirls/reviews (signed-in customers only)
  async 'photo-sign'(db, body, req) {
    const { email } = await getIdentity(req);
    if (!email) throw new ReviewError('Please sign in to add a photo to your review.', 401);
    if (!(await reviewPhotosEnabled(db))) throw new ReviewError('Photos in reviews are turned off right now.', 403);
    if (!(await withinDailyLimit(db, `sign_${hash(email)}`, LIMITS.signPerCustomer))
      || !(await withinDailyLimit(db, `signip_${hash(clientIp(req))}`, LIMITS.signPerIp))) {
      throw new ReviewError('You have reached today’s photo upload limit. Please try again tomorrow.', 429);
    }
    const key = `rv_${randomBytes(12).toString('hex')}`;
    let signed;
    try {
      signed = photoUploadSignature(key);
    } catch {
      throw new ReviewError('Photo upload is not available right now. You can still post your review without a photo.', 503);
    }
    await db.collection('review_photos').doc(key).create({ owner: hash(email), reviewId: '', issuedAt: new Date().toISOString() });
    return signed;
  },

  // Admin: after a review is deleted, deletes the photos the server attached to it (see destroyReviewPhoto)
  async 'remove-photos'(db, body, req) {
    const { admin } = await getIdentity(req);
    if (!admin) throw new ReviewError('Admin session expired. Please sign in again.', 401);
    const reviewId = cleanText(body.reviewId, 120);
    if (!ID.test(reviewId)) throw new ReviewError('This review is not available.', 404);
    if ((await db.collection('reviews').doc(reviewId).get()).exists) throw new ReviewError('Delete the review first.', 409);
    const records = await db.collection('review_photos').where('reviewId', '==', reviewId).limit(10).get();
    let removed = 0;
    for (const doc of records.docs) {
      if (await destroyReviewPhoto(db, doc.id, reviewId)) removed += 1;
    }
    return { ok: true, removed };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Forbidden.' });
  const body = parseBody(req);
  const action = typeof body.action === 'string' && Object.hasOwn(actions, body.action) ? actions[body.action] : null;
  if (!action) return reply(res, 400, { error: 'Unknown action.' });
  try {
    return reply(res, 200, await action(firestore(), body, req));
  } catch (error) {
    if (error instanceof ReviewError) return reply(res, error.status, { error: error.message });
    console.error('Review request failed:', error?.message || error);
    return reply(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
