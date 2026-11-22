-- Emergency contact and health details can be required before an attendee
-- pays or picks roommates (Settings). health_none is "I have no health
-- conditions", so they still have to answer. Undo with
-- migrations-tacc/down/0029_camp_details_required.down.sql.
ALTER TABLE camps ADD COLUMN details_required INTEGER NOT NULL DEFAULT 0 CHECK (details_required IN (0, 1));
ALTER TABLE camp_registrations ADD COLUMN health_none INTEGER NOT NULL DEFAULT 0 CHECK (health_none IN (0, 1));

-- Until the Spirit Be Poured: on now. Coordinators can switch it off.
UPDATE camps SET details_required = 1 WHERE slug = 'until-the-spirit-be-poured';
