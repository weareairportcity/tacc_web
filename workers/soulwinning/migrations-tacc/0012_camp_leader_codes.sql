-- Sign-in codes for fellowship and PFCC leaders (and T-shirt collection, below), so they don't need an email
-- and password. One active code per fellowship or PFCC; making a new one
-- turns the old one off. Only an HMAC of the code is kept, keyed with the
-- Worker's LEADER_CODE_SECRET. Undo with
-- migrations-tacc/down/0012_camp_leader_codes.down.sql.

CREATE TABLE camp_leader_codes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('fellowship', 'pfcc')),
  scope_value TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE UNIQUE INDEX camp_leader_codes_active_idx ON camp_leader_codes (scope_kind, scope_value) WHERE revoked_at IS NULL;

-- T-shirt collection: a leader or coordinator scans the pass and hands it over.
ALTER TABLE camp_registrations ADD COLUMN shirt_given_at TEXT;
ALTER TABLE camp_registrations ADD COLUMN shirt_given_by TEXT;
