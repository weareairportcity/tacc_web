-- Undoes 0027_camp_groups_inbox.sql. Group codes are dropped (their leaders are signed out).
DROP INDEX IF EXISTS camp_inbox_owner_idx;
DROP TABLE IF EXISTS camp_inbox;
CREATE TABLE camp_leader_codes_old (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('fellowship', 'pfcc')),
  scope_value TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
INSERT INTO camp_leader_codes_old (id, created_at, scope_kind, scope_value, code_hash, created_by, last_used_at, revoked_at)
  SELECT id, created_at, scope_kind, scope_value, code_hash, created_by, last_used_at, revoked_at FROM camp_leader_codes WHERE scope_kind <> 'group';
DROP INDEX IF EXISTS camp_leader_codes_active_idx;
DROP TABLE camp_leader_codes;
ALTER TABLE camp_leader_codes_old RENAME TO camp_leader_codes;
CREATE UNIQUE INDEX camp_leader_codes_active_idx ON camp_leader_codes (scope_kind, scope_value) WHERE revoked_at IS NULL;

DELETE FROM d1_migrations WHERE name = '0027_camp_groups_inbox.sql';
