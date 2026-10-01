# 02 — Server API map (Vercel functions in `/api`)

Scope: every endpoint and action under `api/`, with authentication, request/response, Firestore work, external calls, idempotency and error handling, plus everything that is Node/Vercel/Firebase specific and must be replaced for Cloudflare Workers + D1 + Drizzle + Better Auth.

Method: static reading of the source only. Nothing was run against live services. Line references are `path:line` in the working tree as of 2026-10-01. Secrets are referred to by env-var name only.

Conventions used below:
- "R" = Firestore document read, "W" = document write, "Q" = query, "TX" = `runTransaction`.
- "P" = number of distinct products in the order, "C" = number of documents in `coupons`.
- "Bearer" = `Authorization: Bearer <Firebase ID token>` verified by `getIdentity` (`api/_lib/http.js:42-58`).

---

## 0. Summary of what exists

| File | Lines | Route | Methods | Dispatch |
|---|---|---|---|---|
| `api/orders.js` | 835 | `/api/orders` | POST | `body.action` (18 actions) |
| `api/payu.js` | 101 | `/api/payu`, `/api/payu?webhook=1` | POST (GET redirects) | query `webhook` |
| `api/webhooks/razorpay.js` | 80 | `/api/webhooks/razorpay` | POST | Razorpay event name |
| `api/admin-config.js` | 730 | `/api/admin-config` | GET, POST, PUT, OPTIONS | query `action` (GET/POST), body key (PUT) |
| `api/customer-auth.js` | 226 | `/api/customer-auth` | POST | `body.action` (`send`, `verify`, `google`) |
| `api/reviews.js` | 312 | `/api/reviews` | POST | `body.action` (4 actions) |
| `api/track.js` | 203 | `/api/track` | POST | `body.event` |
| `api/alerts.js` | 159 | `/api/alerts` | GET, POST | query `wishlist` (GET), `body.action` (POST) |
| `api/sitemap.js` | 88 | `/api/sitemap` (served as `/sitemap.xml`, `vercel.json:4-7`) | GET, HEAD | — |

Shared libraries: `api/_lib/orders.js` (pricing, coupons, finalisation, returns, views), `api/_lib/payu.js` (gateway settings, PayU hashes, Razorpay credentials, result token), `api/_lib/email.js` (Brevo), `api/_lib/cloudinary.js`, `api/_lib/gemini.js`, `api/_lib/http.js`, `api/_lib/firebaseAdmin.js`. Tests (not endpoints): `api/_lib/orders.test.mjs`, `alerts.test.mjs`, `payu.test.mjs` (`package.json:12`).

Vercel configuration that matters to the API: `/sitemap.xml` rewrite (`vercel.json:4-7`), SPA catch-all rewrite (`vercel.json:8-11`), `maxDuration: 60` for `api/admin-config.js` only (`vercel.json:123-127`), security headers for all paths (`vercel.json:23-43`), `noindex`/`no-store` for the admin paths (`vercel.json:44-121`).

**The `/api` folder is not the whole data-access surface.** The browser also talks to Firestore directly with custom tokens minted by the API (`api/_lib/firebaseAdmin.js:30,39-40`). `firestore.rules` shows what must become new server endpoints on Workers because D1 has no browser SDK:
- admin writes to `products`, `categories`, `hero_slides`, `coupons`, `reviews` (`firestore.rules:19-44`);
- admin reads and deletes of `orders` (`firestore.rules:48-52`);
- customer get/create/update of own `profiles/{email}` (cart, wishlist, address) (`firestore.rules:55-58`), read of own `customers/{email}` (`:61-64`);
- public create/update of `abandoned_checkouts` (`:66-69`) and public create of `leads` (`:89-99`);
- public live reads of `storefront_settings` (`:72-75`), public `get` of `product_daily` (`:112-115`);
- admin reads of `visitor_sessions`, `daily_analytics`, `search_terms`, `feature_daily`, `analytics_totals` (`:102-128`), admin read/write of `inventory_log`, `admin_settings` (`:131-138`).
These are outside this document's topic but they add to the endpoint count of the new Worker.

---

## 1. Cross-cutting behaviour

### 1.1 Identity and authentication (three mechanisms today)

1. **Admin cookie** `sag_admin_session` (`api/admin-config.js:48`). Value = `base64url(JSON{username, version, remember, expiresAt}) + "." + base64url(HMAC-SHA256(payload, ADMIN_SESSION_SECRET))` (`:281-293`). Attributes: `HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age=…`, `Secure` only when `process.env.VERCEL === '1'` (`:295-299`). Lifetime 400 days sliding, or 12 hours when `remember === false` (`:51-54`). Validated in `authenticate` (`:307-343`): signature (constant time), expiry, then `username` and `session_version` against `admin_credentials/singleton`. **Only `/api/admin-config` can see this cookie** because of its `Path`.
2. **Firebase ID token with claim `admin: true`**, minted by `createAdminFirebaseToken` (`api/_lib/firebaseAdmin.js:30`, uid `sag-admin` `:9`) and returned by `GET ?action=session` and `POST ?action=login` (`api/admin-config.js:385,556`). Used as Bearer for admin actions in `/api/orders`, `/api/reviews`, `/api/alerts` and for direct Firestore access. Admin tokens are verified twice, the second time with revocation check (`api/_lib/http.js:47-49`).
3. **Firebase ID token with claim `customerEmail`**, minted by `createCustomerFirebaseToken` (`api/_lib/firebaseAdmin.js:39-40`) after email OTP or Google sign-in. uid = `c_` + first 26 hex of SHA-256(lower-case email) (`:36`). `getIdentity` returns `{ admin, email, uid }`; a missing or invalid token silently becomes a guest `{ admin:false, email:'' }` (`api/_lib/http.js:45,55-57`).

The browser picks which token to send per page (`src/lib/api.ts:15-24`).

**Ownership everywhere is by lower-case email, not by uid.** Orders are matched with `order.customerEmail === identity.email` (`api/orders.js:284-289,537,543,554`; `api/_lib/orders.js:559`). `customers` and `profiles` documents are keyed by email (`api/customer-auth.js:125,143`). Better Auth must therefore expose a verified, lower-cased email as the identity, and migrated orders must keep `customerEmail` exactly as stored.

### 1.2 Same-origin check

- `isSameOrigin` (`api/_lib/http.js:24-32`): requires an `Origin` header whose host equals `x-forwarded-host` or `host`. Missing `Origin` is rejected. Used by `/api/orders` (`api/orders.js:810`), `/api/customer-auth` (`:155`), `/api/reviews` (`:301`), `/api/track` (`:59`), `/api/alerts` POST (`:108`).
- `ensureSameOrigin` in admin-config (`api/admin-config.js:345-354`) is looser: a **missing** `Origin` is allowed. Applied to POST/PUT only (`:507`); GET actions are not origin-checked.
- Not origin-checked by design: `/api/payu` (PayU posts cross-site), `/api/webhooks/razorpay`, `/api/sitemap`, `GET /api/alerts?wishlist=`.

### 1.3 Client IP

`clientIp` = first entry of `x-forwarded-for`, else socket address (`api/_lib/http.js:34-36`). admin-config builds its own from `x-forwarded-for` (`api/admin-config.js:512`). On Cloudflare use `CF-Connecting-IP`.

### 1.4 Rate limiting (all stored in Firestore `rate_limits`, one TX = 1R + 1W per check)

| Key | Limit | Where |
|---|---|---|
| `order:<ip>` | 20 / hour | `create` `api/orders.js:345`, `pay-again` `:483` |
| `result:<ip>` | 60 / 10 min | `payment-result` `:459` |
| `track:<ip>` | 30 / 10 min | `track` `:529` |
| `return-photo:<sha256(email)[0:32]>` | 24 / hour | `:569` |
| `return-photo-ip:<ip>` | 60 / hour | `:570` |
| `return:<emailHash>` | 10 / hour | `:594` |
| `cancel:<email>` | 10 / hour | `:664` |
| `admin_login:<ip>` | 10 / 15 min | `api/admin-config.js:513-529` (in-memory fallback `:268-279`) |
| `otp_ip:<ip>` | 15 / hour | `api/customer-auth.js:28-42` |
| `reviews_<day>_submit_<hash(ip)>` | 12 / day | `api/reviews.js:17,173` |
| `reviews_<day>_sign_<hash(email)>` | 10 / day | `:268` |
| `reviews_<day>_signip_<hash(ip)>` | 30 / day | `:269` |
| `reviews_<day>_helpful_<hash(ip)>` | 60 / day | `:248,255` |

Generic limiter: fixed window, `{ windowStart, count, expiresAt }` (`api/orders.js:292-306`). Key is sanitised with `/[^A-Za-z0-9_.:-]/g → _` and cut to 300 chars (`:293`). `verify`, `quote`, `check-coupon`, `gateways`, `my-orders`, `admin-*` have **no** rate limit.

### 1.5 Settings storage

Public settings: one document per key in `storefront_settings`, value stored as a JSON string in `value_json` (`api/admin-config.js:185-186,715-718`; read by `readSetting` `api/_lib/orders.js:18-26`). Allowed keys: `homepageSections, heroConfig, storeSettings, banners, dealOfTheDay, paymentSettings, instagramReels, comboOffer, discovery, auraReels, lookRelations` (`api/admin-config.js:55-67`).

Server-only settings: `private_settings/payment_gateways` (Razorpay key id, key secret, webhook secret; PayU merchant key, salt, mode, enabled) (`api/_lib/payu.js:5,10-23`) and `private_settings/ai_assistant` (Gemini key, model) (`api/_lib/gemini.js:20`). `admin_credentials/singleton` holds `username, password_hash, pin_hash, require_pin, secret_path_slug, allow_direct_admin_route, session_version` (`api/admin-config.js:216-225`). **These three documents contain secret values and must be migrated server-to-server, never through a browser or a chat.**

### 1.6 In-memory state per warm instance (does not exist reliably on Workers)

