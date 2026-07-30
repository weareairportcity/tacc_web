"use client";

import React, { useState, useMemo } from "react";
import { 
  TrendingUp, Users, Play, Eye, Calendar, 
  BarChart3, Activity, Award, ArrowUpRight, Flame, Layers 
} from "lucide-react";

export type RawAnalyticsEvent = {
  id: string;
  created_at: string;
  song_id: string;
  event_type: "view" | "play";
  visitor_id: string;
};

export type Song = {
  id: string;
  week_label: string;
  title: string;
  artist: string;
  publish_date: string;
  cover_image_url?: string;
  is_published: boolean;
};

type AnalyticsDashboardProps = {
  songs: Song[];
  events: RawAnalyticsEvent[];
};

export default function AnalyticsDashboard({ songs, events }: AnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<"all" | "30d" | "7d" | "today">("all");
  const [selectedSongId, setSelectedSongId] = useState<string>("all");

  // Filter events based on selected time range & song
  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter((ev) => {
      if (selectedSongId !== "all" && ev.song_id !== selectedSongId) {
        return false;
      }

      const evDate = new Date(ev.created_at);
      if (timeRange === "today") {
        return evDate.toDateString() === now.toDateString();
      }
      if (timeRange === "7d") {
        const diff = (now.getTime() - evDate.getTime()) / (1000 * 3600 * 24);
        return diff <= 7;
      }
      if (timeRange === "30d") {
        const diff = (now.getTime() - evDate.getTime()) / (1000 * 3600 * 24);
        return diff <= 30;
      }
      return true;
    });
  }, [events, timeRange, selectedSongId]);

  // Aggregate global metrics
  const metrics = useMemo(() => {
    let viewCount = 0;
    let playCount = 0;
    const viewVisitors = new Set<string>();
    const playListeners = new Set<string>();

    filteredEvents.forEach((ev) => {
      if (ev.event_type === "view") {
        viewCount++;
        viewVisitors.add(ev.visitor_id);
      } else if (ev.event_type === "play") {
        playCount++;
        playListeners.add(ev.visitor_id);
      }
    });

    const uniqueVisitors = viewVisitors.size;
    const uniqueListeners = playListeners.size;
    const conversionRate = uniqueVisitors > 0 ? Math.min(100, Math.round((uniqueListeners / uniqueVisitors) * 100)) : 0;
    const replayFactor = uniqueListeners > 0 ? (playCount / uniqueListeners).toFixed(1) : "0.0";

    return {
      viewCount,
      playCount,
      uniqueVisitors,
      uniqueListeners,
      conversionRate,
      replayFactor,
    };
  }, [filteredEvents]);

  // Per-song breakdown analytics
  const songAnalyticsMap = useMemo(() => {
    const map: Record<
      string,
      {
        views: number;
        visitors: Set<string>;
        plays: number;
        listeners: Set<string>;
        lastActive?: string;
      }
    > = {};

    filteredEvents.forEach((ev) => {
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
        entry.views++;
        entry.visitors.add(ev.visitor_id);
      } else if (ev.event_type === "play") {
        entry.plays++;
        entry.listeners.add(ev.visitor_id);
      }
      entry.lastActive = ev.created_at;
    });

    return map;
  }, [filteredEvents]);

  // Time Series chart data points (last 7 or 14 days)
  const timeSeriesData = useMemo(() => {
    const daysMap: Record<string, { label: string; views: number; plays: number }> = {};
    const daysCount = timeRange === "today" ? 1 : timeRange === "7d" ? 7 : 14;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      daysMap[key] = { label, views: 0, plays: 0 };
    }

    filteredEvents.forEach((ev) => {
      const key = ev.created_at.split("T")[0];
      if (daysMap[key]) {
        if (ev.event_type === "view") daysMap[key].views++;
        if (ev.event_type === "play") daysMap[key].plays++;
      }
    });

    return Object.values(daysMap);
  }, [filteredEvents, timeRange]);

  const maxChartVal = useMemo(() => {
    let max = 5;
    timeSeriesData.forEach((d) => {
      if (d.views > max) max = d.views;
      if (d.plays > max) max = d.plays;
    });
    return max;
  }, [timeSeriesData]);

  return (
    <div className="space-y-8 text-slate-900">
      
      {/* Header Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Executive Analytics Overview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Real-time listener conversion, engagement trends, and weekly performance metrics.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Song Selector */}
          <select
            value={selectedSongId}
            onChange={(e) => setSelectedSongId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">All Songs & Weeks</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.week_label} — {s.title}
              </option>
            ))}
          </select>

          {/* Time Filter Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setTimeRange("all")}
              className={`px-2.5 py-1 rounded-md transition-colors ${timeRange === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"}`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-2.5 py-1 rounded-md transition-colors ${timeRange === "30d" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("7d")}
              className={`px-2.5 py-1 rounded-md transition-colors ${timeRange === "7d" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange("today")}
              className={`px-2.5 py-1 rounded-md transition-colors ${timeRange === "today" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"}`}
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Views */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Lyrics Page Views</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{metrics.viewCount}</div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2 font-medium">
            <span>Unique Visitors</span>
            <span className="font-bold text-slate-900">{metrics.uniqueVisitors}</span>
          </div>
        </div>

        {/* Card 2: Audio Listens */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Audio Listens (5s+)</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Play className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{metrics.playCount}</div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2 font-medium">
            <span>Unique Listeners</span>
            <span className="font-bold text-slate-900">{metrics.uniqueListeners}</span>
          </div>
        </div>

        {/* Card 3: Listener Conversion % */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Listener Conversion</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{metrics.conversionRate}%</div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2 font-medium">
            <span>Visitors who listened</span>
            <span className="font-bold text-emerald-600">High Intent</span>
          </div>
        </div>

        {/* Card 4: Replay Frequency Factor */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Replay Factor</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{metrics.replayFactor}x</div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2 font-medium">
            <span>Avg. plays / listener</span>
            <span className="font-bold text-slate-900">Repeat Worship</span>
          </div>
        </div>

      </div>

      {/* Interactive Time-Series SVG Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Activity Trend Over Time
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Daily comparison of Lyrics Page Views vs. Audio Listens.</p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Views
            </span>
            <span className="flex items-center gap-1.5 text-purple-600">
              <span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" /> Listens
            </span>
          </div>
        </div>

        {/* Custom SVG Bar Chart */}
        <div className="pt-4">
          <div className="h-48 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 pb-6 border-b border-slate-100 relative">
            {timeSeriesData.map((d, idx) => {
              const viewHeightPct = Math.round((d.views / maxChartVal) * 100);
              const playHeightPct = Math.round((d.plays / maxChartVal) * 100);

              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  
                  {/* Tooltip on Hover */}
                  <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] py-1 px-2.5 rounded-lg shadow-xl z-20 whitespace-nowrap pointer-events-none">
                    <div className="font-bold border-b border-slate-700 pb-0.5 mb-0.5">{d.label}</div>
                    <div className="text-blue-300">Views: {d.views}</div>
                    <div className="text-purple-300">Plays: {d.plays}</div>
                  </div>

                  {/* Dual Bar Pair */}
                  <div className="w-full flex items-end justify-center gap-1 h-full">
                    {/* View Bar */}
                    <div 
                      className="w-2.5 sm:w-4 bg-blue-500 rounded-t-sm transition-all duration-300 group-hover:bg-blue-600"
                      style={{ height: `${Math.max(viewHeightPct, 4)}%` }}
                    />
                    {/* Play Bar */}
                    <div 
                      className="w-2.5 sm:w-4 bg-purple-500 rounded-t-sm transition-all duration-300 group-hover:bg-purple-600"
                      style={{ height: `${Math.max(playHeightPct, 4)}%` }}
                    />
                  </div>

                  <span className="absolute -bottom-6 text-[10px] text-slate-400 font-semibold truncate max-w-[40px]">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-Week Performance Comparison Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Weekly Song Analytics Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Individual song conversion rates, listener counts, and performance rankings.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap bg-white">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5 font-bold">Week & Song</th>
                <th className="px-6 py-3.5 font-bold">Page Views</th>
                <th className="px-6 py-3.5 font-bold">Audio Listens</th>
                <th className="px-6 py-3.5 font-bold">Conversion Funnel</th>
                <th className="px-6 py-3.5 font-bold">Replay Index</th>
                <th className="px-6 py-3.5 font-bold text-right">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {songs.map((song) => {
                const sStats = songAnalyticsMap[song.id] || { views: 0, visitors: new Set(), plays: 0, listeners: new Set() };
                const sViews = sStats.views;
                const sVisitors = sStats.visitors.size;
                const sPlays = sStats.plays;
                const sListeners = sStats.listeners.size;
                const sConversion = sVisitors > 0 ? Math.min(100, Math.round((sListeners / sVisitors) * 100)) : 0;
                const sReplay = sListeners > 0 ? (sPlays / sListeners).toFixed(1) : "0.0";

                return (
                  <tr key={song.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-slate-100 rounded text-slate-700 text-xs font-bold uppercase">
                          {song.week_label}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{song.title}</div>
                          <div className="text-xs text-slate-400">by {song.artist}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">{sViews}</div>
                      <div className="text-xs text-slate-400">{sVisitors} unique visitors</div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-purple-700 text-sm">{sPlays}</div>
                      <div className="text-xs text-slate-400">{sListeners} unique listeners</div>
                    </td>

                    <td className="px-6 py-4 min-w-[180px]">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>{sConversion}% rate</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${sConversion}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono font-bold text-xs text-slate-800">
                      {sReplay}x
                    </td>

                    <td className="px-6 py-4 text-right">
                      {sConversion >= 50 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          🔥 High Worship
                        </span>
                      ) : sConversion > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold">
                          📈 Growing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                          No Activity
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
