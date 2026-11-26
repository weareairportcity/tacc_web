-- Undoes 0036_camp_complaints.sql.
DROP TABLE camp_complaints;

DELETE FROM d1_migrations WHERE name = '0036_camp_complaints.sql';