| State | File | Purpose |
|---|---|---|
| `cache` of gateway settings, 20 s TTL, plus "last known" fallback | `api/_lib/payu.js:8,26-43` | avoid a read per checkout; survive DB outage |
| `lastCredentials`, `firestoreDownUntil`, `fallbackAttempts` | `api/admin-config.js:205,236,268` | admin login when DB is down |
| `lastCatalog` | `api/admin-config.js:239,483,491` | stale catalogue when DB is down |
| `budget` | `api/track.js:32-48` | daily write budget, re-read every 60 s |
| `ladders`, `exhausted` | `api/_lib/gemini.js:10-11` | Gemini model list (6 h) and exhausted models (1 h) |
| Firebase Admin app singleton | `api/_lib/firebaseAdmin.js:11-22` | SDK init |

---

## 2. `/api/orders` — the money path

Handler (`api/orders.js:808-835`): POST only (405 otherwise) → same-origin (403) → `actions[body.action]` (400 `Unknown action.`) → `getIdentity` → action raced against a **25 s budget** (`:818-820`).

Error mapping (`:822-834`):
- `UserError` (has `userFacing`) → its own status and message (`api/_lib/orders.js:10-16`).
- `ORDERS_TIMEOUT`, gRPC code 8, or message matching `RESOURCE_EXHAUSTED|quota` → 503 "The store is very busy… No money has been taken."
- `PAYMENT_NOT_CONFIGURED` → 503; `PAYU_VERIFY_FAILED` → 502; `PAYMENT_GATEWAY_ERROR` → 502; `SERVER_CONFIG_MISSING` → 503; anything else → 500 generic.

All responses are JSON with `Cache-Control: no-store, max-age=0` (`api/_lib/http.js:4-9`).

### 2.1 Pricing engine `priceCart(db, rawItems, couponCode, customer)` (`api/_lib/orders.js:284-389`)

Input per line: `{ productId, size, color:{name,hex}, quantity, parentId }`; every string is cleaned and length-capped (`:288-294`). The browser never supplies a price.

Steps and invariants (order matters):
1. Non-empty array, at most `MAX_LINES = 20` lines (`:6-7,285-286`).
2. Each quantity is an integer 1..`MAX_QTY_PER_LINE = 10` (`:297-299`).
3. One batched read of the distinct products (`db.getAll`, `:302-304`). Missing or `hidden` product → 409 (`:305-308`).
4. `checkLookAccessories` (`:246-277`): a product with `productType === 'accessory'` must have a `parentId` that is in the same order, not hidden, not itself an accessory, and has a non-empty `setType`; if the admin's `lookRelations[parentId]` has published picks, the accessory must be one of them; accessory quantity per `(parent, accessory)` must not exceed the parent's pieces. Reads `storefront_settings/lookRelations` (1R) and up to 60 pick products (`:254-258`), only when the cart has an accessory (`:248`).
5. Size must be in `product.sizes` when that array is non-empty (`:315-318`).
6. Unit price = `max(0, round(product.price))`; a price ≤ 0 is rejected (`:320-321`). `originalPrice = max(price, round(originalPrice || price))` (`:335`).
7. Line id = `<productId>-<size>-<colourName|default>[-look-<parentId>]` (`:325`). Line stores a snapshot `{id,name,sku,category,image,images,price,originalPrice}` (`:327-336`); colour defaults to `{name:'Default',hex:''}` (`:338`).
8. Stock check per product (summed across lines): `inStock === false` or `stockQuantity <= 0` → "sold out"; quantity above stock → "Only N left" (`:343-348`). **This is a check only; nothing is reserved.**
9. `subtotal = Σ price × qty` (`:350`).
10. Pricing rules from `storeSettings` and `comboOffer` (2R, `readPricingRules` `:51-64`): combo percent clamped 0..50, `comboMinItems ≥ 2`, `shippingCharge ≥ 0`, `freeShippingThreshold ≥ 0`, `prepaidDiscount ≥ 0`, plus checkout rules (`:69-81`).
11. **Combo discount** = `round(subtotal × percent / 100)` when enabled and the number of non-accessory pieces ≥ `comboMinItems` (`:353,356`). Accessories never count toward the minimum but the percentage applies to the whole subtotal.
12. **Coupon** (only if a code is sent, `:360-366`): validated against the **pre-combo subtotal**; discount base is the post-combo amount, or, for a category/product-limited coupon, `round(afterCombo × eligibleSubtotal / subtotal)` (`:364`); `couponDiscount = min(couponDiscountFor(coupon, base), afterCombo)` (`:365`).
13. **Shipping** = 0 when `freeShippingThreshold > 0` and `subtotal ≥ threshold` (pre-discount subtotal), else `shippingCharge` (`:367`).
14. **Prepaid discount** = `min(rules.prepaidDiscount, max(0, afterCoupon − 1))` (`:369`).
15. Min/max order check on `afterCoupon − prepaidDiscount` (before shipping) (`:371`, `checkOrderLimits` `:124-132`).
16. `finalTotal = afterCoupon − prepaidDiscount + shippingCharge`; must be ≥ 1 (`:372-373`).
17. Returns `lines, subtotal, couponCode (upper-case), couponId, couponDiscount, comboDiscount, prepaidDiscount, shippingCharge, discountAmount (sum of the three), finalTotal, deliveryRules` (`:375-388`).

Coupon rules (`validateCoupon` `:207-236`):
- Global switch `storeSettings.couponsEnabled !== false` (`:75,209-210`).
- `findCoupon` reads the **entire `coupons` collection** and matches `code` case-insensitively after trim (`:152-158`) — C reads per coupon check.
- Window (`couponWindowError` `:134-150`): `isActive !== false`; `startDate` not in the future; `expiryDate` inclusive to 23:59:59.999 **in the server's local time zone** (`end.setHours(...)` `:143`; UTC on Vercel, so the coupon really ends 05:29:59 IST next day); `usageLimit > 0 && usageCount >= usageLimit` → refused.
- `minOrderValue` compared with the pre-combo subtotal (`:215-218`).
- Category/product scope: `couponEligibleSubtotal` (`:177-185`), category match is trimmed lower-case, product match is exact id.
- Per-customer limit `perUserLimit` (`:228-234`): counts distinct **Paid** orders with the same `couponCode` and the same `customerEmail` or `customerMobile` (2 queries, each `limit(perUser)`, `:191-200`). Only enforced when a customer is passed, i.e. in `create` (`api/orders.js:346`), **not** in `quote` (`:311`) or `check-coupon` (`:317`).
- Discount (`couponDiscountFor` `:160-167`): `fixed` → value; otherwise `round(base × value / 100)` capped by `maxDiscount` (percentage coupons only), never above the base.

Delivery estimate (`estimateDelivery` `:104-121`): processing + delivery working days, Sundays skipped, counted in IST, stored as noon IST; `null` when delivery days are not configured.

Order number (`newOrderNumber` `:391-398`): `SAG-YYMMDD-XXXXX`, date in UTC, 5 characters from a 32-character alphabet via `crypto.randomInt`.

### 2.2 Actions

#### `quote` (`api/orders.js:310-313`)
- Caller: anyone (guest). Body: `{ items, couponCode }`.
- Response: `{ quote: { subtotal, couponCode, couponId, couponDiscount, comboDiscount, prepaidDiscount, shippingCharge, discountAmount, finalTotal } }` (`lines` and `deliveryRules` removed).
- Firestore: P R (products) + 2 R (settings) + [1 R + ≤60 R if accessories] + [C R if coupon]. No writes.

#### `check-coupon` (`:315-333`)
- Caller: anyone. Body: `{ couponCode, subtotal }` — **subtotal comes from the browser**, preview only.
- Response: `{ coupon: { id, code, discountType, discountValue, maxDiscount?, minOrderValue, description }, discount }`.
- Firestore: 1 R (`storeSettings`) + C R. No category/product or per-customer check here.

#### `gateways` (`:336-338`)
- Caller: anyone. Response: `{ gateways: { razorpay: bool, payu: bool } }` via `publicGateways` (`api/_lib/payu.js:69-72`): a gateway is offered only when enabled and configured, and a **test-mode gateway is offered only to the admin**.
- Firestore: 0–1 R (`private_settings/payment_gateways`, 20 s cache, 3 s timeout with last-known/default fallback `api/_lib/payu.js:26-43`).

#### `create` (`:340-450`) — creates the unpaid order and the payment session
- Caller: guest or signed-in customer. Body: `{ address, items, couponCode, gateway, giftNote, attemptKey }`.
- Address validation (`validateAddress` `:135-161`): name ≥ 2 chars; mobile `^[6-9]\d{9}$` (last 10 digits); valid email (lower-cased); `houseFlat` ≥ 3 chars; city; state; PIN `^[1-9]\d{5}$`; optional `altMobile` silently dropped if invalid; `type` ∈ Home/Work/Other.
- `attemptKey` accepted only if `^[A-Za-z0-9_-]{16,64}$`, otherwise treated as empty (`:342`).
- In parallel (`:344-349`): rate limit `order:<ip>` (TX 1R+1W); `priceCart` with customer `{ email: identity.email || address.email, phone: address.mobile }`; `readGateways`; query `orders where attemptKey == key limit 1` (1 Q).
- `customerEmail = identity.email || address.email` (`:352`). A signed-in customer's order always belongs to the signed-in email even if the address email differs.
- Gateway choice (`pickGateway` `:84-90`): requested gateway if available, else Razorpay, else PayU, else 503 "Online payment is paused".
- **Duplicate-order protection** (`:357-381`): if an earlier order with the same `attemptKey` exists **and** has the same `customerEmail`:
  - already `Paid` → `{ alreadyPaid: true, orderNumber, order: ownerOrderView }` (no new order, no new charge);
  - else if created < 30 minutes ago, `round(finalTotal)` unchanged, `status === 'Pending'`, `paymentStatus === 'Unpaid'` → the same order is reused: address, name, mobile, gift note updated; for PayU a **new txn id** `<orderNumber>-<n+1>` is appended to `payuTxnIds`; for Razorpay the existing `razorpayOrderId` is reused, or one is created if the order had none (1 W, + 1 Razorpay call in that case).
  - otherwise falls through and a new order is created (with the same `attemptKey`).
