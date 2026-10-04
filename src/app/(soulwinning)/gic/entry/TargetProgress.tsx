"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { SW_API } from "@/lib/soulwinning/api";

type Rank = {
  souls: number;
  pfcc: string | null;
  pfcc_rank: number | null;
  pfcc_members: number | null;
  overall_rank: number | null;
  overall_members: number;
};

const RANK_REFRESH_MS = 3 * 60 * 1000;

/**
 * "3 of 7" ring for the member using this phone, plus where they stand in
 * their PFCC. The ring counts what's on the phone (instant, even offline); the
 * rank comes from the server's leaderboard, which refreshes once a minute.
 */
export function TargetProgress({
  campaignSlug,
  entrantId,
  souls,
  target,
}: {
  campaignSlug: string;
  entrantId: string;
  souls: number;
  target: number;
}) {
  const [rank, setRank] = useState<Rank | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch(`${SW_API}/v1/rank/${campaignSlug}?entrant=${entrantId}`);
        if (res.ok && !cancelled) setRank((await res.json()) as Rank);
      } catch {
        // Offline or a blip: keep the last rank.
      }
    };
    // After a save, give the phone a moment to sync before asking.
    const soon = setTimeout(load, souls > 0 ? 8000 : 0);
    const every = setInterval(load, RANK_REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(soon);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [campaignSlug, entrantId, souls]);

  const done = souls >= target;
  const progress = Math.min(1, souls / target);
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#e8e6e5] bg-white px-3.5 py-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke="#f2f2f2" strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={done ? "#16a34a" : "#3ba6f1"}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-lg font-semibold tabular-nums text-[#0c0a09]">{souls}</span>
          <span className="mt-0.5 text-[10px] text-[#a8a29e]">of {target}</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#0c0a09]">
          {done
            ? souls === target
              ? "Target reached! 🎉"
              : `Target reached, ${souls} souls! 🎉`
            : souls === 0
              ? `Your target: ${target} souls`
              : `${target - souls} more to reach ${target}`}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-[#78716c]">
          {rank?.pfcc_rank && rank.pfcc_members ? (
            <>
              <Trophy className="h-3.5 w-3.5 shrink-0 text-[#3ba6f1]" />
              <span className="truncate">
                #{rank.pfcc_rank} of {rank.pfcc_members} in {rank.pfcc === "Not given" ? "your PFCC" : rank.pfcc}
                {rank.overall_rank ? ` · #${rank.overall_rank} overall` : ""}
              </span>
            </>
          ) : souls > 0 ? (
            "Your ranking appears a minute after your souls sync."
          ) : (
            "Log your first soul to join the leaderboard."
          )}
        </p>
      </div>
    </div>
  );
}
