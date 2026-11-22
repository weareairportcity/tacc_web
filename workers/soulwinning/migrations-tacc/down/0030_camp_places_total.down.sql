-- Undoes 0030_camp_places_total.sql.
ALTER TABLE camp_room_type_places DROP COLUMN places_total;

DELETE FROM d1_migrations WHERE name = '0030_camp_places_total.sql';
