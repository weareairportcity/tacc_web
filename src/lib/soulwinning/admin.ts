"use client";

import { createClient } from "@/utils/supabase/client";
import type { SwCampaign, SwSmsConfig } from "./types";

/**
 * Admin data access.
 *
 * Every aggregate goes through a Postgres function rather than pulling rows
 * into the browser — at thousands of entries, counting client-side is both slow
 * and needlessly exposes personal data. The raw-entry query is the one
 * exception, and it exists only to build the CSV export.
 */

export type Overview = {
  total_souls: number;
  tongues_count: number;
  church_count: number;
  pending_duplicates: number;
  entrant_count: number;
  group_count: number;
  located_count: number;
};

export type LeaderboardRow = {
  label: string;
  sublabel: string | null;
  souls: number;
  tongues: number;
  church: number;
};

export type HourlyRow = {
  hour: number;
  souls: number;
  tongues: number;
  church: number;
  cumulative: number;
};

export type DuplicateRow = {
  id: string;
  soul_name: string;
  phone: string | null;
  created_at: string;
  entrant_name: string;
  original_id: string | null;
  original_created_at: string | null;
  original_entrant_name: string | null;
};

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  soul_name: string;
  phone: string | null;
  photo_path: string | null;
  fellowship: string;
  pfcc?: string;
  entrant_name: string;
  spoke_in_tongues?: boolean;
  coming_to_church?: boolean;
  created_at: string;
  group_id?: string | null;
  /** 1 for a person; N when a class was saved as one group. */
  souls?: number;
  tongues?: number;
  church?: number;
};

export type Dimension = "fellowship" | "pfcc" | "entrant";

export type HourFilter = { from: number | null; to: number | null };

export async function fetchCampaigns(): Promise<SwCampaign[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sw_campaigns")
    .select("*")
    .order("event_date", { ascending: false });
  return ((data as SwCampaign[]) ?? []).map((row) =>
    row.slug === "1909" ? { ...row, goal_total: 1909 } : row
  );
}

export async function fetchOverview(campaignId: string, hours: HourFilter): Promise<Overview | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sw_admin_overview", {
    p_campaign_id: campaignId,
    p_hour_from: hours.from,
    p_hour_to: hours.to,
  });
  if (error) throw error;
  return (data as Overview[])?.[0] ?? null;
}

export async function fetchLeaderboard(
  campaignId: string,
  dimension: Dimension,
  hours: HourFilter,
  limit = 25
): Promise<LeaderboardRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sw_leaderboard", {
    p_campaign_id: campaignId,
    p_dimension: dimension,
    p_hour_from: hours.from,
    p_hour_to: hours.to,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as LeaderboardRow[]) ?? [];
}

export async function fetchHourly(campaignId: string): Promise<HourlyRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sw_hourly_stats", { p_campaign_id: campaignId });
  if (error) throw error;
  return (data as HourlyRow[]) ?? [];
}

export async function fetchDuplicates(campaignId: string): Promise<DuplicateRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sw_duplicate_queue", { p_campaign_id: campaignId });
  if (error) throw error;
  return (data as DuplicateRow[]) ?? [];
}

