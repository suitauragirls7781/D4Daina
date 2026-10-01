# 01 — Data model: Firestore today, D1 tomorrow

Scope: every Firestore collection the code reads or writes, who touches it, and a proposed relational schema for Cloudflare D1 (SQLite) with Drizzle.

Sources: the code in this repository (cited as `path:line`) and the local export in `migration/data/export-2026-10-01T18-15-19/` (taken 2026-10-01 18:15 UTC through the browser SDK with the admin token). Row counts and "seen in N docs" figures come from that export. Nothing live was called to write this document.

Conventions used below:

- **Anon** = browser, not signed in. **Customer** = browser signed in with a Firebase custom token carrying the `customerEmail` claim (`api/_lib/firebaseAdmin.js:39-40`). **Admin** = browser signed in on the second Firebase app with the `admin` claim (`api/_lib/firebaseAdmin.js:30`, `src/lib/firebase.ts:28-36`). **Server** = Vercel function using the Admin SDK, which bypasses the rules.
- "Rule" refers to `firestore.rules`.
- Every write that goes through `saveDoc` / `patchDoc` adds `updatedAt` (ISO string) automatically (`src/lib/dataStore.ts:72`, `:77`).

---

## 1. Things to know before reading the tables

1. **No subcollections exist.** Every path in the code is `collection/doc` (grep of `collection(` / `doc(` across `api/` and `src/`).
2. **All application timestamps are ISO-8601 UTC strings**, not Firestore `Timestamp`s. The export contains zero `Timestamp` values. The only native timestamps are `rate_limits.*.expiresAt` (a JS `Date`; `api/orders.js:299`, `api/admin-config.js:523`, `api/customer-auth.js:35`, `api/reviews.js:112`), and that collection is not migrated.
3. **Nine collections are used by the server but are not named in `firestore.rules`.** They fall under the default deny (`firestore.rules:141-143`): `private_settings`, `analytics_dedup`, `review_photos`, `review_votes`, `return_photos`, `alert_state`, `alert_log`, `stock_alerts`, `shared_wishlists`.
4. **The existing export is incomplete.** `migration/scripts/export-firestore-client.cjs` lists 24 collections; five came back `permission-denied` (`admin_credentials`, `customer_email_otps`, `rate_limits`, `private_settings`, `analytics_dedup`) and seven are not in its list at all (`review_photos`, `review_votes`, `return_photos`, `alert_state`, `alert_log`, `stock_alerts`, `shared_wishlists`). All of these need an Admin SDK export once quota allows. See section 6 for which ones actually matter.
5. **Document ids are load-bearing.** Product ids are in public URLs (`/product/<id>`, `api/sitemap.js:76`), order numbers are the order document id and the Razorpay receipt (`api/orders.js:385-393`), profile and customer ids are the lowercase email. All ids must be carried over unchanged.
6. **Image URLs embed the old Cloudinary cloud name.** All 113 product image URLs in the export are `https://res.cloudinary.com/<old-cloud>/…`. Server validators for return photos and review photos only accept URLs on the cloud named in `CLOUDINARY_CLOUD_NAME` (`api/_lib/orders.js:747-754`, `api/reviews.js:53-61`). Moving to a new Cloudinary account therefore needs either an asset copy plus a URL rewrite across products, categories, settings blobs, order item snapshots, reviews and profiles, or validators that accept both cloud names.

---

## 2. Collections

### 2.1 `products` — 33 docs

**Id:** `p` + base36 timestamp + 6 random base36 chars, 15 chars (`src/context/ProductContext.tsx:375`, `src/lib/dataStore.ts:48-49`). All 33 exported ids match. The default deal product id in code is a UUID left from the Supabase era (`src/context/AdminContext.tsx:366`); no such id exists in the export.

**Fields** (writer shape: `mapProductToDb`, `src/context/ProductContext.tsx:154-201`; type: `src/types.ts:47-100`):

| Field | Type | Notes |
|---|---|---|
| `name` | string | required on create (`ProductContext.tsx:365`) |
| `sku` | string | auto `SAG-<6 digits>` when empty (`:161`); unique in the export but not enforced |
| `category` | string | free text matched by **name** against `categories.name`; default `Suits` (`:162`) |
| `subcategory` | string | |
| `image` | string | always `images[0]` (`:164`); redundant |
| `images` | string[] | Cloudinary URLs, max 6 seen |
| `price`, `originalPrice` | number | rupees; whole numbers in the export |
| `discount` | number | percent, stored not derived |
| `rating` | number | 1-decimal average of approved reviews (`api/reviews.js:140-146`, `AdminContext.tsx:1460-1466`) |
| `reviewCount` | number | count of approved reviews, same writers |
| `colors` | `{name, hex, imageUrl?}[]` | max 6 seen; legacy rows may hold plain strings (reader tolerates, `ProductContext.tsx:208-218`) |
| `sizes` | string[] | values from `ProductSize` (`src/types.ts:17-22`); empty means "one size" (`api/_lib/orders.js:315-318`) |
| `stockQuantity` | number | **one number per product, not per size** |
| `inStock` | boolean | `stockQuantity > 0` and not manually switched off |
| `description`, `fabric`, `fit`, `occasion`, `washCare` | string | |
| `isNewArrival`, `isBestSeller`, `isTrending`, `isFestive`, `isSale`, `isFeatured` | boolean | |
| `tags` | string[] | empty in all 33 docs |
| `videoUrl` | string | empty in all 33 docs |
| `hidden` | boolean | the one visibility switch the server reads (`api/_lib/orders.js:307`) |
| `status` | `'draft' \| 'published' \| 'archived'` | optional, in 14/33 docs; derived from `hidden` when absent (`ProductContext.tsx:123`) |
| `seoTitle`, `seoDescription`, `searchKeywords` | string | optional, 13/33 |
| `lowStockThreshold` | number | optional, 13/33; 0 = use store default |
| `productType` | `'outfit' \| 'accessory' \| 'kids' \| 'toy'` | optional, 30/33; absent = outfit (`:51`) |
| `accessoryType`, `setType`, `ageRange` | string | optional; only meaningful for accessory / outfit / toy respectively |
| `createdAt` | ISO string | set on create only (`:391`); used for newest-first sort (`:298-300`) |
| `updatedAt` | ISO string | |

`Product.reviews` in `src/types.ts:78` is never stored (0/33 docs).

**Access:** rule `firestore.rules:19-22` — public read, admin write.

| Who | What | Where |
|---|---|---|
| Anon / Customer | read via the cached catalogue API; live listener only as fallback | `api/admin-config.js:457-488`, `ProductContext.tsx:322-344` |
| Admin | live listener on the whole collection; create, partial update, delete | `ProductContext.tsx:327`, `:391`, `:422`, `:453` |
| Admin | stock +/- in a client-side transaction | `ProductContext.tsx:482-497` |
| Admin | `rating` / `reviewCount` after moderation | `AdminContext.tsx:1465` |
| Server | stock deduction on payment, restore on cancel/refund | `api/_lib/orders.js:441`, `:482` |
| Server | `rating` / `reviewCount` | `api/reviews.js:145` |
| Server | reads for pricing, sitemap, alerts, tracking | `api/_lib/orders.js:303`, `api/sitemap.js:51-53`, `api/alerts.js:35`, `api/track.js:82` |

### 2.2 `categories` — 3 docs

**Id:** `cat-` + `newDocId` (`AdminContext.tsx:1195`).

**Fields** (`AdminContext.tsx:837-843`): `name` (string, the join key to `products.category`), `title`, `image` (URL), `isActive` (boolean), `tagline`, `updatedAt`. `itemCount` in `src/types.ts:282` is derived in the browser and never stored (`AdminContext.tsx:633-646`).

**Access:** rule `:24-27` — public read, admin write. Admin CRUD at `AdminContext.tsx:1197-1207`; shoppers get it in the catalogue (`api/admin-config.js:462`, `:470`).

Data note: 28 of 33 products use a category name that has no `categories` document (10 distinct names in products, 3 category docs). A foreign key is therefore not possible.

### 2.3 `coupons` — 1 doc

**Id:** `coup-` + `newDocId` (`AdminContext.tsx:1310`).

**Fields** (`AdminContext.tsx:845-859`, `src/types.ts:287-306`): `code` (uppercased), `discountType` (`'percentage' | 'fixed'`), `discountValue`, `minOrderValue`, `maxDiscount` (number or null), `startDate` / `expiryDate` (`YYYY-MM-DD` strings), `usageLimit` (0 = none), `usageCount`, `isActive`, `perUserLimit?`, `allowedCategories?` (string[]), `allowedProductIds?` (string[]), `updatedAt`. `description` is read by the API (`api/orders.js:328`) but the admin mapper never writes it.

**Access:** rule `:35-38` — public read, admin write.

