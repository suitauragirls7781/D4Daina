// Session tokens for the Worker build. There is no Firebase Auth here: the "custom token" the API hands out
// is itself the session token the browser keeps and sends back as `Authorization: Bearer <token>`.
// Our own tokens are compact HS256 JWTs; Google sign-in credentials (RS256, issued by Google) are also
// accepted by verifyIdToken so api/customer-auth.js keeps working unchanged.
// Web Crypto only, so the same file runs on Workers and in the Node tests.
import { createStore } from './docstore.js';
import { getDB, getEnv } from './env.js';

export const ADMIN_UID = 'sag-admin';
const ADMIN_LIFETIME_SECONDS = 400 * 24 * 60 * 60;
const CUSTOMER_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

// Where "sign out everywhere" is remembered: auth_state/<uid> = { revokedAt: <ms> }
const AUTH_STATE = 'auth_state';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
// Keep in sync with GOOGLE_CLIENT_ID in src/utils/googleSignIn.ts (public OAuth client id, not a secret).
const DEFAULT_GOOGLE_CLIENT_ID = '531923624003-fi0npjcv76mqfi85meqkjldppui8g4vc.apps.googleusercontent.com';
const JWKS_DEFAULT_MAX_AGE_SECONDS = 60 * 60;
// An unknown key id triggers a fresh download (Google rotates keys), but not more often than this,
// so junk tokens cannot make the Worker call Google on every request.
const JWKS_MIN_REFETCH_MS = 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Same idea as firebase-admin's auth errors: a readable message plus a stable `code`. */
const authError = (code, message) => Object.assign(new Error(message), { code: `auth/${code}` });

const bytesToBase64Url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (text) => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw authError('argument-error', 'Token is not valid base64url.');
  let binary;
  try {
    binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw authError('argument-error', 'Token is not valid base64url.');
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encodeJson = (value) => bytesToBase64Url(encoder.encode(JSON.stringify(value)));

const decodeJson = (segment) => {
  let value;
  try {
    value = JSON.parse(decoder.decode(base64UrlToBytes(segment)));
  } catch {
    throw authError('argument-error', 'Token could not be decoded.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw authError('argument-error', 'Token could not be decoded.');
  return value;
};

/** Splits a compact JWT. Nothing returned from here is trusted until the signature has been checked. */
const parseJwt = (token) => {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts.some((part) => !part)) throw authError('argument-error', 'Token is malformed.');
  return {
    header: decodeJson(parts[0]),
    payload: decodeJson(parts[1]),
    signature: base64UrlToBytes(parts[2]),
    signedBytes: encoder.encode(`${parts[0]}.${parts[1]}`),
  };
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ---- our own HS256 tokens ----

// Importing the key costs a little CPU, so it is kept while the isolate is warm (re-imported if the secret changes).
let hmacKeyCache = { secret: '', key: null };
const hmacKey = async () => {
  const secret = getEnv().AUTH_TOKEN_SECRET;
  if (!secret) throw new Error('SERVER_CONFIG_MISSING');
  if (hmacKeyCache.secret !== secret) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacKeyCache = { secret, key };
  }
  return hmacKeyCache.key;
};

/**
 * Mints a session token. Admin tokens (uid `sag-admin`) last 400 days like the admin cookie;
 * customer tokens last 180 days. `uid`, `iat` and `exp` can never be overridden by `claims`.
 */
export const createCustomToken = async (uid, claims = {}) => {
  if (typeof uid !== 'string' || !uid) throw authError('argument-error', 'A uid is required.');
  const key = await hmacKey();
  const iat = nowSeconds();
  const lifetime = uid === ADMIN_UID ? ADMIN_LIFETIME_SECONDS : CUSTOMER_LIFETIME_SECONDS;
  const unsigned = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson({ ...claims, uid, iat, exp: iat + lifetime })}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
};

const revokedAtMs = async (uid) => {
  const doc = await createStore(getDB()).getDoc(AUTH_STATE, uid);
  return Number(doc?.data?.revokedAt) || 0;
};

const verifySessionToken = async ({ header, payload, signature, signedBytes }, checkRevoked) => {
  if (header.alg !== 'HS256') throw authError('argument-error', 'Unexpected token algorithm.');
  // crypto.subtle.verify compares the HMAC in constant time
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(), signature, signedBytes);
  if (!valid) throw authError('argument-error', 'Token signature is invalid.');
  if (typeof payload.uid !== 'string' || !payload.uid) throw authError('argument-error', 'Token has no uid.');
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds()) throw authError('id-token-expired', 'Token has expired.');
  if (checkRevoked) {
    // Compared in whole seconds (as Firebase does), so a token minted right after a revocation,
    // for example the admin's new session after changing the password, is not rejected by its own second.
    const revokedAt = Math.floor((await revokedAtMs(payload.uid)) / 1000);
    if (!Number.isFinite(payload.iat) || payload.iat < revokedAt) throw authError('id-token-revoked', 'Token has been revoked.');
  }
  return payload;
};

