// Downloads the ORIGINAL file of every Cloudinary asset referenced in the latest data export, so they can be
// uploaded to the new Cloudinary account later. Read-only on the old account (plain CDN downloads).
//
//   node migration/scripts/download-cloudinary-assets.cjs
//
// Output: migration/data/assets/<public id path>.<ext> and migration/data/assets/_manifest.json
// (old URL -> local file -> public id). Safe to re-run: files already downloaded are skipped.
const fs = require('fs');
const path = require('path');

const DATA = path.resolve(__dirname, '..', 'data');
const exportDir = fs.readdirSync(DATA).filter((d) => d.startsWith('export-')).sort().pop();
if (!exportDir) throw new Error('Run the export first.');
const OUT = path.join(DATA, 'assets');

// every distinct asset (the same asset with different transformations counts once)
const assets = new Map();
for (const file of fs.readdirSync(path.join(DATA, exportDir)).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  const text = fs.readFileSync(path.join(DATA, exportDir, file), 'utf8');
  for (const m of text.matchAll(/https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/(image|video)\/upload\/([^"\\ ]+)/g)) {
    const [, cloud, type, rest] = m;
    const clean = rest.replace(/^(?:[a-z]{1,3}_[^/]+\/)*/, ''); // drop transformation segments
    const noVersion = clean.replace(/^v\d+\//, '');
    const original = `https://res.cloudinary.com/${cloud}/${type}/upload/${clean}`;
    if (!assets.has(original)) assets.set(original, { cloud, type, publicIdWithExt: decodeURIComponent(noVersion), original, foundIn: file });
  }
}

(async () => {
  const list = [...assets.values()];
  const manifest = [];
  let done = 0, skipped = 0, failed = 0, bytes = 0;
  const work = async (asset) => {
    const local = path.join(OUT, asset.type, ...asset.publicIdWithExt.split('/'));
    const entry = { ...asset, local: path.relative(DATA, local).replace(/\\/g, '/'), publicId: asset.publicIdWithExt.replace(/\.[a-z0-9]+$/i, '') };
    try {
      if (fs.existsSync(local) && fs.statSync(local).size > 0) { skipped++; entry.bytes = fs.statSync(local).size; manifest.push(entry); return; }
      const response = await fetch(asset.original);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, buffer);
      entry.bytes = buffer.length; bytes += buffer.length; done++;
      manifest.push(entry);
    } catch (error) {
      failed++; entry.error = String(error.message); manifest.push(entry);
      console.log('FAILED', asset.original, error.message);
    }
  };
  const queue = [...list];
  await Promise.all(Array.from({ length: 5 }, async () => { while (queue.length) await work(queue.shift()); }));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest.sort((a, b) => a.publicId.localeCompare(b.publicId)), null, 1));
  console.log(`assets: ${list.length} | downloaded ${done} (${(bytes / 1048576).toFixed(1)} MB) | already there ${skipped} | failed ${failed}`);
})();
