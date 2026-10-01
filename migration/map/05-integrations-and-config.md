# 05 — Integrations and configuration (everything that lives outside the code)

Scope: every external account, key, URL, dashboard setting and browser-side storage key that the current
Vercel + Firebase build of www.suitauragirls.in depends on, and what has to be re-created or re-pointed for
the Cloudflare Workers + D1 + Better Auth + new Cloudinary target.

Method: read-only inspection of the working tree on 2026-10-01 (which has many uncommitted changes on top of
commit `dc72a31`). No live service was called. Secret values are never shown; secrets are referred to by
variable name only. Anything not provable from the files is marked **unverified**.

---

## 0. Top risks (read this first)

| # | Risk | Evidence |
|---|------|----------|
| R1 | **Four files in `public/` are not tracked by git**: `robots.txt`, `og-image.jpg`, `suit-aura-logo-512.png`, `suit-aura-logo-480.webp`. Vercel gets them today because the site is deployed from the local folder by CLI. A Cloudflare build from GitHub would ship without robots.txt, without the OG image and without the Razorpay checkout logo. | `git status --short public` shows `??` for those 4 files; logo used at `src/lib/payments.ts:83`; OG image at `index.html:121,126`; robots at `public/robots.txt:1-10` |
| R2 | **Review ids are keyed with the Firebase service-account private key.** `customerReviewId` = HMAC(`private_key` from `FIREBASE_SERVICE_ACCOUNT`, `email|productId`). When that env var disappears the "one review per customer per product" id changes, so existing reviews can no longer be found/updated by their author. Existing ids must be migrated as opaque values and a replacement secret chosen deliberately. | `api/reviews.js:67-75` |
| R3 | **Server-only Firestore collections were NOT in the data export**: `private_settings` (Razorpay keyId/keySecret/webhookSecret, PayU merchantKey/salt, Gemini key), `admin_credentials` (admin username + scrypt hashes + secret path slug), `customer_email_otps`, `rate_limits`, `analytics_dedup` all failed with permission-denied because the export used the client SDK. These need an Admin-SDK export or manual re-entry. | `migration/data/export-2026-10-01T18-15-19/_summary.json`; rules `firestore.rules:78-85,141-143`; `api/_lib/payu.js:3-5`; `api/_lib/gemini.js:20`; `api/admin-config.js:184` |
| R4 | **Server-side Cloudinary checks are pinned to one cloud name** (`CLOUDINARY_CLOUD_NAME`). The moment that env var points to the new cloud, every stored URL that still has the old cloud name fails: delete (`INVALID_IMAGE_URL`), Gemini photo read, review-photo and return-photo validation. Stored URLs must be rewritten **before or together with** the env switch. | `api/_lib/cloudinary.js:29-44,50-53`; `api/_lib/gemini.js:104-113`; `api/reviews.js:53-61`; `api/_lib/orders.js:747-754`; `api/orders.js:602-603` |
| R5 | **Old Cloudinary URLs also live in places a script cannot reach**: shoppers' `localStorage` (cart, wishlist, saved catalogue, guest orders), emails already sent (return photos, price-drop product photo) and order item snapshots. The old Cloudinary account must stay alive (it is "do not delete" anyway) or those images break. | `src/context/ShopContext.tsx:139,178,399,474`; `src/lib/catalog.ts:48-62`; `api/_lib/email.js:212,229`; `api/alerts.js:25-27` |
| R6 | **Hard-coded Google OAuth client id of the old Firebase project** in the browser bundle. A new Google account means a new OAuth client (authorised JavaScript origin `https://www.suitauragirls.in`), and the constant must change. Google sign-in is additionally gated by a build-time flag. | `src/utils/googleSignIn.ts:4-5` |
| R7 | **Vercel CDN behaviour the code relies on has no automatic Cloudflare equivalent**: `s-maxage` on the catalogue and sitemap responses is honoured by Vercel's edge; a Worker response is not edge-cached unless the Worker uses the Cache API (or KV). Without it every visitor hits D1. | `api/admin-config.js:484-486,492-494`; `api/sitemap.js:82`; `src/lib/catalog.ts:64-72` |
| R8 | **Workers Free CPU limit vs. this code** (my knowledge, **unverified** against current Cloudflare pricing): the free plan allows about 10 ms CPU per request. `scryptSync` for admin login/PIN (`api/admin-config.js:188-201`), base64 of up to 6 photos x 4 MB for Gemini (`api/_lib/gemini.js:17-18,115-123`), and jsPDF are CPU-heavy. Also a per-request subrequest cap (about 50 on free) vs. the price-drop loop that sends one Brevo call per wishlist owner (`api/alerts.js:49-72`). Decide Free vs. Workers Paid before porting. |
| R9 | **Moving nameservers to Cloudflare moves ALL DNS**, not just the website record: Brevo sender-authentication records, any Google Search Console TXT verification, MX records. None of these are visible in the repo (**unverified** what exists at GoDaddy). Export the full GoDaddy zone first. |
| R10 | `.env.local` in the repo root contains live secret **values** for `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `VERCEL_OIDC_TOKEN` (file is git-ignored via `.gitignore:7,11`). Do not copy this file into the new repo or any CI log. |

---

## 1. Environment variables

### 1.1 Server (Vercel functions, `process.env.*`)

| Name | Used at | Purpose | Secret? | New stack |
|------|---------|---------|---------|-----------|
| `FIREBASE_SERVICE_ACCOUNT` | `api/_lib/firebaseAdmin.js:13`; `api/reviews.js:70` | Full service-account JSON for Admin SDK (Firestore, custom tokens, ID-token verify). Also (R2) its `private_key` is the HMAC key for review ids. | Yes | Removed (D1 binding + Better Auth). Needed once more for an Admin-SDK export (R3). Replace the review-id key with a new secret, e.g. `REVIEW_ID_SECRET` (name is a proposal). |
| `FIREBASE_DATABASE_ID` | `api/_lib/firebaseAdmin.js:25` | Optional Firestore database id, default `(default)` (`:7`). | No | Removed. |
| `ADMIN_SESSION_SECRET` | `api/admin-config.js:281,308`; `api/customer-auth.js:18,158`; `api/_lib/payu.js:146` | One HMAC key with three jobs: signs the admin session cookie, hashes customer OTP codes, signs the PayU "payment result" link token. | Yes | Keep as a Worker secret (new random value is fine). Changing it signs the admin out, invalidates OTP codes in flight (10 min) and PayU result links (2 days, `api/_lib/payu.js:144`). Better Auth needs its own secret too (`BETTER_AUTH_SECRET` by convention; **unverified** until the auth design doc fixes the name). |
| `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD` / `ADMIN_INITIAL_PIN` | `api/admin-config.js:211-213,257-259` | (a) Bootstraps `admin_credentials/singleton` on first login if the doc is missing (`:206-228`). (b) Plain-text fallback login when Firestore is down (`:230-262,531-542`). | Yes | Needed for first login on the empty new DB unless `admin_credentials` is migrated (R3). The Firestore-down fallback becomes pointless on D1; decide whether to keep it. |
| `VERCEL` | `api/admin-config.js:296` | Adds `; Secure` to the admin cookie only when `VERCEL === '1'`. | No | **Must be replaced**: on Workers this is undefined, so the cookie would be issued without `Secure`. Set `Secure` unconditionally in production. |
| `CLOUDINARY_CLOUD_NAME` | `api/_lib/cloudinary.js:8`; `api/orders.js:276,602`; `api/reviews.js:53,83`; `api/_lib/gemini.js:105`; `api/_lib/orders.js:747` | Cloud name for signing, delete, and URL allow-listing. | No (public in every image URL) | New cloud name. See R4. |
| `CLOUDINARY_API_KEY` | `api/_lib/cloudinary.js:9`; `api/orders.js:276`; `api/reviews.js:83` | Sent to the browser with each upload signature (`api/_lib/cloudinary.js:25`). | Low (public by design) | New account's key. |
| `CLOUDINARY_API_SECRET` | `api/_lib/cloudinary.js:10`; `api/orders.js:276`; `api/reviews.js:83` | SHA-1 signing of uploads and destroys. Never sent to the browser. | Yes | New account's secret (Worker secret). |
| `RAZORPAY_KEY_ID` | `api/_lib/payu.js:54` | Fallback key id when none is saved in Admin -> Payment Gateways. | No (public key id) | Same Razorpay account -> same value. |
| `VITE_RAZORPAY_KEY_ID` | `api/_lib/payu.js:54` (server only; **not** referenced anywhere in `src/`) | Second fallback for the key id. Present in `.env.local` and `.env.example:24`. | No | Drop the `VITE_` variant; keep only `RAZORPAY_KEY_ID`. |
| `RAZORPAY_KEY_SECRET` | `api/_lib/payu.js:55` | Fallback key secret (Basic auth to Razorpay REST, HMAC for checkout signature). | Yes | Worker secret. |
| `RAZORPAY_WEBHOOK_SECRET` | `api/webhooks/razorpay.js:31`; `api/_lib/payu.js:60`; `api/admin-config.js:30` | Verifies `x-razorpay-signature`. Accepted **in addition to** the admin-saved one. | Yes | Worker secret; must equal the secret configured on the Razorpay webhook. |
| `BREVO_API_KEY` | `api/_lib/email.js:11`; `api/orders.js:704,706,710` | Brevo transactional API + delivery-events/senders lookups. | Yes | Worker secret (same Brevo account, or new key if Brevo also moves — open question Q3). |
| `BREVO_SENDER_EMAIL` | `api/_lib/email.js:12`; `api/_lib/orders.js:32`; `api/orders.js:714` | From-address; also the fallback "store alert" recipient. Code fallback is a hard-coded Gmail address at `api/_lib/email.js:12` and `api/_lib/orders.js:32`. | No | Plain var. Must be a sender verified in Brevo. |
| `GEMINI_API_KEY` | `api/_lib/gemini.js:38` | Fallback Gemini key when none is saved in `private_settings/ai_assistant`. | Yes | Worker secret. A key from the **new** Google account is preferable (free quota is per project). |
| `TRACK_WRITE_BUDGET` | `api/track.js:31` | Daily cap on analytics writes (default 8000) to protect the Firestore free quota. | No | Re-tune for D1's daily row-write allowance or keep as a safety valve. |

Test-only reads (not production): `api/_lib/alerts.test.mjs:5` (`BREVO_API_KEY`), `api/_lib/payu.test.mjs:17,56-58`.

Which of these are actually set in the Vercel **production** environment is **unverified** — `.env.local`
(a `vercel env pull` of another environment) holds only `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`VITE_RAZORPAY_KEY_ID` plus Vercel system variables. Sensitive Vercel vars cannot be pulled by CLI; the owner
must read them in the Vercel dashboard or issue fresh ones.

