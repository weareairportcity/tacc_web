-- Camp roommate groups, Phase 3. See docs/camp-spec.md. Undo with
-- migrations-tacc/down/0006_camp_groups.down.sql.
--
-- A group is open until its owner locks it or the camp's roommate deadline
-- passes (the day after roommate_deadline_on, UTC = Ghana time). The owner
-- can unlock until the deadline. The app's statements are guarded; the
-- triggers below hold the same rules even if the app is bypassed.

CREATE TABLE camp_groups (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  -- Every member has this room type and gender.
  room_type_id TEXT NOT NULL REFERENCES camp_room_types (id) ON DELETE CASCADE,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  -- 6 characters from the sign-in code alphabet, stored without the dash.
  code TEXT NOT NULL UNIQUE,
  owner_registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  -- Set while the owner has it locked; null when open.
  locked_at TEXT
);
CREATE INDEX camp_groups_camp_idx ON camp_groups (camp_id, room_type_id, gender);

CREATE TABLE camp_group_members (
  group_id TEXT NOT NULL REFERENCES camp_groups (id) ON DELETE CASCADE,
  -- UNIQUE: one group per person (a registration belongs to one camp).
  registration_id TEXT NOT NULL UNIQUE REFERENCES camp_registrations (id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX camp_group_members_group_idx ON camp_group_members (group_id, joined_at);

-- Name-search invites. A pending invite doesn't hold a place.
CREATE TABLE camp_group_invites (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  group_id TEXT NOT NULL REFERENCES camp_groups (id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);
CREATE UNIQUE INDEX camp_group_invites_pending_idx ON camp_group_invites (group_id, registration_id)
  WHERE status = 'pending';
CREATE INDEX camp_group_invites_invitee_idx ON camp_group_invites (registration_id, status);

-- Joining: the group is open and has a free place, and the person is Fully
-- Paid with the group's camp, room type and gender.
CREATE TRIGGER camp_group_members_join BEFORE INSERT ON camp_group_members
BEGIN
  SELECT RAISE(ABORT, 'not allowed to join this group')
  WHERE NOT EXISTS (
    SELECT 1 FROM camp_groups g
    JOIN camps c ON c.id = g.camp_id
    JOIN camp_room_types t ON t.id = g.room_type_id
    JOIN camp_registrations r ON r.id = NEW.registration_id
    WHERE g.id = NEW.group_id
      AND g.locked_at IS NULL AND date('now') <= c.roommate_deadline_on
      AND r.camp_id = g.camp_id AND r.room_type_id = g.room_type_id AND r.gender = g.gender
      AND r.status = 'fully_paid'
      AND (SELECT COUNT(*) FROM camp_group_members m WHERE m.group_id = g.id) < t.capacity
  );
END;

-- Leaving or being removed: only while the group is open. A cancelled
-- registration is removed by its coordinator whatever the group's state.
CREATE TRIGGER camp_group_members_leave BEFORE DELETE ON camp_group_members
WHEN EXISTS (
  SELECT 1 FROM camp_groups g JOIN camps c ON c.id = g.camp_id
  WHERE g.id = OLD.group_id AND (g.locked_at IS NOT NULL OR date('now') > c.roommate_deadline_on)
) AND (SELECT status FROM camp_registrations WHERE id = OLD.registration_id) <> 'cancelled'
BEGIN
  SELECT RAISE(ABORT, 'this group is locked');
END;

CREATE TRIGGER camp_group_members_no_update BEFORE UPDATE ON camp_group_members
BEGIN
  SELECT RAISE(ABORT, 'group members are added and removed, not edited');
END;

-- The owner can lock and unlock only until the deadline.
CREATE TRIGGER camp_groups_lock_deadline BEFORE UPDATE OF locked_at ON camp_groups
WHEN date('now') > (SELECT roommate_deadline_on FROM camps WHERE id = NEW.camp_id)
BEGIN
  SELECT RAISE(ABORT, 'the roommate deadline has passed');
END;

CREATE TRIGGER camp_groups_fixed BEFORE UPDATE OF camp_id, room_type_id, gender, code ON camp_groups
BEGIN
  SELECT RAISE(ABORT, 'a group''s camp, room type, gender and code are fixed');
END;

-- Invites only into an open group, and only to someone who could join it.
CREATE TRIGGER camp_group_invites_new BEFORE INSERT ON camp_group_invites
BEGIN
  SELECT RAISE(ABORT, 'not allowed to invite this person')
  WHERE NOT EXISTS (
    SELECT 1 FROM camp_groups g
    JOIN camps c ON c.id = g.camp_id
    JOIN camp_registrations r ON r.id = NEW.registration_id
    WHERE g.id = NEW.group_id
      AND g.locked_at IS NULL AND date('now') <= c.roommate_deadline_on
      AND r.camp_id = g.camp_id AND r.room_type_id = g.room_type_id AND r.gender = g.gender
      AND r.status = 'fully_paid'
  );
END;
