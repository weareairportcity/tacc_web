-- Undoes 0018_camp_cheaper_reads.sql.
DROP TABLE IF EXISTS camp_scan_counts;
DROP INDEX IF EXISTS camp_rooms_camp_idx;
DROP INDEX IF EXISTS camp_payments_paid_idx;
DROP INDEX IF EXISTS camp_registrations_name_idx;
DROP INDEX IF EXISTS camp_registrations_shirt_idx;
DROP INDEX IF EXISTS camp_registrations_checkin_idx;
ALTER TABLE camp_registrations DROP COLUMN flagged_payments;
ALTER TABLE camp_registrations DROP COLUMN last_paid_pesewas;
ALTER TABLE camp_registrations DROP COLUMN last_paid_at;

DELETE FROM d1_migrations WHERE name = '0018_camp_cheaper_reads.sql';
