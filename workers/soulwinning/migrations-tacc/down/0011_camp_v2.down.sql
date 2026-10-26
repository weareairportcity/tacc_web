-- Undoes 0011_camp_v2.sql. Requests, bulk payments, saved views and summary
-- records are dropped; payments made through them stay as ordinary payments.
-- Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0011_camp_v2.down.sql

DROP TABLE camp_daily_summaries;
DROP TABLE camp_saved_views;
ALTER TABLE camp_staff DROP COLUMN phone;

ALTER TABLE camp_refunds DROP COLUMN request_id;
ALTER TABLE camp_refunds DROP COLUMN payment_id;
DROP INDEX camp_requests_open_idx;
DROP INDEX camp_requests_camp_idx;
DROP TABLE camp_requests;

DROP INDEX camp_payments_bulk_idx;
ALTER TABLE camp_payments DROP COLUMN payer_name;
ALTER TABLE camp_payments DROP COLUMN bulk_id;
DROP INDEX camp_bulk_payments_camp_idx;
DROP TABLE camp_bulk_payments;

ALTER TABLE camp_registrations DROP COLUMN deleted_at;
ALTER TABLE camp_registrations DROP COLUMN checked_in_by;
ALTER TABLE camp_registrations DROP COLUMN checked_in_at;
ALTER TABLE camp_registrations DROP COLUMN any_room;
ALTER TABLE camp_registrations DROP COLUMN health_notes;
ALTER TABLE camp_registrations DROP COLUMN emergency_phone;
ALTER TABLE camp_registrations DROP COLUMN emergency_name;
ALTER TABLE camp_registrations DROP COLUMN shirt_size;

DELETE FROM d1_migrations WHERE name = '0011_camp_v2.sql';
