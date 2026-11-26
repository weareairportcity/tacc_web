-- Which complaints each coordinator or leader has opened, for the unread badge.
-- Undo with migrations-tacc/down/0037_camp_complaint_reads.down.sql.
CREATE TABLE camp_complaint_reads (
  -- A coordinator's email, or a leader code's name.
  viewer TEXT NOT NULL,
  complaint_id TEXT NOT NULL REFERENCES camp_complaints (id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (viewer, complaint_id)
);
