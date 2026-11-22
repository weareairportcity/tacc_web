-- Undoes 0031_camp_room_type_subtext.sql.
ALTER TABLE camp_room_types DROP COLUMN subtext;

DELETE FROM d1_migrations WHERE name = '0031_camp_room_type_subtext.sql';
