-- Undoes 0012_camp_leader_codes.sql. Leaders signed in with a code are signed out. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0012_camp_leader_codes.down.sql

ALTER TABLE camp_registrations DROP COLUMN shirt_given_by;
ALTER TABLE camp_registrations DROP COLUMN shirt_given_at;
DROP INDEX camp_leader_codes_active_idx;
DROP TABLE camp_leader_codes;

DELETE FROM d1_migrations WHERE name = '0012_camp_leader_codes.sql';
