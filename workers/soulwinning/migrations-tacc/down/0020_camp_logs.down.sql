-- Undoes 0020_camp_logs.sql.
ALTER TABLE camp_registrations DROP COLUMN health_consent_at;
ALTER TABLE camp_registrations DROP COLUMN guardian_consent_at;
ALTER TABLE camp_registrations DROP COLUMN guardian_phone;
ALTER TABLE camp_registrations DROP COLUMN guardian_name;
ALTER TABLE camp_registrations DROP COLUMN is_minor;
DROP TABLE camp_active_days;
DROP TABLE camp_presence;
DROP TABLE camp_access_log;
DROP INDEX camp_audit_log_created_idx;

DELETE FROM d1_migrations WHERE name = '0020_camp_logs.sql';
