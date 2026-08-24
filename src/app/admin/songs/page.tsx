"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Plus, Edit, Trash2, Loader2,
  Music, Eye, EyeOff, Save, X,
  Link2, Upload, CheckCircle2, AlertCircle,
  Play, Pause, RotateCcw, LogOut,
} from "lucide-react";
import Image from "next/image";

import AnalyticsDashboard, { RawAnalyticsEvent } from "./AnalyticsDashboard";
import { BarChart3 } from "lucide-react";

type Song = {
  id: string;
  created_at?: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  lyrics: string;
  audio_url: string;
  cover_image_url: string;
  is_published: boolean;
};

const DEFAULT_SONG_FORM = {
  week_label: "",
  publish_date: new Date().toISOString().split("T")[0],
  title: "",
  artist: "",
  lyrics: "",
  audio_url: "",
  cover_image_url: "",
  is_published: true,
};

type UploadMode = "auto" | "manual";

type FetchStep = {
  label: string;
  status: "pending" | "loading" | "done" | "error";
};

export default function AdminSongs() {
  const router = useRouter();
  const supabase = createClient();

  const [songs, setSongs] = useState<Song[]>([]);
  const [rawEvents, setRawEvents] = useState<RawAnalyticsEvent[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<
    Record<string, { views: number; visitors: number; plays: number; listeners: number; repeats: number; repeaters: number }>
  >({});
  const [activeTab, setActiveTab] = useState<"catalog" | "analytics">("catalog");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [formData, setFormData] = useState(DEFAULT_SONG_FORM);
  const [uploadMode, setUploadMode] = useState<UploadMode>("auto");

  // Auto-fetch state
  const [fetchUrl, setFetchUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchSteps, setFetchSteps] = useState<FetchStep[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [showReview, setShowReview] = useState(false);

  // Audio preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // File upload state
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/admin/login");
          return;
        }

        // Check role — redirect bookings-only admins
        const { data: roleData } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (roleData?.role === "bookings") {
          router.push("/admin");
          return;
        }

        await fetchSongs();
      } catch (err: any) {
        setError("Authentication error: " + err.message);
        setIsLoading(false);
      }
    }
    checkAuth();

    const interval = setInterval(() => {
      fetchSongs(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [supabase, router]);

  async function fetchSongs(isBackground = false) {
    if (!isBackground) setIsLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("sotw_songs")
        .select("*")
        .order("publish_date", { ascending: false });

      if (fetchError) throw fetchError;
      setSongs(data || []);

      let allEventsData: RawAnalyticsEvent[] = [];
      let pageIndex = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: eventsError } = await supabase
          .from("sotw_analytics_events")
          .select("id, created_at, song_id, event_type, visitor_id")
          .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

        if (eventsError || !chunk || chunk.length === 0) {
          hasMore = false;
        } else {
          allEventsData = allEventsData.concat(chunk as RawAnalyticsEvent[]);
          if (chunk.length < pageSize) {
            hasMore = false;
          } else {
            pageIndex++;
          }
        }
      }

      setRawEvents(allEventsData);
      const stats: Record<string, { views: number; visitors: Set<string>; plays: number; listeners: Set<string>; repeats: number; repeaters: Set<string> }> = {};
      allEventsData.forEach((ev: any) => {
        if (!stats[ev.song_id]) {
          stats[ev.song_id] = { views: 0, visitors: new Set(), plays: 0, listeners: new Set(), repeats: 0, repeaters: new Set() };
        }
        if (ev.event_type === "view") {
          stats[ev.song_id].views += 1;
          stats[ev.song_id].visitors.add(ev.visitor_id);
        } else if (ev.event_type === "play") {
          stats[ev.song_id].plays += 1;
          stats[ev.song_id].listeners.add(ev.visitor_id);
        } else if (ev.event_type === "repeat") {
          stats[ev.song_id].repeats += 1;
          stats[ev.song_id].repeaters.add(ev.visitor_id);
        }
      });

      const formatted: Record<string, { views: number; visitors: number; plays: number; listeners: number; repeats: number; repeaters: number }> = {};
      Object.keys(stats).forEach((sid) => {
        formatted[sid] = {
          views: stats[sid].views,
          visitors: stats[sid].visitors.size,
          plays: stats[sid].plays,
          listeners: stats[sid].listeners.size,
          repeats: stats[sid].repeats,
          repeaters: stats[sid].repeaters.size,
        };
      });
      setAnalyticsMap(formatted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Modal Handlers ────────────────────────────────────────────

  const resetModal = useCallback(() => {
    setEditingSong(null);
    setFormData({ ...DEFAULT_SONG_FORM, publish_date: new Date().toISOString().split("T")[0] });
    setUploadMode("auto");
    setFetchUrl("");
    setIsFetching(false);
    setFetchSteps([]);
    setFetchError("");
    setShowReview(false);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const handleOpenAddModal = () => {
    resetModal();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (song: Song) => {
    resetModal();
    setEditingSong(song);
    setFormData({
      week_label: song.week_label,
      publish_date: song.publish_date,
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
      audio_url: song.audio_url || "",
      cover_image_url: song.cover_image_url || "",
      is_published: song.is_published,
    });
    setUploadMode("manual");
    setShowReview(true);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetModal();
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  // ─── Auto-Fetch ────────────────────────────────────────────────

  const handleAutoFetch = async () => {
    if (!fetchUrl || !fetchUrl.includes("loveworldlyrics.com")) {
      setFetchError("Please paste a valid loveworldlyrics.com URL");
      return;
    }

    setIsFetching(true);
    setFetchError("");
    setFetchSteps([
      { label: "Scraping song page...", status: "loading" },
      { label: "Extracting lyrics & audio...", status: "pending" },
      { label: "Searching album artwork on iTunes...", status: "pending" },
      { label: "Uploading files to storage...", status: "pending" },
    ]);

    try {
      // Simulate step progression for visual feedback
      await new Promise((r) => setTimeout(r, 600));
      setFetchSteps((prev) => [
        { ...prev[0], status: "done" },
        { ...prev[1], status: "loading" },
        prev[2],
        prev[3],
      ]);

      await new Promise((r) => setTimeout(r, 400));
      setFetchSteps((prev) => [
        prev[0],
        { ...prev[1], status: "done" },
        { ...prev[2], status: "loading" },
        prev[3],
      ]);

      // Actually call the API
      const res = await fetch("/api/sotw/fetch-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fetchUrl }),
      });

      setFetchSteps((prev) => [
        prev[0],
        prev[1],
        { ...prev[2], status: "done" },
        { ...prev[3], status: "loading" },
      ]);

      await new Promise((r) => setTimeout(r, 300));

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch song");
      }

      const data = await res.json();

      setFetchSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));

      setFormData((prev) => ({
        ...prev,
        title: data.title || "",
        artist: data.artist || "",
        lyrics: data.lyrics || "",
        audio_url: data.audio_url || "",
        cover_image_url: data.cover_image_url || "",
      }));

      await new Promise((r) => setTimeout(r, 500));
      setShowReview(true);
    } catch (err: any) {
      setFetchError(err.message || "Failed to fetch song data");
      setFetchSteps((prev) =>
        prev.map((s) =>
          s.status === "loading" ? { ...s, status: "error" as const } : s
        )
      );
    } finally {
      setIsFetching(false);
    }
  };

  // ─── File Uploads ──────────────────────────────────────────────

  const handleFileUpload = async (
    file: File,
    type: "audio" | "cover"
  ) => {
    const setUploading = type === "audio" ? setIsUploadingAudio : setIsUploadingCover;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", formData.title || "song-upload");

      const res = await fetch("/api/sotw/upload-media", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      const field = type === "audio" ? "audio_url" : "cover_image_url";
      setFormData((prev) => ({ ...prev, [field]: url }));
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, "audio");
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, "cover");
  };

  // ─── Audio Preview ─────────────────────────────────────────────

  const toggleAudioPreview = () => {
    if (!formData.audio_url) return;

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      const audio = new Audio(formData.audio_url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  };

  // ─── Submit ────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.week_label || !formData.title || !formData.artist || !formData.lyrics) {
      alert("Please fill in all required fields (Week, Title, Artist, Lyrics)");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        ...(editingSong ? { id: editingSong.id } : {}),
      };

      const { error: saveError } = await supabase
        .from("sotw_songs")
        .upsert(payload);

      if (saveError) throw saveError;

      handleCloseModal();
      await fetchSongs();
    } catch (err: any) {
      alert("Failed to save song: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete the song "${title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from("sotw_songs")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;
      await fetchSongs();
    } catch (err: any) {
      alert("Failed to delete song: " + err.message);
    }
  };

  const handleTogglePublish = async (song: Song) => {
    try {
      const { error: updateError } = await supabase
        .from("sotw_songs")
        .update({ is_published: !song.is_published })
        .eq("id", song.id);

      if (updateError) throw updateError;
      await fetchSongs();
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // ─── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 sm:p-8 lg:p-12">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 md:p-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="TACC Logo" width={40} height={40} className="object-contain" />
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <Music className="w-3.5 h-3.5 text-slate-400" />
                Song of the Week Portal
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Manage Weekly Songs</h1>
              <p className="text-sm text-slate-500">Publish new songs, add audio files, and write lyrics.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenAddModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-md text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Weekly Song
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Sign Out <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-8 pb-3">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "catalog"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Music className="w-4 h-4" /> Weekly Song Catalog
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Detailed Analytics & Graphs
          </button>
        </div>

        {/* Tab 2: Analytics */}
        {activeTab === "analytics" ? (
          <AnalyticsDashboard songs={songs} events={rawEvents} />
        ) : (
          <>
            {/* Analytics Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Views</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {Object.values(analyticsMap).reduce((acc, cur) => acc + cur.views, 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {Object.values(analyticsMap).reduce((acc, cur) => acc + cur.visitors, 0)} unique visitors
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Audio Plays</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {Object.values(analyticsMap).reduce((acc, cur) => acc + cur.plays, 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {Object.values(analyticsMap).reduce((acc, cur) => acc + cur.listeners, 0)} unique listeners
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Songs</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{songs.length}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {songs.filter((s) => s.is_published).length} published
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg. Play Rate</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {(() => {
                    const totalV = Object.values(analyticsMap).reduce((acc, cur) => acc + cur.visitors, 0);
                    const totalL = Object.values(analyticsMap).reduce((acc, cur) => acc + cur.listeners, 0);
                    return totalV > 0 ? Math.min(100, Math.round((totalL / totalV) * 100)) + "%" : "0%";
                  })()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">visitors who listened</div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
                Error loading songs: {error}
              </div>
            )}

            {/* Songs List */}
            {songs.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                <Music className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                No weekly songs added yet. Click &quot;Add Weekly Song&quot; to get started.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap bg-white">
                    <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Week</th>
                        <th className="px-6 py-4 font-semibold">Song Info</th>
                        <th className="px-6 py-4 font-semibold">Page Views</th>
                        <th className="px-6 py-4 font-semibold">Audio Listens</th>
                        <th className="px-6 py-4 font-semibold">Song Repeats</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {songs.map((song) => {
                        const stats = analyticsMap[song.id] || { views: 0, visitors: 0, plays: 0, listeners: 0, repeats: 0, repeaters: 0 };
                        return (
                          <tr key={song.id} className="hover:bg-slate-50/50 transition-colors text-slate-600">
                            <td className="px-6 py-4">
                              <span className="inline-flex px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider">
                                {song.week_label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10 rounded bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                                  {song.cover_image_url ? (
                                    <img
                                      src={song.cover_image_url}
                                      alt={song.title}
                                      className="object-cover w-full h-full"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <Music className="w-5 h-5 text-slate-400 absolute inset-0 m-auto" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900 text-sm max-w-[240px] truncate">{song.title}</div>
                                  <div className="text-xs text-slate-400 max-w-[240px] truncate">{song.artist}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900 text-xs">{stats.views} views</div>
                              <div className="text-[11px] text-slate-400">{stats.visitors} unique visitors</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900 text-xs">{stats.plays} plays</div>
                              <div className="text-[11px] text-slate-400">{stats.listeners} unique listeners</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-[#3ba6f1] text-xs">{stats.repeats || 0} repeats</div>
                              <div className="text-[11px] text-slate-400">{stats.repeaters || 0} unique repeaters</div>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => handleTogglePublish(song)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                  song.is_published
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                }`}
                              >
                                {song.is_published ? (
                                  <><Eye className="w-3.5 h-3.5" /> Published</>
                                ) : (
                                  <><EyeOff className="w-3.5 h-3.5" /> Draft</>
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => handleOpenEditModal(song)}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                                  title="Edit Song"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(song.id, song.title)}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                  title="Delete Song"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Add/Edit Song Modal ─────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8 border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingSong ? "Edit Weekly Song" : "Add New Weekly Song"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {editingSong
                    ? "Update song details below"
                    : showReview
                    ? "Review the fetched data and make any changes"
                    : "Choose how to add a new song"}
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Step 1: Mode Selector (only for new songs, before review) ── */}
            {!editingSong && !showReview && !isFetching && (
              <div className="p-6">
                {/* Mode Tabs */}
                <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
                  <button
                    onClick={() => setUploadMode("auto")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all ${
                      uploadMode === "auto"
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Link2 className="w-4 h-4" /> Auto-Fetch from Link
                  </button>
                  <button
                    onClick={() => {
                      setUploadMode("manual");
                      setShowReview(true);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all ${
                      uploadMode === "manual"
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Upload className="w-4 h-4" /> Manual Upload
                  </button>
                </div>

                {/* Auto-Fetch URL Input */}
                {uploadMode === "auto" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Paste LoveWorld Lyrics URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={fetchUrl}
                          onChange={(e) => setFetchUrl(e.target.value)}
                          placeholder="https://loveworldlyrics.com/song-name..."
                          className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-400"
                        />
                        <button
                          onClick={handleAutoFetch}
                          disabled={!fetchUrl}
                          className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                          <Link2 className="w-4 h-4" /> Fetch
                        </button>
                      </div>
                    </div>

                    {fetchError && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {fetchError}
                      </div>
                    )}

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-semibold text-slate-700">How it works:</span> Paste a song link from
                        loveworldlyrics.com. We'll automatically extract the song title, artist, lyrics, and audio.
                        We'll also search iTunes for high-resolution album artwork. You can review and edit everything before saving.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Loading Steps ── */}
            {isFetching && (
              <div className="p-8">
                <div className="max-w-sm mx-auto space-y-4">
                  {fetchSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {step.status === "pending" && (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                      )}
                      {step.status === "loading" && (
                        <Loader2 className="w-5 h-5 text-slate-900 animate-spin" />
                      )}
                      {step.status === "done" && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      )}
                      {step.status === "error" && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          step.status === "loading"
                            ? "text-slate-900"
                            : step.status === "done"
                            ? "text-emerald-700"
                            : step.status === "error"
                            ? "text-red-600"
                            : "text-slate-400"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                {fetchError && (
                  <div className="mt-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fetchError}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Review / Edit Form ── */}
            {showReview && (
              <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-5 max-h-[calc(100vh-250px)] overflow-y-auto">
                  {/* Cover Art & Audio Preview Side-by-Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Cover Image */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Album Cover
                      </label>
                      <div className="relative group">
                        {formData.cover_image_url ? (
                          <div className="relative w-full aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-100">
                            <img
                              src={formData.cover_image_url}
                              alt="Cover"
                              className="object-cover w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => setFormData((p) => ({ ...p, cover_image_url: "" }))}
                                className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                title="Remove cover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => coverInputRef.current?.click()}
                                className="p-2 bg-white text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                                title="Upload new cover"
                              >
                                <Upload className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={isUploadingCover}
                            className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors cursor-pointer"
                          >
                            {isUploadingCover ? (
                              <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                              <>
                                <Upload className="w-6 h-6" />
                                <span className="text-xs font-medium">Upload Cover Image</span>
                              </>
                            )}
                          </button>
                        )}
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleCoverFileChange}
                        />
                      </div>
                    </div>

                    {/* Audio Preview */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Audio File (MP3)
                      </label>
                      {formData.audio_url ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={toggleAudioPreview}
                              className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-colors flex-shrink-0"
                            >
                              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-900 truncate">
                                {formData.title || "Audio Preview"}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {formData.artist || "Unknown Artist"}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (audioRef.current) {
                                  audioRef.current.pause();
                                  audioRef.current = null;
                                  setIsPlaying(false);
                                }
                                setFormData((p) => ({ ...p, audio_url: "" }));
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => audioInputRef.current?.click()}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Replace
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => audioInputRef.current?.click()}
                          disabled={isUploadingAudio}
                          className="w-full h-[140px] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors cursor-pointer"
                        >
                          {isUploadingAudio ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <>
                              <Upload className="w-6 h-6" />
                              <span className="text-xs font-medium">Upload MP3 File</span>
                            </>
                          )}
                        </button>
                      )}
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/mpeg,audio/mp3"
                        className="hidden"
                        onChange={handleAudioFileChange}
                      />
                    </div>
                  </div>

                  {/* Title & Artist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Song Title *
                      </label>
                      <input
                        type="text"
                        name="title"
                        required
                        placeholder="e.g. The Saviour of the World"
                        value={formData.title}
                        onChange={handleFormChange}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Artiste *
                      </label>
                      <input
                        type="text"
                        name="artist"
                        required
                        placeholder="e.g. Oge & Loveworld Singers"
                        value={formData.artist}
                        onChange={handleFormChange}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>

                  {/* Week & Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Week Label *
                      </label>
                      <input
                        type="text"
                        name="week_label"
                        required
                        placeholder="e.g. WEEK ONE"
                        value={formData.week_label}
                        onChange={handleFormChange}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Publish Date *
                      </label>
                      <input
                        type="date"
                        name="publish_date"
                        required
                        value={formData.publish_date}
                        onChange={handleFormChange}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>

                  {/* Lyrics */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                      <span>Lyrics *</span>
                      <span className="text-[10px] text-slate-400 font-normal normal-case">Use double newlines for sections</span>
                    </label>
                    <textarea
                      name="lyrics"
                      required
                      rows={10}
                      placeholder={"Verse 1\n\nYou're the truth the scholars scribed\nAs from a place that has no death nor night..."}
                      value={formData.lyrics}
                      onChange={handleFormChange}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300"
                    />
                  </div>

                  {/* Publish Toggle */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="is_published"
                      name="is_published"
                      checked={formData.is_published}
                      onChange={handleCheckboxChange}
                      className="h-4 w-4 rounded border-slate-300 focus:ring-slate-900"
                    />
                    <label htmlFor="is_published" className="text-sm font-semibold text-slate-700 cursor-pointer">
                      Publish this song immediately (visible on portal)
                    </label>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4" /> Save Song</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