- Admin CRUD: `AdminContext.tsx:1312`, `:1321`, `:1326`. Code uniqueness is checked only in the admin's browser (`:1309`, `:1318`).
- Server: looks a code up by reading **the whole collection** (`api/_lib/orders.js:152-158`); increments `usageCount` with `FieldValue.increment(1)` inside the payment transaction (`:443`).
- Shoppers: active coupons arrive in the catalogue (`api/admin-config.js:477-480`); fallback is a direct list (`src/context/ShopContext.tsx:271`).

### 2.4 `reviews` — 7 docs

**Id, three schemes:**

- `rv_` + 32 hex: signed-in customer, HMAC of `email|productId` (`api/reviews.js:67-75`, `:201`). One review per customer per product; a second submission overwrites the first.
- Firestore auto-id: guest submission (`api/reviews.js:196`).
- `rev-` + `newDocId`: created by the admin (`AdminContext.tsx:1429`).

The HMAC key for `rv_` ids is the `private_key` inside `FIREBASE_SERVICE_ACCOUNT` (`api/reviews.js:68-74`). If the new stack uses a different key, a returning customer's next review of the same product gets a new id and becomes a second review instead of replacing the first.

**Fields** (`api/reviews.js:182-197`, `:217-223`; `AdminContext.tsx:1439-1445`):

| Field | Type | Notes |
|---|---|---|
| `productId` | string | admin-created reviews may hold `'0'` (`AdminContext.tsx:1441`); none in the export |
| `productName` | string | snapshot |
| `userName` | string | |
| `rating` | number 1–5 | |
| `comment` | string ≤1000 | line breaks kept |
| `status` | `'pending' \| 'approved' \| 'hidden'` | |
| `verifiedPurchase` | boolean | decided by the server from paid orders (`api/reviews.js:128-137`) |
| `date` | string | ISO from the API; admin-created ones may be `DD Mon YYYY` (`AdminContext.tsx:1431`) |
| `createdAt`, `updatedAt` | ISO string | |
| `source` | `'storefront'` | optional; absent on admin-created |
| `helpfulCount` | number | optional; `FieldValue.increment` (`api/reviews.js:258`) |
| `imageUrl`, `photoId` | string | optional; `photoId` is the Cloudinary public id |
| `sizePurchased` | string | optional |
| `adminReply` | string | optional (`AdminContext.tsx:1481`) |
| `location` | string | optional; admin-created only |
| `userEmail` | string | in the type (`src/types.ts:35`) but deliberately never stored (`api/reviews.js:9`); 0/7 docs |

**Access:** rule `:41-44` — read if admin or `status == 'approved'`; all writes admin only. Shoppers submit through `api/reviews.js`.

- Anon / Customer: live query per product page on `productId` + `status == 'approved'` (`src/components/ProductReviews.tsx:180-184`); approved list in the catalogue (`api/admin-config.js:463`, `:472-476`).
- Admin: two live listeners on the whole collection (`AdminContext.tsx:937-944`, `src/components/admin/AdminReviews.tsx:58`); create / edit / status / reply / delete (`AdminContext.tsx:1439`, `:1453`, `:1474`, `:1481`, `:1489`).
- Server: submit, helpful vote (`api/reviews.js:149-261`).

### 2.5 `review_photos` and `review_votes` — server only, not exported

`review_photos/{rv_<24 hex>}` (`api/reviews.js:272-279`): `owner` (truncated sha256 of the email), `reviewId` (`''` until attached), `issuedAt`, then `url` and `attachedAt` on attach (`:214`). It binds a server-signed Cloudinary upload to one customer and one review; deleted with the photo (`:94-103`).

`review_votes/{sha256(reviewId|ip|ua)[0:32]}` (`api/reviews.js:247`, `:256`): `reviewId`, `createdAt`. One helpful vote per visitor per review.

### 2.6 `orders` — 38 docs (3 Paid, 1 Refunded, 34 Unpaid)

**Id:** `SAG-<YYMMDD UTC>-<5 chars>` from a 32-symbol alphabet (`api/_lib/orders.js:391-398`). Created with `create()` so a clash retries (`api/orders.js:383-449`). Document id equals `orderNumber` in all 38 docs.

**Top-level fields** (creation: `api/orders.js:400-440`; type: `src/types.ts:159-209`):

