# 06 — Firestore quota hotspots and the bridge plan

Scope: where the live Vercel + Firebase app spends its Firestore Spark quota (50,000 reads, 20,000 writes, 20,000 deletes per day), and the smallest set of code changes that keeps usage tiny until the Cloudflare migration is finished.

Method: static reading of the repository only. Nothing was run against production, Firestore or the live API. Document counts in the database are therefore **not measured**; they appear as symbols, and every number that depends on them is marked as an estimate.

## 0. Symbols and billing rules used below

| Symbol | Meaning | Value |
|---|---|---|
| P | documents in `products` (hidden ones included) | unverified; project notes mention about 200 |
| C | documents in `categories` | unverified, small |
| S | documents in `storefront_settings` | at most 11 public keys (`api/admin-config.js:55-67`) plus any legacy docs; unverified |
| Ra / R | approved reviews / all reviews | unverified |
| K | documents in `coupons` | unverified, small |
| O | documents in `orders` (unpaid attempts included) | unverified, grows forever |
| L | documents in `leads` | unverified |
| D | one catalogue build = S + P + C + Ra + K | about 230–300 if P is about 200 |

Billing rules that matter here:

- A query or listener bills one read per document returned, and one read even when it returns nothing.
- A live listener bills the whole result once when it opens, then one read per document that changes while it is open. A listener that reconnects after a long gap is billed for the whole result again.
- A transaction that retries (two requests touching the same hot document) bills its reads again on every retry.
- `select()` on the Admin SDK does not reduce the read count; each matching document is still one read.

Which quota actually ran out (reads or writes) is **unverified** from the repo; it must be read from the Firebase console usage tab. The project notes say it was the read quota.

---

## 1. Catalogue endpoint (`/api/admin-config?action=catalog`)

### 1.1 Cost of one uncached call

Five whole-collection reads run in parallel (`api/admin-config.js:459-465`):

| Read | Line | Documents |
|---|---|---|
| all `storefront_settings` | `api/admin-config.js:460` | S |
| all `products` (hidden ones are read, then filtered out at line 469) | `api/admin-config.js:461` | P |
| all `categories` | `api/admin-config.js:462` | C |
| `reviews` where status == approved (all of them; the 300 cap at line 476 is applied after reading) | `api/admin-config.js:463` | Ra |
| all `coupons` (inactive ones are read, then filtered at line 480) | `api/admin-config.js:464` | K |

One uncached call = **D = S + P + C + Ra + K reads, 0 writes**.

The 5-second `CATALOG_TIMEOUT` race (`api/admin-config.js:465`) only abandons the response; the five queries keep running and are still billed.

### 1.2 How often it is called

- The browser adds `v=<5-minute bucket>` to the URL (`src/lib/catalog.ts:22`, `:67`, `:72`). The query string is part of the CDN cache key, so **a new cache entry is needed every 5 minutes**.
- The response header is `s-maxage=600, stale-while-revalidate=600` (`api/admin-config.js:486`). Because the URL changes every 300 seconds, the 600-second lifetime and the stale-while-revalidate window are never used: a new bucket is always a plain miss.
- Minimum under continuous traffic: 288 buckets per day, so **288 × D reads per day per CDN region**. With D about 250 that is about 72,000 reads per day, which is more than the whole 50,000 quota from this endpoint alone.
- Multipliers on top (both unverified, they depend on Vercel behaviour): each CDN region keeps its own copy; and shoppers who arrive during the 1–2 seconds a miss is being built may each trigger their own build.
- There is no in-function guard: `lastCatalog` (`api/admin-config.js:239`, `:483`) is only used after a failure (`:491-496`), never to skip a rebuild.
- **Abuse path:** `v` is not validated. Anyone requesting `?action=catalog&v=<random>` gets a guaranteed cache miss and D reads per request. A few hundred requests empty the daily quota.
- One browser asks once per page load (`pending` promise, `src/lib/catalog.ts:44`, `:66`), and the three callers in `AdminContext` and `ShopContext` share it.

### 1.3 What happens when it fails

Server side:

- If the instance has a previous build, it is served with `s-maxage=60` (`api/admin-config.js:491-496`).
- Otherwise it answers 503 with `no-store` (`api/admin-config.js:499`, `:176-181`), so every following shopper request reaches the function again.

Browser side (`src/lib/catalog.ts`):

- A copy saved in `localStorage` (up to 3 days old) is used when the server fails or takes more than 4 seconds (`src/lib/catalog.ts:48-49`, `:70-71`, `:75`, `:79`). Returning shoppers are therefore protected.
- A first-time visitor (most Instagram ad traffic) has no saved copy, so `loadCatalog()` resolves to `null` and `fromCatalogOrLive` starts the live listener (`src/lib/catalog.ts:97-98`).

Listeners and reads opened for such a shopper:

