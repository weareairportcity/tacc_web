"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { burstConfetti } from "@/lib/soulwinning/confetti";
import { useCampaignCounts } from "@/lib/soulwinning/use-counts";
import type { SwCampaign, SwCounts } from "@/lib/soulwinning/types";
import { Odometer } from "./Odometer";

type FloatingSoul = { key: number; name: string; lane: number };

/** Lanes deliberately avoid the middle of the screen — that band belongs to
 *  the total, and a name drifting across it is unreadable on a projector. */
const LANES = [10, 18, 26, 72, 80, 88];

/** Names are queued rather than all shown at once — a burst of entries during a
 *  rally would otherwise paint the whole screen at the same instant. The queue
 *  drains faster as it grows, so the celebration never falls minutes behind the
 *  counter, and it is capped: during a rush the newest souls are the ones worth
 *  showing. */
const TICK_MS = 150;
const FLOAT_MS = 7000;
const MAX_QUEUE = 24;

function releaseEveryTicks(queued: number): number {
  if (queued > 12) return 1; // ~150ms apart
  if (queued > 5) return 3; // ~450ms
  return 6; // ~900ms
}

interface Props {
  campaign: SwCampaign;
  initialCounts: SwCounts | null;
  variant: "public" | "projector";
}

export function CounterView({ campaign, initialCounts, variant }: Props) {
  const { counts, isLive } = useCampaignCounts(campaign.id, initialCounts);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [floating, setFloating] = useState<FloatingSoul[]>([]);

  const queueRef = useRef<string[]>([]);
  const lastEntryRef = useRef<string | null>(initialCounts?.last_entry_id ?? null);
  const laneRef = useRef(0);
  const keyRef = useRef(0);

  const isProjector = variant === "projector";
  const total = counts?.total_souls ?? 0;
  const tongues = counts?.tongues_count ?? 0;
  const church = counts?.church_count ?? 0;
  const recent = counts?.recent_names ?? [];
  const goal = campaign.goal_total ?? null;
  const progress = goal ? Math.min((total / goal) * 100, 100) : 0;

  // The total has to stay huge at "14" and still fit at "1,234" on a phone.
  // Each tabular digit is about 0.62em wide, so the width budget per character
  // caps the size only once the number gets long — short totals keep the big
  // display size untouched.
  const perCharVw = Math.round(150 / Math.max(String(total).length + 1, 2));
  // The number takes whatever vertical room is left once the header, caption,
  // tallies and feed have theirs — a plain vh fraction can't know that, and
  // either wastes space or pushes the page into a scroll.
  const heightBudget = isProjector ? "calc(100svh - 500px)" : "calc(100svh - 470px)";
  const totalFontSize = isProjector
    ? `max(6rem, min(52vw, ${heightBudget}, ${perCharVw}vw, 60rem))`
    : `max(3.25rem, min(46vw, ${heightBudget}, ${perCharVw}vw, 32rem))`;

  useEffect(() => {
    const entryId = counts?.last_entry_id ?? null;
    if (!entryId || entryId === lastEntryRef.current) return;
    lastEntryRef.current = entryId;
    queueRef.current.push(counts?.last_soul_name || "A soul");
    if (queueRef.current.length > MAX_QUEUE) {
      queueRef.current = queueRef.current.slice(-MAX_QUEUE);
    }
  }, [counts?.last_entry_id, counts?.last_soul_name]);

  useEffect(() => {
    let tick = 0;

    const timer = setInterval(() => {
      tick += 1;
      if (tick % releaseEveryTicks(queueRef.current.length) !== 0) return;

      const name = queueRef.current.shift();
      if (!name) return;

      const soul: FloatingSoul = {
        key: (keyRef.current += 1),
        name,
        lane: LANES[(laneRef.current += 1) % LANES.length],
      };

      setFloating((prev) => [...prev, soul]);
      if (canvasRef.current) burstConfetti(canvasRef.current, isProjector ? 110 : 70);

      setTimeout(() => {
        setFloating((prev) => prev.filter((item) => item.key !== soul.key));
      }, FLOAT_MS);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [isProjector]);

  return (
    <main className="relative flex h-[100svh] w-full flex-col overflow-hidden bg-[#fafaf9] px-5 py-6 font-sans sm:px-8 sm:py-8">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />

      {floating.map((soul) => (
        <div
          key={soul.key}
          className="sw-float pointer-events-none absolute z-10 whitespace-nowrap font-roobert"
          style={{ top: `${soul.lane}%` }}
        >
          <span
            className="tracking-[-0.03em] text-[#0c0a09]"
            style={{
              fontSize: isProjector ? "clamp(1.75rem, 3.6vw, 4.5rem)" : "clamp(1.05rem, 4.5vw, 1.75rem)",
            }}
          >
            {soul.name}{" "}
            <span className="rounded-md bg-[#c1e1f7] px-2 py-0.5 text-[#3398e1] sm:px-3">
              for Christ
            </span>
          </span>
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
      <div className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center py-4 text-center sm:py-6">
        <Odometer
          value={total}
          digitWidth="0.54em"
          className="font-roobert font-medium leading-none tracking-[-0.045em] text-[#0c0a09]"
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
                style={{ width: `${progress}%` }}
              />
            </div>
            <p
              className="mt-2 text-[#a8a29e]"
              style={{ fontSize: isProjector ? "clamp(0.9rem, 1.4vw, 1.6rem)" : "0.75rem" }}
            >
              {Math.round(progress)}% of {goal.toLocaleString()} goal
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

      {/* Recently won — fills the base of the page and grows through the day */}
      <footer className="relative z-10 shrink-0 border-t border-[#e8e6e5] pt-4">
        <p
          className="mb-2 font-medium uppercase tracking-[0.18em] text-[#a8a29e]"
          style={{ fontSize: isProjector ? "clamp(0.75rem, 1.1vw, 1.25rem)" : "0.625rem" }}
        >
          Recently won
        </p>
        {recent.length === 0 ? (
          <p
            className="text-[#d6d3d1]"
            style={{ fontSize: isProjector ? "clamp(1rem, 1.6vw, 1.75rem)" : "0.8125rem" }}
          >
            The first souls of the day will appear here.
          </p>
        ) : (
          <ul className="flex flex-nowrap items-center gap-2 overflow-hidden">
            {recent.map((name, index) => (
              <li
                key={`${name}-${index}`}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 ${
                  index === 0
                    ? "bg-[#c1e1f7] text-[#3398e1]"
                    : "border border-[#e8e6e5] bg-white text-[#78716c]"
                }`}
                style={{
                  fontSize: isProjector ? "clamp(1rem, 1.5vw, 1.75rem)" : "0.8125rem",
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </footer>
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
        digitWidth="0.55em"
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
