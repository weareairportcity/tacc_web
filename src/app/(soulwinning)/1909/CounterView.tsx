"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { burstConfetti } from "@/lib/soulwinning/confetti";
import { SoulCard } from "./SoulCard";
import { PhotoMarquee } from "./PhotoMarquee";
import { useCampaignCounts } from "@/lib/soulwinning/use-counts";
import type { SwCampaign, SwCounts } from "@/lib/soulwinning/types";
import { Odometer } from "./Odometer";

type FloatingSoul = {
  key: number;
  name: string;
  photoPath: string | null;
  lane: number;
  /** Seconds to cross the screen. */
  duration: number;
  delay: number;
  scale: number;
  /** Some cards pass in front of the count, some behind it. */
  inFront: boolean;
};

export type EnqueuedSoul = {
  name: string;
  photoPath: string | null;
  duration?: number;
  delay?: number;
  lane?: number;
  scale?: number;
  inFront?: boolean;
  spokeInTongues?: boolean;
  comingToChurch?: boolean;
};

type QueuedSoul = EnqueuedSoul;

declare global {
  interface Window {
    __swEnqueueSoul?: (soul: EnqueuedSoul) => void;
  }
}

/** Lanes deliberately avoid the middle of the screen — that band belongs to
 *  the total, and a name drifting across it is unreadable on a projector. */
// Widely spaced, and ordered so consecutive releases land far apart: a
// group's cards are ~200px tall and adjacent lanes would stack them.
const LANES = [4, 44, 24, 64, 14, 54, 34, 70];

/** Names are queued rather than all shown at once — a burst of entries during a
 *  rally would otherwise paint the whole screen at the same instant. The queue
 *  drains faster as it grows, so the celebration never falls minutes behind the
 *  counter, and it is capped: during a rush the newest souls are the ones worth
 *  showing. */
const TICK_MS = 700;
const MAX_QUEUE = 18;
const MAX_ON_SCREEN = 14;
const LONGEST_FLOAT_MS = 16_000;


interface Props {
  campaign: SwCampaign;
  initialCounts: SwCounts | null;
  variant: "public" | "projector";
}

