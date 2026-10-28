-- Undoes 0016_camp_gender_change.sql (back to 0008's leave rule). Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0016_camp_gender_change.down.sql

DROP TRIGGER camp_group_members_leave;
CREATE TRIGGER camp_group_members_leave BEFORE DELETE ON camp_group_members
WHEN EXISTS (
  SELECT 1 FROM camp_groups g JOIN camps c ON c.id = g.camp_id
  WHERE g.id = OLD.group_id AND (g.locked_at IS NOT NULL OR date('now') > c.roommate_deadline_on)
) AND EXISTS (
  SELECT 1 FROM camp_registrations r JOIN camp_groups g ON g.id = OLD.group_id
  WHERE r.id = OLD.registration_id AND r.status <> 'cancelled' AND r.room_type_id = g.room_type_id
)
BEGIN
  SELECT RAISE(ABORT, 'this group is locked');
END;

DELETE FROM d1_migrations WHERE name = '0016_camp_gender_change.sql';
