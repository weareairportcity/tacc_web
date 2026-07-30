import { supabaseAdmin } from "./supabase";

export type SongAnalytics = {
  song_id: string;
  total_views: number;
  unique_visitors: number;
  total_plays: number;
  unique_listeners: number;
  engagement_rate: number; // percentage of unique visitors who played audio
};

export async function getSongAnalytics(songId?: string): Promise<Record<string, SongAnalytics>> {
  let query = supabaseAdmin.from("sotw_analytics_events").select("*");

  if (songId) {
    query = query.eq("song_id", songId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Error fetching analytics events:", error.message);
    return {};
  }

  const events = data || [];
  const map: Record<string, {
    views: number;
    visitors: Set<string>;
    plays: number;
    listeners: Set<string>;
  }> = {};

  for (const ev of events) {
    if (!map[ev.song_id]) {
      map[ev.song_id] = {
        views: 0,
        visitors: new Set(),
        plays: 0,
        listeners: new Set(),
      };
    }

    const entry = map[ev.song_id];
    if (ev.event_type === "view") {
      entry.views += 1;
      entry.visitors.add(ev.visitor_id);
    } else if (ev.event_type === "play") {
      entry.plays += 1;
      entry.listeners.add(ev.visitor_id);
    }
  }

  const result: Record<string, SongAnalytics> = {};

  for (const [id, stats] of Object.entries(map)) {
    const totalViews = stats.views;
    const uniqueVisitors = stats.visitors.size;
    const totalPlays = stats.plays;
    const uniqueListeners = stats.listeners.size;
    const engagementRate = uniqueVisitors > 0 ? Math.min(100, Math.round((uniqueListeners / uniqueVisitors) * 100)) : 0;

    result[id] = {
      song_id: id,
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      total_plays: totalPlays,
      unique_listeners: uniqueListeners,
      engagement_rate: engagementRate,
    };
  }

  return result;
}
