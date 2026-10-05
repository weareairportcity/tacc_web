export type SwCampaign = {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  /** Logging and the live counter run between these (ISO, UTC = Accra). */
  opens_at: string;
  closes_at: string;
  /** Target for the counter's progress bar; null hides it. */
  goal_total: number | null;
  /** Souls each member aims for (Grace in Continuity: 7). */
  target_per_member?: number;
};

/** Admin-only campaign settings. */
export type SwCampaignSettings = SwCampaign & {
  target_per_member?: number;
  sms_template: string;
  sms_start_hour: number;
  sms_end_hour: number;
};

export type SwEntrant = {
  id: string;
  device_id: string;
  name: string;
  fellowship: string | null;
  phone: string | null;
  pfcc: string | null;
  login_code: string | null;
  created_at: string;
};

export type SwDuplicateStatus = "none" | "pending" | "unique" | "merged";

export type SwSoulEntry = {
  id: string;
  campaign_id: string;
  entrant_id: string;
  group_id: string;
  soul_name: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  duplicate_status: SwDuplicateStatus;
  duplicate_of: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  counted: boolean;
  created_at: string;
  synced_at: string;
};

/** What the public counter is given: aggregates and first names only. */
export type SwCounts = {
  total_souls: number;
  tongues_count: number;
  church_count: number;
  /** First name only — all the counter page is ever given about a soul. */
  last_soul_name: string | null;
  last_entry_id: string | null;
  /** Last few first names, newest first — the "recently won" strip. */
  recent_names: string[];
  /** Signed link to the newest soul's photo, if one was taken. */
  last_photo: string | null;
  /** Signed thumbnail links for the marquee, newest first. */
  recent_photos: string[];
  updated_at: string;
};

export type SwLeaderboard = {
  target: number;
  members: { name: string; pfcc: string; souls: number }[];
  pfccs: { pfcc: string; souls: number; members: number }[];
  /** Missing only on a leaderboard cached before fellowships were added. */
  fellowships?: { fellowship: string; souls: number; members: number }[];
  /** Everyone who reached the target, in the order they reached it. */
  completed: { name: string; pfcc: string; souls: number; reached_at: string }[];
  computed_at: string;
};

export type SwLive = {
  campaign: SwCampaign;
  counts: SwCounts | null;
  leaderboard?: SwLeaderboard;
  server_time: string;
};

export type SwSmsConfig = {
  id: string;
  campaign_id: string;
  phone_number: string;
  label: string | null;
  enabled: boolean;
  created_at: string;
};
