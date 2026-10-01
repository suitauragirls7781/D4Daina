# Build spec: move the store from Vercel + Firebase to Cloudflare Workers + D1

This is the contract every builder works against. Read it fully before writing code.

## 0. Strategy (why it is built this way)

The store is live and takes real payments. The business logic in `api/**` (order creation, server-side
re-pricing, stock, Razorpay / PayU verification, coupons, returns, emails) is **kept byte-for-byte**. Only the
things underneath it are replaced:

| Today | New |
|---|---|
| Vercel serverless functions (Node `req, res`) | One Cloudflare Worker; a small adapter gives the same `req, res` objects to the **unchanged** handlers in `api/**` |
| `firebase-admin` Firestore | A Firestore-Admin-compatible **document store on D1** (`worker/src/shims/firebase-admin-firestore.js`) |
| `firebase-admin` Auth (custom tokens, verifyIdToken) | Our own signed tokens (`worker/src/shims/firebase-admin-auth.js`) |
| Browser `firebase/firestore`, `firebase/auth` SDKs | Browser shims with the same function names (`src/shims/*.ts`), selected by a Vite alias in the `cloudflare` build mode; they talk to `POST /api/db` |
| Firestore security rules | `worker/src/rules.js`, enforced by the `/api/db` gateway |
| Vercel static hosting + `vercel.json` | Workers Static Assets (SPA fallback) + `public/_headers` |

Documents stay JSON documents (one D1 row per Firestore document). No relational remodelling now: it would
mean rewriting every query and the money path, which is exactly the risk we are avoiding. (Relational tables
can come later, table by table, behind the same shim.)

**Rules for builders**

- Existing files are NOT edited, except where this spec names a file and an owner. The current Vercel build
  (`vite build`, `api/**` on Vercel with firebase-admin) must keep working unchanged until cut-over.
- Never call the production site or its `/api`, never touch Firestore (its free quota is exhausted), never
  deploy, never `git commit`. Local tools only: node (v24, has `node:sqlite`), `wrangler` 4.x local mode,
  Playwright with the Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- Never print secret values. Secrets are referred to by env-var name.
- Match the comment style of the codebase: short, plain comments that explain why.
- Reference material: `migration/map/*.md` (system map), `firestore.rules`, `api/**`, `src/**`.
- Real exported data for local tests: `migration/data/export-*/<collection>.json`
  (array of `{ id, data }`; contains customer details: never copy it elsewhere, never commit it).

## 1. Layout (all new)

```
worker/
  wrangler.jsonc
  schema.sql
  src/index.js                      Worker entry (router)
  src/env.js                        setEnv(env) / getEnv() / getDB()
  src/node-adapter.js               Request -> { req, res } like Vercel's Node functions -> Response
  src/docstore.js                   D1 document store (core)
  src/tokens.js                     JWT (HS256) + Google credential verification
  src/rules.js                      port of firestore.rules
  src/gateway.js                    POST /api/db
  src/shims/firebase-admin-app.js
  src/shims/firebase-admin-firestore.js
  src/shims/firebase-admin-auth.js
  test/d1-node.mjs                  D1-compatible wrapper over node:sqlite for fast unit tests
  test/*.test.mjs                   node --test
src/shims/firebase-app.ts
src/shims/firebase-auth.ts
src/shims/firebase-firestore.ts
src/shims/firebase-analytics.ts
public/_headers
migration/scripts/*.cjs
```

## 2. D1 schema (`worker/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,              -- JSON object
  version    INTEGER NOT NULL DEFAULT 1, -- +1 on every write (optimistic concurrency)
  created_at TEXT NOT NULL,              -- ISO
  updated_at TEXT NOT NULL,              -- ISO
  PRIMARY KEY (collection, id)
) WITHOUT ROWID;