- New order (`:383-449`): up to 4 attempts; each attempt does `orderRef.get()` (1 R) **in parallel with** the Razorpay order creation, skips if the number exists, then `orderRef.create(order)` (1 W, fails on existing document; gRPC code 6 → retry `:441-446`). A collision therefore leaves an unused Razorpay order behind (harmless).
- Razorpay order (`createRazorpayOrder` `:45-62`): `POST https://api.razorpay.com/v1/orders`, Basic auth `keyId:secret`, body `{ amount: round(finalTotal × 100), currency: 'INR', receipt: orderNumber, notes: { order_number, customer_email } }`. Failure → `PAYMENT_GATEWAY_ERROR` (502); missing keys → `PAYMENT_NOT_CONFIGURED` (503).
- Stored order document (`:400-440`): `orderNumber, date, status:'Pending', paymentStatus:'Unpaid', paymentMethod, paymentRef:'', razorpayOrderId, razorpayOrderIds[], payuTxnId, payuTxnIds[], attemptKey, customerEmail, customerName, customerMobile, customerUid, deliveryAddress{…14 fields}, items[], subtotal, couponCode, couponId, couponDiscount, comboDiscount, prepaidDiscount, discountAmount, shippingCharge, finalTotal, giftNote, estimatedDeliveryDate, deliveryEstimateSource, expectedDeliveryDate, trackingNumber, courierPartner, trackingUrl, notes, timeline[{status,at,note}], stockDeducted:false, createdAt, updatedAt`.
- Response (`paymentSessionBody` `:92-105`):
  - Razorpay: `{ gateway:'razorpay', orderNumber, razorpayOrderId, amount (paise), currency:'INR', keyId, order: publicOrderView }`.
  - PayU: `{ gateway:'payu', orderNumber, order: publicOrderView, payuAction, payuFields }` (see 2.4).
- Firestore total (new Razorpay order, no coupon, no accessories): TX(1R+1W) + P R + 2 R + 0–1 R + 1 Q + 1 R + 1 W.
- **No stock is reserved and the coupon is not consumed at this point.**

#### `verify` (`:506-522`) — Razorpay checkout callback from the browser
- Caller: anyone; **no sign-in and no rate limit**; trust comes only from the signature.
- Body: `{ orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature }`. `orderNumber` is cleaned but **not upper-cased** here (`:507`), unlike other actions.
- Check: `HMAC-SHA256(key_secret, "<razorpay_order_id>|<razorpay_payment_id>")` hex, constant-time compare (`:514-515`, `safeEqualHex` `:39-43`). Mismatch → 400.
- Then `finalizePaidOrder(orderNumber, { paymentId, razorpayOrderId, source:'checkout' })` which also checks that the Razorpay order id belongs to this order (see 2.3).
- If `changed`: customer confirmation email (`notify(…,'confirmed')` `:171-182`, logs to `emailLog`, 1 W) and store alert (`alertStoreOfNewOrder` `api/_lib/orders.js:39-48`, 1 R of `storeSettings`).
- Response: `{ order: ownerOrderView(order) }` — the verified payer receives the full address and payment reference.

#### `payment-result` (`:454-478`) — result page / "check payment"
- Caller: holder of a signed result token **or** the signed-in owner. Body: `{ orderNumber, token }`.
- Token (`api/_lib/payu.js:144-157`): `<ts>.<first 40 hex of HMAC-SHA256(ADMIN_SESSION_SECRET, "payment-result:<orderNumber>:<ts>")>`, valid 2 days, at most 60 s in the future. Issued only after PayU's response hash was verified (`api/payu.js:44-47`).
- Without a valid token and without a signed-in email → 401. Rate limit `result:<ip>`.
- Loads the order (1 R). While `paymentStatus === 'Unpaid'` it asks the gateway (`:463-476`):
  - PayU: `reconcilePayu` (`:124-133`) — fresh gateway settings (1 R), `payuVerifyTransaction` on the **latest** `payuTxnId` only; success + amount within ₹0.50 → `finalizePaidOrder(source:'payu')`; else `pending` / `failed`.
  - Razorpay: `reconcileRazorpay` (`:108-121`) — for up to the last 5 known Razorpay order ids, `GET https://api.razorpay.com/v1/orders/<id>/payments`; first payment with `status === 'captured'` → `finalizePaidOrder(source:'reconcile')`.
  - If finalised and `changed`: confirmation email + store alert.
  - Any error → `gatewayNote: 'unknown'` (never throws).
- Response: `{ order: ownerOrderView, paid: bool, gatewayNote: ''|'pending'|'failed'|'unknown' }`.

#### `pay-again` (`:481-504`)
- Caller: signed-in owner only (401 otherwise). Rate limit `order:<ip>`. Body: `{ orderNumber, gateway? }`.
- Already paid → `{ alreadyPaid:true, orderNumber, order }`. Must be `Unpaid` + `Pending` (409 otherwise) and created ≤ 3 days ago (409 "expired").
- **Prices are not recomputed**: the stored `finalTotal` is charged again. Stock and coupon validity are not rechecked.
- PayU: new txn id `<orderNumber>-<n+1>`. Razorpay: **always a new Razorpay order**, appended to `razorpayOrderIds` (old ids kept so a late payment on an old one still matches) (`:494-501`).
- 1 R + 1 W + rate limit TX; 1 Razorpay call.

#### `track` (`:525-550`) — guest lookup
- Body: `{ orderNumber, contact }`. Rate limit `track:<ip>`. 1 R.
- Access if admin, or signed-in email equals `customerEmail`, or `contact` equals the order email (lower-case), or the last 10 digits of `contact` equal the order mobile. Otherwise 404 with a message that does not reveal existence.
- Views: owner → `ownerOrderView`; admin → owner view without `returnEligibility`; guest → `publicOrderView` (no address, phone, email, name, payment reference; timeline without notes) (`api/_lib/orders.js:1044-1129`).

#### `my-orders` (`:552-562`)
- Signed-in only. 1 Q: all orders with `customerEmail == identity.email` (no limit). Unpaid orders are listed only while `Pending` and < 3 days old. Sorted by `date` descending. Response `{ orders: ownerOrderView[] }`.

#### `return-photo-sign` (`:565-586`)
- Signed-in owner of an order that can currently be returned (`returnBlockReason`). Two rate limits. Creates `return_photos/<key>` = `{ owner: emailHash, orderNumber, attachedAt:'', issuedAt }` (1 W, `create`).
- Key `rt_<24 hex>` from `randomBytes(12)`. Signature (`returnPhotoSignature` `:275-281`): SHA-1 of the sorted `allowed_formats=jpg,png,webp,heic,heif&overwrite=false&public_id=suitauragirls/returns/<key>&timestamp=<s>` + `CLOUDINARY_API_SECRET`.
- Response `{ cloudName, apiKey, fields, signature }`. The browser uploads directly to Cloudinary.

#### `return-request` (`:590-658`)
- Signed-in owner. Rate limit `return:<emailHash>`. Body: `{ orderNumber, type:'return'|'exchange', items:[{line, qty, exchangeSize?}], reason, details, photos:[url] }`; legacy body `{ orderNumber, reason }` is turned into "return everything still returnable" (`:599-601`).
- Rules (`api/_lib/orders.js:588-827`): order `Delivered` and `Paid`; one open request at a time; at most `RETURN_MAX_REQUESTS = 3` per order; window ends 23:59:59 IST on the 7th day after the delivery day (`:614-619`), delivery time = latest `Delivered` timeline entry (`:604-608`), unknown delivery date = no window limit; pieces already refunded/exchanged cannot be requested again (`returnableQty` `:716-719`); clearance lines (price ≤ 50% of original) are exchange-only (`:628-632,790-792`); reasons list `:589`; photo required for "Damaged / defective" and "Wrong item received" (`:591,825`); max 4 photos (`:592`); each photo URL must match this store's Cloudinary pattern for `suitauragirls/returns/rt_<24hex>` (`returnPhotoKey` `:747-754`) **and** its `return_photos` record must belong to this customer and order and be unattached (`api/orders.js:626-631`).
- Exchange sizes are checked against the live product `sizes` (P R, `:608-612`).
- TX (`:617-644`): reads order + ≤4 photo records; re-validates everything; writes `returnRequest` (`status:'requested'`, history), a timeline entry, moves any earlier request to `pastReturnRequests`, marks photos `attachedAt`. 1 + ≤4 R, 1 + ≤4 W.
- Then emails the store (`sendReturnRequestAlert`), and records `storeNotified` on the request in a second TX (`recordReturnRequestAlert` `api/_lib/orders.js:945-952`).
- Response `{ order: ownerOrderView, message }`.

#### `request-cancel` (`:662-680`)
- Signed-in owner. Rate limit `cancel:<email>`. Body `{ orderNumber, reason }` (reason ≥ 3 chars).
- `requestCancellation` (`api/_lib/orders.js:547-571`): 1 R `storeSettings`, then TX (1R+1W). Allowed only if `Paid`, status `Pending`/`Processing`, no existing request, not refunded, and inside `cancellationWindowHours` from `paidAt` when that is > 0 (`cancelBlockReason` `:525-540`).
- **Nothing is cancelled or refunded automatically.** Writes `cancelRequest: { reason, at }` + timeline entry, emails the store, records `storeNotified` (second TX).

