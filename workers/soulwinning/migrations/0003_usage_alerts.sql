-- One row per usage alert sent, so each limit warns at most once a day.
CREATE TABLE usage_alerts (
  day TEXT NOT NULL,          -- YYYY-MM-DD (UTC = Accra)
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (day, metric)
);
