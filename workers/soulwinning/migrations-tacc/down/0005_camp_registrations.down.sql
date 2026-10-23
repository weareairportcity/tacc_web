-- Undoes 0005_camp_registrations.sql. Deletes every registration and payment,
-- so export first if any are real. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0005_camp_registrations.down.sql

DROP TRIGGER IF EXISTS camp_payments_success_final;
DROP TRIGGER IF EXISTS camp_payments_no_overpay;
DROP TABLE IF EXISTS camp_rate_limits;
DROP TABLE IF EXISTS camp_payments;
DROP TABLE IF EXISTS camp_registrations;
ALTER TABLE camps DROP COLUMN fee_bps;

DELETE FROM d1_migrations WHERE name = '0005_camp_registrations.sql';
