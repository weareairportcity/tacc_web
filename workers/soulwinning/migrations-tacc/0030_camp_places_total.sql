-- Coordinators can record the venue's total places, not only how many are
-- left. Remaining is still places_left (triggers count it down). places_total
-- is the last total they typed, so the sheet can reopen on that number.
-- Undo with migrations-tacc/down/0030_camp_places_total.down.sql.

ALTER TABLE camp_room_type_places ADD COLUMN places_total INTEGER
  CHECK (places_total IS NULL OR (places_total >= 0 AND places_total <= 10000));
