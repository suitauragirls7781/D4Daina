# 08 — Gaps and corrections (completeness review of documents 01–07)

Scope: an independent check of `01-data-model.md` … `07-workers-architecture.md` against the repository and the
local export in `migration/data/export-2026-10-01T18-15-19/`.

Method: read all seven documents; read `api/orders.js`, `api/_lib/orders.js`, `api/payu.js`, `api/_lib/payu.js`,
`api/webhooks/razorpay.js`, `api/admin-config.js`, `api/track.js`, `api/reviews.js`, `api/alerts.js`,
`api/customer-auth.js`, `api/_lib/http.js`, `api/_lib/firebaseAdmin.js` line by line; grepped `api/` and `src/` for
collection names, `/api/` calls, `process.env` / `import.meta.env`, Firebase imports and `onSnapshot`; counted field
names and values in the export with a local script (no personal values printed). Nothing live was called, nothing
outside `migration/map/` was written. Secrets are named by variable name only.

Severity tags: **[BLOCKER]** would break checkout, lose money/data or lock the owner out if built as written ·
**[FIX]** a document is wrong or two documents disagree · **[GAP]** nobody covered it · **[NOTE]** small.

---

## 1. Confirmed correct (spot-checked against code and export)

| Area | Result |
|---|---|
| Collection inventory | All 26 collections used in `api/` (grep of `collection('…')`) and the 6 extra ones used only from `src/` (`leads`, `customers` read, `abandoned_checkouts`, `admin_settings`, `inventory_log`, `hero_slides`) appear in 01 §2 and 02 §11. No subcollections exist. |
| `/api` call sites | All 35 `'/api/…'` references in `src/` and all 16 `ordersApi` actions in use are in 03 §3. `quote` and `admin-email-events` really have no caller. |
| Env vars | Every `process.env.*` name in `api/` (17 names) is in 02 §12.3 and 05 §1.1. `VITE_GOOGLE_LOGIN` is the only `import.meta.env` read (`src/utils/googleSignIn.ts:5`). |
| Listeners | Every `onSnapshot` / `watchCollection` site is in 03 §2.1 and 07 §4.3. |
| Pricing engine | 02 §2.1 steps 1–17 match `api/_lib/orders.js:284-389` exactly, including discount order, rounding points, the ₹1 floor and the UTC end-of-day coupon expiry (`:143`). |
| `finalizePaidOrder` | 02 §2.3 matches `api/_lib/orders.js:406-467`: membership check, idempotency on `Paid`/`Refunded`, stock clamp at zero, shortfall recorded, coupon `+1`, `daily_analytics.purchases +1`, all in one transaction. |
| Razorpay webhook | 02 §2.5 matches `api/webhooks/razorpay.js:28-80` (raw body, two accepted secrets, two events, 500 on any exception). |
| PayU | Hash formulas, verify retries, ±₹0.50 amount check, sandbox flagging match `api/_lib/payu.js:84-141` and `api/payu.js:35-101`. |
| OTP limits | 04 §1.1 table matches `api/customer-auth.js:7-13,52-121`. |
| Admin cookie | Format, lifetimes, `Path`, `Secure` only when `VERCEL === '1'`, `session_version` check: `api/admin-config.js:281-343`. |
| Export counts | 33 products, 3 categories, 1 coupon, 7 reviews, 38 orders (3 Paid, 1 Refunded, 34 Unpaid), 9 customers = 9 profiles, 78 abandoned checkouts, 8 settings docs, 1,625 visitor sessions. All money values are whole rupees; all dates are ISO strings; order doc id = `orderNumber` in all 38. |
| D1 columns vs. written fields | Every field name present in the export for products, categories, coupons, reviews, orders (46 top-level keys), order items, delivery address, customers, profiles, abandoned checkouts, visitor sessions and the analytics collections has a home in the 01 §4 schema (as a column or inside a JSON column). Exceptions are listed in §3. |

---

## 2. Corrections — money path

### 2.1 **[BLOCKER]** `attempt_key` must NOT be a unique index

01 §4.5 (`orders_attempt_key_uq`) and 07 §4.2 ("unique index where not empty") make `attempt_key` unique.
The code deliberately creates a **second order with the same key**:

