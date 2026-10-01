// Full read-only export of the store's Firestore data to JSON, through the browser SDK signed in as the admin.
// (Used while the server side answers "quota exceeded": the browser channel still reads.)
//
//   node migration/scripts/export-firestore-client.cjs
//
// Needs ADMIN_USER / ADMIN_PASS / ADMIN_PIN in the environment (never written to disk). Writes one JSON file
// per collection to migration/data/export-<timestamp>/ (git-ignored: it contains customer details).
// Nothing is written to Firestore.
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');
const { initializeFirestore, collection, getDocsFromServer, Timestamp, GeoPoint, DocumentReference } = require('firebase/firestore');

const ROOT = path.resolve(__dirname, '..', '..');
const config = require(path.join(ROOT, 'firebase-applet-config.json'));
const SITE = 'https://www.suitauragirls.in';
// Every collection named in firestore.rules. Server-only ones answer "permission-denied" here and are
// exported later with the Admin SDK (migration/scripts/export-firestore-admin.cjs) once the quota is back.
const COLLECTIONS = [
  'products', 'categories', 'hero_slides', 'coupons', 'reviews', 'orders', 'profiles', 'customers',
  'abandoned_checkouts', 'storefront_settings', 'leads', 'visitor_sessions', 'daily_analytics', 'product_daily',
  'search_terms', 'feature_daily', 'analytics_totals', 'inventory_log', 'admin_settings',
  'admin_credentials', 'customer_email_otps', 'rate_limits', 'private_settings', 'analytics_dedup',
];

// Firestore values -> plain JSON that can be turned back later (timestamps keep a marker)
const plain = (value) => {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Timestamp) return { __type: 'timestamp', iso: value.toDate().toISOString() };
  if (value instanceof GeoPoint) return { __type: 'geopoint', lat: value.latitude, lng: value.longitude };
  if (value instanceof DocumentReference) return { __type: 'ref', path: value.path };
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
};

(async () => {
  const { ADMIN_USER, ADMIN_PASS, ADMIN_PIN } = process.env;
  if (!ADMIN_USER || !ADMIN_PASS) throw new Error('Set ADMIN_USER, ADMIN_PASS and ADMIN_PIN in the environment.');
  const login = await fetch(`${SITE}/api/admin-config?action=login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS, pin: ADMIN_PIN, remember: false }),
  });
  const session = await login.json().catch(() => ({}));
  if (!login.ok || !session.firebaseToken) throw new Error(`Admin sign-in failed (${login.status}): ${session.error || 'no token'}`);

  const app = initializeApp(config);
  await signInWithCustomToken(getAuth(app), session.firebaseToken);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, '(default)');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(ROOT, 'migration', 'data', `export-${stamp}`);
  fs.mkdirSync(out, { recursive: true });
  const summary = { exportedAt: new Date().toISOString(), project: config.projectId, via: 'client-sdk (admin token)', collections: {} };

  for (const name of COLLECTIONS) {
    try {
      const snap = await Promise.race([
        getDocsFromServer(collection(db, name)),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timed out after 60s'), { code: 'timeout' })), 60000)),
      ]);
      const docs = snap.docs.map((d) => ({ id: d.id, data: plain(d.data()) }));
      fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(docs, null, 1));
      summary.collections[name] = { ok: true, docs: docs.length, bytes: fs.statSync(path.join(out, `${name}.json`)).size };
      console.log(`${name.padEnd(22)} ${String(docs.length).padStart(6)} docs`);
    } catch (error) {
      summary.collections[name] = { ok: false, error: `${error.code || ''} ${String(error.message).slice(0, 120)}`.trim() };
      console.log(`${name.padEnd(22)} NOT EXPORTED (${error.code || error.message})`);
    }
  }
  fs.writeFileSync(path.join(out, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nSaved to', out);
  process.exit(0);
})().catch((error) => { console.error('Export failed:', error.message); process.exit(1); });
