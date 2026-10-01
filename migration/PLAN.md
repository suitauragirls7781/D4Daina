# Migration plan: Vercel + Firebase to Cloudflare Workers + D1 + Better Auth + new Cloudinary

Store: www.suitauragirls.in (live, real payments). Written 2026-10-02 from `migration/map/01`–`08`,
`migration/BUILD-SPEC.md`, the local export `migration/data/export-2026-10-01T18-15-19/` and the repository.
Nothing live was called to write this. Secrets are named by variable name only.

Fixed by the owner: same domain, same customer sign-in methods (email code + Google, no passwords), all existing
data carried over, **nothing deleted on the old side**, everything under the new Google account, work starts now,
and the owner is told what is happening at each step.

Reference style: "06 §6 B4" = `migration/map/06-quota-hotspots-and-bridge.md`, section 6, item B4.
"unverified" = not provable from the files read.

---

## 0. Read this first

### 0.1 Two documents disagree on the route. Decision D0 is needed before more code is written.

| | `migration/map/01`, `04`, `07` (and the task brief) | `migration/BUILD-SPEC.md` (written after the map; builders are already working to it) |
|---|---|---|
| API code | rewritten route by route on Hono | `api/**` kept **unchanged**, run through a Node-style adapter (`BUILD-SPEC.md:6-22`) |
| Database | relational tables, Drizzle (01 §4) | one `docs` table, one row per Firestore document (`BUILD-SPEC.md:63-85`) |
| Customer auth | Better Auth session cookie (04 §4, 07 §6.2) | own HS256 token, `AUTH_TOKEN_SECRET` (`BUILD-SPEC.md:163-180`) |
| Browser | calls typed endpoints | Firebase SDK replaced by shims that call `POST /api/db` (`BUILD-SPEC.md:217-273`) |

Evidence that the second route is in progress: `worker/src/`, `worker/test/` and
`migration/scripts/build-d1-import.cjs` exist; a D1 database id is already in `BUILD-SPEC.md:209`.

**Recommendation: do both, in this order.**

- **Stage A, "lift" (Phases 2–6):** cut over on the BUILD-SPEC design. The money path stays the tested code, the
  store leaves Firestore in days instead of weeks, and the owner's "no quota problem" goal is met soonest.
- **Stage B, "remodel" (Phase 7):** after cut-over, replace the document store and the home-made tokens with
  Drizzle tables and Better Auth, one collection group at a time, on Cloudflare, where a preview Worker with its
  own D1 copy is free and there is no Firestore quota to protect. This is the stack the owner chose; it is
  reached without betting the live checkout on a full rewrite.

If the lead rejects the two hops and wants Drizzle + Better Auth at cut-over, Phase 7 moves in front of Phase 4,
Phases 2–3 follow 07 §9 instead of BUILD-SPEC, and the bridge (Phase 0) must hold for 5–8 weeks instead of about
one. The route order, checks and runbook below stay the same. Section 9 gives the effort for both.

### 0.2 What cannot be promised

"Never a quota problem" is not something the Cloudflare free plan guarantees. It has daily ceilings: 100,000
Worker requests, 100,000 D1 rows written, 5,000,000 rows read, 10 ms CPU per request (07 §7.1). At today's
traffic (822 visits on 09-29, 08 §4.3) usage is a small fraction of that, and a ceiling is lifted in minutes by
switching on Workers Paid (USD 5/month, figures unverified, 07 §7.1). The owner must hear this in plain words
before cut-over (07 §7.1, 08 §8 Q11).

### 0.3 Do these before anything else (today)