#### `admin-update` (`:737-805`) — admin only (Bearer with `admin` claim; 401 otherwise)
- Body: `orderNumber` plus any of `status, paymentStatus, paymentRef, trackingNumber, courierPartner, trackingUrl, expectedDeliveryDate, deliveryAgentName, deliveryAgentPhone, notes, customerNote, timelineNote, cancelRequestHandled, notify`.
- Validation before any write: status ∈ `ORDER_STATUSES` (`api/_lib/orders.js:490`); `paymentStatus` ∈ Paid/Unpaid/Refunded; tracking link https only, no credentials, ≤ 500 chars (`cleanTrackingUrl` `:1000-1013`); expected date a real `YYYY-MM-DD` between 2024 and 2100 (`:1016-1025`).
- `paymentStatus: 'Paid'` by hand runs the **same** `finalizePaidOrder` (stock + coupon + analytics) with `source:'admin'` and `paymentId = body.paymentRef || 'manual-by-admin'` (`:749-756`). No Razorpay-id check applies (none is passed).
- TX (`:758-798`): 1 R; fields updated only when the key is present in the body; status change appends a timeline entry; `Refunded` also sets `paymentStatus: 'Refunded'` and closes an open **return** request as refunded (`closeReturnOnRefund` `api/_lib/orders.js:929-942`); `Cancelled` or `Refunded` **restores stock** (below); an open cancel request is closed as `cancelled` or `kept` (`cancelRequestOutcome` `:505-512`).
- Stock restore (`restoreOrderStock` `:470-488`): only if `stockDeducted`; adds back exactly `deductedQuantities[productId]`; sets `inStock = next > 0`; afterwards `stockDeducted:false, deductedQuantities:{}` so a second call does nothing.
- Emails after the TX: "cancellation kept" mail when a request was kept and (`cancelRequestHandled === true` or `notify !== false`) (`:802`, `notifyCustomerCancelKept` `:187-212`); status mail when the status changed and `notify !== false` (`:803`). Templates exist only for `confirmed, Packed, Shipped, In Transit, Out for Delivery, Delivered, Cancelled, Refunded` (`api/_lib/email.js:98-142`); other statuses send nothing.
- Response `{ order (full document), cancelKeptEmailSent? }`.
- Not done by this action: no Razorpay/PayU refund call, coupon `usageCount` is not decremented, `daily_analytics.purchases` is not decremented. Setting `paymentStatus` to `Unpaid`/`Refunded` directly (without the status) does **not** restore stock (`:771`, restore only at `:787-789`).

#### `admin-return` (`:719-734`) — admin only
- Body `{ orderNumber, returnAction: approve|reject|receive|refund|exchange, note, notify }`. `orderNumber` is not upper-cased here (`:721`).
- State machine (`RETURN_ACTIONS` `api/_lib/orders.js:833-839`): `approve` from requested (note required); `reject` from requested/approved/received (note required); `receive` from approved; `refund` from approved/received, return type only; `exchange` from approved/received, exchange type only. Legacy requests are upgraded on first action (`:888-891`).
- `refund` sets the whole order to `Refunded` + `paymentStatus: 'Refunded'` **only** when every piece of every line has been refunded (`:851-856,912-916`). **Stock is not restored on this path** (`:580-581`), unlike `admin-update → Refunded`.
- TX 1R+1W, then customer email (`sendReturnUpdateEmail`) and `emailLog` update (1 W) unless `notify === false`.
- Response `{ order, customerEmailed }`.

#### `admin-test-email` (`:682-698`) and `admin-email-events` (`:701-716`) — admin only
- Test email: one Brevo send to `body.email`; 502 with a readable message on failure.
- Events: `GET https://api.brevo.com/v3/smtp/statistics/events?limit=20&email=…` and `GET https://api.brevo.com/v3/senders`; returns `{ configuredSender, senders[], events[] }`. No Firestore.

### 2.3 `finalizePaidOrder` — the single "mark paid" path (`api/_lib/orders.js:406-467`)

Called from: `verify` (`api/orders.js:517`), `reconcileRazorpay` (`:118`), `reconcilePayu` (`:132`), `admin-update` (`:753`), Razorpay webhook (`api/webhooks/razorpay.js:67`), PayU callback/webhook (`api/payu.js:73`).

Inside one Firestore transaction:
1. Read the order; missing → `UserError 404`.
2. If a `razorpayOrderId` is supplied it must be in `[order.razorpayOrderId, ...order.razorpayOrderIds]`, else `UserError 400 'Payment does not match this order.'` (`:413-414`).
3. **Idempotency**: if `paymentStatus` is `Paid` or `Refunded` → return `{ order, changed:false }` with no writes (`:415`).
4. Sum quantities per product id from `order.items`; read all those products and the coupon (if `couponId`) inside the TX (`:417-425`).
5. For each product: `take = min(available, wanted)`; `stockQuantity = available − take` (never negative); `inStock = next > 0 && data.inStock !== false`; record `deducted[id] = take`; if `take < wanted` add to `shortfall` (missing product = shortfall with available 0) (`:427-442`). **An oversold order is still marked paid**; the shortfall is written to `stockShortfall` and appended to `notes` for the admin (`:458-460`).
6. Coupon: `usageCount += 1` if the coupon document still exists (`:443`). The usage limit is **not** rechecked here.
7. Order update: `paymentStatus:'Paid', paymentRef, paidAt, paidVia: source, status:'Processing', stockDeducted:true, deductedQuantities, stockShortfall, timeline += {'Processing','Payment received'}, updatedAt` (`:445-457`).
8. `daily_analytics/<UTC day>`: `purchases += 1` (merge) (`:463-464`).
9. Return `{ order: merged, changed:true }`.

Reads: 1 + P + (0|1). Writes: P + (0|1) + 1 + 1.

Emails are sent by the callers **only when `changed` is true**, so each paid order produces one confirmation and one store alert no matter how many of the four paths fire.

### 2.4 PayU

Session fields (`payuSession` `api/orders.js:65-81`): `key, txnid, amount = payuAmount(finalTotal)` (2 decimals, `api/_lib/payu.js:82`), `productinfo = "Order <orderNumber>"`, `firstname` = customer name with everything except `A-Za-z0-9 .` replaced by a space, trimmed, ≤ 60 chars, default `Customer`, `email`, `phone` (last 10 digits), `udf1 = orderNumber`, `surl = furl = https://www.suitauragirls.in/api/payu`, `hash`.

Request hash (`payuRequestHash` `api/_lib/payu.js:85-87`): SHA-512 hex of
`key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT`.

Response hash (`payuResponseHash` `:90-95`): SHA-512 hex of
`[additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key`.

Pay URL / verify URL (`payuUrls` `:76-78`): live `https://secure.payu.in/_payment`, `https://info.payu.in/merchant/postservice?form=2`; test `https://test.payu.in/_payment`, `https://test.payu.in/merchant/postservice.php?form=2`.

Verify API (`payuVerifyOnce` `:123-141`): form POST `key, command=verify_payment, var1=txnid, hash = SHA-512("key|verify_payment|txnid|salt")`; reads `transaction_details[txnid]` → `{ status, amount (amt | transaction_amount), mihpayid, mode, error }`. `payuVerifyTransaction` retries up to 3 times while pending or failing, sleeping 1.5 s then 3 s (`:108-121`).

**`/api/payu` handler** (`api/payu.js:35-101`):
- `GET` → 303 to `/checkout` (browser) or 405 (webhook).
- Body may be a parsed object, a Buffer or a string; form-encoded or JSON (`fieldsFrom` `:13-21`). Every field is cut to 500 chars.
- `txnid` and `udf1` (order number, upper-cased) required.
- Gateway settings read **fresh** (1 R, `:52`).
- `f.key` must equal the merchant key and the response hash must match (constant-time, case-insensitive `sameHex` `api/_lib/payu.js:97-101`). Otherwise 401 (webhook) or redirect to `/checkout?payment=failed` with **no** signed token.
- Order read (1 R); `txnid` must be in `order.payuTxnIds`; otherwise ignored.
- Already `Paid` → nothing changes (`:68`).
- **PayU's own verify API decides**, not the POST: success and `|amount − finalTotal| ≤ 0.5` → `finalizePaidOrder(source: 'payu' | 'payu-webhook')` with `paymentId = mihpayid || txnid`.
- Test mode (`gateways.payu.mode !== 'live'`): order flagged `testPayment:true` with a note, **no** customer email and no store alert (`:74-76`). Stock is still deducted and the coupon still counted because `finalizePaidOrder` ran.
- Live mode and `changed`: confirmation email, `emailLog` append, store alert (`:77-82`).
- Not success and not pending → timeline entry `Payment failed` (1 W) (`:89-94`).
- Browser flow always ends in a 303 to `/checkout?payment=done|pending|failed&order=…&t=<result token>[&reason=…]` (`:45-47`); any exception → `pending` (the result page re-checks) (`:96-100`). Webhook flow returns JSON 200/401/400/500.

Difference to keep in mind: when a sandbox payment is finalised through `payment-result` instead of `/api/payu`, `testPayment` is not set, so the customer mail and store alert are sent (`api/orders.js:466-469`; `alertStoreOfNewOrder` only skips when `order.testPayment` is already set, `api/_lib/orders.js:41`). Sandbox is only offered to the admin, so this is an admin-only edge.

### 2.5 Razorpay webhook `POST /api/webhooks/razorpay` (`api/webhooks/razorpay.js`)

- Body parser disabled; the raw body is read from the stream (`:8-16`) because the signature covers the exact bytes.
- Secrets: the admin-saved webhook secret and `RAZORPAY_WEBHOOK_SECRET`, both accepted (`:31-37`, `api/_lib/payu.js:60`). None → 503.
- Signature: header `x-razorpay-signature` must equal hex `HMAC-SHA256(secret, rawBody)` (constant time) for any accepted secret (`:39-44`). Else 401.
- Events handled: `payment.captured`, `order.paid`; everything else → 200 `{ignored:true}` (`:52`).
- Order lookup: `order.entity.receipt` or `payment.notes.order_number`; fallback query `orders where razorpayOrderId == id limit 1` (`:60-65`). Note the fallback only matches the **current** `razorpayOrderId`, not older ones in `razorpayOrderIds`.
- `finalizePaidOrder(source:'webhook')`; on `changed` → confirmation email + `emailLog` + store alert.
- Any exception (including "Order not found" and "Payment does not match this order") → 500 so Razorpay retries (`:75-79`).
- The paid amount is **not** compared with `finalTotal` on the Razorpay paths; the amount is bound through the Razorpay order (created server-side with `round(finalTotal × 100)`) and the order-id membership check.

