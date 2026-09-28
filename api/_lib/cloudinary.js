import { createHash } from 'node:crypto';

// Every upload lands under this folder, and deletes are refused outside it.
export const CLOUDINARY_ROOT_FOLDER = 'suitauragirls';
const ALLOWED_FOLDERS = new Set(['product-images', 'banners', 'hero']);

const config = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('CLOUDINARY_CONFIG_MISSING');
  return { cloudName, apiKey, apiSecret };
};

const sign = (params, apiSecret) => {
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
};

/** Signature the browser sends with its direct upload to Cloudinary. */
export const createUploadSignature = (folder) => {
  if (!ALLOWED_FOLDERS.has(folder)) throw new Error('INVALID_UPLOAD_FOLDER');
  const { cloudName, apiKey, apiSecret } = config();
  const params = { folder: `${CLOUDINARY_ROOT_FOLDER}/${folder}`, timestamp: Math.floor(Date.now() / 1000) };
  return { cloudName, apiKey, ...params, signature: sign(params, apiSecret) };
};

/** Extracts the public id from a delivery URL of this account, e.g. .../upload/v123/suitauragirls/hero/abc.jpg */
export const publicIdFromUrl = (url, cloudName) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'res.cloudinary.com') return null;
  const prefix = `/${cloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  // Drop any transformation segments and the version segment that precede the public id.
  const segments = parsed.pathname.slice(prefix.length).split('/');
  const rootIndex = segments.indexOf(CLOUDINARY_ROOT_FOLDER);
  if (rootIndex === -1) return null;
  return decodeURIComponent(segments.slice(rootIndex).join('/')).replace(/\.[a-z0-9]+$/i, '');
};

export const destroyImage = async (url) => {
  const { cloudName, apiKey, apiSecret } = config();
  const publicId = publicIdFromUrl(url, cloudName);
  if (!publicId) throw new Error('INVALID_IMAGE_URL');
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  const body = new URLSearchParams({ ...params, api_key: apiKey, signature: sign(params, apiSecret) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !['ok', 'not found'].includes(result.result)) throw new Error('CLOUDINARY_DELETE_FAILED');
  return result.result;
};
