/**
 * Stand-in for `firebase/app` in the Cloudflare build (see README.md in this folder).
 * An "app" is only a name here: the name decides which sign-in session (token) a request carries.
 */

export interface FirebaseOptions {
  [key: string]: unknown;
}

export interface FirebaseApp {
  readonly name: string;
  readonly options: FirebaseOptions;
}

export const DEFAULT_APP_NAME = '[DEFAULT]';

const apps = new Map<string, FirebaseApp>();

/** Keeps the config and returns the app; asking again for the same name returns the same app. */
export function initializeApp(options: FirebaseOptions = {}, name: string = DEFAULT_APP_NAME): FirebaseApp {
  const existing = apps.get(name);
  if (existing) return existing;
  const app: FirebaseApp = Object.freeze({ name, options: { ...options } });
  apps.set(name, app);
  return app;
}

export function getApps(): FirebaseApp[] {
  return Array.from(apps.values());
}

export function getApp(name: string = DEFAULT_APP_NAME): FirebaseApp {
  const app = apps.get(name);
  if (!app) throw new Error(`No Firebase app '${name}' has been created - call initializeApp() first.`);
  return app;
}
