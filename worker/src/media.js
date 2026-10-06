import { IMAGE_FILES, MAX_IMAGE_FILE_BYTES, MAX_VIDEO_FILE_BYTES, VIDEO_FILES, mediaKey, mediaUrl, readMediaGrant } from '../../api/_lib/media.js';

// PUT /api/media?grant=<grant>&file=<name>   body: the bytes of one file
//
// Stores one ready-made file of a photo or a reel in the R2 bucket. The grant (api/_lib/media.js) names the
// one photo or reel the browser may write and is signed by the server, so this endpoint needs no cookie:
// an admin gets a grant from /api/admin-config, a signed-in customer from the review or return forms.
// Reading never comes through here: photos are read from https://media.suitauragirls.in.

const TYPES = { webp: 'image/webp', jpg: 'image/jpeg', mp4: 'video/mp4' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' } });

/** The first bytes must be what the file name says: WebP, JPEG or an MP4 container. */
const looksRight = (bytes, extension) => {
  if (extension === 'jpg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  // A browser that cannot write WebP sends JPEG bytes under the .webp name; both are accepted there
  if (extension === 'webp') return (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) || (bytes[0] === 0xff && bytes[1] === 0xd8);
  if (extension === 'mp4') return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70; // "ftyp"
  return false;
};

export const handleMedia = async (request, env) => {
  if (request.method !== 'PUT') return json(405, { error: 'Method not allowed.' });
  if (!env.MEDIA) return json(503, { error: 'Photo storage is not set up yet.' });
  const url = new URL(request.url);
  const subject = readMediaGrant(url.searchParams.get('grant'));
  if (!subject) return json(403, { error: 'This upload link has expired. Please try again.' });
  const file = String(url.searchParams.get('file') || '');
  const allowed = subject.kind === 'video' ? VIDEO_FILES : IMAGE_FILES;
  if (!allowed.includes(file)) return json(400, { error: 'This file cannot be uploaded here.' });
  const extension = file.split('.').pop();
  const limit = extension === 'mp4' ? MAX_VIDEO_FILE_BYTES : MAX_IMAGE_FILE_BYTES;
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) return json(413, { error: extension === 'mp4' ? 'This video is too large (60 MB at most).' : 'This photo is too large.' });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return json(400, { error: 'The file is empty.' });
  if (bytes.length > limit) return json(413, { error: extension === 'mp4' ? 'This video is too large (60 MB at most).' : 'This photo is too large.' });
  if (!looksRight(bytes, extension)) return json(415, { error: extension === 'mp4' ? 'Please upload an MP4 video.' : 'This does not look like a photo.' });

  const isJpegInWebp = extension === 'webp' && bytes[0] === 0xff;
  await env.MEDIA.put(mediaKey(subject, file), bytes, {
    httpMetadata: { contentType: isJpegInWebp ? 'image/jpeg' : TYPES[extension], cacheControl: 'public, max-age=31536000, immutable' },
  });
  return json(200, { ok: true, url: mediaUrl(subject, file), bytes: bytes.length });
};
