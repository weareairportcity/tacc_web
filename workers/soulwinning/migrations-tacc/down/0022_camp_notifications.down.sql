-- Undoes 0022_camp_notifications.sql. Run with:
--   npx wrangler d1 execute tacc --local --file migrations-tacc/down/0022_camp_notifications.down.sql

DROP TABLE IF EXISTS camp_notify_once;
DROP TABLE IF EXISTS camp_telegram_chats;
DROP TABLE IF EXISTS camp_notify_prefs;
DROP INDEX IF EXISTS camp_push_subs_owner_idx;
DROP TABLE IF EXISTS camp_push_subs;

DELETE FROM d1_migrations WHERE name = '0022_camp_notifications.sql';
