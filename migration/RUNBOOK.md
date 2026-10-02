# Runbook: Cloudflare Workers + D1 (moved from the old host and Firebase)

All commands run in Git Bash from the repository root. `<cloud>` is the value of `CLOUDINARY_CLOUD_NAME` in
`.env.migration` (public: it is part of every image URL). Secret values are never typed on a command line.

Notes that bite:

- Keep `wrangler d1 execute --command "..."` queries simple: through `npx` on Windows, a query with `%` or
  nested brackets hangs. Put anything longer in a `.sql` file and use `--file`.
- Local D1 fails with "internal error" when the state folder path is very long (over ~260 characters). The
  repository path is fine.
- `INSERT OR REPLACE` never removes rows. To re-import from a newer export, wipe first (step A2 / B4).

## A. Local rehearsal (nothing leaves this machine)

```bash
# A1. SQL from the newest export (self-checks every row against the export)
node migration/scripts/build-d1-import.cjs

# A2. Fresh local database: wipe, schema, import, compare counts
rm -rf worker/.wrangler/state
(cd worker && npx wrangler d1 execute suitauragirls-db --local --file schema.sql)
(cd worker && for f in ../migration/data/d1-import/*.sql; do npx wrangler d1 execute suitauragirls-db --local --file "$f" || break; done)
node migration/scripts/build-d1-import.cjs --verify --local

# A3. Local secrets (writes the git-ignored worker/.dev.vars), build, run
node migration/scripts/set-worker-secrets.cjs --dry-run
node migration/scripts/set-worker-secrets.cjs --dev-vars
npm run build:cf
(cd worker && npx wrangler dev)                  # http://127.0.0.1:8787

# A4. Smoke checks (second terminal)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/                               # 200
curl -s "http://127.0.0.1:8787/api/admin-config?action=catalog" | head -c 300                 # products JSON
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/sitemap.xml                    # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/some/app/route                 # 200 (app shell)
node --test "worker/test/*.test.mjs"                                                          # all tests pass
```

The local rehearsal keeps the old Cloudinary URLs (photos load from the old account). Then in the browser:
browse, add to cart, customer OTP login, admin login, a test order in Razorpay test mode.

## B. Go-live

```bash
# B1. Final data. Server-only collections (after the Firestore quota reset, about 12:30 IST):
node migration/scripts/export-firestore-rest.cjs
#     If orders may have arrived since the last export, first take a new full export
#     (node migration/scripts/export-firestore-client.cjs, needs ADMIN_USER / ADMIN_PASS / ADMIN_PIN in the
#     environment), then run export-firestore-rest.cjs again: it writes into the newest export folder.

# B2. Photos and reels to the new Cloudinary account (re-run until "Failed: 0")
node migration/scripts/upload-cloudinary-assets.cjs --dry-run
node migration/scripts/upload-cloudinary-assets.cjs

# B3. SQL with the URLs pointing at the new account
NEW_CLOUDINARY_CLOUD_NAME=<cloud> node migration/scripts/build-d1-import.cjs

# B4. Remote database: schema, import, compare counts
(cd worker && npx wrangler d1 execute suitauragirls-db --remote --file schema.sql)
#     only when re-importing over an earlier import, BEFORE customers use the new site:
#     (cd worker && npx wrangler d1 execute suitauragirls-db --remote --command "DELETE FROM docs")
#     (cd worker && npx wrangler d1 execute suitauragirls-db --remote --command "DELETE FROM collection_versions")
(cd worker && for f in ../migration/data/d1-import/*.sql; do npx wrangler d1 execute suitauragirls-db --remote --yes --file "$f" || break; done)
node migration/scripts/build-d1-import.cjs --verify --remote

# B5. Build and deploy (the site is reachable only on the workers.dev address until B8)
VITE_GOOGLE_LOGIN=1 npm run build:cf
(cd worker && npx wrangler deploy)

# B6. Secrets (every name must be listed under "Would set"; --generate fills the two random ones if empty)
node migration/scripts/set-worker-secrets.cjs --dry-run
node migration/scripts/set-worker-secrets.cjs --generate
(cd worker && npx wrangler secret list)
```

B7. Smoke checks on the `https://suitauragirls.<account>.workers.dev` address printed by the deploy: the four
`curl` checks of A4 with that address; product photos load from `res.cloudinary.com/<cloud>/`; admin login
works and shows the 38+ orders; a customer OTP email arrives; one real order with the smallest product, paid
with Razorpay, shows as paid in Admin and the stock drops by one; then refund it from the Razorpay dashboard.
Google sign-in only works on the real domain (its origin is fixed in the Google console), so check it after B8.
`(cd worker && npx wrangler tail)` shows errors live.

B8. Custom domain. The zone `suitauragirls.in` must be active on this Cloudflare account. Dashboard ->
Workers & Pages -> suitauragirls -> Settings -> Domains & Routes -> Add -> Custom domain ->
`www.suitauragirls.in` (and `suitauragirls.in` if it should answer too). The Razorpay webhook
(`https://www.suitauragirls.in/api/webhooks/razorpay`) and the PayU return URL do not change; the webhook
secret in the Razorpay dashboard must equal `RAZORPAY_WEBHOOK_SECRET`. Repeat B7 on the real domain,
including Google sign-in.

## C. Rollback

There is no rollback to the old host any more. The old host was retired after the cut-over: its config file
and project link were removed from the repository, and the store runs only on the Cloudflare Worker with its
data in D1. Firestore holds the data as it was before the cut-over and gets no new orders.

If a deploy breaks the site, go back to the previous Worker version instead: Cloudflare dashboard ->
Workers & Pages -> the Worker -> Deployments -> Rollback (or revert the commit and push). This does not
change the data in D1.
