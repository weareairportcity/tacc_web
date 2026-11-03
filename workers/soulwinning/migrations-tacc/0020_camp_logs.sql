-- Sign-in log, who's online, and who came on which day (for active users and
-- retention), plus the consent a guardian gives for an under-18 and the
-- consent an attendee gives before writing health notes. Logs and active days
-- are deleted after 90 days by the hourly cron (src/stats.ts); camp_audit_log
-- (the History) is kept. Undo with migrations-tacc/down/0020_camp_logs.down.sql.

-- Sign-ins, sign-outs, failed sign-ins and the attendee actions that change
-- nothing in the camp (starting a payment, asking for a lost code). Place and
-- device come from the request: "Accra, GH", "Android 15 · Chrome".
CREATE TABLE camp_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('attendee', 'leader', 'coordinator', 'admin', 'visitor')),
  event TEXT NOT NULL,
  camp_id TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  place TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT ''
);
CREATE INDEX camp_access_log_created_idx ON camp_access_log (created_at);
-- The admin's Logs page reads both logs newest first.
CREATE INDEX camp_audit_log_created_idx ON camp_audit_log (created_at);

-- One row per coordinator or leader, updated at most every few minutes while
-- their Commune tab is open.
CREATE TABLE camp_presence (
  actor TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  camp_id TEXT,
  last_seen TEXT NOT NULL,
  signed_in_at TEXT,
  place TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT ''
);

-- "Came today": one row per person per day they used Commune.
CREATE TABLE camp_active_days (
  day TEXT NOT NULL,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  camp_id TEXT,
  PRIMARY KEY (day, actor)
) WITHOUT ROWID;

ALTER TABLE camp_registrations ADD COLUMN is_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE camp_registrations ADD COLUMN guardian_name TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_registrations ADD COLUMN guardian_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE camp_registrations ADD COLUMN guardian_consent_at TEXT;
ALTER TABLE camp_registrations ADD COLUMN health_consent_at TEXT;
