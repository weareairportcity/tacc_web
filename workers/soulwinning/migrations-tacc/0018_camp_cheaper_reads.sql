-- Cheaper screens at 3,000 people. Undo with
-- migrations-tacc/down/0018_camp_cheaper_reads.down.sql.
--
-- Each person's latest successful payment and number of flagged payments are
-- kept on their registration (refreshed with paid_pesewas whenever a payment
-- changes), so People no longer looks them up once per person. New indexes let check-in lists, A-to-Z lists and recent
-- payments read only the rows they show.

ALTER TABLE camp_registrations ADD COLUMN last_paid_at TEXT;
ALTER TABLE camp_registrations ADD COLUMN last_paid_pesewas INTEGER;
ALTER TABLE camp_registrations ADD COLUMN flagged_payments INTEGER NOT NULL DEFAULT 0;

UPDATE camp_registrations SET
  last_paid_at = (SELECT p.paid_at FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
  last_paid_pesewas = (SELECT p.amount_pesewas FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
  flagged_payments = (SELECT COUNT(*) FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.flag IN ('amount_mismatch', 'over_balance'));

CREATE INDEX camp_registrations_checkin_idx ON camp_registrations (camp_id, checked_in_at);
CREATE INDEX camp_registrations_shirt_idx ON camp_registrations (camp_id, shirt_given_at);
CREATE INDEX camp_registrations_name_idx ON camp_registrations (camp_id, full_name);
CREATE INDEX camp_payments_paid_idx ON camp_payments (status, paid_at);
CREATE INDEX camp_rooms_camp_idx ON camp_rooms (camp_id, room_type_id, gender);

-- Who's arrived and who has a T-shirt, kept as running totals per camp (the
-- check-in code adds and takes away in the same step as the scan), so a
-- check-in phone's refresh reads one row instead of counting the whole camp.
-- Not triggers: D1 counts a trigger's rows in "changes", which code relies on.
CREATE TABLE camp_scan_counts (
  camp_id TEXT PRIMARY KEY REFERENCES camps (id) ON DELETE CASCADE,
  here INTEGER NOT NULL DEFAULT 0,
  shirts INTEGER NOT NULL DEFAULT 0
);

INSERT INTO camp_scan_counts (camp_id, here, shirts)
SELECT c.id,
  (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = c.id AND r.checked_in_at IS NOT NULL),
  (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = c.id AND r.shirt_given_at IS NOT NULL)
FROM camps c;
