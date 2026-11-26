-- Undoes 0034_camp_arrival.sql.
DROP TABLE camp_scheduled_sends;
DROP INDEX camp_registrations_arrival_idx;
ALTER TABLE camp_registrations DROP COLUMN transport;
ALTER TABLE camp_registrations DROP COLUMN arrival_time;
ALTER TABLE camp_registrations DROP COLUMN arrival_day;

DELETE FROM d1_migrations WHERE name = '0034_camp_arrival.sql';