1. **Money check.** The export holds zero orders created on 2026-10-01 and the Razorpay webhook answers 500 while
   Firestore is exhausted (08 §2.4; `api/webhooks/razorpay.js:75-78`). The owner lists captured Razorpay payments
   from 30 Sept onward and matches each to an order by receipt = order number. Any captured payment on an
   `Unpaid` order is finalised on the old site (open the order's payment-result page once the database answers)
   **before** any export that feeds D1. Also confirm the webhook is still shown as enabled.
2. **Snapshot the working folder.** The live site is deployed from this folder; 205 paths differ from commit
   `dc72a31` and four `public/` files are untracked (08 §6.3, 05 R1). With the owner's approval: commit to a new
   branch or zip the folder (without `node_modules`, `dist`, `.env*`, `migration/data`). This is the rollback
   source and the proof that nothing was lost.
3. **Do not regenerate Razorpay keys or change the webhook secret yet.** `.env.migration:12` and `:15` tell the
   owner to press "Regenerate Key" and set a new webhook secret. Doing that while the old site is live can stop
   live payments or webhook confirmation on the old site. Rotation is a cut-over step (Phase 5, step 6).
4. **Read the Firebase usage graph** (reads vs writes, by hour, for 1 Oct). With the real catalogue size (52
   documents, not 250) the map cannot explain the exhaustion (08 §4.1–4.3). The answer orders the bridge items.

---

## 1. Phase 0 — bridge on the existing app (today)

Goal: keep Firestore under 50,000 reads and 20,000 writes a day until cut-over, without removing a shopper-facing
feature. Source: 06 §6, corrected by 08 §4. These are edits to existing files and one Vercel deploy, so they need
the owner's go-ahead and are the one exception to "existing files are not edited" (`BUILD-SPEC.md:26-27`).

Alternative the owner already has on the table: activate Blaze on `thor-217e7`. With Blaze active, only items 1–4
below are needed, as protection against a surprise bill.

**Deploy in this order** (each item: files, expected effect, check without touching production):

| # | Change | Where | Why first |
|---|---|---|---|
| 1 | Tracking switch: `TRACK_MODE=off\|lite\|full`, and make `TRACK_WRITE_BUDGET=0` mean zero | `api/track.js:31`, `:68` (06 B4.1) | Largest per-visitor cost: 4 reads + 6 writes per visit, 3 + 4 per product view (06 §2.1). Ship with `lite`. A changed env var needs a redeploy on Vercel (08 §4.4, unverified). |
| 2 | Shoppers never open live Firestore listeners; add `public/catalog-snapshot.json` as last resort | `src/lib/catalog.ts:65-105`, `src/context/ShopContext.tsx:271`, `src/context/AdminContext.tsx:749-753` (06 B2) | The failure amplifier: about P + C + K + S + 6 reads per first-time visitor per page load when the catalogue call fails (06 §1.3). Most likely cause of "gone in 3 hours" (08 §4.3). |
| 3 | Stop the two admin loops | `src/context/AdminContext.tsx:810-812` (15 s settings loop), `:612-615` (`storage` listener, `security` on every check) (06 B6.1–2) | Up to 240 calls/hour per stuck tab; starts exactly after a quota outage (06 §4.3). |
| 4 | Product page: no per-view reads | `src/components/ProductReviews.tsx:178-185`, `src/components/ProductDetailPage.tsx:60-68` (06 B3) | 2+ reads per product view. For B3.2 either add `todayStats` to the catalogue or simply hide the line during the bridge; it only shows at 5+ views (`ProductDetailPage.tsx:462-464`). |
| 5 | Catalogue: 60-minute bucket, 10-minute in-function guard, ignore unknown `v` | `src/lib/catalog.ts:22`, `api/admin-config.js:457-486` (06 B1.1–4, Option A) | 288 to 24 builds/day per region; closes the `v=<random>` cache-busting path (06 §1.2). |
| 6 | Sitemap cached 24 h | `api/sitemap.js:82` (06 B9) | Up to 23 × P reads/day saved. |
| 7 | Abandoned-checkout capture: at most 3 writes | `src/components/CheckoutPage.tsx:209-282` (06 B5) | Only if writes were the exhausted quota. |
| 8 | **New, not in 06:** one-time reload hook in the old bundle | `src/lib/api.ts` (response handler), `src/components/ErrorBoundary.tsx:14,29-30` already has the reload-once pattern | After cut-over, tabs still running the old bundle send Firebase tokens the Worker does not know and keep writing to old Firestore (08 §6.1). The old bundle must already contain "if an API answer carries `reload: true` (or header `X-SAG-Build` differs), reload once". It can only be shipped before cut-over, so it ships with the bridge. |

Skip unless cut-over slips past a week: 06 B6.3–8, B7, B8.

Operating rules until cut-over (06 §6 end): no tests, audits or scripts against the live site; one admin tab,
dashboard closed during ad hours; price-drop alerts off in Admin → Discovery, or no bulk price cuts
(`api/alerts.js:49-50` reads up to 5,000 profiles per drop).

Verification (all local, 06 gives a recipe per item): fake-`db` unit tests that count reads and writes; Playwright
on `vite preview` under a non-localhost name with `/api/admin-config*` forced to 503, asserting zero requests to
`firestore.googleapis.com` for a guest walking home → product → bag → checkout.

Rollback: redeploy the snapshot from §0.3 step 2.

---

## 2. Phase 1 — accounts, exports, assets (parallel with Phase 0)

### 2.1 Accounts (owner; see section 8)

Cloudflare account under the new Gmail (a D1 database already exists, `BUILD-SPEC.md:209`), new Cloudinary
account, Google Cloud project with an OAuth Web client, GitHub repo. Razorpay, PayU and Brevo are KYC- or
sender-bound: recommendation is to keep those accounts and only move where their keys are stored (05 §13 Q2).

### 2.2 Firestore export

| Part | State | Action |
|---|---|---|
| 19 collections through the browser SDK with the admin token | done 2026-10-01 18:15 UTC (`_summary.json`) | Rehearsal data only. The import that goes live must be a **fresh full export** taken inside the freeze window (08 §6.2). |
| 12 server-only collections: `private_settings`, `admin_credentials`, `stock_alerts`, `shared_wishlists`, `alert_state`, `alert_log`, `review_photos`, `return_photos`, `review_votes`, `customer_email_otps`, `rate_limits`, `analytics_dedup` | not exported (01 §1 point 4; five answered permission-denied, seven are not in the script's list) | Write `migration/scripts/export-firestore-admin.cjs`; it is referenced at `export-firestore-client.cjs:18-19` but does not exist (08 §6.4.6). Run once after the quota reset, with `FIREBASE_SERVICE_ACCOUNT` supplied by the owner in the shell (it is not in `.env.migration`). Export the first nine; the last three are ephemeral and start empty (01 §6). Owner approval required: it reads live Firestore. |
| If the Admin-SDK export cannot run | | Gateway keys and the Gemini key are re-entered in the new admin panel; admin login bootstraps from `ADMIN_INITIAL_*`; `stock_alerts`, `shared_wishlists`, `alert_log`, photo records are lost promises (01 §4.13) and must be called out to the owner, not skipped silently. |

Read cost of a full export: about 1,900 documents today, of which 1,625 are `visitor_sessions` (01 §3). Take it
right after the daily reset.

### 2.3 Cloudinary copy

1. Finish the download: 124 of 128 manifest entries are on disk, 4 failed
   (`migration/data/assets/_manifest.json`; 05 §6.4). Find out whether the 4 are deleted assets or transient
   errors. No `hero`, `banners` or `returns` assets were found.
2. Before any upload, test the new account's folder mode with one image per upload flow (admin, review photo,
   return photo). Two flows sign `folder` and expect `suitauragirls/...` in the delivery URL
   (`api/_lib/cloudinary.js:41-43`, `api/reviews.js:58`); a "dynamic folders" account may not produce that
   (05 §6.1, unverified).
3. Upload originals with the **same public ids**, `overwrite=false`, correct resource type
   (`upload-cloudinary-assets.cjs`, `BUILD-SPEC.md:282-284`; not written yet). Play all three reel videos from
   the new account (08 §6.7.4).
4. URL rewrite happens in the import builder (old cloud name → new). Version segments (`v<digits>`) differ
   between accounts; 05 §6.5 step 3 says drop them, BUILD-SPEC keeps them. Decide by test: every rewritten URL
   must answer 200 from the new cloud with `f_auto,q_auto,c_limit,w_960` applied.
5. Assert zero occurrences of the old cloud name in the import files. A wrong rewrite silently deletes reels on
   the next admin save (`api/admin-config.js:74-81`; 08 §6.7.4).
6. The new stack is **never** given the old account's API secret (05 §6.2). The old account stays alive with no
   end date: old URLs live in sent emails and in shoppers' `localStorage` (05 R5).

---

## 3. Phase 2 — D1 schema, import, verification counts

### 3.1 Schema

- **Stage A:** `docs`, `collection_versions`, `tx_guard` plus expression indexes (`BUILD-SPEC.md:63-91`).
  Document ids unchanged: product ids are in public URLs, the order number is the Razorpay receipt, profile ids
  are emails (01 §1 point 5).
- **Stage B:** 01 §4 with these corrections written into 01 **before** any Stage B code:

| Correction | Source |
|---|---|
| `attempt_key`: plain index, not unique; lookup `ORDER BY created_at DESC LIMIT 1` | 08 §2.1 (blocker) |
| One "mark paid" design: 07 §4.2 Pattern A with `stock_movements`; guard `payment_status NOT IN ('Paid','Refunded')`; the claiming statement also writes `deducted_quantities`, `stock_shortfall`, the `Processing` timeline entry, `updated_at` and the shortfall note; shortfall derived from `order.items` so a deleted product still appears; `changed` = `meta.changes` of the claiming statement | 08 §2.2 (blocker) |
| Store data keyed by lowercase email, not Better Auth `user.id` | 08 §3.1, 04 §4.1 |
| Integer `version` column for optimistic updates | 08 §5 |
| `deleted_at` on orders; an order with a gateway id is never hard-deleted | 08 §2.3.4 |
| `wishlist_items.position`; relax or validate `reviews.rating` | 08 §3.2–3.3 |
| Back-fill `stock_movements` from `deductedQuantities` for the 3 paid orders | 08 §6.7.6 |
| Hash the email in `rate_limits` key `cancel:<email>` | 08 §3.6 |

### 3.2 Import

`build-d1-import.cjs` (`BUILD-SPEC.md:277-281`): newest export → SQL chunks → `wrangler d1 execute --file`,
first into local D1, then a **preview** database, and into production only at cut-over. Never the ORM for bulk
load (100 bound parameters per statement, 07 §4.1).

### 3.3 Counts the importer must print and `--verify` must match

Rehearsal values, from `_summary.json` and 08 §1. The cut-over run compares against its own fresh export.

| Collection | Docs | Extra assertion |
|---|---|---|
| products | 33 | 3 kids + 2 toy by `productType`; sum of `stockQuantity` equal on both sides |
| categories | 3 | |
| coupons | 1 | `usageCount` equal |
| reviews | 7 | 4 admin-created `rev-`, 2 `rv_` with photos |
| orders | 38 | 3 Paid, 1 Refunded, 34 Unpaid; doc id = `orderNumber` in all; sum of `finalTotal` over paid orders equal; `razorpayOrderIds` / `payuTxnIds` kept on every unpaid order; duplicate `attemptKey` allowed (08 §7.1) |
| customers / profiles | 9 / 9 | same 9 emails, all lowercase |
| abandoned_checkouts | 78 | |
| storefront_settings | 8 | `value_json` parses; 3 reels, 6 hero slides, 11 occasions |
| visitor_sessions | 1,625 | |
| daily_analytics / product_daily / search_terms / feature_daily / analytics_totals | 4 / 64 / 11 / 9 / 1 | baseline fields kept (01 §2.23) |
| inventory_log | 14 | |
| leads, admin_settings, hero_slides | 0 | |
| Server-only (after 2.2) | unknown | print counts; never print values of `private_settings` or `admin_credentials` |
| Cloudinary | | 0 strings containing the old cloud name; every distinct URL answers 200 |

Also decide on import (owner, 08 §8 Q9): flag the 6 admin test orders and the refunded test order as tests.

---

## 4. Phase 3 — build the Worker (Stage A) and verify it route by route

Build per `BUILD-SPEC.md` §3–§10. The order below is the order in which each piece is **switched on and proven**
on preview. The money path is last and gets the most tests.

### 4.1 Two backends side by side

- **Old:** `vite build` → `dist/`, Vercel, `api/**` with firebase-admin. Untouched and live until cut-over.
- **New:** `vite build --mode cloudflare --outDir dist-cf` (Vite aliases swap the Firebase SDK for
  `src/shims/*`, `BUILD-SPEC.md:244-248`) + `worker/` on `suitauragirls.<account>.workers.dev`, bound to a
  **preview** D1 loaded from the rehearsal export. Same commit builds both; a storefront fix reaches both.
- The switch between them is the hostname: `www` → Vercel until cut-over, `*.workers.dev` → Worker. No runtime
  flag is needed in Stage A. At cut-over the switch is the DNS record.
- Preview rules: `X-Robots-Tag: noindex` on the preview host; Razorpay **test** keys and PayU **test** mode only
  (both are offered only to a signed-in admin, `api/_lib/payu.js:67-72`); a wrangler environment so preview can
  never reach the production D1 (07 §8.3).

### 4.2 Three points where "api/** unchanged" does not hold as written — settle before step 5

| Issue | Evidence | Options |
|---|---|---|
| Site origin is a literal in five API files, so PayU `surl`/`furl`, email links and gateway callback URLs on preview point at the **live** site | `api/orders.js:36`, `:76-77`; `api/alerts.js:10`; `api/sitemap.js:3`; `api/_lib/email.js:2`; `api/admin-config.js:41-44` (07 §3.2) | (a) one-line `process.env.SITE_URL \|\| '<literal>'` in each: identical on Vercel where the var is unset; (b) accept that PayU's return leg cannot be tested on preview and test it in the first minutes after cut-over. Recommend (a). |
| Admin login runs two `scryptSync` per login; the free plan allows 10 ms CPU | `api/admin-config.js:188-201`, `:545-546` (07 §3.4 A; cost unverified) | Measure on preview first. If the request is killed: Workers Paid, or the HMAC + pepper re-hash of 07 §3.4 (an edit to `api/admin-config.js` plus a local re-hash script). Owner decision (08 §8 Q11). |
| Tracking writes multiply on D1 | each document write = row + `collection_versions` row + expression-index entries (`BUILD-SPEC.md:76-91`); a visit is 6 document writes (`api/track.js:133-190`); 07 §7.3 estimates over 100,000 rows/day at 2,000 visitors | Keep `TRACK_WRITE_BUDGET` (default 8000, `api/track.js:31`), ship with the Phase 0 `lite` mode, measure real rows/event on preview, redesign in Phase 7 group 1. |

### 4.3 Order of work

| Step | Server piece | Browser piece in the `cloudflare` build | Proof on preview |
|---|---|---|---|
| 1 | Scaffold: router, node adapter, static assets, `_headers`, `/sitemap.xml`, `run_worker_first: ["/api/*","/sitemap.xml"]` (`BUILD-SPEC.md:182-215`) | none | SPA deep link loads; a form POST to `/api/payu` reaches the Worker, not `index.html` (07 §2.2); admin-path headers present on the SPA fallback (unverified, 07 §2.3); page loads do not count as Worker requests |
| 2 | Document store + firebase-admin shims + tokens (`BUILD-SPEC.md` §3–§5) | none | `node --test`; guard/rollback proven once on real local D1 (`BUILD-SPEC.md:290-292`); the existing `api/_lib/*.test.mjs` pass on the shim; `en-IN` number and date formatting checked inside the Workers runtime (07 §3.3, unverified) |
| 3 | Read path: `/api/admin-config?action=catalog`, public settings, sitemap, cached with the Cache API (`BUILD-SPEC.md:203-204`) | `firebase/app`, `firebase/analytics` shims | storefront browses fully as a guest; response shape equals today's so `sag_catalog_saved_v1` stays valid (05 §9.1); second load makes zero D1 reads on the custom domain (Cache API on `workers.dev` unverified, 07 §4.4) |
| 4 | `/api/track` | none (raw `fetch`) | rows written per visit and per product view measured; budget pause works |
| 5 | Admin auth: `login`, `session`, `security`, `logout` | `firebase/auth` shim for the `sag-admin` app | login from a phone; CPU time of login; cookie is `Secure` (`vars.VERCEL="1"`, `BUILD-SPEC.md:210`); "sign out everywhere" still works |
| 6 | `/api/db` gateway + `rules.js` (`BUILD-SPEC.md:217-242`) | `firebase/firestore` shim incl. multiplexed `onSnapshot` | rules tests: every allow and deny in `firestore.rules`; anonymous cannot read `orders`, `profiles` of others, `private_settings`, `admin_credentials`; public writes limited to `abandoned_checkouts` and `leads` shapes. This endpoint is a generic query path and must be exactly as strict as the rules (07 §9.2 warns about this); it is removed in Phase 7 |
| 7 | Admin data: products, categories, coupons, settings PUT, Cloudinary sign/delete, AI describe, stock adjust, leads, dashboard | admin panel on shims | every admin screen in 03 §2.1 A23–A37 and §2.2 W10–W25; upload + delete one throw-away image on the **new** Cloudinary; Gemini describe CPU and subrequest count (07 §3.4 B) |
| 8 | Customer auth: `send`, `verify`, `google` | customer `firebase/auth` shim; Google credential sent directly (`BUILD-SPEC.md:174-180`) | OTP sign-up and sign-in with all limits of 04 §1.1; Google button and One Tap; OTP-then-Google and Google-then-OTP land on one account; cart, wishlist, addresses of an imported customer appear |
| 9 | Reviews, alerts, leads, newsletter, checkout draft | shims | review + photo on new Cloudinary; helpful vote; restock subscribe; shared wishlist link from the import opens |
| 10 | Orders, non-money: `gateways`, `quote`, `check-coupon`, `track`, `my-orders`, `request-cancel`, `return-photo-sign`, `return-request`, `admin-update`, `admin-return` | none (same `/api/orders`) | full return flow (never run in production, 08 §6.7.7); cancel → stock restored once; guest view hides address and payment ref (02 §2.6 item 18) |
| 11 | **Money path:** `create`, `verify`, `payment-result`, `pay-again`, `finalizePaidOrder`, `/api/webhooks/razorpay`, `/api/payu` + `?webhook=1` | none | section 4.4 |

### 4.4 Money-path acceptance tests (all must pass on preview before a cut-over date is set)

Invariants: 02 §2.6 items 1–19. Tests, from 08 §7 and 07 §8.3:

1. Pricing parity: for the exported products and coupon, the Worker and the Node handler return the same quote
   for a set of carts (combo, coupon, prepaid discount, free-shipping edge, accessory with outfit).
2. Signature parity: same inputs → same Razorpay HMAC, PayU request/response hash, Cloudinary SHA-1 (05 §12).
3. Razorpay test payment through checkout; the same payment delivered by `verify` + webhook + `payment-result`
   at the same moment → one stock deduction, one coupon increment, one purchase count, one confirmation email,
   one store alert.
4. Webhook only (tab closed before return); webhook with a bad signature → 401; raw-body signature verified on
   the exact bytes.
5. PayU sandbox: return POST (form-encoded navigation), `?webhook=1`, amount mismatch refused, result-link token
   valid for 2 days.
6. Same bag paid after 31 minutes, and after the admin cancelled the first attempt → a second order is created
   (08 §2.1).
7. Pay-again on an imported unpaid order using its stored `razorpayOrderIds`.
8. Paid → Unpaid → Paid on a test order: stock must be deducted once. The current code deducts twice
   (`api/orders.js:747`, `:771`; `api/_lib/orders.js:415`; 08 §2.3.1). Owner decision: block the transition.
9. Oversell: stock 1, order of 2 → paid, stock 0, shortfall on the order and in `notes`.
10. Webhook for a deleted or unknown order: today 500 and endless retries (08 §2.3.4, §7.6); decide the answer.
11. Quota or timeout error during `verify` must not say "No money has been taken"
    (`api/orders.js:826-828`; 08 §2.4). This is also an `AGENTS.md` §5 honesty-rule matter.
12. After cut-over, with the owner present: one real small Razorpay payment, and one with the tab closed.

Items 8, 10 and 11 need small edits to `api/**`. They are bug fixes to behaviour that exists today; decide per
item whether they ship with Stage A or in Phase 7.

Rollback for Phases 2–3: nothing is live. Delete nothing; redeploy preview.

---

## 5. Phase 4 — auth, Cloudinary, payments, email, Google: configuration for cut-over

### 5.1 Customers

- Stage A: the token the server hands out is the session (`BUILD-SPEC.md:163-173`); identity stays the
  lowercase email, so imported `customers`, `profiles` and `orders.customerEmail` match on first sign-in
  (04 §4.5). There is nothing secret to migrate: no passwords, no Google `sub` (04 §0).
- **Every customer is signed out once at cut-over.** Firebase sessions cannot be converted (04 §4.9). Carts and
  wishlists survive in `localStorage` (same origin) and in the imported profiles. The first load must not treat
  "no session" as a logout that wipes local keys (`src/context/AuthContext.tsx:99-111`).
- Stage B: Better Auth per 04 §4.2–4.4 and 07 §6.2: email-OTP plugin wired to the existing `sendOtpEmail`,
  store limits enforced in D1 (30 s cooldown, 8/day per email, 15/hour per IP, 5 wrong → 30-minute lock;
  `api/customer-auth.js:7-13`), Google by ID token so the button and One Tap stay as they are, account linking
  by verified email, long sliding session, cookie cache, `/api/customer-auth` kept as a thin wrapper so
  `src/components/LoginPage.tsx:60`, `:118` barely change. Pre-create one `user` row per imported customer
  with `emailVerified = true`. To avoid a second forced sign-out, accept a valid Stage A token once and exchange
  it for a Better Auth session (design to be confirmed in the Better Auth spike, 07 §10 risk 16).

### 5.2 Google OAuth client

- The client id at `src/utils/googleSignIn.ts:4` belongs to the old Firebase project. It keeps working while
  that project is alive, which this plan guarantees.
- New Web client under the new Google account: authorised JavaScript origins `https://www.suitauragirls.in`,
  `https://suitauragirls.in` and the preview origin; consent screen published with store name, logo and
  `/privacy-policy` (04 §5.1, 05 §7). Redirect URI `…/api/auth/callback/google` only if Stage B uses the
  redirect flow (unverified).
- The browser constant must come from a build variable in the `cloudflare` build; `GOOGLE_CLIENT_ID` on the
  Worker must be the same value (`BUILD-SPEC.md:177-178`). `VITE_GOOGLE_LOGIN=1` must be set at build time or
  Google sign-in disappears silently (`src/utils/googleSignIn.ts:5`). Whether it is set on Vercel today is
  unverified (04 §6 Q1).

### 5.3 Admin

- Keep username + password + PIN and the signed cookie (04 §4.7). Carry `ADMIN_SESSION_SECRET` over **only if
  the owner can supply the production value**; it also signs PayU result links for 2 days
  (`api/_lib/payu.js:144-149`). `.env.migration:31` already holds a value; whether it equals production is
  unverified. A different value costs one admin sign-in and breaks PayU result links issued in the last 2 days.
- Credentials: import `admin_credentials` from the Admin-SDK export if scrypt fits the CPU limit; otherwise
  bootstrap from `ADMIN_INITIAL_*` (`api/admin-config.js:206-228`) and the owner signs in once.
- Phase 7: cookie `Path=/api` and expire the old-path cookie; `Secure` always; reject missing `Origin` on
  state-changing admin calls; ask for the current password before changing credentials; `logout` requires a
  session; decide the database-down fallback, which accepts a revoked session (08 §5, §6.4.1–4).
- The admin entry slug in use must be confirmed; header rules cover only `admin`, `drdaina`, `d4daina`
  (`vercel.json:44-121`; 05 §13 Q9).

### 5.4 Payments

- Domain and paths do not change, so nothing is edited at Razorpay or PayU: webhook
  `/api/webhooks/razorpay`, PayU `surl`/`furl` `/api/payu`, PayU webhook `/api/payu?webhook=1` (05 §3.5, §4).
- The Worker must hold the **same** Razorpay webhook secret as the dashboard before DNS moves, or closed-tab
  payments are not confirmed (401). The code accepts the admin-saved secret and `RAZORPAY_WEBHOOK_SECRET`
  together (`api/_lib/payu.js:59-60`), which is what makes rotation at cut-over safe.
- Which Razorpay key source is live (env or admin-saved `private_settings`) and whether PayU is live are
  unverified (05 §13 Q1). The export has 2 PayU orders, both unpaid.
- PayU has no env fallback (`api/_lib/payu.js:7,17-22`): merchant key + salt come from the Admin-SDK export or
  are re-entered in the new Admin → Payment Gateways.

### 5.5 Email

- Brevo stays on plain `fetch` (`api/_lib/email.js:10-31`). Needed: `BREVO_API_KEY`, and a sender verified in
  Brevo. OTP sign-in depends entirely on it.
- `BREVO_SENDER_NAME` and `STORE_ALERT_EMAIL` in `.env.migration:22`, `:25` are read by no code (08 §6.4.5).
  The store alert address is `storeSettings.storeEmail`, else `BREVO_SENDER_EMAIL` (`api/_lib/orders.js:28-33`).
  Either set `storeEmail` in the admin panel or drop those two names.
- If `suitauragirls.in` has SPF/DKIM/DMARC or Brevo records at GoDaddy they must be copied to Cloudflare DNS
  (05 R9, unverified). Brevo's free daily cap (300/day, unverified) is shared by OTP, order mails and
  price-drop runs (08 §6.6).

### 5.6 Secrets on the Worker

One list (reconcile `.env.migration` with 05 §10 and 07 §8.2; 08 §6.4.5). Set with `wrangler secret put` or
`set-worker-secrets.cjs` (`BUILD-SPEC.md:285-286`); values are never echoed and never pasted in chat.

Stage A: `AUTH_TOKEN_SECRET`, `ADMIN_SESSION_SECRET`, `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`,
`ADMIN_INITIAL_PIN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `GEMINI_API_KEY`,
`GOOGLE_CLIENT_ID`, `TRACK_WRITE_BUDGET`, plus `SITE_URL` if 4.2 option (a) is taken.
Empty in `.env.migration` today: the three Cloudinary names, the three Razorpay names, `BREVO_API_KEY`.

Review ids: `customerReviewId` is keyed with the `private_key` inside `FIREBASE_SERVICE_ACCOUNT`, with a fixed
literal as fallback (`api/reviews.js:67-75`). With `FIREBASE_SERVICE_ACCOUNT='{}'` (`BUILD-SPEC.md:142-143`)
the fallback key is used, so the two existing `rv_` reviews would not be found by their authors, who would then
create a second review (05 R2; 08 §3.4). Small impact (2 reviews); fix in Phase 7 with a private
`customer_email` column, or add a `REVIEW_ID_SECRET` now.

Stage B adds: `BETTER_AUTH_SECRET` (not the same value as `ADMIN_SESSION_SECRET`, 04 §5 item 14),
`GOOGLE_CLIENT_SECRET`, optionally `ADMIN_PEPPER`.

---

## 6. Phase 5 — cut-over runbook

Preconditions: section 4.4 tests 1–11 green on preview; one timed dry run of the import and of the rollback
(07 §9.3 step 12); owner present; ads paused; quiet hour (after 23:30 IST).

**Day before**

1. Export the full GoDaddy zone. Add the site to Cloudflare, compare every record by hand (A/CNAME for apex and
   `www`, MX, SPF/DKIM/DMARC, Search Console, Meta verification). Note how the apex behaves today (unverified,
   07 §2.5).
2. Change nameservers at GoDaddy to Cloudflare with `www` and apex still pointing at Vercel, proxy off. The site
   is unchanged. Wait until it has propagated (07 §8.4). The registration stays at GoDaddy.
3. Production D1 created, schema applied, all Worker secrets set, Worker deployed (reachable on `workers.dev`
   only).

**Freeze night**

4. Owner pauses ads.
5. Freeze orders on the old site: in the old Admin → Payment Gateways switch both gateways off. `create` then
   answers "Online payment is paused" (`api/orders.js:84-90`); no deploy needed (08 §6.2 option b). Browsing,
   carts and sign-in keep working.
6. Wait 10 minutes for payments in flight. In the Razorpay dashboard confirm no captured payment sits on an
   unpaid order. If keys or the webhook secret are to be rotated, do it now and put the new values on the
   Worker only.
7. Fresh full export: browser-SDK script + Admin-SDK script (section 2.2).
8. Cloudinary delta: download and upload assets added since the first download; rebuild the import with the URL
   rewrite; assert zero old-cloud strings.
9. Import into production D1; run `--verify`; all counts and assertions of section 3.3 must match the fresh
   export.
10. On the `workers.dev` host with production data: admin login, catalogue, one product page, sitemap. In the
    new Admin → Payment Gateways confirm the gateways are **on** (the import copied the "off" state from step 5
    if `private_settings` was exported).
11. Switch: attach `www.suitauragirls.in` to the Worker as a Custom Domain, add the apex → `www` 301 redirect,
    SSL Full (strict) (07 §8.4).
12. Verification checklist, on the real domain:
    - home, category, product, search, bag as a guest; images load from the new cloud
    - OTP sign-in with an existing customer: orders, cart, wishlist, addresses present
    - Google sign-in and One Tap
    - admin login on the owner's phone; edit a product; upload and delete a test image; change a setting and
      see it on the storefront
    - one real small Razorpay payment; one with the tab closed (webhook only); confirmation email and store
      alert arrive once each; stock went down once
    - PayU, if live: one real small payment through the return URL
    - `/sitemap.xml`, `/robots.txt`, `og-image.jpg`, `/suit-aura-logo-512.png` (the four untracked `public/`
      files, 05 R1)
    - Razorpay dashboard: webhook deliveries answer 200
    - a tab left open on the old bundle reloads itself (Phase 0 item 8); guest checkout from such a tab
      completes (08 §7.7)
    - Cloudflare dashboard: Worker requests, CPU time, D1 rows read and written look as measured on preview
13. Owner resumes ads at a low budget; raise after the first real order.
14. 3–6 hours later: "late writes" export of `profiles`, `leads`, `abandoned_checkouts` from old Firestore
    (tabs that had not reloaded) and merge by `updatedAt`, newest wins (08 §6.1).
15. `wrangler d1 export` as the first backup. Resubmit the sitemap in Search Console.

**Rollback (decision within the first hour if checkout is broken)**

1. Cloudflare DNS: detach the custom domain, restore `www` and apex records to Vercel, proxy off. Minutes,
   because the zone is already on Cloudflare (07 §8.5).
2. Old Admin → Payment Gateways: switch gateways on again. This needs one Firestore write; if the quota is
   exhausted at that moment the old checkout stays paused. This is why Blaze or a healthy bridge matters even
   on cut-over night.
3. Orders taken on the Worker exist only in D1: export them and re-enter by hand in the old admin, or replay
   with a script written before cut-over (07 §8.5). At 1–2 paid orders a day, by hand is realistic.
4. Razorpay and PayU follow the domain, so they follow the rollback. If the webhook secret was rotated in
   step 6, the old site must be given the new secret (Admin → Payment Gateways) or closed-tab payments fail.
   This is the reason to rotate only if necessary.

**What stays alive, untouched, for at least a week** (nothing is deleted by this plan)

| Thing | Until |
|---|---|
| Vercel project and its env vars | one clean week on the Worker, then switched off by the owner, not deleted |
| Firebase project `thor-217e7` (Firestore data, Auth, rules) | same; kept afterwards as the read-only archive |
| Old Google OAuth client | until the new client has been live a week (04 §5.2) |
| Old Cloudinary account | no end date (05 R5) |
| Working-folder snapshot and `migration/data/` exports | permanent, off-repo; they contain customer details |
| GoDaddy registration | unchanged |

During the week: check the Cloudflare usage page and the Razorpay webhook log daily; weekly `wrangler d1 export`
(D1 Time Travel keeps 7 days on the free plan, 07 §8.5).

---

## 7. Phase 7 — remodel to Drizzle + Better Auth (after the soak week)

Why per collection group and not per route: a handler still on the document store and a handler on Drizzle
tables cannot both own the same collection. Each group moves its tables, every handler that touches them and the
browser call sites together. Both backends run side by side as two Workers: production (current code) and a
preview Worker with a D1 copy restored from `wrangler d1 export`. Inside one Worker, a `vars` flag per group
(`IMPL_<GROUP>=docs|sql`) selects the implementation, so a group can be switched back without a deploy of code.

| Group | Tables (01 §4, corrected per section 3.1) | Server | Browser change | Why this position |
|---|---|---|---|---|
| 1. Analytics and limits | `daily_analytics`, `product_daily`, `search_terms`, `feature_daily`, `analytics_totals`, `visitor_sessions`, `analytics_dedup`, `rate_limits` | `/api/track` redesigned to about 3 rows per event (07 §7.3); `/api/admin/analytics`; cron clean-up | dashboard and insights call one endpoint instead of five listeners (03 §6.3) | biggest row consumer, zero money risk |
| 2. Settings and public writes | `storefront_settings`, `private_settings`, `leads`, `abandoned_checkouts`, `inventory_log`, `admin_credentials` | settings GET/PUT, gateways, AI key, `POST /api/leads`, checkout draft with rate limits; admin auth clean-up (5.3) | settings listeners → version poll (07 §4.3); contact and newsletter forms → API | removes the open public write rules |
| 3. Customers | Better Auth `user`, `session`, `account`, `verification`; `customers`, `profiles`, `wishlist_items` | Better Auth at `/api/auth/*`; `/api/customer-auth` wrapper; `GET/PATCH /api/me/profile` | `AuthContext`, `LoginPage`, `googleSignIn`, `api.ts`, `ShopContext` cart/wishlist, `addressBook` (04 §4.10) | sign-in changes are visible to customers; do it alone |
| 4. Reviews and alerts | `reviews`, `review_photos`, `review_votes`, `stock_alerts`, `alert_state`, `alert_log`, `shared_wishlists` | `/api/reviews`, `/api/alerts`; price-drop as one SQL query with capped sends (07 §3.5) | product reviews from the catalogue; admin reviews screen | depends on group 3 for the customer email |
| 5. Catalogue and money | `products`, `categories`, `coupons`, `orders`, `order_items`, `stock_movements`, `return_photos` | catalogue, sitemap, `/api/admin/products|categories|coupons|orders`, all 16 `/api/orders` actions, `/api/payu`, `/api/webhooks/razorpay` | admin products/orders screens; then remove `/api/db`, the Firestore shim and the `firebase` packages | last; section 4.4 is re-run in full, plus one real payment |

Per group: Drizzle schema + migration applied to the preview D1 → copy rows from `docs` (the `docs` rows are
kept, not deleted, until the group has run a week) → route code → tests → switch the flag on preview → switch in
production at a quiet hour → switch back by flag if needed. Group 5 switch-back is safe only while no order has
been written in the new tables; treat it like a second small cut-over with gateways paused for a few minutes.

---

## 8. Owner checklist

### 8.1 To do by hand

- [ ] Razorpay dashboard: list captured payments since 30 Sept, match to orders; confirm the webhook is enabled (§0.3).
- [ ] Do **not** press "Regenerate Key" or change the webhook secret until cut-over night.
- [ ] Approve the working-folder snapshot (branch or zip).
- [ ] Approve the Phase 0 bridge deploy, or activate Blaze.
- [ ] Firebase console → Firestore → Usage: which limit ran out on 1 Oct, at what hour.
- [ ] Cloudflare: account under the new Gmail (appears done); later add the domain and change nameservers at GoDaddy.
- [ ] GoDaddy: export the full DNS zone; say how the apex behaves today.
- [ ] New Cloudinary: fill `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env.migration`; state the folder mode.
- [ ] Google Cloud (new account): OAuth Web client, origins, consent screen published; give the client id.
- [ ] Brevo: API key into `.env.migration`; confirm the sender address is verified there.
- [ ] Razorpay key id, key secret, webhook secret into `.env.migration` at the time agreed for cut-over.
- [ ] PayU (if used): merchant key, salt and mode typed into the new admin panel.
- [ ] Supply `FIREBASE_SERVICE_ACCOUNT` in the shell for the one-time Admin-SDK export, after a quota reset.
- [ ] Vercel dashboard: read which env var names are set in production (values stay there).
- [ ] Cut-over night: pause ads, switch gateways off in the old admin, be present for the real test payments, resume ads.
- [ ] Search Console: add the new Google account as owner; resubmit the sitemap.
- [ ] After one clean week: switch off the Vercel project. Delete nothing.

### 8.2 Information still needed

1. D0: lift first then remodel (recommended), or Drizzle + Better Auth before cut-over?
2. Workers Free, or Paid at USD 5/month? Decides admin password hashing and removes the daily ceilings (08 §8 Q11).
3. Does "everything on the new Gmail" include Razorpay, PayU and Brevo, or only hosting, database, images and Google login? (05 §13 Q2)
4. Is PayU live? Which Razorpay key source is live, env or admin-saved? (05 §13 Q1)
5. Is `VITE_GOOGLE_LOGIN=1` set on Vercel, i.e. is Google sign-in really live today?
6. Is the `ADMIN_SESSION_SECRET` in `.env.migration` the production value or a new one?
7. Which admin entry slug is in use?
8. Is switching both payment methods off for about 30–45 minutes at night acceptable as the freeze?
9. May the new admin panel hide unpaid orders instead of deleting them, and block Paid → Unpaid? (08 §8 Q5–6)
10. Are the 4 reviews typed in from the admin panel real customers' words? `AGENTS.md` §5 forbids invented reviews (08 §6.7.11).
11. Test orders (6 admin, 1 refunded): import flagged as tests, or leave only in the old database?
12. Bridge trade-offs: dashboard without the per-visitor timeline for some days; up to 60 minutes before shoppers see admin changes (06 §8 Q5–6).
13. Abandoned-checkout capture: keep collecting? Nothing reads it today (01 §7 Q6).
14. GA4: wanted back? It exists only through the Firebase SDK and disappears with it (05 §13 Q5).
15. Were scripts, tests or exports run against the live site on 1 Oct before the quota ran out? (08 §8 Q3)

---

## 9. Effort and risks

### 9.1 Effort (working days of focused engineering; owner waiting time not included)

| Phase | Recommended route | Notes |
|---|---|---|
| 0 Bridge | 1–1.5 | items 1–4 and 8 are a day; one Vercel deploy |
| 1 Accounts, exports, assets | 1 + waiting on the owner | Admin-SDK export script 0.5; Cloudinary upload and checks 0.5 |
| 2 Schema, import, verify | 1 | importer exists as a file; verify mode and Cloudinary rewrite checks |
| 3 Worker build and route-by-route proof | 5–8 | docstore + shims 2–3; browser shims and gateway rules 2–3; money-path tests 1–2 |
| 4 Cut-over configuration | 1 | mostly owner inputs |
| 5 Cut-over | 1 night + 1 day of watching | plus a timed rehearsal, 0.5 |
| 6 Soak | 7 calendar days, light | |
| 7 Remodel | 17–26 | group 1: 2–3; 2: 3–4; 3: 4–6; 4: 2–3; 5: 6–10 |
| **Off Firestore after** | **about 10–14 working days** | |
| Alternative: Drizzle + Better Auth before cut-over | 25–40 working days before leaving Firestore | bridge or Blaze must hold the whole time |

These are estimates, not commitments; the money-path tests and the owner's turnaround on keys are the two items
most likely to move them.

### 9.2 Main risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | A captured payment with no paid order, now or during cut-over | §0.3 step 1; freeze by gateway switch; Razorpay check at steps 6 and 12; webhook log daily |
| 2 | Double stock deduction or lost update on D1 | unchanged handler logic in Stage A; store guard proven on real D1; race tests 4.4 items 3, 8, 9 |
| 3 | `/api/db` is a generic database door | port of `firestore.rules` with deny-by-default and a test per rule; same-origin; op and size limits; removed in Phase 7 |
| 4 | Free-plan ceilings (requests, rows written, 10 ms CPU) | measure on preview; write budget; usage alerts; Workers Paid ready; tell the owner plainly |
| 5 | Admin login killed by the CPU limit (scrypt) | measure at step 5; paid plan or re-hash |
| 6 | Bridge fixes the wrong thing | usage graph first (§0.3 step 4); items 1–3 cover every candidate cause in 08 §4.3 |
| 7 | Old-bundle tabs after DNS switch | Phase 0 item 8; quiet hour; late-writes export |
| 8 | Server-only collections not exported | Admin-SDK script; otherwise re-enter keys and tell the owner what is lost |
| 9 | Cloudinary: folder mode, version segments, validators pinned to one cloud name | one test upload per flow; HEAD-check every rewritten URL; never give the new stack the old API secret |
| 10 | DNS move drops a mail or verification record | zone export and manual comparison; DNS moved a day before the app |
| 11 | Rollback lands on an exhausted Firestore | keep the bridge deployed, or Blaze active, through the soak week |
| 12 | Razorpay key or webhook-secret rotation at the wrong time | rotate only at freeze, or not at all |
| 13 | Preview sends shoppers or emails to the live site | `SITE_URL` variable (4.2) |
| 14 | Better Auth API details written from memory in 04 and 07 | spike before Phase 7 group 3 |
| 15 | `en-IN` formatting, Cache API on `workers.dev`, `_headers` on SPA fallback, `process.env` population | all unverified; each has a named check in 4.3 steps 1–3 |
| 16 | OTP email deliverability from a Gmail sender, Brevo daily cap | confirm sender in Brevo; cap price-drop sends |