| What | Where | Reads |
|---|---|---|
| whole `products` collection listener | `src/context/ProductContext.tsx:322-343`, `src/lib/dataStore.ts:86-94` | P, plus 1 per later product change |
| whole `categories` collection listener | `src/context/AdminContext.tsx:909-920` | C |
| whole `coupons` collection, one-off | `src/context/ShopContext.tsx:271`, `src/lib/dataStore.ts:54-57` | K |
| `storefront_settings/storeSettings` listener | `src/context/ShopContext.tsx:1080-1087` | 1 |
| `storefront_settings/comboOffer` listener | `src/context/ShopContext.tsx:1099-1108` | 1 |
| `storefront_settings/discovery` listener | `src/utils/discovery.ts:83-92` | 1 |
| `storefront_settings/lookRelations` listener | `src/utils/looks.ts:41-43` | 1 |
| `storefront_settings/auraReels` listener | `src/utils/reels.ts:92-98` | 1 |
| `storeSettings` again on the product page | `src/components/DeliveryCheck.tsx:82-85` | 1 |
| settings through the server: `GET /api/admin-config` with no action reads all of `storefront_settings`, uncached | `src/context/AdminContext.tsx:749-753`, `api/admin-config.js:503-504` | S |

Reviews have no live fallback for shoppers in `AdminContext` (`src/context/AdminContext.tsx:930-936`), so they add nothing there.

Total in the failure case: about **P + C + K + S + 6 reads per first-time visitor per page load** (about 230 or more), and every reload repeats it. This is the amplifier: a slow or failing catalogue turns each new visitor into a full collection read.

Three more groups always read live, even when the catalogue works (`readsLive()`, `src/lib/catalog.ts:25-34`):

- any admin URL;
- localhost;
- any browser where the admin has signed in, because `sag_admin_live` stays in `localStorage` until sign-out (`src/context/AdminContext.tsx:1150-1154`). The owner browsing the public store on that phone costs P + C + K + about 6 reads per page load.

---

## 2. Visitor tracking (`api/track.js`, `src/utils/visitorTracker.ts`)

### 2.1 Cost per event, as written

| Event | Reads | Writes | Evidence |
|---|---|---|---|
| Budget check, once per 60 s per warm server instance | 1 (`daily_analytics/<day>`) | 0 | `api/track.js:35-48`, `:70` |
| `visit`, new device today or new session | 4 (`tx.getAll` of dedup, ip, session marker, visitor record) | 6 = 5 in the transaction (session marker, ip, dedup, `daily_analytics`, `analytics_totals/lifetime`) + 1 `visitor_sessions` set or update | `api/track.js:133-134`, `:143-159`, `:167-190` |
| `visit`, already counted | 4 | 0 | `api/track.js:141` |
| `product_view` / `wishlist_add` | 3 = 1 product existence check + 2 in the transaction | 4 (dedup, ip counter, `product_daily`, `daily_analytics`) | `api/track.js:82`, `:86-89`, `:98-99` |
| `search` | 2 | 4 (dedup, ip, `search_terms`, `daily_analytics`) | `api/track.js:86-92` |
| `reel_view` / `reel_click` / `feature_use` | 2 | 3 (dedup, ip, `feature_daily`) | `api/track.js:93-95` |
| `add_to_cart` / `checkout_initiated` | 1 | 2 in the transaction + 1 `visitor_sessions` update = 3 | `api/track.js:123-128`, `:193` |

Hot documents: every counted event updates `daily_analytics/<day>`, and every visit also updates `analytics_totals/lifetime`. Under ad traffic these transactions collide and retry, billing the reads again. The size of this effect is unverified.

### 2.2 How often the browser sends

- `visit`: once per session — first visit of the day or after 30 minutes away (`src/utils/visitorTracker.ts:328-334`). It is triggered from two places on every page change (`src/context/ShopContext.tsx:637-642`, `src/components/LiveVisitorTracker.tsx:10-15`, `:21`), but the `localStorage` guard lets only one through.
- `product_view`: once per product per browser session (`src/utils/visitorTracker.ts:372-376`), fired on every product page (`src/components/ProductDetailPage.tsx:89`).
- `search`: 1.5 s after typing stops, 3 or more characters (`src/components/ShopPage.tsx:227`); also every assistant question (`src/components/SmartAssistant.tsx:44`).
- `add_to_cart`, `checkout_initiated`: once per device per day (`src/utils/visitorTracker.ts:356-367`; `src/context/ShopContext.tsx:801`, `:840`, `:883-884`).
- Reels and feature use: `src/components/AuraReels.tsx:230`, `:444`, `:456`; `src/components/BuildYourLook.tsx:156`; `src/components/CompleteTheLook.tsx:113`; `src/components/FindThisLook.tsx:151`.

### 2.3 The existing budget guard and its gaps

`TRACK_WRITE_BUDGET` (default 8000 estimated writes) pauses counting for the rest of the day (`api/track.js:27-48`, `:70`). Gaps:

1. **It limits writes only.** Reads are never budgeted, and each counted event costs 2–4 reads.
2. **Reel and feature events are invisible to it.** The estimate uses only `visits`, `productViews`, `wishlistAdds`, `searches`, `cartAdditions`, `checkoutsInitiated` (`api/track.js:41`); the three `feature_daily` events write 3 documents each and never touch `daily_analytics`.
3. **It cannot be set to zero.** `Number(process.env.TRACK_WRITE_BUDGET) || 8000` (`api/track.js:31`) turns `0` into 8000. The smallest working value is `1`.
4. The check itself costs 1 read per instance per minute while counting is active, and 1 per instance per 10 minutes while paused (`api/track.js:34-36`).
5. The browser-side breaker `isFirestoreQuotaExhausted` is only ever set on localhost or by admin listeners (`src/utils/visitorTracker.ts:45-69`); shoppers keep calling `/api/track` while it is paused. That costs no Firestore but still uses Vercel invocations.

