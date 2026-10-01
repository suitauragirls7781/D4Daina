// Uploads the downloaded store photos and reels to the NEW Cloudinary account under the SAME public ids, so
// every stored URL keeps working once its cloud name is swapped (see build-d1-import.cjs).
//
//   node migration/scripts/upload-cloudinary-assets.cjs --dry-run   check the manifest and files, sign, send nothing
//   node migration/scripts/upload-cloudinary-assets.cjs             upload (safe to re-run: finished files are skipped)
//
// Credentials come from .env.migration (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) and
// are never printed. Uploads use overwrite=false, so nothing on the account is ever replaced or deleted.
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'migration', 'data');
const ASSETS = path.join(DATA, 'assets');
const MANIFEST = path.join(ASSETS, '_manifest.json');
const PROGRESS = path.join(ASSETS, '_upload-progress.json');
const ENV_FILE = path.join(ROOT, '.env.migration');

const CONCURRENCY = 3;
const ATTEMPTS = 3;
// Cloudinary takes a file above 100 MB only in parts (every part but the last must be at least 5 MB).
const CHUNK_THRESHOLD = 100 * 1024 * 1024;
const CHUNK_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/** KEY=VALUE lines; blank lines and # comments are skipped; surrounding quotes are removed. */
const readEnvFile = (file) => {
  if (!fs.existsSync(file)) throw new Error('.env.migration was not found in the repository root.');
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
};

// Same signature as api/_lib/cloudinary.js: sha1 of the sorted "key=value" pairs followed by the API secret.
const sign = (params, apiSecret) => {
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
};

