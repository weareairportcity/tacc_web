import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Film = {
  id: string;
  title: string;
  director: string;
  group: string;
  added_at: number;
};

export type Vote = {
  film_id: string;
  session_id: string;
  acting: number;
  concept: number;
  quality: number;
  total: number;
  created_at: number;
};

// ─── Films ───────────────────────────────────────────────────────────────────

export async function getFilms(): Promise<Film[]> {
  const { data } = await supabase
    .from("vote_films")
    .select("*")
    .order("added_at", { ascending: true });
  return data || [];
}

export async function saveFilm(film: Film) {
  await supabase.from("vote_films").upsert(film);
}

export async function deleteFilm(id: string) {
  await supabase.from("vote_films").delete().eq("id", id);
}

// ─── Active Groups ────────────────────────────────────────────────────────────

export async function getActiveGroups(): Promise<string[]> {
  const { data } = await supabase.from("vote_active_groups").select("group_name");
  return (data || []).map((r: { group_name: string }) => r.group_name);
}

export async function saveActiveGroups(groups: string[]) {
  await supabase.from("vote_active_groups").delete().neq("group_name", "");
  if (groups.length > 0) {
    await supabase
      .from("vote_active_groups")
      .insert(groups.map((g) => ({ group_name: g })));
  }
}

// ─── Weekly Codes (one per group) ─────────────────────────────────────────────

export async function getWeeklyCodes(): Promise<Record<string, string>> {
  const { data } = await supabase.from("vote_weekly_codes").select("*");
  if (!data) return {};
  return Object.fromEntries(
    data.map((r: { group_name: string; code: string }) => [r.group_name, r.code])
  );
}

export async function setWeeklyCode(groupName: string, code: string) {
  await supabase
    .from("vote_weekly_codes")
    .upsert({ group_name: groupName, code: code.toUpperCase() });
}

export async function getGroupForCode(code: string): Promise<string | null> {
  const { data } = await supabase
    .from("vote_weekly_codes")
    .select("group_name")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data?.group_name || null;
}

// ─── Session Tracking (one vote per device per film) ──────────────────────────

export async function getSessionVotedFilms(sessionId: string): Promise<string[]> {
  const { data } = await supabase
    .from("vote_sessions")
    .select("film_id")
    .eq("session_id", sessionId);
  return (data || []).map((r: { film_id: string }) => r.film_id);
}

export async function hasSessionVotedForFilm(
  sessionId: string,
  filmId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("vote_sessions")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("film_id", filmId)
    .maybeSingle();
  return !!data;
}

export async function recordSessionVote(sessionId: string, filmId: string) {
  await supabase.from("vote_sessions").insert({ session_id: sessionId, film_id: filmId });
}

// ─── Votes ────────────────────────────────────────────────────────────────────

export async function getVotes(): Promise<Record<string, Vote[]>> {
  const { data } = await supabase.from("vote_votes").select("*");
  if (!data) return {};
  const result: Record<string, Vote[]> = {};
  for (const row of data) {
    if (!result[row.film_id]) result[row.film_id] = [];
    result[row.film_id].push(row);
  }
  return result;
}

export async function addVote(vote: Vote) {
  await supabase.from("vote_votes").insert(vote);
}

// ─── Admin Password ───────────────────────────────────────────────────────────

export async function getAdminPassword(): Promise<string> {
  const { data } = await supabase
    .from("vote_settings")
    .select("value")
    .eq("key", "adminPassword")
    .single();
  return data?.value || process.env.VOTE_ADMIN_PASSWORD || "admin123";
}
