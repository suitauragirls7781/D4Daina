// Read-only export of the server-only Firestore collections (the browser export cannot read them) through the
// Firestore REST API, signed in as the project owner with the login that firebase-tools keeps on this machine.
//
//   node migration/scripts/export-firestore-rest.cjs                        everything except analytics_dedup
//   node migration/scripts/export-firestore-rest.cjs --skip none            all five collections
//   node migration/scripts/export-firestore-rest.cjs --skip rate_limits,customer_email_otps,analytics_dedup
//
// Writes <collection>.json (array of { id, data }, same shape as the browser export) into the newest
// migration/data/export-* folder, so build-d1-import.cjs picks the collections up on its next run.
// Works only while the Firestore read quota is available (it resets around 12:30 IST). Nothing is written to
// Firestore, and the access token is never printed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'migration', 'data');
const PROJECT = require(path.join(ROOT, 'firebase-applet-config.json')).projectId;
// Same database the server uses (api/_lib/firebaseAdmin.js).
const DATABASE = '(default)';
const TOKEN_FILE = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

const COLLECTIONS = ['admin_credentials', 'private_settings', 'customer_email_otps', 'rate_limits', 'analytics_dedup'];
// analytics_dedup only stops double counting of page views and can be very large, so it is left out unless asked for.
const DEFAULT_SKIP = ['analytics_dedup'];
const PAGE_SIZE = 300;

const skipList = () => {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith('--skip='));
  const index = args.indexOf('--skip');
  const raw = inline ? inline.slice('--skip='.length) : index !== -1 ? args[index + 1] : null;
  if (raw === null) return DEFAULT_SKIP;
  if (!raw) throw new Error('--skip needs a comma-separated list of collections, or "none".');
  const names = raw === 'none' ? [] : raw.split(',').map((name) => name.trim()).filter(Boolean);
  const unknown = names.filter((name) => !COLLECTIONS.includes(name));
  if (unknown.length) throw new Error(`--skip: not one of the server-only collections: ${unknown.join(', ')}`);
  return names;
};

const storedTokens = () => {
  if (!fs.existsSync(TOKEN_FILE)) throw new Error('No firebase-tools login on this machine. Run: npx firebase-tools login');
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).tokens || {};
};

/** The owner's access token. firebase-tools renews it on any command, so an old one is renewed that way. */
const accessToken = () => {
  const fresh = (tokens) => tokens.access_token && Number(tokens.expires_at) > Date.now() + 2 * 60 * 1000;
  let tokens = storedTokens();
  if (!fresh(tokens)) {
    spawnSync('npx firebase-tools projects:list', { cwd: ROOT, shell: true, stdio: 'ignore' });
    tokens = storedTokens();
  }
  if (!fresh(tokens)) throw new Error('Could not renew the firebase-tools login. Run: npx firebase-tools login --reauth');
  return tokens.access_token;
};

/** Firestore's typed JSON value -> plain JSON, with the same markers as export-firestore-client.cjs. */
const plain = (value, notes) => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    if (!Number.isSafeInteger(number)) notes.add('an integer beyond 2^53 lost precision');
    return number;
  }
  if ('doubleValue' in value) {
    // NaN and Infinity arrive as strings; JSON cannot carry them
    if (typeof value.doubleValue === 'number') return value.doubleValue;
    notes.add('a NaN/Infinity number was stored as null');
    return null;
  }
  if ('timestampValue' in value) return { __type: 'timestamp', iso: new Date(value.timestampValue).toISOString() };
  if ('mapValue' in value) return plainFields(value.mapValue.fields, notes);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map((item) => plain(item, notes));
  if ('geoPointValue' in value) return { __type: 'geopoint', lat: value.geoPointValue.latitude || 0, lng: value.geoPointValue.longitude || 0 };
  if ('referenceValue' in value) return { __type: 'ref', path: value.referenceValue.split('/documents/')[1] };
  if ('bytesValue' in value) return { __type: 'bytes', base64: value.bytesValue };
  throw new Error(`Unknown Firestore value type: ${Object.keys(value).join(', ')}`);
};

const plainFields = (fields = {}, notes) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, plain(value, notes)]));

const fetchPage = async (collection, pageToken) => {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${collection}`);
  url.searchParams.set('pageSize', String(PAGE_SIZE));
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken()}` }, signal: AbortSignal.timeout(60000) });
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  const status = body.error?.status || `HTTP ${response.status}`;
  const error = new Error(`${status}: ${String(body.error?.message || '').slice(0, 200)}`);
  error.quota = response.status === 429 || status === 'RESOURCE_EXHAUSTED';
  throw error;
};

const exportCollection = async (collection, notes) => {
  const docs = [];
  let pageToken = '';
  do {
    const page = await fetchPage(collection, pageToken);
    for (const document of page.documents || []) {
      const [parent, id] = document.name.split('/documents/')[1].split('/');
      if (parent !== collection || !id) throw new Error(`Unexpected document path: ${document.name}`);
      docs.push({ id, data: plainFields(document.fields, notes) });
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return docs;
};

(async () => {
  const skip = skipList();
  const exportName = fs.readdirSync(DATA).filter((entry) => entry.startsWith('export-')).sort().pop();
  if (!exportName) throw new Error('No migration/data/export-* folder found. Run export-firestore-client.cjs first.');
  const out = path.join(DATA, exportName);
  const summaryFile = path.join(out, '_summary.json');
  const summary = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : { collections: {} };

  let failed = 0;
  for (const name of COLLECTIONS) {
    if (skip.includes(name)) {
      console.log(`${name.padEnd(22)} skipped`);
      continue;
    }
    const notes = new Set();
    try {
      // A collection file is written only when the whole collection has been read.
      const docs = await exportCollection(name, notes);
      fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(docs, null, 1));
      summary.collections[name] = { ok: true, docs: docs.length, bytes: fs.statSync(path.join(out, `${name}.json`)).size, via: 'rest (owner login)' };
      console.log(`${name.padEnd(22)} ${String(docs.length).padStart(6)} docs${notes.size ? `  (${[...notes].join('; ')})` : ''}`);
    } catch (error) {
      failed += 1;
      console.log(`${name.padEnd(22)} NOT EXPORTED (${error.message})`);
      if (error.quota) {
        console.log('The Firestore quota is still used up. Try again after it resets (about 12:30 IST).');
        break;
      }
    }
  }
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  console.log(`\nSaved to ${out}`);
  if (failed) process.exit(1);
})().catch((error) => {
  console.error('Export failed:', error.message);
  process.exit(1);
});
