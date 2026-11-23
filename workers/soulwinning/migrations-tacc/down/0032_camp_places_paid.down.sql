-- Undoes 0032_camp_places_paid.sql: totals count remaining down on register
-- again, as 0009 did.
-- Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0032_camp_places_paid.down.sql

DROP TRIGGER IF EXISTS camp_registrations_places_paid_update;
DROP TRIGGER IF EXISTS camp_registrations_places_paid_insert;
DROP TRIGGER IF EXISTS camp_registrations_places_move_take;
DROP TRIGGER IF EXISTS camp_registrations_places_move_full;
DROP TRIGGER IF EXISTS camp_registrations_places_take;
DROP TRIGGER IF EXISTS camp_registrations_places_full;

CREATE TRIGGER camp_registrations_places_full BEFORE INSERT ON camp_registrations
WHEN EXISTS (
  SELECT 1 FROM camp_room_type_places
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_left = 0
)
BEGIN
  SELECT RAISE(ABORT, 'room type is full');
END;

CREATE TRIGGER camp_registrations_places_take AFTER INSERT ON camp_registrations
BEGIN
  UPDATE camp_room_type_places SET places_left = places_left - 1
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender;
END;

CREATE TRIGGER camp_registrations_places_move_full BEFORE UPDATE OF room_type_id, gender ON camp_registrations
WHEN (NEW.room_type_id <> OLD.room_type_id OR NEW.gender <> OLD.gender)
  AND NEW.status <> 'cancelled'
  AND EXISTS (
    SELECT 1 FROM camp_room_type_places
    WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_left = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'room type is full');
END;

CREATE TRIGGER camp_registrations_places_move_take AFTER UPDATE OF room_type_id, gender ON camp_registrations
WHEN (NEW.room_type_id <> OLD.room_type_id OR NEW.gender <> OLD.gender) AND NEW.status <> 'cancelled'
BEGIN
  UPDATE camp_room_type_places SET places_left = places_left - 1
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender;
END;

DELETE FROM d1_migrations WHERE name = '0032_camp_places_paid.sql';