- The browser keeps one key per bag + coupon in `sessionStorage` for the life of the tab
  (`src/components/CheckoutPage.tsx:20-29`, `:679`, `:688`); it is cleared only after a successful order (`:574`).
- `create` reuses the earlier order only when the email matches **and** it is under 30 minutes old **and** the
  rounded total is equal **and** `status === 'Pending'` **and** it is `Unpaid` (`api/orders.js:358-364`). In every
  other case it falls through to "new order" and stores the **same** `attemptKey` (`:383`, `:411`).
- Real cases: shopper comes back after 30 minutes in the same tab; guest corrects the email in the address; the
  shipping/prepaid setting changed; **the admin set the unpaid order to `Cancelled`** (11 of the 34 unpaid orders
  in the export are `Cancelled`) and the shopper presses Pay again.

With a unique index each of these becomes a constraint error, i.e. a failed checkout. Use a plain (non-unique)
index, and make the lookup deterministic: `ORDER BY created_at DESC LIMIT 1` (today's Firestore `limit(1)` at
`api/orders.js:348` returns an arbitrary match). 02 §13 item 9 already noticed that duplicates can exist; 01 and
07 contradict it. The export has no duplicate today (10 keyed orders, 10 distinct keys), so the importer would
not catch this.

### 2.2 **[BLOCKER]** Three documents propose three different "mark paid" designs

| Document | Where the taken quantity lives | Statement order | Guard |
|---|---|---|---|
| 01 §5 | `orders.deducted_quantities_json` written by sub-select | order row flips **last** | `payment_status = 'Unpaid'` |
| 02 §12.5 | new table `order_stock_movements` | order row flips **first**, then a "claim token" guards the rest | claim token |
| 07 §4.2 | new table `stock_movements` (`taken`, `restored_at`) | order row flips **last** | `payment_status = 'Unpaid'` |

`stock_movements`, `table_versions` (07 §4.3), an `orders.version` column (07 Pattern C; 01 uses `updated_at`
instead) and `otp_limits` (04 §4.3; 01/07 use `rate_limits`) are **not in the 01 schema**. One design must be
chosen and written into 01 before any code. Points the chosen design must satisfy (all from
`api/_lib/orders.js:406-467`):

1. **Guard value.** Today's guard is "not `Paid` and not `Refunded`" (`:415`), not "equals `Unpaid`".
   `src/types.ts:173` still allows `Pending` and `Pending Verification`. The export has only the three values, so
   `= 'Unpaid'` works on today's data, but write the guard as `NOT IN ('Paid','Refunded')` or add a `CHECK` on the
   column so the two cannot drift.
2. **Fields the sketches leave out.** 07's final `UPDATE orders` omits `deducted_quantities`, `stock_shortfall`,
   the `Processing` timeline entry, `updated_at`, and the **shortfall line appended to `notes`** (`:458-460`). The
   admin screens read `stockShortfall` and `notes` from the order. If these are written in a follow-up statement
   outside the batch and that statement fails, the admin never sees the oversell warning.
3. **Missing product.** A deleted product yields a shortfall entry with `available: 0` and **no** deducted entry
   (`:430-433`). With a `stock_movements` insert driven by `FROM products` there is no row at all; the shortfall
   must be derived from `order.items`.
4. **`changed`** must come from the claiming statement's `meta.changes`; it decides whether the confirmation email
   and store alert are sent (`api/orders.js:518-519`, `api/webhooks/razorpay.js:68`, `api/payu.js:74-82`).
5. **`in_stock`** keeps a manual "out of stock": `next > 0 && data.inStock !== false` (`:441`). 07's SQL has this
   right; 01's text leaves it as "…".

### 2.3 **[FIX]** Invariants missing from 02 §2.6

1. **Paid → Unpaid → Paid deducts stock twice.** `admin-update` accepts `paymentStatus: 'Unpaid'` on a paid
   order (`api/orders.js:747`, `:771`) without touching `stockDeducted` / `deductedQuantities`. A later payment or
   a second manual "Paid" passes the guard (`api/_lib/orders.js:415`) and deducts stock again, increments the
   coupon again, counts a second purchase and **overwrites** `deductedQuantities`, so the first deduction can
   never be restored. Decide: forbid Paid → Unpaid, or make the stock part conditional on `stock_deducted = 0`.
