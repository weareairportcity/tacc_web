-- Commune v2 (docs/camp/V2_PLAN.md): profile details, check-in, "any room",
-- deleting your details, requests (refunds and room changes), refunds sent
-- through Paystack, coordinators paying for several people at once, saved
-- People views and the coordinators' evening text. Undo with
-- migrations-tacc/down/0011_camp_v2.down.sql.

-- ─── Registrations ───────────────────────────────────────────────────────────

ALTER TABLE camp_registrations ADD COLUMN shirt_size TEXT NOT NULL DEFAULT ''
  CHECK (shirt_size IN ('', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'));
-- Only coordinators see these three.
ALTER TABLE camp_registrations ADD COLUMN emergency_name TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_registrations ADD COLUMN emergency_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_registrations ADD COLUMN health_notes TEXT NOT NULL DEFAULT '';
-- "I'm happy with any room": skips roommates, a coordinator places them.
ALTER TABLE camp_registrations ADD COLUMN any_room INTEGER NOT NULL DEFAULT 0 CHECK (any_room IN (0, 1));
ALTER TABLE camp_registrations ADD COLUMN checked_in_at TEXT;
ALTER TABLE camp_registrations ADD COLUMN checked_in_by TEXT;
-- Set when the attendee deletes their details. The row stays (payments point
-- at it) but name, phone, email and notes are wiped.
ALTER TABLE camp_registrations ADD COLUMN deleted_at TEXT;

-- ─── Coordinators paying for several people ──────────────────────────────────

-- One Paystack checkout. Each person's share is a camp_payments row with this
-- bulk_id and no fee of its own; the fee is on the bulk row.
CREATE TABLE camp_bulk_payments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  -- The coordinator who paid (their email), and a note for the log.
  paid_by TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  fee_pesewas INTEGER NOT NULL CHECK (fee_pesewas >= 0),
  charged_pesewas INTEGER NOT NULL CHECK (charged_pesewas = amount_pesewas + fee_pesewas),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  flag TEXT,
  paid_at TEXT,
  checked_at TEXT,
  raw_json TEXT
);
CREATE INDEX camp_bulk_payments_camp_idx ON camp_bulk_payments (camp_id, created_at);

ALTER TABLE camp_payments ADD COLUMN bulk_id TEXT REFERENCES camp_bulk_payments (id);
-- Someone paying through a shared pay link (a parent or sponsor).
ALTER TABLE camp_payments ADD COLUMN payer_name TEXT NOT NULL DEFAULT '';
CREATE INDEX camp_payments_bulk_idx ON camp_payments (bulk_id);

-- ─── Requests: refunds and room changes ──────────────────────────────────────

CREATE TABLE camp_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('refund', 'room_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  -- refund: what they asked for. room_change: null.
  amount_pesewas INTEGER CHECK (amount_pesewas IS NULL OR amount_pesewas > 0),
  -- room_change: the room type they want.
  to_room_type_id TEXT REFERENCES camp_room_types (id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  -- attendee:<id> or a coordinator's email.
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  CHECK ((kind = 'refund' AND amount_pesewas IS NOT NULL AND to_room_type_id IS NULL)
      OR (kind = 'room_change' AND to_room_type_id IS NOT NULL))
);
CREATE INDEX camp_requests_camp_idx ON camp_requests (camp_id, status, created_at);
-- At most one open request of each kind per person.
CREATE UNIQUE INDEX camp_requests_open_idx ON camp_requests (registration_id, kind) WHERE status = 'pending';

-- Refunds now say which payment they came from (Paystack refunds one
-- transaction at a time), Paystack's own refund id, and the request they settle.
ALTER TABLE camp_refunds ADD COLUMN payment_id TEXT REFERENCES camp_payments (id);
ALTER TABLE camp_refunds ADD COLUMN request_id TEXT REFERENCES camp_requests (id);

-- ─── Coordinators ────────────────────────────────────────────────────────────

-- For the evening summary text. Empty = no text.
ALTER TABLE camp_staff ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- Named People filters ("Zion · outstanding"). query is the URL's query string.
CREATE TABLE camp_saved_views (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  staff_email TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  query TEXT NOT NULL DEFAULT '',
  UNIQUE (camp_id, staff_email, name)
);

-- One evening text per camp per day, however often the cron runs.
CREATE TABLE camp_daily_summaries (
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  recipients INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (camp_id, day)
);
