-- Coordinators can schedule a message to people (Texts). The same list holds
-- the arrival reminder, so both show in one place: who scheduled it, when it
-- goes, and what it did. Undo with
-- migrations-tacc/down/0035_camp_scheduled_messages.down.sql.
CREATE TABLE camp_scheduled_sends_new (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('arrival_details', 'message')),
  send_at TEXT NOT NULL,
  sent_at TEXT,
  result_json TEXT,
  -- A coordinator's email, or 'system'.
  created_by TEXT NOT NULL DEFAULT 'system',
  -- message only: who it's for (Texts audiences), how it goes, and the words.
  audience TEXT,
  how TEXT,
  message TEXT,
  cancelled_at TEXT
);
INSERT INTO camp_scheduled_sends_new (id, created_at, camp_id, kind, send_at, sent_at, result_json)
  SELECT id, created_at, camp_id, kind, send_at, sent_at, result_json FROM camp_scheduled_sends;
DROP TABLE camp_scheduled_sends;
ALTER TABLE camp_scheduled_sends_new RENAME TO camp_scheduled_sends;
CREATE INDEX camp_scheduled_sends_due_idx ON camp_scheduled_sends (sent_at, send_at);
CREATE INDEX camp_scheduled_sends_camp_idx ON camp_scheduled_sends (camp_id, send_at);
