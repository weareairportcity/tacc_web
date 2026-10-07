"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { trackSongEvent } from "@/lib/analytics-client";

export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverImageUrl?: string;
  weekLabel?: string;
  /** Where the title links; defaults to the song's Song of the Week page. */
  href?: string;
  /** Plain-text lyrics, shown in the full-screen player. */
  lyrics?: string;
};

export type RepeatMode = "single" | "all" | "off";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export const PLAYBACK_RATES = [0.75, 0.9, 1, 1.1, 1.25] as const;

type AudioPlayerContextType = {
  currentTrack: AudioTrack | null;
  /** The play order: everything before queueIndex has played, after it is up next. */
  queue: AudioTrack[];
  queueIndex: number;
  upNext: AudioTrack[];
  /** Kept for existing callers: the same list as `queue`. */
  playlist: AudioTrack[];
  status: PlayerStatus;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  playbackRate: number;
  isFullScreen: boolean;
  setPlaylist: (tracks: AudioTrack[]) => void;
  playTrack: (track: AudioTrack, context?: AudioTrack[]) => void;
  playAll: (tracks: AudioTrack[], opts?: { shuffle?: boolean }) => void;
  playNext: (track: AudioTrack) => void;
  /** False when the song is already playing or coming up. */
  addToQueue: (track: AudioTrack) => boolean;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearUpNext: () => void;
  jumpTo: (index: number) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  seekBy: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeatMode: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  setPlaybackRate: (rate: number) => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  openFullScreen: () => void;
  closeFullScreen: () => void;
  closePlayer: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

const STORAGE_KEY = "tacc_player_v2";

type Saved = {
  queue: AudioTrack[];
  queueIndex: number;
  position: number;
  volume: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  playbackRate: number;
};

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The site-wide audio player. One <audio> element lives here so playback
 * survives page navigation; the mini bar (GlobalAudioPlayer) and the
 * full-screen view (NowPlaying) are just views onto this state.
 *
 * The queue is a single play order with a cursor (queueIndex). "Play next"
 * inserts after the cursor, "Add to queue" appends, and shuffle reorders only
 * what's still to come — the original order is kept so turning shuffle off
 * puts it back.
 */
export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<AudioTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  // Repeat-one stays the default: the page exists to help people learn a song.
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("single");
  const [isShuffle, setIsShuffle] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Mirrors for the audio element's event handlers (no stale closures).
  const queueRef = useRef<AudioTrack[]>([]);
  const indexRef = useRef(-1);
  const repeatRef = useRef<RepeatMode>("single");
  const unshuffledRef = useRef<AudioTrack[] | null>(null);
  const trackedPlayRef = useRef(false);
  const restoredRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  const currentTrack = queueIndex >= 0 ? (queue[queueIndex] ?? null) : null;

  const commitQueue = useCallback((next: AudioTrack[], index: number) => {
    queueRef.current = next;
    indexRef.current = index;
    setQueue(next);
    setQueueIndex(index);
  }, []);

  useEffect(() => {
    repeatRef.current = repeatMode;
  }, [repeatMode]);

  /** Loads the track at `index` and (optionally) starts it. */
  const loadIndex = useCallback(
    (index: number, list: AudioTrack[], autoplay = true) => {
      const audio = audioRef.current;
      const track = list[index];
      if (!audio || !track) return;
      commitQueue(list, index);
      trackedPlayRef.current = false;
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      audio.src = track.audioUrl;
      audio.load();
      if (autoplay) {
        setStatus("loading");
        audio.play().catch((err: unknown) => {
          // Autoplay blocked or the file failed; the error handler covers the latter.
          if (err instanceof DOMException && err.name === "NotAllowedError") setStatus("paused");
        });
      } else {
        setStatus("paused");
      }
    },
    [commitQueue],
  );

  const advance = useCallback(
    (direction: 1 | -1, fromEnded = false) => {
      const list = queueRef.current;
      const index = indexRef.current;
      if (list.length === 0) return;
      let next = index + direction;
      if (next >= list.length) {
        if (repeatRef.current === "all" || !fromEnded) next = 0;
        else {
          setStatus("paused");
          audioRef.current?.pause();
          if (audioRef.current) audioRef.current.currentTime = 0;
          return;
        }
      }
      if (next < 0) next = list.length - 1;
      loadIndex(next, list);
    },
    [loadIndex],
  );

  // The one <audio> element, wired once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // A play counts once 5 seconds have actually been heard.
      const track = queueRef.current[indexRef.current];
      if (audio.currentTime >= 5 && !trackedPlayRef.current && track) {
        trackedPlayRef.current = true;
        trackSongEvent(track.id, "play");
      }
    };
    const onMeta = () => {
      setDuration(audio.duration || 0);
      if (pendingSeekRef.current !== null) {
        audio.currentTime = Math.min(pendingSeekRef.current, Math.max(0, (audio.duration || 0) - 1));
        setCurrentTime(audio.currentTime);
        pendingSeekRef.current = null;
      }
    };
    const onPlaying = () => setStatus("playing");
    const onPause = () => setStatus((s) => (s === "error" ? s : "paused"));
    const onWaiting = () => setStatus((s) => (s === "playing" ? "loading" : s));
    const onError = () => {
      if (!audio.src) return;
      setStatus("error");
      setError("This song couldn't be played. Check your connection, or try the next one.");
    };
    const onEnded = () => {
      const track = queueRef.current[indexRef.current];
      if (repeatRef.current === "single") {
        if (track) trackSongEvent(track.id, "repeat");
        trackedPlayRef.current = true; // the repeat is already counted
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      advance(1, true);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    // Restore the last session (paused — never autoplay on page load), a tick
    // after mount so it doesn't set state during the effect itself.
    const saved = readSaved();
    const restore = setTimeout(() => {
      if (saved && saved.queue?.length && saved.queueIndex >= 0) {
        restoredRef.current = true;
        setVolumeState(saved.volume ?? 0.85);
        audio.volume = saved.volume ?? 0.85;
        setRepeatModeState(saved.repeatMode ?? "single");
        setIsShuffle(Boolean(saved.isShuffle));
        setPlaybackRateState(saved.playbackRate ?? 1);
        audio.playbackRate = saved.playbackRate ?? 1;
        pendingSeekRef.current = saved.position ?? 0;
        loadIndex(Math.min(saved.queueIndex, saved.queue.length - 1), saved.queue, false);
      } else {
        audio.volume = 0.85;
      }
    }, 0);

    return () => {
      clearTimeout(restore);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the session (throttled by the 1s granularity of the position).
  const savedSecond = Math.floor(currentTime);
  useEffect(() => {
    if (queue.length === 0) return;
    try {
      const saved: Saved = {
        queue,
        queueIndex,
        position: savedSecond,
        volume,
        repeatMode,
        isShuffle,
        playbackRate,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private mode or full storage: the player still works, it just won't resume.
    }
  }, [queue, queueIndex, savedSecond, volume, repeatMode, isShuffle, playbackRate]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const resumeTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (status === "error") {
      // Retry the same song.
      loadIndex(indexRef.current, queueRef.current);
      return;
    }
    setStatus("loading");
    audio.play().catch(() => setStatus("paused"));
  }, [status, loadIndex]);

  const pauseTrack = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    if (status === "playing" || status === "loading") pauseTrack();
    else resumeTrack();
  }, [status, pauseTrack, resumeTrack]);

  /**
   * Plays `track`. With a context list (the catalog, the week's songs), the
   * queue becomes that list starting at the track; without one, the track is
   * played from the existing queue or slotted in after the current song.
   */
  const playTrack = useCallback(
    (track: AudioTrack, context?: AudioTrack[]) => {
      if (currentTrack?.id === track.id) {
        togglePlayPause();
        return;
      }
      if (context && context.length > 0) {
        let list = context.some((t) => t.id === track.id) ? context : [track, ...context];
        unshuffledRef.current = null;
        if (isShuffle) {
          unshuffledRef.current = list;
          list = [track, ...shuffled(list.filter((t) => t.id !== track.id))];
        }
        loadIndex(
          list.findIndex((t) => t.id === track.id),
          list,
        );
        return;
      }
      const existing = queueRef.current.findIndex((t) => t.id === track.id);
      if (existing >= 0) {
        loadIndex(existing, queueRef.current);
        return;
      }
      const list = [...queueRef.current];
      list.splice(indexRef.current + 1, 0, track);
      loadIndex(indexRef.current + 1, list);
    },
    [currentTrack?.id, isShuffle, loadIndex, togglePlayPause],
  );

  const playAll = useCallback(
    (tracks: AudioTrack[], opts?: { shuffle?: boolean }) => {
      if (tracks.length === 0) return;
      const shuffle = opts?.shuffle ?? false;
      setIsShuffle(shuffle);
      unshuffledRef.current = shuffle ? tracks : null;
      loadIndex(0, shuffle ? shuffled(tracks) : tracks);
    },
    [loadIndex],
  );

  /** Keeps the old API: sets the list a song page belongs to, without playing. */
  const setPlaylist = useCallback(
    (tracks: AudioTrack[]) => {
      if (queueRef.current.length > 0) return; // don't clobber a queue someone built
      commitQueue(tracks, -1);
    },
    [commitQueue],
  );

  // ── Queue editing ─────────────────────────────────────────────────────────

  const playNext = useCallback(
    (track: AudioTrack) => {
      const current = queueRef.current[indexRef.current];
      if (!current) {
        loadIndex(0, [track]);
        return;
      }
      if (current.id === track.id) return;
      // Move it if it's already queued, rather than queueing it twice.
      const list = queueRef.current.filter((t) => t === current || t.id !== track.id);
      const cur = list.indexOf(current);
      list.splice(cur + 1, 0, track);
      commitQueue(list, cur);
    },
    [commitQueue, loadIndex],
  );

  const addToQueue = useCallback(
    (track: AudioTrack) => {
      if (indexRef.current < 0) {
        loadIndex(0, [track]);
        return true;
      }
      if (queueRef.current.slice(indexRef.current).some((t) => t.id === track.id)) return false;
      commitQueue([...queueRef.current, track], indexRef.current);
      return true;
    },
    [commitQueue, loadIndex],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const list = queueRef.current;
      if (index === indexRef.current || index < 0 || index >= list.length) return;
      const next = list.filter((_, i) => i !== index);
      commitQueue(next, index < indexRef.current ? indexRef.current - 1 : indexRef.current);
    },
    [commitQueue],
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const list = [...queueRef.current];
      const cur = indexRef.current;
      // Only what's still to come can be reordered.
      if (from <= cur || to <= cur || from >= list.length || to >= list.length) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      commitQueue(list, cur);
    },
    [commitQueue],
  );

  const clearUpNext = useCallback(() => {
    commitQueue(queueRef.current.slice(0, indexRef.current + 1), indexRef.current);
  }, [commitQueue]);

  const jumpTo = useCallback((index: number) => loadIndex(index, queueRef.current), [loadIndex]);

  // ── Transport ─────────────────────────────────────────────────────────────

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration || time));
    setCurrentTime(audio.currentTime);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + seconds);
  }, [seek]);

  const playNextTrack = useCallback(() => advance(1), [advance]);

  const playPreviousTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      seek(0);
      return;
    }
    advance(-1);
  }, [advance, seek]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = vol === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => {
      if (audioRef.current) audioRef.current.muted = !muted;
      return !muted;
    });
  }, []);

  const toggleRepeatMode = useCallback(() => {
    setRepeatModeState((prev) => (prev === "single" ? "all" : prev === "all" ? "off" : "single"));
  }, []);

  const setRepeatMode = useCallback((mode: RepeatMode) => setRepeatModeState(mode), []);

  const toggleShuffle = useCallback(() => {
    const list = queueRef.current;
    const cur = indexRef.current;
    if (!isShuffle) {
      unshuffledRef.current = list;
      if (cur >= 0) commitQueue([...list.slice(0, cur + 1), ...shuffled(list.slice(cur + 1))], cur);
    } else if (unshuffledRef.current) {
      // Back to the original order, still on the same song.
      const original = unshuffledRef.current;
      const id = list[cur]?.id;
      const extras = list.filter((t) => !original.some((o) => o.id === t.id));
      const restored = [...original, ...extras];
      commitQueue(restored, Math.max(0, restored.findIndex((t) => t.id === id)));
      unshuffledRef.current = null;
    }
    setIsShuffle(!isShuffle);
  }, [isShuffle, commitQueue]);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  // Keep the rate across track changes (load() resets it in some browsers).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [queueIndex, playbackRate]);

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    commitQueue([], -1);
    setStatus("idle");
    setError(null);
    setIsFullScreen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [commitQueue]);

  // ── Lock screen / headphone controls (Media Session) ─────────────────────

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!currentTrack) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.weekLabel ? `Song of the Week · ${currentTrack.weekLabel}` : "Song of the Week",
      artwork: currentTrack.coverImageUrl
        ? [{ src: currentTrack.coverImageUrl, sizes: "600x600", type: "image/jpeg" }]
        : [],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => resumeTrack()],
      ["pause", () => pauseTrack()],
      ["previoustrack", () => playPreviousTrack()],
      ["nexttrack", () => playNextTrack()],
      ["seekbackward", (d) => seekBy(-(d.seekOffset ?? 10))],
      ["seekforward", (d) => seekBy(d.seekOffset ?? 10)],
      ["seekto", (d) => d.seekTime !== undefined && seek(d.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser supports every action.
      }
    }
  }, [currentTrack, resumeTrack, pauseTrack, playPreviousTrack, playNextTrack, seekBy, seek]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : currentTrack ? "paused" : "none";
  }, [status, currentTrack]);

  const value = useMemo<AudioPlayerContextType>(
    () => ({
      currentTrack,
      queue,
      queueIndex,
      upNext: queueIndex >= 0 ? queue.slice(queueIndex + 1) : [],
      playlist: queue,
      status,
      isPlaying: status === "playing" || status === "loading",
      isLoading: status === "loading",
      error,
      currentTime,
      duration,
      volume,
      isMuted,
      repeatMode,
      isShuffle,
      playbackRate,
      isFullScreen,
      setPlaylist,
      playTrack,
      playAll,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearUpNext,
      jumpTo,
      pauseTrack,
      resumeTrack,
      togglePlayPause,
      seek,
      seekBy,
      setVolume,
      toggleMute,
      toggleRepeatMode,
      setRepeatMode,
      toggleShuffle,
      setPlaybackRate,
      playNextTrack,
      playPreviousTrack,
      openFullScreen: () => setIsFullScreen(true),
      closeFullScreen: () => setIsFullScreen(false),
      closePlayer,
    }),
    [
      currentTrack, queue, queueIndex, status, error, currentTime, duration, volume, isMuted,
      repeatMode, isShuffle, playbackRate, isFullScreen, setPlaylist, playTrack, playAll, playNext,
      addToQueue, removeFromQueue, moveInQueue, clearUpNext, jumpTo, pauseTrack, resumeTrack,
      togglePlayPause, seek, seekBy, setVolume, toggleMute, toggleRepeatMode, setRepeatMode,
      toggleShuffle, setPlaybackRate, playNextTrack, playPreviousTrack, closePlayer,
    ],
  );

  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  return context;
}
