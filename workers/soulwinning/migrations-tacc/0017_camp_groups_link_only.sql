-- Groups by link only: no locking and no invites by name. Undo with
-- migrations-tacc/down/0017_camp_groups_link_only.down.sql.
--
-- Every locked group is unlocked (logged in History), pending invites are
-- withdrawn, and triggers stop either coming back. The locked_at column and
-- camp_group_invites stay for history.

INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
SELECT camp_id, 'system', 'group.unlock', 'group', id, '{"reason":"locking removed"}'
FROM camp_groups WHERE locked_at IS NOT NULL;

UPDATE camp_groups SET locked_at = NULL WHERE locked_at IS NOT NULL;

UPDATE camp_group_invites SET status = 'cancelled' WHERE status = 'pending';

CREATE TRIGGER camp_groups_no_lock BEFORE UPDATE OF locked_at ON camp_groups
WHEN NEW.locked_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'groups are not locked any more');
END;

DROP TRIGGER camp_group_invites_new;
CREATE TRIGGER camp_group_invites_new BEFORE INSERT ON camp_group_invites
BEGIN
  SELECT RAISE(ABORT, 'groups are joined by link only');
END;

-- "You're fully paid" is texted once per person; its audit row is the claim.
CREATE INDEX camp_audit_log_action_entity_idx ON camp_audit_log (action, entity_id);
