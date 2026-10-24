-- Undoes 0009_camp_places_left.sql: room types go back to having no limits.
-- Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0009_camp_places_left.down.sql

DROP TRIGGER IF EXISTS camp_registrations_places_move_take;
DROP TRIGGER IF EXISTS camp_registrations_places_move_full;
DROP TRIGGER IF EXISTS camp_registrations_places_take;
DROP TRIGGER IF EXISTS camp_registrations_places_full;
DROP TABLE IF EXISTS camp_room_type_places;

DELETE FROM d1_migrations WHERE name = '0009_camp_places_left.sql';
