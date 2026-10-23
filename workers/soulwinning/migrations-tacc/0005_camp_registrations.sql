-- Camp registration and payments, Phase 2. See docs/camp-spec.md. Undo with
-- migrations-tacc/down/0005_camp_registrations.down.sql.
--
-- Money is integer pesewas. A registration's paid_pesewas and status are a
-- cache of its successful payments, updated in the same batch as the payment.

-- Paystack's fee, passed on to the attendee, in basis points (195 = 1.95%).
-- The camp's minimum first payment no longer applies (any amount up to the
-- balance); its column stays so no data is dropped.
ALTER TABLE camps ADD COLUMN fee_bps INTEGER NOT NULL DEFAULT 195 CHECK (fee_bps BETWEEN 0 AND 2000);

CREATE TABLE camp_registrations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  -- RESTRICT: a room type can't be deleted while anyone registered for it.
  room_type_id TEXT NOT NULL REFERENCES camp_room_types (id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  -- Normalised to 233XXXXXXXXX. One registration per phone per camp.
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  fellowship TEXT NOT NULL,
  pfcc TEXT NOT NULL,
  church TEXT NOT NULL,
  -- Copied from the room type at registration, so later price edits don't move it.
  price_pesewas INTEGER NOT NULL CHECK (price_pesewas >= 0),
  paid_pesewas INTEGER NOT NULL DEFAULT 0 CHECK (paid_pesewas >= 0 AND paid_pesewas <= price_pesewas),
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'partially_paid', 'fully_paid', 'cancelled')),
  -- HMAC of the attendee's sign-in code. The code itself is never stored.
  code_hash TEXT NOT NULL UNIQUE,
  UNIQUE (camp_id, phone)
);
CREATE INDEX camp_registrations_status_idx ON camp_registrations (camp_id, status);
CREATE INDEX camp_registrations_fellowship_idx ON camp_registrations (camp_id, fellowship);
CREATE INDEX camp_registrations_pfcc_idx ON camp_registrations (camp_id, pfcc);
CREATE INDEX camp_registrations_room_type_idx ON camp_registrations (room_type_id);

CREATE TABLE camp_payments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack',
  reference TEXT NOT NULL UNIQUE,
  -- What counts towards the balance, the fee on top, and the total charged.
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  fee_pesewas INTEGER NOT NULL CHECK (fee_pesewas >= 0),
  charged_pesewas INTEGER NOT NULL CHECK (charged_pesewas = amount_pesewas + fee_pesewas),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  -- Why a coordinator should look: amount_mismatch, over_balance, init_failed.
  flag TEXT,
  paid_at TEXT,
  checked_at TEXT,
  -- The provider's last verify answer, for disputes.
  raw_json TEXT
);
CREATE INDEX camp_payments_registration_idx ON camp_payments (registration_id, status);
CREATE INDEX camp_payments_pending_idx ON camp_payments (status, created_at);

-- Backstop for the guarded update in the Worker: successful payments can
-- never add up to more than the registration's price.
CREATE TRIGGER camp_payments_no_overpay BEFORE UPDATE OF status ON camp_payments
WHEN NEW.status = 'success' AND OLD.status <> 'success'
BEGIN
  SELECT RAISE(ABORT, 'payment would exceed the registration price')
  WHERE (
    SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_payments
    WHERE registration_id = NEW.registration_id AND status = 'success'
  ) + NEW.amount_pesewas > (
    SELECT price_pesewas FROM camp_registrations WHERE id = NEW.registration_id
  );
END;

-- A success is final: it can't be reversed or edited. Refunds are recorded
-- separately (later phase), not by rewriting the payment.
CREATE TRIGGER camp_payments_success_final BEFORE UPDATE ON camp_payments
WHEN OLD.status = 'success'
  AND (NEW.status <> 'success' OR NEW.amount_pesewas <> OLD.amount_pesewas)
BEGIN
  SELECT RAISE(ABORT, 'a successful payment is final');
END;

-- Fixed-window counters for sign-in, forgot-code and registration attempts.
CREATE TABLE camp_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);
