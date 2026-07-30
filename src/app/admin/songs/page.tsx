"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Edit, Trash2, Loader2, ChevronLeft, 
  Music, BookOpen, Eye, EyeOff, Save, X, ArrowLeft 
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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

export default function AdminSongs() {
  const router = useRouter();
  const supabase = createClient();

  const [songs, setSongs] = useState<Song[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, { views: number; visitors: number; plays: number; listeners: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [formData, setFormData] = useState(DEFAULT_SONG_FORM);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/admin/login");
          return;
        }
        await fetchSongs();
      } catch (err: any) {
        setError("Authentication error: " + err.message);
        setIsLoading(false);
      }
    }
    checkAuth();

    // Auto-refresh analytics every 5 seconds for live real-time stats
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

      // Fetch analytics events if table exists
      const { data: eventsData, error: eventsError } = await supabase
        .from("sotw_analytics_events")
        .select("song_id, event_type, visitor_id");

      if (!eventsError && eventsData) {
        const stats: Record<string, { views: number; visitors: Set<string>; plays: number; listeners: Set<string> }> = {};
        eventsData.forEach((ev: any) => {
          if (!stats[ev.song_id]) {
            stats[ev.song_id] = { views: 0, visitors: new Set(), plays: 0, listeners: new Set() };
          }
          if (ev.event_type === "view") {
            stats[ev.song_id].views += 1;
            stats[ev.song_id].visitors.add(ev.visitor_id);
          } else if (ev.event_type === "play") {
            stats[ev.song_id].plays += 1;
            stats[ev.song_id].listeners.add(ev.visitor_id);
          }
        });

        const formatted: Record<string, { views: number; visitors: number; plays: number; listeners: number }> = {};
        Object.keys(stats).forEach((sid) => {
          formatted[sid] = {
            views: stats[sid].views,
            visitors: stats[sid].visitors.size,
            plays: stats[sid].plays,
            listeners: stats[sid].listeners.size,
          };
        });
        setAnalyticsMap(formatted);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const handleOpenAddModal = () => {
    setEditingSong(null);
    setFormData({
      ...DEFAULT_SONG_FORM,
      publish_date: new Date().toISOString().split("T")[0],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (song: Song) => {
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
    setIsModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

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

      setIsModalOpen(false);
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
            <Link 
              href="/admin" 
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <Music className="w-3.5 h-3.5 text-slate-400" />
                Song of the Week Portal
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Manage Weekly Songs</h1>
              <p className="text-sm text-slate-500">Publish new songs, add audio files, and write lyrics.</p>
            </div>
          </div>
          <button 
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-md text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Weekly Song
          </button>
        </div>

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
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {songs.length}
            </div>
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
            No weekly songs added yet. Click "Add Weekly Song" to get started.
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
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {songs.map((song) => {
                    const stats = analyticsMap[song.id] || { views: 0, visitors: 0, plays: 0, listeners: 0 };

                    return (
                      <tr 
                        key={song.id} 
                        className="hover:bg-slate-50/50 transition-colors text-slate-600"
                      >
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
                          <button
                            onClick={() => handleTogglePublish(song)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            song.is_published 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          }`}
                        >
                          {song.is_published ? (
                            <>
                              <Eye className="w-3.5 h-3.5" /> Published
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" /> Draft
                            </>
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
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8 border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingSong ? "Edit Weekly Song" : "Add New Weekly Song"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">Configure details and lyrics below</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                      <span>Audio URL (MP3 link)</span>
                      <span className="text-[10px] text-slate-400 font-normal normal-case">e.g. link to mp3 file</span>
                    </label>
                    <input 
                      type="text" 
                      name="audio_url"
                      placeholder="https://example.com/song.mp3"
                      value={formData.audio_url}
                      onChange={handleFormChange}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                      <span>Cover Image URL</span>
                      <span className="text-[10px] text-slate-400 font-normal normal-case">e.g. square cover art</span>
                    </label>
                    <input 
                      type="text" 
                      name="cover_image_url"
                      placeholder="https://example.com/cover.jpg"
                      value={formData.cover_image_url}
                      onChange={handleFormChange}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Lyrics *</span>
                    <span className="text-[10px] text-slate-400 font-normal normal-case">Use double newlines for sections</span>
                  </label>
                  <textarea 
                    name="lyrics"
                    required
                    rows={8}
                    placeholder="[Pre-Chorus]&#10;You are magnified&#10;You are glorified&#10;&#10;[Chorus]&#10;Master, The ruler of the world&#10;Dear Lord Jesus..."
                    value={formData.lyrics}
                    onChange={handleFormChange}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300"
                  />
                </div>

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
                  onClick={() => setIsModalOpen(false)}
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
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save Song
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