export async function fetchMapPoints(campaignId: string): Promise<{ points: MapPoint[]; totalSouls: number }> {
  const supabase = createClient();
  const located = supabase
    .from("sw_soul_entries")
    .select(
      "id, soul_name, phone, photo_path, latitude, longitude, spoke_in_tongues, coming_to_church, created_at, group_id, sw_entrants(name, fellowship, pfcc)"
    )
    .eq("campaign_id", campaignId)
    .eq("counted", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(5000);

  const counted = supabase
    .from("sw_soul_entries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("counted", true);

  const [{ data, error }, { count, error: countError }] = await Promise.all([located, counted]);

  if (error) throw error;
  if (countError) throw countError;

  type Raw = {
    id: string;
    soul_name: string;
    phone: string | null;
    photo_path: string | null;
    latitude: number;
    longitude: number;
    spoke_in_tongues: boolean;
    coming_to_church: boolean;
    created_at: string;
    group_id: string | null;
    sw_entrants: { name: string; fellowship: string | null; pfcc: string | null } | null;
  };

  const mapped: MapPoint[] = ((data as unknown as Raw[]) ?? []).map((row) => ({
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    soul_name: row.soul_name,
    phone: row.phone,
    photo_path: row.photo_path,
    fellowship: row.sw_entrants?.fellowship?.trim() || "Not given",
    pfcc: row.sw_entrants?.pfcc?.trim() || "Not given",
    entrant_name: row.sw_entrants?.name ?? "—",
    spoke_in_tongues: row.spoke_in_tongues,
    coming_to_church: row.coming_to_church,
    created_at: row.created_at,
    group_id: row.group_id,
    souls: 1,
    tongues: row.spoke_in_tongues ? 1 : 0,
    church: row.coming_to_church ? 1 : 0,
  }));

  const points = collapseMapPoints(mapped);
  return { points, totalSouls: count ?? points.reduce((sum, point) => sum + (point.souls ?? 1), 0) };
}

/** One pin per class — 75 identical GPS points must not spider into a flower. */
export function collapseMapPoints(points: MapPoint[]): MapPoint[] {
  const grouped = new Map<string, MapPoint[]>();
  const singles: MapPoint[] = [];

  for (const point of points) {
    if (point.group_id) {
      const list = grouped.get(point.group_id) ?? [];
      list.push(point);
      grouped.set(point.group_id, list);
    } else {
      singles.push(point);
    }
  }

  const collapsed: MapPoint[] = [...singles];

  for (const members of grouped.values()) {
    const sameName = members.every((item) => item.soul_name === members[0].soul_name);
    if (sameName && members.length > 1) {
      const lead = members.find((item) => item.photo_path) ?? members.find((item) => item.phone) ?? members[0];
      collapsed.push({
        ...lead,
        souls: members.length,
        tongues: members.filter((item) => item.spoke_in_tongues).length,
        church: members.filter((item) => item.coming_to_church).length,
        spoke_in_tongues: members.some((item) => item.spoke_in_tongues),
        coming_to_church: members.some((item) => item.coming_to_church),
      });
    } else {
      collapsed.push(...members);
    }
  }

  return collapsed;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permanently wipe every soul for a campaign: rows, photos, and the public
 * counter. Members are left in place so phones do not have to onboard again.
 * Already-synced devices will not re-upload; unsynced phones still might.
 */
export async function clearCampaignEntries(campaignId: string): Promise<number> {
  if (!UUID.test(campaignId)) throw new Error("Invalid campaign");

  const supabase = createClient();

  const { count, error: countError } = await supabase
    .from("sw_soul_entries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (countError) throw countError;

  const { data: photoRows, error: photoError } = await supabase
    .from("sw_soul_entries")
    .select("photo_path")
    .eq("campaign_id", campaignId)
    .not("photo_path", "is", null);
  if (photoError) throw photoError;

  const paths = new Set(
    (photoRows ?? [])
      .map((row) => row.photo_path)
      .filter((path): path is string => Boolean(path))
  );

  for (let offset = 0; ; offset += 1000) {
    const { data: files, error: listError } = await supabase.storage
      .from("sw-photos")
      .list(campaignId, { limit: 1000, offset });
    if (listError || !files || files.length === 0) break;
    for (const file of files) {
      if (file.name) paths.add(`${campaignId}/${file.name}`);
    }
    if (files.length < 1000) break;
  }

  const { error: unlinkError } = await supabase
    .from("sw_soul_entries")
    .update({ duplicate_of: null })
    .eq("campaign_id", campaignId);
  if (unlinkError) throw unlinkError;

  const { error: deleteError } = await supabase
    .from("sw_soul_entries")
    .delete()
    .eq("campaign_id", campaignId);
  if (deleteError) throw deleteError;

  const { error: resetError } = await supabase
    .from("sw_counts")
    .update({
      total_souls: 0,
      tongues_count: 0,
      church_count: 0,
      pending_duplicates: 0,
      last_soul_name: null,
      last_entry_id: null,
      recent_names: [],
      last_photo_path: null,
      recent_photo_paths: [],
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId);
  if (resetError) throw resetError;

  const list = [...paths];
  for (let i = 0; i < list.length; i += 100) {
    const { error: removeError } = await supabase.storage.from("sw-photos").remove(list.slice(i, i + 100));
    if (removeError) throw removeError;
  }

  return count ?? 0;
}

const DELETE_CHUNK = 100;

/** Remove specific souls. Relies on admin RLS; the hall counter trigger runs on DELETE. */
export async function deleteSoulEntries(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (unique.length === 0) return 0;

  const supabase = createClient();
  const paths = new Set<string>();

  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const batch = unique.slice(i, i + DELETE_CHUNK);
    const { data, error } = await supabase
      .from("sw_soul_entries")
      .select("photo_path")
      .in("id", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.photo_path) paths.add(row.photo_path);
    }
  }

  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const batch = unique.slice(i, i + DELETE_CHUNK);
    const { error } = await supabase
      .from("sw_soul_entries")
      .update({ duplicate_of: null })
      .in("duplicate_of", batch);
    if (error) throw error;
  }

  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const batch = unique.slice(i, i + DELETE_CHUNK);
    const { error } = await supabase.from("sw_soul_entries").delete().in("id", batch);
    if (error) throw error;
  }

  const list = [...paths];
  for (let i = 0; i < list.length; i += DELETE_CHUNK) {
    const { error } = await supabase.storage.from("sw-photos").remove(list.slice(i, i + DELETE_CHUNK));
    if (error) throw error;
  }

  return unique.length;
}

/** Confirm a flagged entry as a real, separate soul, or fold it into the original. */
export async function resolveDuplicate(id: string, status: "unique" | "merged"): Promise<void> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sw_soul_entries")
    .update({
      duplicate_status: status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.user?.id ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

// ─── SMS configuration ────────────────────────────────────────────────

export async function fetchSmsConfig(campaignId: string): Promise<SwSmsConfig[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sw_sms_config")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at");
  return (data as SwSmsConfig[]) ?? [];
}

export async function addSmsRecipient(campaignId: string, phone: string, label: string) {
  const supabase = createClient();
  const { error } = await supabase.from("sw_sms_config").insert({
    campaign_id: campaignId,
    phone_number: phone.trim(),
    label: label.trim() || null,
  });
  if (error) throw error;
}

export async function setSmsRecipientEnabled(id: string, enabled: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("sw_sms_config").update({ enabled }).eq("id", id);
  if (error) throw error;
}

export async function removeSmsRecipient(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("sw_sms_config").delete().eq("id", id);
  if (error) throw error;
}

export async function updateCampaignSettings(
  campaignId: string,
  patch: Partial<Pick<SwCampaign, "sms_template" | "sms_start_hour" | "sms_end_hour" | "goal_total">>
) {
  const supabase = createClient();
  const { error } = await supabase.from("sw_campaigns").update(patch).eq("id", campaignId);
  if (error) throw error;
}

// ─── CSV export ───────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (cell: string | number | null) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Raw entries, names and phone numbers included — admin-only by RLS. */
export async function exportRawEntries(campaignId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sw_soul_entries")
    .select(
      "id, soul_name, phone, spoke_in_tongues, coming_to_church, latitude, longitude, duplicate_status, counted, created_at, synced_at, group_id, sw_entrants(name, fellowship, pfcc, phone)"
    )
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (error) throw error;

  type Row = {
    id: string;
    soul_name: string;
    phone: string | null;
    spoke_in_tongues: boolean;
    coming_to_church: boolean;
    latitude: number | null;
    longitude: number | null;
    duplicate_status: string;
    counted: boolean;
    created_at: string;
    synced_at: string;
    group_id: string;
    sw_entrants: { name: string; fellowship: string | null; pfcc: string | null; phone: string | null } | null;
  };

  return toCsv(
    [
      "entry_id",
      "soul_name",
      "soul_phone",
      "spoke_in_tongues",
      "coming_to_church",
      "latitude",
      "longitude",
      "duplicate_status",
      "counted",
      "logged_at",
      "synced_at",
      "group_id",
      "entrant_name",
      "entrant_fellowship",
      "entrant_pfcc",
      "entrant_phone",
    ],
    ((data as unknown as Row[]) ?? []).map((row) => [
      row.id,
      row.soul_name,
      row.phone,
      row.spoke_in_tongues ? "yes" : "no",
      row.coming_to_church ? "yes" : "no",
      row.latitude,
      row.longitude,
      row.duplicate_status,
      row.counted ? "yes" : "no",
      row.created_at,
      row.synced_at,
      row.group_id,
      row.sw_entrants?.name ?? "",
      row.sw_entrants?.fellowship ?? "",
      row.sw_entrants?.pfcc ?? "",
      row.sw_entrants?.phone ?? "",
    ])
  );
}

/** Aggregate rankings — no personal data about the souls themselves. */
export function rankingsCsv(dimension: Dimension, rows: LeaderboardRow[]): string {
  return toCsv(
    ["rank", dimension, "detail", "souls", "spoke_in_tongues", "tongues_pct", "coming_to_church", "church_pct"],
    rows.map((row, index) => [
      index + 1,
      row.label,
      row.sublabel ?? "",
      row.souls,
      row.tongues,
      row.souls ? Math.round((row.tongues / row.souls) * 100) : 0,
      row.church,
      row.souls ? Math.round((row.church / row.souls) * 100) : 0,
    ])
  );
}
