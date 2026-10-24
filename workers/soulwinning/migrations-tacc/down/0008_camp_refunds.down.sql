-- Undoes 0008_camp_refunds.sql: deletes recorded refunds and room-SMS
-- records, and puts back 0005's and 0006's triggers. Registrations keep the
-- paid_pesewas they had (net of refunds), so re-run the Worker's refresh if
-- refunds were recorded. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0008_camp_refunds.down.sql

DROP TABLE IF EXISTS camp_room_sms;
DROP TRIGGER IF EXISTS camp_refunds_final;
DROP TRIGGER IF EXISTS camp_refunds_not_more;
DROP TABLE IF EXISTS camp_refunds;

DROP TRIGGER IF EXISTS camp_payments_no_overpay;
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

DROP TRIGGER IF EXISTS camp_group_members_leave;
CREATE TRIGGER camp_group_members_leave BEFORE DELETE ON camp_group_members
WHEN EXISTS (
  SELECT 1 FROM camp_groups g JOIN camps c ON c.id = g.camp_id
  WHERE g.id = OLD.group_id AND (g.locked_at IS NOT NULL OR date('now') > c.roommate_deadline_on)
) AND (SELECT status FROM camp_registrations WHERE id = OLD.registration_id) <> 'cancelled'
BEGIN
  SELECT RAISE(ABORT, 'this group is locked');
END;

DELETE FROM d1_migrations WHERE name = '0008_camp_refunds.sql';
