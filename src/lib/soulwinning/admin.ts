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
  fellowship: string;
  /** Optional so the map still works against an older sw_map_points. */
  pfcc?: string;
  entrant_name: string;
  created_at: string;
};

export type Dimension = "fellowship" | "pfcc" | "entrant";

export type HourFilter = { from: number | null; to: number | null };

export async function fetchCampaigns(): Promise<SwCampaign[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sw_campaigns")
    .select("*")
    .order("event_date", { ascending: false });
  return (data as SwCampaign[]) ?? [];
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

export async function fetchMapPoints(campaignId: string): Promise<MapPoint[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sw_map_points", { p_campaign_id: campaignId });
  if (error) throw error;
  return (data as MapPoint[]) ?? [];
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