2. **Manual "Paid" sends no email.** `admin-update` discards the result of `finalizePaidOrder`
   (`api/orders.js:749-756`): no confirmation mail, no store alert, and `Processing` has no template
   (`api/_lib/email.js:98-142`). 02 invariant 14 and 05 §5.1 row 2 read as if every finalisation emails.
3. **A reused order keeps its original lines.** In the 30-minute reuse path only address, name, mobile, gift note
   and gateway fields are updated (`api/orders.js:366-378`); `items`, coupon and discounts are **not** rewritten
   and the fresh `priced` result is thrown away. "Same cart" is decided by rounded total alone (`:363`). A
   different bag with the same total is charged and shipped as the old bag. Keep or fix, but know it.
4. **Hard-deleting an unpaid order loses a late payment.** The admin may delete any order that is not
   Paid-and-active (`src/context/AdminContext.tsx:1288-1296`). Its Razorpay order stays payable; the webhook then
   finds a receipt with no order, `finalizePaidOrder` throws 404, the handler answers 500
   (`api/webhooks/razorpay.js:67`, `:75-78`) and Razorpay retries with money taken and no order. In D1 use a
   soft delete (`deleted_at`) for orders that have a gateway id.
5. **`reconcileRazorpay` can skip the newest Razorpay order.** The list is `[current, ...all]` de-duplicated and
   then `.slice(-5)` (`api/orders.js:110`). With six or more ids the current one is first and is cut off. 02 says
   "the last 5 known ids"; port it as "current id plus the 4 most recent others".
6. **Whole-array overwrites outside transactions**: PayU failure timeline (`api/payu.js:90-93`), email log on
   three paths (`api/orders.js:164-169`, `api/payu.js:79`, `api/webhooks/razorpay.js:70`), sandbox note
   (`api/payu.js:76`). 01 §5 mentions the email log; the PayU timeline write can erase the `Processing` entry
   written by a concurrent finalisation. Use `json_insert` appends for all four.
7. **Email log is one-sided on the gateway callbacks.** `notify()` logs success and failure
   (`api/orders.js:171-182`); the webhook and PayU paths log only on success (`.then(...)`), so a failed
   confirmation there leaves no trace.
8. **PayU payment id fallback** is `verified.mihpayid || f.mihpayid || txnid` (`api/payu.js:73`), not
   `mihpayid || txnid` as 02 §2.4 says.
9. **Owner view does not return the full address.** `ownerOrderView` returns 9 address fields and drops
   `landmark`, `altMobile`, `tehsil`, `district`, `type` (`api/_lib/orders.js:1110-1122`); 02 says "full address".
   The admin sees all 14 because `admin-update` returns the raw document.

### 2.4 **[BLOCKER]** The "store is busy" message is false for `verify`, and payments may be un-reconciled right now

`api/orders.js:826-828` answers any quota/timeout error with "No money has been taken." For `verify` (and
`payment-result`) the money **has** been taken at the gateway. While the Firestore quota is exhausted, the
Razorpay webhook also fails with 500 (`api/webhooks/razorpay.js:75-78`).

Evidence the store is in that state: the export holds **zero orders created on 2026-10-01** (2 on 09-28, 23 on
09-29, 13 on 09-30) and `analytics_totals.updatedAt` stops at 10:09 UTC on 10-01.

Before the D1 import, and again at cut-over:

- List captured Razorpay payments from 2026-09-30 onward in the Razorpay dashboard and match each against
  `orders` by `receipt` (= order number). Any captured payment whose order is `Unpaid` must be finalised
  (`payment-result` does this once the database answers) **before** the export that feeds D1.
- Check in the Razorpay dashboard that the webhook is still **enabled**; Razorpay disables an endpoint that keeps
  failing (my knowledge of Razorpay, **unverified**).
- Port the message per action: for `verify` / `payment-result` say "payment received, confirmation delayed".
  This is also an `AGENTS.md` honesty-rule matter.

### 2.5 **[FIX]** Small factual slips

