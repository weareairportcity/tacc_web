-- Undoes 0029_camp_details_required.sql.
ALTER TABLE camp_registrations DROP COLUMN health_none;
ALTER TABLE camps DROP COLUMN details_required;

DELETE FROM d1_migrations WHERE name = '0029_camp_details_required.sql';
