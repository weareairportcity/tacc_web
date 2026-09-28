-- Soul winning on Cloudflare D1 (SQLite). Ported from soulwinning_schema.sql,
-- which ran on Supabase Postgres for 1909.
--
-- Differences from the Postgres version:
--   * Timestamps are ISO-8601 UTC strings. Ghana is UTC+0 all year, so the UTC
--     hour and date ARE the Accra hour and date.
--   * The duplicate check and the running totals were Postgres triggers; the
--     Worker now does both inside the same batch as the insert.
--   * Normalised name/phone are stored columns (filled by the Worker) instead
--     of an expression index, so the duplicate lookup is a plain index hit.
--   * Arrays (recent names, photo paths, SMS recipients) are JSON text.

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  event_date TEXT NOT NULL,              -- YYYY-MM-DD, Accra
  opens_at TEXT NOT NULL,                -- logging and the live counter run between these
  closes_at TEXT NOT NULL,
  goal_total INTEGER CHECK (goal_total IS NULL OR goal_total > 0),
  sms_template TEXT NOT NULL,
  sms_start_hour INTEGER NOT NULL DEFAULT 6 CHECK (sms_start_hour BETWEEN 0 AND 23),
  sms_end_hour INTEGER NOT NULL DEFAULT 20 CHECK (sms_end_hour BETWEEN 0 AND 23),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The member doing the logging. No account: a device id plus a 4-character
-- login code to pick the same member up on another phone.
CREATE TABLE entrants (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fellowship TEXT,
  phone TEXT,
  pfcc TEXT,
  login_code TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX entrants_login_code_idx ON entrants (login_code);
CREATE INDEX entrants_device_idx ON entrants (device_id);

-- One row per soul. id is generated on the phone so a retried sync is a no-op.
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entrant_id TEXT NOT NULL REFERENCES entrants(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  soul_name TEXT NOT NULL,
  phone TEXT,
  norm_name TEXT NOT NULL,
  norm_phone TEXT,
  latitude REAL,
  longitude REAL,
  spoke_in_tongues INTEGER NOT NULL DEFAULT 0,
  coming_to_church INTEGER NOT NULL DEFAULT 0,
  photo_path TEXT,
  duplicate_status TEXT NOT NULL DEFAULT 'none'
    CHECK (duplicate_status IN ('none', 'pending', 'unique', 'merged')),
  duplicate_of TEXT REFERENCES entries(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  -- In the public total? Flagged (pending) and merged duplicates are not.
  counted INTEGER GENERATED ALWAYS AS (duplicate_status IN ('none', 'unique')) STORED,
  created_at TEXT NOT NULL,              -- the phone's clock, so a late sync lands in the right hour
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX entries_campaign_created_idx ON entries (campaign_id, created_at);
CREATE INDEX entries_entrant_idx ON entries (entrant_id);
CREATE INDEX entries_dedupe_idx ON entries (campaign_id, norm_name, norm_phone);
CREATE INDEX entries_pending_idx ON entries (campaign_id) WHERE duplicate_status = 'pending';

-- The single row the public counter reads. Kept up to date on every insert
-- so the counter never has to count the entries table.
CREATE TABLE counts (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  total_souls INTEGER NOT NULL DEFAULT 0,
  tongues_count INTEGER NOT NULL DEFAULT 0,
  church_count INTEGER NOT NULL DEFAULT 0,
  pending_duplicates INTEGER NOT NULL DEFAULT 0,
  last_soul_name TEXT,                   -- first name only: all the public page ever sees
  last_entry_id TEXT,
  recent_names TEXT NOT NULL DEFAULT '[]',        -- newest first, up to 10
  last_photo_path TEXT,
  recent_photo_paths TEXT NOT NULL DEFAULT '[]',  -- newest first, up to 36
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sms_config (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (campaign_id, phone_number)
);

CREATE TABLE sms_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  message TEXT NOT NULL,
  recipients TEXT NOT NULL DEFAULT '[]',
  total_souls INTEGER,
  last_hour_souls INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT
);
CREATE INDEX sms_log_campaign_sent_idx ON sms_log (campaign_id, sent_at DESC);

-- Grace in Continuity: Monday 5 October 2026, 00:00–20:00 Accra (= UTC).
INSERT INTO campaigns (id, name, slug, event_date, opens_at, closes_at, goal_total, sms_template, sms_start_hour, sms_end_hour)
VALUES (
  'b2f0c7a4-6d1e-4f3a-9c55-0e7d1a2b3c4d',
  'Grace in Continuity',
  'gic',
  '2026-10-05',
  '2026-10-05T00:00:00.000Z',
  '2026-10-05T20:00:00.000Z',
  1000,
  'Grace in Continuity update ({time}): {last_hour} souls this hour, {total} total today.',
  6,
  20
);
INSERT INTO counts (campaign_id) VALUES ('b2f0c7a4-6d1e-4f3a-9c55-0e7d1a2b3c4d');
