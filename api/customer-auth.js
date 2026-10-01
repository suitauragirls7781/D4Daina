import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { createCustomerFirebaseToken, firebaseApp, firestore } from './_lib/firebaseAdmin.js';
import { cleanText, clientIp, isSameOrigin, isValidEmail, parseBody, reply } from './_lib/http.js';
import { sendOtpEmail } from './_lib/email.js';

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_DAY = 8;
const MAX_SENDS_PER_IP_HOUR = 15;
const PURPOSES = ['signup', 'login'];

// One OTP document per email + purpose, only reachable through the Admin SDK.
const otpDoc = (db, email, purpose) => db.collection('customer_email_otps').doc(`${email}__${purpose}`);

const hashCode = (email, purpose, code) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
  .update(`${email}:${purpose}:${code}`)
  .digest('hex');

const safeCompare = (actual, expected) => {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected || '', 'hex');
  return actualBuffer.length === expectedBuffer.length && actualBuffer.length > 0 && timingSafeEqual(actualBuffer, expectedBuffer);
};

const ipAllowed = async (db, ip) => {
  const ref = db.collection('rate_limits').doc(`otp_ip:${ip}`.replace(/[^A-Za-z0-9_.:-]/g, '_'));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    if (!data || now - data.windowStart > 60 * 60 * 1000) {
      tx.set(ref, { windowStart: now, count: 1, expiresAt: new Date(now + 60 * 60 * 1000) });
      return true;
    }
    if (data.count >= MAX_SENDS_PER_IP_HOUR) return false;
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
};

class OtpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.userFacing = true;
  }
}

const sendCode = async (db, req, email, purpose, name) => {
  if (!(await ipAllowed(db, clientIp(req)))) throw new OtpError('Too many codes requested from this network. Please try again later.', 429);
  const ref = otpDoc(db, email, purpose);
  const code = String(randomInt(100000, 1000000));
  const now = Date.now();

  // Reserve the send inside a transaction so parallel requests cannot bypass the cooldown.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : null;
    if (previous?.locked_until && previous.locked_until > now) {
      throw new OtpError('Too many incorrect attempts. Please try again in 30 minutes.', 429);
    }
    if (previous?.sent_at_ms && now - previous.sent_at_ms < RESEND_COOLDOWN_MS) {
      throw new OtpError('Please wait 30 seconds before requesting another code.', 429);
    }
    const recentSends = (previous?.sends || []).filter((at) => now - at < 24 * 60 * 60 * 1000);
    if (recentSends.length >= MAX_SENDS_PER_DAY) throw new OtpError('Daily limit for verification codes reached. Please try again tomorrow.', 429);
    const stillValid = previous && previous.expires_at_ms > now;
    tx.set(ref, {
      email,
      purpose,
      code_hash: hashCode(email, purpose, code),
      // Wrong guesses carry over to the new code while the previous one was still live.
      attempts: stillValid ? Number(previous.attempts) || 0 : 0,
      sent_at_ms: now,
      expires_at_ms: now + OTP_LIFETIME_MS,
      sends: [...recentSends, now],
      locked_until: 0,
    });
  });

  try {
    await sendOtpEmail({ email, name, code, purpose });
  } catch (error) {
    await ref.update({ sent_at_ms: 0 }).catch(() => {});
    throw error;
  }
};

const verifyCode = async (db, email, purpose, code) => {
  const ref = otpDoc(db, email, purpose);
  const now = Date.now();
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const record = snap.exists ? snap.data() : null;
    if (!record || !record.code_hash) return 'invalid';
    if (record.locked_until && record.locked_until > now) return 'locked';
    if (record.expires_at_ms <= now) {
      tx.update(ref, { code_hash: '' });
      return 'expired';
    }
    if (!safeCompare(hashCode(email, purpose, code), record.code_hash)) {
      const attempts = (Number(record.attempts) || 0) + 1;
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        tx.update(ref, { attempts, code_hash: '', locked_until: now + LOCKOUT_MS });
        return 'locked';
      }
      tx.update(ref, { attempts });
      return 'wrong';
    }
    // Single use: the code is burned the moment it succeeds.
    tx.update(ref, { code_hash: '', attempts: 0 });
    return 'ok';
  });
  if (outcome === 'ok') return;
  if (outcome === 'locked') throw new OtpError('Too many incorrect attempts. Please request a new code in 30 minutes.', 429);
  if (outcome === 'wrong') throw new OtpError('Incorrect code. Check your email and try again.');
  throw new OtpError('This code is invalid or has expired. Please request a new code.');
};

