/**
 * Stand-in for `firebase/analytics` in the Cloudflare build: Firebase Analytics is gone, so it reports
 * "not supported" and src/lib/firebase.ts skips it (visitor counting goes through /api/track).
 */
import type { FirebaseApp } from './firebase-app.ts';

export interface Analytics {
  readonly app: FirebaseApp | undefined;
}

export function isSupported(): Promise<boolean> {
  return Promise.resolve(false);
}

export function getAnalytics(app?: FirebaseApp): Analytics {
  return { app };
}
