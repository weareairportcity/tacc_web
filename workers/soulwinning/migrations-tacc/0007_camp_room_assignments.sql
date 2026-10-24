-- Camp room assignment, Phase 4. See docs/camp-spec.md. Undo with
-- migrations-tacc/down/0007_camp_room_assignments.down.sql.
--
-- Coordinators place Fully Paid attendees in rooms of their gender and room
-- type, never beyond the room's beds. The app's inserts are guarded; the
-- triggers below hold the same rules if the app is bypassed.

CREATE TABLE camp_room_assignments (
  -- CASCADE: deleting a room returns its occupants to Unassigned.
  room_id TEXT NOT NULL REFERENCES camp_rooms (id) ON DELETE CASCADE,
  -- UNIQUE: one room per person.
  registration_id TEXT NOT NULL UNIQUE REFERENCES camp_registrations (id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX camp_room_assignments_room_idx ON camp_room_assignments (room_id);

CREATE TRIGGER camp_room_assignments_fit BEFORE INSERT ON camp_room_assignments
BEGIN
  SELECT RAISE(ABORT, 'this person can''t be placed in this room')
  WHERE NOT EXISTS (
    SELECT 1 FROM camp_rooms x JOIN camp_registrations r ON r.id = NEW.registration_id
    WHERE x.id = NEW.room_id
      AND r.camp_id = x.camp_id AND r.gender = x.gender AND r.room_type_id = x.room_type_id
      AND r.status = 'fully_paid'
      AND (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) < x.capacity
  );
END;

CREATE TRIGGER camp_room_assignments_no_update BEFORE UPDATE ON camp_room_assignments
BEGIN
  SELECT RAISE(ABORT, 'remove and re-assign instead of editing a placement');
END;

-- A room can't shrink below the people in it.
CREATE TRIGGER camp_rooms_capacity BEFORE UPDATE OF capacity ON camp_rooms
WHEN NEW.capacity < (SELECT COUNT(*) FROM camp_room_assignments WHERE room_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'the room has more people than that');
END;

-- An occupied room keeps its camp, gender and room type.
CREATE TRIGGER camp_rooms_occupied BEFORE UPDATE OF camp_id, gender, room_type_id ON camp_rooms
WHEN (NEW.camp_id <> OLD.camp_id OR NEW.gender <> OLD.gender OR NEW.room_type_id <> OLD.room_type_id)
  AND EXISTS (SELECT 1 FROM camp_room_assignments WHERE room_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'empty the room before changing its gender or type');
END;
