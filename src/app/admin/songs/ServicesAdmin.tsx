"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowDown, ArrowUp, Check, Edit, ExternalLink, Link2, Loader2, Music, Plus,
  Radio, RotateCcw, SkipForward, Trash2, Upload, X,
} from "lucide-react";
import type { ServiceSong, ServiceWithSongs, SongStatus } from "@/lib/services-db";
import {
  deleteServiceAdmin,
  deleteServiceSongAdmin,
  fetchServicesAdmin,
  moveServiceSongAdmin,
  nextServiceSong,
  resetServiceStatuses,
  saveServiceAdmin,
  saveServiceSongAdmin,
  setServiceSongStatus,
} from "./service-actions";

const EMPTY_SERVICE = {
  title: "",
  service_date: new Date().toISOString().split("T")[0],
  cover_image_url: "",
  is_published: true,
};

const EMPTY_SONG = { title: "", artist: "", lyrics: "", audio_url: "", source_url: "" };

async function uploadFile(file: File, name: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  const res = await fetch("/api/sotw/upload-media", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url as string;
}

const STATUS_STYLE: Record<SongStatus, string> = {
  upcoming: "bg-slate-100 text-slate-500",
  live: "bg-red-500 text-white",
  sung: "bg-emerald-100 text-emerald-700",
};

/** Live Services: build each service's playlist, then run it during the service. */
export function ServicesAdmin() {
  const [services, setServices] = useState<ServiceWithSongs[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [serviceForm, setServiceForm] = useState<(typeof EMPTY_SERVICE & { id?: string }) | null>(null);
  const [songForm, setSongForm] = useState<(typeof EMPTY_SONG & { id?: string }) | null>(null);
  const [fetchUrl, setFetchUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const selected = services.find((s) => s.id === selectedId) ?? null;

  const apply = (data: ServiceWithSongs[]) => {
    setServices(data);
    setSelectedId((id) => (id && data.some((s) => s.id === id) ? id : data[0]?.id ?? null));
  };
  const load = async () => apply(await fetchServicesAdmin());

  useEffect(() => {
    fetchServicesAdmin()
      .then(apply)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load services"))
      .finally(() => setLoading(false));
  }, []);

  /** Runs an action that returns the service's fresh song list. */
  const run = (action: () => Promise<ServiceSong[]>) => {
    if (!selected) return;
    const id = selected.id;
    setError("");
    startTransition(async () => {
      try {
        const songs = await action();
        setServices((all) => all.map((s) => (s.id === id ? { ...s, songs } : s)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  const saveService = async () => {
    if (!serviceForm) return;
    setBusy("service");
    setError("");
    try {
      const id = await saveServiceAdmin(serviceForm);
      setServiceForm(null);
      await load();
      setSelectedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the service");
    } finally {
      setBusy(null);
    }
  };

  const removeService = async () => {
    if (!selected || !confirm(`Delete "${selected.title}" and its playlist?`)) return;
    await deleteServiceAdmin(selected.id);
    setSelectedId(null);
    await load();
  };

  const fetchSong = async () => {
    if (!fetchUrl.trim()) return;
    setBusy("fetch");
    setError("");
    try {
      const res = await fetch("/api/sotw/fetch-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fetchUrl.trim(), cover: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't fetch that song");
      setSongForm((f) => ({
        ...(f ?? EMPTY_SONG),
        title: data.title || "",
        artist: data.artist || "",
        lyrics: data.lyrics || "",
        audio_url: data.audio_url || "",
        source_url: data.source_url || fetchUrl.trim(),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch that song");
    } finally {
      setBusy(null);
    }
  };

  const saveSong = () => {
    if (!selected || !songForm) return;
    const input = { ...songForm, service_id: selected.id };
    run(async () => {
      const songs = await saveServiceSongAdmin(input);
      setSongForm(null);
      setFetchUrl("");
      return songs;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const live = selected?.songs.find((s) => s.status === "live");
  const upNext = selected?.songs.find((s) => s.status === "upcoming");

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Services */}
      <aside className="space-y-2">
        <button
          onClick={() => setServiceForm({ ...EMPTY_SERVICE })}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> New Service
        </button>
        {services.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No services yet.</p>}
        {services.map((s) => {
          const isLive = s.songs.some((song) => song.status === "live");
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                s.id === selectedId ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-200">
                {s.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                  <img src={s.cover_image_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="text-xs text-slate-500">
                  {s.service_date} · {s.songs.length} songs
                </p>
                <div className="mt-0.5 flex gap-1">
                  {isLive && <span className="rounded bg-red-500 px-1.5 text-[10px] font-bold text-white">LIVE</span>}
                  {!s.is_published && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">Draft</span>}
                </div>
              </div>
            </button>
          );
        })}
      </aside>

      {/* Selected service */}
      <section className="min-w-0">
        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!selected ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-20 text-center text-sm text-slate-400">
            Create a service to build its playlist.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                {selected.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                  <img src={selected.cover_image_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-slate-900">{selected.title}</h2>
                <p className="text-sm text-slate-500">
                  {selected.service_date} · {selected.is_published ? "Published" : "Draft (hidden)"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/song-of-the-week/services/${selected.id}`}
                  target="_blank"
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
                <button
                  onClick={() =>
                    setServiceForm({
                      id: selected.id,
                      title: selected.title,
                      service_date: selected.service_date,
                      cover_image_url: selected.cover_image_url ?? "",
                      is_published: selected.is_published,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={removeService}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>

            {/* Live control */}
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-white sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">During the service</p>
                  <p className="mt-1 truncate text-lg font-semibold">
                    {live ? (
                      <span className="flex items-center gap-2">
                        <Radio className="h-5 w-5 animate-pulse text-red-400" /> {live.title}
                      </span>
                    ) : upNext ? (
                      "Not started"
                    ) : selected.songs.length ? (
                      "All songs sung"
                    ) : (
                      "No songs yet"
                    )}
                  </p>
                  {upNext && <p className="truncate text-xs text-slate-400">Up next: {upNext.title}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={pending || (!live && !upNext)}
                    onClick={() => run(() => nextServiceSong(selected.id))}
                    className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                    {live ? (upNext ? "Next song" : "Finish") : "Start"}
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => confirm("Set every song back to upcoming?") && run(() => resetServiceStatuses(selected.id))}
                    title="Reset all"
                    className="rounded-lg border border-white/20 px-3 text-white/70 hover:bg-white/10 disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Playlist */}
            <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {selected.songs.map((song, i) => (
                <li
                  key={song.id}
                  className={`flex flex-wrap items-center gap-3 p-3 ${song.status === "live" ? "bg-red-50" : ""} ${song.status === "sung" ? "opacity-60" : ""}`}
                >
                  <span className="w-6 text-center text-sm font-semibold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{song.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {song.artist || "—"}
                      {!song.audio_url && " · no audio"}
                      {!song.lyrics && " · no lyrics"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[song.status]}`}>
                    {song.status}
                  </span>
                  <div className="flex items-center gap-1">
                    {song.status !== "live" && (
                      <button
                        disabled={pending}
                        onClick={() => run(() => setServiceSongStatus(selected.id, song.id, "live"))}
                        className="flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-40"
                      >
                        <Radio className="h-3.5 w-3.5" /> Live
                      </button>
                    )}
                    {song.status !== "sung" && (
                      <button
                        disabled={pending}
                        onClick={() => run(() => setServiceSongStatus(selected.id, song.id, "sung"))}
                        className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" /> Sung
                      </button>
                    )}
                    {song.status !== "upcoming" && (
                      <button
                        disabled={pending}
                        title="Back to upcoming"
                        onClick={() => run(() => setServiceSongStatus(selected.id, song.id, "upcoming"))}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      disabled={pending || i === 0}
                      title="Move up"
                      onClick={() => run(() => moveServiceSongAdmin(selected.id, song.id, -1))}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={pending || i === selected.songs.length - 1}
                      title="Move down"
                      onClick={() => run(() => moveServiceSongAdmin(selected.id, song.id, 1))}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Edit"
                      onClick={() =>
                        setSongForm({
                          id: song.id,
                          title: song.title,
                          artist: song.artist,
                          lyrics: song.lyrics,
                          audio_url: song.audio_url ?? "",
                          source_url: song.source_url ?? "",
                        })
                      }
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={pending}
                      title="Remove"
                      onClick={() => confirm(`Remove "${song.title}"?`) && run(() => deleteServiceSongAdmin(selected.id, song.id))}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
              {selected.songs.length === 0 && <li className="p-6 text-center text-sm text-slate-400">No songs yet.</li>}
            </ol>

            {!songForm && (
              <button
                onClick={() => setSongForm({ ...EMPTY_SONG })}
                className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" /> Add a song to the end
              </button>
            )}

            {/* Add / edit a song */}
            {songForm && (
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{songForm.id ? "Edit song" : "Add a song"}</h3>
                  <button onClick={() => setSongForm(null)} className="text-slate-400 hover:text-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={fetchUrl}
                      onChange={(e) => setFetchUrl(e.target.value)}
                      placeholder="loveworldlyrics.com or ceenaija.com link (optional)"
                      className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-900"
                    />
                  </div>
                  <button
                    onClick={fetchSong}
                    disabled={busy === "fetch" || !fetchUrl.trim()}
                    className="flex items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {busy === "fetch" && <Loader2 className="h-4 w-4 animate-spin" />} Fetch
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={songForm.title}
                    onChange={(e) => setSongForm({ ...songForm, title: e.target.value })}
                    placeholder="Title *"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    value={songForm.artist}
                    onChange={(e) => setSongForm({ ...songForm, artist: e.target.value })}
                    placeholder="Artist"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={songForm.audio_url}
                    onChange={(e) => setSongForm({ ...songForm, audio_url: e.target.value })}
                    placeholder="Audio URL (MP3)"
                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    {busy === "audio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} MP3
                    <input
                      type="file"
                      accept="audio/mpeg"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusy("audio");
                        try {
                          const url = await uploadFile(file, songForm.title || "service-song");
                          setSongForm((f) => (f ? { ...f, audio_url: url } : f));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Upload failed");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                  </label>
                </div>
                {songForm.audio_url && <audio controls src={songForm.audio_url} className="h-9 w-full" />}
                <textarea
                  value={songForm.lyrics}
                  onChange={(e) => setSongForm({ ...songForm, lyrics: e.target.value })}
                  placeholder={"Lyrics. Leave a blank line between sections; start a section with Verse, Chorus…"}
                  rows={10}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setSongForm(null)} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600">
                    Cancel
                  </button>
                  <button
                    onClick={saveSong}
                    disabled={pending || !songForm.title.trim()}
                    className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {songForm.id ? "Save song" : "Add song"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Service form */}
      {serviceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{serviceForm.id ? "Edit service" : "New service"}</h3>
              <button onClick={() => setServiceForm(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={serviceForm.title}
              onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })}
              placeholder="Service name *"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <input
              type="date"
              value={serviceForm.service_date}
              onChange={(e) => setServiceForm({ ...serviceForm, service_date: e.target.value })}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                {serviceForm.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview
                  <img src={serviceForm.cover_image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Music className="h-6 w-6 text-slate-300" />
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {busy === "cover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Album cover
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy("cover");
                    try {
                      const url = await uploadFile(file, `${serviceForm.title || "service"}-cover`);
                      setServiceForm((f) => (f ? { ...f, cover_image_url: url } : f));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Upload failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={serviceForm.is_published}
                onChange={(e) => setServiceForm({ ...serviceForm, is_published: e.target.checked })}
              />
              Show on the songs portal
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setServiceForm(null)} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600">
                Cancel
              </button>
              <button
                onClick={saveService}
                disabled={busy === "service" || !serviceForm.title.trim()}
                className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy === "service" && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