| Document | Says | Actually |
|---|---|---|
| 02 §0 | `api/orders.js` has 18 actions | 16 (`api/orders.js:308-806`) |
| 07 §3.1 | 15 actions | 16 |
| 07 §1 | "8 Vercel Node functions" | 9 files (8 in `api/` + `api/webhooks/razorpay.js`) |
| 01 §2.6, §7 Q5 | 6 orders have an unknown `customerUid` | All 6 are the admin uid from `api/_lib/firebaseAdmin.js:9` (admin test checkouts, `api/orders.js:415`). Resolved; mark them as test orders on import. |
| 04 §2.6, §5 item 13, §6 Q6 | client source may hold a real admin password / PIN | `DEFAULT_SECURITY_CONFIG.adminUsername`, `.adminPassword`, `.securityPin` are **empty strings** (`src/context/AdminContext.tsx:55-63`). No rotation needed for that reason. The localhost-only branch (`:1118-1145`) should still be deleted. |
| 05 R8 | jsPDF is a Workers CPU concern | jsPDF runs only in the browser (`src/lib/invoicePdf.ts:65`; no import in `api/`). |

---

## 3. Corrections — data model (01)

1. **[FIX] `customers` and the identity key: 01 and 04/07 disagree.** 01 §4.6 folds `customers` into Better
   Auth's `user` (extra fields `phone`, `status`, `last_login_at`) and keys `profiles` / `wishlist_items` by
   `user_id`. 04 §4.1 says the opposite: keep `customers` and `profiles` keyed by lowercase email and "do not use
   `user.id` as a foreign key in store data"; 07 §6.2 also joins on email. Pick one. Points for keeping email:
   `alert_log` ids hash the profile id, which is the email (`api/alerts.js:55`); `stock_alerts` and orders are by
   email; 12 of the 17 distinct order emails have **no** customer account (guest checkout), and 2 of the 3 real
   paid orders are guest orders, so a guest who signs in later must find orders by email anyway.
2. **[FIX] `wishlist_items.added_at NOT NULL`** has no source: none of the 5 exported wishlist entries carries a
   date and the array order is the only ordering. Add a `position` column or synthesise `added_at` from the
   array index on import.
3. **[FIX] `reviews.rating INTEGER CHECK 1..5`**: admin-created reviews are written as `Number(rating) || 5`
   (`src/context/AdminContext.tsx:1442`) with no integer check. All 7 exported ratings are integers; validate in
   the new admin endpoint or relax the column.
4. **[NOTE] Review id fallback key.** When `FIREBASE_SERVICE_ACCOUNT` has no `private_key`, the HMAC key is a
   fixed literal (`api/reviews.js:74`). Only 2 `rv_` reviews exist (4 are admin-created `rev-`, 1 is a guest
   auto-id); both carry photos (`imageUrl` + `photoId`), so their `review_photos` records matter for photo
   replacement and deletion and are **not** in the export.
5. **[NOTE] Soft delete.** No table has `deleted_at`. See §2.3 item 4 for orders.
6. **[NOTE] `rate_limits` keys contain personal data**: `cancel:<email>` uses the raw email
   (`api/orders.js:664`), unlike the hashed keys elsewhere. Hash it in the port.
7. **[NOTE] Day boundaries are UTC everywhere** (`api/track.js:66`, `api/_lib/orders.js:393`, `:463`). The admin
   dashboard's "today" therefore rolls over at 05:30 IST. Keep as is so imported history lines up; say so in the
   dashboard endpoint.

---

## 4. Corrections — quota analysis and bridge (06)

1. **[FIX] The headline number is built on an assumed catalogue size.** 06 §0 assumes P ≈ 200 and D ≈ 250 and
   concludes "288 × D ≈ 72,000 reads/day — the catalogue alone exceeds the quota" (§1.2, §5.1). The export gives
   **D = 8 + 33 + 3 + 7 + 1 = 52**, so 288 × 52 ≈ **15,000 reads/day per CDN region**. The catalogue alone does
   not exhaust 50,000 reads.
