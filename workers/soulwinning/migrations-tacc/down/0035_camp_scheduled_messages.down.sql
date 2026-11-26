-- Undoes 0035_camp_scheduled_messages.sql (scheduled messages are dropped; the arrival reminder stays).
CREATE TABLE camp_scheduled_sends_old (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('arrival_details')),
  send_at TEXT NOT NULL,
  sent_at TEXT,
  result_json TEXT
);
INSERT INTO camp_scheduled_sends_old (id, created_at, camp_id, kind, send_at, sent_at, result_json)
  SELECT id, created_at, camp_id, kind, send_at, sent_at, result_json FROM camp_scheduled_sends WHERE kind = 'arrival_details';
DROP TABLE camp_scheduled_sends;
ALTER TABLE camp_scheduled_sends_old RENAME TO camp_scheduled_sends;
CREATE INDEX camp_scheduled_sends_due_idx ON camp_scheduled_sends (sent_at, send_at);

DELETE FROM d1_migrations WHERE name = '0035_camp_scheduled_messages.sql';