### 1.2 Browser bundle (`import.meta.env.*`, build time)

| Name | Used at | Purpose | Secret? |
|------|---------|---------|---------|
| `VITE_GOOGLE_LOGIN` | `src/utils/googleSignIn.ts:5` (consumed at `src/components/LoginPage.tsx:162,267`, `src/components/GoogleOneTap.tsx:21`) | `'1'` shows the Google button and One Tap. Any other value hides Google sign-in completely. | No |

That is the **only** `import.meta.env` read in `src/`, `index.html` and `vite.config.ts`. It must be supplied
as a build-time variable in the Cloudflare build (Workers Builds variable or `.env.production`), otherwise
Google sign-in silently disappears. Per project notes it is `1` in production (**unverified** from files).

### 1.3 Build/dev only

| Name | Used at | Purpose |
|------|---------|---------|
| `DISABLE_HMR` | `vite.config.ts:29-30` | Turns off Vite HMR/file watching (AI Studio leftover). Not needed in production. |

### 1.4 Listed in `.env.example` but unused by the code — do not carry over

- `APP_URL` (`.env.example:9`) — no reference in `api/`, `src/`, `vite.config.ts`.
- `VITE_BREVO_API_KEY` (`.env.example:27`) — no reference; a `VITE_` prefix would put an API key in the browser bundle if anything ever read it. Delete it from the template.

### 1.5 Config that is hard-coded instead of being an env var

| What | Where | Note |
|------|-------|------|
| Site origin `https://www.suitauragirls.in` | `api/_lib/email.js:2`; `api/orders.js:36`; `api/alerts.js:10`; `api/sitemap.js:3`; `api/admin-config.js:41-44`; `src/App.tsx:151`; `src/components/ProductDetailPage.tsx:98`; `src/components/ShopPage.tsx:36`; `src/components/admin/AdminLeads.tsx:43`; `index.html:118-126`; `public/robots.txt:10` | Domain stays, so nothing changes — but a staging hostname (`*.workers.dev`) will produce production links in emails, PayU `surl/furl` and canonicals. Consider a single `SITE_URL` var for staging. |
| Firebase web config | `firebase-applet-config.json` (keys: `projectId`, `appId`, `apiKey`, `authDomain`, `storageBucket`, `messagingSenderId`, `measurementId`), imported at `src/lib/firebase.ts:5` and `src/utils/googleSignIn.ts:60` | Public web config of project `thor-217e7` (`.firebaserc:3`). Removed with Firebase. |
| Google OAuth client id | `src/utils/googleSignIn.ts:4` | Public; belongs to the old project (R6). |
| Cloudinary root folder `suitauragirls` | `api/_lib/cloudinary.js:4`; `src/utils/imageHelper.ts:36`; `src/utils/reels.ts:64` | Public ids must keep this prefix in the new cloud (section 6). |
| Admin entry slugs `drdaina`, `d4daina` | `src/utils/adminEntry.ts:7-9`; `api/admin-config.js:222,261,338`; `vercel.json:66-112` | Header rules are per slug. The owner can change the slug in Settings -> Security (`api/admin-config.js:622`), in which case the header rules do not cover it. |
| Store phone / WhatsApp / address / Instagram | `src/utils/storeContact.ts:1-17` | Not an integration key, but owner-specific. |
| Email footer city | `api/_lib/email.js:43` | Text only. |

---

## 2. `vercel.json` and the Cloudflare equivalent

Source: `vercel.json:1-128`. There is no `regions`, `crons`, `redirects` or `cleanUrls` entry.