| Field | Type | Notes |
|---|---|---|
| `orderNumber` | string | = doc id |
| `date`, `createdAt`, `updatedAt` | ISO string | `date` and `createdAt` are the same instant at creation |
| `status` | string | `Pending`, `Processing`, `Packed`, `Shipped`, `In Transit`, `Out for Delivery`, `Delivered`, `Returned`, `Cancelled`, `Refund Requested`, `Refunded` (`api/_lib/orders.js:490`) |
| `paymentStatus` | string | `Unpaid`, `Paid`, `Refunded`; older client code also knows `Pending` and `Pending Verification` (`src/types.ts:173`) |
| `paymentMethod` | `'razorpay' \| 'payu'` | |
| `paymentRef` | string | gateway payment id, or `manual-by-admin` (`api/orders.js:753`) |
| `razorpayOrderId` | string | latest Razorpay order |
| `razorpayOrderIds` | string[] | every Razorpay order made for this order (pay-again); in 10/38 docs |
| `payuTxnId`, `payuTxnIds` | string, string[] | `<orderNumber>-<n>`; in 10/38 docs |
| `attemptKey` | string | idempotency key from the browser, 16–64 chars (`api/orders.js:342`); queried by equality (`:348`) |
| `customerEmail` | string | lowercase; **the ownership key** (`api/orders.js:284-288`) |
| `customerName`, `customerMobile` | string | mobile is 10 digits |
| `customerUid` | string | Firebase uid at checkout or `''` (`api/orders.js:415`); 14 `c_…`, 18 empty, 6 other (unverified; likely the admin's uid from test checkouts) |
| `deliveryAddress` | object | see below |
| `items` | object[] | see below; written once at creation and never changed |
| `subtotal`, `couponDiscount`, `comboDiscount`, `prepaidDiscount`, `discountAmount`, `shippingCharge`, `finalTotal` | number | rupees; whole numbers in the export |
| `couponCode`, `couponId` | string | `''` when none; `couponId` drives the usage increment (`api/_lib/orders.js:424`) |
| `giftNote` | string ≤300 | |
| `estimatedDeliveryDate` | ISO string or `''` | from store settings at creation |
| `deliveryEstimateSource` | `'settings' \| ''` | optional; only `'settings'` estimates are shown (`api/_lib/orders.js:1080`) |
| `expectedDeliveryDate` | `YYYY-MM-DD` or `''` | admin-entered |
| `trackingNumber`, `courierPartner`, `trackingUrl` | string | |
| `deliveryAgentName`, `deliveryAgentPhone` | string | optional (`api/orders.js:765-766`) |
| `notes` | string ≤2000 | internal; also receives stock-shortfall and PayU test lines (`api/_lib/orders.js:459`, `api/payu.js:76`) |
| `customerNote` | string ≤500 | optional, shown to the customer |
| `timeline` | `{status, at, note}[]` | appended on every state change; max 6 seen |
| `stockDeducted` | boolean | |
| `deductedQuantities` | `{[productId]: number}` | set on payment, cleared on restore (`api/_lib/orders.js:453`, `:485-486`) |
| `stockShortfall` | `{productId, name?, requested, available}[]` | set on payment (`:454`) |
| `paidAt` | ISO string | optional |
| `paidVia` | string | `checkout`, `webhook`, `reconcile`, `payu`, `payu-webhook`, `admin` (`api/orders.js:118`, `:132`, `:517`, `:753`; `api/payu.js:73`; `api/webhooks/razorpay.js:67`) |
| `emailLog` | `{kind, at, ok}[]` | optional |
| `testPayment` | boolean | optional; PayU sandbox (`api/payu.js:76`) |
| `cancelRequest` | `{reason, at, handledAt?, outcome?, storeNotified?}` | optional (`api/_lib/orders.js:563-565`, `:520`; `api/orders.js:777`) |
| `returnRequest` | object | optional; see below |
| `pastReturnRequests` | object[] | optional; earlier requests (`api/orders.js:640`) |

`deliveryAddress` (`api/orders.js:135-161`): `fullName`, `mobile`, `email`, `houseFlat`, `street`, `area`, `city`, `state`, `pincode`, plus `landmark`, `altMobile`, `tehsil`, `district`, `type` (`Home | Work | Other`). The last five exist only on newer orders (10/38).

`items[]` (`api/_lib/orders.js:324-340`): `id` (`<productId>-<size>-<colour>[-look-<parentId>]`), `product` `{id, name, sku, category, image, images[1], price, originalPrice}`, `selectedSize`, `selectedColor` `{name, hex}`, `quantity`, and for "Complete the look" accessories `lookParentId`, `lookParentName`. This is a price snapshot, not a reference: 2 of 55 exported lines point at products that no longer exist.

`returnRequest` (`api/orders.js:635`, `api/_lib/orders.js:900-908`, `src/types.ts:230-250`): `type` (`return | exchange`), `status` (`requested | approved | rejected | received | refunded | exchanged`), `reason`, `details`, `photos` (URL[]), `items[]` `{line, productId, name, image, size, color, qty, price, clearance, exchangeSize?}`, `at`, `updatedAt`, `adminNote`, `history[]` `{status, at, note}`, `<status>At`, `storeNotified?`. `items[].line` is the **array index into `order.items`** (`api/_lib/orders.js:703-719`). Two legacy shapes are still read: `{reason, at}`, and no object at all with order status `Refund Requested` plus a `[RETURN/EXCHANGE REQUEST]` line in `notes` (`:634-696`). No order in the export has any request.

**Access:** rule `:48-52` — admin read and delete; create and update denied to every browser.

| Who | What | Where |
|---|---|---|
| Server | create, pay, reconcile, track, my-orders, cancel/return requests, admin updates | `api/orders.js:308-806` |
| Server | PayU return + webhook, Razorpay webhook | `api/payu.js:62-93`, `api/webhooks/razorpay.js:62-70` |
| Server | coupon per-customer usage, verified-purchase lookup | `api/_lib/orders.js:191-200`, `api/reviews.js:128-137` |
| Admin | live listener on the whole collection, plus one per open order | `AdminContext.tsx:952`, `src/components/admin/AdminOrderDetails.tsx:108-110` |
| Admin | delete an unpaid / cancelled / refunded order | `AdminContext.tsx:1288-1296` |
| Customer / Anon | never direct; through `api/orders.js` views | `api/_lib/orders.js:1044-1129` |

`addOrder` (`AdminContext.tsx:1249-1257`) writes an order from the browser; the rule denies it, so it is dead code.

Server queries in use: by `attemptKey`; by `customerEmail`; by `razorpayOrderId`; by `couponCode` + `paymentStatus` + `customerEmail` or `customerMobile` (`api/orders.js:348`, `:554`; `api/webhooks/razorpay.js:62`; `api/_lib/orders.js:194-197`).

### 2.7 `return_photos` — server only, not exported

`return_photos/{rt_<24 hex>}` (`api/orders.js:576-584`): `owner` (email hash), `orderNumber`, `issuedAt`, `attachedAt` (`''` until used; set in the return-request transaction, `:641`).

### 2.8 `customers` — 9 docs

**Id:** lowercase email (`api/customer-auth.js:125`). Fields (`:129-137`): `email`, `name`, `phone`, `status` (`active`), `createdAt`, `lastLoginAt`, `updatedAt`.

**Access:** rule `:61-64` — read by admin or that customer; no browser writes. Written only by `upsertCustomer` after an email code or Google sign-in (`api/customer-auth.js:124-140`). Read by the admin Customers page as a whole-collection `getDocs` (`src/components/admin/AdminCustomers.tsx:40`). `Customer` in `src/types.ts:262-275` (totalOrders, totalSpent…) is not this document; those numbers are computed in the browser from orders (`AdminCustomers.tsx:53-91`).

### 2.9 `profiles` — 9 docs (same 9 emails as `customers`)

**Id:** lowercase email. All fields optional; every writer merges.

| Field | Type | Writer |
|---|---|---|
| `email` | string | all writers |
| `fullName`, `phone` | string | seeded on sign-in (`api/customer-auth.js:143-149`); checkout (`src/components/CheckoutPage.tsx:468-478`); account page (`src/components/AccountPage.tsx:667`) |
| `name` | string | legacy duplicate of `fullName` (`AccountPage.tsx:667`) |
| `houseFlat`, `street`, `area`, `city`, `state`, `pincode` | string | mirror of the default address (`src/lib/addressBook.ts:169-185`) |
| `streetAddress` | string | legacy, **inconsistent**: `houseFlat` in `AccountPage.tsx:667` and `addressBook.ts:170`, but `street` in `CheckoutPage.tsx:473` |
| `addresses` | `SavedAddress[]` ≤20 | `{id 'adr_…', fullName, mobile, altMobile?, houseFlat, street, area, city, state, pincode, landmark?, tehsil?, district?, type, isDefault}` (`addressBook.ts:13-29`, `:185`); whole list rewritten on each change |
| `cart` | `CartItem[]` | **full product objects embedded**, including description and all images (`ShopContext.tsx:346-349`; confirmed in the export) |
| `wishlist` | `Product[]` | full product objects, not `WishlistItem` (`ShopContext.tsx:424-427`) |
| `stylePrefs` | `{colours[], sizes[], budgetMin, budgetMax, occasions[], categories[], updatedAt?}` | `src/components/StyleProfile.tsx:12-20`, `:160`; 0/9 docs |
| `updatedAt` | ISO string | |

**Access:** rule `:55-58` — get / create / update by admin or that customer; list and delete admin only.

- Customer: reads and writes own document directly from the browser (`ShopContext.tsx:346`, `:366`, `:424`, `:444`; `addressBook.ts:185`, `:221`; `AccountPage.tsx:618`, `:667`; `CheckoutPage.tsx:468`; `StyleProfile.tsx:122`, `:160`).
- Server: seeds on sign-in (`api/customer-auth.js:143-149`); **scans up to 5,000 profiles** to find who wish-listed a product for price-drop emails (`api/alerts.js:50-54`).

### 2.10 `abandoned_checkouts` — 78 docs, 381 KB

**Id:** `chk_<ms>_<7 random>` kept in `sessionStorage` (`CheckoutPage.tsx:199-206`).

**Fields** (`CheckoutPage.tsx:226-247`): `sessionId`, `firstName`, `lastName`, `fullName`, `phone`, `mobile` (same value), `email`, `utmSource`, `utmMedium`, `utmCampaign`, `fbclid`, `cartItems` (full `CartItem[]`, ~3.9 KB per doc), `totalAmount`, `address` (`DeliveryAddress`), `status` (always `'abandoned'`), `updatedAt`. No `createdAt`.

**Access:** rule `:66-69` — **anyone may create or update any document**; admin read and delete. Written by anonymous shoppers as they type. **No code reads it** (the only reference outside the writer is the collection name in `dataStore.ts:29`). The status never changes to "recovered" when the order is placed.

### 2.11 `storefront_settings` — 8 docs

**Id:** the setting key. **Fields:** `value_json` (string; JSON because Firestore rejects nested arrays, `api/admin-config.js:185`), `updated_at` (ISO string). Note the snake_case, unlike every other collection.

Allowed keys (`api/admin-config.js:55-67`):

| Key | Shape | In export |
|---|---|---|
| `storeSettings` | `StoreSettings` (`src/types.ts:354-394`, sanitiser `api/admin-config.js:137-174`) | yes; only `shippingCharge`, `freeShippingThreshold`, `prepaidDiscount` are set |
| `homepageSections` | `{id, title, key, enabled, order}[]` (`AdminContext.tsx:223-241`) | yes, 15 entries |
| `heroConfig` | `{slides: [{id, productId, title, subtitle, badge, image, bannerImage?, price, originalPrice, linkText, link, customText?}]}` (`src/types.ts:316-331`) | yes, 6 slides |
| `dealOfTheDay` | `DealOfTheDayConfig` (`src/types.ts:419-432`) | yes |
| `comboOffer` | `{enabled, percent, minItems, title, subtitle}` (`api/admin-config.js:102-108`) | yes |
| `discovery` | `{features: {18 booleans}, occasions: [{id, name, description, enabled, match, maxPrice, sizes[], productIds[]}]}` (`api/admin-config.js:69`, `:88-100`) | yes, 11 occasions |
| `auraReels` | `{id, videoUrl, posterUrl, caption, productId, enabled}[]` ≤50 (`api/admin-config.js:74-81`) | yes, 3 |
| `instagramReels` | `{id, url, caption}[]` ≤24 (`api/admin-config.js:111-123`) | yes, empty |
| `lookRelations` | `{[comboProductId]: accessoryId[] ≤12}` (`api/admin-config.js:83-86`) | **no document** |
| `banners` | `Banner[]` (`src/types.ts:333-343`) | **no document** |
| `paymentSettings` | public flags only (`api/admin-config.js:125-135`) | **no document** |

**Access:** rule `:72-75` — public read, no browser writes. Written by the admin through `PUT /api/admin-config` in a batch (`api/admin-config.js:695-720`). Read by the server for pricing and feature flags (`api/_lib/orders.js:18-26`, `api/reviews.js:119`, `api/alerts.js:17`). The browser also holds live listeners on single keys: `storeSettings`, `comboOffer`, `discovery`, `lookRelations`, `auraReels` (`ShopContext.tsx:1082`, `:1101`; `src/utils/discovery.ts:88`; `src/utils/looks.ts:43`; `src/utils/reels.ts:98`; `src/components/DeliveryCheck.tsx:84`) and, for the admin, on the whole collection as a change signal (`AdminContext.tsx:803`).

### 2.12 `private_settings` — server only, not exported

- `payment_gateways` (`api/_lib/payu.js:5`, `:10-23`; written at `api/admin-config.js:690`): `razorpay` `{enabled, keyId, keySecret, webhookSecret}`, `payu` `{enabled, mode, merchantKey, salt}`, `updatedAt`. **Live gateway secrets are stored here in plain text.** Env fallbacks: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (`api/_lib/payu.js:54-60`).
- `ai_assistant` (`api/_lib/gemini.js:20`; written at `api/admin-config.js:593`, `:635`, `:647`): `geminiKey`, `model`, `updatedAt`. Env fallback `GEMINI_API_KEY`.

### 2.13 `admin_credentials/singleton` — server only, not exported

Fields (`api/admin-config.js:216-226`, `:616-625`): `singleton` (true), `username`, `password_hash`, `pin_hash` (both `saltHex:hashHex`, scrypt 64 bytes, `:188-201`), `require_pin`, `secret_path_slug`, `allow_direct_admin_route`, `session_version` (incremented on every credential change to sign out all devices). Bootstrapped from `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD` / `ADMIN_INITIAL_PIN` when the document is missing (`:211-227`). The admin session itself is an HMAC cookie signed with `ADMIN_SESSION_SECRET` and is not stored (`:281-299`).

### 2.14 `admin_settings` — 0 docs

`admin_settings/inventory` `{lowStockThreshold, updatedAt}` (`AdminContext.tsx:969`, `:1503`). Rule `:136-138` — admin only. Never saved yet, so the default of 5 applies (`src/utils/inventory.ts:4`).

### 2.15 `customer_email_otps` — server only, ephemeral

**Id:** `<email>__<purpose>` with purpose `signup | login` (`api/customer-auth.js:13-16`). Fields (`:71-81`): `email`, `purpose`, `code_hash` (HMAC with `ADMIN_SESSION_SECRET`), `attempts`, `sent_at_ms`, `expires_at_ms`, `sends` (number[] of send times in the last 24 h), `locked_until`. Codes live 10 minutes. **Do not migrate.**

### 2.16 `rate_limits` — server only, ephemeral

Fixed-window counters, one document per key. Two shapes:

- `{windowStart (ms), count, expiresAt (Date)}`: `admin_login:<ip>` (`api/admin-config.js:513`), `otp_ip:<ip>` (`api/customer-auth.js:29`), and from `api/orders.js:292-306`: `order:<ip>`, `result:<ip>`, `track:<ip>`, `return-photo:<emailHash>`, `return-photo-ip:<ip>`, `return:<emailHash>`, `cancel:<email>` (`:345`, `:459`, `:483`, `:529`, `:569-570`, `:594`, `:664`).
- `{day, count (increment), expiresAt}`: `reviews_<day>_submit_<ipHash>`, `reviews_<day>_sign_<emailHash>`, `reviews_<day>_signip_<ipHash>`, `reviews_<day>_helpful_<ipHash>` (`api/reviews.js:106-115`, `:173`, `:248`, `:268-269`).

Nothing in the repository deletes these documents. Whether a Firestore TTL policy on `expiresAt` is configured in the console is **unverified**. **Do not migrate.**

### 2.17 `leads` — 0 docs

**Id:** Firestore auto-id (`addDoc`). Fields: `name`, `email`, `phone`, `source` (`contact | newsletter`), `message`, `orderNumber`, `createdAt`, `offerSent` (`src/components/ContactUsPage.tsx:35-44`, `src/components/HomeSections.tsx:247`).

**Access:** rule `:89-99` — anyone may create with only those keys, length limits, and `offerSent == false`; admin reads, updates, deletes (`AdminContext.tsx:984-999`, `:1548`, `:1554`). Written **directly by anonymous browsers**; there is no server endpoint and no rate limit.

### 2.18 `visitor_sessions` — 1,625 docs, 1.9 MB (4 days of data)

**Id:** the browser's visitor id, `vis_[a-z0-9_]{4,40}` (`api/track.js:23`, `:119`). Fields (`:171-190`): `id`, `sessionId` (both = doc id), `date` (first day), `firstSeen`, `lastActive`, `deviceType`, `deviceModel`, `browser`, `userAgent`, `utm_source`, `utm_medium`, `utm_campaign`, `fbclid`, `referrer`, `page`, `returning`, `visitCount` (increment, `:167`), `actions` `{time, type, path, label}[]` appended with `arrayUnion` (`:167`, `:193`; max 5 seen, average 1.1).

**Access:** rule `:102-104` — admin read and delete; server writes only (`api/track.js`). Admin reads the latest 100 by `lastActive` with a live listener (`src/components/admin/AdminDashboardOverview.tsx:97-98`).

### 2.19 `daily_analytics` — 4 docs

**Id:** `YYYY-MM-DD` (UTC). Fields, all `FieldValue.increment`: `date`, `totalUniqueVisitors`, `instagramVisitors`, `otherVisitors`, `returningVisitors`, `visits`, `cartAdditions`, `checkoutsInitiated`, `productViews`, `wishlistAdds`, `searches` (`api/track.js:92`, `:99`, `:127`, `:145-154`), and `purchases` from the payment transaction (`api/_lib/orders.js:464`).

**Access:** rule `:106-108` — admin read and delete. Admin live listener on the latest 15 (`AdminDashboardOverview.tsx:78-79`). The server also reads today's document to enforce a write budget (`api/track.js:35-48`).

### 2.20 `product_daily` — 64 docs

**Id:** `<day>_<productId>`. Fields: `day`, `productId`, `views`, `wishlists` (increments; `api/track.js:97-98`).

**Access:** rule `:112-115` — **public `get` of a single document**, admin list and delete. Anonymous shoppers read today's document directly on every product page (`src/components/ProductDetailPage.tsx:65`); admin queries `day in [last 7]` (`src/components/admin/AdminInsights.tsx:23`).

### 2.21 `search_terms` — 11 docs

**Id:** `<day>_<sha256(term)[0:24]>`. Fields: `day`, `term`, `count` (`api/track.js:91`). Rule `:117-119` — admin read and delete. Read at `AdminInsights.tsx:22`.

### 2.22 `feature_daily` — 9 docs

**Id:** `<day>_<event>_<item>`. Fields: `day`, `event` (`reel_view | reel_click | feature_use`), `item` (reel id or feature name), and one of `views`, `productClicks`, `uses` (`api/track.js:93-95`). Rule `:121-123` — admin read and delete. **No reader found** in `src/`.

### 2.23 `analytics_totals/lifetime` — 1 doc

Fields written by the server: `visits`, `uniqueVisitors` (increments), `updatedAt` (`api/track.js:156-159`). The exported document also has `baselineVisits`, `baselineUniqueVisitors`, `countingSince`; the dashboard reads them (`AdminDashboardOverview.tsx:168-172`) but **nothing in the repository writes them**, so they were set by hand or by a one-off script. Rule `:126-128` — admin read only (live listener at `AdminDashboardOverview.tsx:62`).

### 2.24 `analytics_dedup` — server only, not exported, unbounded

One document per "already counted" fact (`api/track.js:84-89`, `:121-144`):

- `<day>_<event>_<hash(ip|ua|item)>` and `<day>_<event>_<hash(ip|ua)>`: `{day, createdAt}`
- `<day>_ipitems_<hash(ip)>`: `{day, count}`
- `<day>_ip_<hash(ip)>`: `{day, visits, sessions}`
- `sess_<hash(ip|ua)>`: `{lastSeen (ms), day}`

No code deletes these. **Do not migrate.**

### 2.25 `inventory_log` — 14 docs

**Id:** `inv-` + `newDocId`. Fields (`ProductContext.tsx:133-143`, `src/utils/inventory.ts:21-30`): `at`, `by` (`'admin'`), `productId`, `productName`, `from`, `to`, `reason`, `updatedAt`. Rule `:131-133` — admin only. Written **from the admin's browser** after a stock change; read by product (equality, limit 300) or newest 100 (`src/components/admin/AdminStockHistory.tsx:35-39`). Stock changes made by the server on payment or cancellation are **not** logged here. 3 of 14 entries reference deleted products.

### 2.26 `stock_alerts`, `alert_state`, `alert_log`, `shared_wishlists` — server only, not exported

- `stock_alerts/{sha256(email|productId|size|colour)[0:32]}` (`api/alerts.js:123-124`): `email`, `productId`, `productName`, `size`, `colour`, `status` (`waiting | sent`), `createdAt`, `sentAt?` (`:88`). Queried by `productId` + `status` (`:76`). **These are customer subscriptions and must be carried over.**
- `alert_state/{productId}` (`:38-42`, `:126-130`): `price`, `available`, `updatedAt`. Last known state, used to detect a real change.
- `alert_log/price_<hash(email|productId|price)>` (`:55-66`): `kind`, `productId`, `email`, `from`, `to`, `at`. Guarantees one price-drop email per customer per price.
- `shared_wishlists/{16 hex}` (`:140-141`): `productIds` (string[] ≤50), `createdAt`. Read publicly through `GET /api/alerts?wishlist=` (`:100-105`). **Shared links in the wild depend on these ids.**

### 2.27 `hero_slides` — 0 docs, unused

Declared in `dataStore.ts:28` and `firestore.rules:29-32`; no code reads or writes it. Hero slides live in `storefront_settings/heroConfig`. **Do not migrate.**

### 2.28 Not Firestore, but part of the model: Firebase Auth users

- Customers: uid `c_` + first 26 hex of sha256(lowercase email), custom claim `customerEmail` (`api/_lib/firebaseAdmin.js:36-40`). No password, no stored provider link. Google sign-in creates a throwaway Google user that is deleted immediately (`api/customer-auth.js:164-178`).
- Admin: uid `sag-admin`, claim `admin: true` (`api/_lib/firebaseAdmin.js:9`, `:30`).

The Firebase user records carry no data that is not already in `customers`. The email in `customers` is the only identity to carry into Better Auth.

---

## 3. Volume summary (export of 2026-10-01)

| Collection | Docs | Growth driver |
|---|---|---|
| `visitor_sessions` | 1,625 | ~250–770 new per day with ads running |
| `abandoned_checkouts` | 78 | one per checkout session that typed anything |
| `product_daily` | 64 | products viewed × days |
| `orders` | 38 | 34 are unpaid attempts |
| `products` | 33 | |
| `inventory_log` | 14 | |
| `search_terms` | 11 | |
| `customers` / `profiles` | 9 / 9 | |
| `feature_daily` | 9 | |
| `storefront_settings` | 8 | fixed |
| `reviews` | 7 | |
| `daily_analytics` | 4 | one per day |
| `categories` | 3 | |
| `coupons` | 1 | |
| `analytics_totals` | 1 | fixed |
| `leads`, `admin_settings`, `hero_slides` | 0 | |
| Server-only collections | unknown | `analytics_dedup` and `rate_limits` are likely the largest by count |

The whole business dataset is well under 1 MB. Size is not a migration risk; correctness and write volume are.

---

## 4. Proposed D1 schema

General rules:

- Table and column names in `snake_case`. Text primary keys keep the Firestore ids unchanged.
- Timestamps as `TEXT` ISO-8601 UTC, exactly as stored today. They sort correctly as strings and need no conversion on import.
- Booleans as `INTEGER` 0/1 (Drizzle `integer({ mode: 'boolean' })`).
- Money as `INTEGER` rupees. Every money value in the export is a whole number; the importer should fail loudly on a fraction rather than round. `rating` is `REAL`.
- JSON as `TEXT` with `CHECK (json_valid(col))`. D1 supports SQLite's JSON functions and generated columns.
- Foreign keys are declared only where the export proves the reference always holds. Snapshots and analytics deliberately have none.

D1 figures quoted in this section (free plan: 5 million rows read and 100,000 rows written per day, 5 GB storage; about 2 MB maximum row size; 100 bound parameters per statement) are from my knowledge of Cloudflare's documentation and should be re-checked before relying on them.

### 4.1 `products`

```sql
CREATE TABLE products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  sku                 TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'Suits',
  subcategory         TEXT NOT NULL DEFAULT '',
  product_type        TEXT NOT NULL DEFAULT 'outfit' CHECK (product_type IN ('outfit','accessory','kids','toy')),
  accessory_type      TEXT NOT NULL DEFAULT '',
  set_type            TEXT NOT NULL DEFAULT '',
  age_range           TEXT NOT NULL DEFAULT '',
  price               INTEGER NOT NULL,
  original_price      INTEGER NOT NULL,
  discount            INTEGER NOT NULL DEFAULT 0,
  stock_quantity      INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  in_stock            INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 0,
  hidden              INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  rating              REAL NOT NULL DEFAULT 0,
  review_count        INTEGER NOT NULL DEFAULT 0,
  images_json         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json)),
  colors_json         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(colors_json)),
  sizes_json          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sizes_json)),
  tags_json           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  description         TEXT NOT NULL DEFAULT '',
  fabric              TEXT NOT NULL DEFAULT '',
  fit                 TEXT NOT NULL DEFAULT '',
  occasion            TEXT NOT NULL DEFAULT '',
  wash_care           TEXT NOT NULL DEFAULT '',
  video_url           TEXT NOT NULL DEFAULT '',
  is_new_arrival      INTEGER NOT NULL DEFAULT 0,
  is_best_seller      INTEGER NOT NULL DEFAULT 0,
  is_trending         INTEGER NOT NULL DEFAULT 0,
  is_festive          INTEGER NOT NULL DEFAULT 0,
  is_sale             INTEGER NOT NULL DEFAULT 0,
  is_featured         INTEGER NOT NULL DEFAULT 0,
  seo_title           TEXT NOT NULL DEFAULT '',
  seo_description     TEXT NOT NULL DEFAULT '',
  search_keywords     TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX products_visible_idx ON products (hidden, created_at DESC);
CREATE INDEX products_category_idx ON products (category);
```

Mapping: one-to-one with section 2.1. Drop `image` (always `images[0]`; the API response can re-add it). Fill `status` from `hidden` and `product_type` with `'outfit'` where absent, using the same rules the reader applies today (`ProductContext.tsx:51`, `:123`).

**JSON, not normalised — `images`, `colors`, `sizes`, `tags`:** they are always read and written with the whole product, order matters, they are small (≤6 entries), and nothing queries inside them. Stock is one number per product, so there is no per-size row to hang anything on. If per-size stock is built later, that is the moment to add a `product_variants` table.

`category` stays free text with no foreign key (28 of 33 products have no matching category row). `sku` gets no unique index because uniqueness has never been enforced; add one only after the owner confirms.

### 4.2 `categories`

```sql
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  tagline    TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL DEFAULT '',
  is_active  INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX categories_name_uq ON categories (name);
```

### 4.3 `coupons`

```sql
CREATE TABLE coupons (
  id                      TEXT PRIMARY KEY,
  code                    TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  discount_type           TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value          INTEGER NOT NULL DEFAULT 0,
  min_order_value         INTEGER NOT NULL DEFAULT 0,
  max_discount            INTEGER,
  start_date              TEXT NOT NULL DEFAULT '',
  expiry_date             TEXT NOT NULL DEFAULT '',
  usage_limit             INTEGER NOT NULL DEFAULT 0,
  usage_count             INTEGER NOT NULL DEFAULT 0,
  per_user_limit          INTEGER NOT NULL DEFAULT 0,
  is_active               INTEGER NOT NULL DEFAULT 1,
  allowed_categories_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_categories_json)),
  allowed_product_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_product_ids_json)),
  updated_at              TEXT NOT NULL
);
CREATE UNIQUE INDEX coupons_code_uq ON coupons (code);
```

Store `code` uppercased (it already is). The unique index replaces both the browser-only uniqueness check and the full-collection scan in `findCoupon`. The two allow-lists stay JSON: short, edited as a whole, evaluated in application code against cart lines (`api/_lib/orders.js:177-185`).

### 4.4 `reviews`, `review_photos`, `review_votes`

```sql
CREATE TABLE reviews (
  id                TEXT PRIMARY KEY,
  product_id        TEXT NOT NULL,
  product_name      TEXT NOT NULL DEFAULT '',
  user_name         TEXT NOT NULL,
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden')),
  verified_purchase INTEGER NOT NULL DEFAULT 0,
  size_purchased    TEXT,
  location          TEXT,
  admin_reply       TEXT NOT NULL DEFAULT '',
  image_url         TEXT,
  photo_id          TEXT,
  helpful_count     INTEGER NOT NULL DEFAULT 0,
  source            TEXT NOT NULL DEFAULT '',
  date              TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX reviews_product_status_idx ON reviews (product_id, status);
CREATE INDEX reviews_status_created_idx ON reviews (status, created_at DESC);

CREATE TABLE review_photos (
  key         TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  review_id   TEXT NOT NULL DEFAULT '',
  url         TEXT,
  issued_at   TEXT NOT NULL,
  attached_at TEXT
);
CREATE INDEX review_photos_review_idx ON review_photos (review_id);

CREATE TABLE review_votes (
  vote_key   TEXT PRIMARY KEY,
  review_id  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

No foreign key from `reviews.product_id`: the admin can create reviews with product id `'0'` (`AdminContext.tsx:1441`), and deleting a product does not delete its reviews today. Normalise `date` to ISO on import where it is not already.

### 4.5 `orders`, `order_items`, `return_photos`

```sql
CREATE TABLE orders (
  order_number             TEXT PRIMARY KEY,
  status                   TEXT NOT NULL,
  payment_status           TEXT NOT NULL,
  payment_method           TEXT NOT NULL DEFAULT 'razorpay',
  payment_ref              TEXT NOT NULL DEFAULT '',
  paid_at                  TEXT,
  paid_via                 TEXT,
  test_payment             INTEGER NOT NULL DEFAULT 0,
  razorpay_order_id        TEXT NOT NULL DEFAULT '',
  razorpay_order_ids_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(razorpay_order_ids_json)),
  payu_txn_id              TEXT NOT NULL DEFAULT '',
  payu_txn_ids_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(payu_txn_ids_json)),
  attempt_key              TEXT NOT NULL DEFAULT '',
  customer_email           TEXT NOT NULL,
  customer_name            TEXT NOT NULL DEFAULT '',
  customer_mobile          TEXT NOT NULL DEFAULT '',
  user_id                  TEXT,
  legacy_firebase_uid      TEXT NOT NULL DEFAULT '',
  delivery_address_json    TEXT NOT NULL CHECK (json_valid(delivery_address_json)),
  items_json               TEXT NOT NULL CHECK (json_valid(items_json)),
  subtotal                 INTEGER NOT NULL,
  coupon_code              TEXT NOT NULL DEFAULT '',
  coupon_id                TEXT NOT NULL DEFAULT '',
  coupon_discount          INTEGER NOT NULL DEFAULT 0,
  combo_discount           INTEGER NOT NULL DEFAULT 0,
  prepaid_discount         INTEGER NOT NULL DEFAULT 0,
  discount_amount          INTEGER NOT NULL DEFAULT 0,
  shipping_charge          INTEGER NOT NULL DEFAULT 0,
  final_total              INTEGER NOT NULL,
  gift_note                TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  customer_note            TEXT NOT NULL DEFAULT '',
  estimated_delivery_date  TEXT NOT NULL DEFAULT '',
  delivery_estimate_source TEXT NOT NULL DEFAULT '',
  expected_delivery_date   TEXT NOT NULL DEFAULT '',
  tracking_number          TEXT NOT NULL DEFAULT '',
  courier_partner          TEXT NOT NULL DEFAULT '',
  tracking_url             TEXT NOT NULL DEFAULT '',
  delivery_agent_name      TEXT NOT NULL DEFAULT '',
  delivery_agent_phone     TEXT NOT NULL DEFAULT '',
  stock_deducted           INTEGER NOT NULL DEFAULT 0,
  deducted_quantities_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(deducted_quantities_json)),
  stock_shortfall_json     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stock_shortfall_json)),
  timeline_json            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(timeline_json)),
  email_log_json           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(email_log_json)),
  cancel_request_json      TEXT CHECK (cancel_request_json IS NULL OR json_valid(cancel_request_json)),
  return_request_json      TEXT CHECK (return_request_json IS NULL OR json_valid(return_request_json)),
  past_return_requests_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(past_return_requests_json)),
  return_status            TEXT GENERATED ALWAYS AS (json_extract(return_request_json, '$.status')) VIRTUAL,
  date                     TEXT NOT NULL,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX orders_customer_email_idx ON orders (customer_email, date DESC);
