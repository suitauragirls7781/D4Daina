# Browser shims for the Cloudflare build

`vite build --mode cloudflare --outDir dist-cf` (script `build:cf`) resolves the four Firebase SDK imports to
the files in this folder (aliases in `vite.config.ts`). Every other mode, including the default `vite build`,
keeps the real Firebase SDK. No app code changes: the shims export the same names with the same call shapes.

| Import | File | What it does instead |
|---|---|---|
| `firebase/app` | `firebase-app.ts` | An app is just a name plus the config it was given. |
| `firebase/auth` | `firebase-auth.ts` | The token from `/api/customer-auth` / `/api/admin-config` IS the session. Kept in `localStorage` under `sag_auth_token:<app name>`. |
| `firebase/firestore` | `firebase-firestore.ts` | Every call becomes an op in `POST /api/db` (BUILD-SPEC section 7), with the token of the app the instance was created from. |
| `firebase/analytics` | `firebase-analytics.ts` | `isSupported()` answers `false`, so `src/lib/firebase.ts` skips analytics. |

Tests: `node --test src/shims/__tests__/shims.test.mjs` (Node 24 loads the `.ts` files directly; fake `fetch`,
fake timers, fake `localStorage` / `document`).

## Behaviour worth knowing

**Sign-in state**

- Three apps exist: `[DEFAULT]` (customer), `sag-admin` (admin) and `sag-google` (created on demand). Each has
  its own session and storage key, so admin and customer never replace each other.
- A saved session is restored synchronously in `getAuth()`, so `auth.currentUser` is already set when the
  first component reads it. `onAuthStateChanged` still makes its first call asynchronously, then calls on
  every sign-in / sign-out (not when the same user gets a new token), as Firebase does.
- The browser only decodes the token payload (`uid`, claims, `exp`); the server checks the signature. An
  expired or unreadable token means signed out. A sign-in or sign-out in another tab is followed (`storage`
  event).
- `signInWithCredential` (Google) is not saved: the user's `getIdToken()` is Google's own credential, which
  `src/utils/googleSignIn.ts` posts to `/api/customer-auth`.
- A token the server refuses is dropped: on `unauthenticated` / HTTP 401, and when a READ is answered
  `permission-denied` for a token with the `admin` claim (the admin may read everything the app reads, so
  this only happens after the admin signed out elsewhere or changed the security settings). The admin
  session check in `AdminContext` then signs in again with the fresh token from `/api/admin-config`.

**Requests**

- One-shot reads (`getDoc`, `getDocs`, `tx.get`) asked for in the same tick go out in one request, at most 20
  ops each; the same read asked twice is sent once. Writes go out immediately, one per request.
- A write made while the page is hidden uses `keepalive` (cart / wishlist saved on tab close), except `addDoc`.
- `undefined` fields are dropped and `Date` values become ISO strings (plain `JSON.stringify`).
- Errors are `Error` objects with `code` and `message`. Codes come from the gateway; when the request itself
  fails: network / timeout / 5xx -> `unavailable`, 401 -> `unauthenticated`, 403 -> `permission-denied`,
  429 -> `resource-exhausted` (message `Quota exceeded.` unless the server sent one), 400 / 413 -> `invalid-argument`.

**Listeners (`onSnapshot`)**

- Polling. All listeners of an app share one `watch` op (50 targets per op) in one request per tick: every
  10 s when that app's token has the `admin` claim, every 60 s otherwise. One request per APP, not per page,
  because a request carries one token (an admin browser has two: storefront listeners and admin listeners).
  Whenever a poll goes out, every healthy listener of that app rides along, so listeners that started at
  different moments (the admin dashboard adds some a few seconds late) still make one request per interval.