/** Every token of this uid issued before now stops passing `verifyIdToken(token, true)`. */
export const revokeRefreshTokens = async (uid) => {
  if (typeof uid !== 'string' || !uid) throw authError('argument-error', 'A uid is required.');
  await createStore(getDB()).commit([{ type: 'set', collection: AUTH_STATE, id: uid, data: { revokedAt: Date.now() } }]);
};

// ---- Google sign-in credentials ----

let googleKeys = { byKid: new Map(), fetchedAt: 0, expiresAt: 0 };

const downloadGoogleKeys = async () => {
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) throw authError('internal-error', 'Google signing keys could not be loaded.');
  const body = await response.json();
  const byKid = new Map();
  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (jwk?.kty !== 'RSA' || !jwk.kid) continue;
    // Only the key material is passed on: the algorithm is fixed here, never taken from the token
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    byKid.set(jwk.kid, key);
  }
  const maxAge = Number(/max-age=(\d+)/i.exec(response.headers.get('cache-control') || '')?.[1]) || JWKS_DEFAULT_MAX_AGE_SECONDS;
  googleKeys = { byKid, fetchedAt: Date.now(), expiresAt: Date.now() + maxAge * 1000 };
};

const googleKey = async (kid) => {
  const now = Date.now();
  const stale = now >= googleKeys.expiresAt;
  const unknownKid = !googleKeys.byKid.has(kid) && now - googleKeys.fetchedAt >= JWKS_MIN_REFETCH_MS;
  if (stale || unknownKid) await downloadGoogleKeys();
  return googleKeys.byKid.get(kid);
};

const verifyGoogleCredential = async ({ header, payload, signature, signedBytes }) => {
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw authError('argument-error', 'Unexpected Google token algorithm.');
  const key = await googleKey(header.kid);
  if (!key) throw authError('argument-error', 'Google token was signed with an unknown key.');
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedBytes);
  if (!valid) throw authError('argument-error', 'Google token signature is invalid.');
  const clientId = getEnv().GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  if (payload.aud !== clientId) throw authError('argument-error', 'Google token was issued for another app.');
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds()) throw authError('id-token-expired', 'Google token has expired.');
  if (typeof payload.sub !== 'string' || !payload.sub) throw authError('argument-error', 'Google token has no subject.');
  // The shape api/customer-auth.js reads from a Firebase-verified Google sign-in.
  // email_verified is passed through untouched: the handler insists on `=== true`.
  return {
    uid: `google:${payload.sub}`,
    email: payload.email,
    email_verified: payload.email_verified,
    name: payload.name,
    picture: payload.picture,
    firebase: { sign_in_provider: 'google.com' },
  };
};

/**
 * Verifies a Bearer token and returns its payload (`uid`, `admin`, `customerEmail`, `iat`, `exp`), or,
 * for a Google credential, the Google profile. Throws on anything invalid, expired or (with `checkRevoked`) revoked.
 * The issuer only chooses which check runs; each path accepts exactly one algorithm and its own key.
 */
export const verifyIdToken = async (token, checkRevoked = false) => {
  const jwt = parseJwt(token);
  if (GOOGLE_ISSUERS.includes(jwt.payload.iss)) return verifyGoogleCredential(jwt);
  return verifySessionToken(jwt, checkRevoked === true);
};
