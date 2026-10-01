# 04 — Authentication and session flows

Scope: every sign-in, session and identity check in the current store (Vercel + Firebase), and how to
reproduce the same user-facing behaviour on Cloudflare Workers + D1 + Better Auth.

Written from a read-only pass over the working tree on 2026-10-01. No live service was called.
Line numbers are `path:line` in the working tree (which has uncommitted changes relative to `HEAD`).
Statements about Better Auth and Cloudflare behaviour come from general knowledge of those products, not
from code in this repo; they are marked **(verify)** and must be checked against the versions installed.

Secrets are referred to by environment-variable name only. No secret value appears in this document.

---

## 0. Summary of the current design

There are two completely separate identity systems, and both end in a **Firebase custom token**:

| | Customer | Admin |
|---|---|---|
| Proof of identity | 6-digit code emailed by Brevo, or a Google credential | username + password + 6-digit PIN |
| Server endpoint | `POST /api/customer-auth` | `/api/admin-config?action=login\|session\|logout\|security` |
| What the server issues | Firebase custom token, uid `c_<hash>`, claim `customerEmail` | signed HttpOnly cookie `sag_admin_session` **and** a Firebase custom token, uid `sag-admin`, claim `admin: true` |
| Where the session lives in the browser | Firebase Auth persistence of the default Firebase app | cookie + Firebase Auth persistence of a second Firebase app named `sag-admin` |
| How API routes recognise it | `Authorization: Bearer <Firebase ID token>` | cookie (only on `/api/admin-config`), Bearer ID token (every other `/api/*` route) |
| How Firestore recognises it | `request.auth.token.customerEmail` | `request.auth.token.admin == true` |

The customer's **lowercase email is the primary key for everything**: `customers/{email}`,
`profiles/{email}` (cart, wishlist, addresses), and `orders.customerEmail`. There are no passwords and no
Google `sub` stored anywhere. This is what makes the migration possible without any credential migration.

---

## 1. Customers

### 1.1 Email one-time code

**Browser — `src/components/LoginPage.tsx`**

- Two tabs, `login` and `signup` (`LoginPage.tsx:9`, `:36`, `:243-257`). Sign-up additionally collects full
  name and a 10-digit Indian mobile number, validated client-side (`:71-80`). Sign-in asks only for email.
- Request a code: `apiPost('/api/customer-auth', { action: 'send', email, purpose: mode, name })`
  (`:59-62`); the UI then starts a 30 s resend countdown (`:61`, `:359-366`).
- Verify: `apiPost('/api/customer-auth', { action: 'verify', email, purpose, code, name?, phone? })`
  (`:118-125`). Name and phone are only sent in `signup` mode.
- On success: `signInWithOtpToken(result.firebaseToken, result.customer)` (`:126`), then
  `syncCustomerOrders` (`:127`), then navigate to `checkout` if `sessionStorage.sag_after_login === 'checkout'`,
  otherwise to `account` (`:130-132`).
- UI copy that must stay true: "No password needed. We email you a one-time code." (`:237`),
  "New here? A code also creates your account." (`:310`), "The code expires in 10 minutes." (`:350`).
- 6 input boxes, paste spreads across boxes, first box has `autocomplete="one-time-code"` (`:178-192`, `:335`).

**Server — `api/customer-auth.js`**

- POST only, and the `Origin` header must match the request host (`customer-auth.js:154-155`;
  `api/_lib/http.js:24-32`). A missing `Origin` is rejected for this route.
- Requires `ADMIN_SESSION_SECRET` to be set (`:158`); it is the HMAC key for the stored code hash (`:18-20`).
- Constants (`:7-13`):

  | Rule | Value | Where enforced |
  |---|---|---|
  | Code length | 6 digits, `randomInt(100000, 1000000)` | `:55` |
  | Code lifetime | 10 minutes | `:7`, `:78`, `:100-103` |
  | Resend cooldown | 30 s per email+purpose | `:8`, `:65-67` |
  | Sends per email+purpose | 8 per rolling 24 h | `:11`, `:68-69` |
  | Sends per IP | 15 per hour (fixed window) | `:12`, `:28-42`, `:53` |
  | Wrong guesses | 5, then locked for 30 min | `:9-10`, `:104-112` |
  | Lock also blocks sending | yes | `:62-64` |
  | Single use | hash cleared on success | `:113-115` |
  | Wrong guesses carry over to a re-sent code while the previous one was still valid | yes | `:70`, `:75-76` |

- Storage: one document per `email__purpose` in `customer_email_otps` (`:16`) with fields
  `email, purpose, code_hash, attempts, sent_at_ms, expires_at_ms, sends[], locked_until` (`:71-81`).
  The code is never stored in clear; `code_hash = HMAC-SHA256(ADMIN_SESSION_SECRET, "email:purpose:code")`
  (`:18-20`), compared with `timingSafeEqual` (`:22-26`).
- IP limiter document: `rate_limits/otp_ip:<ip>` with `windowStart, count, expiresAt` (`:28-42`).
  The IP comes from `x-forwarded-for` (`api/_lib/http.js:34-36`).
- Send and verify both run in Firestore transactions so parallel requests cannot bypass the limits
  (`:59-82`, `:95-116`).
- If the Brevo send fails, `sent_at_ms` is reset to 0 so the customer can retry immediately (`:84-89`).
  The send still counts against the daily limit (the `sends` array is not rolled back).
- Email content: subject "`<code>` is your Suit Aura Girls verification code" (`api/_lib/email.js:194-205`).
  Brevo configuration is `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` (`api/_lib/email.js:11-12`).
- `purpose` is only a label. An unknown value falls back to `login` (`:189`), and `verify` creates the
  account in either mode (`:197-214`). There is no "account does not exist" error in login mode.
- After a correct code, `upsertCustomer` (`:124-151`):
  - `customers/{email}`: `email, name, phone, status ('active' default), createdAt, lastLoginAt, updatedAt`.
    Name and phone are only filled if the stored value is empty (`:131-139`); an existing name is never overwritten.
  - `profiles/{email}`: seeded with `email, updatedAt`, plus `fullName` / `phone` only if missing (`:143-149`).
  - `status` is written but never checked in this file — there is no "blocked customer" enforcement at sign-in.
