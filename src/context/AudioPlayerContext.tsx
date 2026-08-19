"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { trackSongEvent } from "@/lib/analytics-client";

export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverImageUrl?: string;
  weekLabel?: string;
};

export type RepeatMode = "single" | "all" | "off";

type AudioPlayerContextType = {
  currentTrack: AudioTrack | null;
  playlist: AudioTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  setPlaylist: (tracks: AudioTrack[]) => void;
  playTrack: (track: AudioTrack, newPlaylist?: AudioTrack[]) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeatMode: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  closePlayer: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [playlist, setPlaylistState] = useState<AudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Default repeat mode is 'single' (Repeat Single) as requested
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("single");
  const [isShuffle, setIsShuffle] = useState(false);

  // Refs for callbacks to avoid stale closures in audio event listeners
  const currentTrackRef = useRef<AudioTrack | null>(null);
  const playlistRef = useRef<AudioTrack[]>([]);
  const repeatModeRef = useRef<RepeatMode>("single");
  const isShuffleRef = useRef<boolean>(false);
  const hasTrackedCurrentTrackRef = useRef(false);

  // Synchronize refs
  useEffect(() => {
    currentTrackRef.current = currentTrack;
    hasTrackedCurrentTrackRef.current = false;
  }, [currentTrack?.id]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  const setPlaylist = (tracks: AudioTrack[]) => {
    setPlaylistState(tracks);
    playlistRef.current = tracks;
  };

  const playTrackInternal = (track: AudioTrack) => {
    if (!audioRef.current) return;
    setCurrentTrack(track);
    currentTrackRef.current = track;
    audioRef.current.src = track.audioUrl;
    audioRef.current.load();
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch((err) => console.error("Playback failed:", err));
  };

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = volume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Verify 5 seconds of active playback before logging event
      if (
        audio.currentTime >= 5 &&
        !hasTrackedCurrentTrackRef.current &&
        currentTrackRef.current?.id
      ) {
        hasTrackedCurrentTrackRef.current = true;
        trackSongEvent(currentTrackRef.current.id, "play");
      }
    };

    const handleLoadedMetadata = () => setDuration(audio.duration || 0);

    const handleEnded = () => {
      const mode = repeatModeRef.current;
      const shuffle = isShuffleRef.current;
      const current = currentTrackRef.current;
      const list = playlistRef.current;

      // 1. Repeat Single (Default): replay current track
      if (mode === "single") {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(console.error);
        }
        return;
      }

      if (!current || list.length === 0) {
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }

      // 2. Shuffle mode: pick random track from playlist
      if (shuffle) {
        const available = list.filter((t) => t.id !== current.id);
        const nextTrack = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : current;
        playTrackInternal(nextTrack);
        return;
      }

      // 3. Repeat All / Repeat Off in week order
      const currentIndex = list.findIndex((t) => t.id === current.id);

      if (mode === "all") {
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % list.length : 0;
        playTrackInternal(list[nextIndex]);
      } else if (mode === "off") {
        if (currentIndex >= 0 && currentIndex < list.length - 1) {
          playTrackInternal(list[currentIndex + 1]);
        } else {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
  }, []);

  const playTrack = (track: AudioTrack, newPlaylist?: AudioTrack[]) => {
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
    }

    if (!audioRef.current) return;

    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
      return;
    }

    playTrackInternal(track);
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resumeTrack = () => {
    if (audioRef.current && currentTrack) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      resumeTrack();
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioRef.current.muted = nextMuted;
    }
  };

  const toggleRepeatMode = () => {
    setRepeatModeState((prev) => {
      if (prev === "single") return "all";
      if (prev === "all") return "off";
      return "single";
    });
  };

  const setRepeatMode = (mode: RepeatMode) => {
    setRepeatModeState(mode);
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const playNextTrack = () => {
    const list = playlistRef.current;
    const current = currentTrackRef.current;
    if (!current || list.length === 0) return;

    if (isShuffleRef.current) {
      const available = list.filter((t) => t.id !== current.id);
      const nextTrack = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : current;
      playTrackInternal(nextTrack);
      return;
    }

    const currentIndex = list.findIndex((t) => t.id === current.id);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % list.length : 0;
    playTrackInternal(list[nextIndex]);
  };

  const playPreviousTrack = () => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const list = playlistRef.current;
    const current = currentTrackRef.current;
    if (!current || list.length === 0) return;

    const currentIndex = list.findIndex((t) => t.id === current.id);
    const prevIndex = currentIndex >= 0 ? (currentIndex - 1 + list.length) % list.length : 0;
    playTrackInternal(list[prevIndex]);
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTrack(null);
  };

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        playlist,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        repeatMode,
        isShuffle,
        setPlaylist,
        playTrack,
        pauseTrack,
        resumeTrack,
        togglePlayPause,
        seek,
        setVolume,
        toggleMute,
        toggleRepeatMode,
        setRepeatMode,
        toggleShuffle,
        playNextTrack,
        playPreviousTrack,
        closePlayer,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  }
  return context;
}
