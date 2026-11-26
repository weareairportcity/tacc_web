-- When and how each person gets to camp (day, time of day, bus or by themselves),
-- asked at registration and of everyone already registered. Also a small list of
-- texts to send at a set time (the arrival and health reminder). Undo with
-- migrations-tacc/down/0034_camp_arrival.down.sql.
ALTER TABLE camp_registrations ADD COLUMN arrival_day TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_registrations ADD COLUMN arrival_time TEXT NOT NULL DEFAULT '' CHECK (arrival_time IN ('', 'morning', 'afternoon', 'evening'));
ALTER TABLE camp_registrations ADD COLUMN transport TEXT NOT NULL DEFAULT '' CHECK (transport IN ('', 'bus', 'self'));
CREATE INDEX camp_registrations_arrival_idx ON camp_registrations (camp_id, arrival_day);

-- A text to send once, at or after send_at (the Worker's 10-minute cron picks it up).
CREATE TABLE camp_scheduled_sends (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('arrival_details')),
  send_at TEXT NOT NULL,
  sent_at TEXT,
  result_json TEXT
);
CREATE INDEX camp_scheduled_sends_due_idx ON camp_scheduled_sends (sent_at, send_at);