- Response: `{ success, verified, email, firebaseToken, customer: { name, phone, createdAt } }` (`:207-213`).
- Error mapping to keep: 429 for limits, 400 for wrong/expired code, 503 `SERVER_CONFIG_MISSING` /
  `EMAIL_NOT_CONFIGURED`, 502 `EMAIL_DELIVERY_FAILED` (`:217-225`).

### 1.2 Google sign-in ("Continue with Google" button and One Tap)

- Feature flag: `GOOGLE_LOGIN_ENABLED = import.meta.env.VITE_GOOGLE_LOGIN === '1'` (`src/utils/googleSignIn.ts:5`).
  `VITE_GOOGLE_LOGIN` is not present in `.env.example` or `.env.local`; whether it is set in the Vercel
  project is **unverified** (it is a build-time variable, so it must be set wherever the SPA is built).
- OAuth client ID is hard-coded: `GOOGLE_CLIENT_ID` (`src/utils/googleSignIn.ts:4`). It is the public web
  client of Firebase project `thor-217e7` (same project number as `messagingSenderId` in
  `firebase-applet-config.json`). It is not a secret, but it belongs to the **old** Google project.
- Google Identity Services script is loaded on demand from `https://accounts.google.com/gsi/client`
  (`googleSignIn.ts:12-24`) and initialised once with `itp_support: true`, `use_fedcm_for_prompt: true`,
  `auto_select: false` (`:36-44`). One shared callback routes the credential to whichever component asked
  last (`:30-31`, `:38`).
- Button: rendered by Google into `#auth-google` on the login page (`src/components/LoginPage.tsx:161-176`,
  `:267-275`). If the script cannot load, the button section is hidden and email code remains (`:174`).
- One Tap: `src/components/GoogleOneTap.tsx`. Shown only when signed out, when the admin feature switch
  `features.googleOneTap` is on (`:21`; default `true` in `src/utils/discovery.ts:52`; server whitelist in
  `api/admin-config.js:69`), on pages `home, shop, product-detail, wishlist, cart, account` (`:7`), 2.5 s after
  load (`:38-47`), once per browser session (`sessionStorage.sag_onetap_dismissed`, `:8`, `:22`, `:43`).
- Credential exchange (`googleSignIn.ts:57-67`):
  1. A **throwaway** Firebase app named `sag-google` is created (`:61`).
  2. `signInWithCredential(googleAuth, GoogleAuthProvider.credential(credential))` (`:63`) — this creates a
     real Firebase Auth user with the Google provider.
  3. Its Firebase ID token is sent to `POST /api/customer-auth { action: 'google', idToken }` (`:64-66`);
     the throwaway app is signed out (`:65`).
- Server (`api/customer-auth.js:164-186`): `verifyIdToken` (`:167`), requires
  `sign_in_provider === 'google.com'`, `email_verified === true` and a valid email (`:171-174`); runs the same
  `upsertCustomer` with the Google display name and no phone (`:175`); mints the **same** customer custom
  token as the OTP path (`:176`); then deletes the bridge Firebase user (`:178`).
- Consequences: a Google customer and an OTP customer with the same email are the **same account**. The
  Google `sub` is not stored. No IP rate limit applies to the `google` action.

### 1.3 The customer token and session

- uid: `c_` + first 26 hex chars of `sha256(lowercase email)` (`api/_lib/firebaseAdmin.js:36`).
- Custom token claim: `{ customerEmail: <lowercase email> }` (`api/_lib/firebaseAdmin.js:39-40`). Signed with
  the service account in `FIREBASE_SERVICE_ACCOUNT` (`:11-22`).
- Browser: `signInWithCustomToken(auth, token)` on the **default** Firebase app (`src/context/AuthContext.tsx:83-97`;
  `src/lib/firebase.ts:7`, `:10`). The email is read back from the ID-token claim, not from the API response (`:85-86`).
- Session lifetime: Firebase Auth default browser persistence — effectively "signed in until logout" (ID
  token refreshed hourly by the SDK). There is no server-side customer session store and no customer cookie.
- Session restore on page load: `onAuthStateChanged` (`AuthContext.tsx:47-79`). Only uids starting `c_` are
  customers (`:23`, `:52`); any other user found in the storefront Firebase app is signed out (`:49-51`).
  If the token cannot be refreshed (offline), the cached email in `localStorage.sag_custom_user` is used,
  but only if its `uid` matches the Firebase user (`:58-62`).
- `localStorage.sag_custom_user` = `{ email, uid, displayName, name, phone }` is a display cache, not a
  credential (`:24`, `:64-66`, `:94`). It is deleted when there is no Firebase customer session (`:75`).
- Logout (`:99-111`): removes the keys listed in `CUSTOMER_KEYS` (`:34-37`) and every `sag_user_profile_*`
  key, clears `sessionStorage`, signs out of Firebase, fires `sag-auth-state-change` and `sag-customer-logout`.
- Legacy clean-up still running: `sag_registered_accounts` (old plaintext device-only accounts) is removed on
  every load (`:45`).

### 1.4 How the identity reaches the API

- `apiPost` attaches `Authorization: Bearer <ID token>` (`src/lib/api.ts:13-38`). On admin pages it prefers the
  admin Firebase user, elsewhere the customer one (`:16-17`). If the token cannot be obtained the request
  goes out as a guest (`:19-23`).
- `getIdentity(req)` (`api/_lib/http.js:42-58`) returns `{ admin, email, uid }`:
  `email` from the `customerEmail` claim, `admin` from the `admin` claim; admin tokens are additionally
  checked for revocation (`:49`). Any failure yields a guest `{ admin: false, email: '' }` (`:55-57`).
- Used by: `api/orders.js:817` (all order actions), `api/reviews.js:160`, `:265`, `:285`, `api/alerts.js:115`, `:147`.

### 1.5 What links to the customer email

