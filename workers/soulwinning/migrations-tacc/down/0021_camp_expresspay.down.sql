-- Undoes 0021_camp_expresspay.sql. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0021_camp_expresspay.down.sql

DROP INDEX IF EXISTS camp_payments_created_idx;
ALTER TABLE camp_bulk_payments DROP COLUMN provider_token;
ALTER TABLE camp_bulk_payments DROP COLUMN provider;
ALTER TABLE camp_payments DROP COLUMN method;
ALTER TABLE camp_payments DROP COLUMN provider_token;
ALTER TABLE camps DROP COLUMN momo_fee_bps;

DELETE FROM d1_migrations WHERE name = '0021_camp_expresspay.sql';
