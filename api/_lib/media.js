import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// The store's photos and reel videos live in the Cloudflare R2 bucket "suitauragirls-media" and are read
// straight from https://media.suitauragirls.in (Cloudflare's CDN in front of the bucket, so a photo costs
// no Worker request). Nothing is resized on the fly: every photo is stored in ready-made sizes.
//
//   photo  i/<folder>/<id>/w160.webp … w1600.webp   seven widths, WebP
//          i/<folder>/<id>/j480.jpg, j1200.jpg       JPEG for emails and link previews
//   reel   v/<folder>/<id>/play.mp4, poster.jpg
//
// The address saved in the database is the 1100px photo (…/w1100.webp) or the video (…/play.mp4); every
// other size is the same address with the last part swapped.

export const MEDIA_BASE = 'https://media.suitauragirls.in/';
export const MEDIA_FOLDERS = new Set(['product-images', 'banners', 'hero', 'deals', 'categories', 'reels', 'reviews', 'returns', 'misc']);
export const IMAGE_WIDTHS = [160, 320, 480, 640, 828, 1100, 1600];
export const IMAGE_FILES = [...IMAGE_WIDTHS.map((width) => `w${width}.webp`), 'j480.jpg', 'j1200.jpg'];
export const VIDEO_FILES = ['play.mp4', 'poster.jpg'];
export const MAIN_IMAGE_FILE = 'w1100.webp';
export const MAIN_VIDEO_FILE = 'play.mp4';
// One upload may be this big at most (bytes). Photos arrive already resized by the browser.
export const MAX_IMAGE_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_VIDEO_FILE_BYTES = 60 * 1024 * 1024;
const GRANT_MINUTES = 30;
const ID = /^[A-Za-z0-9_-]{6,48}$/;

const secret = () => {
  if (!process.env.ADMIN_SESSION_SECRET) throw new Error('SERVER_CONFIG_MISSING');
  return process.env.ADMIN_SESSION_SECRET;
};
const signature = (payload) => createHmac('sha256', secret()).update(`media-grant|${payload}`).digest('hex').slice(0, 40);

/** Address of one stored file. */
export const mediaUrl = ({ kind, folder, id }, file) => `${MEDIA_BASE}${kind === 'video' ? 'v' : 'i'}/${folder}/${id}/${file}`;
export const mediaKey = ({ kind, folder, id }, file) => `${kind === 'video' ? 'v' : 'i'}/${folder}/${id}/${file}`;

/**
 * Permission for one browser to upload the files of ONE photo (or one reel) into one folder, for 30 minutes.
 * The browser sends it back with each file (PUT /api/media?grant=…&file=w480.webp); nothing else can be written.
 */
export const createMediaGrant = (folder, kind = 'image', { id = '' } = {}) => {
  if (!MEDIA_FOLDERS.has(folder)) throw new Error('INVALID_UPLOAD_FOLDER');
  if (kind !== 'image' && kind !== 'video') throw new Error('INVALID_UPLOAD_KIND');
  const mediaId = id || randomBytes(10).toString('hex');
  if (!ID.test(mediaId)) throw new Error('INVALID_UPLOAD_ID');
  const expires = Date.now() + GRANT_MINUTES * 60 * 1000;
  const payload = `${kind}.${folder}.${mediaId}.${expires}`;
  const subject = { kind, folder, id: mediaId };
  return {
    grant: `${payload}.${signature(payload)}`,
    kind,
    folder,
    id: mediaId,
    files: kind === 'video' ? VIDEO_FILES : IMAGE_FILES,
    widths: IMAGE_WIDTHS,
    url: mediaUrl(subject, kind === 'video' ? MAIN_VIDEO_FILE : MAIN_IMAGE_FILE),
    expiresAt: new Date(expires).toISOString(),
  };
};

/** What a grant allows, or null when it is forged, malformed or out of date. */
export const readMediaGrant = (grant, now = Date.now()) => {
  const parts = String(grant || '').split('.');
  if (parts.length !== 5) return null;
  const [kind, folder, id, expiresText, given] = parts;
  const expires = Number(expiresText);
  if ((kind !== 'image' && kind !== 'video') || !MEDIA_FOLDERS.has(folder) || !ID.test(id) || !Number.isFinite(expires) || expires < now) return null;
  let expected;
  try { expected = signature(`${kind}.${folder}.${id}.${expiresText}`); } catch { return null; }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { kind, folder, id };
};

/** The parts of an address of this store's media, or null for any other URL. */
export const parseMediaUrl = (value) => {
  const url = String(value || '').trim();
  if (url.length > 300 || !url.startsWith(MEDIA_BASE)) return null;
  const match = url.slice(MEDIA_BASE.length).match(/^(i|v)\/([a-z-]+)\/([A-Za-z0-9_-]{6,48})\/([a-z0-9]+\.(?:webp|jpg|mp4|mov|webm))$/);
  if (!match || !MEDIA_FOLDERS.has(match[2])) return null;
  return { kind: match[1] === 'v' ? 'video' : 'image', folder: match[2], id: match[3], file: match[4] };
};

/** A saved photo address (…/w1100.webp), optionally only from one folder. Returns { url, id, folder } or null. */
export const mediaImage = (value, folder = '') => {
  const parsed = parseMediaUrl(value);
  if (!parsed || parsed.kind !== 'image' || parsed.file !== MAIN_IMAGE_FILE || (folder && parsed.folder !== folder)) return null;
  return { url: String(value).trim(), id: parsed.id, folder: parsed.folder };
};

/** A saved reel video address (…/play.mp4), or null. */
export const mediaVideo = (value) => {
  const parsed = parseMediaUrl(value);
  return parsed && parsed.kind === 'video' && parsed.file === MAIN_VIDEO_FILE ? { url: String(value).trim(), id: parsed.id, folder: parsed.folder } : null;
};

/** Another stored size of the same photo or reel: mediaVariant(url, 'j480.jpg'). Other URLs come back unchanged. */
export const mediaVariant = (value, file) => {
  const parsed = parseMediaUrl(value);
  return parsed ? mediaUrl(parsed, file) : String(value || '');
};

// The Worker hands the bucket in at the start of each request (worker/src/index.js); tests can set a stand-in.
let bucket = null;
export const setMediaBucket = (value) => { bucket = value || null; };
export const getMediaBucket = () => bucket;

/**
 * Deletes every stored file of one photo or reel (all sizes), given its saved address.
 * Returns 'ok', or 'not found' when nothing was stored under it.
 */
export const deleteMedia = async (value) => {
  const parsed = parseMediaUrl(value);
  if (!parsed) throw new Error('INVALID_IMAGE_URL');
  if (!bucket) throw new Error('MEDIA_NOT_CONFIGURED');
  const prefix = `${parsed.kind === 'video' ? 'v' : 'i'}/${parsed.folder}/${parsed.id}/`;
  const listed = await bucket.list({ prefix, limit: 100 });
  const keys = (listed.objects || []).map((object) => object.key);
  // A photo that came from the old image host also has its original kept beside the sizes
  const originals = await bucket.list({ prefix: `o/${parsed.folder}/${parsed.id}.`, limit: 10 });
  keys.push(...(originals.objects || []).map((object) => object.key));
  if (keys.length === 0) return 'not found';
  await bucket.delete(keys);
  return 'ok';
};
