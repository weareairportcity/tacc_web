-- Notifications (Nov 2026): app notifications (Web Push) for attendees and
-- coordinators, a Telegram group for coordinators, and who turned what off.
-- Undo with migrations-tacc/down/0022_camp_notifications.down.sql.

-- One row per phone or browser that turned notifications on. owner is
-- 'attendee:<registration id>' or 'staff:<email>'.
CREATE TABLE camp_push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_ok_at TEXT,
  fails INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX camp_push_subs_owner_idx ON camp_push_subs (owner);

-- The kinds a person turned off (JSON array). No row: everything on.
CREATE TABLE camp_notify_prefs (
  owner TEXT PRIMARY KEY,
  off_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The coordinators' Telegram group. owner_user_id linked it and alone may
-- change its settings; off_json lists the kinds turned off.
CREATE TABLE camp_telegram_chats (
  chat_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  off_json TEXT NOT NULL DEFAULT '[]',
  linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Notifications sent at most once (reminders, receipts): the key is the claim.
CREATE TABLE camp_notify_once (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
