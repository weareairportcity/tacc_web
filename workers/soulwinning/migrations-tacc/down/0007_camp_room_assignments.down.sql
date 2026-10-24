-- Undoes 0007_camp_room_assignments.sql. Deletes every room placement (rooms,
-- registrations and groups are kept). Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0007_camp_room_assignments.down.sql

DROP TRIGGER IF EXISTS camp_rooms_occupied;
DROP TRIGGER IF EXISTS camp_rooms_capacity;
DROP TRIGGER IF EXISTS camp_room_assignments_no_update;
DROP TRIGGER IF EXISTS camp_room_assignments_fit;
DROP TABLE IF EXISTS camp_room_assignments;

DELETE FROM d1_migrations WHERE name = '0007_camp_room_assignments.sql';
