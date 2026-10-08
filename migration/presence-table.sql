-- Live visitor presence (Admin dashboard: who is on the store right now). Safe to run again.
-- One row per visitor, rewritten by one statement per signal. The visitor's address is never stored.
-- `signals` counts today's signals of that visitor: it is the server's daily cap (60) and feeds the write budget.
-- The Worker also creates this table by itself if it is missing (api/_lib/presence.js), with the same SQL.
-- Apply: npx wrangler d1 execute <database> --remote --file migration/presence-table.sql

CREATE TABLE IF NOT EXISTS presence (visitor_id TEXT PRIMARY KEY, day TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 1, trail TEXT NOT NULL DEFAULT '[]', device TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', signals INTEGER NOT NULL DEFAULT 1);

CREATE INDEX IF NOT EXISTS presence_last_seen ON presence (last_seen);