Firebase Analytics (GA4) is already initialised for every production visitor (`src/lib/firebase.ts:39-49`), so visits are also counted there at no Firestore cost.

---

## 3. Product page, checkout and account

### 3.1 Product page (every shopper, every product view)

| What | Where | Reads | Writes |
|---|---|---|---|
| "N people viewed this today" — direct `getDoc` on `product_daily/<day>_<id>` | `src/components/ProductDetailPage.tsx:60-68`; shown only at 5+ views or 2+ saves (`:462-464`) | 1 | 0 |
| Live reviews listener, opened for every shopper even though the catalogue already carries approved reviews | `src/components/ProductReviews.tsx:178-185`; fallback already exists at `:188-190` | max(1, approved reviews of that product), plus 1 per later change | 0 |
| `product_view` tracking | section 2 | 3 | 4 |
| Delivery check | uses the catalogue (`src/components/DeliveryCheck.tsx:82-85`); PIN lookup goes to api.postalpincode.in (`:26`) | 0 | 0 |
| Recently viewed | `localStorage` only (`src/components/ProductDetailPage.tsx:86-87`) | 0 | 0 |

One product view = **at least 5 reads and 4 writes**.

Other product-page actions, low volume: helpful vote 3 reads / 3 writes (`api/reviews.js:246-258`); restock subscribe 2 reads / 1–2 writes (`api/alerts.js:121-129`); writing a review (`api/reviews.js:176-222`, plus `paidOrderLine` reading up to 300 of that customer's orders at `:129`).

### 3.2 Checkout

| Step | Where | Reads | Writes |
|---|---|---|---|
| Gateway switches on opening checkout | `src/components/CheckoutPage.tsx:595` → `api/orders.js:336-338`; cached 20 s per instance (`api/_lib/payu.js:26-36`) | 0–1 | 0 |
| **Abandoned-checkout capture**: one full `setDoc` of the cart and address after each 1-second typing pause on four fields, and again on every blur | `src/components/CheckoutPage.tsx:209-253`, `:255-286`, `:922`, `:936`, `:956`, `:971`; written straight from the browser (`src/lib/dataStore.ts:70-73`) | 0 | about 8–15 per shopper who fills the form (estimate) |
| Coupon check | `src/context/ShopContext.tsx:970` → `api/orders.js:315-317`; reads `storeSettings` then **all coupons** (`api/_lib/orders.js:209-211`, `:155`) | 1 + K | 0 |
| Newsletter / contact lead | `src/components/HomeSections.tsx:247`, `src/components/ContactUsPage.tsx:35` | 0 | 1 |

`abandoned_checkouts` and `leads` accept writes from anyone (`firestore.rules:66-69`, `:89-98`), so both are also an open door on the write quota.

### 3.3 Order creation and payment verification

`create` (`api/orders.js:340-450`), for a cart of N distinct products:

- rate limit transaction: 1 read, 1 write (`api/orders.js:292-306`, `:345`)
- products: N reads (`api/_lib/orders.js:303`)
- pricing rules: 2 reads (`api/_lib/orders.js:51-52`)
- `lookRelations` plus picked accessories, only when the cart has accessories: 1 + up to 60 reads (`api/_lib/orders.js:254-258`)
- coupon, only when one is applied: K reads, plus up to 2 order queries for the per-customer limit (`api/_lib/orders.js:155`, `:194-197`)
- gateways: 0–1 read (`api/_lib/payu.js:26-36`)
- earlier attempt lookup: at least 1 read (`api/orders.js:348`)
- order number check: 1 read; create: 1 write (`api/orders.js:388`, `:442`)

Typical: **about 6 + N reads, 2 writes** (add K + 2 with a coupon).

`verify` (`api/orders.js:506-522`) → `finalizePaidOrder` (`api/_lib/orders.js:406-467`):

- transaction reads: order 1 + N products + coupon 0–1
- transaction writes: N products + coupon 0–1 + order 1 + `daily_analytics` 1
- confirmation email log: 1 write (`api/orders.js:164-169`)
- store alert address: 1 read (`api/_lib/orders.js:29-31`)

Typical: **about 3 + N reads, 3 + N writes**.

Around the payment:

- Razorpay webhook for the same payment: gateways 0–1 read + order 1 read; nothing more when already paid (`api/webhooks/razorpay.js:33`, `:66`; `api/_lib/orders.js:415`). When the webhook arrives first it carries the full `verify` cost instead.
- PayU return: gateways read fresh every time (`api/payu.js:52`), order 1 read (`:63`), then `finalizePaidOrder`.
- `payment-result` polling: rate limit 1 read / 1 write + order 1 read per check (`api/orders.js:459-460`).
- Order confirmation page: `track` = rate limit 1 read / 1 write + 1 read (`src/components/OrderConfirmationPage.tsx:65`, `api/orders.js:529-532`).

One paid order end to end is about **15–20 reads and 8–10 writes**. Orders are not a quota problem; they are the victim of the quota problem.

### 3.4 Customer sign-in and account pages

| Step | Where | Reads | Writes |
|---|---|---|---|
| Send email code | `api/customer-auth.js:28-42`, `:59-82` | 2 | 2 |
| Verify code + upsert customer and profile | `api/customer-auth.js:95-116`, `:124-150` | 3 | 3 |
| Google sign-in | `api/customer-auth.js:164-186` | 2 | 2 |
| After sign-in and **on every page load while signed in**: cart and wishlist are pulled on mount and again from the auth callback | `src/context/ShopContext.tsx:590-600`, `:366`, `:444` | 4 profile reads | 0–2 |
| Every time the tab becomes visible again | `src/context/ShopContext.tsx:557-571` | 1 | 0–2 |
| Every cart or wishlist change (400 ms debounce) | `src/context/ShopContext.tsx:338-350`, `:416-428`, `:506-508`, `:621-623` | 0 | 1 each |
| `my-orders` on load, on sign-in, on the account page | `src/context/ShopContext.tsx:669-688`; `api/orders.js:554` | all orders of that customer, at least 1 | 0 |
| Account page profile | `src/components/AccountPage.tsx:618` (also primes the style profile and address book) | 1 | 0 |
| Style profile on the home rail when not primed | `src/components/StyleProfile.tsx:122`, `src/components/PersonalRails.tsx:39` | 1 | 0 |

A signed-in customer costs about 6–8 reads per page load. Volume is low because few shoppers sign in.

---

## 4. Admin panel

### 4.1 Opened on every admin page load

| What | Where | Reads |
|---|---|---|
| Session check: `action=session` then `action=security`, each reading `admin_credentials/singleton` | `src/context/AdminContext.tsx:556`, `:582`; `api/admin-config.js:328`, `:207` | 2 |
| Whole `products` listener | `src/context/ProductContext.tsx:327` | P |
| Whole `categories` listener | `src/context/AdminContext.tsx:915` | C |
| Whole `storefront_settings` listener | `src/context/AdminContext.tsx:803` | S |
| Settings through the API on load, and again after every settings change | `src/context/AdminContext.tsx:798`, `:808`, `:751`; `api/admin-config.js:503` | S each time |
| Reviews: approved-only listener first, then replaced by the whole collection once the Firebase admin session is ready | `src/context/AdminContext.tsx:937-945` | Ra, then R |
| Whole `orders` listener (every order ever, unpaid attempts included) | `src/context/AdminContext.tsx:952` | O |
| Whole `coupons` listener, plus a one-off list from `ShopContext` | `src/context/AdminContext.tsx:955`, `src/context/ShopContext.tsx:271` | 2K |
| Whole `leads` listener | `src/context/AdminContext.tsx:984-999` | L |
| `admin_settings/inventory` | `src/context/AdminContext.tsx:969` | 1 |
| Five single settings documents | `src/context/ShopContext.tsx:1082`, `:1101`; `src/utils/discovery.ts:88`; `src/utils/looks.ts:43`; `src/utils/reels.ts:98` | about 5 |

One admin load is about **P + C + 2S + Ra + R + O + 2K + L + 8 reads**. With a few hundred orders that is roughly 700–1,200 reads per load or reload (estimate).

### 4.2 Per admin page

| Page | Where | Reads |
|---|---|---|
| Dashboard | `analytics_totals/lifetime` listener (`src/components/admin/AdminDashboardOverview.tsx:62`); newest 15 `daily_analytics` (`:78-79`); newest 100 `visitor_sessions` (`:97-98`) | 116 on open |
| Dashboard, while it stays open | today's `daily_analytics` doc changes on every counted event; `analytics_totals` and the top-100 sessions change on every visit | about 1 read per counted event, roughly 6–9 per visitor |
| Reviews | a second whole-collection listener (`src/components/admin/AdminReviews.tsx:58`) | R |
| Customers | whole `customers` collection (`src/components/admin/AdminCustomers.tsx:40`) | all customers |
| Insights | 7 days of `search_terms` and `product_daily` (`src/components/admin/AdminInsights.tsx:20-24`) | up to 7 × (terms + viewed products) |
| Stock history | `src/components/admin/AdminStockHistory.tsx:37-39` | up to 300 |
| Order details | single-document listener (`src/components/admin/AdminOrderDetails.tsx:108`) | 1 + changes |
| Looks / Reels / Discovery / Combo offers | single-document listeners (`AdminLooks.tsx:163`, `:173`; `AdminReels.tsx:207`; `AdminDiscovery.tsx:43`; `AdminComboOffers.tsx:18`) | 1–2 each |
| Payment gateways / AI helper | `api/admin-config.js:391-393`, `:399-401` | 2 each |

### 4.3 Session checks and two loops

- `validateSession` runs on load, on every window focus, on every `popstate`, on **every `storage` event**, and every 5 minutes (`src/context/AdminContext.tsx:611-615`). Each run is 2 server reads. The 5-minute timer alone is about 576 reads per day for a tab left open.
- `storage` events fire whenever another tab of the site writes `localStorage`. The storefront writes it constantly, including an activity stamp every minute (`src/components/LiveVisitorTracker.tsx:20`, `src/utils/visitorTracker.ts:308-310`). With an admin tab and a store tab open in the same browser, the admin tab re-checks the session at least once a minute: about 120 reads per hour.
- **15-second settings loop:** if the `storefront_settings` listener never delivers a first snapshot (permission error, quota error, network), `settingsConnected` stays false and the tab calls `GET /api/admin-config` every 15 seconds forever (`src/context/AdminContext.tsx:794`, `:803-812`). That is 240 calls per hour, each reading S documents — up to about 2,600 reads per hour per stuck tab. This is most likely to start right after a quota outage, when listeners have died.
- Saving a product triggers `check-product` (`src/context/ProductContext.tsx:9-12`, `:425`, `:495`): 2–3 reads and 1 write, but **a price drop reads up to 5,000 `profiles`** plus one `alert_log` read per matching wishlist (`api/alerts.js:49-57`).

### 4.4 Sitemap

`/sitemap.xml` reads the whole `products` collection (P reads; `select()` does not reduce the bill) and is cached for only one hour (`api/sitemap.js:51-53`, `:82`; `vercel.json:4-7`). Crawlers can cost up to 24 × P reads per day per region.

---

## 5. Ranking

Assumptions for the per-visitor column (all estimates, to be replaced with real funnel numbers): P about 200, D about 250; one visitor = 1 session, 3 product views, 0.2 searches, 0.1 add-to-cart, 0.05 checkout forms, 0.015 paid orders, 0.03 sign-ins.

### 5.1 Fixed cost per day (independent of visitor count once traffic is continuous)

| Rank | Consumer | Reads per day | Evidence |
|---|---|---|---|
| 1 | Catalogue rebuilds: 288 × D per region | about 72,000 (D = 250), more with several regions or concurrent misses | section 1.2 |
| 2 | Admin panel loads: about 700–1,200 per load | 5 loads ≈ 5,000; a day of heavy admin work ≈ 10,000+ | section 4.1 |
| 3 | Admin 15-second settings loop, when stuck | up to about 2,600 per hour per tab | section 4.3 |
| 4 | Sitemap | up to 24 × P ≈ 4,800 | section 4.4 |
| 5 | Admin session checks | about 600 per open tab, more with a second tab | section 4.3 |
| 6 | Tracking budget checks | up to 1,440 per warm instance | section 2.3 |

Rank 1 alone exceeds the daily read quota. Why the quota ran out in about 3 hours rather than about 16 cannot be settled from the code; the likely contributors are regions, concurrent misses and the per-visitor costs below.

### 5.2 Per 1,000 visitors

| Rank | Consumer | Reads | Writes |
|---|---|---|---|
| 1 | Product-view tracking (3,000 views × 3 R / 4 W) | 9,000 | 12,000 |
| 2 | Admin dashboard left open (about 6–9 reads per visitor) | 6,000–9,000 | 0 |
| 3 | Visit tracking (4 R / 6 W) | 4,000 | 6,000 |
| 4 | Product page reviews listener (at least 1 per view) | 3,000+ | 0 |
| 5 | Product page "viewed today" read (1 per view) | 3,000 | 0 |
| 6 | Search, cart, checkout, reel events | about 600 | about 1,300 |
| 7 | Abandoned-checkout capture (50 forms × about 10) | 0 | about 500 |
| 8 | Sign-in and account (30 customers) | about 400 | about 250 |
| 9 | Orders: create + verify + webhook + confirmation (15 paid, 20 attempts) | about 300 | about 150 |
| | **Total** | **about 20,000 (26,000–29,000 with the dashboard open)** | **about 20,000 before the budget guard** |

The existing guard stops tracking writes at about 8,000 (about 440 visitors on these assumptions). After that, tracking reads fall to almost zero, but ranks 4 and 5 continue at 6 reads per visitor.

Failure mode, on top of everything: about 230+ reads per first-time visitor page load when the catalogue cannot be fetched (section 1.3).

---

## 6. Bridge change list

Ordered by saving per line of code changed. Changes B1–B4 give the 90% cut on their own; B5–B9 are hardening. None removes a shopper-facing feature; the two places where a shopper could notice a difference are stated in the risk column.

Nothing here deletes data or changes Firestore documents' shape, so it does not interfere with the export for the migration.

### B1. Catalogue: stop rebuilding every 5 minutes

Files: `src/lib/catalog.ts`, `api/admin-config.js`.

1. `src/lib/catalog.ts:22` — raise `BUCKET_MS` from 5 minutes to 60 minutes.
2. `api/admin-config.js:486` — change the header to `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`.
3. `api/admin-config.js:457-465` — add an in-function guard: keep `lastCatalogAt` next to `lastCatalog` (`:239`, `:483`) and, when the last build on this instance is younger than 10 minutes, return it without touching Firestore. This caps concurrent misses and the `v=<random>` abuse path per warm instance.
4. Same handler — ignore unknown `v` values: if `v` is not the current or previous bucket number, answer with the guard copy or a redirect to the current bucket. This closes the cache-busting path.

Explicit invalidation when the admin saves (pick one):

- **Option A, no new moving parts:** admin browsers already read live, so the admin sees changes at once; shoppers see them within 60 minutes. Stock and price are always re-checked by the server at order time (`api/_lib/orders.js:303-348`), so a stale page can never sell at a wrong price or oversell.
- **Option B, immediate:** tag the response and purge the tag from the admin save paths (`api/admin-config.js:712-721` for settings; a new small admin-only `action=catalog-refresh` called by the browser after product, category, coupon and review saves in `src/context/ProductContext.tsx:391`, `:422`, `:453`, `:484` and `src/context/AdminContext.tsx:1197-1207`, `:1312-1326`, `:1453-1489`). Vercel's cache-tag purge API and its availability on the current plan are **unverified**; confirm in the Vercel documentation before choosing this. With Option B the lifetime can be raised to 24 hours.

Expected saving: 288 → 24 builds per day per region. About 72,000 → about 6,000 reads per day (D = 250). With Option B and a 24-hour lifetime: a few hundred per day plus one build per admin save.

Risk: shoppers can see a sold-out item as available, or an old price, for up to 60 minutes under Option A; the checkout then shows the existing "sold out" or re-priced message. Low.

Verify without production: unit-test the handler with a fake `client` whose `collection().get()` counts calls — call it twice within 10 minutes and assert the second call makes zero reads; assert the header string. For the browser side, assert that two `loadCatalog()` calls 59 minutes apart build the same URL (mock `Date.now`).

### B2. Shoppers never fall back to live Firestore

Files: `src/lib/catalog.ts`, `src/context/ShopContext.tsx`, `src/context/AdminContext.tsx`, new `public/catalog-snapshot.json`.

1. `src/lib/catalog.ts:65-83` — when the fetch fails and there is no saved copy, load `/catalog-snapshot.json` (a static file in `public/`, same shape as `PublicCatalog`, served by the CDN with no function and no Firestore). Return that instead of `null`.
2. `src/lib/catalog.ts:89-105` — in `fromCatalogOrLive`, call `startLive()` only when `readsLive()` is true. For shoppers, a `null` catalogue now means "retry `loadCatalog` in 30 seconds", never a listener.
3. `src/context/ShopContext.tsx:271` — remove the `listDocs(COLLECTIONS.coupons)` fallback for shoppers (use an empty list; the server validates typed codes anyway, `api/orders.js:315-317`).
4. `src/context/AdminContext.tsx:749-753` — for shoppers, do not fall back to `GET /api/admin-config`; keep the `localStorage` copies already loaded at `:660-718`.
5. The snapshot file is produced from one saved catalogue response and committed with each deploy. It only needs to be roughly current; it is the last resort for a first-time visitor during an outage.

Expected saving: removes the 230+ reads per first-time visitor in the failure case, which is what turns a slow hour into an exhausted quota. Also means shoppers can browse through a full Firestore outage.

Risk: during an outage a first-time visitor sees the snapshot's prices and stock, which may be days old. The server still re-prices every order. To honour the honesty rules in `AGENTS.md`, regenerate the snapshot whenever prices change in bulk. Low to medium.

Verify without production: run `vite preview` and open it under a non-localhost name (for example Chromium with `--host-resolver-rules="MAP sag.test 127.0.0.1"`), because `localhost` forces live mode (`src/lib/catalog.ts:28`) and disables tracking (`src/utils/visitorTracker.ts:50-53`). In Playwright, make `/api/admin-config*` return 503, count requests to `firestore.googleapis.com`, and walk home → category → product → bag → checkout as a guest. The count must be zero for catalogue data and the pages must render from the snapshot.

### B3. Product page: no per-view Firestore reads

Files: `src/components/ProductReviews.tsx`, `src/components/ProductDetailPage.tsx`, `api/admin-config.js`.

1. `src/components/ProductReviews.tsx:178-185` — open the listener only when `readsLive()` is true. Shoppers use `reviewsList` from the catalogue, which is already the coded fallback (`:188-190`) and already carries `helpfulCount` (`api/admin-config.js:474`).
2. `src/components/ProductDetailPage.tsx:60-68` — replace the per-view `getDoc` with a lookup in a `todayStats` map delivered inside the catalogue. In the catalogue build add one query, `product_daily` where `day == today` (at most one document per product viewed today).

Expected saving: at least 2 reads per product view → 0. About 6,000 reads per 1,000 visitors.

Risk:

- "N people viewed this today" is up to 60 minutes behind. The numbers are still real server counts, so the honesty rule holds.
- The catalogue returns only the newest 300 approved reviews (`api/admin-config.js:476`); if the store has more than 300, older ones would stop showing on product pages. Check Ra during the data export; raise the cap if needed.
- A shopper's helpful vote still updates on screen from the API answer (`src/components/ProductReviews.tsx:224`).

Verify without production: the Playwright walk from B2 with the catalogue mocked as healthy — zero requests to `firestore.googleapis.com` on a product page for a guest. Component test: reviews render from a catalogue fixture.

### B4. Tracking: zero reads, few writes, real off switch

Files: `api/track.js`, `src/utils/visitorTracker.ts`.

1. `api/track.js:31` — parse the budget so `0` means zero (`process.env.TRACK_WRITE_BUDGET === undefined ? 8000 : Number(...)`), and add `TRACK_MODE` = `full` | `lite` | `off`, checked before `firestore()` is created (`:68`). `off` answers `{ ok: true, paused: true }` with no database access. This is the emergency switch and needs no deploy to flip.
2. `lite` mode (recommended for the bridge):
   - `visit`: one batched write of two increments, `daily_analytics/<day>` and `analytics_totals/lifetime`; no transaction, no dedup documents, no `visitor_sessions` document. 0 reads, 2 writes (today 4 reads, 6 writes). The browser already sends one visit per session (`src/utils/visitorTracker.ts:328-334`).
   - `product_view` / `wishlist_add`: one increment on `product_daily`; drop the product existence read (`api/track.js:82`) by checking the id format only. 0 reads, 1 write (today 3 reads, 4 writes).
   - `search`, reel and feature events, cart and checkout events: one increment each. 0 reads, 1 write.
   - Replace the Firestore per-IP caps (`api/track.js:15`, `:18`, `:22`) with an in-memory per-instance counter.
3. `api/track.js:35-48` — count writes in memory per instance and re-read `daily_analytics` at most every 10 minutes instead of every minute; update the estimate formula at `:41` to the new per-event costs and include the feature events.
4. `src/utils/visitorTracker.ts:291-302`, `:370-385` — when the server answers `paused: true`, set a `sessionStorage` flag and stop calling `/api/track` for that session.

Expected saving per 1,000 visitors: about 13,600 reads → 0; about 19,300 writes → about 5,400 (`lite`) or 0 (`off`). The write budget guard still caps the day.

Risk:

- Admin dashboard loses the per-visitor timeline and the "live visitors" list in `lite` mode (`visitor_sessions` is no longer written). Shoppers see no difference. Daily and lifetime totals keep working; unique-versus-returning split is lost. GA4 (`src/lib/firebase.ts:39-49`) still has the full picture.
- Without dedup documents a script can inflate counters up to the in-memory cap and the daily budget. Acceptable for a few days.
- In `off` mode the "viewed today" line stops appearing on product pages once the day rolls over (it only ever shows at 5+ views). Use `lite`, not `off`, unless the quota is in danger.

Verify without production: call the handler with a fake `db` that counts `get`, `getAll`, `runTransaction`, `set`, `update`, `batch().commit()`. Assert per mode: `off` → no method called; `lite` visit → 0 reads, 1 commit with 2 writes; `lite` product view → 0 reads, 1 write. Assert `TRACK_WRITE_BUDGET=0` pauses.

### B5. Abandoned-checkout capture: at most three writes per checkout

File: `src/components/CheckoutPage.tsx`.

- `:209-253` — skip the write unless the mobile number has 10 digits or the email is valid; skip when the payload is identical to the last one sent (compare a JSON string held in a ref); stop after 3 writes per checkout session.
- `:255-282` — raise the debounce from 1 second to 5 seconds.

Expected saving: about 8–15 writes per checkout form → at most 3.

Risk: the admin sees a lead slightly later and never sees name-only partial rows. Low.

Verify without production: component test with `saveDoc` mocked; type a full form and assert at most 3 calls.

### B6. Admin panel: load less, listen less

Files: `src/context/AdminContext.tsx`, `src/components/admin/AdminDashboardOverview.tsx`, `src/components/admin/AdminReviews.tsx`, `api/admin-config.js`.

1. `src/context/AdminContext.tsx:810-812` — stop the 15-second loop: at most 3 retries, then give up until the next focus.
2. `src/context/AdminContext.tsx:612-615` — drop the `storage` listener (or react only to the admin's own keys), throttle `validateSession` to once per 5 minutes, and stop calling `action=security` on every check (`:582`) — once per page load is enough.
3. `api/admin-config.js:206-209`, `:328` — reuse `lastCredentials` when it was read less than 5 minutes ago instead of reading the document on every admin request.
4. `src/context/AdminContext.tsx:952` — replace the whole-`orders` listener with a query for the last 60 days ordered by `createdAt` (single-field index, created automatically); add a "load older" button.
5. `src/context/AdminContext.tsx:937-945` — on admin URLs, wait for `isFirebaseAdmin` instead of first opening the approved-only listener.
6. `src/components/admin/AdminReviews.tsx:58` — remove the second whole-collection listener; carry `helpfulCount`, `source`, `createdAt` through `mapReviewFromDb` (`src/context/AdminContext.tsx:861-876`).
7. `src/components/admin/AdminDashboardOverview.tsx:62`, `:79`, `:98` — replace the three listeners with one-off reads and a "Refresh" button; lower the session list from 100 to 25.
8. `src/lib/catalog.ts:25-34` — make `sag_admin_live` apply only on admin URLs, so the owner browsing the public store reads the cached catalogue like everyone else.

Expected saving: admin load from about 700–1,200 reads to about P + C + S + R + (recent orders) + 30, roughly halved; the dashboard no longer costs 6–9 reads per visitor; the two loops (up to thousands of reads per hour) disappear.

Risk: the dashboard no longer updates by itself; orders older than 60 days need one extra tap. No shopper impact. Low.

Verify without production: admin panel on localhost with the Firestore emulator (demo project id, no real credentials), or Playwright request counting against `firestore.googleapis.com` with responses stubbed; assert that an idle admin tab makes no requests for 2 minutes and that a `localStorage` write from a second tab triggers no `/api/admin-config` call.

### B7. Small server caches

Files: `api/_lib/payu.js`, `api/_lib/orders.js`.

- `api/_lib/payu.js:27` — raise the gateway cache from 20 seconds to 5 minutes. `clearGatewayCache()` (`api/admin-config.js:691`) only clears the instance that handled the save, so a gateway switch can take up to 5 minutes elsewhere; PayU callbacks already read fresh (`api/payu.js:52`).
- `api/_lib/orders.js:18-26` — cache `readSetting` results for 60 seconds per instance (`storeSettings`, `comboOffer`, `lookRelations`).
- `api/_lib/orders.js:152-158` — cache the coupon list for 60 seconds instead of reading all coupons on every check.

Expected saving: a few reads per checkout. Small in absolute terms; it mainly makes checkout survive short Firestore slowdowns.

Risk: a coupon or shipping change takes up to 60 seconds to reach checkout; a coupon's `usageCount` limit could be exceeded by one or two orders inside that minute. Low.

Verify without production: fake-`db` unit tests: two `priceCart` calls in a row read settings once.

### B8. Signed-in customers: one profile read per page load

File: `src/context/ShopContext.tsx`.

- `:360-481`, `:590-600` — share one in-flight `getDocById(profiles)` between cart and wishlist and reuse it for 60 seconds; the mount call and the auth-callback call then cost 1 read instead of 4.
- `:557-571` — pull on `visibilitychange` only when the last pull is older than 5 minutes.

Expected saving: 4+ → 1 read per signed-in page load.

Risk: a wishlist change made on another device shows up to 5 minutes later. Low.

Verify without production: unit test with `getDocById` mocked; mount + auth event → 1 call.

### B9. Sitemap and price-drop alerts

- `api/sitemap.js:82` — `s-maxage=86400, stale-while-revalidate=604800`. Saves up to 23 × P reads per day. Risk: a new product reaches the sitemap a day later.
- Price-drop alerts read up to 5,000 profiles per price reduction (`api/alerts.js:49-50`). No code change needed: the existing switch `discovery.features.priceDropAlerts` (`api/alerts.js:15-19`, key listed at `api/admin-config.js:69`) can be turned off in Admin → Discovery during the bridge, or bulk price reductions avoided. Owner decision.

### Operating rules during the bridge (no code)

- Do not run end-to-end tests, clean-up scripts or audits against the live site; each one reads whole collections.
- Keep one admin tab open, not several, and do not leave the dashboard open during ad hours until B6 is deployed.
- Take the migration export once, shortly after the daily reset, and count it against that day's reads (roughly one read per exported document).

---

## 7. Expected result

Same assumptions as section 5 (D = 250, 1,000 visitors per day, 5 admin loads).

| | Reads per day before | Reads per day after B1–B4 + B6 |
|---|---|---|
| Catalogue | about 72,000 | about 6,000 (Option A) or under 1,000 (Option B) |
| Tracking | about 13,600 until the guard trips | 0 |
| Product page reads | about 6,000 | 0 |
| Admin panel and dashboard | about 5,000–15,000 | about 2,000–3,000 |
| Sitemap | up to 4,800 | about 200 |
| Checkout, orders, sign-in | about 700 | about 600 |
| **Total** | **about 100,000 (over quota)** | **about 9,000–10,000 (Option A), about 4,000 (Option B)** |

That is a cut of about 90% with Option A and about 96% with Option B, leaving 40,000 reads of headroom for orders, sign-in and the migration export.

Writes: about 20,000 per 1,000 visitors before the guard → about 6,000 in `lite` mode (about 70% less) or about 600 with tracking `off` (about 97% less). The daily write guard stays in place either way.

Suggested order of deployment: B4 switch first (environment variable, instant relief) → B1 → B3 → B2 → B6 → the rest.

---

## 8. Open questions

1. Real document counts for P, C, S, Ra, R, K, O, L and `profiles`. They decide every absolute number here; take them from the export, not from live queries.
2. Which quota ran out first on the bad days (reads or writes)? Firebase console → Firestore → Usage.
3. Does the Vercel plan in use support cache-tag purging, and does the CDN collapse concurrent misses? Decides B1 Option A versus B.
4. How many CDN regions actually serve the store's traffic? Multiplies the catalogue cost.
5. Is the owner willing to lose the per-visitor timeline and "live visitors" list on the admin dashboard for the bridge days (B4 `lite`)?
6. Is a 60-minute delay before shoppers see admin changes acceptable (B1 Option A), given that checkout always re-prices?
7. Does the store have more than 300 approved reviews (B3 cap)?
8. Is a Firestore TTL policy configured on `rate_limits.expiresAt` and are `analytics_dedup` documents ever cleaned? Not a quota issue, but it affects export size. Unverified from the repo.
