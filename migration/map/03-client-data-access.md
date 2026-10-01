# 03 — Client data access (browser → Firebase and browser → /api)

Scope: every place the React app in `src/` talks to Firestore, Firebase Auth or `/api/*` directly, what it costs in
Firestore reads/writes today, and the API surface the Cloudflare Worker must offer so the browser never talks to a
database again.

Method: static reading of the working tree on 2026-10-01 (uncommitted changes included). Nothing was run against
production. Line numbers are `path:line` in the working tree.

Symbols used in the estimates (real counts were not measured — take them from the Firestore export):

| Symbol | Meaning |
|---|---|
| P | documents in `products` (hidden ones included) |
| C | documents in `categories` |
| S | documents in `storefront_settings` (up to 11 public keys, `api/admin-config.js:55-67`) |
| R / Ra / Rp | all reviews / approved reviews / approved reviews of one product |
| K | documents in `coupons` |
| O / Oc | all orders / orders of one customer |
| L | documents in `leads` |
| U | documents in `customers` |
| n | distinct products in one cart |

Firestore billing rules assumed: a listener's first snapshot costs one read per document returned (minimum 1 for an
empty query); later it costs one read per changed document; a listener that was disconnected for more than about 30
minutes is billed again in full when it reconnects. A transaction `get` is a read.

---

## 1. How the browser is wired today

### 1.1 Three Firebase apps in the browser

| App | Created at | Used for |
|---|---|---|
| default | `src/lib/firebase.ts:7` | customer Auth (`auth`, `:10`) and storefront Firestore (`db`, `:24`); also Firebase Analytics on non-local hosts (`:39-46`) |
| `sag-admin` | `src/lib/firebase.ts:28` | admin Auth (`adminAuth`, `:29`) and admin Firestore (`adminDb`, `:36`) so admin and customer sessions never replace each other |
| `sag-google` | `src/utils/googleSignIn.ts:61` | throwaway app used only to turn a Google credential into a Firebase ID token (`:63-66`) |

Config comes from `firebase-applet-config.json` (`src/lib/firebase.ts:5`; keys `projectId, appId, apiKey, authDomain,
storageBucket, messagingSenderId, measurementId`). These are public web-app identifiers, not secrets, but they all
disappear with Firebase.

### 1.2 Two identities, both Firebase custom tokens

- **Customer**: `/api/customer-auth` returns `firebaseToken`; the browser calls `signInWithCustomToken(auth, token)`
  (`src/context/AuthContext.tsx:84`). uid starts with `c_`, the email is in the token claim `customerEmail`
  (`AuthContext.tsx:23,56-57`). Session persistence is Firebase Auth's own (IndexedDB) plus a localStorage cache
  `sag_custom_user` (`AuthContext.tsx:24,66`).
- **Admin**: `/api/admin-config?action=login|session` sets an HttpOnly cookie `sag_admin_session` scoped to
  `Path=/api/admin-config` (`api/admin-config.js:48,298`) **and** returns `firebaseToken`; the browser calls
  `signInWithCustomToken(adminAuth, token)` (`src/lib/dataStore.ts:140-144`), uid `sag-admin`, claim `admin: true`
  (`api/_lib/firebaseAdmin.js:30`).

So the admin has two parallel credentials: the cookie (accepted only by `/api/admin-config`) and the Firebase ID
token (sent as `Authorization: Bearer` to `/api/orders`, `/api/reviews`, `/api/alerts`, and used by Firestore rules).

### 1.3 The `/api` helper

`apiPost` (`src/lib/api.ts:13-38`) POSTs JSON with `credentials: 'same-origin'`, a 30 s timeout, and
`Authorization: Bearer <Firebase ID token>` when someone is signed in. On admin paths it prefers the admin token,
elsewhere the customer token (`api.ts:16-17`). `ordersApi(action, body)` is `apiPost('/api/orders', {action, ...})`
(`api.ts:40`). The server resolves the identity in `getIdentity` (`api/_lib/http.js:42-58`).

Calls that do **not** go through `apiPost` (raw `fetch`, cookie only): everything on `/api/admin-config`,
`/api/track`, and the `GET /api/alerts?wishlist=` read.

### 1.4 The shared catalogue and the "live" switch

`src/lib/catalog.ts` is the single most important piece for quota:

- `loadCatalog()` (`catalog.ts:65-83`) does **one** `GET /api/admin-config?action=catalog&v=<5-minute bucket>` per page
  load (module-level `pending` promise, `:44,66`). The answer is saved in localStorage `sag_catalog_saved_v1` for up to
  3 days and reused when the server is slow or down (`:48-62,70-79`).
- `readsLive()` (`catalog.ts:25-34`) is true on admin paths, on localhost, and in any browser where localStorage
  `sag_admin_live === '1'` (set when the admin signs in, cleared on sign-out; `catalog.ts:37-42`,
  `AdminContext.tsx:1149-1154`).
- `fromCatalogOrLive(onData, startLive)` (`catalog.ts:89-105`): shoppers get catalogue data; live readers — and
  **shoppers whose catalogue request failed with no saved copy** — start a Firestore `onSnapshot` instead.

Consequence: a normal shopper opens **zero** Firestore listeners for the catalogue, but if `/api/admin-config?action=catalog`
returns 503 and there is no saved copy (first-time visitor during an outage/quota exhaustion), every one of the
`fromCatalogOrLive` call sites below falls back to direct Firestore listeners, which is the worst moment to do so.

Server side of the catalogue (`api/admin-config.js:457-501`): five collection reads in parallel
(`storefront_settings`, `products`, `categories`, `reviews where status == approved`, `coupons`) = **S + P + C + Ra + K
reads per generation**. Response header `s-maxage=600, stale-while-revalidate=600` (`:486`), but the browser puts a
5-minute bucket in the URL (`catalog.ts:22,67,72`), so the cache key changes every 5 minutes: at most 288
generations/day **per Vercel edge region that has traffic** (the code comment at `admin-config.js:454` says 10
minutes; the effective period is 5).

### 1.5 `dataStore` helpers

`src/lib/dataStore.ts` wraps Firestore. `store()` picks `adminDb` when an admin Firebase session exists in this
browser, otherwise the storefront `db` (`dataStore.ts:18`) — so in the admin's own browser even storefront writes
(profile, abandoned checkout) go out with the admin token.

| Helper | Line | Firestore call |
|---|---|---|
| `listDocs(name)` | `dataStore.ts:54-57` | `getDocs(collection)` — whole collection |
| `listDocsWhere(name, field, value)` | `:59-62` | `getDocs(query(where ==))` — exported, **no caller found in `src/`** |
| `getDocById(name, id)` | `:64-67` | `getDoc` |
| `saveDoc(name, id, data, merge=true)` | `:70-73` | `setDoc(..., {merge})`, adds `updatedAt` |
| `patchDoc(name, id, data)` | `:75-78` | `updateDoc`, adds `updatedAt` |
| `removeDoc(name, id)` | `:80-82` | `deleteDoc` |
| `watchCollection(name, onChange, onError)` | `:86-94` | `onSnapshot(collection)` — whole collection, live |
| `uploadImage(file, folder)` | `:114-126` | `POST /api/admin-config?action=cloudinary-sign`, then direct upload to `api.cloudinary.com` |
| `deleteImages(urls)` | `:132-137` | `POST /api/admin-config?action=cloudinary-delete` |
| `signInAdminToFirebase` / `signOutAdminFromFirebase` | `:140-148` | Firebase Auth custom token sign-in / sign-out |

### 1.6 Provider tree

`AuthProvider → RouterProvider → ProductProvider → ShopProvider → AdminProvider → MainContent` (`src/App.tsx:240-253`).
**All four data providers mount on every page, storefront and admin alike.** In particular `AdminProvider`'s effects
run for every anonymous shopper (they are gated inside by `readsLive()` / `isFirebaseAdmin`), and `ShopProvider`'s
storefront effects run on admin pages.

---

## 2. Inventory A — direct Firestore access from the browser

"Live" = `onSnapshot` listener that stays open. "Gate" = the condition under which the call actually happens.

### 2.1 Reads

