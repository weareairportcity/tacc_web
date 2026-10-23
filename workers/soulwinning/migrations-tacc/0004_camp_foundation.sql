-- Camp registration and room allocation, Phase 1: camps, room types, rooms,
-- staff roles and the audit log. See docs/camp-spec.md. Undo with
-- migrations-tacc/down/0004_camp_foundation.down.sql.
--
-- Money is integer pesewas (GHS x 100). Dates are YYYY-MM-DD, times ISO.

CREATE TABLE camps (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  venue TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  registration_opens_on TEXT NOT NULL,
  registration_closes_on TEXT NOT NULL,
  payment_due_on TEXT NOT NULL,
  roommate_deadline_on TEXT NOT NULL,
  min_first_payment_pct INTEGER NOT NULL DEFAULT 30
    CHECK (min_first_payment_pct BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  CHECK (ends_on >= starts_on),
  CHECK (registration_closes_on >= registration_opens_on)
);

CREATE TABLE camp_room_types (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_pesewas INTEGER NOT NULL CHECK (price_pesewas >= 0),
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  UNIQUE (camp_id, name)
);

CREATE TABLE camp_rooms (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  -- RESTRICT: a room type can't be deleted while rooms still use it.
  room_type_id TEXT NOT NULL REFERENCES camp_room_types (id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  UNIQUE (camp_id, label)
);
CREATE INDEX camp_rooms_type_idx ON camp_rooms (room_type_id);

-- Who may run camps. Supabase only signs people in; their camp role lives
-- here, keyed by login email (stored lowercase). Leaders see one fellowship
-- or one PFCC, read-only.
CREATE TABLE camp_staff (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  role TEXT NOT NULL CHECK (role IN ('admin', 'coordinator', 'leader')),
  scope_kind TEXT CHECK (scope_kind IN ('fellowship', 'pfcc')),
  scope_value TEXT,
  CHECK (
    (role = 'leader' AND scope_kind IS NOT NULL AND scope_value IS NOT NULL)
    OR (role <> 'leader' AND scope_kind IS NULL AND scope_value IS NULL)
  )
);

-- Append-only record of every change staff make. No foreign keys, so entries
-- outlive whatever they describe.
CREATE TABLE camp_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);
CREATE INDEX camp_audit_log_camp_idx ON camp_audit_log (camp_id, id DESC);

CREATE TRIGGER camp_audit_log_no_update BEFORE UPDATE ON camp_audit_log
BEGIN
  SELECT RAISE(ABORT, 'camp_audit_log is append-only');
END;

CREATE TRIGGER camp_audit_log_no_delete BEFORE DELETE ON camp_audit_log
BEGIN
  SELECT RAISE(ABORT, 'camp_audit_log is append-only');
END;