| Vercel setting | Lines | What it does | Cloudflare Workers equivalent |
|----------------|-------|--------------|-------------------------------|
| Rewrite `/sitemap.xml` -> `/api/sitemap` | `vercel.json:4-7` | Dynamic sitemap. | Route `/sitemap.xml` in the Worker itself. With static assets, list it in `assets.run_worker_first` together with `/api/*`. |
| Rewrite `/(.*)` -> `/` | `vercel.json:8-11` | SPA fallback (filesystem and `/api` win first). | `assets.not_found_handling = "single-page-application"` in `wrangler.jsonc`. |
| `/assets/(.*)`: `Cache-Control: public, max-age=31536000, immutable` | `vercel.json:14-22` | Hashed Vite chunks cached for a year. | `public/_headers` rule for `/assets/*` (static-asset headers), or set in the Worker. |
| All paths: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` | `vercel.json:23-43` | Security headers on pages **and** API responses. | `_headers` covers static assets only; API responses must add the same headers in the Worker (one middleware). Note `microphone=()` while the app has a voice-search button (`src/components/VoiceSearchButton.tsx`) — behaviour today is whatever it is; do not "fix" silently. |
| `/admin`, `/admin/*`, `/drdaina`, `/drdaina/*`, `/d4daina`, `/d4daina/*`: `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` | `vercel.json:44-121` | Keeps the admin shell out of search engines and caches. | Same six rules in `_headers`. Whether `_headers` rules apply to SPA-fallback responses for those paths is **unverified** — test, or set the headers in the Worker for those prefixes. |
| `functions["api/admin-config.js"].maxDuration = 60` | `vercel.json:122-126` | Gemini "fill from photos" can take long. Other functions use the plan default. | Workers have no wall-clock cap while the client is connected, but have a CPU cap (R8). |

Vercel platform behaviours the code depends on implicitly:

| Behaviour | Where | Workers change |
|-----------|-------|----------------|
| `req.query`, `req.body` auto-parsed (JSON and urlencoded) | `api/admin-config.js:371`; `api/payu.js:13-21,36`; `api/alerts.js:101`; `api/_lib/http.js:11-21` | Parse `new URL(request.url).searchParams` / `await request.json()` / `await request.formData()` by hand. PayU posts `application/x-www-form-urlencoded`. |
| Raw body for webhook: `export const config = { api: { bodyParser: false } }` | `api/webhooks/razorpay.js:8-16` | `await request.text()` gives the raw body natively. Verify the HMAC over that exact string before `JSON.parse`. |
| Client IP from `x-forwarded-for` | `api/_lib/http.js:34-36`; `api/admin-config.js:512` | Use `CF-Connecting-IP`. All rate limits key on it. |
| Same-origin check via `x-forwarded-host || host` | `api/_lib/http.js:24-32`; `api/admin-config.js:345-354` | Compare `Origin` with `new URL(request.url).host`. |
| Edge cache honours `s-maxage` / `stale-while-revalidate` | `api/admin-config.js:486,494`; `api/sitemap.js:82` | Cache API or KV (R7). The client already adds a 5-minute bucket `&v=` to the URL (`src/lib/catalog.ts:22,67,72`), which makes a clean cache key. |
| Warm-instance module caches | `api/_lib/payu.js:8,26-43` (gateways, 20 s); `api/admin-config.js:205,236,239,268`; `api/_lib/gemini.js:10-11`; `api/track.js:32` | Isolates are short-lived and per-location; treat these as best-effort only. |
| Node APIs: `node:crypto` (`createHmac`, `createHash`, `timingSafeEqual`, `randomInt`, `randomBytes`, `scryptSync`), `Buffer` | `api/admin-config.js:3`; `api/customer-auth.js:1`; `api/_lib/payu.js:1`; `api/_lib/cloudinary.js:1` | Needs the `nodejs_compat` flag. `scryptSync` availability and cost on Workers is **unverified** — test early (existing admin password/PIN hashes are scrypt, `api/admin-config.js:188-201`). |
| Admin cookie `sag_admin_session`; `HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age` 400 days or 12 h | `api/admin-config.js:48-54,295-299` | Keep the same `Path` only if the admin API keeps the same URL; otherwise existing admin sessions are dropped (acceptable, but tell the owner). |
| Vercel project link | `.vercel/project.json` (keys `projectId`, `orgId`, `projectName`) | Not migrated. Keep the Vercel project untouched as the rollback target. |

API routes that exist today and must keep their paths (the SPA and external dashboards call them):
`/api/admin-config`, `/api/orders`, `/api/customer-auth`, `/api/reviews`, `/api/alerts`, `/api/track`,
`/api/payu`, `/api/webhooks/razorpay`, `/api/sitemap` (+ `/sitemap.xml`). `robots.txt` disallows `/api/`
(`public/robots.txt:3`).

---

## 3. Razorpay (LIVE)

### 3.1 Where the keys come from

`razorpayCreds()` (`api/_lib/payu.js:51-65`): if `private_settings/payment_gateways.razorpay` has both
`keyId` and `keySecret` they win ("source: admin"); otherwise env `RAZORPAY_KEY_ID` / `VITE_RAZORPAY_KEY_ID`
and `RAZORPAY_KEY_SECRET`. Mode is derived from the key prefix (`rzp_live_` / `rzp_test_`, `:61`). Webhook
signatures are accepted with **either** the admin-saved `webhookSecret` or env `RAZORPAY_WEBHOOK_SECRET`
(`:59-60`). Settings are cached 20 s and fall back to env-only defaults after a 3 s DB timeout (`:26-43`).

Admin can save keys in Admin -> Payment Gateways: validated (`api/admin-config.js:661-668`), then checked live
against Razorpay before saving (`:9-15,669-672`), stored in the server-only doc (`:690`). The admin view never
returns secrets, only 4-character hints (`:7,18-32`). Which source is active in production is **unverified**
(the doc was not exported, R3).

A test-mode gateway is offered only to a signed-in admin (`api/_lib/payu.js:67-72`).

### 3.2 REST calls made by the server (Basic auth `keyId:secret`)

| Call | Where | When |
|------|-------|------|
| `POST https://api.razorpay.com/v1/orders` `{amount (paise), currency: 'INR', receipt: <orderNumber>, notes: {order_number, customer_email}}` | `api/orders.js:45-62`, called at `:372,390-394,498` | Checkout create, retry of the same checkout, "pay again". |
| `GET /v1/orders/{id}/payments` | `api/orders.js:108-121` | Reconcile an unpaid order (looks for a `captured` payment) from the payment-result page. |
| `GET /v1/orders?count=1` | `api/admin-config.js:9-15` | Key validation when the admin saves new keys. |
| `GET /v1/payments?count=25` | `api/admin-config.js:405-423` | Admin "recent payments" diagnostic. |

No refund API is called: refunds are done by hand in the Razorpay dashboard (`api/orders.js:718`,
`api/_lib/email.js:239`).

### 3.3 Browser

- Checkout script `https://checkout.razorpay.com/v1/checkout.js` loaded on demand (`src/lib/payments.ts:24-35`); preconnect/dns-prefetch in `index.html:134-135`.
- Options: `key` = key id returned by the server (`api/orders.js:102`), `order_id`, `amount`, `currency`, `name`, `image: '/suit-aura-logo-512.png'` (R1), `notes.order_number`, theme colour, method blocks (`src/lib/payments.ts:9-22,76-104`).
- On success the browser posts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `/api/orders` action `verify`; the server checks `HMAC-SHA256(secret, order_id|payment_id)` (`api/orders.js:506-522`).

### 3.4 Webhook

- URL: `https://www.suitauragirls.in/api/webhooks/razorpay` (`api/webhooks/razorpay.js:25`; shown to the admin at `api/admin-config.js:44`).
- Events handled: `payment.captured`, `order.paid`; everything else answers 200 `{ignored:true}` (`api/webhooks/razorpay.js:52`).
- Signature: hex `HMAC-SHA256(secret, rawBody)` compared in constant time with header `x-razorpay-signature` (`:39-44`). No secret configured -> 503 (`:37`).
- Order lookup: `payload.order.entity.receipt` or `payment.notes.order_number`, else query `orders` by `razorpayOrderId` (`:60-64`) — the D1 schema needs an index on that column.
- Effects: `finalizePaidOrder(...source:'webhook')`, confirmation email, store alert (`:67-73`). Non-2xx on error so Razorpay retries (`:77-78`).

### 3.5 Dashboard actions

- Domain stays -> **webhook URL does not change**. Nothing to edit in Razorpay if the same account and same webhook secret are used.
- Put the same `RAZORPAY_WEBHOOK_SECRET` (and/or re-enter the admin-saved one) on the new stack **before** DNS cutover; a mismatch returns 401 and payments from closed tabs are not confirmed.
- Razorpay "website/app" whitelisting is tied to the domain, not the host — no change expected (**unverified** in dashboard).
- If Razorpay keys are regenerated for the move, do it after cutover and enter them in Admin -> Payment Gateways; the code accepts old-env + new-admin webhook secrets at the same time (`api/_lib/payu.js:59-60`).

---

## 4. PayU

- Credentials exist **only** in `private_settings/payment_gateways.payu` = `{enabled, mode: 'test'|'live', merchantKey, salt}` (`api/_lib/payu.js:7,17-22`). There is no env fallback. Default is disabled (`:7`). Whether PayU is live in production is **unverified** (R3).
- Saved from Admin -> Payment Gateways with format checks (`api/admin-config.js:656-659,680-689`); the salt is never returned, only a hint (`:33-39`).
- Endpoints by mode (`api/_lib/payu.js:76-78`): pay `https://secure.payu.in/_payment` / `https://test.payu.in/_payment`; verify `https://info.payu.in/merchant/postservice?form=2` / `https://test.payu.in/merchant/postservice.php?form=2`.
- Request: browser form-POST built by the server (`api/orders.js:65-81`, `src/lib/payments.ts:38-51`). Fields: `key, txnid, amount, productinfo, firstname, email, phone, udf1=<orderNumber>, surl, furl, hash`. `txnid` = `<orderNumber>-<n>` (`api/orders.js:369,398,495`).
- Request hash: `sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)` (`api/_lib/payu.js:84-87`).
- Response hash: `sha512([additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)` (`:89-95`), compared in constant time (`:97-101`).
- Return URLs: `surl` and `furl` are both `https://www.suitauragirls.in/api/payu` (`api/orders.js:76-77`). Server-to-server webhook: `https://www.suitauragirls.in/api/payu?webhook=1` for "Successful" and "Failed" (`api/payu.js:6-9`; `api/admin-config.js:41-43`).
- Callback handling (`api/payu.js:35-100`): checks merchant key + response hash, checks `txnid` is in `order.payuTxnIds`, then asks PayU's `verify_payment` API (hash `sha512(key|verify_payment|txnid|salt)`, up to 3 tries, `api/_lib/payu.js:108-141`) and requires `success` + amount within 0.5 of `finalTotal`. Browser is redirected with **303** to `/checkout?payment=done|pending|failed&order=...&t=<signed token>` (`api/payu.js:25-28,45-47`); token = HMAC with `ADMIN_SESSION_SECRET`, 2-day TTL (`api/_lib/payu.js:143-157`).
- `/api/payu` has **no** same-origin check (it is posted from PayU's origin). Keep it exempt from any CSRF/origin middleware and from Better Auth's origin checks.
- Test-mode payments are flagged `testPayment` and never emailed (`api/payu.js:74-76`).
- Dashboard: domain stays -> `surl/furl` are sent per request and the webhook URL is unchanged. Only action: re-enter merchant key + salt in the new admin panel (or migrate `private_settings`).

---

## 5. Brevo (transactional email)

- Transport: `POST https://api.brevo.com/v3/smtp/email`, header `api-key: BREVO_API_KEY`, sender name "Suit Aura Girls", sender email `BREVO_SENDER_EMAIL` or the hard-coded Gmail fallback (`api/_lib/email.js:10-31`). Plain `fetch` — ports to Workers unchanged.
- No Brevo-hosted templates: every email is HTML built in code with one shared `layout()` (`api/_lib/email.js:33-44`).
- Missing key -> `EMAIL_NOT_CONFIGURED`; rejection -> `EMAIL_DELIVERY_FAILED` (`:13,26-30`).
- Store-alert recipient: `storeSettings.storeEmail` from `storefront_settings`, else `BREVO_SENDER_EMAIL`, else the hard-coded fallback (`api/_lib/orders.js:28-33`).
- Every customer order email is appended to `order.emailLog` (`api/orders.js:163-169`).

### 5.1 Every email

| # | Email | To | Trigger | Code |
|---|-------|----|---------|------|
| 1 | OTP code ("<code> is your Suit Aura Girls verification code"), purposes `signup` / `login`, 10 min | Customer | `/api/customer-auth` action `send` | `api/_lib/email.js:194-205`; `api/customer-auth.js:85` |
| 2 | Order confirmed (items table + address) | Customer | First time an order becomes paid: checkout `verify`, Razorpay webhook, PayU callback, payment-result reconcile | template `api/_lib/email.js:99-104`; sent at `api/orders.js:468,518`, `api/webhooks/razorpay.js:69`, `api/payu.js:78` |
| 3 | New order alert ("New order ... paid") | Store | Same moments as #2 (skipped for PayU sandbox) | `api/_lib/email.js:173-192`; `api/_lib/orders.js:39-48` |
| 4 | Status emails: `Packed`, `Shipped`, `In Transit`, `Out for Delivery`, `Delivered`, `Cancelled`, `Refunded` | Customer | Admin changes order status with "notify" not switched off | templates `api/_lib/email.js:105-141`; `api/orders.js:803` |
| 5 | Cancellation requested | Store | Customer `request-cancel` | `api/orders.js:217-241,669` |
| 6 | "Your order is going ahead" (cancel request kept) | Customer | Admin keeps the order | `api/orders.js:187-212,802` |
| 7 | Return / exchange requested (with photo thumbnails) | Store | Customer `return-request` | `api/_lib/email.js:226-244`; `api/orders.js:245-253,646` |
| 8 | Return updates: `approved`, `rejected`, `received`, `refunded`, `exchanged` | Customer | Admin `admin-return` with notify | `api/_lib/email.js:246-309`; `api/orders.js:256-266,732` |
| 9 | Price drop on a wishlist item | Customers whose `profiles.wishlist` has the product | Admin saves a product (`check-product`) and the price really fell; logged once in `alert_log` | `api/alerts.js:48-72,146-152` |
| 10 | Back in stock | `stock_alerts` subscribers | Same trigger, product became available again | `api/alerts.js:74-94` |
| 11 | Admin test email | Address typed by the admin | Admin `admin-test-email` | `api/orders.js:682-698` |

Also uses Brevo read APIs for the admin "email events" tool: `GET /v3/smtp/statistics/events` and
`GET /v3/senders` (`api/orders.js:701-716`).

Links inside emails point to `/track-order?order=`, `/my-orders`, `/contact`, `/product/<id>`,
`/admin/orders/<n>` on the production origin (`api/_lib/email.js:73,175,292,303`; `api/alerts.js:30`).
Note `/admin/...` is a retired address in the SPA (`src/utils/adminEntry.ts:56`) — existing behaviour, listed
here only so nobody "fixes" routing by accident during the port.

### 5.2 What Better Auth changes

Better Auth's email-OTP plugin will call a `sendVerificationOTP` hook — wire it to the existing
`sendOtpEmail` so the email looks identical. The current limits to reproduce: 6 digits, 10 min lifetime,
30 s resend cooldown, 5 wrong tries -> 30 min lock, 8 sends/day per email, 15 sends/hour per IP
(`api/customer-auth.js:7-13`).

### 5.3 Dashboard / DNS

- If the Brevo account stays: nothing changes except where the API key is stored.
- If Brevo moves to the new Google account: new API key, re-verify the sender address.
- The sender is a Gmail address per the code fallback; domain authentication (DKIM/DMARC records for `suitauragirls.in`) is **unverified**. If such records exist at GoDaddy they must be copied to Cloudflare DNS (R9).

---

## 6. Cloudinary

### 6.1 How uploads are signed

All uploads are **direct browser -> Cloudinary** with a server-made SHA-1 signature
(`sha1(sorted "k=v&..." + API secret)`, `api/_lib/cloudinary.js:15-18`). No unsigned preset is used.

| Flow | Signer | Signed params | Who may call | Browser side |
|------|--------|---------------|--------------|--------------|
| Admin images/videos | `createUploadSignature(folder)` -> `{cloudName, apiKey, folder: 'suitauragirls/<folder>', timestamp, signature}` (`api/_lib/cloudinary.js:21-26`), route `POST /api/admin-config?action=cloudinary-sign` (`api/admin-config.js:566-569`) | `folder`, `timestamp` | Admin session cookie | `src/lib/dataStore.ts:98-126` (images); `src/components/admin/AdminReels.tsx:49-83` (video + poster, `/video/upload` or `/image/upload`) |
| Review photo | `photoUploadSignature(key)` (`api/reviews.js:82-88`) | `allowed_formats`, `folder: suitauragirls/reviews`, `overwrite: false`, `public_id: <key>`, `timestamp` | Signed-in customer (rate-limited) | `src/components/ProductReviews.tsx:304` |
| Return photo | `returnPhotoSignature(key)` (`api/orders.js:275-281`) | `allowed_formats`, `overwrite: false`, `public_id: suitauragirls/returns/rt_<24 hex>`, `timestamp` | Signed-in owner of a returnable order (`api/orders.js:565-586`) | `src/components/ReturnRequestForm.tsx:177` |

Allowed admin folders: `product-images`, `banners`, `hero`, `deals`, `categories`, `reels`, `reviews`,
`returns` (`api/_lib/cloudinary.js:5`); the TypeScript type lists only the first five
(`src/lib/dataStore.ts:96`).

**Folder-mode warning (unverified, must be tested on the new account):** new Cloudinary accounts use
"dynamic folders", where the `folder` upload parameter may no longer be prefixed onto the public id. Two of
the three flows sign `folder` (admin uploads and review photos) and then expect the delivery URL to contain
`suitauragirls/...`: `parseDeliveryUrl` (`api/_lib/cloudinary.js:41-43`), the review-photo regex
(`api/reviews.js:58`), the Gemini photo filter (`api/_lib/gemini.js:110`). The return-photo flow already
avoids this by signing the full `public_id` (comment at `api/orders.js:270-274`). On the new account either
sign a full `public_id`/`public_id_prefix` for all flows or confirm the account setting, and upload one test
image per flow before cutover.

### 6.2 Delete

- `destroyImage(url)` -> `POST https://api.cloudinary.com/v1_1/<cloud>/<image|video>/destroy` with `public_id`, `timestamp` (+ `invalidate=true` for video), signed (`api/_lib/cloudinary.js:50-64`). Refuses any URL that is not `res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/(image|video)/upload/...` containing the `suitauragirls` segment (`:29-44`).
- Route `POST /api/admin-config?action=cloudinary-delete`, up to 50 URLs, 207 on partial failure (`api/admin-config.js:570-573`); client `deleteImages` (`src/lib/dataStore.ts:131-137`).
- Called when products are deleted (`src/context/ProductContext.tsx:458`), images removed in the product form (`src/components/admin/AdminProductForm.tsx:322,473`), reels deleted/replaced (`src/components/admin/AdminReels.tsx:264-272,359`), category photos (`src/components/admin/AdminCategories.tsx:67`), review photos (`api/reviews.js:94-103`).
- **Migration safety:** during the transition the new stack must never be given the **old** account's API secret, otherwise an admin delete on the new site destroys originals in the old account (violates "nothing deleted").

### 6.3 URL transformation helpers (all string-based, all assume `res.cloudinary.com`)

| Helper | Where | Transformation |
|--------|-------|----------------|
| `getCleanImageUrl(url, w)` | `src/utils/imageHelper.ts:10-59` | Inserts `f_auto,q_auto,c_limit,w_<w or 960>` after `/image/upload/` when the path starts with `v<digits>/` or `suitauragirls/` (`:36-38`). Also rewrites `images.unsplash.com` URLs (`:44-56`). |
| `reelVideoSrc` | `src/utils/reels.ts:73-74` | `q_auto,vc_auto,c_limit,w_720`, extension -> `.mp4`. |
| `reelPosterSrc` | `src/utils/reels.ts:77-82` | Custom poster via `getCleanImageUrl`, else first frame `so_0,f_auto,q_auto,c_limit,w_<w>` as `.jpg`. |
| `hasTransformation` | `src/utils/reels.ts:62-65` | Same `v<digits>/` or `suitauragirls/` test for videos. |
| `smallCopyOf` | `src/utils/detectColour.ts:582-588` | `c_limit,w_400` (colour detection, loaded with CORS). |
| Gemini `photoUrl` | `api/_lib/gemini.js:104-113` | `w_1024,h_1280,c_limit,q_auto:good,f_jpg`; only own cloud + `/suitauragirls/`. |
| Email `photoThumb` | `api/_lib/email.js:212` | `c_limit,w_<w>,f_jpg,q_auto` for return photos. |
| OG / JSON-LD image | `src/components/ProductDetailPage.tsx:106,119` | `getCleanImageUrl(img, 1200)`. |
| URL validators | `api/admin-config.js:71-72`; `src/utils/reels.ts:21-28`; `src/lib/dataStore.ts:128-129` | Any cloud name accepted (regex on host + `/image|video/upload/`). |

Consequence: the browser helpers are cloud-name agnostic. A rewritten URL works as long as it keeps the
`/image/upload/` or `/video/upload/` marker and the next path segment is `v<digits>/` or `suitauragirls/`.
Transformations are generated on the fly, so each new derived size consumes credits on the new account the
first time it is requested. `AdminReels` warms the video rendition after upload
(`src/components/admin/AdminReels.tsx:93-102`) and caps reels at 40 MB because of the free-plan
on-the-fly video limit (`:18-21`; `src/utils/reels.ts:71`).

### 6.4 Where image/video URLs are stored

Type fields (`src/types.ts`): `ProductColor.imageUrl` (`:27`), `Review.imageUrl` (`:44`), `Product.image`
(`:53`), `Product.images[]` (`:59`), `Product.videoUrl` (`:79`), `ReturnRequestItem.image` (`:220`),
`ReturnRequest.photos[]` (`:236`), `CategoryItem.image` (`:281`), `HeroBannerConfig.image` /
`.bannerImage` (`:322-323`), `Banner.image` (`:338`), `DealOfTheDayConfig.bannerImage` (`:431`); Aura reels
`videoUrl` / `posterUrl` (`src/utils/reels.ts:10-12`).

Counts of Cloudinary URL occurrences in the local export `migration/data/export-2026-10-01T18-15-19/`
(one distinct cloud name across all files):

| Export file | Occurrences | Why |
|-------------|-------------|-----|
| `products.json` | 235 | `image`, `images[]`, `colors[].imageUrl` |
| `categories.json` | 3 | `image` |
| `storefront_settings.json` | 11 | `value_json` strings of `auraReels`, `dealOfTheDay`, `heroConfig` (URLs are inside JSON-in-a-string) |
| `reviews.json` | 2 | `imageUrl` |
| `orders.json` | 110 | Product snapshots in `items[]`, plus return photos |
| `profiles.json` | 93 | Cart / wishlist product snapshots |
| `abandoned_checkouts.json` | 961 | Cart snapshots |
| `hero_slides.json` | 0 | Empty collection |

Not in the export (R3) but containing URLs: `review_photos/<key>.url` (`api/reviews.js:94-99`),
`return_photos` (keys only, `api/orders.js:584`). The `banners` setting key was not among the 8 exported
settings docs (`auraReels, comboOffer, dealOfTheDay, discovery, heroConfig, homepageSections,
instagramReels, storeSettings`) — a banners doc apparently does not exist yet (**unverified**).

Existing local asset download (`migration/scripts/download-cloudinary-assets.cjs`, output
`migration/data/assets/_manifest.json`): 128 distinct assets, about 212 MB — `product-images` 118,
`categories` 3, `deals` 1, `reviews` 2, `reels` 3 videos + 1 image. **4 manifest entries failed to download**
and there are no `hero`, `banners` or `returns` assets in it; both points need a follow-up before upload.

### 6.5 Moving to the new cloud name

1. Finish the download (resolve the 4 failed entries; confirm whether any return photos exist).
2. Upload every original to the new account with the **same public id** (`suitauragirls/<folder>/<name>`), `overwrite=false`, correct `resource_type` (image/video). Use the server-side Upload API with the new account's key/secret from a local script, never from the app.
3. Build an old-URL -> new-URL map: replace the cloud-name segment, and drop or replace the `v<digits>` version segment (versions differ between accounts; a URL without a version is valid, and `suitauragirls/` as the first segment still satisfies the helpers in 6.3).
4. Rewrite URLs in the exported data **before** importing into D1: the fields in 6.4, including the JSON strings inside `storefront_settings.value_json`, and the product snapshots inside orders / profiles / abandoned checkouts. A global regex replace over the export files is the simplest and safest (the download script already uses the same regex, `download-cloudinary-assets.cjs:21`).
5. Verify: every rewritten URL returns 200 with `f_auto,q_auto,c_limit,w_960` applied; one admin upload, one delete of a throw-away image, one reel upload, one review photo, one return photo on staging.
6. Keep the old Cloudinary account untouched (R5). Do not point the new stack's destroy call at it (6.2).

Cloudinary free-plan credits cover storage + bandwidth + transformations together (**unverified** current
numbers); 212 MB of originals plus video transcodes is small, but ad traffic bandwidth is the real consumer.

---

## 7. Google services

| Item | Evidence | New-account action |
|------|----------|--------------------|
| Firebase project `thor-217e7` (Firestore + Auth) | `.firebaserc:3`; `firebase.json:1-5`; `firebase-applet-config.json`; `src/lib/firebase.ts:5-36` (two named apps: default + `sag-admin`) | Not re-created. Keep it alive, read-only, as rollback. |
| Firebase Analytics (GA4 via `measurementId`) | `src/lib/firebase.ts:4,38-49` — started on production hostnames only | **This is the only analytics tag on the site.** It disappears with the Firebase SDK. If the owner wants GA4, create a property under the new Google account and add gtag explicitly (owner decision, Q5). |
| Google sign-in | Google Identity Services script `https://accounts.google.com/gsi/client` (`src/utils/googleSignIn.ts:12-24`), client id constant (`:4`), FedCM One Tap (`:36-44`; `src/components/GoogleOneTap.tsx`). The Google credential is exchanged on a throw-away Firebase app `sag-google` (`:57-67`) and verified by Firebase Admin, requiring provider `google.com` and `email_verified` (`api/customer-auth.js:164-186`). | New OAuth 2.0 Web client under the new Google account: authorised JavaScript origins `https://www.suitauragirls.in` (and apex if served), plus the staging origin. Better Auth Google provider needs client id + **client secret** (new Worker secrets, conventional names `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, **unverified** until the auth doc fixes them) and, for redirect flow, the redirect URI `https://www.suitauragirls.in/api/auth/callback/google` (Better Auth default path, **unverified**). To keep the present UX (GIS button + One Tap, no redirect), use Better Auth's ID-token sign-in / One Tap plugin. OAuth consent screen must be published (not "Testing") with the store's name, logo, privacy-policy URL (`/privacy-policy`). |
| Admin toggle for One Tap | `discovery.features.googleOneTap` in `storefront_settings` (`api/admin-config.js:69`; `src/utils/discovery.ts:36,52`) | Data, migrates with settings. |
| Gemini API | REST `https://generativelanguage.googleapis.com/v1beta` with header `x-goog-api-key` (`api/_lib/gemini.js:6,77,246`). Key: `private_settings/ai_assistant.geminiKey`, else env `GEMINI_API_KEY` (`:26-39`). Model ladder discovered per key (`:72-98`), chosen model saved back (`api/admin-config.js:593`). Admin saves/clears the key at `api/admin-config.js:633-649`; only the last 4 characters are ever shown (`api/_lib/gemini.js:42-47`). Photos are fetched from Cloudinary server-side, max 6 x 4 MB (`:17-18,115-128`). | New free key from AI Studio under the new Google account; enter in Admin or set `GEMINI_API_KEY`. After the Cloudinary switch only new-cloud URLs are readable (R4). CPU/memory on Workers: R8. |
| Google Fonts | `index.html:131-136` (Cormorant Garamond, Manrope) | No account. |
| Google Maps link | `src/utils/storeContact.ts:13` | Plain link, no key. |
| Google Search Console | No verification meta tag in `index.html`; no verification file in `public/` | Verification method is **unverified** (probably DNS TXT). Preserve the record when DNS moves; add the new Google account as an owner in Search Console. |
| Meta Pixel / GTM / gtag / Clarity / Hotjar | None found in `index.html` or `src/` | Nothing to move. Ad attribution today is first-party only: UTM capture (`src/utils/utmTracker.ts:14-15,28-69`) + `/api/track`. |
| AI Studio leftovers | `metadata.json`; `.env.example:1-9`; `src/utils/imageHelper.ts:65-72` (`ais-dev-` / `ais-pre-` origin rewrite); `firebase-blueprint.json` | Not needed on Cloudflare. |

Other third-party browser calls (no keys, nothing to re-create): `api.postalpincode.in`
(`src/lib/addressBook.ts:348`, `src/components/CheckoutPage.tsx:358`, `src/components/AccountPage.tsx:685`,
`src/components/DeliveryCheck.tsx:26`), OpenStreetMap Nominatim + tiles (`src/lib/addressBook.ts:321-327`,
`src/components/CheckoutPage.tsx:410`, `src/components/MapPinPicker.tsx:106`), courier tracking links
(`src/utils/courier.ts:20-30`), `wa.me`, Instagram links. If a Content-Security-Policy is ever added, these
hosts plus `res.cloudinary.com`, `api.cloudinary.com`, `checkout.razorpay.com`, `api.razorpay.com`,
`accounts.google.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `secure.payu.in` / `test.payu.in`
(form action) must be allowed. There is no CSP today (`vercel.json:23-43`).

---

## 8. SEO

| Item | Evidence | Migration note |
|------|----------|----------------|
| `robots.txt` | `public/robots.txt:1-10`: allow all; disallow `/api/`, `/checkout`, `/cart`, `/account`, `/login`, `/order-confirmation`; `Sitemap: https://www.suitauragirls.in/sitemap.xml` | Static file — **untracked in git (R1)**. |
| Sitemap | `/sitemap.xml` -> `api/sitemap.js` (`vercel.json:4-7`). Reads `products` (selected fields, `:51-53`), keeps visible ones (not hidden, not `accessory`, has a real image, `:20-27`), emits `/`, `/shop`, 8 static pages (`:4`), `/category/<slug>` (slug rule `:7-14`, default category `Suits` `:61`, synthetic `kids` `:66-68`), `/product/<id>` with `lastmod`. `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (`:82`). 500 text on DB failure (`:84-87`). | Re-implement on D1; **product ids must stay identical** or indexed `/product/<id>` URLs break. `toDay` handles Firestore timestamps (`:30-39`) — make dates ISO strings in D1. Needs explicit caching (R7). |
| Static head | `index.html:110-127`: title, description, OG (title, description, type, url, site_name, image 1200x630, locale `en_IN`), Twitter card, `theme-color`, `robots index, follow`, canonical to the home page | Unchanged. Because this is a client-rendered SPA, crawlers and link-preview bots that do not run JS see only these defaults on every URL. Same on Vercel today; a Worker could inject per-route meta later (optional, not parity). |
| Route head | `src/App.tsx:122-157`: titles per route; canonical + `og:url` = origin + path; `noindex, follow` for cart, checkout, account, login, order-confirmation, not-found, track-order; admin = `noindex, nofollow` | In bundle. |
| Product head | `src/components/ProductDetailPage.tsx:90,96-171`: title/description from `seoTitle`/`seoDescription`, `og:image`, canonical `/product/<id>`, JSON-LD `Product` (offer, availability, `aggregateRating` from approved reviews only) + `BreadcrumbList` | In bundle. Depends on Cloudinary URLs (OG image). |
| Listing head | `src/components/ShopPage.tsx:376-445`: title/description/canonical per category, occasion, search; `noindex, follow` for search results and empty listings | In bundle. |
| Admin noindex headers | `vercel.json:44-121` | `_headers` / Worker (section 2). |
| www vs apex | Everything canonicalises to `https://www.suitauragirls.in` | Apex -> www redirect is configured outside the repo (**unverified**, Vercel domain settings). On Cloudflare: custom domain on `www`, plus a redirect rule for the apex, 301, path-preserving. |
| OG image | `public/og-image.jpg` | **Untracked (R1)**. |

---

## 9. PWA, service worker, caching, browser storage

- **No PWA**: no web app manifest, no service worker registration (no `serviceWorker` reference in `src/`; no manifest or sw file in `public/` or `dist/`). Nothing to unregister after cutover.
- `index.html:8-109` ships an inline shim: in-memory `localStorage`/`sessionStorage` fallback for blocked storage, plus `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `crypto.randomUUID` polyfills. Keep it byte-for-byte.
- Vite build: hashed files under `/assets/`, manual chunks `react` and `firebase` (`vite.config.ts:14-25`) — the `firebase` chunk entry must be removed when the SDK is removed or the build fails. After a deploy, a tab holding old chunk names reloads once (`src/components/ErrorBoundary.tsx:14,29-30`).
- HTTP caching: `/assets/*` immutable (`vercel.json:14-22`); API JSON `no-store` (`api/_lib/http.js:4-9`); catalogue `s-maxage=600` + SWR 600, degraded copy `s-maxage=60` (`api/admin-config.js:484-494`); sitemap `s-maxage=3600` (`api/sitemap.js:82`).
- Firebase Auth keeps its session in IndexedDB (SDK default; no persistence call in `src/lib/firebase.ts`). After the move **every customer and the admin are signed out once** and sign in again with the same email code / Google — expected, unavoidable.

### 9.1 `localStorage` keys (all on origin `https://www.suitauragirls.in`, so they survive the host move)

| Key | Where | Content / note |
|-----|-------|----------------|
| `sag_cart_v1`, `sag_cart_backup`, `sag_cart_owner` | `src/context/ShopContext.tsx:139,144,371-373,399-400,487-488,560-561,931-932` | Cart with product snapshots (old Cloudinary URLs, R5). |
| `sag_wishlist_v1`, `sag_wishlist_owner` | `src/context/ShopContext.tsx:178,451-453,474,566,616` | Wishlist snapshots. |
| `sag_orders_v1`, `sag_guest_orders`, `sag_last_guest_email`, `sag_last_guest_phone` | `src/context/ShopContext.tsx:201,630,655,660-664,680`; `src/components/CheckoutPage.tsx:569-570` | Local order cache / guest order list. |
| `sag_custom_user` | `src/context/AuthContext.tsx:24,28,60-75,94`; `src/context/ShopContext.tsx:328` | Cached signed-in customer. Must be reconciled with the Better Auth session on first load (stale cache with no session should be cleared, as `AuthContext` does today for Firebase). |
| `sag_registered_accounts` | `src/context/AuthContext.tsx:45` | Legacy key, only removed. |
| `sag_user_profile_<email>`, `sag_user_profile_current` | `src/components/AccountPage.tsx:669`; `src/components/CheckoutPage.tsx:303,481-482`; `src/lib/addressBook.ts:123,174` | Saved profile/address per email. |
| `sag_address_book_v1` | `src/lib/addressBook.ts:31,89,106` | Address book. |
| `sag_user_delivery_location_v1`, `sag_user_pincode` | `src/context/ShopContext.tsx:306,319`; `src/components/DeliveryCheck.tsx:11,44,103` | Delivery location / PIN. |
| `sag_catalog_saved_v1` | `src/lib/catalog.ts:48-62` | Last good catalogue JSON, used for up to 3 days when the server is slow. **Its shape is the `/api/admin-config?action=catalog` response** — the new endpoint must return the same shape (`settings, products, categories, reviews, coupons, generatedAt`, `api/admin-config.js:467-482`) or the validity check must be bumped to a `_v2` key. |
| `sag_admin_live` | `src/lib/catalog.ts:21,30,39-40` | Marks a browser where the admin signed in -> reads live data instead of the cached catalogue. |
| `sag_custom_products_v1` | `src/context/ProductContext.tsx:18,58,104` | Product cache. |
| `sag_recently_browsed`, `sag_recent_searches_v1`, `sag_helpful_reviews` | `src/components/ProductDetailPage.tsx:86-87,175`; `src/components/Header.tsx:17`; `src/components/ProductReviews.tsx:35` | Personalisation; shopper memory helper at `src/utils/shopperMemory.ts:10,17`. |
| `sag_unique_visitor_id`, `sag_tracked_date_v1`, `sag_cart_date_v1`, `sag_checkout_date_v1`, `sag_last_activity_v1` | `src/utils/visitorTracker.ts:32-35,304` | Visitor analytics dedup (id format `vis_...`, validated at `api/track.js:23`). |
| `sag_utm_params_backup_v1` | `src/utils/utmTracker.ts:15` | Ad attribution backup. |
| Admin: `sag_admin_auth`, `sag_admin_email`, `sag_admin_session_version`, `sag_admin_security_v2`, `sag_admin_remember`, `sag_admin_returns_seen_v1` | `src/context/AdminContext.tsx:483-606,1109-1183`; `src/utils/adminEntry.ts:21`; `src/components/admin/AdminLogin.tsx:29-30`; `src/components/admin/AdminReturns.tsx:23` | `sag_admin_security_v2.secretPathSlug` decides which URL prefix is the admin area on that browser. |
| Admin local mirrors: `sag_customers_local`, `sag_homepage_sections_local`, `sag_hero_config_local`, `sag_banners_local`, `sag_store_settings_local`, `sag_payment_settings_local`, `sag_deal_of_the_day`, `sag_instagram_reels` | `src/context/AdminContext.tsx:651-822` | Local copies of settings; can hold old Cloudinary URLs on the owner's phone. |

### 9.2 `sessionStorage` keys

`sag_cart_session` (`src/context/ShopContext.tsx:149,489`), `sag_checkout_attempt` and
`sag_checkout_session_id` (`src/components/CheckoutPage.tsx:22-25,200-203`), `sag_last_order` (`:567`;
`src/components/OrderConfirmationPage.tsx:60`; `src/components/TrackOrderPage.tsx:29`), `sag_payu_pending`
(`src/components/CheckoutPage.tsx:574,712`), `sag_after_login` (`src/components/LoginPage.tsx:130-152`),
`sag_onetap_dismissed` (`src/components/GoogleOneTap.tsx:8`), `sag_write_review`
(`src/components/ProductReviews.tsx:162`), `sag_build_look_v1` (`src/components/BuildYourLook.tsx:19`),
`sag_look_palettes_v1` (`src/utils/colourMatch.ts:63`), `sag_utm_params_v1` (`src/utils/utmTracker.ts:14`),
`sag_fs_quota_exceeded` (`src/utils/visitorTracker.ts:36`), `sag_ti_<event>_<value>` (`:372`),
`sag_chunk_reload` (`src/components/ErrorBoundary.tsx:14`).

### 9.3 Cookies

Only one first-party cookie: `sag_admin_session` (`api/admin-config.js:48,298`). Customers have no cookie
today (Bearer Firebase ID token, `src/lib/api.ts:13-24`; `api/_lib/http.js:42-58`). Better Auth will add
its own session cookie(s) — the "Bearer token on every `/api` call" client code in `src/lib/api.ts` is
replaced by cookie credentials (`credentials: 'same-origin'` is already sent, `src/lib/api.ts:29`).

---

## 10. Target-side configuration to create (proposal)

Worker bindings / variables (names are proposals unless they already exist in the code):

| Kind | Name | Notes |
|------|------|-------|
| D1 binding | `DB` | Drizzle. |
| Static assets | `ASSETS` (`./dist`) | `not_found_handling: single-page-application`; `run_worker_first: ["/api/*", "/sitemap.xml"]`. |
| Compatibility | `nodejs_compat` | For `node:crypto` / `Buffer`. |
| Secrets | `ADMIN_SESSION_SECRET`, `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_INITIAL_PIN`, `CLOUDINARY_API_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BREVO_API_KEY`, `GEMINI_API_KEY`, Better Auth secret, Google OAuth client secret, review-id secret (R2) | `wrangler secret put`, typed by the owner or pasted into the dashboard — never in chat, never in git. |
| Plain vars | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `RAZORPAY_KEY_ID`, `BREVO_SENDER_EMAIL`, `TRACK_WRITE_BUDGET`, site URL, Google OAuth client id | `wrangler.jsonc` `vars`. |
| Build var | `VITE_GOOGLE_LOGIN=1` | Build-time. |
| Optional | KV or Cache API for catalogue + sitemap; a Cron Trigger to purge expired OTP / rate-limit rows (Firestore docs carry `expiresAt`, `api/customer-auth.js:35`, `api/orders.js:299`, but no TTL policy is visible in the repo — **unverified** whether one exists in the Firebase console) | |

Note on Workers env access: Vercel code reads `process.env.X` at call time. On Workers, `process.env` is
populated from bindings only with a recent compatibility date + `nodejs_compat` (**unverified** for the date
chosen); the safe port is to pass `env` explicitly.

---

## 11. Checklist — what the owner must provide or do by hand

Accounts and keys (owner enters secrets himself in the Cloudflare dashboard or terminal prompt):

- [ ] New Gmail address; Cloudflare account created with it; domain added to Cloudflare (when ready).
- [ ] GitHub repo link, and **commit the 4 untracked `public/` files** (R1) — or approve that we do it on a branch.
- [ ] New Cloudinary account: Cloud Name (can be shared), API Key, API Secret (secret). Tell us whether it is in dynamic-folder mode (6.1).
- [ ] Decide: Razorpay stays on the **same** Razorpay account (recommended — it is KYC-bound and live)? If yes, provide Key ID, Key Secret, Webhook Secret into the new stack; nothing changes in the Razorpay dashboard.
- [ ] PayU: is it live today? If yes, merchant key + salt and mode to re-enter in the new Admin -> Payment Gateways.
- [ ] Brevo: keep the same Brevo account, or move? Provide API key; confirm the sender address is verified.
- [ ] Gemini: new API key from AI Studio under the new Google account (or reuse the existing one).
- [ ] Google Cloud (new account): create OAuth Web client, set authorised origin(s)/redirect URI, publish the consent screen; provide client id (public) and client secret (secret).
- [ ] Admin login for the new site: choose username / password / 6-digit PIN (or approve an Admin-SDK export of `admin_credentials` so the present ones keep working), and confirm the private admin slug currently in use.
- [ ] One-time Admin-SDK export of the server-only collections (R3) — needs the existing `FIREBASE_SERVICE_ACCOUNT` and available Firestore quota (after the daily reset or on Blaze). Owner approval required because it reads live Firestore.
- [ ] Read the production env var list in the Vercel dashboard and confirm which names from section 1.1 are set (values stay there).
- [ ] DNS: export the full current zone at GoDaddy (all A/CNAME/MX/TXT), then nameserver change or record change at the agreed time with ads paused. Confirm how the apex redirects to `www` today.
- [ ] Google Search Console: add the new Google account as owner; resubmit `sitemap.xml` after cutover.
- [ ] Decide Workers Free vs. Paid (R8) and whether GA4 should be added back (it vanishes with Firebase).
- [ ] After cutover: one real small Razorpay payment, one closed-tab payment (webhook path), one OTP login, one Google login, one admin image upload + delete.
- [ ] Leave Vercel project, Firebase project and old Cloudinary account untouched for at least the agreed rollback window; never delete the old Cloudinary (R5).

## 12. Checklist — what can be scripted

- [ ] Finish Cloudinary download (re-run `migration/scripts/download-cloudinary-assets.cjs`; investigate the 4 failures).
- [ ] Upload all originals to the new cloud with identical public ids; emit old->new URL map; verify each with a HEAD request against the **new** cloud only.
- [ ] Rewrite Cloudinary URLs across the export JSON (including JSON-in-string settings and snapshots) before the D1 import; assert zero remaining occurrences of the old cloud name.
- [ ] Admin-SDK export script for `private_settings`, `admin_credentials`, `review_photos`, `return_photos`, `alert_state`, `alert_log`, `stock_alerts`, `shared_wishlists` (collections used at `api/alerts.js:38,56,76,103`, `api/reviews.js:95`, `api/orders.js:584`; none are in the current export summary) — run once, owner-approved.
- [ ] `wrangler.jsonc` (assets + SPA fallback + `run_worker_first` + `nodejs_compat` + D1 binding + vars) and `public/_headers` generated from `vercel.json`.
- [ ] Worker middleware: security headers on API responses, `CF-Connecting-IP`, same-origin check, admin cookie always `Secure`.
- [ ] Cache layer for `/api/admin-config?action=catalog` and `/sitemap.xml`.
- [ ] Port `api/_lib/email.js`, `api/_lib/payu.js` hashing, `api/_lib/cloudinary.js` signing unchanged in behaviour; reuse the existing unit tests (`api/_lib/orders.test.mjs`, `alerts.test.mjs`, `payu.test.mjs`, `package.json:11`) — they run offline.
- [ ] Parity test of signatures: same inputs -> same Razorpay HMAC, PayU request/response hash, Cloudinary SHA-1 between old Node code and new Worker code (pure functions, no network).
- [ ] Secret bootstrap helper that only prints the **names** still missing (`wrangler secret list` diff against section 10).
- [ ] Staging smoke test on `*.workers.dev` with Razorpay **test** keys and PayU **test** mode (both are admin-only in test mode by design, `api/_lib/payu.js:67-72`).
- [ ] Remove dead config in the new repo: `firebase.json`, `.firebaserc`, `firestore.rules`, `firebase-applet-config.json`, `firebase-blueprint.json`, `metadata.json`, `.vercel/`, `vercel.json`, `VITE_BREVO_API_KEY` / `APP_URL` lines of `.env.example`, the `firebase` manual chunk in `vite.config.ts:20`. (New repo only — the old folder stays as it is.)

---

## 13. Open questions

- Q1. Which Razorpay key source is live: env vars or the admin-saved `private_settings/payment_gateways`? Is PayU enabled and in live mode? (Not exportable with the client SDK.)
- Q2. Does "everything moves to the new Gmail" include Razorpay, PayU and Brevo accounts, or only hosting / database / images / Google login? Payment accounts are KYC-bound; recommendation is to leave them.
- Q3. Is `suitauragirls.in` authenticated in Brevo (DKIM/DMARC), and what other DNS records exist at GoDaddy?
- Q4. Workers Free or Paid, given the CPU limit and scrypt / Gemini / PDF work (R8)?
- Q5. Should GA4 be re-added (currently present only through Firebase Analytics)?
- Q6. New Cloudinary account folder mode, and whether the 4 failed downloads are deleted assets or transient errors.
- Q7. Is `VITE_GOOGLE_LOGIN=1` set in Vercel production (i.e. is Google sign-in really live)? Project notes say yes; not provable from files.
- Q8. What should replace the Firebase private key as the review-id HMAC key (R2): migrate existing review ids as-is and use a new secret for new reviews, or switch to a unique (email, productId) constraint in D1?
- Q9. Has the owner changed the admin secret path slug away from the default? Header rules cover only `admin`, `drdaina`, `d4daina`.
