-- Changing someone's gender. Undo with
-- migrations-tacc/down/0016_camp_gender_change.down.sql.
--
-- 0008's leave rule, plus: someone whose gender is changed leaves their group
-- even if it's locked (the registration's gender no longer matches the group's).
DROP TRIGGER camp_group_members_leave;
CREATE TRIGGER camp_group_members_leave BEFORE DELETE ON camp_group_members
WHEN EXISTS (
  SELECT 1 FROM camp_groups g JOIN camps c ON c.id = g.camp_id
  WHERE g.id = OLD.group_id AND (g.locked_at IS NOT NULL OR date('now') > c.roommate_deadline_on)
) AND EXISTS (
  SELECT 1 FROM camp_registrations r JOIN camp_groups g ON g.id = OLD.group_id
  WHERE r.id = OLD.registration_id AND r.status <> 'cancelled' AND r.room_type_id = g.room_type_id AND r.gender = g.gender
)
BEGIN
  SELECT RAISE(ABORT, 'this group is locked');
END;
