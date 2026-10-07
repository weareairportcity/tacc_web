-- A service's songs can be split into sections ("First List", "Second List"),
-- shown as headings on the playlist. Empty means no heading.
ALTER TABLE sotw_service_songs ADD COLUMN section TEXT NOT NULL DEFAULT '';
