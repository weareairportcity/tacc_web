"use client";

import { ChevronDown, ChevronUp, Music, X } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { EqualizerBars } from "./EqualizerBars";

/** "Now playing" plus everything up next, with reorder and remove. */
export function QueuePanel({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { queue, queueIndex, isPlaying, jumpTo, removeFromQueue, moveInQueue, clearUpNext } = useAudioPlayer();
  const dark = tone === "dark";
  const current = queue[queueIndex];
  const upNext = queue.map((track, index) => ({ track, index })).slice(queueIndex + 1);

  const muted = dark ? "text-white/55" : "text-[#78716c]";
  const rowHover = dark ? "hover:bg-white/8" : "hover:bg-[#fafaf9]";

  return (
    <div className="flex h-full flex-col">
      {current && (
        <section>
          <p className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${muted}`}>Now playing</p>
          <Row track={current} dark={dark} active>
            {isPlaying && <EqualizerBars className="text-[#3ba6f1]" />}
          </Row>
        </section>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className={`text-[11px] font-medium uppercase tracking-wider ${muted}`}>
          Up next{upNext.length ? ` · ${upNext.length}` : ""}
        </p>
        {upNext.length > 0 && (
          <button type="button" onClick={clearUpNext} className={`text-xs ${muted} hover:text-[#3ba6f1]`}>
            Clear
          </button>
        )}
      </div>

      {upNext.length === 0 ? (
        <p className={`mt-3 text-sm ${muted}`}>
          Nothing queued. Use “Play next” or “Add to queue” on any song.
        </p>
      ) : (
        <ol className="mt-2 -mx-2 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {upNext.map(({ track, index }, i) => (
            <li key={`${track.id}-${index}`}>
              <div className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${rowHover}`}>
                <button
                  type="button"
                  onClick={() => jumpTo(index)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  title="Play now"
                >
                  <Cover src={track.coverImageUrl} dark={dark} />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${dark ? "text-white" : "text-[#0c0a09]"}`}>
                      {track.title}
                    </span>
                    <span className={`block truncate text-xs ${muted}`}>{track.artist}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <IconButton
                    label="Move up"
                    dark={dark}
                    disabled={i === 0}
                    onClick={() => moveInQueue(index, index - 1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    dark={dark}
                    disabled={i === upNext.length - 1}
                    onClick={() => moveInQueue(index, index + 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Remove from queue" dark={dark} onClick={() => removeFromQueue(index)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({
  track,
  dark,
  active,
  children,
}: {
  track: { title: string; artist: string; coverImageUrl?: string };
  dark: boolean;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Cover src={track.coverImageUrl} dark={dark} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${active ? "text-[#3ba6f1]" : dark ? "text-white" : "text-[#0c0a09]"}`}>
          {track.title}
        </p>
        <p className={`truncate text-xs ${dark ? "text-white/55" : "text-[#78716c]"}`}>{track.artist}</p>
      </div>
      {children}
    </div>
  );
}

function Cover({ src, dark }: { src?: string; dark: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md ${
        dark ? "bg-white/10" : "bg-[#f2f2f2]"
      }`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote cover art
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Music className={`h-4 w-4 ${dark ? "text-white/50" : "text-[#a8a29e]"}`} />
      )}
    </span>
  );
}

function IconButton({
  label,
  dark,
  disabled,
  onClick,
  children,
}: {
  label: string;
  dark: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-25 ${
        dark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-[#78716c] hover:bg-[#f2f2f2] hover:text-[#0c0a09]"
      }`}
    >
      {children}
    </button>
  );
}
