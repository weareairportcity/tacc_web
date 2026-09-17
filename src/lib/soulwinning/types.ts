export type SwCampaign = {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  active: boolean;
  sms_template: string;
  sms_start_hour: number;
  sms_end_hour: number;
  /** Target for the counter's progress bar; null hides it. */
  goal_total: number | null;
  created_at: string;
};

export type SwEntrant = {
  id: string;
  device_id: string;
  name: string;
  fellowship: string | null;
  phone: string | null;
  pfcc: string | null;
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

export type SwCounts = {
  campaign_id: string;
  total_souls: number;
  tongues_count: number;
  church_count: number;
  pending_duplicates: number;
  /** First name only — all the counter page is ever given about a soul. */
  last_soul_name: string | null;
  last_entry_id: string | null;
  /** Last few first names, newest first — the "recently won" strip. */
  recent_names: string[];
  /** Storage path of the newest soul's photo, if one was taken. */
  last_photo_path: string | null;
  updated_at: string;
};

export type SwSmsConfig = {
  id: string;
  campaign_id: string;
  phone_number: string;
  label: string | null;
  enabled: boolean;
  created_at: string;
};
