-- Camp hardening, Phase 7. See docs/camp-spec.md. Undo with
-- migrations-tacc/down/0008_camp_refunds.down.sql.
--
-- Refunds happen in Paystack and are recorded here by a coordinator. A
-- registration's paid_pesewas is now its successful payments minus its
-- refunds. Payments themselves are never edited.

CREATE TABLE camp_refunds (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  -- Paystack's refund reference, if there is one.
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL
);
CREATE INDEX camp_refunds_registration_idx ON camp_refunds (registration_id);

-- A refund can't be more than what's been paid and not yet refunded.
CREATE TRIGGER camp_refunds_not_more BEFORE INSERT ON camp_refunds
WHEN NEW.amount_pesewas > (
  SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_payments
  WHERE registration_id = NEW.registration_id AND status = 'success'
) - (
  SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_refunds WHERE registration_id = NEW.registration_id
)
BEGIN
  SELECT RAISE(ABORT, 'refund is more than was paid');
END;

CREATE TRIGGER camp_refunds_final BEFORE UPDATE ON camp_refunds
BEGIN
  SELECT RAISE(ABORT, 'a recorded refund is final');
END;

-- 0005's overpayment backstop, now net of refunds.
DROP TRIGGER camp_payments_no_overpay;
CREATE TRIGGER camp_payments_no_overpay BEFORE UPDATE OF status ON camp_payments
WHEN NEW.status = 'success' AND OLD.status <> 'success'
BEGIN
  SELECT RAISE(ABORT, 'payment would exceed the registration price')
  WHERE (
    SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_payments
    WHERE registration_id = NEW.registration_id AND status = 'success'
  ) - (
    SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_refunds WHERE registration_id = NEW.registration_id
  ) + NEW.amount_pesewas > (
    SELECT price_pesewas FROM camp_registrations WHERE id = NEW.registration_id
  );
END;

-- 0006's leave rule, plus: a coordinator who moves someone to another room
-- type takes them out of their group even if it's locked (the registration's
-- room type no longer matches the group's).
DROP TRIGGER camp_group_members_leave;
CREATE TRIGGER camp_group_members_leave BEFORE DELETE ON camp_group_members
WHEN EXISTS (
  SELECT 1 FROM camp_groups g JOIN camps c ON c.id = g.camp_id
  WHERE g.id = OLD.group_id AND (g.locked_at IS NOT NULL OR date('now') > c.roommate_deadline_on)
) AND EXISTS (
  SELECT 1 FROM camp_registrations r JOIN camp_groups g ON g.id = OLD.group_id
  WHERE r.id = OLD.registration_id AND r.status <> 'cancelled' AND r.room_type_id = g.room_type_id
)
BEGIN
  SELECT RAISE(ABORT, 'this group is locked');
END;

-- Who has been texted their room, and which room it was, so "text everyone
-- their room" only reaches people who are new or have moved.
CREATE TABLE camp_room_sms (
  registration_id TEXT PRIMARY KEY REFERENCES camp_registrations (id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