-- one row per collection, bumped on every write to it: lets pollers ask "anything new?" with one row read
CREATE TABLE IF NOT EXISTS collection_versions (
  collection TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

-- transaction guard: inserting ok = 0 violates the CHECK and rolls the whole batch back
CREATE TABLE IF NOT EXISTS tx_guard (ok INTEGER NOT NULL CHECK (ok = 1));
```

Plus expression indexes `ON docs (collection, json_extract(data, '$.<field>'))` for every field used in an
equality filter or sort (server: `status`, `productId`, `attemptKey`, `customerEmail`, `reviewId`,
`razorpayOrderId`, `couponCode`, `paymentStatus`, `customerMobile`; browser: `date`, `lastActive`, `at`,
`createdAt`, plus whatever the builders find). The query builder MUST emit exactly
`json_extract(data, '$.field')` so SQLite uses them.

A document path is always `collection/id` (no subcollections exist; verify and say so if you find one).

## 3. Document store API (`worker/src/docstore.js`)

```js
export class StoreError extends Error { code }   // 'not-found' | 'already-exists' | 'aborted' | 'invalid-argument'
export const createStore = (d1) => ({
  getDoc(collection, id),                // -> { id, data, version } | null
  getMany([{ collection, id }, ...]),    // -> same order, null for missing (chunked, few statements)
  query({ collection, where = [], orderBy = [], limit, select }),
                                         // where: [[field, '==', value], ...] (AND). Ops to support: == != < <= > >= in array-contains
                                         // orderBy: [[field, 'asc' | 'desc']]; '__name__' means the id
                                         // -> [{ id, data, version }]
  collectionVersion(collection),         // -> integer (0 if never written)
  commit(writes, { preconditions = [] } = {}),
});
```

`writes`: `{ type: 'set', collection, id, data, merge?: boolean | mergeFields? }`, `{ type: 'update', collection, id, data }`
(keys may be dotted paths `a.b.c`; the document must exist), `{ type: 'create', ... }` (must not exist),
`{ type: 'delete', collection, id }`.

`preconditions`: `{ collection, id, version }` where `version` is the version that was read, or `null` meaning
"did not exist when read".

`commit` is ONE atomic D1 `batch()`: guard statement first (CHECK trick above) so that if any precondition,
`update`-exists or `create`-not-exists check fails, nothing is written and a `StoreError` is thrown
(`aborted` / `not-found` / `already-exists`). Every write bumps the row `version` and the collection's row in
`collection_versions`.

Sentinel values inside `data` (at any depth for set/merge; as the value of a field path for update):
`{ __op: 'increment', n }`, `{ __op: 'arrayUnion', values: [...] }`, `{ __op: 'arrayRemove', values }`,
`{ __op: 'delete' }`, `{ __op: 'serverTimestamp' }` (stored as an ISO string). Because transforms need the
current value, a write with sentinels reads the document and commits with a version precondition, retrying on
conflict (up to 8 times) so concurrent increments never lose an update.

Semantics to match Firestore exactly: `set` without merge replaces the document; `set` with merge deep-merges
maps (arrays are replaced as a whole); `update` replaces the value at each (dotted) path; `undefined` fields
are dropped; `Date` values are stored as ISO strings; the JSON must round-trip (no NaN/Infinity).

Row reads matter on D1 (free plan counts rows scanned): point lookups by primary key, indexed filters, never
`SELECT *` over a growing collection without a filter/limit unless the caller asked for the whole collection.

## 4. firebase-admin shims (server)

`api/**` keeps importing `firebase-admin/app`, `firebase-admin/firestore`, `firebase-admin/auth`;
`worker/wrangler.jsonc` aliases those three specifiers to the shims.

`firebase-admin-app.js`: `initializeApp`, `getApps`, `cert` (inert objects).
`api/_lib/firebaseAdmin.js` reads `process.env.FIREBASE_SERVICE_ACCOUNT`: the Worker entry sets
`process.env.FIREBASE_SERVICE_ACCOUNT ||= '{}'` so that file works unchanged.

`firebase-admin-firestore.js`: `getFirestore()` returns an object over `createStore(getDB())` with the surface
the handlers use (verify by grepping `api/**`; at the time of writing):

- `db.collection(name)`, `.doc(id?)` (auto id: 20 url-safe chars), `ref.id`, `ref.path`
- `ref.get()`, `ref.set(data, { merge })`, `ref.update(data)`, `ref.delete()`, `ref.create(data)`
- `collection.get()`, `collection.add(data)`, `.where(f, op, v)` (chainable), `.orderBy(f, dir)`, `.limit(n)`, `.select(...fields)`, `query.get()`
- `db.getAll(...refs)`, `db.batch()` (`set/update/delete/create`, `commit()`)
- `db.runTransaction(fn)`: `tx.get(refOrQuery)`, `tx.getAll(...refs)`, `tx.set/update/delete/create`; reads are
  recorded with their versions, writes buffered, committed with preconditions; on `aborted` the function is
  re-run (up to 5 attempts, like Firestore); the function's return value is returned.
- Snapshots: `doc.exists` (boolean property), `doc.id`, `doc.ref`, `doc.data()`, `doc.get(field)`;
  `query.docs`, `query.empty`, `query.size`, `query.forEach`.
- `FieldValue.increment(n)`, `.arrayUnion(...v)`, `.arrayRemove(...v)`, `.delete()`, `.serverTimestamp()`; `Timestamp` (minimal: `now()`, `fromDate()`, `toDate()`).
- Errors carry Firestore's numeric gRPC `code` because handlers check it: `5` NOT_FOUND (update / missing),
  `6` ALREADY_EXISTS (create), `10` ABORTED. Check every `error.code` / `error?.code` comparison in `api/**`.

`firebase-admin-auth.js`: `getAuth()` -> `{ createCustomToken(uid, claims), verifyIdToken(token, checkRevoked), revokeRefreshTokens(uid) }` (see 5).

## 5. Tokens (`worker/src/tokens.js`)

There is no Firebase Auth any more. The "custom token" the server hands out IS the session token the browser
keeps and sends as `Authorization: Bearer <token>`.

- Compact JWT, HS256, secret `AUTH_TOKEN_SECRET` (env). Payload: `{ uid, ...claims, iat, exp }`.
  Lifetimes: admin (`uid === 'sag-admin'`, claim `admin: true`) 400 days; customers (`customerEmail` claim) 180 days.
- `verifyIdToken(token, checkRevoked)`: constant-time signature check, `exp`; returns the payload (so
  `decoded.uid`, `decoded.admin`, `decoded.customerEmail` work as today). With `checkRevoked`, read
  `auth_state/<uid>` in the document store and reject tokens with `iat` older than `revokedAt`.
- `revokeRefreshTokens(uid)`: sets `auth_state/<uid>.revokedAt = now`.
- Google sign-in: the browser now sends Google's own credential (an RS256 JWT from Google Identity Services)
  as `idToken` to `/api/customer-auth` action `google`. `verifyIdToken` recognises it (`iss` is
  `https://accounts.google.com` or `accounts.google.com`), verifies it against Google's JWKS
  (`https://www.googleapis.com/oauth2/v3/certs`, cached in memory per `Cache-Control`), checks `aud` equals
  `GOOGLE_CLIENT_ID` (env; default: the id in `src/utils/googleSignIn.ts`) and `exp`, and returns
  `{ uid, email, email_verified, name, picture, firebase: { sign_in_provider: 'google.com' } }` so
  `api/customer-auth.js` works unchanged.

## 6. Node adapter and router (`worker/src/node-adapter.js`, `worker/src/index.js`)

`index.js`: `export default { fetch(request, env, ctx) }`. Calls `setEnv(env)`, makes sure
`process.env` has the bindings (compat flag `nodejs_compat` + a recent compatibility date populate it; also
copy string bindings defensively), then routes:

| Path | Handler |
|---|---|
| `/api/admin-config`, `/api/orders`, `/api/customer-auth`, `/api/payu`, `/api/reviews`, `/api/track`, `/api/alerts`, `/api/sitemap` | default export of `api/<name>.js` through the adapter |
| `/api/webhooks/razorpay` | `api/webhooks/razorpay.js` |
| `/sitemap.xml` | same as `/api/sitemap` (the vercel.json rewrite) |
| `/api/db` | `gateway.js` |
| anything else | `env.ASSETS.fetch(request)` (SPA fallback is configured in wrangler.jsonc) |

The adapter must give each handler exactly what it uses today (read every handler): `req.method`, `req.url`,
`req.headers` (lower-cased keys; `x-forwarded-for` from `cf-connecting-ip`, `x-forwarded-host`/`host`),
`req.query`, `req.body` (JSON parsed for JSON bodies, an object for `application/x-www-form-urlencoded` (PayU
posts that), string otherwise), whatever the Razorpay webhook uses to get the RAW body for its signature, and
`req.socket.remoteAddress`. `res`: `status()`, `setHeader()` (multiple `Set-Cookie`), `getHeader()`, `end()`,
`json()`, `send()`, `redirect()`, `writeHead()`: check which are used. Unhandled errors -> 500 JSON, logged.

GET responses that carry `s-maxage` in `Cache-Control` (the catalogue) are stored in and served from
`caches.default` for that many seconds (key: full URL), via `ctx.waitUntil`.

`wrangler.jsonc`: name `suitauragirls`, `main: src/index.js`, `compatibility_date` recent (>= 2025-09-01),
`compatibility_flags: ["nodejs_compat"]`, `alias` for the three firebase-admin specifiers,
`assets: { directory: "../dist-cf", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/sitemap.xml"] }`,
`d1_databases: [{ binding: "DB", database_name: "suitauragirls-db", database_id: "bae4a715-99a3-4021-9d42-56843baed258" }]`,
`vars: { VERCEL: "1" }` (the handlers use it to mark cookies Secure), observability logs on.
Secrets (set later with `wrangler secret put`): everything in the "server env names" list of
`migration/map/05-integrations-and-config.md` plus `AUTH_TOKEN_SECRET`.

`public/_headers` reproduces the headers in `vercel.json` (security headers on everything, immutable cache on
`/assets/*`, noindex + no-store on the admin paths `/drdaina*`, `/d4daina*`, `/admin*`).

## 7. Browser data gateway (`worker/src/gateway.js`, `worker/src/rules.js`)

`POST /api/db`, same-origin only, JSON `{ ops: [...] }` -> `{ results: [...] }` (one result per op, in order;
a failed op gives `{ error: { code, message } }` with Firestore's string codes: `permission-denied`,
`not-found`, `already-exists`, `aborted`, `invalid-argument`, `unavailable`). Identity comes from
`Authorization: Bearer <token>` (`verifyIdToken`; admin tokens checked for revocation): anonymous, customer
(`customerEmail`), or admin.

Ops:

- `{ op: 'get', path }` -> `{ exists, id, data, version }`
- `{ op: 'query', collection, where?, orderBy?, limit? }` -> `{ docs: [{ id, data, version }], version }` (`version` = collection version)
- `{ op: 'set', path, data, merge? }`, `{ op: 'update', path, data }`, `{ op: 'add', collection, data }` -> `{ id }`, `{ op: 'delete', path }`
- `{ op: 'commit', preconditions: [{ path, version }], writes: [...] }` (browser `runTransaction`) -> `{ ok: true }` or error `aborted`
- `{ op: 'watch', targets: [{ key, kind: 'doc', path, since? } | { key, kind: 'query', collection, where?, orderBy?, limit?, since? }] }`
  -> `{ targets: [{ key, unchanged: true } | { key, version, exists?, id?, data?, docs? }] }`. `since` is the
  version the client already has (doc version, or collection version for queries): unchanged targets cost one
  row read.

`rules.js` is a faithful port of `firestore.rules`: for a given identity, collection, document id, operation
(`get`, `list`, `create`, `update`, `delete`) and, for writes, the new and existing data, return allow/deny,
including every field-level condition in the rules (who may write which fields, owner checks by email, etc.).
List queries are allowed only when the rules would allow reading every document the query can return (as
Firestore does); when a rule depends on document fields, check each returned document and deny the whole
query on a violation. Anything not matched by a rule is denied (the rules end with a deny-all).
Limits: max 20 ops per request, max 500 documents per query unless admin, 200 KB body.

## 8. Browser shims (`src/shims/*.ts`)

Selected by Vite aliases only in the `cloudflare` mode (`vite build --mode cloudflare --outDir dist-cf`); the
default build keeps the real Firebase SDK. Owner of `vite.config.ts` edits: the browser-shims builder
(additive, default build unchanged).

They export exactly the names the app imports (grep `src/` for `from 'firebase/`), with the same call
signatures and the snapshot shapes the app reads:

- `firebase/app`: `initializeApp(config, name?)`, `getApps()`.
- `firebase/analytics`: `isSupported()` -> `Promise<false>`, `getAnalytics()`.
- `firebase/auth`: `getAuth(app)`, `signInWithCustomToken(auth, token)`, `signInWithCredential(auth, cred)`,
  `GoogleAuthProvider.credential(idToken)`, `onAuthStateChanged(auth, cb)` (fires once asynchronously with the
  restored user or null, then on every change), `signOut(auth)`, `auth.currentUser` with `uid`,
  `getIdToken()`, `getIdTokenResult()` (`{ claims }`). The token is kept in `localStorage` per app name so a
  reload stays signed in (as Firebase did); an expired token means signed out. `signInWithCredential` with a
  Google credential returns a user whose `getIdToken()` is that Google credential (see 5).
- `firebase/firestore`: `getFirestore`, `initializeFirestore`, `collection`, `doc`, `query`, `where`,
  `orderBy`, `limit`, `getDoc`, `getDocs`, `getDocsFromServer`, `addDoc`, `setDoc`, `updateDoc`, `deleteDoc`,
  `runTransaction`, `onSnapshot`, `writeBatch` if used, and the types the app imports. Each Firestore instance
  belongs to an app, and requests carry that app's auth token (the app uses two apps: default = customer,
  `sag-admin` = admin; see `src/lib/firebase.ts` and `src/lib/dataStore.ts`).
  `onSnapshot(target, onNext, onError?)` returns an unsubscribe function, delivers the first snapshot as soon
  as possible and later ones only when something changed. All active listeners of the page are multiplexed
  into ONE `watch` request per tick: every 10 s for an admin token, every 60 s otherwise, only while the tab is
  visible (and once immediately when it becomes visible again or after any write made through the shim).
  Snapshot shapes: document `{ id, exists(), data(), ref, metadata: { fromCache: false } }`; query
  `{ docs, size, empty, forEach, metadata: { fromCache: false } }`.
  Errors are `Error` objects with a Firestore-style `code` (`permission-denied`, `unavailable`, ...) and a
  `message`, because the app inspects both (grep for `resource-exhausted`, `permission-denied`, `.code`).

## 9. Data import and assets (`migration/scripts`)

- `build-d1-import.cjs`: latest `migration/data/export-*` -> `migration/data/d1-import/*.sql` (chunks small
  enough for `wrangler d1 execute --file`), inserting into `docs` and `collection_versions`. Optional
  `NEW_CLOUDINARY_CLOUD_NAME` env rewrites `res.cloudinary.com/daps4gdk/` to the new cloud name in every
  string. Prints per-collection counts; a `--verify` mode compares counts in a D1 database (local or remote)
  with the export.
- `upload-cloudinary-assets.cjs`: uploads `migration/data/assets/**` (see `_manifest.json`) to the NEW
  Cloudinary account with the SAME public ids (signed uploads; env `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` read from `.env.migration`), resumable, never deletes anything.
- `set-worker-secrets.cjs`: reads `.env.migration` and runs `wrangler secret put` for each non-empty value
  (values never echoed).

## 10. Tests (local only)

- `worker/test/d1-node.mjs`: `prepare(sql).bind(...).first()/all()/run()/raw()` and `batch([...])` (atomic,
  rolls back on error) over `node:sqlite`, close enough to D1 for unit tests. The document store must ALSO be
  exercised once against real local D1 (`getPlatformProxy` from `wrangler`) to prove the guard/rollback trick.
- Unit tests for the store (merge/update/sentinels/transactions/conflicts), tokens, rules (allow and deny
  cases taken from `firestore.rules`), gateway.
- Handler scenario tests: the REAL `api/**` handlers loaded in Node with the shims (module alias hook) and a
  mocked `fetch` for Razorpay / PayU / Brevo / Cloudinary / Gemini, over the real exported data: catalogue,
  customer OTP send + verify, order create -> Razorpay order -> signature verify -> paid (stock decremented
  once, idempotent on retry), Razorpay webhook, PayU hash + callback, coupon limits, admin login + session +
  save settings, tracking with its budget, returns.
