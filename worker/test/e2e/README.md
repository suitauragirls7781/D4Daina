# Local end-to-end checks

A real Chrome drives the Cloudflare build of the store, served by the Worker under `wrangler dev` with local
D1. Nothing leaves this machine except product photos, reels and fonts (`media.suitauragirls.in`, Google Fonts);
every other outside host is blocked in the browser, and a request to Firestore, Firebase Auth or the live
site fails the run.

| Script | What it proves |
|---|---|
| `storefront.mjs` | Home, shop, category, product page and search show the products of local D1; add to bag and the checkout's payment options (never pays); an abandoned checkout, a contact message and a newsletter sign-up land in D1; an anonymous visitor cannot change products or read orders; customer sign-in screen; `/sitemap.xml`, cache and security headers, unknown paths. |
| `admin.mjs` | `/admin` is the store's 404 page, `/drdaina` the sign-in form; sign-in; order count against D1; one order's details; every sidebar page opens without errors; a product flag and a stock change made in the admin UI are saved in D1 and reach shoppers; an order inserted straight into D1 appears on the open dashboard; reload stays signed in; sign-out. |
| `customer.mjs` | A signed-in customer (session token minted locally with `AUTH_TOKEN_SECRET` from `.dev.vars`, because the one-time code arrives by email): the profile is read, the bag is saved to the profile in D1, the account page loads its orders from `/api/orders`, and another customer's profile, orders and products are out of reach. |
| `requests.mjs` | Counts the requests that reach the Worker for a home page view, a product page view and an idle admin dashboard, against the free plan's 100,000 a day. |

## Run

All commands from the repository root, in Git Bash.

```bash
# 1. Local database, test secrets, build, server (RUNBOOK.md part A does the same with the real secrets)
(cd worker && npx wrangler d1 execute suitauragirls-db --local --file schema.sql)
(cd worker && for f in ../migration/data/d1-import/*.sql; do npx wrangler d1 execute suitauragirls-db --local --file "$f" || break; done)
#    worker/.dev.vars: test values only. A value with "#" in it must be in double quotes.
#      AUTH_TOKEN_SECRET, ADMIN_SESSION_SECRET  any long random strings
#      ADMIN_INITIAL_USERNAME=localadmin  ADMIN_INITIAL_PASSWORD="Local#Pass123"  ADMIN_INITIAL_PIN=123456
#      RAZORPAY_KEY_ID=rzp_live_LocalDummy0000 (a "live" looking id, or the checkout offers no gateway to shoppers)
#      dummy RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, BREVO_*, GEMINI_API_KEY
npm run build:cf
(cd worker && npx wrangler dev --local --port 8799 --ip 127.0.0.1 > .wrangler/dev.log 2>&1 &)

# 2. The checks (playwright-core is not a dependency of the project: say where it is installed)
export E2E_PLAYWRIGHT=/path/to/folder/with/node_modules   # contains node_modules/playwright-core
export E2E_DEV_LOG=.wrangler/dev.log                      # only requests.mjs uses it
node worker/test/e2e/storefront.mjs
node worker/test/e2e/admin.mjs
node worker/test/e2e/customer.mjs
node worker/test/e2e/requests.mjs                         # about 6 minutes; E2E_IDLE_SECONDS=60 for a quick look
```

Each script prints `PASS` / `FAIL` lines and exits with 1 when something failed. Screenshots of failures go
to `worker/.wrangler/e2e-screenshots/`.

## Settings (environment variables)

| Name | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://127.0.0.1:8799` | Where `wrangler dev` listens. |
| `E2E_PERSIST` | `.wrangler/state` | The `--persist-to` folder of that `wrangler dev`, relative to `worker/`. |
| `E2E_PLAYWRIGHT` | (none) | Folder whose `node_modules` holds `playwright-core`. |
| `E2E_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome to drive. |
| `E2E_HEADED` | off | `1` shows the browser window. |
| `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_PIN` | `localadmin`, `Local#Pass123`, `123456` | The sign-in to use. |
| `E2E_SITE_HOST` | `store.test` | The host name the browser uses (see below). |
| `E2E_VARS` | `.dev.vars` | The vars file that `wrangler dev` was started with, relative to `worker/` (`customer.mjs` reads `AUTH_TOKEN_SECRET` from it). |
| `E2E_DEV_LOG` | (none) | File with the output of `wrangler dev`, relative to `worker/`. |
| `E2E_IDLE_SECONDS` | `300` | How long `requests.mjs` watches the idle admin dashboard. |

## Things to know

- **The browser does not use `127.0.0.1`.** On `localhost` / `127.0.0.1` the app behaves like a developer
  machine: no catalogue request, no visitor counting, live reads everywhere. Chrome is started with a rule
  that maps `store.test` to the local Worker (no DNS involved) and treats it as a secure origin, so the pages
  behave as on the real domain and the `Secure` admin cookie works.
- **Never point these scripts at a database with real work in it.** They write: an abandoned checkout and two
  leads (deleted at the end), one product's "new arrival" flag and stock (+1, then put back; two stock-history
  entries stay), a test order `SAG-E2E-LIVE` (deleted at the end), the profile of `e2e-customer@example.com` (deleted at the end), and the admin's sign-in records.
- The first admin sign-in creates `admin_credentials/singleton` from `ADMIN_INITIAL_*`, hashed with
  `ADMIN_SESSION_SECRET`. If `.dev.vars` changes afterwards the sign-in fails: delete that document
  (`DELETE FROM docs WHERE collection IN ('admin_credentials','rate_limits','auth_state');`) and try again.
- Admin sign-in allows 10 attempts per 15 minutes per IP; `admin.mjs` and `requests.mjs` use one each.
- The Worker itself may call outside services (the Payment Gateways page asks Razorpay to check the keys).
  With the dummy values above those calls are refused by the other side and nothing happens.
- The checkout's PIN code lookup (`api.postalpincode.in`) is answered by the test, not by the real service.
