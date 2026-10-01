// Turns the newest Firestore export into SQL files that load the D1 document store (one row per document).
//
//   node migration/scripts/build-d1-import.cjs                    write migration/data/d1-import/*.sql and self-check them
//   node migration/scripts/build-d1-import.cjs --verify --local   compare per-collection counts in the local D1
//   node migration/scripts/build-d1-import.cjs --verify --remote  ... in the real D1 database
//
// Optional env NEW_CLOUDINARY_CLOUD_NAME: every stored 'res.cloudinary.com/daps4gdk/' URL is rewritten to the
// new cloud name (the same value must be used for --verify to describe the same data; counts do not depend on it).
// worker/schema.sql is applied separately and first (see migration/RUNBOOK.md). Nothing here talks to
// Firestore or to the website. The output contains customer details and stays in the git-ignored data folder.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isDeepStrictEqual } = require('util');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'migration', 'data');
const OUT = path.join(DATA, 'd1-import');
const WORKER = path.join(ROOT, 'worker');
const DATABASE = 'suitauragirls-db';
const OLD_CLOUD_PREFIX = 'res.cloudinary.com/daps4gdk/';

// D1 refuses statements above ~100 KB, and `wrangler d1 execute --file` is happiest with modest files.
const MAX_STATEMENT_BYTES = 90 * 1024;
const MAX_FILE_STATEMENTS = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Used for the self-check only when worker/schema.sql has not been written yet (same tables as the build spec).
const SPEC_SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS collection_versions (
  collection TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL
) WITHOUT ROWID;`;

const newCloudName = () => {
  const name = (process.env.NEW_CLOUDINARY_CLOUD_NAME || '').trim();
  if (name && !/^[a-z0-9_-]+$/i.test(name)) throw new Error('NEW_CLOUDINARY_CLOUD_NAME is not a valid Cloudinary cloud name.');
  return name;
};

const newestExportDir = () => {
  const name = fs.readdirSync(DATA).filter((entry) => entry.startsWith('export-')).sort().pop();
  if (!name) throw new Error('No migration/data/export-* folder found. Run the export first.');
  return path.join(DATA, name);
};

/**
 * The export keeps Firestore timestamps as { __type: 'timestamp', iso }. The document store keeps dates as
 * ISO strings, so the marker becomes its string. Other markers (geopoint, ref, bytes) are counted and kept.
 */
const toStoredValue = (value, markers) => {
  if (Array.isArray(value)) return value.map((item) => toStoredValue(item, markers));
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.__type === 'string') {
    markers[value.__type] = (markers[value.__type] || 0) + 1;
    if (value.__type === 'timestamp' && typeof value.iso === 'string') return value.iso;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toStoredValue(item, markers)]));
};

/** Every collection of the export: [{ name, docs: [{ id, json }] }], with the markers found on the way. */
const readExport = (exportDir, cloudName) => {
  const markers = {};
  const collections = fs.readdirSync(exportDir)
    .filter((file) => file.endsWith('.json') && !file.startsWith('_'))
    .sort()
    .map((file) => {
      const name = file.slice(0, -'.json'.length);
      const entries = JSON.parse(fs.readFileSync(path.join(exportDir, file), 'utf8'));
      if (!Array.isArray(entries)) throw new Error(`${file} is not an array of { id, data }.`);
      const seen = new Set();
      const docs = entries.map((entry) => {
        const isDocument = entry && typeof entry.id === 'string' && entry.id && entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data);
        if (!isDocument) throw new Error(`${file} has an entry that is not { id, data }.`);
        if (seen.has(entry.id)) throw new Error(`${file} has the id "${entry.id}" twice.`);
        seen.add(entry.id);
        const json = JSON.stringify(toStoredValue(entry.data, markers));
        return { id: entry.id, json: cloudName ? json.split(OLD_CLOUD_PREFIX).join(`res.cloudinary.com/${cloudName}/`) : json };
      });
      return { name, docs };
    });
  return { collections, markers };
};

// SQLite string literal: the only character that needs escaping is the single quote (backslashes are literal).
const sqlString = (text) => {
  if (text.includes('\0')) throw new Error('A value contains a NUL character, which SQL text cannot carry.');
  return `'${text.replace(/'/g, "''")}'`;
};

const statementsFor = ({ name, docs }, stamp) => {
  const statements = docs.map(({ id, json }) => (
    `INSERT OR REPLACE INTO docs(collection,id,data,version,created_at,updated_at) VALUES(${sqlString(name)},${sqlString(id)},${sqlString(json)},1,${sqlString(stamp)},${sqlString(stamp)});`
  ));
  // The collection's version row lets the browser pollers ask "anything new?" from the first request on.
  statements.push(`INSERT OR REPLACE INTO collection_versions(collection,version,updated_at) VALUES(${sqlString(name)},1,${sqlString(stamp)});`);
  for (const statement of statements) {
    if (statement.includes('\n')) throw new Error(`${name}: a statement spans more than one line.`);
    if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES) throw new Error(`${name}: a document is larger than D1's statement limit.`);
  }
  return statements;
};

/** Splits statements into files that respect both the statement-count and the size limit. */
const intoFiles = (statements) => {
  const files = [[]];
  let bytes = 0;
  for (const statement of statements) {
    const size = Buffer.byteLength(statement) + 1;
    const current = files[files.length - 1];
    if (current.length && (current.length >= MAX_FILE_STATEMENTS || bytes + size > MAX_FILE_BYTES)) {
      files.push([]);
      bytes = 0;
    }
    files[files.length - 1].push(statement);
    bytes += size;
  }
  return files;
};