| Data | Key / field | Read or written by | Reference |
|---|---|---|---|
| Account record | `customers/{email}` | server only | `api/customer-auth.js:124-141`; admin list reads it directly `src/components/admin/AdminCustomers.tsx:40` |
| Profile (name, phone) | `profiles/{email}` | server seed + browser | `api/customer-auth.js:143-149` |
| Cart | `profiles/{email}.cart` | browser → Firestore directly | `src/context/ShopContext.tsx:338-355`, `:360-372` |
| Wishlist | `profiles/{email}.wishlist` | browser → Firestore directly | `src/context/ShopContext.tsx:416-436`, `:439-456` |
| Address book | `profiles/{email}.addresses` (+ `localStorage.sag_address_book_v1`) | browser → Firestore directly | `src/lib/addressBook.ts:5-6`, `:185`, `:221` |
| Orders | `orders.customerEmail` (= session email, else the checkout address email) | server only | `api/orders.js:352`, `:412` |
| Order owner check | `order.customerEmail === identity.email` | server | `api/orders.js:284-289` |
| My orders | `where('customerEmail','==',identity.email)` | server | `api/orders.js:552-560` |
| Firebase uid on the order | `orders.customerUid` (written, never read) | server | `api/orders.js:415` |
| Coupon per-customer limits | email / phone passed to pricing | server | `api/orders.js:346` |
| Returns, cancellation, return photos | `identity.email`, limiter keys by `emailHash` (plain sha256) | server | `api/orders.js:268`, `:566-597`, `:663-667` |
| Reviews ("verified buyer", one per product) | orders by `customerEmail`; review id = HMAC(email\|productId) | server | `api/reviews.js:129`, `:67-75` |
| Price-drop / back-in-stock alerts | session email or typed email | server | `api/alerts.js:115-116` |

- The browser resolves "who am I" with `getSessionEmail()` (`src/context/ShopContext.tsx:324-332`): there must
  be a Firebase user with a `c_` uid **and** a matching `sag_custom_user` cache entry.
- Device ownership markers `sag_cart_owner` / `sag_wishlist_owner` decide whether the guest bag is merged
  with or replaced by the saved one (`ShopContext.tsx:370-373`, `:450-453`).
- Guests: orders can be placed without an account. Guest order history is `localStorage.sag_guest_orders`
  (`ShopContext.tsx:679-684`). Guest tracking matches order number + email or last 10 digits of the phone
  (`api/orders.js:525-550`), limited to 30 lookups per IP per 10 min (`:529`).
- PayU return: the customer may not be signed in, so the result page is opened with a signed link
  `ts.hmac` valid for 2 days, keyed with `ADMIN_SESSION_SECRET` (`api/_lib/payu.js:143-157`;
  checked at `api/orders.js:457-458`).

---

## 2. Admin

### 2.1 Private entry link — `src/utils/adminEntry.ts`

- Default slug `drdaina` (`:7`); slugs that always open the sign-in form: `drdaina`, `d4daina` (`:9`).
  Retired slugs (`''`, `sag-vault`, `admin-vault`) map back to the default (`:11`, `:14-17`).
- The owner's own slug is read from `localStorage.sag_admin_security_v2.secretPathSlug` (`:19-26`), so a
  custom slug is only recognised in a browser that has already been signed in with it. On a fresh
  device only the two built-in slugs work (the server value needs a session to read: `api/admin-config.js:425-437`).
- The browser address `/drdaina/orders` is translated to the internal app path `/admin/orders` (`:49-58`)
  and back (`:61-65`). A typed `/admin...` address becomes `/page-not-found` (`:56`).
- Rendering rules (`src/components/AdminDashboardPage.tsx:37-76`): entry link + not signed in → loader until
  the session check finishes, then `AdminLogin` (`:41-50`); `/admin/login` works only when
  `allowDirectAdminRoute` is on (`:53-55`); any other signed-out admin address → login form (`:67-69`)
  or the store's 404 look-alike (`:70-76`).
- Hosting headers: `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` for `/admin`, `/drdaina`,
  `/d4daina` and their sub-paths (`vercel.json:45-122`). A custom slug gets no such headers.
  All paths are rewritten to the SPA (`vercel.json:8-11`).
- The slug is obscurity, not security. Real protection is the login in 2.2.

### 2.2 Login — `POST /api/admin-config?action=login`

- Browser: `AdminLogin` collects username, password, PIN and the "Save login on this phone" switch
  (`src/components/admin/AdminLogin.tsx:22-30`, `:38`, `:194-210`). The switch default is on and is remembered
  in `localStorage.sag_admin_remember` (`:29-30`).
- `loginAdmin` posts `{ username, password, pin, remember }` (`src/context/AdminContext.tsx:1087-1092`).
- Server (`api/admin-config.js:510-558`):
  - Same-origin check that **allows a missing `Origin`** (`:345-354`, `:507`) — weaker than the customer one.
  - Rate limit: 10 attempts per IP per 15 min in `rate_limits/admin_login:<ip>` (`:511-529`).
  - Credentials: single document `admin_credentials/singleton` (`:184`) with
    `username, password_hash, pin_hash, require_pin, secret_path_slug, allow_direct_admin_route, session_version`
    (`:216-225`). Created on first login from `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`,
    `ADMIN_INITIAL_PIN` (`:206-228`).
  - Hash format: `saltHex:hashHex`, `scryptSync(value, 16-byte salt, 64)` with Node default cost parameters
    (`:188-201`). Username comparison is case-insensitive (`:544`). The PIN is skipped when
    `require_pin` is false (`:546`).
  - One generic failure message for any mismatch (`:547-549`).
  - Success: sets the cookie (`:550-551`) and returns `{ username, sessionVersion, firebaseToken }` (`:552-557`).

### 2.3 The signed session cookie

- Name `sag_admin_session` (`api/admin-config.js:48`).
- Value: `base64url(JSON{ username, version, remember, expiresAt })` + `.` +
  `base64url(HMAC-SHA256(ADMIN_SESSION_SECRET, payload))` (`:281-293`).
- Attributes: `HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age=<lifetime>`, and `Secure` **only
  when `process.env.VERCEL === '1'`** (`:295-299`).
- Lifetime: 400 days with "save login" on, 12 hours with it off (`:49-54`).
- Sliding renewal: every `GET ?action=session` re-issues the cookie with a fresh expiry, keeping the
  `remember` choice (`:374-387`).
- Validation `authenticate()` (`:307-343`): signature (constant time) → not expired → `username` and
  `version` must equal the stored `username` and `session_version` (`:341`).
