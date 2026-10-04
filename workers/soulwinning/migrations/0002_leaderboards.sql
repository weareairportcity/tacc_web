-- Per-member target and the cached leaderboards the screens show.

-- Souls each member aims for. Reaching it is celebrated on their phone and
-- puts them on the "reached the target" board. Grace in Continuity: 7.
ALTER TABLE campaigns ADD COLUMN target_per_member INTEGER NOT NULL DEFAULT 7;

-- The leaderboards (top members, top PFCCs, who reached the target and in
-- what order), recomputed at most once a minute by the live feed so the
-- screens never make D1 group the whole entries table every 10 seconds.
ALTER TABLE counts ADD COLUMN leaderboard TEXT;
ALTER TABLE counts ADD COLUMN leaderboard_at TEXT;

-- Grace in Continuity has no overall goal: hide the progress bar, and add the
-- new details to the hourly SMS.
UPDATE campaigns SET goal_total = NULL,
  sms_template = 'Grace in Continuity ({time}): {total} souls so far, {last_hour} in the last hour. {completed} members have reached 7. Top PFCC: {top_pfcc}. Top soul winner: {top_member}.'
WHERE slug = 'gic';
