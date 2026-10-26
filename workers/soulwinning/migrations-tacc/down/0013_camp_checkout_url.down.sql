-- Undoes 0013_camp_checkout_url.sql. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0013_camp_checkout_url.down.sql

ALTER TABLE camp_bulk_payments DROP COLUMN checkout_url;
ALTER TABLE camp_payments DROP COLUMN checkout_url;

DELETE FROM d1_migrations WHERE name = '0013_camp_checkout_url.sql';
