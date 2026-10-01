import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

// Keep in sync with src/lib/firebase.ts.
const DEFAULT_DATABASE_ID = '(default)';

export const ADMIN_UID = 'sag-admin';

export const firebaseApp = () => {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('SERVER_CONFIG_MISSING');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('SERVER_CONFIG_MISSING');
  }
  return initializeApp({ credential: cert(serviceAccount) });
};

export const firestore = () => {
  const databaseId = process.env.FIREBASE_DATABASE_ID || DEFAULT_DATABASE_ID;
  return getFirestore(firebaseApp(), databaseId);
};

/** Token the admin panel exchanges for a Firebase session with the `admin` claim. */
export const createAdminFirebaseToken = () => getAuth(firebaseApp()).createCustomToken(ADMIN_UID, { admin: true });

/** Invalidates every admin Firebase session (used on logout and "revoke all sessions"). */
export const revokeAdminFirebaseSessions = () => getAuth(firebaseApp()).revokeRefreshTokens(ADMIN_UID).catch(() => {});

/** Stable, non-reversible Firebase uid for a customer email. */
export const customerUid = (email) => `c_${createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 26)}`;

/** Token the storefront exchanges for a Firebase session scoped to one verified customer email. */
export const createCustomerFirebaseToken = (email) => getAuth(firebaseApp())
  .createCustomToken(customerUid(email), { customerEmail: String(email).toLowerCase() });
