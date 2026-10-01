import { getAuth } from 'firebase-admin/auth';
import { firebaseApp } from './firebaseAdmin.js';

export const reply = (res, status, body) => {
  res.status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
};

export const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

/** Browsers always send Origin on POST, so a missing or foreign Origin is rejected. */
export const isSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host);
  } catch {
    return false;
  }
};

export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
  .split(',')[0]
  .trim();

/**
 * Identity from the `Authorization: Bearer <Firebase ID token>` header.
 * Admin tokens carry `admin: true`; customer tokens carry `customerEmail` (both minted by our API).
 */
export const getIdentity = async (req) => {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { admin: false, email: '' };
  try {
    let decoded = await getAuth(firebaseApp()).verifyIdToken(match[1]);
    // Admin tokens are also checked against revocation (logout / "revoke all sessions").
    if (decoded.admin === true) decoded = await getAuth(firebaseApp()).verifyIdToken(match[1], true);
    return {
      admin: decoded.admin === true,
      email: typeof decoded.customerEmail === 'string' ? decoded.customerEmail : '',
      uid: decoded.uid,
    };
  } catch {
    return { admin: false, email: '' };
  }
};

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));

export const cleanText = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
