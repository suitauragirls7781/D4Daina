// Uploads every downloaded asset (migration/data/assets, see _manifest.json) to the NEW Cloudinary account
// with the SAME public id, so stored URLs only need the cloud name swapped. Signed uploads, never overwrites,
// never deletes. Safe to re-run: finished uploads are remembered in _uploaded.json.
//
//   node migration/scripts/cloudinary-upload-now.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'migration', 'data');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.migration'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
if (!cloud || !apiKey || !apiSecret) throw new Error('Fill CLOUDINARY_* in .env.migration first.');

const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'assets', '_manifest.json'), 'utf8')).filter((a) => !a.error);
const doneFile = path.join(DATA, 'assets', '_uploaded.json');
const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};
const saveDone = () => fs.writeFileSync(doneFile, JSON.stringify(done, null, 1));

const sign = (params) => crypto.createHash('sha1')
  .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + apiSecret)
  .digest('hex');

const upload = async (asset) => {
  const file = path.join(DATA, asset.local);
  const params = { overwrite: 'false', public_id: asset.publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('api_key', apiKey);
  form.append('signature', sign(params));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${asset.type}/upload`, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || `HTTP ${response.status}`);
  // "existing: true" means it was already there (overwrite is off): also fine
  return { url: result.secure_url, bytes: result.bytes, format: result.format, existing: Boolean(result.existing) };
};

(async () => {
  const queue = manifest.filter((a) => !done[a.publicId]);
  console.log(`assets: ${manifest.length} | already uploaded: ${manifest.length - queue.length} | to upload: ${queue.length}`);
  let ok = 0, failed = 0;
  const worker = async () => {
    while (queue.length) {
      const asset = queue.shift();
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          done[asset.publicId] = await upload(asset);
          ok++;
          if (ok % 10 === 0) { saveDone(); console.log(`  ${ok} uploaded...`); }
          break;
        } catch (error) {
          if (attempt === 3) { failed++; console.log('FAILED', asset.publicId, '-', error.message); }
          else await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  saveDone();
  console.log(`done: uploaded ${ok}, failed ${failed}, total on new account ${Object.keys(done).length}/${manifest.length}`);
})();