- There is no server-side session table. "Sign out everywhere" = bump `session_version`.
- Because of `Path=/api/admin-config`, the cookie is **not sent** to `/api/orders`, `/api/reviews` or
  `/api/alerts`. Those routes recognise the admin only through the Firebase ID token (2.4).

### 2.4 The admin Firebase custom token

- `createAdminFirebaseToken()` → uid `sag-admin`, claim `{ admin: true }` (`api/_lib/firebaseAdmin.js:9`, `:30`).
  Returned by `login` (`api/admin-config.js:556`) and by every `session` check (`:385`).
- Browser signs in on a **second** Firebase app named `sag-admin`, so admin and customer sessions can coexist
  in one browser (`src/lib/firebase.ts:26-36`; `src/lib/dataStore.ts:140-148`).
- If that Firebase sign-in fails, the login is reported as failed: "Database authorization failed"
  (`src/context/AdminContext.tsx:1096-1101`).
- What it is used for:
  1. Direct Firestore reads/writes/live listeners from the admin panel through `adminDb`
     (`src/lib/dataStore.ts:18`; `src/context/AdminContext.tsx:2`), authorised by `isAdmin()` in the rules.
  2. `Authorization: Bearer` on the other API routes: order admin actions (`api/orders.js:683`, `:702`, `:720`,
     `:738`), review photo clean-up (`api/reviews.js:285-286`), alerts run (`api/alerts.js:147-148`), admin
     view of gateways/tracking (`api/orders.js:337`, `:351`, `:536`, `:544`).
- Revocation: `revokeRefreshTokens('sag-admin')` on logout and on every security change
  (`api/_lib/firebaseAdmin.js:33`; `api/admin-config.js:562`, `:627`); admin ID tokens are verified with
  `checkRevoked = true` (`api/_lib/http.js:49`).
- `isFirebaseAdmin` state tracks whether the `sag-admin` app is signed in (`src/context/AdminContext.tsx:626-627`).

### 2.5 Fallback when Firestore is down

Added because the free Firestore quota runs out. All in `api/admin-config.js`:

- `withTimeout`: a Firestore call gets 2.5 s; after a timeout or a quota error Firestore is skipped for 60 s
  (`:234-253`). "Down" = gRPC codes 8, 14, 4, timeout, or matching message text (`:254-255`).
- Login while down (`:531-542`): attempt limit moves to an in-memory map, 10 per IP per 15 min (`:268-279`);
  credentials are the last ones read by this warm instance (`lastCredentials`, still hashed, `:205`, `:534-535`)
  or else the plain values in `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD` / `ADMIN_INITIAL_PIN`
  compared in constant time (`:256-267`, `:537-539`, `:545-546`).
- Session check while down (`:329-340`): a correctly signed, unexpired cookie stays valid; only the
  `session_version` ("signed out everywhere") check is skipped.
- Environment-fallback sessions carry `session_version: 0` (`:261`). When Firestore answers again, such a
  cookie no longer matches the stored version (`:341`) and the admin has to sign in once more.
- Security settings cannot be changed in fallback mode — 503 (`:609`).
- Browser side: the session check retries 3 times, treats only 401/403 as "signed out", and never signs the
  admin out for a 5xx or a network error (`src/context/AdminContext.tsx:553-572`, `:589-591`).

### 2.6 Session checks in the browser — `src/context/AdminContext.tsx`

- On production hosts the browser never trusts `localStorage` for admin state: `sag_admin_auth` is removed at
  start-up and `isAdminLoggedIn` starts `false` (`:503-509`).
- `validateSession` (`:549-593`) runs on mount, on window `focus`, `storage`, `popstate`, and every 5 minutes
  (`:611-615`). It runs only on admin addresses or when the admin Firebase app is signed in (`:546-548`, `:550`).
  On 200 it signs into Firebase with the fresh token (`:575`), sets `isAdminLoggedIn` (`:580`) and loads
  `?action=security` into `localStorage.sag_admin_security_v2` with password and PIN blanked (`:582-588`).
- `adminSessionChecked` gates the first render so the login form does not flash (`:541`, `:611`).
- `sag_admin_live = '1'` is set while signed in so that this browser reads live data instead of the shared
  cached catalogue (`:1149-1151`, `:1154`; `src/lib/catalog.ts:21-42`).
- Logout (`:1153-1164`): `POST ?action=logout` (clears cookie and revokes Firebase tokens,
  `api/admin-config.js:560-564`), Firebase sign-out, local keys removed. The server `logout` action does not
  require a valid session.
- **Localhost-only path**: on `localhost` / `127.0.0.1` the API is skipped and credentials are compared in
  the browser against `securityConfig` (`:1118-1145`), whose defaults are in `DEFAULT_SECURITY_CONFIG`
  (`:55-63`). That constant contains `adminPassword` and `securityPin` fields in client source — review whether
  they hold real values and remove them (values deliberately not copied here). A hard-coded username alias
  also exists (`:1119-1124`).

### 2.7 Security settings (password, PIN, slug)

- UI: Admin → Settings → Security (`src/components/admin/AdminSettings.tsx:136-163`, slug field `:731-746`,
  direct-route switch `:760-761`, "revoke all sessions" `:165-175`).
- `PUT /api/admin-config { securityConfig }` (`src/context/AdminContext.tsx:1166-1185`).
- Server (`api/admin-config.js:608-630`): password ≥ 8 chars (`:614`), PIN exactly 6 digits when supplied
  (`:615`); empty password/PIN keeps the existing hash (`:619-620`); username, `require_pin`, slug and
  `allow_direct_admin_route` are updated (`:618`, `:621-623`); **`session_version` is always incremented**
  (`:624`), Firebase admin tokens are revoked (`:627`), and this device gets a new cookie (`:628`) — with the
  default 400-day lifetime regardless of the earlier "save login" choice.
- Result: any security save, including only a slug change, signs every other device out.
- "Revoke all sessions" sends an empty password/PIN with a bumped version and then logs this device out too
  (`src/context/AdminContext.tsx:1187-1191`).
- `GET ?action=security` never returns the password or PIN (`api/admin-config.js:425-437`).

