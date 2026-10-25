-- Undoes 0010_camp_photos.sql. The image files stay in R2. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0010_camp_photos.down.sql

ALTER TABLE camps DROP COLUMN venue_photo_credit;
ALTER TABLE camps DROP COLUMN venue_photo_url;
ALTER TABLE camps DROP COLUMN banner_credit;
ALTER TABLE camps DROP COLUMN banner_url;
ALTER TABLE camps DROP COLUMN logo_credit;
ALTER TABLE camps DROP COLUMN logo_url;

DELETE FROM d1_migrations WHERE name = '0010_camp_photos.sql';