| # | file:line | What it does | Collection / doc | Who | When | Live | Gate / notes |
|---|---|---|---|---|---|---|---|
| A1 | `src/context/ProductContext.tsx:327-343` | Whole product catalogue | `products` (all, incl. hidden) | admin; shopper only on fallback | app mount | yes | `fromCatalogOrLive` (`:322`). P reads on connect |
| A2 | `src/context/AdminContext.tsx:915-919` | Categories | `categories` (all) | admin; shopper on fallback | app mount | yes | `fromCatalogOrLive` (`:909`) |
| A3 | `src/context/AdminContext.tsx:803-809` | "Something changed" signal only; each change triggers `GET /api/admin-config` | `storefront_settings` (all) | admin browser | app mount | yes | only when `readsLive()` (`:800`); first snapshot ignored (`:804-807`). S reads on connect + S server reads per change |
| A4 | `src/context/AdminContext.tsx:937-944` | Reviews: all for the admin, approved-only otherwise | `reviews` | admin (all R); live non-admin reader (Ra) | app mount, restarts when admin Firebase session appears | yes | shoppers use the catalogue instead (`:930-936`) |
| A5 | `src/context/AdminContext.tsx:952-954` | **Entire orders collection** | `orders` (all) | admin | app mount once `isFirebaseAdmin` (`:950`) | yes | O reads on every admin page load, on any page (storefront included) in the admin's browser |
| A6 | `src/context/AdminContext.tsx:955-957` | All coupons | `coupons` (all) | admin | same as A5 | yes | K reads |
| A7 | `src/context/AdminContext.tsx:969` | Low-stock threshold | `admin_settings/inventory` | admin | once per admin Firebase session | no | 1 read |
| A8 | `src/context/AdminContext.tsx:984-999` | All leads, newest first | `leads` (orderBy `createdAt` desc) | admin | app mount once `isFirebaseAdmin` | yes | L reads; skipped if the session quota flag is set (`:982`) |
| A9 | `src/context/ShopContext.tsx:271` | Coupon list for the coupon drawer | `coupons` (all) via `listDocs` | live readers (admin browser, localhost); shopper on catalogue failure | app mount (`:291-293`) | no | shoppers take `catalog.coupons`; K reads otherwise |
| A10 | `src/context/ShopContext.tsx:1082-1086` | Shipping charge, free-shipping threshold, prepaid discount, coupons switch | `storefront_settings/storeSettings` | admin; shopper on fallback | app mount | yes | `fromCatalogOrLive` (`:1080`) |
| A11 | `src/context/ShopContext.tsx:1101-1107` | Combo offer | `storefront_settings/comboOffer` | admin; shopper on fallback | app mount | yes | `fromCatalogOrLive` (`:1099`) |
| A12 | `src/utils/discovery.ts:88-91` | Feature switches + occasions (one shared listener) | `storefront_settings/discovery` | admin; shopper on fallback | first `useDiscovery()` use (Header, so effectively app mount) | yes | `fromCatalogOrLive` (`:83`) |
| A13 | `src/utils/looks.ts:43-47` | "Complete the look" picks | `storefront_settings/lookRelations` | admin; shopper on fallback | first set-product page / look UI | yes | `fromCatalogOrLive` (`:41`) |
| A14 | `src/utils/reels.ts:98-105` | Aura reels list | `storefront_settings/auraReels` | admin; shopper on fallback | first reels section render | yes | `fromCatalogOrLive` (`:92`) |
| A15 | `src/components/DeliveryCheck.tsx:82-85` | Only "settings have loaded" flag | `storefront_settings/storeSettings` | admin; shopper on fallback | product page mount | yes | `fromCatalogOrLive`; duplicate listener of A10 |
| A16 | `src/components/ProductDetailPage.tsx:65` | Today's view / wishlist counts for social proof | `product_daily/{YYYY-MM-DD}_{productId}` | **anonymous shopper** | every product page view | no | **not** catalogue-gated: 1 direct read per product view. Rule: `allow get: if true` (`firestore.rules:112-115`) |
| A17 | `src/components/ProductReviews.tsx:180-184` | Approved reviews of this product, with helpful counts | `reviews where productId == X and status == approved` | **anonymous shopper** | every product page view | **yes** | **not** catalogue-gated: max(1, Rp) reads per product view, listener stays open while on the page |
| A18 | `src/context/ShopContext.tsx:366` | Saved cart (in `mergeGuestCartOnAuth`) | `profiles/{email}` | signed-in customer | app mount, `onAuthStateChanged`, `sag-auth-state-change` event (`:590-612`) | no | same document as A19–A22 |
| A19 | `src/context/ShopContext.tsx:444` | Saved wishlist | `profiles/{email}` | signed-in customer | same triggers as A18, **plus every time the tab becomes visible** (`:570`) | no | |
| A20 | `src/components/AccountPage.tsx:618` | Profile, style prefs, address book in one read | `profiles/{email}` | signed-in customer | My Account mount | no | primes A21/A22 so they do not read again (`:620-624`) |
| A21 | `src/lib/addressBook.ts:221` | Address book (only when no profile was passed in) | `profiles/{email}` | signed-in customer | checkout `AddressBook` mount (`src/components/AddressBook.tsx:371`), once per session | no | |
| A22 | `src/components/StyleProfile.tsx:122` | Style preferences | `profiles/{email}` | signed-in customer | first `useStylePrefs()` (home `PersonalRails.tsx:39`, Account style tab `:193`) | no | cached per session |
| A23 | `src/components/admin/AdminDashboardOverview.tsx:62` | Lifetime visitor totals | `analytics_totals/lifetime` | admin | dashboard tab | yes | 1 read |
| A24 | `src/components/admin/AdminDashboardOverview.tsx:78-79` | Last 15 days of daily counters | `daily_analytics` orderBy `date` desc limit 15 | admin | dashboard tab | yes | ≤15 reads, +1 per tracked event while open (today's doc changes on every counted event) |
| A25 | `src/components/admin/AdminDashboardOverview.tsx:97-98` | Last 100 visitor sessions | `visitor_sessions` orderBy `lastActive` desc limit 100 | admin | dashboard tab | yes | ≤100 reads, +1 per new/returning visitor while open |
| A26 | `src/components/admin/AdminInsights.tsx:22` | Search terms of the last 7 days | `search_terms where day in [7 days]` | admin | dashboard tab (`AdminDashboardOverview.tsx:449`) | no | unbounded: one doc per distinct term per day |
| A27 | `src/components/admin/AdminInsights.tsx:23` | Product views/wishlists of the last 7 days | `product_daily where day in [7 days]` | admin | dashboard tab | no | up to 7 × P reads |
| A28 | `src/components/admin/AdminCustomers.tsx:40` | All customer accounts | `customers` (all) | admin | Customers tab mount | no | U reads |
| A29 | `src/components/admin/AdminStockHistory.tsx:38-39` | Stock change log | `inventory_log` (by product limit 300, or newest 100) | admin | Products → History view (`AdminProducts.tsx:208`) | no | needs the single-field index on `at` |
| A30 | `src/components/admin/AdminOrderDetails.tsx:108-110` | One order, live (cancel/return requests, tracking extras) | `orders/{orderNumber}` | admin | order details open | yes | 1 read + 1 per change; duplicates A5 |
| A31 | `src/components/admin/AdminReviews.tsx:58` | All reviews again (helpful counts, source) | `reviews` (all) | admin | Reviews tab | yes | R reads; duplicates A4 |
| A32 | `src/components/admin/AdminComboOffers.tsx:18` | Combo offer form | `storefront_settings/comboOffer` | admin | Combo offers tab | yes | 1 read |
| A33 | `src/components/admin/AdminDiscovery.tsx:43` | Discovery form | `storefront_settings/discovery` | admin | Discovery tab | yes | 1 read |
| A34 | `src/components/admin/AdminLooks.tsx:163` | Look relations form | `storefront_settings/lookRelations` | admin | Looks tab | yes | 1 read |
| A35 | `src/components/admin/AdminLooks.tsx:173` | Whether the feature is on | `storefront_settings/discovery` | admin | Looks tab | yes | 1 read |
| A36 | `src/components/admin/AdminReels.tsx:207` | Reels form | `storefront_settings/auraReels` | admin | Reels tab | yes | 1 read |
| A37 | `src/context/ProductContext.tsx:484-491` | Read inside the stock transaction | `products/{id}` | admin | quick stock adjust | no | 1 read + 1 write |

### 2.2 Writes

| # | file:line | What it does | Collection / doc | Who | When | Notes |
|---|---|---|---|---|---|---|
| W1 | `src/context/ShopContext.tsx:346-349` | Save cart | `profiles/{email}` `{cart}` merge | signed-in customer | 400 ms after every cart change (`:506-508`), on tab hide / pagehide / beforeunload (`:557-576`), after a merge (`:402`) | skipped when unchanged (`:343-345`) |
| W2 | `src/context/ShopContext.tsx:424-427` | Save wishlist (full product objects) | `profiles/{email}` `{wishlist}` merge | signed-in customer | 400 ms after every wishlist change (`:621-623`), on tab hide, after a pull (`:476`) | skipped when ids unchanged |
| W3 | `src/components/CheckoutPage.tsx:468-478` | Save address fields | `profiles/{email}` merge | signed-in customer | on "Pay" when "save address" is ticked (`:667`) | |
| W4 | `src/components/AccountPage.tsx:667` | Save profile form | `profiles/{email}` merge | signed-in customer | profile save | |
| W5 | `src/lib/addressBook.ts:185` | Save address list + mirror of default address | `profiles/{email}` `{addresses,...}` merge | signed-in customer | every address add/edit/delete/default; once on first-use migration (`:232`) | |
| W6 | `src/components/StyleProfile.tsx:160` | Save / clear style prefs | `profiles/{email}` `{stylePrefs}` merge | signed-in customer | style profile save | |
| W7 | `src/components/CheckoutPage.tsx:249` | **Abandoned-checkout capture**: name, phone, email, UTM, full cart, address | `abandoned_checkouts/{sessionId}` merge | **anonymous shopper** | 1 s after each change to first name / last name / mobile / email (`:255-281`) and on field blur (`:284-286`) | rule `allow create, update: if true` (`firestore.rules:66-69`). **No reader found anywhere in `src/` or `api/`** — write-only data |
| W8 | `src/components/HomeSections.tsx:247` | Newsletter signup | `leads` (`addDoc`) | anonymous shopper | newsletter submit | field-validated by rules (`firestore.rules:89-99`), no rate limit |
| W9 | `src/components/ContactUsPage.tsx:35-44` | Contact form | `leads` (`addDoc`) | anonymous shopper | contact submit | skipped when the session quota flag is set (`:34`) |
| W10 | `src/context/ProductContext.tsx:391` | Create product | `products/{id}` set | admin | add / duplicate product | followed by W13 |
| W11 | `src/context/ProductContext.tsx:422` | Update changed product fields only | `products/{id}` merge | admin | edit, hide/show, status change | then `POST /api/alerts check-product` when price/stock/visibility changed (`:425`) |
| W12 | `src/context/ProductContext.tsx:453` | Delete product | `products/{id}` delete | admin | delete | then `deleteImages` for images no other product uses (`:455-458`) |
| W13 | `src/context/ProductContext.tsx:135-143` | Stock history entry | `inventory_log/{inv-…}` set | admin | after any stock change | best effort |
| W14 | `src/context/ProductContext.tsx:484-491` | Atomic stock ± delta | `products/{id}` transaction | admin | quick adjust | then W13 + `check-product` (`:492-495`) |
| W15 | `src/context/AdminContext.tsx:1197,1202,1207` | Category add / update / delete | `categories/{id}` | admin | Categories tab | |
| W16 | `src/context/AdminContext.tsx:1253` | `addOrder`: writes an order document from the browser | `orders/{orderNumber}` set | admin | **no caller found** in `src/components` (context API only) | would be rejected by rules anyway (`allow create, update: if false`, `firestore.rules:48-52`) — dead code |
| W17 | `src/context/AdminContext.tsx:1294` | Delete an order (refused for paid, non-cancelled orders, `:1291-1293`) | `orders/{orderNumber}` delete | admin | Orders tab | hard delete, no audit trail |
| W18 | `src/context/AdminContext.tsx:1312,1321,1326` | Coupon add / update / delete | `coupons/{id}` | admin | Coupons tab | duplicate-code check is client-side only (`:1309,1318`) |
| W19 | `src/context/AdminContext.tsx:1439` | Admin-created review | `reviews/{id}` set | admin | Reviews tab | |
| W20 | `src/context/AdminContext.tsx:1453,1474,1481` | Edit review / change status / reply | `reviews/{id}` update | admin | Reviews tab | |
| W21 | `src/context/AdminContext.tsx:1489` | Delete review | `reviews/{id}` delete | admin | Reviews tab | then `POST /api/reviews remove-photos` (`AdminReviews.tsx:138`) |
| W22 | `src/context/AdminContext.tsx:1465` | Recompute product rating + reviewCount **in the browser** from the in-memory review list | `products/{id}` update | admin | after W20 (status/edit) and W21 | a second implementation exists on the server (`api/reviews.js:140-146`) |
| W23 | `src/context/AdminContext.tsx:1503` | Low-stock threshold | `admin_settings/inventory` merge | admin | Settings | |
| W24 | `src/context/AdminContext.tsx:1548` | Mark lead "offer sent" | `leads/{id}` update | admin | Leads tab | |
| W25 | `src/context/AdminContext.tsx:1553-1554` | Delete lead | `leads/{id}` delete | admin | Leads tab | |

Not present anywhere in `src/`: `writeBatch`, `getDocsFromServer`, `getDocFromServer`, `getCountFromServer`,
`sendBeacon`, `EventSource` (grep, no matches). `addDoc`/`collection` are imported but unused in
`src/components/ProductDetailPage.tsx:2`.

### 2.3 Firebase Auth calls in the browser

| file:line | Call | Purpose |
|---|---|---|
| `src/context/AuthContext.tsx:47` | `onAuthStateChanged(auth)` | restore the customer session; reads claim `customerEmail` via `getIdTokenResult()` (`:56`); signs out any non-`c_` user (`:49-51`) |
| `src/context/AuthContext.tsx:84-85` | `signInWithCustomToken(auth, token)` + `getIdTokenResult()` | complete OTP / Google sign-in |
| `src/context/AuthContext.tsx:106` | `signOut(auth)` | customer logout (also clears the localStorage keys listed at `:34-37` and all of sessionStorage, `:101-103`) |
| `src/context/ShopContext.tsx:595` | `onAuthStateChanged(auth)` | re-pull cart and wishlist when a customer session appears |
| `src/context/AdminContext.tsx:627` | `onAuthStateChanged(adminAuth)` | sets `isFirebaseAdmin`, which gates A4–A8 |
| `src/lib/dataStore.ts:143,147` | `signInWithCustomToken(adminAuth)` / `signOut(adminAuth)` | admin Firebase session |
| `src/lib/api.ts:20` | `currentUser.getIdToken()` | bearer token for every `apiPost` |
| `src/utils/googleSignIn.ts:59-65` | `signInWithCredential(GoogleAuthProvider.credential(...))`, `getIdToken()`, `signOut()` on the `sag-google` app | bridge a Google Identity Services credential to a Firebase ID token for `/api/customer-auth` action `google` |

Google sign-in details: Google Identity Services script from `accounts.google.com/gsi/client`
(`googleSignIn.ts:16`), public OAuth client id in `GOOGLE_CLIENT_ID` (`googleSignIn.ts:4`), feature flag
`VITE_GOOGLE_LOGIN` (`:5`). One Tap is offered to signed-out shoppers on home/shop/product/wishlist/cart/account when
the flag and `features.googleOneTap` are on (`src/components/GoogleOneTap.tsx:6,21`). No `signInWithPopup` /
`signInWithRedirect` is used.

---

## 3. Inventory B — `/api` calls from the browser

Server cost column = Firestore operations on the server for one call (r = read, w = write). Identity verification
(`getIdentity`) costs no Firestore operation.

### 3.1 `/api/admin-config` (cookie-authenticated, raw `fetch`)

| file:line | Method / action | Purpose | Who | When | Server cost |
|---|---|---|---|---|---|
| `src/lib/catalog.ts:72` | `GET ?action=catalog&v=bucket` | shared catalogue | everyone who is not a live reader | once per page load | CDN hit: 0. Miss: S+P+C+Ra+K r (`admin-config.js:459-465`) |
| `src/context/AdminContext.tsx:751` | `GET` (no action) | public settings | admin browser (shoppers take them from the catalogue, `:749`) | app mount; again after every `storefront_settings` change (`:803-809`); every 15 s while the listener has not connected (`:810-812`) | S r (`admin-config.js:503`) |
| `src/context/AdminContext.tsx:556` | `GET ?action=session` | validate cookie, slide expiry, get a fresh Firebase custom token | admin paths, or a browser holding an admin Firebase session (`:546-550`) | mount, window `focus`, `storage`, `popstate`, every 5 min (`:611-615`) | 1 r (`admin_credentials/singleton`, `admin-config.js:207,328`) |
| `src/context/AdminContext.tsx:582,1103` | `GET ?action=security` | security config (no secrets) | admin | after every successful session check and after login | 1 r |
| `src/context/AdminContext.tsx:1087` | `POST ?action=login` | username + password + PIN | admin | login form | 1 r + 1 w (`rate_limits/admin_login:<ip>`) + 1 r credentials (`admin-config.js:513-530`) |
| `src/context/AdminContext.tsx:1156` | `POST ?action=logout` | clear cookie, revoke Firebase refresh tokens | admin | logout | 0 |
| `src/context/AdminContext.tsx:730` | `PUT {settings:{key:value}}` | save one public setting: `homepageSections`, `heroConfig`, `storeSettings`, `banners`, `dealOfTheDay`, `paymentSettings`, `instagramReels` (`:879-897,1405-1417,1508,1514`) | admin | each save; **also automatically** by the hero auto-sync effect whenever products change (`:1014-1071`) | 1 r (auth) + 1 w per key |
| `src/components/admin/AdminComboOffers.tsx:35` | `PUT {settings:{comboOffer}}` | combo offer | admin | save | 1 r + 1 w |
| `src/components/admin/AdminDiscovery.tsx:54` | `PUT {settings:{discovery}}` | feature switches, occasions | admin | save | 1 r + 1 w |
| `src/components/admin/AdminLooks.tsx:230` | `PUT {settings:{lookRelations}}` | look picks | admin | save | 1 r + 1 w |
| `src/components/admin/AdminReels.tsx:86` | `PUT {settings:{auraReels}}` | reels | admin | save | 1 r + 1 w |
| `src/context/AdminContext.tsx:1170` | `PUT {securityConfig}` | username / password / PIN / secret path; bumps `session_version` | admin | Settings → Security, "sign out everywhere" (`:1187-1191`) | 1 r + 1 w |
| `src/components/admin/AdminPaymentGateways.tsx:82` | `GET ?action=payment-gateways` | gateway switches (secrets masked) | admin | Payments tab mount | 2 r |
| `src/components/admin/AdminPaymentGateways.tsx:96` | `PUT {paymentGateways}` | Razorpay / PayU switches and keys | admin | save | 2 r + 1 w (`private_settings/payment_gateways`) |
| `src/components/admin/AdminPaymentGateways.tsx:128` | `GET ?action=razorpay-payments` | last 25 Razorpay payments | admin | button | 2 r + Razorpay API |
| `src/components/admin/AiProductFill.tsx:59` | `GET ?action=ai-assistant` | Gemini key status | admin | product form / kids / toys form mount | 1–2 r |
| `src/components/admin/AiProductFill.tsx:70` | `PUT {aiAssistant}` | save / clear Gemini key | admin | save | 1 r + 1 w (`private_settings/ai_assistant`) |
| `src/components/admin/AiProductFill.tsx:95` | `POST ?action=ai-describe` | fill product from photos (Gemini) | admin | button | 2 r (+1 w when the model changes, `admin-config.js:593`) |
| `src/lib/dataStore.ts:99,115` | `POST ?action=cloudinary-sign {folder}` | signature for a direct browser upload | admin | every image upload (`AdminProductForm.tsx:271`, `kidsToysShared.tsx:284`, `AdminLooks.tsx:722`, `AdminCategories.tsx:95`, `AdminBanners.tsx:102`, `AdminHero.tsx:118`, `AdminDealOfTheDay.tsx:111`) | 1 r |
| `src/components/admin/AdminReels.tsx:55` | `POST ?action=cloudinary-sign {folder:'reels'}` | signature for video/poster upload (XHR with progress, `:68-82`) | admin | reel upload | 1 r |
| `src/lib/dataStore.ts:99,135` | `POST ?action=cloudinary-delete {urls}` | permanently delete Cloudinary assets (≤50) | admin | product/category/banner/hero/deal/look/reel cleanup (many call sites, e.g. `ProductContext.tsx:458`, `AdminProductForm.tsx:322,335,473`, `AdminReels.tsx:231,270,323,341`) | 1 r |

### 3.2 `/api/orders` (`ordersApi`, bearer token)

| file:line | Action | Purpose | Who | When | Server cost |
|---|---|---|---|---|---|
| `src/context/ShopContext.tsx:970` | `check-coupon` | validate a typed coupon code | anyone | coupon apply | 1 r (`storeSettings`) + **K r** (`findCoupon` reads the whole collection, `api/_lib/orders.js:155`); no rate limit (`api/orders.js:315-333`) |
| `src/components/CheckoutPage.tsx:595` | `gateways` | which gateways to show | anyone | entering the payment step | 0–1 r (20 s per-instance cache, `api/_lib/payu.js:26-36`) |
| `src/components/CheckoutPage.tsx:686` | `create` | re-price cart, create order + Razorpay order / PayU fields | anyone | "Pay" | see §4(d) |
| `src/components/CheckoutPage.tsx:744`, `src/lib/payments.ts:91` | `verify` | verify Razorpay signature, finalise the order | anyone | Razorpay success handler | see §4(d) |
| `src/components/CheckoutPage.tsx:610` | `payment-result {orderNumber, token}` | result after the PayU redirect | anyone with the signed link | checkout mount with `?payment=` (`:630-645`) | 1 r + 1 w (rate limit) + 1 r order (+ finalise if paid) |
| `src/components/PendingPayment.tsx:47` | `payment-result {orderNumber}` | "check my payment" | signed-in customer | button in My Account | same |
| `src/lib/payments.ts:68` | `pay-again` | pay an unpaid order | signed-in customer | button | 1 r + 1 w (rate limit) + 1 r order + 0–1 r gateways + 1 w |
| `src/context/ShopContext.tsx:672` | `my-orders` | own orders | signed-in customer | app mount and on every auth-state event (`:687-689`), My Account mount (`AccountPage.tsx:617`) | **Oc r** each time (`api/orders.js:554`) |
| `src/components/TrackOrderPage.tsx:60`, `src/components/OrderConfirmationPage.tsx:65` | `track {orderNumber, contact}` | guest order lookup; confirmation page after a refresh | anyone | form submit; confirmation reload | 1 r + 1 w (rate limit) + 1 r |
| `src/components/AccountPage.tsx:136` | `request-cancel` | cancellation request | signed-in customer | button | ≈3 r + 3 w, 1 store email |
| `src/components/ReturnRequestForm.tsx:167` | `return-photo-sign` | signature for a return photo (then XHR to Cloudinary, `:175`) | signed-in customer | per photo | 3 r + 3 w (two rate limits, order read, `return_photos` create; `api/orders.js:565-586`) |
| `src/components/ReturnRequestForm.tsx:268` | `return-request` | return / exchange request | signed-in customer | submit | ≈4+ r, 3+ w, 1 store email (`api/orders.js:590-658`) |
| `src/context/AdminContext.tsx:1234,1242`, `src/components/admin/AdminOrderDetails.tsx:237` | `admin-update` | status, tracking, notes, payment status, keep-order | admin | Orders / order details | 1–2 r + 1 w (+ product reads/writes on stock restore or manual "Paid"), optional customer email + 1 w email log |
| `src/components/admin/AdminOrderDetails.tsx:271`, `src/components/admin/AdminReturns.tsx:173` | `admin-return` | approve / reject / received / refunded / exchanged | admin | Returns | 1 r + 1 w, optional email |
| `src/components/admin/AdminSettings.tsx:954` | `admin-test-email` | send a test email through Brevo | admin | button | 0 |

Server actions that exist but have **no caller in `src/`**: `quote` (`api/orders.js:310-313`) and
`admin-email-events` (`api/orders.js:701-716`).

### 3.3 Other endpoints

| file:line | Endpoint / action | Purpose | Who | When | Server cost |
|---|---|---|---|---|---|
| `src/components/LoginPage.tsx:60` | `POST /api/customer-auth {action:'send', email, purpose, name}` | email a 6-digit code | anonymous | login / signup | 2 r + 2 w (`rate_limits/otp_ip:*`, `customer_email_otps/*`), 1 Brevo email (`api/customer-auth.js:28-90`) |
| `src/components/LoginPage.tsx:118` | `POST /api/customer-auth {action:'verify', ...}` | check the code, upsert customer + profile, return a custom token | anonymous | code entry | 3 r + 3 w (`customer-auth.js:92-151`) |
| `src/utils/googleSignIn.ts:66` | `POST /api/customer-auth {action:'google', idToken}` | Google sign-in | anonymous | Google button / One Tap | 2 r + 2 w, plus a Firebase Auth `deleteUser` (`customer-auth.js:164-186`) |
| `src/utils/visitorTracker.ts:293` | `POST /api/track {event:'visit'|'add_to_cart'|'checkout_initiated', visitorId, path, device, UTM}` (`keepalive`) | visitor counting | anonymous | `visit`: first page of a session (new day or 30 min idle, `:328-334`), called from `LiveVisitorTracker.tsx:14,21` and `ShopContext.tsx:640`; `add_to_cart`: first add of the day (`ShopContext.tsx:801,840,883`); `checkout_initiated`: only on "Buy now" (`ShopContext.tsx:884`), once a day | visit: up to 5 r + 6 w; funnel: 2 r + 3 w (`api/track.js:35-48,118-196`) |
| `src/utils/visitorTracker.ts:378` | `POST /api/track {event:'product_view'|'wishlist_add'|'search'|'reel_view'|'reel_click'|'feature_use', ...}` | item counters | anonymous | once per browser session per item (`:372-376`); call sites `ProductDetailPage.tsx:89`, `ShopContext.tsx:950`, `ShopPage.tsx:227`, `SmartAssistant.tsx:44`, `AuraReels.tsx:230,444,456`, `BuildYourLook.tsx:156`, `CompleteTheLook.tsx:113`, `FindThisLook.tsx:151`, `OrderConfirmationPage.tsx:308` | up to 4 r + 3–4 w (`api/track.js:74-109`) |
| `src/components/ProductReviews.tsx:327` | `POST /api/reviews {action:'submit'}` | new / updated review (pending) | anyone; photo needs sign-in | submit | ≥3 r + 2 w; signed-in adds up to 300 order reads for the verified-purchase check (`api/reviews.js:128-130`) |
| `src/components/ProductReviews.tsx:224` | `POST /api/reviews {action:'helpful'}` | helpful vote | anyone | click | 3 r + 3 w (`api/reviews.js:239-258`) |
| `src/components/ProductReviews.tsx:296` | `POST /api/reviews {action:'photo-sign'}` → direct upload to Cloudinary (`:304`) | review photo | signed-in customer | photo pick | ≈2 r + 2 w |
| `src/components/admin/AdminReviews.tsx:138` | `POST /api/reviews {action:'remove-photos'}` | delete a removed review's photo | admin | after delete | 1 r + query |
| `src/components/ProductDetailPage.tsx:295` | `POST /api/alerts {action:'restock-subscribe'}` | back-in-stock email signup | anonymous | button | 2 r + 1–2 w (`api/alerts.js:114-131`) |
| `src/components/SharedWishlist.tsx:74` | `POST /api/alerts {action:'share-wishlist'}` | create a share link | anyone | button | n r + 1 w |
| `src/components/SharedWishlist.tsx:19` | `GET /api/alerts?wishlist=<id>` | open a shared wishlist | anonymous | shared-link page load | 1 r |
| `src/context/ProductContext.tsx:11` | `POST /api/alerts {action:'check-product'}` | send price-drop / back-in-stock emails | admin | after a price / stock / visibility change | 2 r + 1 w, **plus up to 5000 profile reads** for the price-drop scan (`api/alerts.js:50`) and up to 1000 `stock_alerts` reads (`:76`) |

### 3.4 Third-party calls made straight from the browser (unchanged by the migration, listed for completeness)

| file:line | Host | Purpose |
|---|---|---|
| `src/lib/dataStore.ts:122`, `src/components/admin/AdminReels.tsx:70`, `src/components/ProductReviews.tsx:304`, `src/components/ReturnRequestForm.tsx:175` | `api.cloudinary.com` | signed direct uploads (the cloud name comes from the signing endpoint, so the new Cloudinary account needs no client change for uploads) |
| `src/components/CheckoutPage.tsx:358`, `src/components/AccountPage.tsx:685`, `src/lib/addressBook.ts:348`, `src/components/DeliveryCheck.tsx:26` | `api.postalpincode.in` | PIN code lookup |
| `src/components/CheckoutPage.tsx:409`, `src/lib/addressBook.ts:294` | `nominatim.openstreetmap.org` | reverse geocoding / place search |
| `src/lib/payments.ts` (`loadRazorpaySDK`), `src/components/CheckoutPage.tsx:648,729` | Razorpay Checkout | payment window |
| `src/utils/googleSignIn.ts:16` | `accounts.google.com` | Google Identity Services |
| `src/lib/firebase.ts:39-46` | Google Analytics (Firebase Analytics) | page analytics; goes away with Firebase unless replaced |

---

## 4. Network walkthroughs with Firestore cost

Assumptions: production host, a normal shopper (`readsLive()` false), catalogue request succeeds.

### (a) New anonymous visitor opens the home page

1. `GET /` and static assets (Vercel CDN). No Firestore.
2. Firebase SDK initialises three things: default app, `sag-admin` app, Analytics (`firebase.ts:7-46`). Auth restores
   no user. **No Firestore connection is opened** because nothing calls a listener.
3. `GET /api/admin-config?action=catalog&v=<bucket>` — one request (`catalog.ts:72`) feeding: products
   (`ProductContext.tsx:322-326`), coupons (`ShopContext.tsx:271`), store settings and combo offer
   (`ShopContext.tsx:1080-1081,1099-1100`), categories (`AdminContext.tsx:909-914`), approved reviews
   (`AdminContext.tsx:930-935`), homepage sections / hero / banners / deal / Instagram reels / payment settings
   (`AdminContext.tsx:749,756-786`), discovery (`discovery.ts:83-87`), Aura reels (`reels.ts:92-97`).
4. `POST /api/track` `visit` — `LiveVisitorTracker.tsx:14` and `ShopContext.tsx:640` both call `recordHeartbeat`; the
   localStorage date + last-activity check lets only the first through (`visitorTracker.ts:329-334`).
5. Optional: Google One Tap script (if `VITE_GOOGLE_LOGIN` and `features.googleOneTap`), images from Cloudinary.
6. Every 60 s: `touchActivity()` writes localStorage only (`LiveVisitorTracker.tsx:20`) — no network.

| | Browser | Server |
|---|---|---|
| Reads | 0 | catalogue: 0 on a CDN hit, S+P+C+Ra+K on a miss; track: 1 (`daily_analytics` budget check, cached 60 s per instance, `track.js:36-42`) + 4 (transaction `getAll`, `track.js:134`) |
| Writes | 0 | 6 for a first visit: session marker, per-IP counter, daily dedup, `daily_analytics`, `analytics_totals` (`track.js:143-159`) + `visitor_sessions` set (`track.js:171-190`) |

Per new visitor: **about 5 reads and 6 writes**, plus the amortised catalogue. With the free-tier limit of 20,000
writes/day this is why `TRACK_WRITE_BUDGET` (default 8000, `track.js:31`) exists: roughly 1,300 new visits/day use the
whole tracking budget.

### (b) Opens a product page

In-app navigation does not refetch the catalogue (the promise is per page load). A direct landing on `/product/:id`
repeats steps (a)1–4 first.

1. `getDoc(product_daily/{day}_{id})` (`ProductDetailPage.tsx:65`) — this is the first direct Firestore call, so the
   Firestore channel (WebChannel / long polling, `firebase.ts:15-19`) is opened here.
2. `onSnapshot(reviews where productId == id and status == approved)` (`ProductReviews.tsx:180-184`) — stays open
   until the shopper leaves the product.
3. `POST /api/track` `product_view` (`ProductDetailPage.tsx:89`), once per browser session per product.
4. `DeliveryCheck` and `CompleteTheLook` use catalogue settings (no Firestore). A PIN check calls
   `api.postalpincode.in`.

| | Browser | Server |
|---|---|---|
| Reads | 1 + max(1, Rp) | 1 (budget check, often cached) + 1 (`products/{id}` existence, `track.js:82`) + 2 (transaction, `track.js:86`) |
| Writes | 0 | 4: dedup, per-IP counter, `product_daily`, `daily_analytics` (`track.js:88-99`) |

Per product view: **about 5–6 reads and 4 writes**. Items 1 and 2 are the only reads an anonymous shopper sends to
Firestore directly, and they happen on the most-viewed page; they bypass the CDN catalogue completely.

### (c) Adds to bag and reaches checkout

1. Add to bag: local state + localStorage + BroadcastChannel (`ShopContext.tsx:484-503`). First add of the day:
   `POST /api/track` `add_to_cart` → 2 r + 3 w (dedup, `daily_analytics`, `visitor_sessions` update;
   `track.js:123-128,193`).
2. Signed-in only: `profiles/{email}` cart write 400 ms after each change (W1) — 1 w per change.
3. Cart page / drawer: no network. Applying a coupon: `ordersApi('check-coupon')` → 1 + K reads.
4. "Buy now" path additionally sends `checkout_initiated` → 2 r + 3 w (the normal bag → checkout path does not track
   it; `ShopContext.tsx:884` is the only call site).
5. Checkout page mount: Razorpay SDK script (`CheckoutPage.tsx:648`). Signed-in: `AddressBook` → 1 profile read once
   per session (A21).
6. Typing contact details: `abandoned_checkouts/{sessionId}` merge write 1 s after each change to first name, last
   name, mobile, email, and on blur (W7). Typically **4–8 browser writes per checkout**, each carrying the whole cart.
7. PIN code: `api.postalpincode.in`. "Use my location": `nominatim.openstreetmap.org`.
8. Payment step: `ordersApi('gateways')` → 0–1 read.

| | Browser | Server |
|---|---|---|
| Reads | 0 (guest) / 1 (signed-in) | 2–3 (track) + 0–1 (gateways) + 1 + K if a coupon is tried |
| Writes | 4–8 (`abandoned_checkouts`) + 1 per cart change if signed in | 3 (track) |

### (d) Pays

Razorpay path (default):

1. If "save address" is ticked and signed in: 1 profile write (W3).
2. `ordersApi('create')` (`api/orders.js:340-450`):
   - rate limit transaction: 1 r + 1 w (`:345`, `:292-306`)
   - `priceCart`: n product reads (`_lib/orders.js:303`); accessories only: 1 r `lookRelations` + up to 60 product
     reads (`:254-258`); pricing rules: 2 r (`storeSettings`, `comboOffer`, `:52`); with a coupon: K r (`:155`) + up to
     2 × perUserLimit order reads (`:194-198`)
   - gateways: 0–1 r
   - earlier attempt lookup by `attemptKey`: 1 r (`orders.js:348`)
   - order-number clash check: 1 r (`:388`); Razorpay "create order" API call
   - `orderRef.create`: 1 w (`:442`)
3. Razorpay window (third party). On success → `ordersApi('verify')` (`orders.js:506-522`):
   - gateways 0–1 r; `finalizePaidOrder` transaction: 1 r order + n r products + 0–1 r coupon; writes n products
     (stock) + 0–1 coupon (`usageCount`) + 1 order + 1 `daily_analytics` (`_lib/orders.js:406-464`)
   - confirmation email (Brevo) + 1 w email log (`orders.js:164-169`)
   - store alert email: 1 r `storeSettings` (`_lib/orders.js:29-33`)
4. Razorpay webhook (`api/webhooks/razorpay.js`) arrives independently: 0–1 r (order lookup by `razorpayOrderId`,
   `:62`) + 1 r (transaction sees the order already paid). If the browser never came back, the webhook does the whole
   finalisation instead.
5. Confirmation page: no call unless the page is reloaded (`track`, 2 r + 1 w).

Two-product order, no coupon:

| | Browser | Server |
|---|---|---|
| Reads | 0 | create ≈ 1 + 2 + 2 + 1 + 1 (+0–1) = **7–8**; verify ≈ 3 + 1 (+0–1) = **4–5**; webhook **1–2** → about **13–15** |
| Writes | 0–1 | create 2; verify 2 + 1 + 1 + 1 = 5 → **7** |

With a coupon add K + up to 2 × limit reads and 1 write.

PayU path: `create` returns form fields; the browser posts a form to PayU; PayU posts back to `/api/payu`, which
verifies the hash and redirects to `/checkout?payment=…&order=…&t=…` (`api/payu.js:35-62`). That is a **full page
load** (catalogue request again), then `ordersApi('payment-result')` (`CheckoutPage.tsx:630-645`): 1 r + 1 w rate
limit + 1 r order (+ finalisation if it was not done by the callback).

### (e) Signed-in customer opens My Account

On every page load for a signed-in customer (before My Account is even opened):

- `profiles/{email}` read by `pullCartFromDb` and `pullWishlistFromDb`, triggered three ways — provider mount, the
  ShopContext `onAuthStateChanged`, and the `sag-auth-state-change` event fired by `AuthContext.tsx:69`
  (`ShopContext.tsx:590-612`). Mount usually finds no user yet, so the usual cost is **4 reads of the same document**
  (2 triggers × cart + wishlist). Exact count depends on timing — unverified.
- 0–2 profile writes if the merged cart / wishlist differs from the saved one (`ShopContext.tsx:402,476`).
- `my-orders` on mount and on the auth event (`ShopContext.tsx:687-689`): **Oc reads each**, normally once (mount
  runs before the session is restored and takes the guest branch, `:670-684`).
- Home page: `useStylePrefs` → 1 more profile read (A22).
- Each time the tab becomes visible again: 1 profile read (`ShopContext.tsx:570`).

Opening My Account adds:

- `my-orders` again (`AccountPage.tsx:617`): Oc reads.
- `profiles/{email}`: 1 read (A20), which also primes style prefs and the address book.
- Possibly 1 write if the old single address is migrated into the address book (`addressBook.ts:232`).

| | Browser | Server |
|---|---|---|
| Reads | ≈4–5 profile reads at load + 1 on My Account | Oc at load + Oc on My Account |
| Writes | 0–3 | 0 |

Actions from My Account: profile save 1 w; address change 1 w each; style save 1 w; cancel request ≈3 r + 3 w;
return photo 3 r + 3 w each; return request ≈4+ r + 3+ w; check payment 2–3 r + 1 w; pay again 2–3 r + 2 w then
`verify`.

### (f) Admin opens the dashboard, and each admin page

Baseline — runs on **every** page load in the admin's browser, on any admin tab, and also on storefront pages once the
admin has signed in there (`sag_admin_live` flag + persisted `sag-admin` Firebase session):

| Source | Cost |
|---|---|
| `GET ?action=session` + `GET ?action=security` (`AdminContext.tsx:556,582`) | 2 server reads; repeated on window focus, `storage`, `popstate` and every 5 minutes |
| `GET /api/admin-config` settings (`AdminContext.tsx:751`) | S server reads; repeated after every settings change |
| A1 products listener | P |
| A2 categories listener | C |
| A3 `storefront_settings` listener | S |
| A4 reviews listener (all) | R |
| A5 orders listener (all) | **O** |
| A6 coupons listener | K |
| A9 coupons `listDocs` (ShopContext, live reader) | K |
| A7 inventory setting | 1 |
| A8 leads listener | L |
| A10, A11, A12 single-setting listeners | 3 |
| Hero auto-sync (`AdminContext.tsx:1014-1071`) | 0–1 server write whenever a slide's product changed |

**Baseline ≈ P + C + 2S + R + O + 2K + L + 6 reads per admin page load**, and it grows without bound with order
history. A phone that reopens the admin tab after more than 30 minutes pays it again. While the tab is open, every
order, product stock change (each paid order changes n products) and review change costs one more read per changed
document.

Per admin page, on top of the baseline:

| Admin page | Extra Firestore reads | Extra API calls / writes |
|---|---|---|
| Dashboard | 1 (`analytics_totals`) + ≤15 (`daily_analytics`) + ≤100 (`visitor_sessions`) + all `search_terms` and `product_daily` rows of the last 7 days (A23–A27); while open, +1–2 per tracked visitor event | none |
| Products | none (uses A1) | product save: 1 w + 1 w stock log + `check-product` (which can read up to 5000 profiles); image upload: 1 server read per image; AI fill: `ai-assistant`, `ai-describe` |
| Products → History | ≤100, or ≤300 for one product (A29) | none |
| Kids / Toys | none | same as Products |
| Categories | none | 1 w per save, image sign / delete |
| Orders | none (uses A5) | `admin-update` per change; delete = 1 w |
| Order details | 1 + 1 per change (A30) | `admin-update`, `admin-return` |
| Returns | none (uses A5; a 60 s timer only re-renders, `AdminReturns.tsx:80`) | `admin-return` |
| Customers | U (A28) | none |
| Leads | none (uses A8) | 1 w per mark / delete |
| Coupons | none (uses A6) | 1 w per save |
| Homepage, Hero, Banners, Deal of the day, Instagram | none | `PUT settings` → 1 server read + 1 w, which fires A3 → another `GET` settings (S reads) |
| Combo offers | 1 (A32) | `PUT settings` |
| Discovery | 1 (A33) | `PUT settings` |
| Reels | 1 (A36) | video sign + Cloudinary upload, `PUT settings` |
| Looks | 2 (A34, A35) | image sign, `PUT settings` |
| Payments | none in the browser | `payment-gateways` (2 server reads), optional `razorpay-payments`, `PUT paymentGateways`, `PUT settings.paymentSettings` |
| Reviews | R again (A31) | 1 w per moderation + 1 w product rating (W22); delete → `remove-photos` |
| Settings | none | `PUT settings.storeSettings`, `PUT securityConfig`, `admin_settings/inventory` 1 w, `admin-test-email` |

Admin login itself: `POST ?action=login` (2 r + 1 w) + `GET ?action=security` (1 r), then the whole baseline starts.

---

## 5. Findings that matter for the migration

1. **The admin's browser is the largest single reader.** Whole-collection listeners on `orders`, `products`,
   `reviews`, `coupons`, `leads`, `categories`, `storefront_settings` start on every page load in that browser
   (§4f), `orders` is unbounded, and the baseline is paid again after every long pause. In D1 this becomes paginated
   `SELECT`s; the dashboard must not load all orders to draw a list.
2. **Two direct Firestore reads per product view by anonymous shoppers** (A16, A17) are outside the CDN catalogue.
   Both can be served from the catalogue / a cached per-product endpoint.
3. **Visitor tracking is the largest writer**: about 6 writes per new visit and 4 per product view, all on the
   server. On D1 the same design (dedup rows + counters) must be collapsed to one or two statements per event, or
   moved to Workers Analytics Engine, otherwise it will eat the D1 daily write allowance the same way.
4. **`abandoned_checkouts` is written by anonymous browsers and read by nothing** (W7). It stores names, phones,
   emails and addresses of people who did not order, under a rule that lets anyone create or update any document.
   Decide with the owner whether to keep the feature; if kept, it needs a server endpoint with rate limiting and an
   admin view. The existing documents still have to be carried over ("nothing deleted").
5. **`leads` are created by anonymous browsers with no rate limit** (W8, W9) — only field-shape rules. Needs a
   server endpoint.
6. **Profile document is a hot spot**: cart, wishlist (full product objects), addresses, style prefs and profile
   fields all live in `profiles/{email}`, read 4–5 times per page load and written on every cart / wishlist change.
   The wishlist stores whole product objects (`ShopContext.tsx:424-427`), so it goes stale; store ids in D1.
7. **Real-time is used but not needed for shoppers.** Shoppers already live with a 5-minute-old catalogue. The only
   places that rely on push are the admin panel (new orders appearing, settings changes from another device) and the
   product reviews list. Polling or refetch-on-focus is enough; D1 has no listeners.
8. **Admin authorisation is split in two** (cookie for `/api/admin-config`, Firebase token + rules for everything
   else). `apiPost` picks the token by URL path (`api.ts:16-17`). With Better Auth this should become one admin
   session mechanism for all routes; keep the admin cookie scoped away from the customer session so signing in as
   one never signs out the other (today's reason for the separate `sag-admin` app, `firebase.ts:26-27`).
9. **Business logic that lives only in the browser** and must move server-side: product rating recomputation
   (W22), stock history logging (W13), coupon duplicate-code check (`AdminContext.tsx:1309,1318`), cart merge rules
   on sign-in (`ShopContext.tsx:360-406`), hero slide auto-sync (`AdminContext.tsx:1014-1071`), the paid-order
   delete guard (`AdminContext.tsx:1291-1293`), and product field normalisation (`ProductContext.tsx:154-201`).
10. **Catalogue cache period mismatch**: server says 600 s, client busts every 300 s (§1.4). On Cloudflare pick one
    (Cache API or KV with an explicit purge when the admin saves) so admin changes can show immediately and the
    database is read only when something changed.
11. **Coupon lookup reads the whole `coupons` collection on every check** (`_lib/orders.js:155`) and `check-coupon`
    has no rate limit. In D1: unique index on upper-cased code.
12. **`check-product` scans up to 5000 profiles** on each admin price change (`api/alerts.js:50`) — trivial in SQL
    with a wishlist table, expensive today.
13. **localStorage is part of the data model.** Keys that hold server-derived data and must keep working (or be
    migrated) on the same domain: `sag_catalog_saved_v1`, `sag_custom_products_v1`, `sag_cart_v1`, `sag_cart_backup`,
    `sag_cart_owner`, `sag_wishlist_v1`, `sag_wishlist_owner`, `sag_orders_v1`, `sag_guest_orders`, `sag_custom_user`,
    `sag_user_profile_<email>`, `sag_unique_visitor_id`, `sag_admin_live`, and the settings mirrors
    (`sag_homepage_sections_local`, `sag_hero_config_local`, `sag_store_settings_local`, `sag_banners_local`,
    `sag_deal_of_the_day`, `sag_instagram_reels`, `sag_payment_settings_local`). Because the domain stays the same,
    existing guest carts and wishlists survive the switch as long as the key names and shapes are kept.
14. **Existing customer sessions cannot be carried over.** They are Firebase Auth sessions in IndexedDB; after the
    switch every signed-in customer and the admin will have to sign in once more (same email code / Google).
    `AuthContext` clears `sag_custom_user` when no Firebase user is found (`AuthContext.tsx:74-78`); the new auth
    client must not wipe guest cart / wishlist keys in that path.
15. Dead or unused code to leave behind rather than port: `listDocsWhere` (no caller), `addOrder` (W16), server
    actions `quote` and `admin-email-events` (no caller), `COLLECTIONS.heroSlides` (`dataStore.ts:28`, no reader or
    writer found in `src/`), unused Firestore imports in `ProductDetailPage.tsx:2`.

---

## 6. API the new backend must provide

Everything in §2 must be replaced; everything in §3 must be re-implemented on the Worker. Names are suggestions;
"replaces" points back to the inventory. Existing response shapes should be kept so the React code changes as little
as possible.

### 6.1 Public (no session)

| Function | Replaces | Notes |
|---|---|---|
| `getCatalog()` → `{settings, products, categories, reviews, coupons, generatedAt}` | `catalog` action; fallbacks A1, A2, A9–A15 | visible products only; public review and coupon fields only (`admin-config.js:469-480`); edge-cached and purged on admin writes |
| `getPublicSettings()` | `GET /api/admin-config` | can be folded into `getCatalog` for shoppers |
| `getProductReviews(productId)` → approved reviews with `helpfulCount` | A17 | or include `helpfulCount` in the catalogue (it already is, `admin-config.js:474`) and drop the live query |
| `getProductDayStats(productId)` → `{views, wishlists}` for today | A16 | cacheable for a few minutes |
| `trackEvent({event, visitorId, path, …})` | `/api/track` visit / funnel / item events | keep the dedup and per-IP caps; minimise writes |
| `subscribeNewsletter({email})` | W8 | add rate limit |
| `submitContactForm({name, email, phone, message, orderNumber})` | W9 | add rate limit |
| `saveCheckoutProgress({sessionId, contact, cart, address, utm})` | W7 | only if the owner keeps the feature; rate limit; no client-chosen overwrite of other sessions |
| `validateCoupon({code, subtotal})` | `check-coupon` | add rate limit |
| `getAvailableGateways()` | `gateways` | |
| `createOrder({gateway, attemptKey, items, couponCode, address, giftNote})` | `create` | guest checkout stays possible |
| `verifyRazorpayPayment({orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature})` | `verify` | |
| `getPaymentResult({orderNumber, token})` | `payment-result` (signed link) | |
| `trackOrder({orderNumber, contact})` | `track` | short view for guests |
| `submitReview({productId, rating, userName, comment, photoUrl?})` | `reviews submit` | guest allowed without a photo |
| `voteReviewHelpful({reviewId})` | `reviews helpful` | |
| `subscribeRestock({productId, size, colour, email})` | `alerts restock-subscribe` | |
| `createSharedWishlist({productIds})` / `getSharedWishlist(id)` | `alerts share-wishlist`, `GET ?wishlist=` | |
| `POST /api/payu` (callback + `?webhook=1`), `POST /api/webhooks/razorpay`, `GET /sitemap.xml` | same URLs | **URLs must not change** — they are registered with PayU and Razorpay (`admin-config.js:40-45`) and rewritten in `vercel.json` |
| Auth: send email code, verify email code, Google sign-in, sign-out, get session | `/api/customer-auth` send / verify / google; `signInWithCustomToken`; `onAuthStateChanged` | Better Auth email-OTP + Google. Keep the limits in `customer-auth.js:7-12`. The client needs a `useSession`-style source of `{email, name, phone}` to replace `AuthContext` |

### 6.2 Customer (signed-in, scoped to the session's email)

| Function | Replaces | Notes |
|---|---|---|
| `getMyProfile()` → profile fields, addresses, stylePrefs, cart, wishlist | A18–A22 | one call per page load instead of 4–5 reads |
| `updateMyProfile({fullName, phone, houseFlat, street, area, city, state, pincode, …})` | W3, W4 | |
| `getMyCart()` / `putMyCart(items)` | A18, W1 | server should apply the sign-in merge rule or the client keeps doing it; debounce stays |
| `getMyWishlist()` / `putMyWishlist(productIds)` | A19, W2 | store ids, not product objects |
| `getMyAddresses()` / `putMyAddresses(list)` | A21, W5 | |
| `getMyStylePrefs()` / `putMyStylePrefs(prefs)` | A22, W6 | |
| `listMyOrders()` | `my-orders` | owner view (no internal notes) |
| `getMyOrder(orderNumber)` | `track` as owner | includes return eligibility |
| `getMyPaymentResult(orderNumber)` | `payment-result` without a token | |
| `payAgain(orderNumber, gateway?)` | `pay-again` | |
| `requestCancellation({orderNumber, reason})` | `request-cancel` | |
| `signReturnPhotoUpload({orderNumber})` | `return-photo-sign` | new Cloudinary account |
| `requestReturn({orderNumber, type, items, reason, details, photos})` | `return-request` | |
| `signReviewPhotoUpload()` | `reviews photo-sign` | |
| (signed-in variants of `createOrder`, `submitReview`) | | per-customer coupon limit and verified-purchase flag depend on the session |

### 6.3 Admin (admin session; one mechanism for every route)

| Function | Replaces | Notes |
|---|---|---|
| `adminLogin({username, password, pin, remember})`, `adminSession()`, `adminLogout()` | `login`, `session`, `logout`; `signInAdminToFirebase` | keep the env-credential fallback idea only if still needed; no Firebase token any more |
| `getSecurityConfig()` / `updateSecurityConfig()` / sign out everywhere | `security`, `PUT securityConfig` | |
| `listProducts({includeHidden})`, `createProduct`, `updateProduct(id, patch, reason)`, `deleteProduct`, `duplicateProduct`, `adjustStock(id, delta, reason)` | A1, A37, W10–W14 | server writes the stock-history row and runs the alert check in the same request |
| `listStockHistory({productId?, limit})` | A29 | |
| `listCategories`, `createCategory`, `updateCategory`, `deleteCategory` | A2, W15 | |
| `listOrders({status?, from?, cursor, limit})`, `getOrder(orderNumber)` | A5, A30 | paginated; full admin view incl. cancel / return requests |
| `updateOrder({orderNumber, status, tracking…, notes, customerNote, paymentStatus, notify, cancelRequestHandled})` | `admin-update` | |
| `handleReturn({orderNumber, returnAction, note, notify})` | `admin-return` | |
| `deleteOrder(orderNumber)` | W17 | enforce the "paid orders cannot be deleted" rule on the server; consider soft delete |
| `listCoupons`, `createCoupon`, `updateCoupon`, `deleteCoupon` | A6, W18 | unique code enforced in SQL |
| `listReviews({status?})`, `createReview`, `updateReview`, `setReviewStatus`, `replyToReview`, `deleteReview` | A4, A31, W19–W22 | rating recalculation and photo cleanup on the server (`remove-photos` folds in) |
| `listCustomers({cursor, limit})` | A28 | |
| `listLeads`, `markLeadOfferSent`, `deleteLead` | A8, W24, W25 | |
| `getSettings()`, `putSetting(key, value)` for `homepageSections, heroConfig, storeSettings, banners, dealOfTheDay, paymentSettings, instagramReels, comboOffer, discovery, auraReels, lookRelations` | A3, A32–A36, `PUT settings` | keep the sanitizers in `admin-config.js:74-174`; purge the catalogue cache on write |
| `getAdminInventorySettings()` / `setLowStockThreshold(n)` | A7, W23 | |
| `getPaymentGateways()` / `putPaymentGateways()` / `listRazorpayPayments()` | `payment-gateways`, `PUT paymentGateways`, `razorpay-payments` | secrets masked on read |
| `getAiAssistantStatus()` / `putAiAssistantKey()` / `describeProductFromPhotos()` | `ai-assistant`, `PUT aiAssistant`, `ai-describe` | |
| `signImageUpload({folder})` / `deleteImages({urls})` | `cloudinary-sign`, `cloudinary-delete` | folders: `product-images, banners, hero, deals, categories, reels` (`dataStore.ts:96`, `AdminReels.tsx:57`) |
| `getDashboard()` → lifetime totals, last 15 daily rows, last 100 visitor sessions, top search terms (7 days), product views / wishlists (7 days) | A23–A27 | one aggregated query instead of five listeners |
| `checkProductAlerts(productId)` | `alerts check-product` | better: run inside `updateProduct` / `adjustStock` |
| `sendTestEmail({email})` | `admin-test-email` | |
| A cheap "what changed since T" poll (new orders count, settings version) | the push behaviour of A3, A5, A8 | replaces listeners; poll on focus and every 30–60 s while the admin tab is visible |

---

## 7. Open questions

1. Real document counts (P, O, R, U, L, K) — needed to turn the formulas in §4 into numbers; take them from the
   Firestore export in `migration/data/export-2026-10-01T18-15-19` (folder exists; contents not inspected here).
2. `abandoned_checkouts`: keep the feature (with an admin view) or stop collecting? Either way the existing documents
   are exported.
3. Does the admin need orders to appear without refreshing? If yes, polling interval to agree (suggest 30–60 s while
   visible).
4. Firebase Analytics (`firebase.ts:39-46`) disappears with the Firebase SDK. Is anyone using those reports, or is the
   built-in visitor dashboard enough?
5. Is `VITE_GOOGLE_LOGIN` currently `1` in production? (Not readable from the code.) The Google OAuth client belongs
   to the old Firebase project; Better Auth needs a Google OAuth client with the same authorised origin, created under
   the new Google account.
6. Is the PayU gateway enabled in production today? (Stored in `private_settings/payment_gateways`, not readable
   offline.) It decides how much testing the redirect flow needs.
7. Exact count of profile reads at page load for a signed-in customer (§4e) depends on event ordering and was not
   measured.