### 2.6 Money-path invariants (must be reproduced exactly)

1. The browser sends only product ids, sizes, colours, quantities, a coupon code and an address. Every rupee amount is recomputed from the database (`api/_lib/orders.js:284-389`).
2. All amounts are whole rupees. Rounding points: unit price, combo discount, percentage coupon, proportional coupon base. Razorpay amount = `round(finalTotal × 100)` paise; PayU amount = `toFixed(2)`.
3. Discount order: combo (on full subtotal) → coupon (on post-combo, or its eligible share) → prepaid discount (leaves at least ₹1) → shipping added last. Free shipping is decided on the pre-discount subtotal. Min/max order applies to the amount after all discounts and before shipping. `finalTotal ≥ 1`.
4. Limits: ≤ 20 lines, 1–10 per line, combo percent ≤ 50.
5. Accessories only with their outfit, never more than the outfit's pieces, and only the admin's published picks when picks exist.
6. Stock is **checked** at pricing and **deducted** only when payment is confirmed; deduction never goes below zero; a shortfall never blocks marking the order paid and is recorded for the admin.
7. An order becomes paid through exactly one function, at most once (guarded by `paymentStatus` inside a transaction). Stock deduction, coupon `usageCount + 1`, order update and `daily_analytics.purchases + 1` are atomic together.
8. Coupon usage is counted at payment, not at order creation. Usage limit and per-customer limit are enforced only at pricing time (a small over-use race exists today).
9. A Razorpay payment is accepted only if (a) the checkout signature or webhook signature is valid and (b) its Razorpay order id is one this order has ever been given.
10. A PayU payment is accepted only if (a) the response hash and merchant key match, (b) the txn id is one this order has been given, and (c) PayU's verify API reports `success` with the amount within ₹0.50 of `finalTotal`.
11. Duplicate checkout protection: same `attemptKey` + same email → reuse the unpaid order for 30 minutes if the total is unchanged, or report `alreadyPaid`.
12. `pay-again` keeps the order number and the original prices, is limited to the owner, `Unpaid` + `Pending`, ≤ 3 days old. Old Razorpay order ids and old PayU txn ids stay valid for late payments.
13. A late confirmed payment finalises the order whatever its `status` is (for example an unpaid order the admin already set to `Cancelled` becomes `Paid` / `Processing`), because the guard looks only at `paymentStatus` (`api/_lib/orders.js:415`).
14. Confirmation email and store alert are sent only by the call that actually changed the order. Email failures never fail the payment.
15. Cancellation and return requests never move money. Refunds are done by the owner in the gateway dashboard; the API only records them. There is no refund API call anywhere in `/api`.
16. Stock comes back only through `admin-update` when the status becomes `Cancelled` or `Refunded`, exactly once, using the recorded `deductedQuantities`.
17. Sandbox gateways are visible only to the admin (`publicGateways`).
18. Guests never receive the address, phone, email, name, payment reference or timeline notes (`publicOrderView`).
19. Secrets (Razorpay key secret, webhook secret, PayU salt, Gemini key, Cloudinary API secret) are never returned to any client; only hints of the last 4 characters (`api/admin-config.js:7,18-39`, `api/_lib/gemini.js:42-47`).

---

## 3. `/api/admin-config`

Top-level: `OPTIONS` → 204 (`api/admin-config.js:363-366`). Catch-all error mapping (`:722-729`): `INVALID_UPLOAD_FOLDER` → 400; `CLOUDINARY_CONFIG_MISSING` → 503; `SERVER_CONFIG_MISSING` / `ADMIN_BOOTSTRAP_CONFIG_MISSING` → 503; else 500. `parseBody` here throws on invalid JSON (`:356-360`) → 500.

### GET actions (query `action`)

| Action | Auth | Firestore | External | Response |
|---|---|---|---|---|
| `session` (`:374-387`) | admin cookie | 1 R credentials (2.5 s timeout, falls back to memory/env when DB is down) | Firebase custom-token signing (local RSA) | `{ success, username, sessionVersion, firebaseToken }`; re-issues the cookie (sliding expiry) |
| `payment-gateways` (`:390-395`) | admin cookie | 1 R credentials + 1 R gateways | — | `{ gateways: adminGatewayView }` (`:18-46`): flags, mode, key id, hints, the four callback URLs |
| `ai-assistant` (`:398-402`) | admin cookie | 1 R + 1 R (1.5 s timeout) | — | `{ ai: { fromServer, configured, keyHint, model } }` |
| `razorpay-payments` (`:405-423`) | admin cookie | 1 R + 1 R | `GET https://api.razorpay.com/v1/payments?count=25` | `{ mode, payments[{at,status,method,amount,orderId,upiFlow,app,error,reason,source,step}] }`; 502 on gateway error |
| `security` (`:425-438`) | admin cookie | 1 R | — | `{ securityConfig: { adminUsername, adminPassword:'', securityPin:'', requirePin, secretPathSlug, allowDirectAdminRoute, sessionVersion } }` |
| `catalog` (`:457-501`) | **public** | 5 collection reads in parallel: all `storefront_settings`, all `products`, all `categories`, `reviews where status == approved`, all `coupons` (5 s timeout) | — | `{ settings, products (not hidden), categories, reviews (public fields, newest 300), coupons (public fields, active only), generatedAt }` with `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=600` |
| anything else / none (`:503-504`) | **public** | all `storefront_settings` | — | `{ settings }` (public keys only, sanitised) |

Catalogue details: on failure it serves the in-memory `lastCatalog` with `s-maxage=60`, else 503 uncached (`:489-500`). Review fields exposed: `productId, productName, userName, rating, comment, adminReply, date, verifiedPurchase, sizePurchased, location, imageUrl, helpfulCount, createdAt` (`:474`). Coupon fields exposed: `code, discountType, discountValue, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit, usageCount, isActive, perUserLimit, allowedCategories, allowedProductIds` (`:479`). **This endpoint depends on Vercel's CDN honouring `s-maxage`**; it is how the store keeps database reads low.

### POST actions

- **`login`** (`:510-558`) — public, same-origin (missing Origin allowed). Body `{ username, password, pin, remember }`.
  - Rate limit `admin_login:<ip>` (TX 1R+1W), then credentials read (1 R) with bootstrap: if `admin_credentials/singleton` does not exist it is created from `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_INITIAL_PIN` (`:206-228`).
  - Password and PIN are stored as `saltHex:hashHex` using `scryptSync(value, salt, 64)` with a 16-byte random salt (`:188-201`). Username compare is case-insensitive (`:544`). PIN is checked only when `require_pin`.
  - DB-down fallback (`:531-542`): in-memory attempt counter; last credentials seen by this instance, else the plain `ADMIN_INITIAL_*` values compared in constant time (`sameText` `:263-267`).
  - Success: sets the cookie, returns `{ success, username, sessionVersion, firebaseToken }`. Failure: 401 `Invalid admin credentials.`; 429 after 10 attempts.
- **`logout`** (`:560-564`) — clears the cookie and revokes Firebase refresh tokens for the admin uid. It does **not** bump `session_version`, so a copied cookie stays valid until expiry.
- **`cloudinary-sign`** (`:566-569`) — admin cookie. Body `{ folder }` ∈ `product-images, banners, hero, deals, categories, reels, reviews, returns` (`api/_lib/cloudinary.js:5`). Returns `{ cloudName, apiKey, folder: 'suitauragirls/<folder>', timestamp, signature }` (SHA-1 of sorted params + secret, `:15-26`).
- **`cloudinary-delete`** (`:570-573`) — admin cookie. Body `{ urls[] | url }` (max 50). For each: `POST https://api.cloudinary.com/v1_1/<cloud>/<image|video>/destroy` (`api/_lib/cloudinary.js:50-64`); only assets under the `suitauragirls` root of this cloud are accepted; videos add `invalidate=true`. Response 200 or **207** `{ success, failed[] }`.
- **`ai-describe`** (`:576-601`) — admin cookie. Body `{ images[], department, categories, setTypes, kinds, ages, name }`. Reads the Gemini key (1 R with 1.5 s timeout, env fallback `GEMINI_API_KEY`). Calls (`api/_lib/gemini.js`): `GET …/v1beta/models?pageSize=200` (8 s, cached 6 h in memory), up to 6 photo downloads from this store's Cloudinary (10 s each, ≤ 4 MB, base64-encoded), then `POST …/models/<model>:generateContent` (20 s each, up to 2 tries per model, overall 34 s budget). Returns `{ success, model, saveModel, photosRead, draft{…} }`. Errors map to 400/429/502 with a `code`.

### PUT (admin cookie required, `:603-721`) — dispatched by body key

- **`securityConfig`** (`:608-630`): refuses in DB-down fallback (503). Password ≥ 8 chars; PIN exactly 6 digits when PIN is required. Writes new credentials with `session_version + 1` (1 W), revokes Firebase admin sessions, re-issues the cookie. This signs out every other device.
- **`aiAssistant`** (`:633-649`): `{ clear:true }` or `{ geminiKey }` (shape `^[A-Za-z0-9._-]{20,160}$`, then checked with Google via `pickModel`). 1 W to `private_settings/ai_assistant`.
- **`paymentGateways`** (`:652-693`): 1 R current; validates PayU key `^[A-Za-z0-9]{4,40}$`, salt `^[A-Za-z0-9+/=_-]{8,200}$`, Razorpay key id `^rzp_(live|test)_[A-Za-z0-9]{6,40}$`, secret `^[A-Za-z0-9]{10,80}$`, webhook secret ≤ 200 chars; a changed Razorpay key pair must be accepted by `GET https://api.razorpay.com/v1/orders?count=1` (`:10-15,669-672`); empty secret fields keep the saved ones; `clearKeys` wipes Razorpay keys (falls back to env); PayU cannot be enabled without key + salt. 1 W, clears the in-memory gateway cache (only on that instance).
- **`settings`** (`:695-721`): object whose keys must all be in `PUBLIC_SETTINGS`; each value sanitised (`storeSettings`, `paymentSettings`, `instagramReels`, `comboOffer`, `discovery`, `auraReels`, `lookRelations`; other keys stored as sent); one batched write, one document per key `{ value_json, updated_at }`.

