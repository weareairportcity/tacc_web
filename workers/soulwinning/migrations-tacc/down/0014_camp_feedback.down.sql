-- Undoes 0014_camp_feedback.sql. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0014_camp_feedback.down.sql

DROP TABLE camp_feedback_invites;
DROP TABLE camp_feedback;

DELETE FROM d1_migrations WHERE name = '0014_camp_feedback.sql';
