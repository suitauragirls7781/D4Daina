// Installing the store as an app (manifest: public/manifest.webmanifest; worker: public/sw.js, which keeps nothing).
// - Android and computers (Chrome, Edge, Samsung Internet): the browser offers the install itself; its offer is
//   kept here so the menu and the footer can show an "Install the app" line that opens the browser's own dialog.
// - iPhone and iPad (Safari): there is no install offer; the line explains Share, then Add to Home Screen.
// - Inside the Instagram or Facebook app, or when already opened as the installed app: nothing is shown.
import { useEffect, useState } from 'react';

type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let offer: InstallOffer | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '');
export const insideSocialApp = () => /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat/i.test(ua());
export const isIos = () => /iPhone|iPad|iPod/i.test(ua()) || (ua().includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
export const runsAsApp = () => typeof window !== 'undefined'
  && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true);

/** Called once at start (src/main.tsx): keeps the browser's install offer and registers the worker after load. */
export const startInstallSupport = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event as InstallOffer;
    tell();
  });
  window.addEventListener('appinstalled', () => { offer = null; tell(); });
  if ('serviceWorker' in navigator && window.isSecureContext && !insideSocialApp()) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* the store works the same without it */ }); });
  }
};

export type InstallWay = 'prompt' | 'ios' | null;

/** How this visitor can install the store right now, if at all. */
export const useInstallWay = (): InstallWay => {
  const read = (): InstallWay => {
    if (typeof window === 'undefined' || runsAsApp() || insideSocialApp()) return null;
    if (offer) return 'prompt';
    if (isIos()) return 'ios';
    return null;
  };
  const [way, setWay] = useState<InstallWay>(read);
  useEffect(() => {
    const update = () => setWay(read());
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);
  return way;
};

/** Opens the browser's own install dialog. Resolves true when the visitor installed the app. */
export const askToInstall = async (): Promise<boolean> => {
  const current = offer;
  if (!current) return false;
  await current.prompt();
  const { outcome } = await current.userChoice;
  offer = null;
  tell();
  return outcome === 'accepted';
};

/** The words for iPhone visitors, where Safari has no install button. */
export const IOS_INSTALL_STEPS = 'Tap Share, then “Add to Home Screen”';
