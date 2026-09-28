import { firestore } from './_lib/firebaseAdmin.js';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

const reply = (res, status, body) => {
  res.status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
};

// One OTP document per email + purpose, only reachable through the Admin SDK.
const otpDoc = (email, purpose) => firestore().collection('customer_email_otps').doc(`${email}__${purpose}`);

const hashCode = (email, purpose, code) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
  .update(`${email}:${purpose}:${code}`)
  .digest('hex');

const safeCompare = (actual, expected) => {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected || '', 'hex');
  return actualBuffer.length === expectedBuffer.length && actualBuffer.length > 0 && timingSafeEqual(actualBuffer, expectedBuffer);
};

const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
};

const isSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host);
  } catch {
    return false;
  }
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const sendEmail = async ({ email, name, code, purpose }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'starkhell69@gmail.com';
  if (!apiKey || !senderEmail) throw new Error('OTP_EMAIL_NOT_CONFIGURED');

  const purposeLabels = {
    signup: 'Create your account',
    login: 'Sign in to your account',
    password_reset: 'Reset your password',
  };
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Suit Aura Girls', email: senderEmail },
      to: [{ email, name: name || 'Customer' }],
      subject: `${code} is your Suit Aura Girls verification code`,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#faf5eb;padding:24px;color:#3d0f1f"><main style="max-width:480px;margin:auto;background:#fff;padding:28px;border:1px solid #b8935a"><h2>Suit Aura Girls</h2><p>${escapeHtml(purposeLabels[purpose])}</p><p>Your one-time code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#3d0f1f">${code}</p><p>This code expires in 10 minutes and can be used only once. If you did not request it, ignore this email.</p></main></body></html>`,
      textContent: `Your Suit Aura Girls code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    console.error('OTP email provider rejected request:', response.status, result.code || result.message || 'unknown');
    throw new Error('OTP_EMAIL_DELIVERY_FAILED');
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'Cross-origin request rejected.' });

  try {
    if (!process.env.ADMIN_SESSION_SECRET) throw new Error('SERVER_CONFIG_MISSING');
    const body = parseBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const purpose = String(body.purpose || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(res, 400, { error: 'Enter a valid email address.' });
    if (!['signup', 'login', 'password_reset'].includes(purpose)) return reply(res, 400, { error: 'Invalid verification purpose.' });

    const otpRef = otpDoc(email, purpose);
    if (body.action === 'send') {
      const previousSnapshot = await otpRef.get();
      const previous = previousSnapshot.exists ? previousSnapshot.data() : null;
      if (previous?.sent_at && Date.now() - new Date(previous.sent_at).getTime() < RESEND_COOLDOWN_MS) {
        return reply(res, 429, { error: 'Please wait 30 seconds before requesting another code.' });
      }

      const code = String(randomInt(100000, 1000000));
      await sendEmail({ email, name: String(body.name || 'Customer').slice(0, 100), code, purpose });
      const now = new Date();
      await otpRef.set({
        email,
        purpose,
        code_hash: hashCode(email, purpose, code),
        attempts: 0,
        sent_at: now.toISOString(),
        expires_at: new Date(now.getTime() + OTP_LIFETIME_MS).toISOString(),
      });
      return reply(res, 200, { success: true, expiresInSeconds: OTP_LIFETIME_MS / 1000 });
    }

    if (body.action === 'verify') {
      const code = String(body.code || '').trim();
      if (!/^\d{6}$/.test(code)) return reply(res, 400, { error: 'Enter the complete 6-digit code.' });
      const recordSnapshot = await otpRef.get();
      const record = recordSnapshot.exists ? recordSnapshot.data() : null;
      if (!record || new Date(record.expires_at).getTime() <= Date.now() || record.attempts >= MAX_VERIFY_ATTEMPTS) {
        if (record) await otpRef.delete();
        return reply(res, 400, { error: 'Code is invalid or expired. Request a new code.' });
      }

      if (!safeCompare(hashCode(email, purpose, code), record.code_hash)) {
        const nextAttempts = record.attempts + 1;
        if (nextAttempts >= MAX_VERIFY_ATTEMPTS) {
          await otpRef.delete();
        } else {
          await otpRef.update({ attempts: nextAttempts });
        }
        return reply(res, 400, { error: 'Incorrect code. Check your email and try again.' });
      }

      await otpRef.delete();
      return reply(res, 200, { success: true, verified: true, email });
    }

    return reply(res, 400, { error: 'Invalid OTP action.' });
  } catch (error) {
    const message = error?.message || 'OTP request failed.';
    console.error('Customer OTP API error:', message);
    if (message === 'SERVER_CONFIG_MISSING') return reply(res, 503, { error: 'Email verification is temporarily unavailable.' });
    if (message === 'OTP_EMAIL_NOT_CONFIGURED') return reply(res, 503, { error: 'Email verification is not configured yet. Please contact support.' });
    if (message === 'OTP_EMAIL_DELIVERY_FAILED') return reply(res, 502, { error: 'Could not deliver the verification email. Please try again later.' });
    return reply(res, 500, { error: 'Verification request failed. Please try again.' });
  }
}
