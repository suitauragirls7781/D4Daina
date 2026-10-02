/**
 * Stand-in for `firebase/auth` in the Cloudflare build (see README.md in this folder).
 *
 * There is no Firebase Auth any more: the "custom token" the server hands out IS the session token.
 * It is kept in localStorage per app name (so a reload stays signed in, as Firebase did) and sent as
 * `Authorization: Bearer` by src/lib/api.ts and by the Firestore shim. The browser only reads the token's
 * payload (uid, claims, expiry); the signature is checked by the server on every request.
 */
import { getApp, type FirebaseApp } from './firebase-app.ts';

export interface IdTokenResult {
  token: string;
  claims: Record<string, any>;
  expirationTime: string;
  issuedAtTime: string;
}

export interface User {
  readonly uid: string;
  readonly email: string | null;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult(forceRefresh?: boolean): Promise<IdTokenResult>;
}

export interface UserCredential {
  user: User;
}

export interface Auth {
  readonly app: FirebaseApp;
  readonly name: string;
  readonly currentUser: User | null;
}

export interface AuthCredential {
  readonly providerId: string;
  readonly signInMethod: string;
  readonly idToken: string;
}

export type Unsubscribe = () => void;
type NextOrObserver = ((user: User | null) => unknown) | { next?: (user: User | null) => unknown };

/** Same shape as Firebase's auth errors: an Error with a `code` like `auth/invalid-custom-token`. */
export class AuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebaseError';
    this.code = code;
  }
}

const STORAGE_PREFIX = 'sag_auth_token:';

interface Session {
  token: string;
  uid: string;
  expiresAt: number;
  /** false for a Google credential: it is only passed on to the server once, never kept. */
  persisted: boolean;
  user: User;
}

interface Subscriber {
  notify: (user: User | null) => void;
  /** Set once the first (asynchronous) call has gone out; later changes are delivered directly. */
  started: boolean;
}

/** Reads the payload of a compact JWT. No signature check: the browser only needs uid, claims and expiry. */
export function decodeJwtPayload(token: unknown): Record<string, any> | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

class AuthImpl implements Auth {
  readonly app: FirebaseApp;
  readonly name: string;
  session: Session | null = null;
  readonly subscribers = new Set<Subscriber>();

  constructor(app: FirebaseApp) {
    this.app = app;
    this.name = app.name;
  }

  /** An expired token means signed out, exactly when someone looks. */
  get currentUser(): User | null {
    if (this.session && this.session.expiresAt <= Date.now()) setSession(this, null);
    return this.session ? this.session.user : null;
  }
}

const instances = new Map<FirebaseApp, AuthImpl>();
const tokenWatchers = new Set<(app: FirebaseApp) => void>();
let watchingStorage = false;

const storageKey = (auth: AuthImpl) => `${STORAGE_PREFIX}${auth.name}`;

const readStored = (auth: AuthImpl): string | null => {
  try {
    return localStorage.getItem(storageKey(auth));
  } catch {
    return null;
  }
};

const writeStored = (auth: AuthImpl, token: string | null) => {
  try {
    if (token) localStorage.setItem(storageKey(auth), token);
    else localStorage.removeItem(storageKey(auth));
  } catch {
    // Storage blocked (private mode): the session still works until the page is closed.
  }
};

/** Builds the session for a token, or null when the token is unreadable, has no uid or has expired. */
function sessionFromToken(auth: AuthImpl, token: string | null, persisted: boolean): Session | null {
  const claims = decodeJwtPayload(token);
  if (!token || !claims) return null;
  // Our own tokens carry `uid`; a Google credential carries `sub`.
  const uid = typeof claims.uid === 'string' && claims.uid ? claims.uid : typeof claims.sub === 'string' ? claims.sub : '';
  const expiresAt = Number(claims.exp) * 1000;
  if (!uid || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const requireFresh = () => {
    if (expiresAt > Date.now()) return;
    if (auth.session?.token === token) setSession(auth, null);
    throw new AuthError('auth/user-token-expired', 'The sign-in session has expired. Please sign in again.');
  };
  const user: User = {
    uid,
    email: typeof claims.email === 'string' ? claims.email : null,
    getIdToken: async () => {
      requireFresh();
      return token;
    },
    getIdTokenResult: async () => {
      requireFresh();
      return {
        token,
        claims,
        expirationTime: new Date(expiresAt).toUTCString(),
        issuedAtTime: new Date((Number(claims.iat) || 0) * 1000).toUTCString(),
      };
    },
  };
  return { token, uid, expiresAt, persisted, user };
}

/**
 * The one place the signed-in state changes. `store` is false when the change was read FROM storage
 * (page load, another tab), so it is not written back.
 */
function setSession(auth: AuthImpl, next: Session | null, store = true) {
  const previous = auth.session;
  if ((previous?.token ?? null) === (next?.token ?? null)) return;
  auth.session = next;
  if (store && (next ? next.persisted : previous?.persisted)) writeStored(auth, next ? next.token : null);

  tokenWatchers.forEach((watcher) => {
    try { watcher(auth.app); } catch (error) { console.error('Sign-in change handler failed:', error); }
  });
  // Like Firebase, listeners hear about sign-in and sign-out, not about a new token for the same user.
  if ((previous?.uid ?? null) === (next?.uid ?? null)) return;
  auth.subscribers.forEach((subscriber) => {
    if (subscriber.started) subscriber.notify(next ? next.user : null);
  });
}

/** Another tab signed in or out: follow it, as Firebase's shared persistence did. */
function watchStorage() {
  if (watchingStorage || typeof window === 'undefined') return;
  watchingStorage = true;
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) return;
    instances.forEach((auth) => {
      if (event.key !== null && event.key !== storageKey(auth)) return;
      if (auth.session && !auth.session.persisted) return;
      setSession(auth, sessionFromToken(auth, readStored(auth), true), false);
    });
  });
}

