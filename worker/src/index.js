import process from 'node:process';
import { setEnv } from './env.js';
import { handleDb } from './gateway.js';
import { runNodeHandler } from './node-adapter.js';
import { handleMedia } from './media.js';
import { setMediaBucket } from '../../api/_lib/media.js';
import * as adminConfig from '../../api/admin-config.js';
import * as orders from '../../api/orders.js';
import * as customerAuth from '../../api/customer-auth.js';
import * as payu from '../../api/payu.js';
import * as reviews from '../../api/reviews.js';
import * as track from '../../api/track.js';
import * as alerts from '../../api/alerts.js';
import * as sitemap from '../../api/sitemap.js';
import * as razorpayWebhook from '../../api/webhooks/razorpay.js';

/**
 * Worker entry. The handlers in api/** are plain Node-style (req, res) handlers; this file only decides which one
 * gets the request. Everything that is not an API path is a static file or the single-page app.
 */
const API_MODULES = new Map([
  ['/api/admin-config', adminConfig],
  ['/api/orders', orders],
  ['/api/customer-auth', customerAuth],
  ['/api/payu', payu],
  ['/api/reviews', reviews],
  ['/api/track', track],
  ['/api/alerts', alerts],
  ['/api/sitemap', sitemap],
  ['/api/webhooks/razorpay', razorpayWebhook],
  // /sitemap.xml is answered by the sitemap handler
  ['/sitemap.xml', sitemap],
]);
const DB_PATH = '/api/db';
// Uploads of photos and reel videos into the R2 bucket (reading goes to media.suitauragirls.in, not here)
const MEDIA_PATH = '/api/media';

// Sent with every response. public/_headers covers static files only, so responses
// made by the Worker get them here.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};

/** api/** reads its settings from process.env, so the Worker's string bindings and secrets are put there. */
const exposeEnv = (env) => {
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === 'string' && process.env[name] !== value) process.env[name] = value;
  }
  // api/_lib/firebaseAdmin.js refuses to start without this variable; the shims never read its content.
  process.env.FIREBASE_SERVICE_ACCOUNT ||= '{}';
};

/**
 * Seconds a response may be kept for every visitor, or 0. Nothing on Workers acts on `s-maxage` by itself, so
 * it has to be done by hand. Only plain 200 answers qualify: nothing with a cookie, and nothing that varies
 * by request header (the cache key is the URL alone, so such a response could reach the wrong visitor).
 */
const sharedCacheSeconds = (response) => {
  if (response.status !== 200 || response.headers.has('Set-Cookie') || response.headers.has('Vary')) return 0;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  if (/\b(private|no-store|no-cache)\b/.test(cacheControl)) return 0;
  const match = cacheControl.match(/\bs-maxage\s*=\s*(\d+)/);
  return match ? Number(match[1]) : 0;
};

/** A cache problem must never fail a request: the handler can always answer. */
const cacheMatch = async (key) => {
  try {
    return await caches.default.match(key);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'Cache read failed', error: error?.message }));
    return undefined;
  }
};

const cachePut = (key, response) => caches.default.put(key, response)
  .catch((error) => console.error(JSON.stringify({ level: 'error', message: 'Cache write failed', error: error?.message })));

/** Runs one api/** handler. GET answers that carry `s-maxage` (catalogue, sitemap) are served from the edge cache. */
const serveApi = async (apiModule, request, ctx) => {
  const run = () => runNodeHandler(apiModule.default, request, { rawBody: apiModule.config?.api?.bodyParser === false });
  if (request.method !== 'GET') return { response: await run(), cache: '' };

  // Key: the full URL (the catalogue URL carries a 5-minute bucket, so it is a clean key).
  const key = new Request(request.url, { method: 'GET' });
  const cached = await cacheMatch(key);
  if (cached) return { response: cached, cache: 'hit' };

  const response = await run();
  // The stored copy keeps its Cache-Control, and Cloudflare expires it after the s-maxage in it.
  if (sharedCacheSeconds(response) <= 0) return { response, cache: '' };
  ctx.waitUntil(cachePut(key, response.clone()));
  return { response, cache: 'miss' };
};

const withSecurityHeaders = (response) => {
  // Responses from the cache and from fetch() have read-only headers, so a copy is made.
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) copy.headers.set(name, value);
  return copy;
};

const serverError = () => new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
  status: 500,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' },
});

/** Answers one API request. Never rejects: every failure becomes a 500 answer. */
const answerApi = async (apiModule, path, request, env, ctx) => {
  const startedAt = Date.now();
  let response;
  let cache = '';
  try {
    exposeEnv(env);
    setEnv(env);
    if (env.MEDIA) setMediaBucket(env.MEDIA);
    if (path === MEDIA_PATH) response = await handleMedia(request, env);
    else if (apiModule) ({ response, cache } = await serveApi(apiModule, request, ctx));
    else response = await handleDb(request, env, ctx);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', message: 'Unhandled error in Worker', method: request.method, path, error: error?.message || String(error), stack: error?.stack,
    }));
    response = serverError();
  }
  // One line per API request. The query string is left out: it can hold tokens.
  const line = JSON.stringify({ level: response.status >= 500 ? 'error' : 'info', message: 'api', method: request.method, path, status: response.status, ms: Date.now() - startedAt, cache });
  if (response.status >= 500) console.error(line);
  else console.log(line);
  return withSecurityHeaders(response);
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const apiModule = API_MODULES.get(path);
    // Static files, the app shell and unknown paths: Workers Static Assets answers (GET and HEAD), with the
    // single-page-app fallback from wrangler.jsonc and the headers from public/_headers.
    if (!apiModule && path !== DB_PATH && path !== MEDIA_PATH) return env.ASSETS.fetch(request);

    // Workers stops a request's work when the caller goes away (a closed tab, Razorpay's 5-second webhook
    // timeout) unless waitUntil holds it. The handlers were written for a runtime where a function always
    // runs to its end: a payment is marked Paid first and the confirmation emails are sent after, and a
    // retry would not send them again. So the whole request is held until it has finished.
    const answer = answerApi(apiModule, path, request, env, ctx);
    ctx.waitUntil(answer);
    return answer;
  },
};
