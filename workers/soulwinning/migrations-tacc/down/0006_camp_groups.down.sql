-- Undoes 0006_camp_groups.sql. Deletes every roommate group, member and
-- invite (registrations and payments are kept). Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0006_camp_groups.down.sql

DROP TRIGGER IF EXISTS camp_group_invites_new;
DROP TRIGGER IF EXISTS camp_groups_fixed;
DROP TRIGGER IF EXISTS camp_groups_lock_deadline;
DROP TRIGGER IF EXISTS camp_group_members_no_update;
DROP TRIGGER IF EXISTS camp_group_members_leave;
DROP TRIGGER IF EXISTS camp_group_members_join;
DROP TABLE IF EXISTS camp_group_invites;
DROP TABLE IF EXISTS camp_group_members;
DROP TABLE IF EXISTS camp_groups;

DELETE FROM d1_migrations WHERE name = '0006_camp_groups.sql';
