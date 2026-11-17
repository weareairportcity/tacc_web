-- App first (Nov 2026): attendees are asked to put Commune on their Home
-- Screen with notifications on, and get app notifications instead of texts
-- wherever they can. Undo with migrations-tacc/down/0025_camp_app_first.down.sql.

-- When this person first opened Commune from their Home Screen, and on what.
ALTER TABLE camp_registrations ADD COLUMN app_installed_at TEXT;
ALTER TABLE camp_registrations ADD COLUMN app_platform TEXT;
-- "My phone can't do this": they keep getting texts and aren't asked again.
ALTER TABLE camp_registrations ADD COLUMN texts_only_at TEXT;

-- Settings: attendees must set up the app before using their page (on by default),
-- and whether leaders may send payment reminders (app notifications only).
ALTER TABLE camps ADD COLUMN app_required INTEGER NOT NULL DEFAULT 1 CHECK (app_required IN (0, 1));
ALTER TABLE camps ADD COLUMN leader_reminders INTEGER NOT NULL DEFAULT 0 CHECK (leader_reminders IN (0, 1));

-- Every Commune text that went out, with the mNotify credits it used. One row
-- per send (a coordinator's message to 120 people is one row).
CREATE TABLE camp_sms_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL,
  texts INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  pushed INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX camp_sms_log_camp_idx ON camp_sms_log (camp_id, created_at);
