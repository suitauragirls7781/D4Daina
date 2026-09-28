import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Keep in sync with src/lib/firebase.ts.
const DEFAULT_DATABASE_ID = '(default)';

export const ADMIN_UID = 'sag-admin';

const getApp = () => {
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
  return getFirestore(getApp(), databaseId);
};

/** Token the admin panel exchanges for a Firebase session with the `admin` claim. */
export const createAdminFirebaseToken = () => getAuth(getApp()).createCustomToken(ADMIN_UID, { admin: true });