/** Loads the generated files into an in-memory SQLite and compares every row with the export. */
const selfCheck = (files, collections) => {
  const { DatabaseSync } = require('node:sqlite');
  const schemaFile = path.join(WORKER, 'schema.sql');
  const db = new DatabaseSync(':memory:');
  db.exec(fs.existsSync(schemaFile) ? fs.readFileSync(schemaFile, 'utf8') : SPEC_SCHEMA);
  for (const file of files) db.exec(fs.readFileSync(path.join(OUT, file), 'utf8'));

  let rows = 0;
  for (const { name, docs } of collections) {
    if (!docs.length) continue;
    const stored = new Map(db.prepare('SELECT id, data, version FROM docs WHERE collection = ?').all(name).map((row) => [row.id, row]));
    if (stored.size !== docs.length) throw new Error(`Self-check: ${name} has ${stored.size} rows, the export has ${docs.length}.`);
    for (const { id, json } of docs) {
      const row = stored.get(id);
      if (!row || row.version !== 1 || !isDeepStrictEqual(JSON.parse(row.data), JSON.parse(json))) {
        throw new Error(`Self-check: ${name}/${id} did not survive the SQL round trip.`);
      }
      rows += 1;
    }
    const version = db.prepare('SELECT version FROM collection_versions WHERE collection = ?').get(name);
    if (!version || version.version !== 1) throw new Error(`Self-check: collection_versions has no row for ${name}.`);
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM docs').get().n;
  if (total !== rows) throw new Error(`Self-check: ${total} rows were loaded but ${rows} were expected.`);
  db.close();
  return rows;
};

const build = () => {
  const cloudName = newCloudName();
  const exportDir = newestExportDir();
  const summaryFile = path.join(exportDir, '_summary.json');
  const exportedAt = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')).exportedAt : null;
  // Rows are stamped with the moment the data was read from Firestore.
  const stamp = new Date(exportedAt || Date.now()).toISOString();
  const { collections, markers } = readExport(exportDir, cloudName);

  fs.mkdirSync(OUT, { recursive: true });
  // Only this script's own earlier output is removed (000-* belongs to the schema step).
  for (const file of fs.readdirSync(OUT)) {
    if (/^\d{3}-.+\.sql$/.test(file) && !file.startsWith('000-')) fs.unlinkSync(path.join(OUT, file));
  }

  const written = [];
  let number = 10;
  console.log(`Export: ${path.basename(exportDir)}${cloudName ? ` (Cloudinary URLs rewritten to "${cloudName}")` : ''}`);
  for (const collection of collections) {
    if (!collection.docs.length) {
      console.log(`${collection.name.padEnd(22)} ${'0'.padStart(6)} docs  (nothing to import)`);
      continue;
    }
    const parts = intoFiles(statementsFor(collection, stamp));
    parts.forEach((statements, index) => {
      const file = `${String(number).padStart(3, '0')}-${collection.name}${parts.length > 1 ? `-part${index + 1}` : ''}.sql`;
      fs.writeFileSync(path.join(OUT, file), `${statements.join('\n')}\n`);
      written.push(file);
      number += 10;
    });
    console.log(`${collection.name.padEnd(22)} ${String(collection.docs.length).padStart(6)} docs  ${parts.length} file(s)`);
  }

  const rows = selfCheck(written, collections);
  const markerText = Object.entries(markers).map(([type, count]) => `${type}: ${count}`).join(', ') || 'none';
  console.log(`\nTyped markers found (timestamps become ISO strings): ${markerText}`);
  console.log(`Self-check passed: ${rows} rows loaded into SQLite and deep-equal to the export.`);
  console.log(`Wrote ${written.length} files to ${OUT}`);
};

/** Per-collection row counts of a D1 database, read through wrangler from the worker folder. */
const databaseCounts = (mode) => {
  const command = `npx wrangler d1 execute ${DATABASE} --${mode} --json --command "SELECT collection, COUNT(*) AS n FROM docs GROUP BY collection"`;
  const run = spawnSync(command, { cwd: WORKER, shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = String(run.stdout || '');
  if (run.status !== 0) throw new Error(`wrangler failed (exit ${run.status}): ${String(run.stderr || output).trim().slice(0, 600)}`);
  const result = JSON.parse(output.slice(output.indexOf('[')));
  return new Map(result[0].results.map((row) => [row.collection, row.n]));
};

const verify = (mode) => {
  const { collections } = readExport(newestExportDir(), newCloudName());
  const actual = databaseCounts(mode);
  let mismatches = 0;
  console.log(`D1 (${mode}) compared with the export:`);
  for (const { name, docs } of collections) {
    const found = actual.get(name) || 0;
    const ok = found === docs.length;
    if (!ok) mismatches += 1;
    console.log(`${ok ? 'ok  ' : 'DIFF'} ${name.padEnd(22)} export ${String(docs.length).padStart(6)}   d1 ${String(found).padStart(6)}`);
    actual.delete(name);
  }
  // Collections the Worker created itself (or a later server-only export) are listed, not treated as errors.
  for (const [name, found] of actual) console.log(`     ${name.padEnd(22)} not in the export   d1 ${String(found).padStart(6)}`);
  if (mismatches) throw new Error(`${mismatches} collection(s) do not match the export.`);
  console.log('All exported collections match.');
};

try {
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    const mode = ['local', 'remote'].find((name) => args.includes(`--${name}`));
    if (!mode) throw new Error('Use --verify --local or --verify --remote.');
    verify(mode);
  } else {
    build();
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
