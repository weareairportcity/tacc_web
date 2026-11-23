-- Undoes 0033_camp_places_paid_few.sql: "only a few left" counts down on
-- register again, as 0032 did.
-- Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0033_camp_places_paid_few.down.sql

DROP TRIGGER IF EXISTS camp_registrations_places_few_move;
DROP TRIGGER IF EXISTS camp_registrations_places_few_left_paid;
DROP TRIGGER IF EXISTS camp_registrations_places_few_became_paid;
DROP TRIGGER IF EXISTS camp_registrations_places_paid_update;
DROP TRIGGER IF EXISTS camp_registrations_places_move_take;
DROP TRIGGER IF EXISTS camp_registrations_places_move_full;
DROP TRIGGER IF EXISTS camp_registrations_places_paid_insert;
DROP TRIGGER IF EXISTS camp_registrations_places_take;
DROP TRIGGER IF EXISTS camp_registrations_places_full;

CREATE TRIGGER camp_registrations_places_full BEFORE INSERT ON camp_registrations
WHEN EXISTS (
  SELECT 1 FROM camp_room_type_places
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender
    AND places_total IS NULL AND places_left = 0
)
OR EXISTS (
  SELECT 1 FROM camp_room_type_places p
  WHERE p.room_type_id = NEW.room_type_id AND p.gender = NEW.gender
    AND p.places_total IS NOT NULL
    AND (
      SELECT count(*) FROM camp_registrations r
      WHERE r.room_type_id = NEW.room_type_id AND r.gender = NEW.gender
        AND r.status = 'fully_paid' AND r.deleted_at IS NULL
    ) >= p.places_total
)
BEGIN
  SELECT RAISE(ABORT, 'room type is full');
END;

CREATE TRIGGER camp_registrations_places_take AFTER INSERT ON camp_registrations
WHEN EXISTS (
  SELECT 1 FROM camp_room_type_places
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_total IS NULL
)
BEGIN
  UPDATE camp_room_type_places SET places_left = places_left - 1
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_total IS NULL;
END;

CREATE TRIGGER camp_registrations_places_paid_insert AFTER INSERT ON camp_registrations
WHEN NEW.status = 'fully_paid'
BEGIN
  UPDATE camp_room_type_places SET places_left = MAX(0, places_total - (
    SELECT count(*) FROM camp_registrations r
    WHERE r.room_type_id = camp_room_type_places.room_type_id
      AND r.gender = camp_room_type_places.gender
      AND r.status = 'fully_paid' AND r.deleted_at IS NULL
  ))
  WHERE places_total IS NOT NULL AND room_type_id = NEW.room_type_id AND gender = NEW.gender;
END;

CREATE TRIGGER camp_registrations_places_move_full BEFORE UPDATE OF room_type_id, gender ON camp_registrations
WHEN (NEW.room_type_id <> OLD.room_type_id OR NEW.gender <> OLD.gender)
  AND NEW.status <> 'cancelled'
  AND (
    EXISTS (
      SELECT 1 FROM camp_room_type_places
      WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender
        AND places_total IS NULL AND places_left = 0
    )
    OR (
      NEW.status = 'fully_paid'
      AND EXISTS (
        SELECT 1 FROM camp_room_type_places p
        WHERE p.room_type_id = NEW.room_type_id AND p.gender = NEW.gender
          AND p.places_total IS NOT NULL
          AND (
            SELECT count(*) FROM camp_registrations r
            WHERE r.room_type_id = NEW.room_type_id AND r.gender = NEW.gender
              AND r.status = 'fully_paid' AND r.deleted_at IS NULL
          ) >= p.places_total
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'room type is full');
END;

CREATE TRIGGER camp_registrations_places_move_take AFTER UPDATE OF room_type_id, gender ON camp_registrations
WHEN (NEW.room_type_id <> OLD.room_type_id OR NEW.gender <> OLD.gender)
  AND NEW.status <> 'cancelled'
  AND EXISTS (
    SELECT 1 FROM camp_room_type_places
    WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_total IS NULL
  )
BEGIN
  UPDATE camp_room_type_places SET places_left = places_left - 1
  WHERE room_type_id = NEW.room_type_id AND gender = NEW.gender AND places_total IS NULL;
END;

CREATE TRIGGER camp_registrations_places_paid_update AFTER UPDATE OF status, room_type_id, gender ON camp_registrations
BEGIN
  UPDATE camp_room_type_places SET places_left = MAX(0, places_total - (
    SELECT count(*) FROM camp_registrations r
    WHERE r.room_type_id = camp_room_type_places.room_type_id
      AND r.gender = camp_room_type_places.gender
      AND r.status = 'fully_paid' AND r.deleted_at IS NULL
  ))
  WHERE places_total IS NOT NULL
    AND (
      (room_type_id = NEW.room_type_id AND gender = NEW.gender)
      OR (room_type_id = OLD.room_type_id AND gender = OLD.gender)
    );
END;

DELETE FROM d1_migrations WHERE name = '0033_camp_places_paid_few.sql';