### 2.8 Other things the admin cookie protects

All on `/api/admin-config`: payment-gateway settings (`:390-395`), Gemini assistant status and key
(`:398-402`, `:633+`), Razorpay payment list (`:405-423`), Cloudinary upload signature and delete (`:566-574`),
AI describe (`:576-601`), all storefront settings writes (`:603-606`, `:715-721`).
Public, unauthenticated GETs on the same path: `?action=catalog` (`:457`) and the public settings (`:504`).

---

## 3. Firestore security rules and their dependence on these identities

`firestore.rules`:

- `isAdmin()` = `request.auth.token.admin == true` (`:5-7`). `isCustomer(email)` =
  `request.auth.token.customerEmail == email` (`:10-12`).

| Collection | Rule | Line |
|---|---|---|
| `products`, `categories`, `hero_slides`, `coupons` | public read, admin write | `:19-38` |
| `reviews` | read if admin or `status == 'approved'`; write admin | `:41-44` |
| `orders` | read admin; create/update denied to all clients (server only); delete admin | `:48-52` |
| `profiles/{email}` | get/create/update: admin or that customer; list/delete: admin | `:55-58` |
| `customers/{email}` | read: admin or that customer; write denied (server only) | `:61-64` |
| `abandoned_checkouts` | anyone may create/update; admin reads/deletes | `:66-69` |
| `storefront_settings` | public read; write denied (server only) | `:72-75` |
| `admin_credentials`, `customer_email_otps`, `rate_limits` | denied to all clients | `:78-86` |
| `leads` | public create with field whitelist and size limits; admin manages | `:89-99` |
| `visitor_sessions`, `daily_analytics`, `search_terms`, `feature_daily` | admin read/delete | `:102-123` |
| `product_daily` | public `get`; admin list/delete | `:112-115` |
| `analytics_totals` | admin read | `:126-128` |
| `inventory_log`, `admin_settings` | admin read/write | `:131-138` |
| everything else | denied | `:141-143` |

The server uses the Admin SDK and bypasses the rules. On the target stack **there are no rules**: the browser
cannot talk to D1, so every line of this table has to become an authorisation check in a Worker route.
The table is the checklist for that work (section 4.6).

---

## 4. Reproducing the same behaviour on Workers + D1 + Better Auth

### 4.1 Principles

1. Identity stays **lowercase email**. Application tables (`customers`, `profiles`, `orders`) keep email as
   their key exactly as today. The Better Auth `user.id` is an implementation detail and is not used as a
   foreign key in store data.
2. No password is ever created for customers. Do not enable Better Auth's `emailAndPassword`.
3. Customers move from "Bearer token in a header" to an **HttpOnly session cookie**. The admin keeps its own
   cookie and code; it is not moved into Better Auth.
4. The old Firebase project is left untouched (read-only export only).

### 4.2 Customers — Better Auth configuration (verify against the installed version)

- Mount the handler at `/api/auth/*` in the Worker. Create the auth instance per request, because the D1
  binding only exists on `env` inside the request.
- Database: Drizzle adapter with the SQLite provider on the D1 binding. Core tables: `user`, `session`,
  `account`, `verification`.
- Plugin `emailOTP`:
  - `otpLength: 6`, `expiresIn: 600` — matches `api/customer-auth.js:7`, `:55`.
  - `allowedAttempts: 5` — matches `:9`. Better Auth invalidates the code after too many attempts; the
    additional **30-minute lock** (`:10`, `:107`) is not built in and must be added (below).
  - `sendVerificationOTP({ email, otp, type })` → call the existing Brevo sender with the same subject and
    body as `api/_lib/email.js:194-205`.
  - Sign-up must stay enabled (`disableSignUp: false`), because a code creates the account (`LoginPage.tsx:310`).
  - Store the code hashed (an option exists for this), to match today's HMAC storage (`customer-auth.js:18-20`).
- Google: `socialProviders.google` with the **new** client ID and secret. Keep the current Google Identity
  Services button and One Tap UI and send the credential (a Google ID token) to Better Auth's ID-token
  sign-in (`signIn.social({ provider: 'google', idToken: { token } })`) or use its One Tap plugin. Either way
  the server verifies the token audience against the configured client ID. This removes the throwaway
  Firebase app completely (`googleSignIn.ts:57-67`). Require `email_verified` as today (`customer-auth.js:172`).
