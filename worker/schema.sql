-- Suit Aura Girls: document store on Cloudflare D1.
-- One row per former Firestore document. Safe to run again (everything is IF NOT EXISTS).

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

-- transaction guard: inserting ok = 0 violates the CHECK and rolls the whole batch back.
-- The table always stays empty: the guard statement inserts a row only when a precondition failed.
CREATE TABLE IF NOT EXISTS tx_guard (ok INTEGER NOT NULL CHECK (ok = 1));

-- Expression indexes for the equality filters and sorts the code really runs on collections that grow.
-- Each one is limited to its collection (WHERE collection = '...'), so a write to any other collection
-- does not touch it: D1 counts every index entry written as a row written (measured on local D1: an
-- update of an indexed document costs 2 rows, of an unindexed one 1), and the tracking collections are
-- written on every page view. For the same reason daily_analytics, product_daily and search_terms have
-- no index: they hold one small document per day (or per day and product) that is rewritten constantly
-- and read only by the admin.
-- worker/src/docstore.js names the index in the query (INDEXED BY) and emits the collection as a literal
-- and exactly json_extract(data, '$.field'). Keep INDEXED_FIELDS there in step with this list.
-- The primary key (collection, id) is part of every index of a WITHOUT ROWID table, so
-- "ORDER BY field, id" needs no extra sort.

-- orders: my-orders and verified-purchase check, duplicate-checkout key, Razorpay webhook lookup,
-- per-customer coupon use (by email or mobile)
CREATE INDEX IF NOT EXISTS docs_orders_customerEmail   ON docs (collection, json_extract(data, '$.customerEmail'))   WHERE collection = 'orders';
CREATE INDEX IF NOT EXISTS docs_orders_attemptKey      ON docs (collection, json_extract(data, '$.attemptKey'))      WHERE collection = 'orders';
CREATE INDEX IF NOT EXISTS docs_orders_razorpayOrderId ON docs (collection, json_extract(data, '$.razorpayOrderId')) WHERE collection = 'orders';
CREATE INDEX IF NOT EXISTS docs_orders_couponCode      ON docs (collection, json_extract(data, '$.couponCode'))      WHERE collection = 'orders';
CREATE INDEX IF NOT EXISTS docs_orders_customerMobile  ON docs (collection, json_extract(data, '$.customerMobile'))  WHERE collection = 'orders';

-- reviews of one product (product page, rating recalculation); status is checked on those few rows
CREATE INDEX IF NOT EXISTS docs_reviews_productId      ON docs (collection, json_extract(data, '$.productId'))       WHERE collection = 'reviews';

-- back-in-stock subscribers of one product
CREATE INDEX IF NOT EXISTS docs_stock_alerts_productId ON docs (collection, json_extract(data, '$.productId'))       WHERE collection = 'stock_alerts';

-- photos attached to one review
CREATE INDEX IF NOT EXISTS docs_review_photos_reviewId ON docs (collection, json_extract(data, '$.reviewId'))        WHERE collection = 'review_photos';

-- admin dashboard: latest 100 visitors (the one large, fast-growing collection)
CREATE INDEX IF NOT EXISTS docs_visitor_sessions_lastActive ON docs (collection, json_extract(data, '$.lastActive')) WHERE collection = 'visitor_sessions';

-- admin stock history: by product, or newest first
CREATE INDEX IF NOT EXISTS docs_inventory_log_productId ON docs (collection, json_extract(data, '$.productId'))      WHERE collection = 'inventory_log';
CREATE INDEX IF NOT EXISTS docs_inventory_log_at       ON docs (collection, json_extract(data, '$.at'))              WHERE collection = 'inventory_log';

-- admin leads list, newest first
CREATE INDEX IF NOT EXISTS docs_leads_createdAt        ON docs (collection, json_extract(data, '$.createdAt'))       WHERE collection = 'leads';

-- Live visitor presence (api/_lib/presence.js): one row per visitor, rewritten by one statement per signal,
-- outside the document store. `signals` counts the visitor's signals today (the daily cap and the write budget).
-- The same SQL is in migration/presence-table.sql and in PRESENCE_SCHEMA; the Worker creates it if it is missing.
CREATE TABLE IF NOT EXISTS presence (visitor_id TEXT PRIMARY KEY, day TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 1, trail TEXT NOT NULL DEFAULT '[]', device TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', signals INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS presence_last_seen ON presence (last_seen);
