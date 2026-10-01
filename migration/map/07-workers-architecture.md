# 07 — Target architecture on Cloudflare Workers (free plan) with D1 + Drizzle + Better Auth

Scope: how to run www.suitauragirls.in on Cloudflare Workers, what has to change in each part of today's
code, the limits to design around, and the order to build things. Written from a read-only review of the
repository on 2026-10-01. Nothing was called on the live site or Firestore.

Conventions

- `path:line` cites the current code. "lib/orders.js" means `api/_lib/orders.js`.
- **[CF-doc]** = checked against Cloudflare's documentation on 2026-10-01.
- **[unverified]** = from general knowledge, not checked here; confirm before relying on it.
- Secrets are named by env-var name only.

---

## 1. Summary of the proposal

| Layer | Today | Target |
|---|---|---|
| Static site | Vite SPA on Vercel, catch-all rewrite to `/` (`vercel.json:8-11`) | Workers Static Assets, `not_found_handling: "single-page-application"` |
| API | 8 Vercel Node functions (`api/*.js`, `api/webhooks/razorpay.js`) | One Worker, Hono router, one route module per current file, same URLs and same `action` names |
| Database | Firestore `thor-217e7`, read by the server (firebase-admin) **and directly by the browser** | D1 (SQLite) through Drizzle, reached only by the Worker |
| Customer sign-in | Own OTP code + Firebase custom token (`api/customer-auth.js`) | Better Auth: email OTP plugin + Google, session cookie |
| Admin sign-in | Username + password + PIN, HMAC-signed cookie (`api/admin-config.js:281-299`) plus a Firebase custom token | Same signed cookie, no Firebase token; optional Cloudflare Access in front |
| Live updates | Firestore `onSnapshot` listeners | Polling with version/ETag checks (admin only) |
| Images, payments, email, AI | Cloudinary, Razorpay, PayU, Brevo, Gemini over `fetch` | Unchanged (all are plain `fetch`) |

The single largest piece of work is not the eight API files. It is that the **browser talks to Firestore
directly in about 50 places** (section 5.3). Every one of those needs a Worker endpoint, because D1 has no
browser SDK and no security rules.

---

## 2. Frontend on Workers Static Assets

### 2.1 What exists

- Build: `vite build` to `dist/` (`package.json:8`), React + Tailwind plugins, alias `@` (`vite.config.ts:8-13`).
- `vite.config.ts:20` pins a `firebase` vendor chunk (`firebase/app`, `firebase/auth`, `firebase/firestore`). Once the
  `firebase` package is removed this entry must go too, or the build fails.
- `dist/` is 6.6 MB, about 60 files. The largest are `firebase-*.js` (687 KB), `AdminDashboardPage-*.js` (603 KB),
  `index-*.js` (567 KB). All far below the Static Assets limits of 20,000 files and 25 MiB per file **[CF-doc]**.
- `public/` holds favicons, `og-image.jpg`, three logo files and `robots.txt`. `public/suit-aura-logo.png` is 2.1 MB and
  `public/cropped_circle_image.png` is 840 KB; both are served as-is today.
- `robots.txt` points to `https://www.suitauragirls.in/sitemap.xml` and disallows `/api/`.
- `index.html:118-126` hardcodes the canonical and Open Graph URLs to `https://www.suitauragirls.in`. Same domain, so no change.
- `index.html:131-135` preconnects to Google Fonts, Cloudinary and Razorpay. No change.

### 2.2 SPA fallback (replacement for the `vercel.json` rewrite)

```jsonc
// worker/wrangler.jsonc (sketch)
{
  "name": "suitauragirls",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "../dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/sitemap.xml"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "sag-db", "database_id": "<id>", "migrations_dir": "drizzle" }
  ],
  "vars": { "SITE_URL": "https://www.suitauragirls.in" },
  "triggers": { "crons": ["30 19 * * *"] }
}
```

Why `run_worker_first` must be an explicit list **[CF-doc]**:

- With SPA mode and a compatibility date of 2025-04-01 or later, a request carrying `Sec-Fetch-Mode: navigate` is
  answered with `index.html` and **does not reach the Worker**.
- PayU sends the shopper back with a browser form POST to `/api/payu` (`api/orders.js:76-77`, `api/payu.js:35-38`).
  That is a navigation. Without `"/api/*"` in `run_worker_first`, the shopper would get the SPA shell and the
  payment would never be confirmed by the return path.
- `/sitemap.xml` is fetched by crawlers and is not a file in `dist/`, so it must be routed to the Worker as well.
- Everything else (page loads, JS, CSS, images) is served without invoking the Worker, so it does not use the
  100,000 requests/day allowance. The Cloudflare limits page does not state this in so many words; the SPA page
  says navigation requests "skip the Worker script" and that this "reduces billable invocations" **[CF-doc]**.
  Confirm in the dashboard's request count during the preview phase.

### 2.3 Headers

Vercel sets these today (`vercel.json:13-121`):

| Path | Headers |
|---|---|
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` |
| everything | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` |
| `/admin`, `/drdaina`, `/d4daina` and their sub-paths | `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` |

On Workers:

- Static responses: a `_headers` file in the asset directory. Limit 100 rules, 2,000 characters per line **[CF-doc]**.
  Default for assets without a rule is `Cache-Control: public, max-age=0, must-revalidate` plus an `ETag` **[CF-doc]**,
  which is right for `index.html`.
