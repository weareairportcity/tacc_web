-- Undoes 0026_camp_team_app.sql. A phone that served two people keeps one of them.
DROP TABLE IF EXISTS camp_team_app;
CREATE TABLE camp_push_subs_old (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_ok_at TEXT,
  fails INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO camp_push_subs_old (endpoint, p256dh, auth, owner, created_at, last_ok_at, fails)
  SELECT endpoint, p256dh, auth, owner, created_at, last_ok_at, fails FROM camp_push_subs ORDER BY created_at DESC;
DROP INDEX IF EXISTS camp_push_subs_owner_idx;
DROP TABLE camp_push_subs;
ALTER TABLE camp_push_subs_old RENAME TO camp_push_subs;
CREATE INDEX camp_push_subs_owner_idx ON camp_push_subs (owner);

DELETE FROM d1_migrations WHERE name = '0026_camp_team_app.sql';