/** The uploadable entries of the manifest, each checked against the file on disk. */
const readManifest = () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (!Array.isArray(manifest)) throw new Error('_manifest.json is not an array.');
  const assets = [];
  const skipped = [];
  const problems = [];
  const seen = new Set();
  for (const entry of manifest) {
    const key = `${entry.type}/${entry.publicId}`;
    if (entry.error) {
      // The download step could not fetch these (deleted on the old account), so there is nothing to upload.
      skipped.push(`${key} (${entry.error})`);
      continue;
    }
    const file = path.resolve(DATA, String(entry.local || ''));
    if (!['image', 'video'].includes(entry.type)) problems.push(`${key}: type must be image or video`);
    else if (typeof entry.publicId !== 'string' || !/^[^/\s?&#%<>\\]+(\/[^/\s?&#%<>\\]+)*$/.test(entry.publicId)) problems.push(`${key}: unusable public id`);
    else if (seen.has(key)) problems.push(`${key}: listed twice`);
    else if (!file.startsWith(ASSETS + path.sep)) problems.push(`${key}: file is outside migration/data/assets`);
    else if (!fs.existsSync(file)) problems.push(`${key}: file is missing (${entry.local})`);
    else if (fs.statSync(file).size !== entry.bytes || !entry.bytes) problems.push(`${key}: file size differs from the manifest`);
    else assets.push({ key, type: entry.type, publicId: entry.publicId, file, bytes: entry.bytes });
    seen.add(key);
  }
  return { assets, skipped, problems };
};

const readProgress = () => (fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : {});

// Written through a temporary file so an interrupted run can never leave a half-written progress file.
const writeProgress = (progress) => {
  fs.writeFileSync(`${PROGRESS}.tmp`, JSON.stringify(progress, null, 1));
  fs.renameSync(`${PROGRESS}.tmp`, PROGRESS);
};

const signedFields = (asset, credentials) => {
  const params = { overwrite: 'false', public_id: asset.publicId, timestamp: Math.floor(Date.now() / 1000) };
  return { ...params, api_key: credentials.apiKey, signature: sign(params, credentials.apiSecret) };
};

/** One POST to the upload endpoint; `range` is set only for the parts of a large file. */
const post = async (asset, credentials, blob, range) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(signedFields(asset, credentials))) form.set(name, String(value));
  form.set('file', blob, path.basename(asset.file));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudName}/${asset.type}/upload`, {
    method: 'POST',
    body: form,
    headers: range ? { 'X-Unique-Upload-Id': range.uploadId, 'Content-Range': `bytes ${range.start}-${range.end - 1}/${asset.bytes}` } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || `HTTP ${response.status}`);
    // Worth another try: rate limits and Cloudinary-side failures. Anything else (bad signature, too large) is final.
    error.retry = response.status === 420 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return result;
};

const uploadOnce = async (asset, credentials) => {
  const blob = await fs.openAsBlob(asset.file);
  if (asset.bytes <= CHUNK_THRESHOLD) return post(asset, credentials, blob);
  const uploadId = randomUUID();
  let result;
  for (let start = 0; start < asset.bytes; start += CHUNK_BYTES) {
    const end = Math.min(start + CHUNK_BYTES, asset.bytes);
    result = await post(asset, credentials, blob.slice(start, end), { uploadId, start, end });
  }
  return result;
};

const upload = async (asset, credentials) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await uploadOnce(asset, credentials);
      if (result.public_id !== asset.publicId) {
        throw Object.assign(new Error(`Cloudinary stored it as "${result.public_id}"`), { retry: false });
      }
      return result;
    } catch (error) {
      // Network failures and timeouts carry no `retry` flag and are retried as well.
      if (attempt >= ATTEMPTS || error.retry === false) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
};

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const env = readEnvFile(ENV_FILE);
  const credentials = { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
  const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter((name) => !env[name]);

  const { assets, skipped, problems } = readManifest();
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  console.log(`Manifest: ${assets.length} files to upload (${megabytes(total)}), ${skipped.length} without a file, ${problems.length} problems.`);
  for (const line of skipped) console.log(`  no file: ${line}`);
  for (const line of problems) console.log(`  PROBLEM: ${line}`);
  if (problems.length) throw new Error('Fix the manifest problems first (re-run download-cloudinary-assets.cjs).');

  // Progress is kept per cloud name, so pointing the script at another account starts from zero.
  const progress = readProgress();
  const done = (credentials.cloudName && progress[credentials.cloudName]) || {};
  const pending = assets.filter((asset) => !done[asset.key]);
  const chunked = assets.filter((asset) => asset.bytes > CHUNK_THRESHOLD).length;
  console.log(`Already uploaded: ${assets.length - pending.length}. Still to do: ${pending.length} (${chunked} in parts).`);

  if (dryRun) {
    const dryCredentials = { cloudName: credentials.cloudName || 'unset', apiKey: credentials.apiKey || 'unset', apiSecret: credentials.apiSecret || 'unset' };
    for (const asset of assets) {
      if (!/^[0-9a-f]{40}$/.test(signedFields(asset, dryCredentials).signature)) throw new Error(`Could not sign ${asset.key}.`);
    }
    console.log(`Dry run: ${assets.length} upload requests signed, nothing sent.`);
    console.log(missing.length ? `Still empty in .env.migration: ${missing.join(', ')}` : 'Cloudinary credentials are filled in.');
    return;
  }
  if (missing.length) throw new Error(`Fill in .env.migration first: ${missing.join(', ')}`);

  progress[credentials.cloudName] = done;
  const failures = [];
  const warnings = [];
  let finished = 0;
  const queue = [...pending];
  const worker = async () => {
    while (queue.length) {
      const asset = queue.shift();
      try {
        const result = await upload(asset, credentials);
        // overwrite=false answers with the asset that is already there: flag it if it is a different file.
        if (result.bytes !== asset.bytes) warnings.push(`${asset.key}: Cloudinary has ${result.bytes} bytes, the local file has ${asset.bytes}`);
        done[asset.key] = { bytes: result.bytes, version: result.version, existing: result.existing === true, at: new Date().toISOString() };
        writeProgress(progress);
        finished += 1;
        if (finished % 10 === 0 || !queue.length) console.log(`  ${finished}/${pending.length} uploaded`);
      } catch (error) {
        failures.push(`${asset.key}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nUploaded now: ${finished}. Already there before: ${assets.length - pending.length}. Failed: ${failures.length}. Warnings: ${warnings.length}.`);
  for (const line of warnings) console.log(`  WARNING: ${line}`);
  for (const line of failures) console.log(`  FAILED: ${line}`);
  if (failures.length) throw new Error('Some uploads failed. Run the script again: finished files are skipped.');
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
