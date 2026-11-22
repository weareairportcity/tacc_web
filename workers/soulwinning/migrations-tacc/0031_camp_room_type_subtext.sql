-- Optional line under a room type's name, set when a coordinator edits it.
-- Shown on register and the camp page. Empty means none.
-- Undo with migrations-tacc/down/0031_camp_room_type_subtext.down.sql.

ALTER TABLE camp_room_types ADD COLUMN subtext TEXT NOT NULL DEFAULT '';
