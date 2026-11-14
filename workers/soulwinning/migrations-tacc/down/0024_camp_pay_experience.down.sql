-- Undoes 0024_camp_pay_experience.sql.
DROP TABLE IF EXISTS camp_pay_experience;

DELETE FROM d1_migrations WHERE name = '0024_camp_pay_experience.sql';
