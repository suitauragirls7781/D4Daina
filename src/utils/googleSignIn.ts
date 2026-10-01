import { apiPost } from '../lib/api';

// Public OAuth client of the Firebase project (Google sign-in provider). Not a secret.
export const GOOGLE_CLIENT_ID = '531923624003-fi0npjcv76mqfi85meqkjldppui8g4vc.apps.googleusercontent.com';
export const GOOGLE_LOGIN_ENABLED = import.meta.env.VITE_GOOGLE_LOGIN === '1';

type CredentialHandler = (credential: string) => void;
let handler: CredentialHandler | null = null;
let initialized = false;
let scriptPromise: Promise<void> | null = null;

const loadScript = () => {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('Google sign-in could not load.')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
};

/**
 * Loads Google Identity Services once and routes every credential (button or One Tap) to the
 * handler of the component currently asking for it. Google shows the site's own domain on its screens.
 */
export const getGoogleId = async (onCredential: CredentialHandler) => {
  handler = onCredential;
  await loadScript();
  const g = (window as any).google?.accounts?.id;
  if (!g) throw new Error('Google sign-in could not load.');
  if (!initialized) {
    g.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential?: string }) => { if (response?.credential) handler?.(response.credential); },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
      use_fedcm_for_prompt: true,
    });
    initialized = true;
  }
  return g;
};

export interface GoogleSessionResult {
  email: string;
  firebaseToken: string;
  customer?: { name?: string; phone?: string };
}

/** Turns a Google credential into a customer session token (verified again on the server). */
export const exchangeGoogleCredential = async (credential: string): Promise<GoogleSessionResult> => {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth, GoogleAuthProvider, signInWithCredential, signOut } = await import('firebase/auth');
  const config = (await import('../../firebase-applet-config.json')).default;
  const app = getApps().find((a) => a.name === 'sag-google') || initializeApp(config, 'sag-google');
  const googleAuth = getAuth(app);
  const cred = await signInWithCredential(googleAuth, GoogleAuthProvider.credential(credential));
  const idToken = await cred.user.getIdToken();
  signOut(googleAuth).catch(() => {});
  return apiPost<GoogleSessionResult>('/api/customer-auth', { action: 'google', idToken });
};