The sanitisers (`:74-174`) are business rules and must be ported unchanged; in particular `sanitizePublicStoreSettings` (caps for `prepaidDiscount ≤ 5000`, min/max order, cancellation window ≤ 720 h, delivery days, GSTIN shape, invoice prefix) and `sanitizeComboOffer` (percent 0–50, min items 2–10).

---

## 4. `/api/customer-auth` (to be replaced by Better Auth, same behaviour)

POST only, same-origin, requires `ADMIN_SESSION_SECRET` (`api/customer-auth.js:153-158`). Errors (`:217-225`): user-facing errors with their status; `SERVER_CONFIG_MISSING` 503; `EMAIL_NOT_CONFIGURED` 503; `EMAIL_DELIVERY_FAILED` 502; else 500.

- **`send`** `{ email, purpose: 'signup'|'login', name }` → `{ success, expiresInSeconds: 600, cooldownSeconds: 30 }`.
  - IP limit 15/hour (TX). OTP document `customer_email_otps/<email>__<purpose>` (`:16`).
  - Code: 6 digits from `randomInt(100000, 1000000)`; stored only as `HMAC-SHA256(ADMIN_SESSION_SECRET, "email:purpose:code")` (`:18-20,55`).
  - TX (1R+1W) enforces: 30-minute lock after too many wrong attempts, 30 s resend cooldown, 8 sends per rolling 24 h, 10-minute lifetime; wrong-attempt count **carries over** to a new code while the old one was still valid (`:59-82`).
  - Email via Brevo (`sendOtpEmail`); on failure `sent_at_ms` is reset so the customer can retry at once (`:84-89`).
- **`verify`** `{ email, purpose, code, name?, phone? }` → `{ success, verified, email, firebaseToken, customer:{name,phone,createdAt} }`.
  - TX (1R+1W): wrong code increments attempts; 5th wrong attempt burns the code and locks for 30 minutes; a correct code is single-use (`:92-121`).
  - `upsertCustomer` (`:124-151`): `customers/<email>` get + merge-set (name/phone only filled when empty, `status` default `active`, `createdAt`, `lastLoginAt`); `profiles/<email>` get + merge-set seed. 2 R + 2 W.
  - Mints the customer token.
- **`google`** `{ idToken }` (`:164-186`): verifies a Firebase ID token whose `sign_in_provider` is `google.com` and `email_verified` is true; same upsert and customer token; then deletes the temporary Google Firebase user. External: Google public keys for token verification, Firebase Auth `deleteUser`.

Behaviour to keep in Better Auth: email OTP and Google only, no passwords; the same OTP limits; a single account per lower-case email whichever method is used; `customers` and `profiles` rows keyed by that email.

---

## 5. `/api/reviews`

POST only, same-origin, `body.action` (`api/reviews.js:299-312`). `ReviewError` → its status; else 500.

- **`submit`** (`:149-237`) — guest or signed-in. Body `{ productId, rating 1–5 integer, userName 2–60, comment 10–1000, photoUrl? }`.
  - Daily IP limit (TX). Product must exist and not be hidden (1 R). Every review is stored with `status: 'pending'`.
  - `verifiedPurchase` is decided on the server: signed-in customer with a **Paid** order containing the product (1 Q, up to 300 orders, `:128-137`).
  - Guest: new auto-id document (1 W). Signed-in: deterministic id `rv_<32 hex of HMAC-SHA256(key, "email|productId")>` where the key is **the `private_key` inside `FIREBASE_SERVICE_ACCOUNT`** (`:67-75`); TX reads review (+ photo record), merges the new text, keeps `createdAt`/`helpfulCount`/admin reply, attaches the photo. A photo needs sign-in, a server-issued key, and the `discovery.features.reviewPhotos` switch (1 R).
  - After: replaced photo deleted from Cloudinary through its server record; if the previous review was approved, the product's `rating`/`reviewCount` are recomputed (1 Q + 1 W, `:140-146`).
  - Response `{ ok, verifiedPurchase, updated }`.
- **`helpful`** (`:239-261`) — anyone with a non-bot user agent. One vote per `(reviewId, ip, user agent)` (`review_votes/<hash>`), 60/day per IP. TX: 3 R, 3 W. Response `{ ok, counted, helpfulCount }`.
- **`photo-sign`** (`:264-281`) — signed-in customer; feature switch; two daily limits; creates `review_photos/<key>` `{ owner: hash(email), reviewId:'', issuedAt }`; signature over `allowed_formats, folder=suitauragirls/reviews, overwrite=false, public_id=<key>, timestamp`. Response `{ cloudName, apiKey, fields, signature }`.
- **`remove-photos`** (`:284-296`) — admin Bearer. The review must already be deleted (409 otherwise); deletes up to 10 photos bound to that review id by the server's own records.

---

## 6. `/api/track`

POST only, same-origin. Bots (user-agent regex) get `{ ok:true }` and nothing is counted (`api/track.js:61-63`).

- **Write budget** (`:31-48`): `TRACK_WRITE_BUDGET` (default 8000 writes/day). Estimated from today's `daily_analytics` document (1 R, cached 60 s in memory); when exceeded or the DB refuses writes, returns `{ ok, counted:false, paused:true }`.
- **Item events** `product_view, wishlist_add, search, reel_view, reel_click, feature_use` (`:74-109`): body `{ event, productId | reelId | feature | term }`. Product must exist for view/wishlist (1 R). TX: 2 R (`analytics_dedup` per visitor+item, per-IP counter, max 300/day) and 3–4 W into `analytics_dedup`, plus `search_terms` + `daily_analytics`, or `feature_daily`, or `product_daily` + `daily_analytics`.
- **Session events** `visit, add_to_cart, checkout_initiated` (`:111-202`): body `{ event, visitorId ^vis_[a-z0-9_]{4,40}$, path, utm_source, utm_medium, utm_campaign, fbclid, referrer, deviceModel, browser }`.
  - `visit`: TX with 4 R; one "unique visitor" per IP+UA per day (max 40 new per IP/day), one "visit" per 30-minute session gap (max 150 per IP/day); writes `analytics_dedup` (up to 3 docs), `daily_analytics/<day>`, `analytics_totals/lifetime`; then creates or updates `visitor_sessions/<visitorId>` (`arrayUnion` of actions).
  - Others: once per IP+UA per day; `daily_analytics` increment; action appended to an existing session only.
- Purchases are **not** counted here (they are counted in `finalizePaidOrder`).
- Quota errors → 200 `paused`; other errors → 500.

---

## 7. `/api/alerts`

- **`GET ?wishlist=<id>`** (`api/alerts.js:100-106`) — public, no origin check. 1 R `shared_wishlists/<id>`. `{ productIds }` or 404.
- **`POST restock-subscribe`** (`:114-132`) — guest with email or signed-in. Body `{ email?, productId, size, colour }`. 1 R product, 1 W `stock_alerts/<hash(email|product|size|colour)>` (`status:'waiting'`), 1 R + maybe 1 W `alert_state/<productId>`. **No rate limit.**
- **`POST share-wishlist`** (`:134-143`) — public. Body `{ productIds[] }` (≤ 50). Batched product read, 1 W `shared_wishlists/<16 hex>`; id is a hash of the valid ids, so the same list gives the same link. **No rate limit.**
- **`POST check-product`** (`:146-152`) — admin Bearer. Body `{ productId }`. `checkProduct` (`:34-96`): reads product and `alert_state`, writes the new state; on the first check nothing is sent.
  - Price drop (price lower than last recorded, product available): reads up to **5000 `profiles`**, and for each profile whose wishlist contains the product: 1 R `alert_log`, 1 Brevo send, 1 W `alert_log` (once per customer+product+price).
  - Back in stock (was unavailable, now available): query `stock_alerts` (≤ 1000 waiting), 1 Brevo send + 1 W each.
  - Response `{ ok, initialised? | sent:{priceDrop,restock} }`.

---

## 8. `/api/sitemap`

GET/HEAD (`api/sitemap.js:44-88`). One projection query over all `products` (`select(hidden, productType, images, colors, image, category, updatedAt, createdAt)`). Lists `/`, `/shop`, 8 static pages, `/category/<slug>` for categories with a visible product (plus `/category/kids` when Baby Girls/Boys exist) and `/product/<id>`. Visible = not hidden, not an accessory, has a real photo (`:20-27`). `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Handles Firestore `Timestamp` shapes in `toDay` (`:30-39`) — not needed after migration if dates are ISO strings.

---

## 9. Email (`api/_lib/email.js`)

Single provider: `POST https://api.brevo.com/v3/smtp/email` with header `api-key: BREVO_API_KEY`; sender name `Suit Aura Girls`, sender address `BREVO_SENDER_EMAIL` or a hard-coded fallback (`:10-31`). Throws `EMAIL_NOT_CONFIGURED` or `EMAIL_DELIVERY_FAILED`.

| Email | Function | Trigger |
|---|---|---|
| OTP code | `sendOtpEmail` `:194-205` | `customer-auth send` |
| Order confirmed (items + address) | `sendOrderEmail('confirmed')` `:99-104,146-165` | first successful finalisation (4 paths) |
| Packed / Shipped / In Transit / Out for Delivery / Delivered / Cancelled / Refunded | `sendOrderEmail(status)` `:105-141` | `admin-update` status change with `notify !== false` |
| New order alert to store | `sendNewOrderAlert` `:173-192` | first successful finalisation, not for `testPayment` |
| Cancellation requested (to store) | inline `api/orders.js:217-241` | `request-cancel` |
| Cancellation kept (to customer) | inline `api/orders.js:187-212` | `admin-update` |
| Return/exchange requested (to store, with photo thumbnails) | `sendReturnRequestAlert` `:226-244` | `return-request` |
| Return approved / rejected / received / refunded / exchanged | `sendReturnUpdateEmail` `:246-309` | `admin-return` |
| Price drop, back in stock | inline `api/alerts.js:59-65,82-87` | `check-product` |
| Test email | `api/orders.js:687-693` | `admin-test-email` |