2. **[FIX] Admin load** is P + C + 2S + Ra + R + O + 2K + L + 8 ≈ **115 reads**, not 700–1,200 (06 §4.1).
3. **Consequence.** With real traffic (`daily_analytics`: 822 visits / 549 product views on 09-29, 593 / 393 on
   09-30) the formulas in 06 give roughly 5,000 tracking reads, 1,100–1,600 product-page reads, ~15,000 catalogue
   reads per region and a few thousand admin reads per day. That is well under 50,000. Tracking writes were
   about 7,100 and 5,100 on those days, under both the 8,000 budget and the 20,000 write quota. So **the cause
   of the exhaustion is not explained by the documents.** Candidates that fit "gone within about 3 hours of the
   reset" on 10-01: the failure amplifiers 06 itself describes (§1.3 live-listener fallback for first-time
   visitors, §4.3 the 15-second settings loop), several CDN regions, or scripts/tests/exports run against the
   live project. Read the Firebase console usage graph (reads vs writes, by hour) before relying on B1 as "the
   90% cut"; B2, B3 and B6 items 1–2 may matter more than B1.
4. **[FIX] B4 "needs no deploy to flip".** A changed Vercel environment variable takes effect only in a new
   deployment (my knowledge of Vercel, **unverified** here). `TRACK_MODE` still needs a redeploy; say so.
5. **[NOTE] B3** adds a `product_daily where day == today` query to every catalogue build: +1 read per product
   viewed today per build. Small at this size, but it moves reads into the endpoint B1 is trying to shrink.

---

## 5. Disagreements between documents (decide once, then fix the documents)

| Topic | Positions | Evidence to weigh |
|---|---|---|
| `ADMIN_SESSION_SECRET` | 05 §1.1: "new random value is fine"; 04 §4.5 and 07 §6.3: carry over | It signs PayU result links for 2 days (`api/_lib/payu.js:144-149`) and the admin cookie. Carry over. |
| Admin cookie path | 05 §2: keep `Path=/api/admin-config`; 04 §4.7 and 07 §6.3: widen to `/api` | With Firebase gone the cookie is the only admin credential for `/api/orders`, `/api/reviews`, `/api/alerts`. Widen, and expire the old-path cookie. |
| Database-down admin fallback | 04 §4.7 item 11: keep; 05 §1.1 and 07 §3.3, §8.2: remove | See §6.4 below: the fallback accepts a stale `session_version`. If kept, it must not rely on isolate memory. |
| Admin password hashing | 01 §4.8 and 04 §4.7: import scrypt hashes as they are; 07 §3.4: scrypt cannot run in 10 ms, re-hash with HMAC + pepper via a local script | Measure first. If 07 is right, 01's "carried over as they are" is wrong on the free plan. |
| Payment transaction design | §2.2 above | |
| Customer tables and keys | §3 item 1 above | |
| Optimistic concurrency column | 01: `updated_at`; 07: `version` | `updated_at` has millisecond resolution and is rewritten by several writers; an integer `version` is safer. |
| Cloudinary | 01/05: copy assets and rewrite URLs; 07 §8.2: or accept a legacy cloud name | 05 §6.2 gives the deciding safety rule: the new stack must never hold the old account's API secret. A legacy cloud name for **read-type** checks only is compatible with that. |

---

## 6. Missing items (nobody covered)

### 6.1 **[BLOCKER]** Cut-over: already-open tabs of the old site will talk to the new API

