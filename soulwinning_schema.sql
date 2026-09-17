-- =====================================================================
-- Soul Winning Tracker — schema (sw_* tables)
-- Ref: "Soul Winning Tracker — Technical Integration Plan.md" §4
--
-- Safe to run on the existing TACC Supabase project: it creates only
-- new sw_* objects, plus ONE change to an existing object — widening the
-- admin_roles.role CHECK constraint to allow 'soulwinning'. No existing
-- table's data, columns or policies are altered.
--
-- Idempotent: re-running is a no-op.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Allow a 'soulwinning' admin role
-- ---------------------------------------------------------------------
ALTER TABLE public.admin_roles DROP CONSTRAINT IF EXISTS admin_roles_role_check;
ALTER TABLE public.admin_roles ADD CONSTRAINT admin_roles_role_check
  CHECK (role IN ('bookings', 'songs', 'both', 'soulwinning'));

-- Is the current user a soul-winning admin?
CREATE OR REPLACE FUNCTION public.is_sw_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND role IN ('soulwinning', 'both')
  );
$$;


-- A Ghana number is written 0551112222, +233551112222 or 233 55 111 2222 in
-- the field; all three are the same person, so they must compare equal.
CREATE OR REPLACE FUNCTION public.sw_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN digits = '' THEN NULL
    WHEN digits LIKE '233%' THEN digits
    WHEN digits LIKE '0%' THEN '233' || substr(digits, 2)
    ELSE '233' || digits
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS digits) AS d;
$$;

-- "ama  MENSAH" and "Ama Mensah" are the same name.
CREATE OR REPLACE FUNCTION public.sw_normalize_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$;

