-- Commune Team (Nov 2026): coordinators and leaders put their own app on the
-- Home Screen and turn on notifications. Undo with
-- migrations-tacc/down/0026_camp_team_app.down.sql.

-- One phone can now get notifications as an attendee and as a team member:
-- on Android both Home Screen icons share one notification address.
CREATE TABLE camp_push_subs_new (
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_ok_at TEXT,
  fails INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (endpoint, owner)
);
INSERT INTO camp_push_subs_new (endpoint, p256dh, auth, owner, created_at, last_ok_at, fails)
  SELECT endpoint, p256dh, auth, owner, created_at, last_ok_at, fails FROM camp_push_subs;
DROP INDEX IF EXISTS camp_push_subs_owner_idx;
DROP TABLE camp_push_subs;
ALTER TABLE camp_push_subs_new RENAME TO camp_push_subs;
CREATE INDEX camp_push_subs_owner_idx ON camp_push_subs (owner);

-- When a coordinator ('staff:<email>') or a leader code ('leader:<code id>')
-- first opened Commune Team from a Home Screen, and on what.
CREATE TABLE camp_team_app (
  owner TEXT PRIMARY KEY,
  installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  platform TEXT NOT NULL DEFAULT ''
);
