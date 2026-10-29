-- Undoes 0017_camp_groups_link_only.sql (locking and invites allowed again;
-- groups it unlocked stay unlocked). Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0017_camp_groups_link_only.down.sql

DROP INDEX camp_audit_log_action_entity_idx;
DROP TRIGGER camp_groups_no_lock;
DROP TRIGGER camp_group_invites_new;
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

DELETE FROM d1_migrations WHERE name = '0017_camp_groups_link_only.sql';