/** Creates or updates the server-side customer record, then returns it. */
const upsertCustomer = async (db, email, { name, phone }) => {
  const ref = db.collection('customers').doc(email);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const existing = snap.exists ? snap.data() : {};
  const record = {
    email,
    name: existing.name || name || '',
    phone: existing.phone || phone || '',
    status: existing.status || 'active',
    createdAt: existing.createdAt || now,
    lastLoginAt: now,
    updatedAt: now,
  };
  if (name && !existing.name) record.name = name;
  if (phone && !existing.phone) record.phone = phone;
  await ref.set(record, { merge: true });

  // Seed the customer's own profile document (cart, wishlist, address live there).
  const profileRef = db.collection('profiles').doc(email);
  const profile = await profileRef.get();
  const profileData = profile.exists ? profile.data() : {};
  const seed = { email, updatedAt: now };
  if (!profileData.fullName && record.name) seed.fullName = record.name;
  if (!profileData.phone && record.phone) seed.phone = record.phone;
  await profileRef.set(seed, { merge: true });
  return record;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Cross-origin request rejected.' });

  try {
    if (!process.env.ADMIN_SESSION_SECRET) throw new Error('SERVER_CONFIG_MISSING');
    const db = firestore();
    const body = parseBody(req);

    // "Continue with Google": the browser signs in with Google on a throwaway Firebase app and sends that ID token.
    // Only a Google-verified email is accepted; the customer then gets the same session as after an email code.
    if (body.action === 'google') {
      let decoded;
      try {
        decoded = await getAuth(firebaseApp()).verifyIdToken(String(body.idToken || ''));
      } catch {
        return reply(res, 401, { error: 'Google sign-in could not be verified. Please try again.' });
      }
      const googleEmail = String(decoded.email || '').toLowerCase();
      if (decoded.firebase?.sign_in_provider !== 'google.com' || decoded.email_verified !== true || !isValidEmail(googleEmail)) {
        return reply(res, 401, { error: 'Please use a Google account with a verified email.' });
      }
      const customer = await upsertCustomer(db, googleEmail, { name: cleanText(decoded.name, 100), phone: '' });
      const firebaseToken = await createCustomerFirebaseToken(googleEmail);
      // The Google-only Firebase user was just a bridge; the customer session uses the c_ account
      getAuth(firebaseApp()).deleteUser(decoded.uid).catch(() => {});
      return reply(res, 200, {
        success: true,
        verified: true,
        email: googleEmail,
        firebaseToken,
        customer: { name: customer.name, phone: customer.phone, createdAt: customer.createdAt },
      });
    }

    const email = cleanText(body.email, 160).toLowerCase();
    const purpose = PURPOSES.includes(body.purpose) ? body.purpose : 'login';
    if (!isValidEmail(email)) return reply(res, 400, { error: 'Enter a valid email address.' });

    if (body.action === 'send') {
      await sendCode(db, req, email, purpose, cleanText(body.name, 100) || 'Customer');
      return reply(res, 200, { success: true, expiresInSeconds: OTP_LIFETIME_MS / 1000, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 });
    }

    if (body.action === 'verify') {
      const code = String(body.code || '').trim();
      if (!/^\d{6}$/.test(code)) return reply(res, 400, { error: 'Enter the complete 6-digit code.' });
      await verifyCode(db, email, purpose, code);
      const phone = String(body.phone || '').replace(/\D/g, '').slice(-10);
      const customer = await upsertCustomer(db, email, {
        name: cleanText(body.name, 100),
        phone: /^[6-9]\d{9}$/.test(phone) ? phone : '',
      });
      const firebaseToken = await createCustomerFirebaseToken(email);
      return reply(res, 200, {
        success: true,
        verified: true,
        email,
        firebaseToken,
        customer: { name: customer.name, phone: customer.phone, createdAt: customer.createdAt },
      });
    }

    return reply(res, 400, { error: 'Invalid OTP action.' });
  } catch (error) {
    if (error?.userFacing) return reply(res, error.status, { error: error.message });
    const message = error?.message || 'OTP request failed.';
    console.error('Customer OTP API error:', message);
    if (message === 'SERVER_CONFIG_MISSING') return reply(res, 503, { error: 'Email verification is temporarily unavailable.' });
    if (message === 'EMAIL_NOT_CONFIGURED') return reply(res, 503, { error: 'Email verification is not configured yet. Please contact support.' });
    if (message === 'EMAIL_DELIVERY_FAILED') return reply(res, 502, { error: 'Could not deliver the verification email. Please try again later.' });
    return reply(res, 500, { error: 'Verification request failed. Please try again.' });
  }
}
