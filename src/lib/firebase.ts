import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const firestoreDatabaseId = '(default)';

export const auth = getAuth(app);

// Initialize Firestore with auto-detect long polling to ensure smooth connection in sandboxed preview environments
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    // Firestore rejects undefined fields; drop them instead of failing writes.
    ignoreUndefinedProperties: true,
  }, firestoreDatabaseId);
} catch {
  firestoreDb = getFirestore(app, firestoreDatabaseId);
}

export const db = firestoreDb;

// Initialize analytics conditionally if supported and not in development/preview environments
isSupported().then((supported) => {
  if (supported && typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('run.app') && !window.location.hostname.includes('webcontainer')) {
    try {
      getAnalytics(app);
    } catch (err) {
      console.warn("Analytics failed to initialize safely:", err);
    }
  }
}).catch((err) => {
  console.warn("Analytics not supported in this environment", err);
});

