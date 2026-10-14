// Suit Aura Girls: the service worker that lets the store be installed as an app.
// It deliberately keeps NOTHING and handles no requests: every page, price, photo and order is always fetched fresh
// from the store, so the installed app can never show an old price or an old version of the site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
