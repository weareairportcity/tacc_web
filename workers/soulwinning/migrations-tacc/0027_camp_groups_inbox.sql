-- Group Leaders and the Notifications page (Nov 2026). Undo with
-- migrations-tacc/down/0027_camp_groups_inbox.down.sql.

-- Groups sit between PFCC and fellowship (src/lib/fellowships.ts). A group is
-- worked out from the fellowship name, so registrations don't change. Group
-- Leaders each get their own code (holder_name), so one group can have
-- several. Ids and hashes are copied as they are: signed-in leaders, their
-- phones ('leader:<id>') and Commune Team rows carry on.
CREATE TABLE camp_leader_codes_new (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('fellowship', 'pfcc', 'group')),
  scope_value TEXT NOT NULL,
  holder_name TEXT,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
INSERT INTO camp_leader_codes_new (id, created_at, scope_kind, scope_value, code_hash, created_by, last_used_at, revoked_at)
  SELECT id, created_at, scope_kind, scope_value, code_hash, created_by, last_used_at, revoked_at FROM camp_leader_codes;
DROP INDEX IF EXISTS camp_leader_codes_active_idx;
DROP TABLE camp_leader_codes;
ALTER TABLE camp_leader_codes_new RENAME TO camp_leader_codes;
-- Fellowship and PFCC: still one active code each. Group: one per named person.
CREATE UNIQUE INDEX camp_leader_codes_active_idx ON camp_leader_codes (scope_kind, scope_value, COALESCE(holder_name, '')) WHERE revoked_at IS NULL;

-- Every app notification, one row per owner ('attendee:<id>', 'staff:<email>',
-- 'leader:<code id>'), kept even when no phone got it, for the Notifications page.
CREATE TABLE camp_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);
CREATE INDEX camp_inbox_owner_idx ON camp_inbox (owner, created_at DESC);