After the DNS switch a shopper's open tab still runs the old bundle. It sends `Authorization: Bearer <Firebase
token>` and no session cookie (`src/lib/api.ts:13-24`), and it keeps writing **directly to the old Firestore**
(cart, wishlist, address, abandoned checkout, newsletter: 03 §2.2 W1–W9).

- A signed-in customer in such a tab is a guest to the new Worker: `create` still works (order owned by the
  address email), but `my-orders`, `pay-again`, returns and cancel answer 401.
- Old `LoginPage` expects `firebaseToken` in the `/api/customer-auth` answer (`src/components/LoginPage.tsx:126`);
  old admin tabs expect it from `?action=session` and show "Database authorization failed"
  (`src/context/AdminContext.tsx:1096-1101`).
- Writes those tabs make to Firestore after the final export never reach D1.

Needed: a build-version check that forces one reload (the only reload trigger today is a failed chunk load,
`src/components/ErrorBoundary.tsx:14,29-30`), cut-over at a quiet hour, and a second small "late writes" export
of `profiles`, `leads`, `abandoned_checkouts` a few hours later.

### 6.2 **[BLOCKER]** No write-freeze exists for the old stack

07 §8.4 step 2 says "freeze writes on the old site". Nothing in the code can do that: there is no maintenance
switch in `api/orders.js` or the rules. Options to decide with the owner: (a) the DNS switch is the freeze and a
delta export follows it; (b) switch both gateways off in Admin → Payment Gateways just before the final export
(`publicGateways` then makes `create` answer "Online payment is paused", `api/orders.js:84-90`), which stops new
orders without a deploy; (c) deploy a one-line 503 to Vercel. Option (b) uses what already exists.

Also: the export feeding D1 is from 2026-10-01 18:15 UTC. Orders, customers, reviews and stock change after it.
The final import must be a **fresh full export**, not this one plus guesses, and it must include the 34 unpaid
orders with their `razorpayOrderIds` / `payuTxnIds` (a late payment on any of them must still finalise; pay-again
is allowed for 3 days, `api/orders.js:488`).

### 6.3 **[GAP]** The working folder is the only copy of production

`git status` lists 204 changed or untracked paths on top of commit `dc72a31` (2026-09-28); the live site is
deployed from this folder with the Vercel CLI. No commit equals what is running. 05 R1 covers only the four
untracked `public/` files. Before any migration code is written the tree should be snapshotted (a commit on a
branch, or a zip) with the owner's approval; it is the rollback source and the "nothing deleted" guarantee.
`migration/` itself is untracked (`migration/data/` is git-ignored, the scripts and these documents are not
committed).

### 6.4 **[GAP]** Admin security details

1. **Fallback accepts a revoked session.** When the database cannot be read and neither the cached nor the env
   username matches, `authenticate` returns the cookie's own `username` and `version` as the credentials
   (`api/admin-config.js:336-339`); when a cached or env username matches, the version is not compared either
   (`:333-335`). "Sign out everywhere" therefore does nothing during an outage. If the fallback is ported,
   state this; on Workers a cold isolate has no cache, so it would trigger on every D1 hiccup.
2. **Changing password, PIN, username or slug needs no current password**, only the cookie
   (`api/admin-config.js:608-630`). A borrowed unlocked phone can take the account over. Cheap to fix in the port.
3. **`logout` is unauthenticated and not origin-checked for a missing `Origin`** (`:345-354`, `:560-564`).
4. **Admin and customer identity become simultaneous.** Today one token is sent per request, admin on admin
   pages and customer elsewhere (`src/lib/api.ts:16-17`), so `identity` is never both. With a `/api`-wide admin
   cookie plus a Better Auth cookie, `{admin: true, email: '<customer>'}` is possible. Check each branch that
   tests `identity.admin` first: `track` (`api/orders.js:536-548`), `gateways` (`:337`), `create` (`:351`, an
   admin would be offered sandbox gateways on the storefront while signed in as a customer).
5. **A second env file, `.env.migration`**, exists in the repo root (git-ignored by `.gitignore:7,11`) and is in
   no document. It lists 16 names; 13 are empty. Three names are read by no code: `AUTH_TOKEN_SECRET`,
   `BREVO_SENDER_NAME`, `STORE_ALERT_EMAIL`. It has no `FIREBASE_SERVICE_ACCOUNT`, so an Admin-SDK export cannot
   run from it. Reconcile its names with 05 §10 / 07 §8.2 (which propose `BETTER_AUTH_SECRET`, `ADMIN_PEPPER`,
   `SITE_URL`, `GOOGLE_CLIENT_ID/SECRET`) so there is one list.
6. **The Admin-SDK export script does not exist.** `migration/scripts/export-firestore-client.cjs:18-19` refers
   to `export-firestore-admin.cjs`; only the client export and the Cloudinary download are in
   `migration/scripts/`. Twelve server-only collections wait on it (01 §1 point 4).

### 6.5 **[GAP]** Cron-like behaviour: there is none today, and some things silently depend on that

No `crons` key in `vercel.json`; every job is triggered by a request.

| Behaviour today | Trigger | Consequence for the port |
|---|---|---|
| Price-drop and back-in-stock emails | only the admin's browser after a product save (`src/context/ProductContext.tsx:11`, `:425`, `:495`) | Stock that comes back through `admin-update` → Cancelled/Refunded (`api/_lib/orders.js:470-488`) never triggers a back-in-stock mail. Once stock changes are server-side, call the check from every stock-raising path. |
| Unpaid orders | never expire or get cleaned | 34 of 38 orders are unpaid. Decide a retention rule; do not auto-delete (see §2.3 item 4). |
| `rate_limits`, `analytics_dedup`, `customer_email_otps`, `review_votes` | never deleted | 01/07 add a cron for the first two; `review_votes` grows forever too. |
| Orphan upload records | `return_photos` / `review_photos` rows whose photo was signed but never attached; the Cloudinary file may exist | Add to the clean-up job, deleting only through the server's own record (`api/reviews.js:94-103`). |
| Deal-of-the-day timer | browser only (`dealOfTheDay.endTime`, `hideWhenEnded`) | The exported deal ended 2026-10-01 15:50 UTC. The displayed price is the product's real price (`src/components/DealOfTheDaySection.tsx:61`); `dealPrice` in the setting is unused. Nothing to port server-side. |
| Hero slide auto-sync | admin browser effect that PUTs `heroConfig` when products change (`src/context/AdminContext.tsx:1014-1071`) | Each PUT will purge the catalogue cache on Workers; move it server-side or debounce. |

### 6.6 **[GAP]** Emails

- 02 §9 and 05 §5.1 list every template. Not stated anywhere: all sends are **awaited inside the request**
  (`api/orders.js:468-469`, `:518-519`, `:802-803`), so a slow Brevo call delays the payment response. 07 §3.3
  suggests `waitUntil`; the email-log write then also moves after the response, which is fine only with
  append-style writes (§2.3 item 6).
- Brevo's free plan has a daily send cap (300/day to my knowledge, **unverified**). OTP codes, order mails and a
  price-drop run to many wishlists share it. A price-drop run should stop before it can starve OTP sign-in.
- The sender is a Gmail address (hard-coded fallback in `api/_lib/email.js:12`, `api/_lib/orders.js:32`). Whether
  Brevo delivers reliably from a free-mail sender is **unverified**; this is a deliverability risk independent
  of the migration but it decides whether OTP sign-in works at all.

### 6.7 **[GAP]** Smaller uncovered items

1. **Public catalogue contents.** The catalogue returns whole product documents, including `stockQuantity`,
   `lowStockThreshold` and `sku` (`api/admin-config.js:469`), and every active coupon with its code,
   `usageCount` and `usageLimit` (`:477-480`). That is today's behaviour; if any coupon is meant to be private,
   the new endpoint is the moment to stop listing it.
2. **Kids & Toys.** Normal products with `productType` `kids` / `toy` (3 + 2 in the export), categories
   `Baby Girls`, `Baby Boys`, `Toys` matched by **name** (`src/utils/kids.ts:12-22`), `ageRange` for toys. The
   01 schema holds all of it. Things to keep: the synthetic `/category/kids` sitemap entry
   (`api/sitemap.js:65-68`) and the `department` parameter of `ai-describe` (`api/admin-config.js:586`). No
   `Baby Boys` product exists yet.
3. **Occasions / discovery.** 11 occasions (10 enabled) and 18 feature switches, all `true`, live inside
   `storefront_settings/discovery`. Occasions reference products by id (`productIds`,
   `api/admin-config.js:98`), another reason ids must not change. Three server paths read the switches and must
   keep reading them: `reviewPhotos` (`api/reviews.js:117-125`), `priceDropAlerts` / `backInStockAlerts`
   (`api/alerts.js:15-23`). Note the opposite failure defaults: review photos default **off** on a read error,
   alerts default **on**.
4. **Aura reels.** 3 reels, all enabled, each linked to a product, one with a custom poster; videos are
   Cloudinary `/video/upload/` assets. A new free Cloudinary account has its own video size and transformation
   limits (**unverified**); upload and play all three on the new account before cut-over.
   `sanitizeAuraReels` drops any reel whose URL is not a Cloudinary video URL (`api/admin-config.js:74-81`), so
   a bad URL rewrite deletes reels silently on the next admin save.
5. **Invoices.** Generated in the browser from the order and `storeSettings` (`src/lib/invoicePdf.ts:38-69`,
   `src/components/OrderInvoice.tsx:90-126`). Invoice number = `<invoicePrefix>-<orderNumber>`, so there is no
   invoice counter to migrate; `gstin`, `legalName`, `invoiceAddress`, `invoiceNote` are not set in the exported
   `storeSettings` (only 3 keys are).
6. **Inventory log.** Covered by 01 §2.25 / §4.11. Addition: 3 real paid orders have `stockDeducted: true`;
   those deductions exist only in `orders.deductedQuantities`. If a `stock_movements` table is adopted (§2.2),
   the importer must back-fill it from `deductedQuantities` or restores on those orders will add nothing back.
7. **Returns.** Covered. Addition: no return photo exists in the Cloudinary download (05 §6.4) and no order in
   the export has a request, so the return flow has never run in production; it needs a full test on preview,
   not a parity check.
8. **Sitemap.** Covered by 02 §8, 05 §8, 07 §2.4. No correction.
9. **Customers page.** Totals per customer are computed in the browser from the full order list
   (`src/components/admin/AdminCustomers.tsx:53-91`); with paginated orders (03 §6.3) this needs a server-side
   aggregate.
10. **Test orders in live data.** 6 admin test orders and 1 `Refunded` test order are in `orders`, and
    `daily_analytics.purchases` sums to 7 while only 4 orders were ever paid. Imported history will carry the
    difference; decide whether to flag test orders (`is_test`) on import.
11. **Admin-created reviews.** 4 of the 7 approved reviews were entered through the admin panel (id `rev-…`,
    `verifiedPurchase: false`, with a `location`). They migrate as data. `AGENTS.md` §5 forbids invented
    reviews, so the owner should confirm they are real customers' words.

---

## 7. Checks the import and the preview must include (derived from the above)

1. Importer asserts: no order with a gateway id is dropped; unpaid orders keep `razorpay_order_ids` and
   `payu_txn_ids`; `attempt_key` duplicates are **allowed**.
2. For each exported paid order, `deducted_quantities` (or back-filled `stock_movements`) sums match the items.
3. Race tests on preview: same Razorpay payment delivered by `verify` + webhook + `payment-result` at once →
   one deduction, one coupon increment, one purchase count, one confirmation email, one store alert.
4. Paid → Unpaid → Paid on a test order → stock deducted once (or the transition refused).
5. Same bag paid after 31 minutes, and after the admin cancelled the first attempt → a second order is created.
6. Webhook for a deleted/unknown order → logged and answered so that Razorpay does not retry for ever
   (today 500, `api/webhooks/razorpay.js:75-78`).
7. Old-bundle tab against the new API: guest checkout completes; signed-in tab is told to reload.
8. One real small payment after cut-over with the tab closed before returning (webhook-only path).

---

## 8. Open questions for the owner

1. **Payments since 30 Sept:** has the Razorpay dashboard got any captured payment whose order still shows
   unpaid in the admin panel? (No order was created on 1 Oct in the export.) Is the Razorpay webhook still
   shown as enabled?
2. **Which Firestore limit ran out, and at what hour?** (Firebase console → Usage.) The documents cannot
   explain it with the real catalogue size; the answer decides which bridge change goes first.
3. **Were any scripts, tests or exports run against the live site on 1 Oct** before the quota ran out?
4. **Stopping orders for the final copy:** is switching both payment methods off for about 30 minutes at night
   acceptable as the freeze?
5. **Deleting unpaid orders:** may the new admin panel hide them instead of deleting them, so a late payment is
   never lost?
6. **Marking a paid order back to "Unpaid":** is that ever needed? If not, it will be blocked.
7. **Changing the admin password:** should the panel ask for the current password first?
8. **The 4 reviews typed in from the admin panel:** are they real customers' reviews?
9. **The 6 admin test orders and the refunded test order:** keep them in the new database (marked as tests) or
   leave them only in the old one?
10. **`.env.migration`:** who created it and are its three filled-in values (sender email, sender name, store
    alert email) the ones to use on the new setup?
11. **Free plan or USD 5/month Workers plan?** It decides the admin password hashing design (01 vs 07) and
    removes the daily ceilings 07 §7 describes. "Never a quota problem" cannot be promised on the free plan.
12. **Snapshot of the working folder:** may it be committed to a new branch before work starts, so there is a
    copy of exactly what is live?