CREATE INDEX orders_customer_mobile_idx ON orders (customer_mobile);
CREATE INDEX orders_razorpay_idx ON orders (razorpay_order_id) WHERE razorpay_order_id <> '';
CREATE UNIQUE INDEX orders_attempt_key_uq ON orders (attempt_key) WHERE attempt_key <> '';
CREATE INDEX orders_coupon_paid_idx ON orders (coupon_code, payment_status) WHERE coupon_code <> '';
CREATE INDEX orders_updated_idx ON orders (updated_at DESC);
CREATE INDEX orders_return_status_idx ON orders (return_status) WHERE return_status IS NOT NULL;

CREATE TABLE order_items (
  order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  line         INTEGER NOT NULL,
  product_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  size         TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '',
  quantity     INTEGER NOT NULL,
  price        INTEGER NOT NULL,
  PRIMARY KEY (order_number, line)
);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE return_photos (
  key          TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,
  order_number TEXT NOT NULL,
  issued_at    TEXT NOT NULL,
  attached_at  TEXT NOT NULL DEFAULT ''
);
```

Mapping: `customerUid` → `legacy_firebase_uid`; `user_id` is the Better Auth user id, null for guest orders and filled on import where a user with the same email exists. Ownership checks stay on `customer_email`, exactly as today.

**JSON, not normalised, and why:**

- `items_json` — an immutable price snapshot written once (`api/orders.js:417`). Return requests address lines by array index (`line`), and the whole of `api/_lib/orders.js:700-923` works on this shape. Keeping it intact means the return, cancel and view code ports without change. `order_items` is a **derived copy written in the same batch at order creation**, there so that "has this customer bought this product" (`api/reviews.js:128-137`) and sales-by-product reports are indexed lookups. It has no foreign key to `products` because 2 of 55 exported lines reference deleted products.
- `delivery_address_json` — a snapshot of where this order ships; never queried by field; the field set has already grown once (five extra fields on newer orders).
- `timeline_json`, `email_log_json` — append-only lists shown as a whole. Append with `json_insert(col, '$[#]', json(?))` in a single `UPDATE` (see section 5).
- `return_request_json`, `past_return_requests_json`, `cancel_request_json` — a small state machine with nested items, history and two legacy shapes. Normalising it now would mean rewriting tested logic during a platform move. The generated `return_status` column gives the admin Returns page and its badge an index without parsing JSON in the app.
- `razorpay_order_ids_json`, `payu_txn_ids_json`, `deducted_quantities_json`, `stock_shortfall_json` — tiny, written with the order row, only read back with it.

`attempt_key` gets a **unique** partial index: today two parallel requests with the same key can both miss the lookup and create two orders; the index closes that.

### 4.6 Customers: Better Auth `user`, plus `profiles` and `wishlist_items`

Better Auth owns `user`, `session`, `account` and `verification` (generate them with its CLI for the Drizzle SQLite adapter; exact columns belong to the auth document). For this data model:

- `customers/{email}` → one `user` row: `email`, `name`, `email_verified = 1` (every existing customer proved the address by code or Google), `created_at`. Add three extra fields on `user`: `phone`, `status`, `last_login_at`.
- `customer_email_otps` → replaced by Better Auth's `verification` table. Not migrated.

```sql
CREATE TABLE profiles (
  user_id          TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  full_name        TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  house_flat       TEXT NOT NULL DEFAULT '',
  street           TEXT NOT NULL DEFAULT '',
  area             TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  state            TEXT NOT NULL DEFAULT '',
  pincode          TEXT NOT NULL DEFAULT '',
  addresses_json   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(addresses_json)),
  cart_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cart_json)),
  style_prefs_json TEXT CHECK (style_prefs_json IS NULL OR json_valid(style_prefs_json)),
  updated_at       TEXT NOT NULL
);

