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
  // Odometer glyphs are 1.3em tall. Cap by svh so a single-digit total cannot
  // eat the goal bar and tallies — those stay in a shrink-0 footer below.
  const totalFontSize = isProjector
    ? `max(2.75rem, min(44vw, ${perCharVw}vw, 32svh, 16rem))`
    : `max(2.25rem, min(40vw, ${perCharVw}vw, 28svh, 11rem))`;

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
    <main className="sw-counter fixed inset-0 z-10 flex w-full flex-col overflow-hidden overscroll-none bg-[#fafaf9] px-[clamp(1rem,2.2vw,2rem)] py-[clamp(0.55rem,1.6vh,1.5rem)] font-sans">
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
      <header className="relative z-10 shrink-0 border-b border-[#e8e6e5] pb-[clamp(0.35rem,1.2vh,0.85rem)] text-center">
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
          className="mx-auto w-auto object-contain"
          style={{ height: isProjector ? "clamp(1.35rem, 3.4vh, 2.5rem)" : "clamp(1.15rem, 3vh, 2rem)" }}
          priority
        />

        <h1
          className="mt-[clamp(0.2rem,0.8vh,0.65rem)] font-roobert font-medium leading-none tracking-[-0.045em] text-[#0c0a09]"
          style={{ fontSize: isProjector ? "clamp(1.35rem, 4.2vh, 2.75rem)" : "clamp(1.5rem, 5vh, 3rem)" }}
        >
          1909
        </h1>
        <p
          className="sw-on-marquee mt-[clamp(0.1rem,0.5vh,0.35rem)] text-[#44403c]"
          style={{ fontSize: isProjector ? "clamp(0.7rem, 1.6vh, 1.15rem)" : "clamp(0.7rem, 1.8vh, 0.95rem)" }}
        >
          Soul Winning · The Airport City Church
        </p>
      </header>

      {/* The count fills whatever is left; goal + tallies stay pinned below. */}
      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden text-center">
        <Odometer
          value={total}
          digitWidth="0.62em"
          className="font-roobert font-medium leading-none tracking-[-0.045em] text-[#0c0a09] [text-shadow:0_0_28px_#fafaf9,0_0_8px_#fafaf9]"
          style={{ fontSize: totalFontSize }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full shrink-0 pt-[clamp(0.35rem,1.2vh,0.85rem)] pb-[max(0.15rem,env(safe-area-inset-bottom))] text-center">
        <div className="relative isolate w-full">
          <div
            className="pointer-events-none absolute -inset-x-10 -inset-y-3 -z-10 sm:-inset-x-16"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(250,250,249,0.96) 0%, rgba(250,250,249,0.82) 48%, rgba(250,250,249,0) 74%)",
            }}
            aria-hidden
          />
          <p
            className="sw-on-marquee text-balance tracking-[0.048px] text-[#292524]"
            style={{
              fontSize: isProjector ? "clamp(0.95rem, 2.4vh, 2.1rem)" : "clamp(0.8rem, 2.2vh, 1.15rem)",
            }}
          >
            {total === 1 ? "soul won for Christ" : "souls won for Christ"}
          </p>

          {goal && (
            <div
              className="mt-[clamp(0.4rem,1.4vh,1.1rem)] w-full"
              style={{ maxWidth: isProjector ? "60rem" : "28rem", marginInline: "auto" }}
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8e6e5] sm:h-2">
                <div
                  className="h-full rounded-full bg-[#3ba6f1] transition-[width] duration-700 ease-out"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p
                className="sw-on-marquee mt-1.5 text-[#44403c]"
                style={{ fontSize: isProjector ? "clamp(0.75rem, 1.8vh, 1.35rem)" : "clamp(0.65rem, 1.5vh, 0.75rem)" }}
              >
                {Math.round(progressPct).toLocaleString()}% of {goal.toLocaleString()} goal
              </p>
            </div>
          )}
        </div>

        <div
          className="mt-[clamp(0.5rem,1.8vh,1.25rem)] grid w-full grid-cols-2 gap-2 sm:gap-3"
          style={{ maxWidth: isProjector ? "50rem" : "28rem", marginInline: "auto" }}
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
    <div className="rounded-xl border border-[#e8e6e5] bg-white px-[clamp(0.65rem,1.6vw,1.25rem)] py-[clamp(0.45rem,1.4vh,0.9rem)]">
      <Odometer
        value={value}
        digitWidth="0.6em"
        className="font-roobert font-medium leading-none tracking-[-0.02em] text-[#3398e1]"
        style={{
          fontSize: isProjector ? "clamp(1.35rem, 4.2vh, 3.25rem)" : "clamp(1.15rem, 3.6vh, 1.85rem)",
        }}
      />
      <p
        className="mt-[clamp(0.15rem,0.5vh,0.35rem)] text-[#78716c]"
        style={{
          fontSize: isProjector ? "clamp(0.7rem, 1.8vh, 1.35rem)" : "clamp(0.65rem, 1.6vh, 0.8rem)",
        }}
      >
        {label}
      </p>
    </div>
  );
}