- Account linking: enable linking by verified email and mark Google as a trusted provider, so an email-code
  customer who later uses Google lands in the **same** `user` row (today's behaviour, section 1.2). Test both
  orders: OTP first then Google, and Google first then OTP.
- Session length: Firebase keeps customers signed in indefinitely. Better Auth's default is about 7 days.
  Set `session.expiresIn` to a long value (for example 400 days, the browser cookie maximum) with a daily
  `updateAge`, or customers will notice being signed out.
- D1 quota: enable the signed cookie cache for sessions (short max age, e.g. 5 minutes) so most requests do
  not read the `session` table. Without it every authenticated API call costs a D1 read.
- Cookies: Better Auth sets its own session cookie (`__Secure-` prefixed on HTTPS), HttpOnly, SameSite=Lax by
  default. Same-site with the SPA, so no CORS configuration is needed. Set `baseURL` to
  `https://www.suitauragirls.in` and add `https://suitauragirls.in` to `trustedOrigins` if the apex serves
  the app rather than redirecting.
- Secrets to create (names are suggestions): `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  plus the carried-over `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`. Set them with `wrangler secret put`; never in
  `wrangler.toml` or the repo.

### 4.3 Rate limits and lockout to re-implement

Better Auth's built-in rate limiter is per-path/per-IP and, on Workers, must use database or KV storage
(in-memory counters do not survive across isolates). It does not express all of today's rules, so add a small
D1 table (for example `otp_limits(key, window_start, count, sends_json, locked_until)`) and enforce in a
`before` hook on the send-OTP and sign-in-OTP endpoints, or inside `sendVerificationOTP`:

| Rule today | Target |
|---|---|
| 30 s resend cooldown per email | custom check before sending; return the same 429 text (`customer-auth.js:66`) |
| 8 sends per email per 24 h | custom |
| 15 sends per IP per hour | custom or Better Auth rate-limit custom rule on the send path; IP from `CF-Connecting-IP`, not `x-forwarded-for` |
| 5 wrong codes → 30 min lock, lock also blocks sending | `allowedAttempts: 5` plus custom `locked_until` |
| Brevo failure lets the customer retry at once | reset the cooldown marker in the catch block |

Keep the D1 writes small: one row per email and one per IP, updated in a single statement each. Add a
scheduled clean-up (Cron Trigger) for expired rows; Firestore had an `expiresAt` field for this (`:35`).

Optional hardening that does not change behaviour for real users: Cloudflare Turnstile on "Email me a code",
and a WAF rate-limiting rule on `/api/auth/*`.

### 4.4 Sign-up fields and the customer record

Today name and phone travel with the `verify` call (`LoginPage.tsx:118-125`). On the target:

1. Sign in with the code through Better Auth.
2. Then call an app route (for example `POST /api/customer/profile`) with `{ name, phone }`. It applies the
   same "fill only if empty" rule as `upsertCustomer` (`customer-auth.js:131-149`) and validates the phone with
   the same pattern (`:201-205`).
3. Use Better Auth database hooks (after user create, after session create) to upsert `customers` and
   `profiles` and to set `lastLoginAt`, so the admin Customers page keeps working
   (`src/components/admin/AdminCustomers.tsx:40`).

The response shape the UI needs is `{ email, customer: { name, phone } }` (`LoginPage.tsx:23-27`).

### 4.5 How existing customers keep their data (no password migration)

- There is nothing secret to migrate: no passwords, no Google `sub`, no long-lived server sessions.
- Import `customers` and `profiles` into D1 keyed by lowercase email. Normalise with the same function as
  today, `trim().toLowerCase()` (`src/lib/dataStore.ts:52`), and check for case-variant duplicates before import.
- Better Auth `user` rows — two valid options:
  - **Pre-create** one row per `customers` document (`email`, `name`, `emailVerified: true`, `createdAt`).
    Preferred: sign-in then finds an existing user and nothing depends on hook ordering.
  - **Lazy**: let the first sign-in create the user. Works because store data is found by email, but the
    after-create hook must not overwrite the imported `customers` row.
- When the customer signs in again with the same email (code or Google), orders
  (`orders.customerEmail`), cart, wishlist and addresses (`profiles`) appear as before.
- `orders.customerUid` holds the old Firebase uid and is never read (`api/orders.js:415`). Keep the column as
  imported; for new orders either store the Better Auth user id or keep deriving the old value with the
  formula in `api/_lib/firebaseAdmin.js:36`. Decide once and document it.
- Do **not** migrate `customer_email_otps` or `rate_limits`; they are short-lived.
- **Review ids**: `customerReviewId` is an HMAC keyed with the `private_key` inside
  `FIREBASE_SERVICE_ACCOUNT` (`api/reviews.js:67-75`). If the new stack uses a different key, an existing
  customer's review of a product gets a different id and the "one review per customer per product" rule stops
  matching old reviews. Carry that key material over as its own Worker secret (for example
  `REVIEW_ID_SECRET`) or add an explicit `(email_hash, product_id)` uniqueness column during import.
- **Signed PayU result links** use `ADMIN_SESSION_SECRET` (`api/_lib/payu.js:145-149`). Carry the same secret
  over, or links issued in the 2 days before cut-over stop working.

### 4.6 Authorisation that replaces `firestore.rules`

Every browser → Firestore call becomes a Worker route. Minimum set, derived from section 3:

| Today (rule) | Target route check |
|---|---|
| `profiles/{email}` get/create/update by that customer (`firestore.rules:55-58`) | `GET/PUT /api/profile` — email taken **from the session**, never from the request body |
| `customers/{email}` read by that customer (`:61-64`) | part of `GET /api/profile` or the session payload |
| catalogue collections public read (`:19-38`) | public cached route (already exists as `?action=catalog`) |
| reviews: approved only for shoppers (`:41-44`) | filter in the query, admin flag from the admin cookie |
| orders: admin read/delete only (`:48-52`) | admin routes behind the admin cookie |
| `abandoned_checkouts` public create/update (`:66-69`) | public route with size limits and an IP rate limit |
| `leads` public create with whitelist (`:89-99`) | public route; port the field whitelist and length limits exactly |
| `product_daily` public get (`:112-115`) | public read route |
| analytics, `inventory_log`, `admin_settings` admin only (`:102-138`) | admin routes |
| default deny (`:141-143`) | no generic "read table" route; every route names its table |

### 4.7 Admin — keep the custom login as it is

Port `api/admin-config.js` login/session/logout/security logic unchanged in behaviour. Required adjustments:

1. **Credentials row**: one-row table `admin_credentials` with the same columns as `:216-225`. Import the
   existing document as-is, including `password_hash`, `pin_hash` and `session_version`. The owner's
   username, password and PIN then keep working with no reset.
2. **Hash verification**: `scryptSync` from `node:crypto` needs the `nodejs_compat` flag. scrypt at Node's
   default cost is CPU-heavy and a login verifies two hashes (password and PIN). Whether this fits the
   Workers Free CPU limit per request is **unverified and a real risk** — measure it first. If it does not fit:
   use the paid Workers plan, or verify the old scrypt hash once on a successful login and re-store it in a
   format that fits the limit. Do not weaken the hash to make it fit without the owner's agreement.
3. **Cookie `Secure` flag**: today it depends on `process.env.VERCEL === '1'` (`:296`). On Workers that
   variable does not exist, so the cookie would be issued without `Secure`. Set `Secure` whenever the request
   URL is HTTPS.
4. **Cookie path**: widen from `/api/admin-config` to `/api`. With Firebase gone, the admin cookie is the only
   admin credential, and `/api/orders`, `/api/reviews`, `/api/alerts` must see it (today they rely on the
   Bearer token: `api/orders.js:683`, `:702`, `:720`, `:738`; `api/reviews.js:285-286`; `api/alerts.js:147-148`).
   Keep `HttpOnly; SameSite=Strict`.
5. **`getIdentity` replacement**: one helper returning `{ admin, email }` where `admin` comes from the admin
   cookie (`authenticate()`), and `email` from the Better Auth session. Same shape as `api/_lib/http.js:42-58`,
   so the order/review/alert handlers change very little. Cache the credentials row per isolate for a short
   time so the `session_version` check does not cost a D1 read on every admin request.
6. **Same-origin check**: `x-forwarded-host` (`api/_lib/http.js:28`; `api/admin-config.js:348`) is a Vercel
   detail. Compare `Origin` with `new URL(request.url).host`. Make the admin check as strict as the customer
   one for state-changing methods (reject a missing `Origin`), now that the cookie is sent to more routes.
7. **Client IP**: use `CF-Connecting-IP` instead of `x-forwarded-for` (`api/admin-config.js:512`).
8. **Lifetimes and renewal**: keep 400 days / 12 hours and the sliding renewal (`:49-54`, `:378-380`).
9. **Revocation**: keep `session_version`. `revokeAdminFirebaseSessions` (`:562`, `:627`) is dropped.
10. **Firebase token**: `firebaseToken` disappears from the `login` and `session` responses (`:385`, `:556`).
11. **Database-down fallback** (section 2.5): keep it, with `ADMIN_INITIAL_USERNAME`, `ADMIN_INITIAL_PASSWORD`,
    `ADMIN_INITIAL_PIN` as Worker secrets. It now guards against a D1 error or an exhausted D1 daily limit.
    Module-level state (`lastCredentials`, the attempt map, the 60 s skip) lives per isolate and is shorter-lived
    than on Vercel; treat it as best effort. Keep the rule "an environment-fallback session ends when the
    database is back" (`:261`, `:341`), or decide deliberately to change it.
12. **Logout**: require a valid session before doing anything other than clearing the cookie.
13. **Entry slug headers**: reproduce `X-Robots-Tag` and `no-store` for `/admin`, `/drdaina`, `/d4daina`
    (`vercel.json:45-122`) in the Worker (or a `_headers` file), and consider applying them to the stored
    custom slug as well.
14. **Split the public GETs** (`?action=catalog`, public settings; `:457`, `:504`) from the admin path, e.g.
    `/api/catalog`. Needed for caching and for item 4.8.
15. **Localhost bypass** (`src/context/AdminContext.tsx:1118-1145`, `:55-63`): with `wrangler dev` the real API
    runs locally, so the in-browser credential check can be deleted. Remove any credential values from
    client source.

### 4.8 Optional: Cloudflare Access in front of the admin

- Cloudflare Zero Trust has a free tier for a small number of users **(verify current limits)**. Create a
  self-hosted Access application for the admin paths with a policy allowing only the owner's email
  (one-time PIN to email, or Google).
- Paths to cover: the entry slugs (`/drdaina*`, `/d4daina*`) and the admin API paths. This is why 4.7 item 14
  matters: the public catalogue currently lives under `/api/admin-config` and must move out first, or
  shoppers would hit the Access login.
- In the Worker, validate the `Cf-Access-Jwt-Assertion` header on admin routes as an additional check; keep
  the username/password/PIN login behind it. Access is a second lock, not a replacement.
- Trade-offs: the owner sees one extra sign-in step on a new device; the customisable slug
  (`AdminSettings.tsx:731-746`) would no longer be covered automatically — either freeze the slug or update the
  Access application when it changes. Protecting the SPA path only hides the shell; the API protection is
  what matters.
- Recommendation: migrate first with the existing login unchanged, add Access afterwards as a separate step.

### 4.9 Cookies and sessions — before and after

| | Today | Target |
|---|---|---|
| Customer credential | Firebase refresh/ID token in browser storage, sent as `Authorization: Bearer` | Better Auth HttpOnly session cookie, sent automatically |
| Customer session store | none on the server | `session` table in D1 (+ signed cookie cache) |
| Customer session length | until logout | set explicitly (recommend long, sliding) |
| Admin credential | `sag_admin_session` cookie, `Path=/api/admin-config` + Firebase token | `sag_admin_session` cookie only, `Path=/api` |
| Admin revocation | `session_version` + Firebase token revocation | `session_version` only |
| CSRF defence | `Origin` check; Bearer header for customers | `Origin` check on every state-changing route (now essential, since customers use cookies too); Better Auth has its own origin check for `/api/auth/*` |
| Admin and customer in one browser | two Firebase apps | two unrelated cookies — still independent |

At cut-over:

- **Every customer is signed out once.** Firebase sessions cannot be converted. Cart and wishlist in
  `localStorage` (`sag_cart_v1`, `sag_wishlist_v1`) survive, and the saved profile returns after sign-in.
  The first-load code must not treat "no session" as a logout that wipes local keys (`AuthContext.tsx:99-111`
  only runs on an explicit logout — keep it that way).
- **Admin**: if `ADMIN_SESSION_SECRET`, the cookie format and `session_version` are all carried over, the
  existing cookie would still verify, but it is scoped to the old path. Re-issuing it at `/api` leaves two
  cookies with the same name. Simplest safe choice: on the first renewal send two `Set-Cookie` headers (expire
  the old-path cookie, set the new one), or accept one admin re-login and say so in the cut-over notes.

### 4.10 Browser code changes

| File | Change |
|---|---|
| `src/context/AuthContext.tsx` | Replace Firebase listener with the Better Auth client session (`getSession` / `useSession`). Keep the `CustomerUser` shape `{ email, uid, name, phone }` (`:5`), the `sag-auth-state-change` / `sag-customer-logout` events (`:69`, `:78`, `:109-110`) and the logout key clean-up (`:34-37`, `:101-103`). Replace `signInWithOtpToken` with a "session established" refresh. Drop the `c_` uid test (`:23`). |
| `src/components/LoginPage.tsx` | `sendCode` → Better Auth email-OTP send (`:59-62`); `handleVerify` → Better Auth email-OTP sign-in, then the profile call for name/phone (`:118-127`). Map Better Auth error codes to the existing messages. Keep `VerifyResponse` handling for `customer.name`. No UI change. |
| `src/utils/googleSignIn.ts` | New client ID from an env var instead of the constant (`:4`). Delete the Firebase bridge (`:57-67`); send the Google credential to Better Auth. |
| `src/components/GoogleOneTap.tsx` | Same exchange function swap (`:27-29`). |
| `src/lib/api.ts` | Remove the `Authorization` header logic (`:14-24`); keep `credentials: 'same-origin'` (`:29`). |
| `src/context/ShopContext.tsx` | `getSessionEmail` (`:324-332`) reads the email from the auth context. Cart/wishlist `saveDoc` / `getDocById` on `profiles` (`:346`, `:366`, `:424`, `:444`) become `/api/profile` calls. Remove the `onAuthStateChanged` listener (`:595-600`); the custom event already covers it (`:602-606`). |
| `src/lib/addressBook.ts` | Profile reads/writes (`:185`, `:221`) → `/api/profile`. |
| `src/context/AdminContext.tsx` | Remove `signInAdminToFirebase` / `signOutAdminFromFirebase` calls (`:568`, `:575`, `:1097`, `:1158`) and the "Database authorization failed" branch (`:1098-1101`). `isFirebaseAdmin` (`:626-627`) becomes `isAdminLoggedIn`. Firestore live listeners (`:3`) become API fetches/polling. Delete the localhost credential branch (`:1118-1145`). |
| `src/lib/dataStore.ts`, `src/lib/firebase.ts` | Removed or rewritten as an API client; `firebase` and `firebase-admin` leave `package.json` (`:22-23`) at the end. |
| `src/components/admin/AdminCustomers.tsx` | Direct `customers` read (`:40`) → admin API route. |
| `src/utils/adminEntry.ts` | No change required. |

Because a session cookie cannot be read by JavaScript, "is someone signed in?" is answered by one session
request at start-up. Keep the `sag_custom_user` display cache (`AuthContext.tsx:24`) so the header shows the
name immediately and offline, and correct it when the session response arrives.

---

## 5. Risks

1. **Google OAuth client must be re-created under the new Google account.** The current client belongs to
   Firebase project `thor-217e7` (`src/utils/googleSignIn.ts:3-4`) and stops working when that project is shut
   down. New client → configure the OAuth consent screen (app name, support email, authorised domain
   `suitauragirls.in`), publish it to production, and add **Authorised JavaScript origins**
   `https://www.suitauragirls.in`, `https://suitauragirls.in` and the local dev origin. A redirect URI
   (`https://www.suitauragirls.in/api/auth/callback/google`) is needed only if the redirect flow is used.
   Until the origins are right, the Google button and One Tap fail silently; the email code still works.
   Customers will see Google's consent screen once more. No data depends on the old client.
2. **Do not delete the old OAuth client or Firebase project until the new site has been live for the agreed
   week**; rollback to Vercel needs them.
3. **scrypt CPU cost on Workers Free** for the admin login (4.7 item 2) — unverified; test before cut-over.
4. **Admin cookie `Secure` flag silently lost** if the `VERCEL` check is ported verbatim (4.7 item 3).
5. **Admin API authorisation gap**: forgetting to widen the cookie path or to replace `getIdentity` leaves
   order status changes, return handling and email diagnostics returning 401 for the owner — or, worse, a
   route left without any check. Test every admin action listed in 2.4 and 2.8.
6. **CSRF surface grows**: customers move from a Bearer header (not sent cross-site) to a cookie. Every
   state-changing route needs the `Origin` check; keep `SameSite` at least `Lax`.
7. **Account linking misconfiguration** would create two users for one email (one OTP, one Google) or refuse
   the second method. Store data is keyed by email so nothing is lost, but test it explicitly.
8. **Session length regression**: default Better Auth expiry is much shorter than Firebase's. Set it on purpose.
9. **OTP email deliverability**: sign-in depends entirely on Brevo. Sender domain/DKIM records live in DNS;
   moving DNS to Cloudflare must carry over every existing mail record (SPF, DKIM, DMARC, Brevo records).
10. **Rate-limit state in memory does not work on Workers.** Use D1 or KV. Count the D1 writes: each OTP send
    is roughly 2–3 writes, each verify 1–2.
11. **D1 daily limits replace the Firestore quota problem; they do not remove it.** Session cookie cache and a
    per-isolate cache of the admin credentials row keep auth reads low. Keep the "database down" admin fallback.
12. **Review id secret and PayU result-link secret** must be carried over (4.5).
13. **Secrets in client source**: `DEFAULT_SECURITY_CONFIG.adminPassword` / `.securityPin`
    (`src/context/AdminContext.tsx:55-63`) and the username alias (`:1119-1124`) ship in the public bundle.
    Check and remove during the migration; rotate the admin password and PIN if real values were ever there.
14. **`ADMIN_SESSION_SECRET` has three jobs today**: admin cookie signature (`api/admin-config.js:281`), OTP hash
    key (`api/customer-auth.js:18`) and PayU result link (`api/_lib/payu.js:146`). After migration the OTP job
    moves to `BETTER_AUTH_SECRET`. Do not reuse one value for both.
15. **Custom admin slug on a new device** only works with the built-in slugs (2.1). Unchanged by the
    migration, but it will surprise the owner on a new phone after cut-over because `localStorage` on the
    same domain is kept only on devices already used.
16. **Unauthenticated admin `logout`** (`api/admin-config.js:560-564`) currently lets anyone revoke the admin's
    Firebase tokens. Harmless after Firebase is gone, but require a session anyway.

---

## 6. Open questions

1. Is `VITE_GOOGLE_LOGIN=1` set in the Vercel build today, i.e. is Google sign-in actually live for customers?
2. Does the owner use a custom admin slug, or only `/drdaina` / `/d4daina`? (Decides Access and header rules.)
3. Is the `allowDirectAdminRoute` switch in use? If not, drop it.
4. How long should customers stay signed in on the new site? (Recommended: long-lived, sliding.)
5. Workers Free or Paid? Decides whether scrypt verification can stay as it is.
6. Do `DEFAULT_SECURITY_CONFIG.adminPassword` / `.securityPin` contain real values that need rotation?
7. Should `customers.status` start blocking sign-in, or stay informational as today?
8. Which value goes into `orders.customerUid` for new orders (4.5)?
9. Does the apex `suitauragirls.in` redirect to `www`, or serve the app? (Decides trusted origins and Google
   authorised origins.)
10. Is Cloudflare Access wanted now or as a later step?
