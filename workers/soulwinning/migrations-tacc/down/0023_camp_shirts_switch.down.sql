-- Undoes 0023_camp_shirts_switch.sql.
ALTER TABLE camps DROP COLUMN shirts_on;

DELETE FROM d1_migrations WHERE name = '0023_camp_shirts_switch.sql';