CREATE TABLE wishlist_items (
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX wishlist_items_product_idx ON wishlist_items (product_id);
```

Decisions:

- **`wishlist` becomes a table.** The price-drop job reads every profile to find who saved one product (`api/alerts.js:50-54`); with `wishlist_items_product_idx` that is one indexed query. The table stores only the product id; the API joins `products` to return the objects the client expects.
- **`cart_json` stays JSON but slimmed** to `[{id, productId, size, color:{name,hex,imageUrl}, quantity, lookParentId?}]`. The client replaces the whole cart on each change, so one row write beats a delete-and-insert of N rows. The API re-hydrates product data on read.
- **Behaviour change to accept:** today a cart or wishlist entry keeps a stale copy of a deleted or hidden product. After the change such entries disappear on read. One exported entry is in that state. The server already rejects hidden or missing products at checkout (`api/_lib/orders.js:305-308`), so nothing sellable is lost.
- **`addresses_json` stays JSON.** Up to 20 entries, always saved as a whole list (`addressBook.ts:185`), never queried across customers.
- `name` is dropped (duplicate of `fullName`). `streetAddress` is dropped; on import use `houseFlat` when present and fall back to `streetAddress` only when `houseFlat` is empty, because the two writers disagree on its meaning.
- Profiles can no longer be written straight from the browser. Every write listed in section 2.9 needs an authenticated endpoint that takes the user from the session, never from the request body.

### 4.7 `abandoned_checkouts`

```sql
CREATE TABLE abandoned_checkouts (
  session_id   TEXT PRIMARY KEY,
  full_name    TEXT NOT NULL DEFAULT '',
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  utm_source   TEXT NOT NULL DEFAULT '',
  utm_medium   TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  fbclid       TEXT NOT NULL DEFAULT '',
  total_amount INTEGER NOT NULL DEFAULT 0,
  cart_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cart_json)),
  address_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(address_json)),
  status       TEXT NOT NULL DEFAULT 'abandoned',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX abandoned_checkouts_updated_idx ON abandoned_checkouts (updated_at DESC);