function implFor(app: FirebaseApp): AuthImpl {
  let auth = instances.get(app);
  if (!auth) {
    auth = new AuthImpl(app);
    // Restored synchronously, so code that reads currentUser right after load already sees the session.
    auth.session = sessionFromToken(auth, readStored(auth), true);
    instances.set(app, auth);
    watchStorage();
  }
  return auth;
}

const impl = (auth: Auth): AuthImpl => implFor(auth.app);

export function getAuth(app: FirebaseApp = getApp()): Auth {
  return implFor(app);
}

/** Signs in with the session token issued by /api/customer-auth or /api/admin-config. */
export async function signInWithCustomToken(auth: Auth, token: string): Promise<UserCredential> {
  const target = impl(auth);
  const session = sessionFromToken(target, token, true);
  if (!session) throw new AuthError('auth/invalid-custom-token', 'The sign-in token is invalid or has expired.');
  setSession(target, session);
  return { user: session.user };
}

/**
 * Google sign-in: the user's getIdToken() is Google's own credential, which src/utils/googleSignIn.ts
 * posts to /api/customer-auth; the server verifies it and answers with a customer session token.
 */
export async function signInWithCredential(auth: Auth, credential: AuthCredential): Promise<UserCredential> {
  const target = impl(auth);
  const session = sessionFromToken(target, credential?.idToken ?? null, false);
  if (!session) throw new AuthError('auth/invalid-credential', 'The Google sign-in could not be read. Please try again.');
  setSession(target, session);
  return { user: session.user };
}

export const GoogleAuthProvider = {
  PROVIDER_ID: 'google.com',
  credential(idToken: string): AuthCredential {
    return { providerId: 'google.com', signInMethod: 'google.com', idToken };
  },
};

export async function signOut(auth: Auth): Promise<void> {
  setSession(impl(auth), null);
}

/**
 * Calls back once (asynchronously) with the restored user or null, then on every sign-in and sign-out.
 * Returns the unsubscribe function.
 */
export function onAuthStateChanged(auth: Auth, nextOrObserver: NextOrObserver): Unsubscribe {
  const target = impl(auth);
  const next = typeof nextOrObserver === 'function' ? nextOrObserver : nextOrObserver.next?.bind(nextOrObserver);
  const subscriber: Subscriber = {
    started: false,
    notify: (user) => {
      // A listener that throws (or an async one that rejects) must not break sign-in for everyone else.
      try {
        Promise.resolve(next?.(user)).catch((error) => console.error('Auth listener failed:', error));
      } catch (error) {
        console.error('Auth listener failed:', error);
      }
    },
  };
  target.subscribers.add(subscriber);
  Promise.resolve().then(() => {
    if (!target.subscribers.has(subscriber)) return;
    subscriber.started = true;
    subscriber.notify(target.currentUser);
  });
  return () => {
    target.subscribers.delete(subscriber);
  };
}

/* ---- Used by the Firestore shim (not part of the Firebase API) ---- */

/** The token requests made for this app must carry, or null when nobody is signed in on it. */
export function shimTokenFor(app: FirebaseApp): string | null {
  const auth = implFor(app);
  return auth.currentUser && auth.session ? auth.session.token : null;
}

/** Calls back whenever an app's token changes (sign-in, sign-out, expiry, another tab). */
export function shimOnTokenChange(watcher: (app: FirebaseApp) => void): void {
  tokenWatchers.add(watcher);
}

const ADMIN_SESSION_URL = '/api/admin-config?action=session';
/** A renewed token that is refused again this soon is not renewed a second time: no request loops. */
const RENEW_PAUSE_MS = 30000;
const renewing = new Set<AuthImpl>();
const lastRenewal = new Map<AuthImpl, number>();

/**
 * Firebase renewed a session by itself with its refresh token. The admin's equivalent is the admin cookie:
 * while it is valid, the session endpoint hands out a fresh token. The refused token stays in place until
 * the answer is in, so the app does not see a sign-out followed by a sign-in.
 */
async function renewAdminSession(auth: AuthImpl, refused: string) {
  let next: Session | null = null;
  try {
    const response = await fetch(ADMIN_SESSION_URL, { credentials: 'same-origin' });
    const body = response.ok ? await response.json() : null;
    const session = sessionFromToken(auth, typeof body?.firebaseToken === 'string' ? body.firebaseToken : null, true);
    if (session && session.token !== refused && decodeJwtPayload(session.token)?.admin === true) next = session;
  } catch {
    next = null;
  } finally {
    renewing.delete(auth);
  }
  // Unless the sign-in changed meanwhile (logout here, another tab): then that change stands.
  if (auth.session?.token === refused) setSession(auth, next);
}

/**
 * The server refused this token. A customer is signed out, which is what Firebase did when it could not
 * refresh a session. An admin token is refused when it was revoked (security settings saved, logout on
 * another device) although the admin cookie of this browser may still be good, so a new token is asked
 * for once; the admin is signed out only when that fails.
 */
export function shimRejectToken(app: FirebaseApp, token: string): void {
  const auth = implFor(app);
  if (auth.session?.token !== token || renewing.has(auth)) return;
  const renewedRecently = Date.now() - (lastRenewal.get(auth) ?? -RENEW_PAUSE_MS) < RENEW_PAUSE_MS;
  if (decodeJwtPayload(token)?.admin !== true || renewedRecently) {
    setSession(auth, null);
    return;
  }
  renewing.add(auth);
  lastRenewal.set(auth, Date.now());
  void renewAdminSession(auth, token);
}