- The first snapshot is asked for at once (also in a background tab). Later the app is called only when the
  documents it would see changed (document version, or the ids + versions of a query's documents).
- No polling while the tab is hidden; one poll immediately when it is shown again, on window focus, when
  the browser comes back online, after any write through the shim and after a sign-in / sign-out.
- A failed poll calls the listener's error callback once per failure streak and retries after 2 s, 4 s, 8 s ...
  up to 5 minutes. Unlike Firebase, a listener that was refused is not dead: it starts delivering when the
  server allows it (for example after the admin signs in). Callbacks run inside a guard and can never throw
  into the polling loop.

**Transactions**

- `runTransaction(db, fn)`: `tx.get` records the version it read (`null` for a missing document), `tx.set` /
  `tx.update` / `tx.delete` are buffered, then ONE `commit` op carries the writes with the read versions as
  preconditions. On `aborted` the function runs again on fresh data, at most 5 attempts.

## Not implemented (not used by the app)

`writeBatch`, `getDocFromServer`, `getCountFromServer`, `docChanges()`, `startAfter` / cursors, `serverTimestamp`,
`increment`, `arrayUnion`, `collectionGroup`, subcollections, offline cache (`metadata.fromCache` is always
`false`), `signInWithPopup` / redirect, `onIdTokenChanged`. Add them here before using them in the app.

## Inventory of call sites (grep of `src/`, 2026-10-02)

### `firebase/app`, `firebase/analytics`

| Call site | Names used |
|---|---|
| `src/lib/firebase.ts:1,7,28` | `initializeApp(config)`, `initializeApp(config, 'sag-admin')`, `getApps()` (`.length`, `[0]`, `.find(a => a.name === ...)`) |
| `src/utils/googleSignIn.ts:58,61` (dynamic import) | `initializeApp(config, 'sag-google')`, `getApps().find(...)` |
| `src/lib/firebase.ts:4,39-42` | `isSupported().then(...)`, `getAnalytics(app)` |

### `firebase/auth`

| Call site | Names used | What the app reads |
|---|---|---|
| `src/lib/firebase.ts:2,10,29` | `getAuth(app)` | exported as `auth`, `adminAuth` |
| `src/context/AuthContext.tsx:47-79` | `onAuthStateChanged(auth, async cb)`, `signOut` | `fbUser.uid`, `fbUser.getIdTokenResult()` -> `claims.customerEmail` |
| `src/context/AuthContext.tsx:84-86` | `signInWithCustomToken(auth, token)` | `credential.user.uid`, `credential.user.getIdTokenResult().claims.customerEmail` |
| `src/context/AuthContext.tsx:106` | `signOut(auth)` | `auth.currentUser?.uid` |
| `src/context/ShopContext.tsx:325,595` | `onAuthStateChanged(auth, cb)` | `auth.currentUser.uid`, `fbUser.uid.startsWith('c_')` |
| `src/context/AdminContext.tsx:547,626,627` | `onAuthStateChanged(adminAuth, cb)` | `adminAuth.currentUser?.uid === 'sag-admin'` (also read synchronously in a `useState` initialiser) |
| `src/context/ProductContext.tsx:10,134` | - | `adminAuth.currentUser` (truthiness) |
| `src/lib/dataStore.ts:14,18,142-147` | `signInWithCustomToken(adminAuth, token)`, `signOut(adminAuth)` | `adminAuth.currentUser` picks `adminDb` over `db`; `.uid` |
| `src/lib/api.ts:17-20` | - | `auth.currentUser` / `adminAuth.currentUser`, `current.getIdToken()` -> `Authorization: Bearer` |
| `src/utils/googleSignIn.ts:59-65` (dynamic import) | `getAuth`, `GoogleAuthProvider.credential(idToken)`, `signInWithCredential`, `signOut` | `cred.user.getIdToken()` |

### `firebase/firestore`

| Call site | Names used | Target | Snapshot / error members read |
|---|---|---|---|
| `src/lib/firebase.ts:3,15-36` | `initializeFirestore(app, settings, '(default)')`, `getFirestore(app, id)` | both apps | - |
| `src/lib/dataStore.ts:54-94` | `collection`, `doc`, `query`, `where`, `getDocs`, `getDoc`, `setDoc(ref, data, { merge })`, `updateDoc`, `deleteDoc`, `onSnapshot(collection, next, error)`, type `DocumentData` | any collection in `COLLECTIONS`, through `adminDb` when the admin is signed in | `snapshot.docs`, `d.id`, `d.data()`, `snapshot.exists()`, `snapshot.metadata.fromCache`, `error.message` |
| `src/context/AdminContext.tsx:938-944` | `collection`, `query`, `where`, `onSnapshot` | `reviews` (all for admin, `status == approved` otherwise) | `snapshot.docs`, `d.id`, `d.data()`, `error.message` |
| `src/context/AdminContext.tsx:984-1003` | `query`, `orderBy('createdAt','desc')`, `onSnapshot` | `leads` | `snapshot.forEach`, `doc.id`, `doc.data()`, `err.code === 'resource-exhausted'`, `err.message.includes('Quota')` |
| `src/context/AdminContext.tsx:1548,1553-1554` | `updateDoc`, `deleteDoc` (dynamic import), `doc` | `leads/{id}` | - |
| `src/context/ProductContext.tsx:483-491` | `doc`, `runTransaction(db, async tx)`, `tx.get`, `tx.update` | `products/{id}` | `snap.exists()`, `snap.data()` |
| `src/context/ShopContext.tsx:1082,1101` | `doc`, `onSnapshot(doc, next, error)` | `storefront_settings/storeSettings`, `/comboOffer` | `snapshot.exists()`, `snapshot.data().value_json` |
| `src/utils/discovery.ts:88`, `looks.ts:43`, `reels.ts:98` | `doc`, `onSnapshot` | `storefront_settings/discovery`, `/lookRelations`, `/auraReels` | `snap.exists()`, `snap.data().value_json` |
| `src/components/DeliveryCheck.tsx:84` | `doc`, `onSnapshot(doc, next, error)` | `storefront_settings/storeSettings` | callbacks only |
| `src/components/ProductDetailPage.tsx:65` | `doc`, `getDoc` (`addDoc`, `collection` imported, unused) | `product_daily/{day}_{productId}` | `snap.exists()`, `snap.data()` |
| `src/components/ProductReviews.tsx:180-184` | `collection`, `query`, `where` x2, `onSnapshot` | `reviews` where `productId ==` and `status == approved` | `snap.docs`, `d.id`, `d.data()` |
| `src/components/ContactUsPage.tsx:35`, `HomeSections.tsx:247` | `collection`, `addDoc` | `leads` | `error.code === 'resource-exhausted'`, `error.message.includes('Quota')` |
| `src/components/admin/AdminCustomers.tsx:40-43` | `collection`, `getDocs` | `customers` | `snapshot.docs`, `d.id`, `d.data()`, `err.code === 'permission-denied'` |
| `src/components/admin/AdminInsights.tsx:22-30` | `collection`, `query`, `where('day','in',days)`, `getDocs` | `search_terms`, `product_daily` | `t.docs.forEach`, `d.data()` |
| `src/components/admin/AdminStockHistory.tsx:38-44` | `collection`, `query`, `where`, `orderBy('at','desc')`, `limit`, `getDocs` | `inventory_log` | `snapshot.docs`, `d.id`, `d.data()` |
| `src/components/admin/AdminDashboardOverview.tsx:62,78-106` | `doc`, `collection`, `query`, `orderBy`, `limit`, `onSnapshot` | `analytics_totals/lifetime`, `daily_analytics` (date desc, 15), `visitor_sessions` (lastActive desc, 100) | `snap.exists()`, `snap.data()`, `snapshot.forEach`, `doc.id`, `doc.data()`, `err.code === 'resource-exhausted'` |
| `src/components/admin/AdminOrderDetails.tsx:108-123` | `doc`, `onSnapshot(doc, next, error)` | `orders/{orderNumber}` | `snap.data()` (may be `undefined`) |
| `src/components/admin/AdminReviews.tsx:58-62` | `collection`, `onSnapshot` | `reviews` | `snap.docs.forEach`, `d.id`, `d.data()` |
| `src/components/admin/AdminComboOffers.tsx:18`, `AdminDiscovery.tsx:43`, `AdminLooks.tsx:163,173`, `AdminReels.tsx:207` | `doc`, `onSnapshot` | `storefront_settings/*` | `snap.exists()`, `snap.data().value_json` |

Never used anywhere in `src/`: `.empty`, `.size`, `docChanges()`, `metadata.hasPendingWrites`, `ref` on a
snapshot (all present on the shim's snapshots except `docChanges`). The only error codes the app compares are
`resource-exhausted` and `permission-denied`; everything else is shown or logged through `error.message`.
