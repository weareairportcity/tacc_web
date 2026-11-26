-- Undoes 0037_camp_complaint_reads.sql.
DROP TABLE camp_complaint_reads;

DELETE FROM d1_migrations WHERE name = '0037_camp_complaint_reads.sql';
