-- Each camp's own images, shown across Commune: a logo (beside the back
-- button and in the coordinator sidebar), a wide banner (camp list, camp page,
-- the attendee's pass) and a venue photo ("Where we'll be", payment received).
-- Each has a credit line, which most free photo licences require. Empty means
-- none. Undo with migrations-tacc/down/0010_camp_photos.down.sql.

ALTER TABLE camps ADD COLUMN logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE camps ADD COLUMN logo_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE camps ADD COLUMN banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE camps ADD COLUMN banner_credit TEXT NOT NULL DEFAULT '';
ALTER TABLE camps ADD COLUMN venue_photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE camps ADD COLUMN venue_photo_credit TEXT NOT NULL DEFAULT '';
