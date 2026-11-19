-- Undoes 0028_camp_medical.sql. The medical team's codes are dropped (they are signed out).
CREATE TABLE camp_leader_codes_old (
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
INSERT INTO camp_leader_codes_old (id, created_at, scope_kind, scope_value, holder_name, code_hash, created_by, last_used_at, revoked_at)
  SELECT id, created_at, scope_kind, scope_value, holder_name, code_hash, created_by, last_used_at, revoked_at FROM camp_leader_codes WHERE scope_kind <> 'medical';
DROP INDEX IF EXISTS camp_leader_codes_active_idx;
DROP TABLE camp_leader_codes;
ALTER TABLE camp_leader_codes_old RENAME TO camp_leader_codes;
CREATE UNIQUE INDEX camp_leader_codes_active_idx ON camp_leader_codes (scope_kind, scope_value, COALESCE(holder_name, '')) WHERE revoked_at IS NULL;
