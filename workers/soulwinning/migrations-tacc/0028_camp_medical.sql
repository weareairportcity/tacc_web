-- The medical team (Nov 2026): one shared code, scope 'medical', that signs in
-- to a search of everyone's health notes, emergency contact and room. Undo
-- with migrations-tacc/down/0028_camp_medical.down.sql. Ids and hashes are
-- copied as they are, so signed-in leaders stay signed in.
CREATE TABLE camp_leader_codes_new (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('fellowship', 'pfcc', 'group', 'medical')),
  scope_value TEXT NOT NULL,
  holder_name TEXT,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
INSERT INTO camp_leader_codes_new (id, created_at, scope_kind, scope_value, holder_name, code_hash, created_by, last_used_at, revoked_at)
  SELECT id, created_at, scope_kind, scope_value, holder_name, code_hash, created_by, last_used_at, revoked_at FROM camp_leader_codes;
DROP INDEX IF EXISTS camp_leader_codes_active_idx;
DROP TABLE camp_leader_codes;
ALTER TABLE camp_leader_codes_new RENAME TO camp_leader_codes;
CREATE UNIQUE INDEX camp_leader_codes_active_idx ON camp_leader_codes (scope_kind, scope_value, COALESCE(holder_name, '')) WHERE revoked_at IS NULL;