Store alert address: `storeSettings.storeEmail` if valid, else `BREVO_SENDER_EMAIL`, else the hard-coded fallback (`api/_lib/orders.js:29-33`). Customer emails are logged on the order in `emailLog[{kind, at, ok}]` (`api/orders.js:164-169`); the array is overwritten from memory, so a child table is safer in SQL.

---

## 10. External services called by the server

| Service | Call | Where |
|---|---|---|
| Razorpay | `POST /v1/orders` | `api/orders.js:48` |
| Razorpay | `GET /v1/orders/{id}/payments` | `api/orders.js:113` |
| Razorpay | `GET /v1/orders?count=1` (key check) | `api/admin-config.js:11` |
| Razorpay | `GET /v1/payments?count=25` | `api/admin-config.js:410` |
| Razorpay | inbound webhook | `api/webhooks/razorpay.js` |
| PayU | verify API (form POST) | `api/_lib/payu.js:126` |
| PayU | inbound browser POST + webhook | `api/payu.js` |
| Brevo | `POST /v3/smtp/email` | `api/_lib/email.js:15` |
| Brevo | `GET /v3/smtp/statistics/events`, `GET /v3/senders` | `api/orders.js:705,710` |
| Cloudinary | `POST /v1_1/{cloud}/{image|video}/destroy` | `api/_lib/cloudinary.js:60` |
| Cloudinary | signatures only (browser uploads directly) | `api/_lib/cloudinary.js:21-26`, `api/orders.js:275-281`, `api/reviews.js:82-88` |
| Cloudinary | image download for Gemini | `api/_lib/gemini.js:115-128` |
| Google Gemini | `GET /v1beta/models`, `POST /v1beta/models/{m}:generateContent` | `api/_lib/gemini.js:77,246` |
| Google identity / Firebase Auth | `verifyIdToken` (+ revocation check), `createCustomToken`, `revokeRefreshTokens`, `deleteUser` | `api/_lib/http.js:47-49`, `api/_lib/firebaseAdmin.js:30,33,39`, `api/customer-auth.js:167,178` |

Hard-coded site origin `https://www.suitauragirls.in` appears in `api/orders.js:36`, `api/_lib/email.js:2`, `api/alerts.js:10`, `api/sitemap.js:3`, `api/admin-config.js:41-44`. The domain stays, so PayU `surl`/`furl`, the PayU webhook URL and the Razorpay webhook URL do not change; only the server behind them does.

Cloudinary coupling to the account name: the delete guard, the return-photo and review-photo URL patterns, and the Gemini photo guard all require the configured `CLOUDINARY_CLOUD_NAME` and the `suitauragirls/` root folder (`api/_lib/cloudinary.js:29-44`, `api/_lib/orders.js:747-754`, `api/reviews.js:53-61`, `api/_lib/gemini.js:104-113`). With a new Cloudinary account, old URLs stored on products, reviews and return requests will point at the old cloud: either the assets are copied to the new cloud and URLs rewritten, or these guards must accept both cloud names during the transition.

---

## 11. Firestore collections the server touches

`storefront_settings`, `private_settings` (`payment_gateways`, `ai_assistant`), `admin_credentials` (`singleton`), `rate_limits`, `orders`, `products`, `coupons`, `categories`, `reviews`, `review_photos`, `review_votes`, `return_photos`, `customers`, `profiles`, `customer_email_otps`, `daily_analytics`, `analytics_dedup`, `analytics_totals` (`lifetime`), `visitor_sessions`, `search_terms`, `feature_daily`, `product_daily`, `alert_state`, `alert_log`, `stock_alerts`, `shared_wishlists`.

Full-collection or unbounded scans that become expensive "rows read" on D1 unless indexed or cached:
- every coupon check reads all coupons (`api/_lib/orders.js:155`) → look up by a normalised unique `code` column;
- `my-orders` reads all of a customer's orders (`api/orders.js:554`) → index on `customer_email`;
- per-customer coupon use (`api/_lib/orders.js:194`) → index on `(coupon_code, payment_status, customer_email)` and `(…, customer_mobile)`;
- `attemptKey` lookup (`api/orders.js:348`) and webhook fallback by `razorpayOrderId` (`api/webhooks/razorpay.js:62`) → indexes; better, a child table of gateway attempt ids so older ids also resolve;
- catalogue (5 full reads, `api/admin-config.js:459-465`) and sitemap → must be cached;
- `check-product` scans up to 5000 profiles (`api/alerts.js:50`) → a `wishlist_items(email, product_id)` table with an index;
- verified-purchase check reads up to 300 orders (`api/reviews.js:129`) → an `order_items` table.

---

## 12. Node / Vercel / Firebase specifics and what to do on Workers

### 12.1 Packages

| Package / module | Used in | Workers status |
|---|---|---|
| `firebase-admin/app`, `/auth`, `/firestore` (`package.json:23`) | every endpoint through `api/_lib/firebaseAdmin.js`, `api/_lib/http.js:1`, `api/_lib/orders.js:1`, `api/reviews.js:2`, `api/track.js:2`, `api/customer-auth.js:2` | **Must be removed.** Replace Firestore with D1 + Drizzle and token verification with Better Auth sessions. |
| `node:crypto` | see 12.2 | Available with `nodejs_compat` (verify `scryptSync` on the target compatibility date — unverified here). |
| `Buffer` (global) | `api/orders.js:40-41,51,114`, `api/_lib/payu.js:98-99`, `api/payu.js:14-15`, `api/webhooks/razorpay.js:12-15,39,41`, `api/admin-config.js:12,198-199,264-265,286,314-315,320,411`, `api/customer-auth.js:23-24`, `api/_lib/gemini.js:120-122` | Available with `nodejs_compat`; or replace with `btoa`, `TextEncoder`, `Uint8Array`. |
| `fetch`, `URL`, `URLSearchParams`, `AbortController`, `setTimeout` | throughout | Native on Workers. |

No other npm package is imported by the server code. `firebase` (client SDK), `jspdf`, `leaflet` etc. are browser-only.

### 12.2 `node:crypto` functions in use

| Function | Purpose | Location |
|---|---|---|
| `createHmac('sha256')` | Razorpay checkout signature | `api/orders.js:514` |
| `createHmac('sha256')` | Razorpay webhook signature | `api/webhooks/razorpay.js:41` |
| `createHmac('sha256')` | admin session cookie signature (base64url) | `api/admin-config.js:281-283` |
| `createHmac('sha256')` | OTP code hash | `api/customer-auth.js:18-20` |
| `createHmac('sha256')` | payment-result token | `api/_lib/payu.js:148` |
| `createHmac('sha256')` | signed-in customer's review id | `api/reviews.js:74` |
| `createHash('sha512')` | PayU request, response and verify hashes | `api/_lib/payu.js:80` |
| `createHash('sha1')` | Cloudinary signatures | `api/_lib/cloudinary.js:17`, `api/orders.js:280`, `api/reviews.js:87` |
| `createHash('sha256')` | customer uid, email hashes, dedup keys | `api/_lib/firebaseAdmin.js:36`, `api/orders.js:268`, `api/reviews.js:24`, `api/track.js:25`, `api/alerts.js:12` |
| `timingSafeEqual` | all signature / secret comparisons | `api/orders.js:42`, `api/_lib/payu.js:100`, `api/webhooks/razorpay.js:42`, `api/admin-config.js:200,266,316`, `api/customer-auth.js:25` |
| `randomBytes` | photo keys, password salts | `api/orders.js:576`, `api/reviews.js:272`, `api/admin-config.js:188` |
| `randomInt` | order number suffix, OTP code | `api/_lib/orders.js:396`, `api/customer-auth.js:55` |
| `scryptSync` | admin password and PIN hashes | `api/admin-config.js:190,199` |

All HMAC/SHA functions can also be done with Web Crypto (`crypto.subtle`), which is asynchronous.

### 12.3 Environment variables (names only)

