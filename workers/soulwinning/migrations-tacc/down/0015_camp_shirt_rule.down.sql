-- Undoes 0015_camp_shirt_rule.sql. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0015_camp_shirt_rule.down.sql

ALTER TABLE camps DROP COLUMN shirt_paid_only;

DELETE FROM d1_migrations WHERE name = '0015_camp_shirt_rule.sql';
