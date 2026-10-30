-- Undoes 0019_camp_help_phone.sql.
ALTER TABLE camps DROP COLUMN help_phone;

DELETE FROM d1_migrations WHERE name = '0019_camp_help_phone.sql';