```

Carry the 78 rows over (the owner asked that nothing be lost) with `created_at = updated_at`, and slim `cart_json` to ids, sizes, quantities and prices. Because no screen reads this data and it holds names, phones and addresses of people who did not order, the endpoint that replaces the open Firestore write must be rate-limited and must not allow overwriting another session's row. Whether to keep collecting it at all is an owner decision (open question 6).

### 4.8 `storefront_settings`, `private_settings`, `admin_credentials`

```sql
CREATE TABLE storefront_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
);

CREATE TABLE private_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_credentials (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  username                 TEXT NOT NULL,
  password_hash            TEXT NOT NULL,
  pin_hash                 TEXT NOT NULL,
  require_pin              INTEGER NOT NULL DEFAULT 1,
  secret_path_slug         TEXT NOT NULL,
  allow_direct_admin_route INTEGER NOT NULL DEFAULT 0,
  session_version          INTEGER NOT NULL DEFAULT 1
);
```

**Settings stay as JSON blobs on purpose.** They are already stored as JSON strings, each is read and written whole, each has a sanitiser that defines its shape (`api/admin-config.js:74-174`), and the public ones are served together in one cached response. `storefront_settings` maps one-to-one (`value_json` and `updated_at` keep their names).

`private_settings` takes `payment_gateways`, `ai_assistant` and `inventory` (from `admin_settings`). It is a separate table so that no "list all settings" query for the public catalogue can ever return it. The gateway secrets should not sit in D1 as plain text: encrypt the secret fields with a key held as a Worker secret (WebCrypto AES-GCM), or have the owner re-enter them after the move. Re-entry is the simpler path and also covers the fact that this document has not been exported.

`admin_credentials`: the stored hashes are scrypt with a per-value salt and can be carried over as they are, provided the Worker can run the same scrypt parameters (`node:crypto` under `nodejs_compat`; **unverified**, test before cut-over). If the document cannot be exported, the existing bootstrap from `ADMIN_INITIAL_*` recreates it; that resets `session_version`, which signs out the admin's devices once.

### 4.9 `leads`

```sql
CREATE TABLE leads (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  name         TEXT,
  email        TEXT,
  phone        TEXT,
  message      TEXT,
  order_number TEXT,
  offer_sent   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX leads_created_idx ON leads (created_at DESC);
```

Needs a new server endpoint (with a rate limit) to replace the direct browser `addDoc`. Enforce the same limits as rule `:90-97`.

### 4.10 Analytics

```sql
CREATE TABLE visitor_sessions (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  first_seen   TEXT NOT NULL,
  last_active  TEXT NOT NULL,
  device_type  TEXT NOT NULL DEFAULT '',
  device_model TEXT NOT NULL DEFAULT '',
  browser      TEXT NOT NULL DEFAULT '',
  user_agent   TEXT NOT NULL DEFAULT '',
  utm_source   TEXT NOT NULL DEFAULT '',
  utm_medium   TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  fbclid       TEXT NOT NULL DEFAULT '',
  referrer     TEXT NOT NULL DEFAULT '',
  page         TEXT NOT NULL DEFAULT '',
  returning    INTEGER NOT NULL DEFAULT 0,
  visit_count  INTEGER NOT NULL DEFAULT 1,
  actions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(actions_json))
);
CREATE INDEX visitor_sessions_last_active_idx ON visitor_sessions (last_active DESC);