-- ---------------------------------------------------------------------
-- 1. sw_campaigns — one row per outreach event
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,              -- '1909' — the route this campaign is served at
  event_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  -- SMS settings live with the campaign so the template is editable per event (§11.2)
  sms_template TEXT NOT NULL DEFAULT '1909 Update ({time}): {last_hour} souls this hour, {total} total today.',
  sms_start_hour SMALLINT NOT NULL DEFAULT 7 CHECK (sms_start_hour BETWEEN 0 AND 23),
  sms_end_hour SMALLINT NOT NULL DEFAULT 22 CHECK (sms_end_hour BETWEEN 0 AND 23),
  -- Target for the counter page's progress bar. NULL simply hides the bar,
  -- so the page is correct before a target is decided.
  goal_total INTEGER CHECK (goal_total IS NULL OR goal_total > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sw_campaigns ADD COLUMN IF NOT EXISTS goal_total INTEGER;

CREATE INDEX IF NOT EXISTS sw_campaigns_active_idx ON public.sw_campaigns (active) WHERE active;


-- ---------------------------------------------------------------------
-- 2. sw_entrants — the volunteer doing the entering (no login)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_entrants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL,                -- generated once in the browser, reused per device
  name TEXT NOT NULL,
  fellowship TEXT,
  phone TEXT,
  pfcc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sw_entrants_device_id_idx ON public.sw_entrants (device_id);


-- ---------------------------------------------------------------------
-- 3. sw_soul_entries — one row per soul
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_soul_entries (
  -- id is generated CLIENT-SIDE so a retry after a flaky connection is
  -- idempotent (§7) — inserts use ON CONFLICT (id) DO NOTHING.
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.sw_campaigns(id) ON DELETE CASCADE,
  entrant_id UUID NOT NULL REFERENCES public.sw_entrants(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,                 -- souls entered in one sitting share a location (§6)
  soul_name TEXT NOT NULL,
  phone TEXT,
  latitude DOUBLE PRECISION,              -- nullable: never block a save on a missing GPS fix (§7)
  longitude DOUBLE PRECISION,
  spoke_in_tongues BOOLEAN NOT NULL DEFAULT false,
  coming_to_church BOOLEAN NOT NULL DEFAULT false,
  -- Duplicate safety net (§11): always saved, but held out of the official
  -- count until an admin reviews it.
  -- Optional photo, stored in the private sw-photos bucket. Only the object
  -- path lives here; the image itself is served through short-lived signed
  -- URLs minted server-side, never a permanent public address.
  photo_path TEXT,
  duplicate_status TEXT NOT NULL DEFAULT 'none'
    CHECK (duplicate_status IN ('none', 'pending', 'unique', 'merged')),
  duplicate_of UUID REFERENCES public.sw_soul_entries(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Counted in the public total? pending/merged rows are not.
  counted BOOLEAN GENERATED ALWAYS AS (duplicate_status IN ('none', 'unique')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sw_soul_entries_campaign_created_idx
  ON public.sw_soul_entries (campaign_id, created_at);
CREATE INDEX IF NOT EXISTS sw_soul_entries_entrant_idx
  ON public.sw_soul_entries (entrant_id);
CREATE INDEX IF NOT EXISTS sw_soul_entries_group_idx
  ON public.sw_soul_entries (group_id);
DROP INDEX IF EXISTS public.sw_soul_entries_dedupe_idx;
CREATE INDEX sw_soul_entries_dedupe_idx
  ON public.sw_soul_entries (campaign_id, public.sw_normalize_name(soul_name), public.sw_normalize_phone(phone));
ALTER TABLE public.sw_soul_entries ADD COLUMN IF NOT EXISTS photo_path TEXT;

CREATE INDEX IF NOT EXISTS sw_soul_entries_pending_idx
  ON public.sw_soul_entries (campaign_id) WHERE duplicate_status = 'pending';


-- ---------------------------------------------------------------------
-- 4. sw_counts — the aggregate the public counter subscribes to
--    One row per campaign, maintained by trigger. The big screen never
--    reads raw rows, so no personal data reaches the public client (§4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_counts (
  campaign_id UUID PRIMARY KEY REFERENCES public.sw_campaigns(id) ON DELETE CASCADE,
  total_souls INTEGER NOT NULL DEFAULT 0,
  tongues_count INTEGER NOT NULL DEFAULT 0,
  church_count INTEGER NOT NULL DEFAULT 0,
  pending_duplicates INTEGER NOT NULL DEFAULT 0,
  -- The celebration on the counter page names the soul, so the FIRST NAME ONLY
  -- rides along on the aggregate. The public page therefore never needs read
  -- access to sw_soul_entries — no surname, no phone, no location leaves the
  -- admin boundary. last_entry_id changes on every insert so the page can tell
  -- two souls with the same first name apart.
  last_soul_name TEXT,
  last_entry_id UUID,
  -- The counter page's "recently won" strip: the last few FIRST NAMES, newest
  -- first. Kept here so a page opened mid-event has something to show
  -- immediately, without ever querying sw_soul_entries.
  recent_names TEXT[] NOT NULL DEFAULT '{}',
  last_photo_path TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sw_counts ADD COLUMN IF NOT EXISTS last_soul_name TEXT;
ALTER TABLE public.sw_counts ADD COLUMN IF NOT EXISTS last_entry_id UUID;
ALTER TABLE public.sw_counts ADD COLUMN IF NOT EXISTS recent_names TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.sw_counts ADD COLUMN IF NOT EXISTS last_photo_path TEXT;

-- Every campaign gets its counts row up front.
CREATE OR REPLACE FUNCTION public.sw_seed_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.sw_counts (campaign_id) VALUES (NEW.id)
  ON CONFLICT (campaign_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sw_campaigns_seed_counts ON public.sw_campaigns;
CREATE TRIGGER sw_campaigns_seed_counts
AFTER INSERT ON public.sw_campaigns
FOR EACH ROW EXECUTE FUNCTION public.sw_seed_counts();


-- ---------------------------------------------------------------------
-- 5. Duplicate detection — runs before every insert, so it works
--    identically for a live save and for an entry synced hours later.
--    "Today" is the campaign's event day in Africa/Accra.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sw_flag_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.duplicate_status <> 'none' THEN
    RETURN NEW;                            -- already decided by an admin / a resync
  END IF;

  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    RETURN NEW;                            -- name alone is too weak a signal to flag on
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sw_soul_entries e
    WHERE e.campaign_id = NEW.campaign_id
      AND e.id <> NEW.id
      AND public.sw_normalize_name(e.soul_name) = public.sw_normalize_name(NEW.soul_name)
      AND public.sw_normalize_phone(e.phone) = public.sw_normalize_phone(NEW.phone)
      AND (e.created_at AT TIME ZONE 'Africa/Accra')::date
          = (NEW.created_at AT TIME ZONE 'Africa/Accra')::date
  ) THEN
    NEW.duplicate_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sw_soul_entries_flag_duplicate ON public.sw_soul_entries;
CREATE TRIGGER sw_soul_entries_flag_duplicate
BEFORE INSERT ON public.sw_soul_entries
FOR EACH ROW EXECUTE FUNCTION public.sw_flag_duplicate();


-- ---------------------------------------------------------------------
-- 6. Count maintenance — deltas only, never a full re-scan, so it stays
--    cheap under a burst of concurrent writes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sw_apply_count_delta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_total INTEGER := 0;
  d_tongues INTEGER := 0;
  d_church INTEGER := 0;
  d_pending INTEGER := 0;
  target UUID := coalesce(NEW.campaign_id, OLD.campaign_id);
  new_name TEXT := NULL;
  new_entry UUID := NULL;
  new_photo TEXT := NULL;
BEGIN
  -- Only a newly counted soul announces itself on the counter page.
  IF TG_OP = 'INSERT' AND NEW.counted THEN
    new_name := split_part(btrim(regexp_replace(NEW.soul_name, '\s+', ' ', 'g')), ' ', 1);
    new_entry := NEW.id;
    new_photo := NEW.photo_path;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.counted THEN
    d_total := d_total + 1;
    d_tongues := d_tongues + NEW.spoke_in_tongues::int;
    d_church := d_church + NEW.coming_to_church::int;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.counted THEN
    d_total := d_total - 1;
    d_tongues := d_tongues - OLD.spoke_in_tongues::int;
    d_church := d_church - OLD.coming_to_church::int;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.duplicate_status = 'pending' THEN
    d_pending := d_pending + 1;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.duplicate_status = 'pending' THEN
    d_pending := d_pending - 1;
  END IF;

  IF d_total = 0 AND d_tongues = 0 AND d_church = 0 AND d_pending = 0 THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Never re-create the counts row here: deleting a campaign cascades to its
    -- entries, and an INSERT from this trigger would leave a counts row
    -- pointing at a campaign that is on its way out.
    UPDATE public.sw_counts SET
      total_souls = total_souls + d_total,
      tongues_count = tongues_count + d_tongues,
      church_count = church_count + d_church,
      pending_duplicates = pending_duplicates + d_pending,
      updated_at = now()
    WHERE campaign_id = target;
  ELSE
    INSERT INTO public.sw_counts AS c (campaign_id, total_souls, tongues_count, church_count,
                                      pending_duplicates, last_soul_name, last_entry_id, recent_names,
                                      last_photo_path)
    VALUES (target, greatest(d_total, 0), greatest(d_tongues, 0), greatest(d_church, 0),
            greatest(d_pending, 0), new_name, new_entry,
            CASE WHEN new_name IS NULL THEN '{}' ELSE ARRAY[new_name] END,
            new_photo)
    ON CONFLICT (campaign_id) DO UPDATE SET
      total_souls = c.total_souls + d_total,
      tongues_count = c.tongues_count + d_tongues,
      church_count = c.church_count + d_church,
      pending_duplicates = c.pending_duplicates + d_pending,
      last_soul_name = coalesce(new_name, c.last_soul_name),
      last_entry_id = coalesce(new_entry, c.last_entry_id),
      last_photo_path = CASE WHEN new_entry IS NULL THEN c.last_photo_path ELSE new_photo END,
      -- newest first, capped at 10
      recent_names = CASE
        WHEN new_name IS NULL THEN c.recent_names
        ELSE (array_prepend(new_name, c.recent_names))[1:10]
      END,
      updated_at = now();
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sw_soul_entries_counts ON public.sw_soul_entries;
CREATE TRIGGER sw_soul_entries_counts
AFTER INSERT OR UPDATE OR DELETE ON public.sw_soul_entries
FOR EACH ROW EXECUTE FUNCTION public.sw_apply_count_delta();

-- Rebuild a campaign's counts from scratch (admin repair hatch).
CREATE OR REPLACE FUNCTION public.sw_recount(p_campaign_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.sw_counts AS c (campaign_id, total_souls, tongues_count, church_count, pending_duplicates, updated_at)
  SELECT p_campaign_id,
         count(*) FILTER (WHERE counted),
         count(*) FILTER (WHERE counted AND spoke_in_tongues),
         count(*) FILTER (WHERE counted AND coming_to_church),
         count(*) FILTER (WHERE duplicate_status = 'pending'),
         now()
  FROM public.sw_soul_entries WHERE campaign_id = p_campaign_id
  ON CONFLICT (campaign_id) DO UPDATE SET
    total_souls = excluded.total_souls,
    tongues_count = excluded.tongues_count,
    church_count = excluded.church_count,
    pending_duplicates = excluded.pending_duplicates,
    updated_at = now();
$$;


-- ---------------------------------------------------------------------
-- 7. sw_sms_config — the number(s) that get the hourly SMS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_sms_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.sw_campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone_number)
);


-- ---------------------------------------------------------------------
-- 8. sw_sms_log — audit trail of what actually went out
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_sms_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.sw_campaigns(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  total_souls INTEGER,
  last_hour_souls INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS sw_sms_log_campaign_sent_idx
  ON public.sw_sms_log (campaign_id, sent_at DESC);


-- =====================================================================
-- 9. Row Level Security
--
--   sw_soul_entries / sw_entrants : public INSERT (volunteers have no
--       login), and SELECT/UPDATE/DELETE for soul-winning admins only.
--   sw_campaigns / sw_counts      : public SELECT (no personal data),
--       admin writes.
--   sw_sms_config / sw_sms_log    : admin only, top to bottom.
-- =====================================================================

ALTER TABLE public.sw_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_entrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_soul_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_sms_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_sms_log ENABLE ROW LEVEL SECURITY;

-- sw_campaigns
DROP POLICY IF EXISTS "Anyone can view campaigns" ON public.sw_campaigns;
CREATE POLICY "Anyone can view campaigns"
ON public.sw_campaigns FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "SW admins can manage campaigns" ON public.sw_campaigns;
CREATE POLICY "SW admins can manage campaigns"
ON public.sw_campaigns FOR ALL
TO authenticated
USING (public.is_sw_admin())
WITH CHECK (public.is_sw_admin());

-- sw_entrants
DROP POLICY IF EXISTS "Anyone can register as an entrant" ON public.sw_entrants;
CREATE POLICY "Anyone can register as an entrant"
ON public.sw_entrants FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "SW admins can manage entrants" ON public.sw_entrants;
CREATE POLICY "SW admins can manage entrants"
ON public.sw_entrants FOR ALL
TO authenticated
USING (public.is_sw_admin())
WITH CHECK (public.is_sw_admin());

-- sw_soul_entries
DROP POLICY IF EXISTS "Anyone can log a soul" ON public.sw_soul_entries;
CREATE POLICY "Anyone can log a soul"
ON public.sw_soul_entries FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "SW admins can manage soul entries" ON public.sw_soul_entries;
CREATE POLICY "SW admins can manage soul entries"
ON public.sw_soul_entries FOR ALL
TO authenticated
USING (public.is_sw_admin())
WITH CHECK (public.is_sw_admin());

-- sw_counts
DROP POLICY IF EXISTS "Anyone can view counts" ON public.sw_counts;
CREATE POLICY "Anyone can view counts"
ON public.sw_counts FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "SW admins can manage counts" ON public.sw_counts;
CREATE POLICY "SW admins can manage counts"
ON public.sw_counts FOR ALL
TO authenticated
USING (public.is_sw_admin())
WITH CHECK (public.is_sw_admin());

-- sw_sms_config
DROP POLICY IF EXISTS "SW admins can manage sms config" ON public.sw_sms_config;
CREATE POLICY "SW admins can manage sms config"
ON public.sw_sms_config FOR ALL
TO authenticated
USING (public.is_sw_admin())
WITH CHECK (public.is_sw_admin());

-- sw_sms_log
DROP POLICY IF EXISTS "SW admins can read sms log" ON public.sw_sms_log;
CREATE POLICY "SW admins can read sms log"
ON public.sw_sms_log FOR SELECT
TO authenticated
USING (public.is_sw_admin());


-- =====================================================================
-- 9b. Admin analytics
--
-- Every function aggregates inside Postgres and is SECURITY DEFINER with an
-- explicit admin check, so the dashboard never pulls thousands of rows into a
-- browser and a non-admin calling one directly gets nothing.
--
-- Hours are hours of the day in Africa/Accra, since this is a single-day event.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sw_require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.is_sw_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Headline numbers for the current filter.
CREATE OR REPLACE FUNCTION public.sw_admin_overview(
  p_campaign_id UUID,
  p_hour_from SMALLINT DEFAULT NULL,
  p_hour_to SMALLINT DEFAULT NULL
)
RETURNS TABLE (
  total_souls BIGINT,
  tongues_count BIGINT,
  church_count BIGINT,
  pending_duplicates BIGINT,
  entrant_count BIGINT,
  group_count BIGINT,
  located_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sw_require_admin();

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE e.counted),
    count(*) FILTER (WHERE e.counted AND e.spoke_in_tongues),
    count(*) FILTER (WHERE e.counted AND e.coming_to_church),
    count(*) FILTER (WHERE e.duplicate_status = 'pending'),
    count(DISTINCT e.entrant_id) FILTER (WHERE e.counted),
    count(DISTINCT e.group_id) FILTER (WHERE e.counted),
    count(*) FILTER (WHERE e.counted AND e.latitude IS NOT NULL)
  FROM public.sw_soul_entries e
  WHERE e.campaign_id = p_campaign_id
    AND (p_hour_from IS NULL OR
         extract(hour FROM e.created_at AT TIME ZONE 'Africa/Accra') >= p_hour_from)
    AND (p_hour_to IS NULL OR
         extract(hour FROM e.created_at AT TIME ZONE 'Africa/Accra') <= p_hour_to);
END;
$$;

-- Rankings by fellowship, PFCC or individual entrant, with the secondary
-- rates the plan asks for alongside the raw count.
CREATE OR REPLACE FUNCTION public.sw_leaderboard(
  p_campaign_id UUID,
  p_dimension TEXT,
  p_hour_from SMALLINT DEFAULT NULL,
  p_hour_to SMALLINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  label TEXT,
  sublabel TEXT,
  souls BIGINT,
  tongues BIGINT,
  church BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sw_require_admin();

  IF p_dimension NOT IN ('fellowship', 'pfcc', 'entrant') THEN
    RAISE EXCEPTION 'unknown dimension %', p_dimension;
  END IF;

  RETURN QUERY
  SELECT
    CASE p_dimension
      WHEN 'fellowship' THEN coalesce(nullif(btrim(n.fellowship), ''), 'Not given')
      WHEN 'pfcc' THEN coalesce(nullif(btrim(n.pfcc), ''), 'Not given')
      ELSE n.name
    END AS label,
    CASE p_dimension
      WHEN 'entrant' THEN nullif(btrim(concat_ws(' · ', nullif(btrim(n.fellowship), ''),
                                                       nullif(btrim(n.pfcc), ''))), '')
      ELSE NULL
    END AS sublabel,
    count(*) AS souls,
    count(*) FILTER (WHERE e.spoke_in_tongues) AS tongues,
    count(*) FILTER (WHERE e.coming_to_church) AS church
  FROM public.sw_soul_entries e
  JOIN public.sw_entrants n ON n.id = e.entrant_id
  WHERE e.campaign_id = p_campaign_id
    AND e.counted
    AND (p_hour_from IS NULL OR
         extract(hour FROM e.created_at AT TIME ZONE 'Africa/Accra') >= p_hour_from)
    AND (p_hour_to IS NULL OR
         extract(hour FROM e.created_at AT TIME ZONE 'Africa/Accra') <= p_hour_to)
  GROUP BY 1, 2
  ORDER BY souls DESC, label
  LIMIT p_limit;
END;
$$;

-- Souls per hour of the day, with the running total and the rates over time.
CREATE OR REPLACE FUNCTION public.sw_hourly_stats(p_campaign_id UUID)
RETURNS TABLE (
  hour SMALLINT,
  souls BIGINT,
  tongues BIGINT,
  church BIGINT,
  cumulative BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sw_require_admin();

  RETURN QUERY
  WITH hours AS (SELECT generate_series(0, 23)::smallint AS hour),
  counted AS (
    SELECT extract(hour FROM e.created_at AT TIME ZONE 'Africa/Accra')::smallint AS hour,
           count(*) AS souls,
           count(*) FILTER (WHERE e.spoke_in_tongues) AS tongues,
           count(*) FILTER (WHERE e.coming_to_church) AS church
    FROM public.sw_soul_entries e
    WHERE e.campaign_id = p_campaign_id AND e.counted
    GROUP BY 1
  )
  SELECT h.hour,
         coalesce(c.souls, 0),
         coalesce(c.tongues, 0),
         coalesce(c.church, 0),
         -- sum() over bigint yields numeric; the column is declared bigint.
         -- The cast wraps the whole window expression, not just sum().
         (sum(coalesce(c.souls, 0)) OVER (ORDER BY h.hour))::bigint
  FROM hours h
  LEFT JOIN counted c ON c.hour = h.hour
  ORDER BY h.hour;
END;
$$;

-- The review queue: each flagged entry paired with the entry it matched.
CREATE OR REPLACE FUNCTION public.sw_duplicate_queue(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  soul_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  entrant_name TEXT,
  original_id UUID,
  original_created_at TIMESTAMPTZ,
  original_entrant_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sw_require_admin();

  RETURN QUERY
  SELECT d.id, d.soul_name, d.phone, d.created_at, dn.name,
         o.id, o.created_at, on_.name
  FROM public.sw_soul_entries d
  JOIN public.sw_entrants dn ON dn.id = d.entrant_id
  LEFT JOIN LATERAL (
    SELECT e.id, e.created_at, e.entrant_id
    FROM public.sw_soul_entries e
    WHERE e.campaign_id = d.campaign_id
      AND e.id <> d.id
      AND e.counted
      AND public.sw_normalize_name(e.soul_name) = public.sw_normalize_name(d.soul_name)
      AND public.sw_normalize_phone(e.phone) = public.sw_normalize_phone(d.phone)
    ORDER BY e.created_at
    LIMIT 1
  ) o ON true
  LEFT JOIN public.sw_entrants on_ ON on_.id = o.entrant_id
  WHERE d.campaign_id = p_campaign_id
    AND d.duplicate_status = 'pending'
  ORDER BY d.created_at;
END;
$$;

-- Map pins. Deliberately returns no soul name or phone: the admin map is a
-- shared screen (plan §10).
CREATE OR REPLACE FUNCTION public.sw_map_points(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  fellowship TEXT,
  entrant_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sw_require_admin();

  RETURN QUERY
  SELECT e.id, e.latitude, e.longitude,
         coalesce(nullif(btrim(n.fellowship), ''), 'Not given'), n.name, e.created_at
  FROM public.sw_soul_entries e
  JOIN public.sw_entrants n ON n.id = e.entrant_id
  WHERE e.campaign_id = p_campaign_id
    AND e.counted
    AND e.latitude IS NOT NULL
    AND e.longitude IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sw_admin_overview(UUID, SMALLINT, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sw_leaderboard(UUID, TEXT, SMALLINT, SMALLINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sw_hourly_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sw_duplicate_queue(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sw_map_points(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sw_admin_overview(UUID, SMALLINT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sw_leaderboard(UUID, TEXT, SMALLINT, SMALLINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sw_hourly_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sw_duplicate_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sw_map_points(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 9c. Storage policies for the sw-photos bucket
--
-- The bucket itself is private and created outside this file. Volunteers are
-- not logged in, so anon may INSERT (upload) but may NOT read: the counter
-- page gets short-lived signed URLs minted server-side instead, so no image
-- ever has a permanent, guessable address.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can upload a soul photo" ON storage.objects;
CREATE POLICY "Anyone can upload a soul photo"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'sw-photos');

DROP POLICY IF EXISTS "SW admins can read soul photos" ON storage.objects;
CREATE POLICY "SW admins can read soul photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sw-photos' AND public.is_sw_admin());

DROP POLICY IF EXISTS "SW admins can remove soul photos" ON storage.objects;
CREATE POLICY "SW admins can remove soul photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sw-photos' AND public.is_sw_admin());


-- ---------------------------------------------------------------------
-- 10. Realtime — the counter page subscribes to sw_counts only
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sw_counts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;


-- ---------------------------------------------------------------------
-- 11. Seed the 1909 campaign
--     Change event_date before running if the date has moved.
-- ---------------------------------------------------------------------
-- Event day runs midnight to midnight, so the SMS window is the full day.
INSERT INTO public.sw_campaigns (name, slug, event_date, active, sms_start_hour, sms_end_hour)
VALUES ('1909 — Sep 2026', '1909', '2026-09-19', true, 0, 23)
ON CONFLICT (slug) DO NOTHING;