- `_headers` does **not** apply to responses produced by Worker code **[CF-doc]**. The API needs a Hono middleware
  that sets the four security headers and `Cache-Control: no-store` (today's `reply()` does the latter: `api/_lib/http.js:4-9`).
- Do not add `_headers` to `public/`: Vercel would publish it as a readable file. Generate it into `dist/` in the
  Workers build step (section 9).
- **[unverified]** whether a `_headers` rule for `/drdaina/*` is applied when the response is the SPA fallback
  `index.html`. Cloudflare's page does not cover it. Test on the preview URL. If it does not apply, add those
  three prefixes to `run_worker_first` and let the Worker return `env.ASSETS.fetch()` with the extra headers
  (this costs Worker requests, but only for admin page loads).
- The owner can set a custom admin slug (`api/admin-config.js:622`, `src/context/RouterContext.tsx:33`). Vercel's
  static rules never covered a custom slug either, so this is not a regression. `robots.txt` cannot list it
  without revealing it.

### 2.4 `/sitemap.xml`

`api/sitemap.js` reads eight fields of every product and emits listing, category and product URLs, cached at
Vercel's edge for an hour (`api/sitemap.js:51-53`, `:82`).

- Port as a Worker route `GET|HEAD /sitemap.xml` (keep `/api/sitemap` as an alias).
- A `Cache-Control: s-maxage` header on a Worker response does **not** make Cloudflare cache it. Use the Cache API
  inside the handler (`caches.default.match` / `put`) with a one-hour TTL, exactly as for the catalogue (section 4.4).
- `categoryToSlug`, `isVisible` and `lastChanged` (`api/sitemap.js:7-41`) are pure and carry over. The Firestore
  timestamp branches in `toDay` (`:34-36`) can go once dates are ISO strings in D1.

### 2.5 Domain shape

Canonical host is `www` (`index.html:118`). Attach the Worker to `www.suitauragirls.in` as a Custom Domain and
add a Cloudflare redirect rule from the apex to `www`. How the apex behaves today on Vercel is **[unverified]**
from the repository; check the Vercel domain settings and copy the behaviour.

---

## 3. API: one Worker, same URLs

### 3.1 Router

Hono, one Worker, one module per current file. Keeping the paths and the `action` contract means
`src/lib/api.ts:40`, `src/lib/catalog.ts:72` and the roughly 45 `fetch('/api/...')` call sites keep working.

| Current file | Route(s) to keep | Dispatch today |
|---|---|---|
| `api/admin-config.js` | `GET/POST/PUT /api/admin-config` | `?action=` for GET/POST (`:371`), body shape for PUT (`:608`, `:633`, `:652`, `:695`) |
| `api/orders.js` | `POST /api/orders` | `body.action`, 15 actions (`:308-806`) |
| `api/customer-auth.js` | `POST /api/customer-auth` | `body.action` = `send` / `verify` / `google` (`:164`, `:192`, `:197`) |
| `api/reviews.js` | `POST /api/reviews` | `body.action`, 4 actions (`:148-297`) |
| `api/alerts.js` | `GET /api/alerts?wishlist=`, `POST /api/alerts` | 3 POST actions (`:114`, `:134`, `:146`) |
| `api/track.js` | `POST /api/track` | `body.event` |
| `api/payu.js` | `POST /api/payu`, `POST /api/payu?webhook=1`, GET redirects to `/checkout` | form-encoded or JSON body (`:13-21`) |
| `api/webhooks/razorpay.js` | `POST /api/webhooks/razorpay` | raw body (`:10-16`) |
| `api/sitemap.js` | `GET /sitemap.xml`, `GET /api/sitemap` | — |
| new | `/api/auth/*` | Better Auth handler |
| new | `/api/data/*` or typed `/api/admin/*`, `/api/me/*` | replaces direct Firestore access (section 5.3) |

The gateway dashboards keep pointing at the same URLs (`api/admin-config.js:40-45`), so nothing changes at
Razorpay or PayU as long as the domain and paths stay.

### 3.2 Request/response adapter

The handlers are written against Vercel's Node `req`/`res`. Things to translate:

| Today | On Workers |
|---|---|
| `req.body` already parsed (`api/_lib/http.js:11-21`) | `await c.req.json()`; for PayU, `await c.req.parseBody()` or `new URLSearchParams(await c.req.text())` |
| Razorpay raw body via `bodyParser: false` and a stream (`api/webhooks/razorpay.js:8-16`) | `await c.req.text()` once, verify the HMAC on that string, then `JSON.parse` |
| `req.query.action` | `c.req.query('action')` |
| `x-forwarded-host` / `host` in `isSameOrigin` (`api/_lib/http.js:24-32`, `api/admin-config.js:345-354`) | `new URL(c.req.url).host` |
| `x-forwarded-for` in `clientIp` (`api/_lib/http.js:34-36`, `api/admin-config.js:512`) | `CF-Connecting-IP` |
| `res.status().setHeader().end()` | `c.json(body, status, headers)` / `c.redirect(url, 303)` |
| `process.env.VERCEL === '1'` decides the cookie `Secure` flag (`api/admin-config.js:296`) | always `Secure` except on `localhost` |
| 25 s budget timer (`api/orders.js:818-820`), 60 s `maxDuration` (`vercel.json:123-127`) | not needed; there is no wall-clock cap on an HTTP request while the client stays connected, only CPU time |
| `process.env.X` | `c.env.X`. With `nodejs_compat` and a recent compatibility date `process.env` is also populated **[unverified]**; do not depend on it |

`SITE_URL` is a literal in five files (`api/orders.js:36`, `api/alerts.js:10`, `api/sitemap.js:3`,
`api/_lib/email.js:2`, `api/admin-config.js:41-44`). Make it a `vars` entry. Otherwise a PayU test on the
`*.workers.dev` preview sends the shopper back to the **live** site (`surl`/`furl` at `api/orders.js:76-77`).

### 3.3 Dependency check

Server-side packages in `package.json`:

| Package | Used by | Workers verdict |
|---|---|---|
| `firebase-admin` (`package.json:23`) | every API file through `api/_lib/firebaseAdmin.js` | **Must go.** Needs Node gRPC/HTTP2 and a service-account key. Replaced by D1 + Better Auth |
| `firebase` (`package.json:22`) | browser only | Removed from the bundle at cut-over (saves the 687 KB chunk) |
| everything else | browser only | not relevant to the Worker |

The API has no other npm dependency: Razorpay, PayU, Brevo, Cloudinary and Gemini are all called with `fetch`
(`api/orders.js:48`, `api/_lib/payu.js:126`, `api/_lib/email.js:15`, `api/_lib/cloudinary.js:60`,
`api/_lib/gemini.js:77`, `:246`). These port unchanged.

`node:crypto` and `Buffer` usage:

| API | Where | Workers |
|---|---|---|
| `createHmac('sha256')` | admin session `api/admin-config.js:281`; OTP hash `api/customer-auth.js:18`; Razorpay verify `api/orders.js:514`; webhook `api/webhooks/razorpay.js:41`; PayU result token `api/_lib/payu.js:148`; review id `api/reviews.js:74` | fine under `nodejs_compat` |
| `createHash('sha1')` | Cloudinary signatures `api/_lib/cloudinary.js:17`, `api/orders.js:280`, `api/reviews.js:87` | fine |
| `createHash('sha256')` | `api/orders.js:268`, `api/track.js:25`, `api/alerts.js:12`, `api/reviews.js:24`, `api/_lib/firebaseAdmin.js:36` | fine |
| `createHash('sha512')` | PayU hashes `api/_lib/payu.js:80` | fine |
| `randomBytes`, `randomInt` | `api/orders.js:576`, `api/reviews.js:272`, `api/customer-auth.js:55`, lib/orders.js:396 | fine |
| `timingSafeEqual` | six call sites | fine |
| `scryptSync` | `api/admin-config.js:190`, `:199` | available **[unverified]**, but **too expensive for the free plan** — section 3.4 |
| `Buffer` base64/hex/base64url | Basic auth headers `api/admin-config.js:12`, `api/orders.js:51`; session payload `api/admin-config.js:286-291`, `:320`; Gemini photos `api/_lib/gemini.js:120-122` | fine under `nodejs_compat` |

Other runtime behaviour to check:

- `toLocaleString('en-IN')` and `toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })` are used in messages and
  emails (lib/orders.js:125, `:217`, `:721`; `api/orders.js:220`; `api/alerts.js:11`). Indian digit grouping
  (`₹1,00,000`) needs the `en-IN` locale data. **[unverified]** that the Workers runtime ships it. Add a unit
  test that runs inside the Workers runtime; if it fails, replace with a small hand-written formatter.
- `end.setHours(23, 59, 59, 999)` (lib/orders.js:143) uses the server's local time zone. Vercel and Workers are both UTC, so behaviour is unchanged (and stays "end of day UTC", not IST).
- Module-level caches: gateway settings 20 s (`api/_lib/payu.js:8`, `:26-27`), track budget (`api/track.js:32`), Gemini
  model ladder (`api/_lib/gemini.js:10-11`), last admin credentials and catalogue (`api/admin-config.js:205`, `:239`),
  in-memory login attempts (`:268`). Globals survive between requests in a warm isolate but are per-location and
  can vanish at any time. Treat them as best-effort only. The Firestore-outage fallbacks built on them
  (`api/admin-config.js:230-279`, `:326-340`, `:531-542`) lose their purpose and should be removed rather than ported.
- `setTimeout` waits: PayU verify retries after 1.5 s and 3 s (`api/_lib/payu.js:117`), Gemini retry (`api/_lib/gemini.js:309`).
  Waiting does not consume CPU time. Fine.
- Work that must finish after the response (emails, alert bookkeeping) is awaited today. Keep awaiting, or use
  `c.executionCtx.waitUntil()` for the non-critical ones (store alert email, email log).

### 3.4 CPU time (10 ms per request on the free plan) **[CF-doc]**

Only CPU counts, not time spent waiting on D1 or `fetch`. A typical handler here (JSON parse, a few HMACs,
a few D1 calls) is 1–3 ms. Three places are not typical:

**A. Admin password and PIN hashing — blocker.**
`hashSecret`/`verifySecret` use `scryptSync(value, salt, 64)` with Node's default cost (`api/admin-config.js:188-201`).
A login verifies the password **and** the PIN (`:545-546`), so two scrypt runs, each on the order of 50–100 ms
of CPU **[unverified, typical figure]**. That is 10–20 times the free limit; the request would be killed.

Options, in order of preference:

1. **HMAC-SHA256 with a server-side pepper** (new secret `ADMIN_PEPPER`): `hash = HMAC(pepper, salt ‖ value)`,
   stored as `v2:salt:hash`. Cost is microseconds. The security argument changes from "slow to brute-force" to
   "useless without the pepper", which lives only in Worker secrets. This is acceptable because there is exactly
   one admin account, logins are rate-limited to 10 per IP per 15 minutes (`api/admin-config.js:511-529`), and a
   6-digit PIN is not protected by any slow hash anyway once the database leaks. Recommended, together with
   Cloudflare Access (section 6.3) as the second lock.
2. PBKDF2-SHA256 through WebCrypto. Workers caps iterations at 100,000 **[unverified]** and two runs at that cost
   would still be over 10 ms. Not a fix on the free plan.
3. Workers Paid (USD 5/month): 30 s CPU, scrypt works unchanged.

Existing hashes cannot be converted without the plaintext. At cut-over, run a **local** Node script that asks the
owner for the current username, password and PIN, verifies them against the exported scrypt hashes, and writes the
`v2` hashes into D1. The owner keeps the same login. Note: `admin_credentials` and `private_settings` are
server-only collections (`firestore.rules:78-80`, `:141-143`), so they are **not** in the client-SDK export
under `migration/data/` and must be exported with the Admin SDK or re-entered.

**B. Gemini "fill product from photos".**
The handler downloads up to 6 photos of up to 4 MB each and base64-encodes them into one JSON body
(`api/_lib/gemini.js:17-18`, `:115-128`, `:277`). The photos are already requested at `w_1024,h_1280,q_auto:good`
(`:112`), so real sizes are a few hundred KB, but the worst case is 24 MB of base64 in a 128 MB isolate with a
10 ms CPU budget. Mitigations: request `w_768,q_auto:eco`, lower `MAX_IMAGE_BYTES` to about 600 KB, cap the model
ladder so the request stays under 50 subrequests (worst case today: 1 model list + 6 photos + up to ~10 models × 2
attempts). Measure on the preview. If it still exceeds CPU, this one admin-only feature is the candidate for
the paid plan or for sending image URLs instead of bytes (**[unverified]** whether the Gemini API accepts
public image URLs directly).

**C. Better Auth.** Its default password hashing is scrypt, but passwords are not used (OTP and Google only).
Verifying a Google ID token is one RS256 check through WebCrypto; cheap.

### 3.5 Subrequests (50 per request) and D1 queries (50 per invocation) on the free plan **[CF-doc]**

Count them per action during the port. The ones to watch:

- `orders` `create`: rate limit, product reads, settings reads, coupon, per-customer coupon use, gateway settings,
  earlier attempt, Razorpay order, insert. About 10–12 today (`api/orders.js:340-449`, lib/orders.js:284-389). Fine.
- `alerts` `check-product` loops over **all profiles** and does a log read, an email and a log write per matching
  customer (`api/alerts.js:50-71`), then the same per waiting restock subscriber (`:76-93`). With 9 profiles
  today this is fine; with a few hundred wishlists it exceeds both limits. Rewrite as: one SQL query that returns
  only the customers to notify, send at most ~20 emails per invocation, and let a Cron Trigger or the next save
  continue. Brevo also has a batch send endpoint **[unverified]**.
- `reviews` `remove-photos`: up to 10 Cloudinary deletes plus D1 calls (`api/reviews.js:290-294`). Fine.
- `admin-config` `cloudinary-delete`: up to 50 URLs in one call (`api/admin-config.js:570-573`). Cap at 40 per
  call and let the browser chunk (`src/lib/dataStore.ts:132-137`).
- Use `db.batch()` wherever several statements go together. A batch is one round trip; whether it counts as one
  query or N against the 50-query limit is **[unverified]**.

### 3.6 Script size

Hono, Drizzle and Better Auth together are well under 1 MB compressed. The free limit is 3 MB compressed
**[unverified: the limits page summary I fetched gave only the uncompressed figure]**. No concern either way.

---

## 4. Data access: D1 + Drizzle

### 4.1 Layout and tooling

- Binding `DB` in `wrangler.jsonc`. Create with a location hint near India: `wrangler d1 create sag-db --location=apac`.
- Schema in `worker/src/db/schema/*.ts` (one file per area: catalogue, orders, customers, settings, analytics, auth).
- `drizzle-kit generate` writes SQL to `worker/drizzle/`. Apply with `wrangler d1 migrations apply sag-db --local`
  and `--remote`. Never use `drizzle-kit push` against the remote database.
- `drizzle(env.DB, { schema })` per request. Creating it is cheap.
- Better Auth tables (`user`, `session`, `account`, `verification`) are generated with the Better Auth CLI into
  the same Drizzle schema so there is a single migration history.

Document-to-table mapping is another document's topic. The constraints that come from the Worker side:

- Row, string and BLOB limit is 2 MB; 100 columns per table; **100 bound parameters per query**; 100 KB per SQL
  statement **[CF-doc]**. Multi-row inserts must be chunked so rows × columns ≤ 100. The import should use
  `wrangler d1 execute --file` with plain SQL, not the ORM.
- Rows read are counted as **rows scanned**, not rows returned **[CF-doc]**. Every `WHERE` used by the API needs an
  index: `orders(customer_email)`, `orders(attempt_key)`, `orders(razorpay_order_id)`, `orders(coupon_code, payment_status)`,
  `coupons(code)`, `reviews(product_id, status)`, `stock_alerts(product_id, status)`, `review_photos(review_id)`.
  Today's code scans whole collections in places that must not be copied: `findCoupon` reads every coupon
  (lib/orders.js:155), `paidOrderLine` reads up to 300 orders (`api/reviews.js:129`), price-drop reads up to 5,000
  profiles (`api/alerts.js:50`).
- Each index adds one written row per insert or indexed update **[CF-doc]**. Index what is queried, nothing else.
- Keep order documents as scalar columns for what is filtered or sorted, plus a JSON column for the rest
  (items, address, timeline, return request). The view functions (lib/orders.js:1044-1129) then work unchanged on
  the reassembled object.
- `visitor_sessions` is the only large data set (1.9 MB of the 2.5 MB export) and each session's `actions` array
  grows on every event (`api/track.js:167`, `:193`). Store actions as rows in a child table or cap the JSON.

Current volume, from `migration/data/export-2026-10-01T18-15-19/_summary.json`: 33 products, 3 categories,
1 coupon, 7 reviews, 38 orders, 9 customers, 9 profiles, 78 abandoned checkouts, 8 settings documents.
Database size after import will be a few MB against a 500 MB per-database limit **[CF-doc]**.

### 4.2 Transactions: what Firestore does today and how to do it on D1

D1 has no interactive transactions. `db.transaction()` in Drizzle is not usable on D1 **[unverified wording, well-known
limitation]**. What exists: single statements are atomic, and `db.batch([...])` runs several statements as one
transaction that rolls back as a whole. A batch cannot read a value and then decide in JavaScript what to write.
So every "read, decide, write" transaction below becomes either one conditional statement or a batch whose
statements carry their own guard.

There are 13 Firestore transactions in the API:

| # | Where | What it protects | D1 form |
|---|---|---|---|
| 1 | `finalizePaidOrder` lib/orders.js:406-467 | mark paid once, deduct stock, count coupon use, count the purchase | guarded batch (below) |
| 2 | `admin-update` `api/orders.js:758-798` + `restoreOrderStock` lib/orders.js:470-488 | status change, restore stock once | guarded batch |
| 3 | `admin-return` `api/orders.js:724-731` | return state machine | versioned update |
| 4 | `return-request` `api/orders.js:617-644` | one open request, photos attach once | versioned update + guarded photo updates in one batch |
| 5 | `requestCancellation` lib/orders.js:556-570 | one cancel request | versioned update |
| 6, 7 | `recordCancelRequestAlert`, `recordReturnRequestAlert` lib/orders.js:515-522, `:945-952` | set a flag inside a JSON field | single `UPDATE ... json_set(...)` |
| 8 | `rateLimit` `api/orders.js:292-306`, admin login `api/admin-config.js:518-529`, OTP per IP `api/customer-auth.js:28-42`, reviews `api/reviews.js:106-115` | fixed-window counters | one upsert with `RETURNING` |
| 9, 10 | OTP send / verify `api/customer-auth.js:59-82`, `:95-116` | cooldown, attempts, single use | Better Auth's `verification` table (section 6) |
| 11 | review submit `api/reviews.js:206-225` | one review per customer and product, photo ownership | upsert on primary key + guarded photo update in a batch |
| 12 | review helpful `api/reviews.js:249-260` | one vote per visitor | `INSERT OR IGNORE` vote, then increment if a row was inserted |
| 13 | tracking `api/track.js:83-102`, `:120-161` | dedup + counters | `INSERT OR IGNORE` dedup, then upsert counters |

Plus one transaction **in the browser**: the admin's quick stock adjust (`src/context/ProductContext.tsx:482-491`).
That becomes a Worker endpoint running
`UPDATE products SET stock_quantity = MAX(0, stock_quantity + ?) ... RETURNING stock_quantity`.

**Pattern A — paid exactly once (transaction 1).** One batch; the order row flips last and every earlier statement
only acts while the order is still unpaid:

```sql
-- 1. record what will be taken, per product (taken = MIN(stock, wanted))
INSERT INTO stock_movements (order_number, product_id, wanted, taken, at)
SELECT ?1, p.id, ?3, MIN(MAX(p.stock_quantity, 0), ?3), ?4
FROM products p
WHERE p.id = ?2
  AND EXISTS (SELECT 1 FROM orders o WHERE o.order_number = ?1 AND o.payment_status = 'Unpaid');

-- 2. deduct, never below zero
UPDATE products
SET stock_quantity = MAX(stock_quantity - ?3, 0),
    in_stock = CASE WHEN stock_quantity - ?3 > 0 AND in_stock = 1 THEN 1 ELSE 0 END,
    updated_at = ?4
WHERE id = ?2
  AND EXISTS (SELECT 1 FROM orders o WHERE o.order_number = ?1 AND o.payment_status = 'Unpaid');

-- 3. coupon use, 4. daily purchase counter: same EXISTS guard

-- last: claim the order
UPDATE orders
SET payment_status = 'Paid', status = 'Processing', payment_ref = ?, paid_at = ?, paid_via = ?, stock_deducted = 1
WHERE order_number = ?1 AND payment_status = 'Unpaid';
```

`changed` is `meta.changes === 1` of the last statement. A webhook, the browser's `verify` call and the
`payment-result` reconcile can all arrive together (`api/orders.js:465`, `:517`, `api/webhooks/razorpay.js:67`,
`api/payu.js:73`); only one batch finds the order unpaid. Shortfall and deducted quantities
(lib/orders.js:427-442, `:453-454`) are then read from `stock_movements`. The Razorpay-order-id ownership check
(lib/orders.js:413-414) is a plain read before the batch.

About `UPDATE ... WHERE stock >= ?`: today's rule at payment time is deliberately **not** "fail when stock is
short". The money has already been taken, so stock is clamped at zero and the shortfall is written on the order
for the admin (lib/orders.js:437-441, `:458-460`). Keep that. The strict form
(`WHERE stock_quantity >= ?`, then check `changes`) is the right tool only if stock is ever reserved at order
creation, which the store does not do today (`stockDeducted: false` at `api/orders.js:437`).

**Pattern B — restore once (transaction 2).**

```sql
UPDATE products SET stock_quantity = stock_quantity + m.taken, in_stock = 1 ...
  FROM stock_movements m WHERE m.order_number = ?1 AND m.product_id = products.id AND m.restored_at IS NULL;
UPDATE stock_movements SET restored_at = ?2 WHERE order_number = ?1 AND restored_at IS NULL;
UPDATE orders SET status = ?, stock_deducted = 0, ... WHERE order_number = ?1;
```

Today's restore sets `inStock: next > 0` unconditionally (lib/orders.js:482); match that.

**Pattern C — versioned update (transactions 3, 4, 5).** The decision logic is already pure
(`applyReturnAction`, `validateReturnInput`, `cancelBlockReason`). Read the order, compute the update in
JavaScript, write with `WHERE order_number = ? AND version = ?` and bump `version`; if `changes` is 0, re-read and
retry once. For appends, `json_insert(timeline, '$[#]', json(?))` avoids the race altogether.

**Pattern D — counters (8, 13).**

```sql
INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?1, ?2, 1, ?3)
ON CONFLICT(key) DO UPDATE SET
  count = CASE WHEN ?2 - window_start > ?4 THEN 1 ELSE count + 1 END,
  window_start = CASE WHEN ?2 - window_start > ?4 THEN ?2 ELSE window_start END,
  expires_at = CASE WHEN ?2 - window_start > ?4 THEN ?3 ELSE expires_at END
RETURNING count;
```

Allowed when `count <= limit`. One row written per call. Firestore documents carry `expiresAt`
(`api/orders.js:299`), which suggests a TTL policy there **[unverified]**; D1 has no TTL, so a daily Cron Trigger
deletes expired rows (deletes count as rows written).

**Idempotency keys already in the code, to keep as unique constraints:**

- `order_number` primary key; a clash retries with a new number (`api/orders.js:383-449`).
- `attempt_key` (`api/orders.js:342`, `:348`, `:357-380`): unique index where not empty.
- PayU `txnid` belongs to the order's `payuTxnIds` (`api/payu.js:65`).
- `alert_log` key per customer + product + price (`api/alerts.js:55-57`): primary key, `INSERT OR IGNORE` before sending.
- `stock_alerts` id = hash of email, product, size, colour (`api/alerts.js:123`).
- `review_photos` and `return_photos` keys issued by the server (`api/reviews.js:272-279`, `api/orders.js:576-584`).

### 4.3 Replacing real-time listeners

Shoppers already do not use listeners: they load one cached catalogue and fall back to live reads only on
failure (`src/lib/catalog.ts:89-105`). Listeners serve the admin and "admin browsing the store"
(`src/lib/catalog.ts:25-34`).

Listener sites to replace:

- `src/lib/dataStore.ts:86-94` `watchCollection`, used for `storefront_settings`, `categories`, `orders`, `coupons`
  (`src/context/AdminContext.tsx:803`, `:915`, `:952`, `:955`) and products (`src/context/ProductContext.tsx:327`).
- Reviews and leads (`src/context/AdminContext.tsx:940`, `:985`; `src/components/admin/AdminReviews.tsx:58`).
- Single setting documents: `src/context/ShopContext.tsx:1082`, `:1101`; `src/utils/discovery.ts:88`; `src/utils/looks.ts:43`;
  `src/utils/reels.ts:98`; `src/components/DeliveryCheck.tsx:84`; `src/components/admin/AdminComboOffers.tsx:18`,
  `AdminDiscovery.tsx:43`, `AdminLooks.tsx:163`, `:173`, `AdminReels.tsx:207`.
- Admin dashboard: `src/components/admin/AdminDashboardOverview.tsx:62`, `:79`, `:98`; one order: `AdminOrderDetails.tsx:108`.
- Product page reviews: `src/components/ProductReviews.tsx:180`.

Proposed mechanism:

1. A `table_versions(name PRIMARY KEY, version INTEGER, updated_at)` table. Every write endpoint bumps the row for
   its table in the same batch as the write.
2. `GET /api/admin/versions` returns all rows (about 12 rows read). The admin panel polls it every 20–30 s while
   the tab is visible, and immediately on focus. `watchCollection` keeps its signature
   (`onChange(rows, meta)` and an unsubscribe function) and re-fetches a list only when its version moved.
3. List endpoints send `ETag: "<table>-<version>"` and answer `304` to `If-None-Match`.
4. Orders, the one list that grows: `GET /api/admin/orders?since=<updated_at>` returns only changed rows.
5. The admin's own writes update local state from the response, so the admin never waits for a poll to see their own change.

Cost: an admin tab open 10 hours at 30 s is 1,200 Worker requests and about 15,000 rows read a day.

The existing 5-minute admin session check and the 15 s fallback sync (`src/context/AdminContext.tsx:615`, `:810`) fold into the same poll.

### 4.4 The catalogue endpoint

`GET /api/admin-config?action=catalog` builds products, categories, approved reviews, active coupons and public
settings in one answer (`api/admin-config.js:457-501`), with `Cache-Control: public, max-age=0, s-maxage=600,
stale-while-revalidate=600` (`:486`) and a 5-minute bucket in the URL (`src/lib/catalog.ts:22`, `:67-72`).

- On Workers that header does not cache anything by itself. Wrap the handler in the Cache API keyed on the full URL
  (the `v=<bucket>` parameter already makes a good key) with a 10-minute TTL.
- The Worker is still invoked for each catalogue request (one request per page load), but D1 is read only on a cache
  miss, per Cloudflare location.
- Also send `Cache-Control: public, max-age=120` so reloads within two minutes do not call the Worker at all.
- A miss reads about 50 rows today. Even with no caching at all, 3,000 loads a day would be 150,000 rows of a
  5,000,000 allowance.
- Keep the device-side saved copy (`src/lib/catalog.ts:46-62`); it is what keeps the shop usable if the API is down.
- Cache API behaviour on `*.workers.dev` is **[unverified]** (it may be a no-op there). Do not judge caching on the preview host.

---

## 5. Browser-side data access

### 5.1 How the browser authenticates to the API today

`apiPost` attaches `Authorization: Bearer <Firebase ID token>`; on admin pages it prefers the admin Firebase app
(`src/lib/api.ts:13-24`). The server turns that into `{ admin, email, uid }` (`api/_lib/http.js:42-58`). So today
**the admin is recognised by `/api/orders`, `/api/alerts` and `/api/reviews` through Firebase**, not through the
admin cookie. The cookie is scoped to `Path=/api/admin-config` (`api/admin-config.js:298`).

### 5.2 Target

- Customer: Better Auth session cookie, sent automatically on same-origin requests. `getIdentity` becomes
  `auth.api.getSession({ headers })` and returns `{ email: session.user.email.toLowerCase(), uid: session.user.id }`.
- Admin: the signed cookie, now with `Path=/api` so every admin route can read it (section 6.3).
- `getIdentity(c)` returns the same shape as today, `{ admin, email, uid }`, so the action handlers need no change
  in how they use it (`api/orders.js:336`, `:458`, `:536-544`, `:683`).
- `apiPost` loses the token header and keeps `credentials: 'same-origin'` (already set at `src/lib/api.ts:29`).

### 5.3 Direct Firestore access that needs new endpoints

From `firestore.rules` and the call sites:

| Collection | Browser does today | Rule | Call sites | New endpoint (role) |
|---|---|---|---|---|
| `products` | admin create/update/delete, stock adjust | `firestore.rules:19-22` | `src/context/ProductContext.tsx:327`, `:391`, `:422`, `:453`, `:484` | `/api/admin/products` (admin) |
| `categories` | admin CRUD | `:24-27` | `src/context/AdminContext.tsx:1197-1207` | `/api/admin/categories` (admin) |
| `coupons` | admin CRUD; shopper list fallback | `:35-38` | `src/context/AdminContext.tsx:1312-1326`; `src/context/ShopContext.tsx:271` | `/api/admin/coupons` (admin) |
| `reviews` | admin moderate, reply, delete, create | `:41-44` | `src/context/AdminContext.tsx:1439-1489` | `/api/admin/reviews` (admin) |
| `orders` | admin read all, delete, manual create | `:48-52` | `src/context/AdminContext.tsx:952`, `:1253`, `:1294`; `AdminOrderDetails.tsx:108` | `/api/admin/orders` (admin) |
| `profiles` | customer reads/writes own cart, wishlist, addresses, style prefs | `:55-58` | `src/context/ShopContext.tsx:346`, `:366`, `:424`, `:444`; `src/lib/addressBook.ts:185`, `:221`; `src/components/AccountPage.tsx:618`, `:667`; `CheckoutPage.tsx:468`; `StyleProfile.tsx:122`, `:160` | `GET/PATCH /api/me/profile` (customer) |
| `customers` | admin list | `:61-64` | `src/components/admin/AdminCustomers.tsx:40` | `/api/admin/customers` (admin) |
| `abandoned_checkouts` | anyone creates/updates | `:66-69` | `src/components/CheckoutPage.tsx:249` | `POST /api/track` event or `/api/checkout-draft` (public, rate-limited) |
| `leads` | anyone creates; admin reads/updates | `:89-99` | `src/components/ContactUsPage.tsx:35`; `HomeSections.tsx:247`; `ProductDetailPage.tsx:2`; `AdminContext.tsx:985`, `:1548` | `POST /api/leads` (public, rate-limited), `/api/admin/leads` |
| `product_daily` | anyone reads one day's counts | `:112-115` | `src/components/ProductDetailPage.tsx:65` | `GET /api/product-stats?id=` (public, cached) or fold into the catalogue |
| `daily_analytics`, `visitor_sessions`, `analytics_totals`, `search_terms`, `feature_daily` | admin reads | `:102-128` | `AdminDashboardOverview.tsx:62-98`; `AdminInsights.tsx:22-23` | `/api/admin/analytics` (admin) |
| `inventory_log`, `admin_settings` | admin read/write | `:131-138` | `src/context/ProductContext.tsx:135`; `AdminStockHistory.tsx:38-39`; `AdminContext.tsx:969`, `:1503` | `/api/admin/inventory-log`, `/api/admin/settings` (admin) |
| `storefront_settings` | read only | `:72-75` | listener sites in 4.3 | already served by `/api/admin-config` |

Two side effects of moving these behind the Worker:

- The public "anyone may write" rules (`abandoned_checkouts`, `leads`) get server-side validation and rate limits
  they do not have today.
- Stock changes and their history are written together on the server instead of as two separate browser writes
  (`src/context/ProductContext.tsx:484-492`).

### 5.4 Cart sync volume

The cart is written to the profile on every change (`src/context/ShopContext.tsx:338-355`) and the checkout draft is
saved on a debounce (`src/components/CheckoutPage.tsx:249-278`). In D1 each is one row written. Keep the
"only when changed" check (`:344-345`) and add a 2–3 s debounce to the cart push so a burst of taps is one request.

---

## 6. Authentication

### 6.1 Customers today

- `send`: per-IP limit 15/hour, 30 s cooldown, 8 codes/day per email, 6-digit code stored as an HMAC keyed with
  `ADMIN_SESSION_SECRET`, 10-minute life (`api/customer-auth.js:7-12`, `:18-20`, `:52-90`).
- `verify`: 5 wrong attempts lock for 30 minutes, single use (`:92-121`), then upsert `customers/<email>` and seed
  `profiles/<email>` (`:124-151`), then mint a Firebase custom token with uid `c_<sha256(email)[:26]>` and claim
  `customerEmail` (`api/_lib/firebaseAdmin.js:36-40`).
- `google`: the browser gets a Google credential from Google Identity Services, signs into a throwaway Firebase
  app to obtain a Firebase ID token, the server verifies it and requires `google.com` + `email_verified`, then
  issues the same customer session and deletes the bridge user (`src/utils/googleSignIn.ts:57-67`, `api/customer-auth.js:164-186`).
- Google sign-in is shown only when `VITE_GOOGLE_LOGIN === '1'` (`src/utils/googleSignIn.ts:5`). Whether that is
  set on Vercel is **[unverified]**; it is not in the local env file's variable names.
- **The customer's identity everywhere is the lowercase email**: document ids of `customers` and `profiles`
  (`api/customer-auth.js:125`, `:143`), order ownership (`api/orders.js:284-289`, `:554`).

### 6.2 Better Auth on Workers + D1

```ts
// worker/src/auth.ts (sketch) — built per request because bindings arrive with the request
export const createAuth = (env: Env) => betterAuth({
  baseURL: env.SITE_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: false },
  socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
  session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 300 } },
  plugins: [emailOTP({ otpLength: 6, expiresIn: 600, sendVerificationOTP: ({ email, otp, type }) => sendOtpEmail(env, { email, code: otp, purpose: type }) })],
});
```

Option names above are from memory of the Better Auth API **[unverified]**; check against the installed version.

Points that matter for this store:

- **Email OTP**: Better Auth's plugin stores the code in `verification`, enforces expiry and an attempt limit. The
  store's extra rules (30 s cooldown, 8/day per email, 15/hour per IP, 30-minute lockout) are not all built in.
  Enforce them in the store's own code with the `rate_limits` table before calling Better Auth. Do not use
  Better Auth's default in-memory rate limiter: Worker memory is per isolate.
- **Google without changing the screen**: the page already obtains a Google ID token with the GIS button and One Tap
  (`src/utils/googleSignIn.ts:30-48`). Better Auth can sign in from an ID token (`signIn.social` with `idToken`)
  **[unverified]**, so the Firebase bridge (`:57-67`) disappears and no redirect flow is needed.
- **New Google OAuth client**: `GOOGLE_CLIENT_ID` at `src/utils/googleSignIn.ts:4` belongs to the Firebase project
  under the old Google account. The new setup needs an OAuth client in a project of the new Google account, with
  `https://www.suitauragirls.in` as an authorised JavaScript origin. Google identifies a user to a site by email
  here, so existing customers are matched by email and keep their data. Until the new client exists, the old client
  id keeps working as long as the old project is alive (it is not deleted in this migration).
- **Keep the old endpoint as a wrapper** so `src/components/LoginPage.tsx:60`, `:118` change as little as possible:
  `/api/customer-auth` `send` → store limits → `auth.api.sendVerificationOTP`; `verify` → `auth.api.signInEmailOTP`,
  forward its `Set-Cookie`, then run `upsertCustomer`; `google` → ID-token sign-in, forward `Set-Cookie`,
  `upsertCustomer`. The response keeps `{ success, verified, email, customer }` and drops `firebaseToken`.
- **Identity mapping**: `user.email` (lowercased) is the join key to `customers`, `profiles` and `orders.customer_email`.
  Import existing customers into Better Auth's `user` table with `emailVerified = true` so the first OTP sign-in
  finds them instead of creating a second record. `orders.customerUid` holds the old `c_…` uid
  (`api/orders.js:415`); keep it as a legacy column, do not key anything on it.
- **Session check in routes**: one middleware calls `auth.api.getSession({ headers })` only when a session cookie is
  present. With `cookieCache`, most requests are verified from the signed cookie without a D1 read.
- **Frontend**: `src/context/AuthContext.tsx` is rebuilt on `GET /api/auth/get-session`; its public shape
  (`user`, `loading`, `signInWithOtpToken`, `logout`: `:7-13`) can stay, with `signInWithOtpToken` reduced to
  "refresh the session".
- **Everyone is signed out once at cut-over.** Firebase sessions cannot be converted. Carts and wishlists stay in
  `localStorage` (`src/context/AuthContext.tsx:34-37` lists the keys) and in the imported profiles.
- CSRF: keep the same-origin check on every POST (`api/_lib/http.js:24-32`); Better Auth also checks `Origin`
  against `baseURL`/`trustedOrigins`, so the preview host must be listed there.

### 6.3 Admin

Keep the mechanism (`api/admin-config.js`):

- Username + password + optional 6-digit PIN (`:544-549`, `:614-615`), 10 attempts per IP per 15 minutes (`:511-529`).
- Cookie `sag_admin_session` = base64url JSON `{ username, version, remember, expiresAt }` + `.` + HMAC-SHA256 with
  `ADMIN_SESSION_SECRET` (`:281-293`), 400 days sliding or 12 hours (`:51-54`, `:378-380`), `HttpOnly; SameSite=Strict`.
- `session_version` invalidates every device when credentials change (`:341`, `:624`).

Changes:

1. `Path=/api` instead of `Path=/api/admin-config` (`:298`), so `/api/orders`, `/api/reviews`, `/api/alerts` and the
   new `/api/admin/*` routes see it. Also expire the old cookie at the old path once, or the browser keeps two cookies with the same name.
2. `Secure` always (today it depends on `process.env.VERCEL`, `:296`).
3. Remove `firebaseToken` from the `login` and `session` answers (`:385`, `:556`) and the `revokeAdminFirebaseSessions`
   calls (`:562`, `:627`). The browser side is `signInAdminToFirebase` (`src/lib/dataStore.ts:139-148`) and the
   `isFirebaseAdmin` state (`src/context/AdminContext.tsx:626-627`), which gates the admin data loads (`:930-977`).
4. Password/PIN hashing per section 3.4.
5. If `ADMIN_SESSION_SECRET` is carried over unchanged and `session_version` is imported, the owner's phone stays
   signed in across the switch (after the path fix in step 1 is applied on the first `session` call).

`ADMIN_SESSION_SECRET` has two more jobs today: the OTP code hash (`api/customer-auth.js:18`, obsolete with Better
Auth) and the PayU result-link token (`api/_lib/payu.js:146-149`, 2-day life). Keep the same value at cut-over so
result links issued just before the switch still verify.

One more keyed value: `customerReviewId` uses the **private key inside `FIREBASE_SERVICE_ACCOUNT`** as its HMAC key
(`api/reviews.js:67-75`). If the key changes, a customer who edits an existing review gets a second review
instead of an update. Either store that key material as a Worker secret (`REVIEW_ID_SECRET`) or, cleaner, add a
private `customer_email` column to reviews with a unique index on `(customer_email, product_id)`. Only 7 reviews
exist, and old rows have no email stored, so the practical impact is small either way.

**Optional: Cloudflare Access** (Zero Trust free tier, up to 50 users **[unverified]**) on `/api/admin/*` and
`/api/admin-config` for non-GET methods, with the owner's new Gmail as the only allowed identity. Notes:

- It cannot cover the admin pages themselves by path if the owner uses a custom slug, and the page shell is public
  static content anyway. Protect the API, not the HTML.
- Public GETs on `/api/admin-config` (catalogue, public settings: `api/admin-config.js:457-504`) must stay outside the policy.
  Simplest: move admin-only routes under `/api/admin/*` and protect only that prefix.
- Access adds a Google login step on each new device. Decide with the owner; the signed cookie alone is today's level of protection.

---

## 7. Free-plan limits and an estimate for 2,000 visitors a day

### 7.1 Limits **[CF-doc unless marked]**

| Limit | Free plan |
|---|---|
| Worker requests | 100,000/day, resets 00:00 UTC (05:30 IST) |
| CPU time | 10 ms per request |
| Memory | 128 MB |
| Subrequests | 50 per request |
| Startup time | 1 s |
| Env vars / secrets | 64 per Worker, 5 KB each |
| Cron Triggers | 5 per account |
| Static assets | 20,000 files, 25 MiB each |
| D1 rows read | 5,000,000/day |
| D1 rows written | 100,000/day |
| D1 storage | 500 MB per database, 5 GB per account, 10 databases |
| D1 queries per invocation | 50 |
| D1 Time Travel (point-in-time restore) | 7 days |

What happens at the limit:

- Requests: Cloudflare answers with error 1027, or, for a route set to "fail open", bypasses the Worker.
  Pages and assets keep loading; the API does not.
- D1: queries fail with an error until 00:00 UTC.

**This must be said plainly to the owner:** the free plan here has daily ceilings too. They are far above the
store's current needs (table below), but "never a quota problem" is only guaranteed by watching usage and
being ready to switch on Workers Paid (USD 5/month; 10 million requests/month, 30 s CPU, 25 billion rows read and
50 million rows written per month **[unverified figures]**). Switching takes minutes and needs no code change.

### 7.2 Worker requests

Per visit, API calls made by the browser (static files excluded):

| Call | Per visit | Source |
|---|---|---|
| catalogue | 1 (0 on a reload within the browser cache time) | `src/lib/catalog.ts:65-83` |
| `track` visit | 1 per session | `src/utils/visitorTracker.ts:314-353` |
| `track` product views, searches, reels, features | about 4 | `:370-385` (once per item per browser session) |
| `track` add to cart / checkout | 0.2 | `:356-367` (once per device per day each) |
| product stats on the product page | about 3 (if kept as a separate call) | `src/components/ProductDetailPage.tsx:65` |
| session check for signed-in customers, profile read/write | about 1 on average | section 5 |
| quote, coupon, order, payment (buyers only) | about 0.3 on average | `api/orders.js:310-522` |
| **Total** | **about 10** | |

- 2,000 visitors × 10 = **20,000 requests/day**, plus the admin panel (about 1,500) and bots hitting `/api/*`
  (allow 2,000–5,000). Roughly **25,000 of 100,000**.
- The ceiling is reached at about 8,000 visitors a day with this call pattern.
- Cheap reductions if needed: include today's product counts in the catalogue (removes ~3 calls per visit), batch
  tracking events into one call per page, block obvious bots on `/api/track` with a WAF rule.

### 7.3 D1 rows written

Tracking dominates. Per event today (`api/track.js:41` comment and `:83-161`): about 6 writes per visit, 4 per item
event, 3 per funnel event.

| Source | Rows/day at 2,000 visitors |
|---|---|
| visit (2,000 × 6) | 12,000 |
| item events (8,000 × 4) | 32,000 |
| funnel events (400 × 3) | 1,200 |
| rate-limit counters, carts, checkout drafts, leads | 3,000 |
| orders (40 orders × ~15 rows including stock, coupon, timeline, email log) | 600 |
| index maintenance on the above (allow +30%) | 15,000 |
| nightly clean-up of dedup and rate-limit rows (deletes count as writes) | 45,000 |
| **Total** | **about 110,000 — over the 100,000 limit** |

So tracking **cannot be ported one-to-one**. Redesign it so one event is one or two rows:

- Dedup: one `INSERT OR IGNORE` into a `WITHOUT ROWID` table keyed by `(day, kind, hash)` with no secondary index.
- Counters: one upsert into `daily_analytics`, one into `product_daily` when relevant.
- Per-IP caps: one counter row per IP per day, touched only when the dedup insert succeeded.
- Do not delete dedup rows nightly. Drop them by day in bulk once a week (still writes, but spread out), or keep
  dedup out of D1 altogether with the Cache API as a best-effort "seen today" marker (this is analytics, not security).
- Visitor session detail: one row per session, actions capped.
- Keep the daily budget guard (`TRACK_WRITE_BUDGET`, `api/track.js:31-48`): when counting has used its share, it
  pauses and orders keep working. Set the budget to about 40,000.

Target after redesign: about 3 rows per event, **about 35,000 rows/day** at 2,000 visitors, leaving two thirds
of the allowance for orders and admin work.

### 7.4 D1 rows read

- Catalogue build: ~50 rows per miss. Worst case with no caching: 3,000 × 50 = 150,000.
- Checkout pricing: ids → primary-key reads, ~10 rows per quote.
- Tracking: 2–4 primary-key reads per event → about 40,000.
- Admin polling: about 15,000.
- Sitemap: 33 rows per rebuild, hourly.
- **Total well under 500,000 of 5,000,000**, provided every filter is indexed (section 4.1). The risk is a
  forgotten index on a growing table (`visitor_sessions`, `analytics_dedup`, `orders`), where one admin dashboard
  query could scan tens of thousands of rows per poll.

### 7.5 CPU, subrequests, size

Covered in 3.4–3.6. Summary: scrypt is a blocker on free, Gemini describe is borderline, the rest is comfortable.

---

## 8. Local development and deployment

### 8.1 Local

- `wrangler dev` runs the Worker and serves `dist/` with a local D1 (SQLite file under `.wrangler/`).
  For hot reload of the React app, run `vite` and proxy `/api` and `/sitemap.xml` to `wrangler dev`, or use the
  Cloudflare Vite plugin **[unverified fit with this project's Vite 6 setup]**.
- Local secrets in `worker/.dev.vars` (git-ignored; `.gitignore` already ignores `.env*` but **not** `.dev.vars` — add it).
- `wrangler d1 migrations apply sag-db --local`, then load a scrubbed seed.
- Unit tests: `api/_lib/orders.test.mjs`, `alerts.test.mjs`, `payu.test.mjs` exist (`package.json:12`). Port them to
  Vitest with the Workers pool so they run in the real runtime (this is also where the `en-IN` formatting question
  from 3.3 gets answered).
- Local behaviours to preserve or drop consciously: on `localhost` the admin panel writes settings to
  `localStorage` instead of the API (`src/context/AdminContext.tsx:721-728`, `:746`, `:793`) and `readsLive()` is true
  (`src/lib/catalog.ts:28`).
- Wrangler needs Node 18+; the machine has v24.19.0.

### 8.2 Secrets and variables

Set with `wrangler secret put <NAME>` (never in `wrangler.jsonc`, never in chat):

| Name | Used at | Note |
|---|---|---|
| `ADMIN_SESSION_SECRET` | `api/admin-config.js:281`, `api/_lib/payu.js:146` | carry the same value over |
| `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_INITIAL_PIN` | `api/admin-config.js:211-213`, `:257-259` | only for first bootstrap; the env-fallback login should not be ported |
| `ADMIN_PEPPER` | new | section 3.4 |
| `BETTER_AUTH_SECRET` | new | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | new (client id is public; also needed in the browser build) | new Google account |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `api/_lib/payu.js:54-60` | fallback when keys are not saved in the admin panel |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | `api/_lib/cloudinary.js:8-10` | **new** account's values |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | `api/_lib/email.js:11-12` | |
| `GEMINI_API_KEY` | `api/_lib/gemini.js:38` | optional fallback |
| `TRACK_WRITE_BUDGET` | `api/track.js:31` | plain var |
| `SITE_URL` | new | plain var, per environment |

No longer needed: `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_DATABASE_ID`.

Payment gateway keys saved through the admin panel live in the database (`private_settings/payment_gateways`,
`api/_lib/payu.js:5`), as does the Gemini key (`api/_lib/gemini.js:20`). In D1 they become rows in a server-only
table that no public endpoint selects from. They are stored in plain text today and would be in D1 as well; if the
owner wants better, encrypt them with a key held in a Worker secret.

A Cloudinary detail: several validators accept only URLs of the configured cloud name (`api/reviews.js:53-61`,
lib/orders.js:747-754, `api/_lib/gemini.js:104-113`, `api/_lib/cloudinary.js:29-44`). After switching to the new
account, **old-account URLs stored in existing rows fail those checks** (delete, AI describe, return/review
photo matching). Either re-upload and rewrite URLs during the import, or accept a list of cloud names
(`CLOUDINARY_LEGACY_CLOUD_NAME`) for read-type checks.

### 8.3 Preview before the switch

1. Deploy to `suitauragirls.<account>.workers.dev` with its own D1 database (`sag-db-preview`) and `SITE_URL` set
   to that host. Use wrangler environments (`env.preview`) so production bindings cannot be reached from preview.
2. Add `X-Robots-Tag: noindex` on the preview host so it is never indexed.
3. Test list on preview: OTP sign-in, Google sign-in (needs the preview origin added to the OAuth client), admin
   login on a phone, catalogue load, checkout with Razorpay **test** keys, PayU sandbox return and webhook,
   Razorpay webhook with a test secret pointed at the preview URL, review + photo, return request + photo, admin
   order status change with stock restore, sitemap, and a forced double delivery of the same webhook.
4. Live Razorpay cannot be tested on the preview host without registering it at Razorpay **[unverified]**; plan one real
   small payment immediately after cut-over, with the owner present.

### 8.4 Domain and DNS (registrar stays GoDaddy)

- A Worker Custom Domain requires the zone to be on Cloudflare DNS **[unverified but standard]**. That means
  changing the **nameservers** at GoDaddy to Cloudflare's. The registration itself stays at GoDaddy.
- Before changing nameservers: add the site to Cloudflare, let it scan, then compare **every** record with
  GoDaddy's zone by hand: `A`/`CNAME` for apex and `www`, `MX`, SPF/DKIM/DMARC `TXT` (Brevo sender
  authentication if the domain is used for sending — the default sender is a Gmail address, `api/_lib/email.js:12`,
  so this may not exist), Google Search Console, Meta domain verification, anything else. A missed record is the
  most likely cause of an outage that has nothing to do with the code.
- Sequence that separates the two risks:
  1. Move DNS to Cloudflare with records still pointing at Vercel, proxy **off** (grey cloud). The site is unchanged. Wait a day.
  2. At a quiet hour with ads paused, freeze writes on the old site, run the final data import, attach
     `www.suitauragirls.in` to the Worker as a Custom Domain, add the apex redirect.
- Set SSL mode to Full (strict); the Worker custom domain gets a Cloudflare certificate automatically.

### 8.5 Rollback

- Keep the Vercel project, its environment variables, the Firebase project and the old Cloudinary account
  untouched for at least a week (nothing in this plan deletes them).
- Rollback action: in Cloudflare DNS, detach the custom domain from the Worker and restore the `www` and apex
  records to Vercel's targets, proxy off. Takes effect in minutes because the zone is already on Cloudflare.
- **Data is the hard part of rollback, not DNS.** Orders taken on the new stack exist only in D1. Before going
  back, export new orders, customers and stock changes from D1 and decide whether to replay them into Firestore
  (a script for this should exist before cut-over) or handle them by hand. With about 1–2 orders a day today
  (38 orders in the export), by hand is realistic for a short window.
- Firestore's free quota is the reason for the migration; a rollback lands on the same quota problem unless
  Blaze is active. Treat rollback as an emergency exit for a broken checkout, not as a comfortable fallback.
- Razorpay and PayU webhooks follow the domain, so they follow the rollback automatically. A payment captured
  during the switch is reconciled by whichever stack receives the webhook; the other stack does not know the order.
  Keep the write-freeze window short and check the Razorpay dashboard for payments in that window.
- D1 Time Travel gives 7 days of point-in-time restore on the free plan. Also run `wrangler d1 export` after
  cut-over and then on a schedule (a manual weekly export is enough at this size).

---

## 9. Folder layout and build order

### 9.1 Layout (new folders only; nothing existing moves)

```
worker/                         new — the Cloudflare app
  wrangler.jsonc
  package.json                  own dependencies: hono, drizzle-orm, better-auth, wrangler, drizzle-kit, vitest
  tsconfig.json
  drizzle.config.ts
  drizzle/                      generated SQL migrations
  scripts/
    build.mjs                   runs the web build, writes dist/_headers
    set-admin-hash.mjs          local: re-hash admin password + PIN (section 3.4)
  src/
    index.ts                    Hono app, middleware, route mounting, scheduled() for cron
    env.ts                      Env type (DB, ASSETS, secrets)
    auth.ts                     Better Auth factory
    middleware/                 security headers, same-origin, identity (customer + admin), rate limit
    db/
      client.ts
      schema/                   catalogue.ts, orders.ts, customers.ts, settings.ts, analytics.ts, auth.ts
      repo/                     orders.ts, products.ts, coupons.ts, settings.ts, rateLimits.ts ...
    lib/                        ported pure logic: pricing, returns, views, payu, razorpay, cloudinary, email, gemini
    routes/
      admin-config.ts  orders.ts  customer-auth.ts  reviews.ts  alerts.ts  track.ts
      payu.ts  webhooks-razorpay.ts  sitemap.ts
      admin/                    products.ts, categories.ts, coupons.ts, reviews.ts, orders.ts, analytics.ts, versions.ts ...
      me.ts  leads.ts
  test/
web-cf/                         new — browser-side replacements used only by the Cloudflare build
  vite.config.ts                root = repo root, outDir = dist, swaps the modules below, no firebase chunk
  overrides/
    lib/firebase.ts             empty stand-in
    lib/dataStore.ts            same exports as src/lib/dataStore.ts, backed by fetch + polling
    lib/api.ts                  same exports, cookie-based
    context/AuthContext.tsx     same context shape, Better Auth session
    utils/googleSignIn.ts       same exports, no Firebase bridge
  shims/
    firestore.ts  auth.ts  app.ts  analytics.ts   stand-ins for the firebase/* imports made directly by components
migration/                      exists — scripts/, data/ (git-ignored), map/ (these documents)
```

`worker/` has its own `package.json`, so the root `package.json`, the root `vite.config.ts` and `vercel.json` are
not touched and `vercel deploy` from the root keeps producing today's site. Check that Vercel does not try to
treat `worker/` as functions (it only picks up `/api`), and add `worker/.dev.vars` and `worker/.wrangler/` to `.gitignore`.

### 9.2 The frontend question: one source tree, two backends

`src/` imports Firebase in about 25 files (list in 4.3 and 5.3). The Cloudflare build needs those imports to
resolve to something else, while the Vercel build must stay as it is until cut-over. Two ways:

**Option A — build-time swap (matches the "new folders only" rule).** `web-cf/vite.config.ts` adds a small
resolver plugin: after normal resolution, if the absolute path is one of five files (`src/lib/firebase.ts`,
`src/lib/dataStore.ts`, `src/lib/api.ts`, `src/context/AuthContext.tsx`, `src/utils/googleSignIn.ts`) it returns
the file in `web-cf/overrides/`; and it maps `firebase/app`, `firebase/auth`, `firebase/firestore`,
`firebase/analytics` to `web-cf/shims/`. The Firestore shim implements only the functions the components call
(`doc`, `collection`, `query`, `where`, `orderBy`, `limit`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `addDoc`,
`deleteDoc`, `onSnapshot`, `runTransaction` for the one stock-adjust case) on top of the endpoints in 5.3.
`src/lib/dataStore.ts:54-94` is already a narrow seam, which is what makes this workable.

- Good: zero edits to existing files, both sites build from the same commit, a storefront fix made during the
  migration reaches both.
- Cost: the shim is throwaway code, and it must map each collection + operation to a specific, role-checked
  endpoint. It must **not** become a generic "run this query" endpoint: that would re-create Firestore without
  its security rules.
- After cut-over, replace shim call sites with direct calls file by file and delete the shim.

**Option B — branch.** Do the frontend changes directly in `src/` on a long-lived branch in a separate git
worktree folder, and keep deploying Vercel from `main`. Simpler code, but every storefront change during the
migration has to be made twice or merged, and a deploy from the wrong folder would break the live site
(deploys are done from the local folder with the Vercel CLI).

Recommendation: A for the cut-over, then clean up. This is a judgment call; see open questions.

### 9.3 Build order

1. **Scaffold**: `worker/` with Hono, `wrangler.jsonc`, static assets from the existing `dist/`, security headers,
   `/api/health`. Deploy to `workers.dev`. Confirms SPA fallback, `_headers` on fallback paths, and that page loads do not count as Worker requests.
2. **Schema + import**: Drizzle schema, migrations, import script from the export, row-count and checksum comparison. Local first, then the preview database.
3. **Read path**: catalogue, public settings, sitemap, with the Cache API. Point the Cloudflare frontend build at it; the storefront should browse fully on preview.
4. **Pure logic + tests**: copy pricing, coupon, returns, views, PayU hashing, email templates into `worker/src/lib`, port the three test files, add the runtime checks (locale formatting, crypto).
5. **Admin auth**: signed cookie, new hash format, rate limit, `session`/`security`/`login`/`logout`. Measure CPU of login on preview.
6. **Customer auth**: Better Auth, OTP wrapper with the store's limits, Google ID-token sign-in, `get-session`, new `AuthContext`.
7. **Orders and payments**: `quote`, `check-coupon`, `gateways`, `create`, `verify`, `payment-result`, `pay-again`, `finalizePaidOrder` batch, Razorpay webhook, PayU return + webhook. Test duplicates and races deliberately.
8. **Customer data**: profile, addresses, my-orders, track, cancel, returns + photos, reviews + photos, alerts, leads, checkout drafts.
9. **Admin data**: products (with stock log), categories, coupons, reviews, orders, customers, leads, settings, gateways, Cloudinary sign/delete, AI describe; the versions poll and ETags.
10. **Tracking**: redesigned `track` with the write budget; admin analytics endpoints; cron clean-up.
11. **Hardening**: per-action subrequest and query counts, index review with `EXPLAIN QUERY PLAN`, usage alerts, optional Cloudflare Access.
12. **Rehearsal**: full import into preview, complete test list (8.3), timed dry run of the cut-over and of the rollback.
13. **Cut-over** (8.4) and one week of watching both dashboards before anything old is switched off.

Steps 3–6 can be shown to the owner on the preview URL as they land.

---

## 10. Risks and unknowns

| # | Risk | Why | Mitigation |
|---|---|---|---|
| 1 | Free-plan ceilings still exist | 100k requests, 100k rows written per day; hard failure at the limit | Estimates in 7; usage alerts; Workers Paid as the switch to pull; tell the owner plainly |
| 2 | Tracking writes exceed the D1 write limit if ported as-is | ~110k rows/day at 2,000 visitors (7.3) | Redesign to ~3 rows/event, keep the budget guard |
| 3 | Admin login exceeds 10 ms CPU | two scrypt runs (`api/admin-config.js:190`, `:199`, `:545-546`) | HMAC + pepper, or paid plan |
| 4 | Scope: ~50 direct Firestore call sites need endpoints | section 5.3 | Narrow shim over typed endpoints; build order steps 8–9 |
| 5 | Double processing or lost update in payments | interactive transactions become guarded batches | Pattern A; forced duplicate-webhook tests; `stock_movements` ledger |
| 6 | PayU return lands on the SPA shell | navigation POST to `/api/payu` | `run_worker_first: ["/api/*", ...]`; test in sandbox |
| 7 | Server-only collections missing from the export | client-SDK export cannot read `admin_credentials`, `private_settings`, `customer_email_otps`, `rate_limits`, `alert_state`, `alert_log`, `stock_alerts`, `shared_wishlists`, `review_photos`, `return_photos`, `review_votes`, `analytics_dedup` (default-deny at `firestore.rules:141-143`) | Admin-SDK export for the ones that matter: gateway keys, AI key, stock alerts, shared wishlists, photo records, alert state/log. The rest can start empty |
| 8 | Cloudinary account change breaks URL validators | cloud-name checks (8.2) | re-upload + rewrite URLs, or accept legacy cloud name |
| 9 | Google sign-in needs a new OAuth client under the new account | client id is tied to the old project (`src/utils/googleSignIn.ts:4`) | create early; add preview and production origins |
| 10 | Everyone signed out at cut-over; admin possibly too | Firebase sessions do not transfer; admin cookie path changes | announce nothing, it is one OTP; keep `ADMIN_SESSION_SECRET` and `session_version` |
| 11 | DNS move drops a record | nameserver change at GoDaddy | manual record comparison; move DNS a day before the app |
| 12 | Rollback loses new orders | D1-only data after the switch | D1 → Firestore replay script or manual list; short window |
| 13 | Intl `en-IN` formatting differs in the Workers runtime | 3.3 | runtime unit test; fallback formatter |
| 14 | Gemini describe exceeds CPU or memory | 3.4 B | smaller images, caps; measure |
| 15 | Price-drop / restock alerts exceed subrequest limits as wishlists grow | `api/alerts.js:50-93` | SQL-side selection, capped sends, cron continuation |
| 16 | Better Auth API details | options and ID-token sign-in written from memory | spike in build step 6 before committing to the wrapper design |
| 17 | `_headers` on SPA fallback paths, Cache API on `workers.dev`, whether a batch counts as one query | not covered by the docs read | check in build step 1 |
| 18 | Review-id key tied to the Firebase service account | `api/reviews.js:67-75` | carry key material or add a private email column |

---

## 11. Open questions for the owner / lead

1. Admin password hashing: accept HMAC + pepper on the free plan, or pay USD 5/month and keep scrypt? (The paid plan also removes risks 1, 2 and 14.)
2. Cloudflare Access in front of the admin API: yes or no? It adds a Google login on each new device.
3. Frontend approach: build-time swap with a temporary shim (9.2 A) or a separate branch (9.2 B)?
4. Is Google sign-in actually enabled in production today (`VITE_GOOGLE_LOGIN`)? If not, it can ship after cut-over.
5. Existing image URLs: re-upload everything to the new Cloudinary account before cut-over, or keep old URLs working for a period? The old account must stay alive either way until this is decided.
6. Visitor analytics: is per-session detail (device, actions list) still wanted, or are daily totals enough? Totals only would cut D1 writes by more than half.
7. Can a Firebase service-account key still be used locally for a one-time Admin-SDK export of the server-only collections (risk 7), given the exhausted quota? If not, gateway keys, the Gemini key and admin credentials are re-entered by the owner.
8. How does the apex domain behave today (redirect to `www`, or serve directly)?