CREATE TABLE daily_analytics (
  date                  TEXT PRIMARY KEY,
  total_unique_visitors INTEGER NOT NULL DEFAULT 0,
  instagram_visitors    INTEGER NOT NULL DEFAULT 0,
  other_visitors        INTEGER NOT NULL DEFAULT 0,
  returning_visitors    INTEGER NOT NULL DEFAULT 0,
  visits                INTEGER NOT NULL DEFAULT 0,
  cart_additions        INTEGER NOT NULL DEFAULT 0,
  checkouts_initiated   INTEGER NOT NULL DEFAULT 0,
  product_views         INTEGER NOT NULL DEFAULT 0,
  wishlist_adds         INTEGER NOT NULL DEFAULT 0,
  searches              INTEGER NOT NULL DEFAULT 0,
  purchases             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_daily (
  day        TEXT NOT NULL,
  product_id TEXT NOT NULL,
  views      INTEGER NOT NULL DEFAULT 0,
  wishlists  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);

CREATE TABLE search_terms (
  day   TEXT NOT NULL,
  term  TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, term)
);

CREATE TABLE feature_daily (
  day            TEXT NOT NULL,
  event          TEXT NOT NULL,
  item           TEXT NOT NULL,
  views          INTEGER NOT NULL DEFAULT 0,
  product_clicks INTEGER NOT NULL DEFAULT 0,
  uses           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, item)
);

CREATE TABLE analytics_totals (
  id                       TEXT PRIMARY KEY,
  visits                   INTEGER NOT NULL DEFAULT 0,
  unique_visitors          INTEGER NOT NULL DEFAULT 0,
  baseline_visits          INTEGER NOT NULL DEFAULT 0,
  baseline_unique_visitors INTEGER NOT NULL DEFAULT 0,
  counting_since           TEXT,
  updated_at               TEXT NOT NULL
);

