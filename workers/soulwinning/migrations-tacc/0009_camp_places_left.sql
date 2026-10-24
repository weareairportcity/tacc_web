-- Places left per room type and gender. The venue never gives a starting
-- total: at some point they say "only 5 Hotel places left for women", a
-- coordinator records that, and each registration counts it down. At 0 that
-- room type is full for that gender. No row means no limit. A camp as a whole
-- is never full. Undo with migrations-tacc/down/0009_camp_places_left.down.sql.
--
-- Cancelling does not give a place back: it may have been taken before the
-- limit was set, so a coordinator raises the number by hand if the venue
-- confirms it.

CREATE TABLE camp_room_type_places (
  room_type_id TEXT NOT NULL REFERENCES camp_room_types (id) ON DELETE CASCADE,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  places_left INTEGER NOT NULL CHECK (places_left >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL,
  PRIMARY KEY (room_type_id, gender)
);

-- The real guard: two people can't both take the last place, because the
-- check and the count-down happen inside the insert.
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

-- Moving someone to another room type (or correcting their gender) takes a
-- place in the new one the same way.
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
