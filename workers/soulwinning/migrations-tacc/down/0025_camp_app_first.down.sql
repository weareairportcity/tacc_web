-- Undoes 0025_camp_app_first.sql.
DROP INDEX IF EXISTS camp_sms_log_camp_idx;
DROP TABLE IF EXISTS camp_sms_log;
ALTER TABLE camps DROP COLUMN leader_reminders;
ALTER TABLE camps DROP COLUMN app_required;
ALTER TABLE camp_registrations DROP COLUMN texts_only_at;
ALTER TABLE camp_registrations DROP COLUMN app_platform;
ALTER TABLE camp_registrations DROP COLUMN app_installed_at;

DELETE FROM d1_migrations WHERE name = '0025_camp_app_first.sql';