CREATE TABLE analytics_dedup (
  key       TEXT PRIMARY KEY,
  day       TEXT NOT NULL,
  n1        INTEGER NOT NULL DEFAULT 0,
  n2        INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX analytics_dedup_day_idx ON analytics_dedup (day);
```

- `visitor_sessions.id` replaces the three identical fields `id`, `sessionId` and the document id. `actions_json` stays JSON: at most a handful of entries, always shown with the session, appended with `json_insert`.
- Composite natural keys replace the string-concatenated document ids (`<day>_<productId>` and so on). `search_terms` keys on the term itself instead of its hash.
- `analytics_dedup` starts empty. `n1` / `n2` hold the per-IP counters (`count`, or `visits` / `sessions`). A daily Cron Trigger deletes rows whose `day` is older than yesterday, which fixes today's unbounded growth.
- Counters, daily tables and `analytics_totals` (including the hand-set baseline fields) are imported so the dashboard's history does not reset.

### 4.11 `inventory_log`

```sql
CREATE TABLE inventory_log (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  by           TEXT NOT NULL DEFAULT 'admin',
  product_id   TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  from_qty     INTEGER NOT NULL,
  to_qty       INTEGER NOT NULL,
  reason       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX inventory_log_product_idx ON inventory_log (product_id, at DESC);
CREATE INDEX inventory_log_at_idx ON inventory_log (at DESC);
```

No foreign key (3 of 14 entries reference deleted products). Once stock changes go through the server, write the log row in the same batch as the stock update, and consider logging order deductions and restores too (`by = 'order'`), which today leave no trace.

### 4.12 `rate_limits`

```sql
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX rate_limits_expires_idx ON rate_limits (expires_at);
```

Starts empty; purged by the same cron. One statement replaces each Firestore transaction (section 5).

### 4.13 Alerts and shared wishlists

```sql
CREATE TABLE stock_alerts (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  size         TEXT NOT NULL DEFAULT '',
  colour       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','sent')),
  created_at   TEXT NOT NULL,
  sent_at      TEXT
);
CREATE INDEX stock_alerts_product_status_idx ON stock_alerts (product_id, status);

CREATE TABLE alert_state (
  product_id TEXT PRIMARY KEY,
  price      INTEGER NOT NULL,
  available  INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE alert_log (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  product_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  from_price INTEGER,
  to_price   INTEGER,
  at         TEXT NOT NULL
);

CREATE TABLE shared_wishlists (
  id               TEXT PRIMARY KEY,
  product_ids_json TEXT NOT NULL CHECK (json_valid(product_ids_json)),
  created_at       TEXT NOT NULL
);
```

All four keep their Firestore ids. If `alert_state` is not carried over, the first check after cut-over only re-initialises it (`api/alerts.js:43`), so the worst case is one missed alert per product, never a wrong one. If `alert_log` is not carried over, a customer could receive a second email for a price they were already told about.

---

## 5. Firestore features with no D1 equivalent

D1 has no interactive transactions: a Worker cannot `BEGIN`, read, decide in JavaScript, then write and `COMMIT`. What it has is single statements (atomic) and `db.batch([...])`, which runs a fixed list of statements in one transaction. Every Firestore transaction below must be reshaped into one of those two forms.

| Firestore feature | Where it is used | D1 replacement |
|---|---|---|
| Transaction: mark paid exactly once, deduct stock never below zero, count coupon, count purchase | `api/_lib/orders.js:406-467` | One `db.batch` in which **every statement carries the same guard** `EXISTS (SELECT 1 FROM orders WHERE order_number = ? AND payment_status = 'Unpaid')`, and the last statement flips the order to `Paid`. Order of statements: (1) per product, write the amount actually taken into `deducted_quantities_json` as `MIN(stock_quantity, wanted)` using a sub-select; (2) per product, `UPDATE products SET stock_quantity = MAX(0, stock_quantity - wanted), in_stock = …`; (3) coupon `usage_count = usage_count + 1`; (4) `daily_analytics` upsert; (5) the order update. A second call finds the guard false and changes nothing, which is the "already paid" case. Read the order back afterwards to get shortfalls. This is the single most important piece to test with real payments. |
| Transaction: restore stock on cancel / refund | `api/_lib/orders.js:470-488`, `api/orders.js:758-798` | Same pattern: a batch guarded by `stock_deducted = 1`, adding each `deducted_quantities_json` entry back and then clearing the flag. |
| Transaction: admin stock +/- | `src/context/ProductContext.tsx:482-497` | Server endpoint, one statement: `UPDATE products SET stock_quantity = MAX(0, stock_quantity + ?), in_stock = … WHERE id = ? RETURNING stock_quantity`, batched with the `inventory_log` insert. |
| Transaction: read-check-write on one order (cancel request, return request, admin return action, admin update) | `api/_lib/orders.js:556-570`; `api/orders.js:617-644`, `:724-731`, `:758-798` | Optimistic concurrency: read the row, compute the update in JavaScript as today, then `UPDATE … WHERE order_number = ? AND updated_at = ?` with the value read. Zero rows changed means someone else got there first; re-read and retry once. The return-request case also flips `return_photos.attached_at` in the same batch with a `WHERE attached_at = ''` guard. |
| `FieldValue.increment` | `api/_lib/orders.js:443`, `:464`; `api/track.js:89-159`; `api/reviews.js:112`, `:257-258` | `SET n = n + 1`, or for rows that may not exist `INSERT … ON CONFLICT (pk) DO UPDATE SET n = n + 1`. |
| `set(…, { merge: true })` | `src/lib/dataStore.ts:72`; `api/customer-auth.js:140`, `:149`; all of `api/track.js` | `INSERT … ON CONFLICT DO UPDATE` naming only the columns supplied. For profiles this is what keeps a cart save from wiping the address. |
| `FieldValue.arrayUnion` | `api/track.js:167`, `:193` | `UPDATE visitor_sessions SET actions_json = json_insert(actions_json, '$[#]', json(?))`. (arrayUnion also de-duplicates identical elements; each action has a timestamp, so that never matters.) |
| Array append by read-then-write | timeline and email log throughout `api/orders.js`, `api/payu.js:79`, `api/webhooks/razorpay.js:70` | The same `json_insert` append. This also fixes an existing race: the two webhook paths write the whole `emailLog` array outside any transaction. |
| `FieldValue.delete` | `api/reviews.js:220-222` | `SET col = NULL`. |
| `create()` failing if the document exists | `api/orders.js:442-445`, `:584`; `api/reviews.js:279` | Plain `INSERT`; catch the primary-key constraint error and retry with a new id. |
| Auto-generated ids | guest reviews (`api/reviews.js:196`), leads (`addDoc`) | `crypto.randomUUID()` or the existing `newDocId` scheme. |
| Transactional rate limiter | `api/orders.js:292-306`, `api/admin-config.js:518-529`, `api/customer-auth.js:28-42`, `api/reviews.js:106-115` | One statement: `INSERT … ON CONFLICT (key) DO UPDATE SET count = CASE WHEN ? - window_start > ? THEN 1 ELSE count + 1 END, window_start = CASE … END RETURNING count`, then compare with the limit in code. Cloudflare's Rate Limiting binding only offers 10- and 60-second periods as far as I know (**unverified**), which does not fit the 10-minute to 24-hour windows used here, so a table is the safer choice. |
| OTP send / verify transactions | `api/customer-auth.js:59-82`, `:95-116` | Replaced by Better Auth's email-OTP plugin and its `verification` table. Its attempt limit and expiry need to be set to match today's (5 attempts, 10 minutes, 30-second resend, 8 per day); the daily cap and the 30-minute lockout are not built in and need the `rate_limits` table. |
| Real-time listeners (`onSnapshot`) | products, categories, reviews, orders, coupons, leads, single order, analytics (see section 2) and five settings keys | No push channel from D1. Shoppers already use the cached catalogue and only fall back to listeners; that fallback becomes a plain fetch. Admin screens poll: orders and leads every 15–30 s with `WHERE updated_at > ?` on the indexed column, dashboards every 60 s. The "new return request" toast (`AdminLayout`) keeps working off the polled list. |
| Security rules | `firestore.rules` | There is no direct browser-to-database path any more. Every rule becomes a check in a Worker route. Direct browser access that needs a new endpoint: profiles (read and write), `product_daily` (public get), leads (create), abandoned checkouts (upsert), all admin reads, admin CRUD on products, categories, coupons, reviews, leads, inventory log and the low-stock setting. |
| `db.getAll(...refs)` | `api/_lib/orders.js:258`, `:303`; `api/alerts.js:137`; `api/orders.js:610` | `WHERE id IN (?, …)`; a cart has at most 20 lines (`api/_lib/orders.js:7`), well inside the bound-parameter limit. |
| Field projection `.select(...)` | `api/sitemap.js:52` | Name the columns in `SELECT`. |
| Whole-collection reads | catalogue (`api/admin-config.js:459-465`), `findCoupon`, admin listeners, `profiles.limit(5000)` | Counted as rows read in D1. All are small here; `findCoupon` and the profile scan disappear thanks to the new indexes. |
| Server timestamps | not used | Nothing to replace; the code already writes `new Date().toISOString()`. |
| Composite indexes | none defined (`firebase.json` has rules only); queries are written to need only single-field indexes (`api/_lib/orders.js:189`) | The indexes in section 4 cover every query found. |
| Offline cache / `fromCache` | `src/lib/dataStore.ts:86-89`, `ProductContext.tsx:329-335` | Already mirrored in `localStorage` (`sag_custom_products_v1`, `sag_catalog_saved_v1`); keep that. |

**Write budget.** One visit costs about six Firestore writes today (`api/track.js:41`). In D1 each `INSERT`/`UPDATE` counts per row and index maintenance adds to it. At the observed peak of about 770 new sessions a day, tracking is in the low tens of thousands of row writes, inside a 100,000 per day allowance but the largest consumer by far. Keep the existing budget switch (`TRACK_WRITE_BUDGET`, `api/track.js:31-48`) so that tracking pauses before it can ever block an order.

---

## 6. What to migrate

| Group | Tables | Action |
|---|---|---|
| Business data | products, categories, coupons, reviews, orders (+ derived order_items), customers → user, profiles (+ wishlist_items), storefront_settings, inventory_log, leads | Import from the export. Verify counts and a checksum of totals per order. |
| Customer promises | stock_alerts, shared_wishlists, alert_log, alert_state, review_photos, return_photos, review_votes | **Not exported yet.** Needs an Admin SDK export. Import. |
| Secrets and login | private_settings, admin_credentials | Not exported. Either Admin SDK export, or re-enter gateway keys in the admin panel and let the admin login bootstrap from env. |
| History | daily_analytics, product_daily, search_terms, feature_daily, analytics_totals, visitor_sessions, abandoned_checkouts | Import (small; keeps dashboards continuous and honours "nothing lost"). |
| Ephemeral | customer_email_otps, rate_limits, analytics_dedup, hero_slides | Do not import. Start empty. |

The old Firestore project stays untouched and readable; this plan only reads from it.

---

## 7. Open questions

1. **Server-only collections:** can an Admin SDK export run after the next quota reset for the twelve collections the browser export could not read (section 1, point 4)? Until then the existence and size of `stock_alerts`, `shared_wishlists`, `review_photos` and `return_photos` are unknown.
2. **Review ids:** should the new stack keep the old HMAC key (the service-account private key) only for computing `rv_` review ids, or store an explicit `user_id` + `product_id` unique pair on `reviews` and look existing reviews up that way? The second is cleaner but needs the author recorded for the existing `rv_` rows, which currently hold no email at all.
3. **Cloudinary:** copy assets to the new account and rewrite every stored URL, or keep serving old URLs from the old account for existing content? This affects products, categories, settings blobs, order snapshots, reviews and profiles.
4. **`analytics_totals` baseline fields:** who set `baselineVisits`, `baselineUniqueVisitors` and `countingSince`, and should they be carried as-is?
5. **`customerUid` on 6 orders** holds a value that is not a customer uid. Assumed to be admin test checkouts; confirm before deciding whether those orders count as real.
6. **Abandoned checkouts:** nothing reads them today. Keep collecting (and build a screen), or stop collecting personal details of people who did not order?
7. **Scrypt in Workers:** confirm `node:crypto` scrypt with the current parameters runs under `nodejs_compat` within CPU limits; otherwise the admin password and PIN must be re-set at cut-over.
8. **Firestore TTL:** is a TTL policy on `rate_limits.expiresAt` configured in the Firebase console? Only matters for understanding the old project's size.
9. **SKU uniqueness and money as whole rupees:** both hold in the export; confirm with the owner before enforcing them as constraints.