export function CounterView({ campaign, initialCounts, variant }: Props) {
  const { counts, isLive } = useCampaignCounts(campaign.id, initialCounts);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [floating, setFloating] = useState<FloatingSoul[]>([]);
  const [shotBump, setShotBump] = useState({ total: 0, tongues: 0, church: 0 });

  const queueRef = useRef<QueuedSoul[]>([]);
  const lastEntryRef = useRef<string | null>(initialCounts?.last_entry_id ?? null);
  const laneRef = useRef(0);
  const keyRef = useRef(0);

  const pushMarqueePhoto = (path: string | null | undefined) => {
    if (!path) return;
    setMarqueePaths((prev) => {
      if (prev[0] === path) return prev;
      return [path, ...prev.filter((item) => item !== path)].slice(0, 36);
    });
  };

  const isProjector = variant === "projector";
  const [marqueePaths, setMarqueePaths] = useState<string[]>(() => {
    const recent = initialCounts?.recent_photo_paths ?? [];
    const last = initialCounts?.last_photo_path;
    const paths = last && !recent.includes(last) ? [last, ...recent] : recent;
    return paths.filter(Boolean).slice(0, 36);
  });
  const total = (counts?.total_souls ?? 0) + shotBump.total;
  const tongues = (counts?.tongues_count ?? 0) + shotBump.tongues;
  const church = (counts?.church_count ?? 0) + shotBump.church;
  const goal = campaign.goal_total ?? null;
  const progressPct = goal && goal > 0 ? (total / goal) * 100 : 0;
  const barWidth = Math.min(progressPct, 100);

  // The total has to stay huge at "14" and still fit at "1,234" on a phone.
  // Each tabular digit is about 0.62em wide, so the width budget per character
  // caps the size only once the number gets long — short totals keep the big
  // display size untouched.
  const perCharVw = Math.round(150 / Math.max(String(total).length + 1, 2));
  // The number takes whatever vertical room is left once the header, caption,
  // tallies and feed have theirs — a plain vh fraction can't know that, and
  // either wastes space or pushes the page into a scroll.
  const heightBudget = isProjector ? "calc(100svh - 430px)" : "calc(100svh - 430px)";
  const totalFontSize = isProjector
    ? `max(6rem, min(52vw, ${heightBudget}, ${perCharVw}vw, 60rem))`
    : `max(3.25rem, min(46vw, ${heightBudget}, ${perCharVw}vw, 32rem))`;

  useEffect(() => {
    const entryId = counts?.last_entry_id ?? null;
    if (!entryId || entryId === lastEntryRef.current) return;
    lastEntryRef.current = entryId;
    queueRef.current.push({
      name: counts?.last_soul_name || "A soul",
      photoPath: counts?.last_photo_path ?? null,
    });
    pushMarqueePhoto(counts?.last_photo_path);
    if (queueRef.current.length > MAX_QUEUE) {
      queueRef.current = queueRef.current.slice(-MAX_QUEUE);
    }
  }, [counts?.last_entry_id, counts?.last_soul_name, counts?.last_photo_path]);

  useEffect(() => {
    const recent = counts?.recent_photo_paths ?? [];
    const last = counts?.last_photo_path;
    if (marqueePaths.length > 0) return;
    const paths = last && !recent.includes(last) ? [last, ...recent] : recent;
    if (paths.length) setMarqueePaths(paths.filter(Boolean).slice(0, 36));
  }, [counts?.recent_photo_paths, counts?.last_photo_path, marqueePaths.length]);

  // Release everything waiting in one go, so a group of souls crosses the
  // screen together and the burst is sized to how many arrived.
  useEffect(() => {
    const timer = setInterval(() => {
      const batch = queueRef.current.splice(0, queueRef.current.length);
      if (batch.length === 0) return;

      const released: FloatingSoul[] = batch.map((item) => ({
        key: (keyRef.current += 1),
        name: item.name,
        photoPath: item.photoPath,
        lane: item.lane ?? LANES[(laneRef.current += 1) % LANES.length],
        // Randomised so no two crossings look alike.
        duration: item.duration ?? 9 + Math.random() * 7,
        // A stagger so souls released together do not move as one block.
        delay: item.delay ?? Math.random() * 1.6,
        scale: item.scale ?? 0.78 + Math.random() * 0.45,
        inFront: item.inFront ?? Math.random() < 0.5,
      }));

      setFloating((prev) => [...prev, ...released].slice(-MAX_ON_SCREEN));

      if (canvasRef.current) {
        const perSoul = isProjector ? 70 : 45;
        burstConfetti(canvasRef.current, Math.min(perSoul * released.length, 420));
      }

      const keys = new Set(released.map((soul) => soul.key));
      setTimeout(() => {
        setFloating((prev) => prev.filter((item) => !keys.has(item.key)));
      }, LONGEST_FLOAT_MS);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [isProjector]);

  // Shot pages only — Playwright uses the same float queue a live entry would.
  useEffect(() => {
    if (!window.location.pathname.includes("/shots/")) return;

    const enqueue = (soul: EnqueuedSoul) => {
      queueRef.current.push(soul);
      pushMarqueePhoto(soul.photoPath);
      setShotBump((prev) => ({
        total: prev.total + 1,
        tongues: prev.tongues + (soul.spokeInTongues ? 1 : 0),
        church: prev.church + (soul.comingToChurch ? 1 : 0),
      }));
    };

    window.__swEnqueueSoul = enqueue;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<EnqueuedSoul>).detail;
      if (detail?.name) enqueue(detail);
    };
    window.addEventListener("sw:enqueue-soul", onEvent);
    return () => {
      delete window.__swEnqueueSoul;
      window.removeEventListener("sw:enqueue-soul", onEvent);
    };
  }, []);

  return (
    <main className="relative flex h-[100svh] w-full flex-col overflow-hidden bg-[#fafaf9] px-5 py-6 font-sans sm:px-8 sm:py-8">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-30 h-full w-full" />
      <PhotoMarquee paths={marqueePaths} />

      {floating.map((soul) => (
        <div
          key={soul.key}
          className={`sw-float pointer-events-none absolute ${soul.inFront ? "z-20" : "z-[2]"}`}
          data-soul-name={soul.name}
          data-has-photo={soul.photoPath ? "true" : "false"}
          style={{
            top: `${soul.lane}%`,
            animationDuration: `${soul.duration}s`,
            animationDelay: `${soul.delay}s`,
          }}
        >
          <SoulCard
            name={soul.name}
            photoPath={soul.photoPath}
            scale={soul.scale}
            isProjector={isProjector}
          />
        </div>
      ))}

      {/* Header: church mark, then 1909 as the page's title, centred as a lockup */}
      <header className="relative z-10 shrink-0 border-b border-[#e8e6e5] pb-4 text-center">
        {/* Out of the centred flow so it cannot pull the lockup off-centre. */}
        {!isProjector && (
          <span className="absolute right-0 top-0 flex items-center gap-1.5 text-[11px] text-[#a8a29e]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-[#3ba6f1]" : "bg-[#d6d3d1]"}`}
              aria-hidden
            />
            {isLive ? "Live" : "Reconnecting…"}
          </span>
        )}

        <Image
          src="/logo.png"
          alt="The Airport City Church"
          width={140}
          height={49}
          className={`mx-auto object-contain ${
            isProjector ? "h-8 w-auto sm:h-10" : "h-7 w-auto sm:h-8"
          }`}
          priority
        />

        <h1
          className="mt-3 font-roobert font-medium leading-none tracking-[-0.045em] text-[#0c0a09]"
          style={{ fontSize: isProjector ? "clamp(1.75rem, 3vw, 3.25rem)" : "clamp(2.25rem, 11vw, 4rem)" }}
        >
          1909
        </h1>
        <p
          className="mt-1 text-[#78716c]"
          style={{ fontSize: isProjector ? "clamp(0.8rem, 1.1vw, 1.25rem)" : "clamp(0.8rem, 3.2vw, 1rem)" }}
        >
          Soul Winning · The Airport City Church
        </p>
      </header>

      {/* The count */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center py-4 text-center sm:py-6">
        <Odometer
          value={total}
          digitWidth="0.62em"
          className="font-roobert font-medium leading-none tracking-[-0.045em] text-[#0c0a09] [text-shadow:0_0_28px_#fafaf9,0_0_8px_#fafaf9]"
          style={{ fontSize: totalFontSize }}
        />

        <p
          className="mt-4 text-balance tracking-[0.048px] text-[#78716c]"
          style={{
            fontSize: isProjector ? "clamp(1.1rem, 2.2vw, 2.75rem)" : "clamp(0.9rem, 3.5vw, 1.25rem)",
          }}
        >
          {total === 1 ? "soul won for Christ" : "souls won for Christ"}
        </p>

        {goal && (
          <div
            className="mt-7 w-full"
            style={{ maxWidth: isProjector ? "60rem" : "28rem" }}
          >
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8e6e5] sm:h-2.5">
              <div
                className="h-full rounded-full bg-[#3ba6f1] transition-[width] duration-700 ease-out"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <p
              className="mt-2 text-[#a8a29e]"
              style={{ fontSize: isProjector ? "clamp(0.9rem, 1.4vw, 1.6rem)" : "0.75rem" }}
            >
              {Math.round(progressPct).toLocaleString()}% of {goal.toLocaleString()} goal
            </p>
          </div>
        )}

        <div
          className="mt-8 grid w-full grid-cols-2 gap-3 sm:gap-4"
          style={{ maxWidth: isProjector ? "50rem" : "28rem" }}
        >
          <Tally label="Spoke in tongues" value={tongues} isProjector={isProjector} />
          <Tally label="Coming to church" value={church} isProjector={isProjector} />
        </div>
      </div>


    </main>
  );
}

function Tally({
  label,
  value,
  isProjector,
}: {
  label: string;
  value: number;
  isProjector: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e8e6e5] bg-white px-3 py-3 sm:px-5 sm:py-4">
      <Odometer
        value={value}
        digitWidth="0.6em"
        className="font-roobert font-medium leading-none tracking-[-0.02em] text-[#3398e1]"
        style={{
          fontSize: isProjector ? "clamp(1.75rem, 3vw, 4rem)" : "clamp(1.375rem, 6.5vw, 2rem)",
        }}
      />
      <p
        className="mt-1 text-[#78716c]"
        style={{
          fontSize: isProjector ? "clamp(0.85rem, 1.3vw, 1.6rem)" : "clamp(0.7rem, 3vw, 0.8125rem)",
        }}
      >
        {label}
      </p>
    </div>
  );
}
