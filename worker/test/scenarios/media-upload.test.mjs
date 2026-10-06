// Scenario: PUT /api/media (worker/src/media.js): one ready-made file of a photo or reel is stored in the R2
// bucket, and only what a server-signed grant allows. The bucket here is a stand-in that remembers what it got.
// Run: node --test worker/test/scenarios/media-upload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'media-upload-test-secret-0001';
const { handleMedia } = await import('../../src/media.js');
const { createMediaGrant, mediaImage, mediaVariant, mediaVideo, parseMediaUrl, MAX_IMAGE_FILE_BYTES } = await import('../../../api/_lib/media.js');

const bucket = () => {
  const stored = new Map();
  return { stored, put: async (key, bytes, options) => { stored.set(key, { bytes: bytes.length, ...options.httpMetadata }); } };
};
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const put = (env, grant, file, body, method = 'PUT') => handleMedia(new Request(`https://store.example/api/media?grant=${encodeURIComponent(grant)}&file=${encodeURIComponent(file)}`, { method, body: method === 'PUT' ? body : undefined }), env);

test('upload: a photo\'s files are stored under the granted id, with a year of caching', async () => {
  const media = bucket();
  const grant = createMediaGrant('product-images');
  const first = await put({ MEDIA: media }, grant.grant, 'w480.webp', WEBP);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, url: `https://media.suitauragirls.in/i/product-images/${grant.id}/w480.webp`, bytes: WEBP.length });
  assert.equal((await put({ MEDIA: media }, grant.grant, 'j480.jpg', JPEG)).status, 200);
  assert.deepEqual([...media.stored.entries()], [
    [`i/product-images/${grant.id}/w480.webp`, { bytes: WEBP.length, contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' }],
    [`i/product-images/${grant.id}/j480.jpg`, { bytes: JPEG.length, contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' }],
  ]);
  // A browser that cannot write WebP sends JPEG bytes under the .webp name: stored as the JPEG it is
  await put({ MEDIA: media }, grant.grant, 'w160.webp', JPEG);
  assert.equal(media.stored.get(`i/product-images/${grant.id}/w160.webp`).contentType, 'image/jpeg');
});

test('upload: refused without a valid grant, for any other file name, for the wrong kind of bytes and when too large', async () => {
  const media = bucket();
  const env = { MEDIA: media };
  const grant = createMediaGrant('reviews', 'image', { id: 'rv_' + 'a'.repeat(24) });
  assert.equal((await put(env, 'not-a-grant', 'w480.webp', WEBP)).status, 403);
  assert.equal((await put(env, grant.grant.replace('reviews', 'product-images'), 'w480.webp', WEBP)).status, 403, 'a grant cannot be moved to another folder');
  assert.equal((await put(env, grant.grant, '../../secret.webp', WEBP)).status, 400);
  assert.equal((await put(env, grant.grant, 'w999.webp', WEBP)).status, 400);
  assert.equal((await put(env, grant.grant, 'play.mp4', MP4)).status, 400, 'a photo grant does not take a video');
  assert.equal((await put(env, grant.grant, 'w480.webp', PNG)).status, 415);
  assert.equal((await put(env, grant.grant, 'j480.jpg', WEBP)).status, 415);
  assert.equal((await put(env, grant.grant, 'w480.webp', new Uint8Array(0))).status, 400);
  const big = new Uint8Array(MAX_IMAGE_FILE_BYTES + 1);
  big.set(WEBP);
  assert.equal((await put(env, grant.grant, 'w1600.webp', big)).status, 413);
  assert.equal((await put(env, grant.grant, 'w480.webp', WEBP, 'GET')).status, 405);
  assert.equal((await put({}, grant.grant, 'w480.webp', WEBP)).status, 503, 'no bucket bound');
  assert.equal(media.stored.size, 0, 'nothing was stored by any refused request');
});

test('upload: a reel is one MP4 and its poster', async () => {
  const media = bucket();
  const grant = createMediaGrant('reels', 'video');
  assert.equal((await put({ MEDIA: media }, grant.grant, 'play.mp4', MP4)).status, 200);
  assert.equal((await put({ MEDIA: media }, grant.grant, 'poster.jpg', JPEG)).status, 200);
  assert.equal((await put({ MEDIA: media }, grant.grant, 'play.mp4', WEBP)).status, 415, 'not an MP4');
  assert.equal((await put({ MEDIA: media }, grant.grant, 'w480.webp', WEBP)).status, 400);
  assert.deepEqual([...media.stored.keys()], [`v/reels/${grant.id}/play.mp4`, `v/reels/${grant.id}/poster.jpg`]);
  assert.equal(media.stored.get(`v/reels/${grant.id}/play.mp4`).contentType, 'video/mp4');
});

test('addresses: only this store\'s media is recognised, and one photo\'s other sizes are found from its saved address', () => {
  const saved = 'https://media.suitauragirls.in/i/product-images/abc12345/w1100.webp';
  assert.deepEqual(parseMediaUrl(saved), { kind: 'image', folder: 'product-images', id: 'abc12345', file: 'w1100.webp' });
  assert.deepEqual(mediaImage(saved), { url: saved, id: 'abc12345', folder: 'product-images' });
  assert.equal(mediaImage(saved, 'reviews'), null);
  assert.equal(mediaImage(saved.replace('w1100', 'w480')), null, 'only the saved address counts as the photo');
  assert.equal(mediaVariant(saved, 'j480.jpg'), 'https://media.suitauragirls.in/i/product-images/abc12345/j480.jpg');
  assert.equal(mediaVariant('https://elsewhere.example/a.jpg', 'j480.jpg'), 'https://elsewhere.example/a.jpg');
  assert.deepEqual(mediaVideo('https://media.suitauragirls.in/v/reels/reel1234/play.mp4'), { url: 'https://media.suitauragirls.in/v/reels/reel1234/play.mp4', id: 'reel1234', folder: 'reels' });
  for (const bad of ['http://media.suitauragirls.in/i/product-images/abc12345/w1100.webp', 'https://media.suitauragirls.in.evil.example/i/product-images/abc12345/w1100.webp', 'https://media.suitauragirls.in/i/private/abc12345/w1100.webp', 'https://media.suitauragirls.in/i/product-images/../x/w1100.webp', 'https://media.suitauragirls.in/i/product-images/abc12345/w1100.webp?x=1']) {
    assert.equal(parseMediaUrl(bad), null, bad);
  }
});