| Name | Used for | Location |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Admin SDK credential; its `private_key` is also the HMAC key for review ids | `api/_lib/firebaseAdmin.js:13`, `api/reviews.js:70` |
| `FIREBASE_DATABASE_ID` | Firestore database id | `api/_lib/firebaseAdmin.js:25` |
| `ADMIN_SESSION_SECRET` | admin cookie signature, OTP hash, payment-result token | `api/admin-config.js:281,308`, `api/customer-auth.js:18,158`, `api/_lib/payu.js:146` |
| `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_INITIAL_PIN` | first-run bootstrap and DB-down fallback login | `api/admin-config.js:211-213,257-259` |
| `RAZORPAY_KEY_ID`, `VITE_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay credentials when none are saved in the admin panel | `api/_lib/payu.js:54-55,60`, `api/webhooks/razorpay.js:31`, `api/admin-config.js:30` |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | email | `api/_lib/email.js:11-12`, `api/orders.js:704-714`, `api/_lib/orders.js:32` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | signatures, deletes, URL guards | `api/_lib/cloudinary.js:8-10`, `api/orders.js:276,602`, `api/reviews.js:53,83`, `api/_lib/orders.js:747`, `api/_lib/gemini.js:105` |
| `GEMINI_API_KEY` | fallback Gemini key | `api/_lib/gemini.js:38` |
| `TRACK_WRITE_BUDGET` | analytics write budget | `api/track.js:31` |
| `VERCEL` | decides the cookie `Secure` flag | `api/admin-config.js:296` |

PayU has no env vars: its key and salt live only in `private_settings/payment_gateways`. Razorpay keys may live there too (`source: 'admin'`), in which case the env values are unused (`api/_lib/payu.js:51-65`). On Workers these become `wrangler secret` values or rows in a server-only D1 table; `process.env` is readable with `nodejs_compat` on recent compatibility dates, otherwise use the `env` binding (unverified which applies to the chosen date).

`.env.example` lists `GEMINI_API_KEY, APP_URL, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_ID, CLOUDINARY_*, VITE_RAZORPAY_KEY_ID, VITE_BREVO_API_KEY`; `.env.local` exists in the repository root and was not opened.

### 12.4 Vercel request/response API to rewrite

- `req.method`, `req.query`, `req.body` (auto-parsed JSON and form bodies), `req.headers[...]`, `req.socket`, `res.status().setHeader().end()` in every handler → Web `Request`/`Response` (for example with Hono).
- Raw body for the Razorpay webhook: `export const config = { api: { bodyParser: false } }` and stream reading (`api/webhooks/razorpay.js:8-16`) → `await request.text()`.
- PayU posts `application/x-www-form-urlencoded`; Vercel parses it into `req.body` (`api/payu.js:13-21`) → `await request.formData()` or `text()` + `URLSearchParams`.
- Host for the origin check comes from `x-forwarded-host`/`host` (`api/_lib/http.js:28`) → `new URL(request.url).host`.
- Client IP from `x-forwarded-for` → `CF-Connecting-IP`.
- Cookie `Secure` flag depends on `VERCEL === '1'` → always set it.
- CDN caching through `s-maxage` response headers (`api/admin-config.js:486,494`, `api/sitemap.js:82`) → Workers do not cache their own responses automatically; use the Cache API (`caches.default`) or KV explicitly. This is essential: the catalogue endpoint is what keeps database reads low.
- `maxDuration: 60` for admin-config (`vercel.json:123-127`) → no equivalent needed; wall-clock waiting on `fetch` does not count as CPU time.
- gRPC error codes used for control flow: code 6 "already exists" (`api/orders.js:444`), code 5 "not found" (`api/track.js:168,194`), code 8 / `RESOURCE_EXHAUSTED` (`api/orders.js:826`, `api/admin-config.js:250,254`, `api/track.js:33`) → replace with SQLite unique-constraint errors and D1 error handling.
- `FieldValue.increment`, `FieldValue.arrayUnion`, `FieldValue.delete`, `set(..., { merge:true })`, `ref.create()`, `db.getAll()`, `.select()` projections → SQL equivalents (`UPDATE … SET n = n + 1`, child tables, `INSERT … ON CONFLICT`).

### 12.5 Transactions — the main design risk

The code relies on **interactive read-then-write transactions** in 14 places: `finalizePaidOrder` (`api/_lib/orders.js:408`), `requestCancellation` (`:556`), `recordCancelRequestAlert` (`:517`), `recordReturnRequestAlert` (`:947`), `rateLimit` (`api/orders.js:294`), `return-request` (`:617`), `admin-return` (`:724`), `admin-update` (`:758`), admin login limiter (`api/admin-config.js:518`), OTP IP limiter / send / verify (`api/customer-auth.js:30,59,95`), reviews limiter / submit / helpful (`api/reviews.js:109,206,249`), track (`api/track.js:83,120`).

D1 does not offer interactive transactions from a Worker; it offers single statements and `batch()` (an atomic list of statements prepared in advance). Each of these must be redesigned as conditional SQL:

- **Mark paid once**: first statement `UPDATE orders SET payment_status='Paid', … WHERE order_number=? AND payment_status='Unpaid'` and act only if a row changed; put the stock, coupon and analytics statements in the same `batch()`, each guarded by a sub-select on a per-call claim token written by the first statement, so that either all apply or none. Stock: `stock = MAX(0, stock − wanted)` and record the amount actually taken (`MIN(stock, wanted)`) in an `order_stock_movements` row written **before** the stock update in the same batch. The Razorpay-order-id membership check must happen in the same guarded statement or just before it.
- **Rate limits**: a single upsert with `RETURNING count` (or Cloudflare's rate-limiting binding).
- **OTP send/verify, helpful vote, analytics dedup**: `INSERT … ON CONFLICT DO NOTHING` + `changes()`-style checks, or conditional `UPDATE … WHERE`.
- **Return / cancel / admin state changes**: optimistic concurrency with an `updated_at` or `version` column in the `WHERE` clause, retry on zero rows changed.

A Durable Object per order is the alternative if strict serialisation is wanted. Either way the invariants in section 2.6 (items 6, 7, 16) are the acceptance tests.

### 12.6 CPU, memory and subrequest limits

- **scrypt on the free plan**: admin login runs `scryptSync` once or twice (password, PIN) (`api/admin-config.js:545-546`), and `PUT securityConfig` up to twice more. scrypt with Node's default cost is far above 10 ms of CPU. Whether the free plan tolerates this is **unverified**; treat it as a blocker to test first. Options: Workers Paid plan, or have the owner set a new password at cut-over and store it with a cheaper Web Crypto KDF. Existing `salt:hash` values can be imported as-is only if scrypt runs within limits.
- **Module-level caches** (section 1.6) cannot be relied on. Gateway settings: read per request or cache in KV with a short TTL. `lastCatalog`: Cache API/KV. Login fallback counters: D1/KV. Gemini ladders: KV or re-fetch. The "database is down, use env credentials" fallback (`api/admin-config.js:230-262`) was built for the Firestore quota problem; decide whether it is still wanted.
- **Sleeps and long waits**: PayU verify retries sleep 1.5 s + 3 s (`api/_lib/payu.js:117`), Gemini waits up to ~34 s (`api/_lib/gemini.js:308`), orders have a 25 s budget (`api/orders.js:819`). Waiting is not CPU time, so these are acceptable; keep the timeouts.
- **Subrequests per request** (free-plan limit is low; check the current number): `check-product` can send one Brevo email per matching customer plus reads/writes per customer (`api/alerts.js:50-93`) and will exceed any small limit → move to a Queue or send in batches. `ai-describe` makes up to 1 + 6 + ~18 fetches. `cloudinary-delete` up to 50 parallel deletes (`api/admin-config.js:570-571`). `reconcileRazorpay` up to 5. Whether D1 statements count toward the subrequest limit is unverified.
- **Base64 of up to 6 × 4 MB images in memory** for Gemini (`api/_lib/gemini.js:17-18,120-122`) — within Workers' memory limit but CPU-heavy on the free plan; unverified.
- **Daily request count**: `/api/track` is called for every visit and item event; each call is a Worker request and several D1 row writes (≈ 6 per new visit). Keep the write budget idea (`api/track.js:27-48`) sized against D1's daily write allowance so that analytics can never starve orders.
- **`Intl` with `en-IN`** is used for rupee formatting in user-facing errors and emails (`api/_lib/orders.js:125,217,721`, `api/_lib/email.js:8,80,87`, `api/orders.js:220`, `api/alerts.js:11`). Check that the Workers runtime produces the same `1,23,456` grouping and `Asia/Kolkata` dates (unverified).
- **Time zone**: coupon expiry uses local-time `setHours` (`api/_lib/orders.js:143`). Workers run in UTC like Vercel, so behaviour is unchanged; keep it unless the owner wants IST.

### 12.7 Secrets and derived values that must survive the move

| Value | Why |
|---|---|
| `ADMIN_SESSION_SECRET` | signs admin cookies (up to 400 days) and payment-result links (2 days). Reusing it keeps in-flight result links valid; changing it only signs the admin out and breaks links from the last 2 days. |
| `private_key` inside `FIREBASE_SERVICE_ACCOUNT` | HMAC key for signed-in customers' review ids (`api/reviews.js:67-75`). Without the same key a returning customer's new review will not replace their existing one. Either keep that key as a dedicated secret, or migrate reviews into a table with an explicit `(customer_email, product_id)` unique key — but reviews store **no email** today, so the mapping cannot be rebuilt from data. |
| Razorpay key id / secret / webhook secret (env or `private_settings`) | same live account; the webhook URL stays the same. |
| PayU merchant key / salt / mode (`private_settings` only) | not in env anywhere. |
| `admin_credentials/singleton` hashes | scrypt `salt:hash` format. |
| Customer uid formula `c_` + SHA-256(email)[0:26] | stored on orders as `customerUid` (`api/orders.js:415`); informational, ownership uses email. |
| Hash formats for `stock_alerts`, `shared_wishlists`, `alert_log`, `review_votes` ids | shared-wishlist links in the wild are `sha256(ids joined by '|')[0:16]` (`api/alerts.js:140`); keep ids as primary keys so old links still open. |

---

## 13. Gaps and oddities found (decide: reproduce or fix)

1. Admin auth is split: cookie scoped to `/api/admin-config` plus a Firebase admin token for everything else. On Workers one admin session (cookie with `Path=/api`, or Better Auth admin role) must cover `/api/orders`, `/api/reviews`, `/api/alerts` and all the new admin data endpoints.
2. `logout` does not invalidate the signed cookie server-side (`api/admin-config.js:560-564`).
3. `verify` and `admin-return` do not upper-case `orderNumber` (`api/orders.js:507,721`) while other actions do.
4. Coupon usage and per-customer limits can be exceeded by concurrent checkouts (limits checked at pricing, counted at payment).
5. `admin-update` to `Cancelled`/`Refunded` restores stock but not coupon usage or the purchase counter; `admin-return refund` does not restore stock at all.
6. `restoreOrderStock` sets `inStock = next > 0`, overriding a manual "out of stock" switch (`api/_lib/orders.js:482`).
7. `reconcilePayu` checks only the latest PayU txn id (`api/orders.js:125-126`); earlier attempts are covered only by the PayU callback/webhook.
8. Razorpay webhook fallback lookup uses only the current `razorpayOrderId` field (`api/webhooks/razorpay.js:62`).
9. A second order with the same `attemptKey` can exist (changed cart or > 30 minutes); the `limit(1)` lookup then returns either one (`api/orders.js:348`).
10. `restock-subscribe` and `share-wishlist` have no rate limit (`api/alerts.js:114-143`).
11. `my-orders` is unbounded (`api/orders.js:554`).
12. The default admin path slug is hard-coded in source (`api/admin-config.js:222,261,338`) and mirrored in `vercel.json:71-121`.
13. A late payment re-opens an order the admin had cancelled while unpaid (see invariant 13) — probably desired, since money was taken, but worth a conscious decision.
