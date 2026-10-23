-- Undoes 0004_camp_foundation.sql. Drops only the camp tables it created and
-- forgets the migration, so `wrangler d1 migrations apply tacc` re-applies it.
--   wrangler d1 execute tacc --local --file migrations-tacc/down/0004_camp_foundation.down.sql

DROP TRIGGER IF EXISTS camp_audit_log_no_delete;
DROP TRIGGER IF EXISTS camp_audit_log_no_update;
DROP TABLE IF EXISTS camp_audit_log;
DROP TABLE IF EXISTS camp_staff;
DROP TABLE IF EXISTS camp_rooms;
DROP TABLE IF EXISTS camp_room_types;
DROP TABLE IF EXISTS camps;
DELETE FROM d1_migrations WHERE name = '0004_camp_foundation.sql';
