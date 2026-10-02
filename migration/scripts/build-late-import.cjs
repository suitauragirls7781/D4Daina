// SQL for the server-only collections that could only be exported after the Firestore quota came back
// (export-firestore-rest.cjs). Insert-only: a document that already exists in D1 is left as it is, because
// the store has been live on D1 since the cut-over. Not included on purpose: admin_credentials and
// private_settings (the live Worker has its own admin login and payment settings; the old documents would
// change them), customer_email_otps and rate_limits (short-lived), analytics_dedup.
//
//   node migration/scripts/build-late-import.cjs      writes migration/data/d1-import-late/late.sql
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'migration', 'data');
const COLLECTIONS = ['shared_wishlists', 'review_photos', 'review_votes', 'alert_state', 'stock_alerts', 'return_photos', 'alert_log'];
const OLD_CLOUD = 'res.cloudinary.com/daps4gdk/';
const NEW_CLOUD = 'res.cloudinary.com/lvc3kqwu/';

const exportDir = path.join(DATA, fs.readdirSync(DATA).filter((name) => name.startsWith('export-')).sort().pop());
const stored = (value) => {
  if (Array.isArray(value)) return value.map(stored);
  if (value === null || typeof value !== 'object') return value;
  if (value.__type === 'timestamp' && typeof value.iso === 'string') return value.iso;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stored(item)]));
};
const q = (text) => `'${String(text).replace(/'/g, "''")}'`;
const stamp = new Date().toISOString();
const lines = [];
for (const name of COLLECTIONS) {
  const file = path.join(exportDir, `${name}.json`);
  if (!fs.existsSync(file)) continue;
  const docs = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const { id, data } of docs) {
    const json = JSON.stringify(stored(data)).split(OLD_CLOUD).join(NEW_CLOUD);
    lines.push(`INSERT OR IGNORE INTO docs(collection,id,data,version,created_at,updated_at) VALUES(${q(name)},${q(id)},${q(json)},1,${q(stamp)},${q(stamp)});`);
  }
  if (docs.length) lines.push(`INSERT OR IGNORE INTO collection_versions(collection,version,updated_at) VALUES(${q(name)},1,${q(stamp)});`);
  console.log(`${name.padEnd(18)} ${docs.length} docs`);
}
const out = path.join(DATA, 'd1-import-late');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'late.sql'), lines.join('\n') + '\n');
console.log(`${lines.length} statements -> ${path.join(out, 'late.sql')}`);
