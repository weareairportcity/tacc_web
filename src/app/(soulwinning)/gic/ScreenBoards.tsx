"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Trophy, Users } from "lucide-react";
import type { SwLeaderboard } from "@/lib/soulwinning/types";

const MEDALS = ["🥇", "🥈", "🥉"];

type Size = "screen" | "phone";

/**
 * Top PFCCs and top soul winners. On wide screens (projector, laptop) they
 * sit either side of the total, sized to the screen height; below that they
 * stack under the counter (see StackedBoards) so phones get them too.
 * Who reached the target first is an admin-only view.
 */
export function ScreenBoards({ board }: { board: SwLeaderboard | null }) {
  if (!board) return null;
  const side =
    "pointer-events-none absolute top-1/2 z-10 hidden w-[clamp(15rem,21vw,28rem)] -translate-y-1/2 lg:block";
  return (
    <>
      <aside className={`${side} left-[clamp(0.75rem,1.6vw,2rem)]`}>
        <PfccPanel board={board} size="screen" limit={6} />
      </aside>
      <aside className={`${side} right-[clamp(0.75rem,1.6vw,2rem)]`}>
        <WinnersPanel board={board} size="screen" limit={8} />
      </aside>
    </>
  );
}

/** Phones and tablets: the same two boards, under the counter. */
export function StackedBoards({ board }: { board: SwLeaderboard | null }) {
  if (!board) return null;
  return (
    <section id="leaderboard" className="bg-[#fafaf9] px-4 pb-10 pt-6 font-sans sm:px-6 lg:hidden">
      <h2 className="mb-4 text-center font-roobert text-xl tracking-[-0.02em] text-[#0c0a09]">Leaderboard</h2>
      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        <PfccPanel board={board} size="phone" limit={10} />
        <WinnersPanel board={board} size="phone" limit={10} />
      </div>
    </section>
  );
}

/** The little "Leaderboard ↓" prompt at the bottom of the counter on phones. */
export function LeaderboardHint() {
  return (
    <a
      href="#leaderboard"
      className="sw-on-marquee mx-auto mt-2 flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-[#3398e1] lg:hidden"
    >
      Leaderboard <ChevronDown className="h-3.5 w-3.5" />
    </a>
  );
}

function PfccPanel({ board, size, limit }: { board: SwLeaderboard; size: Size; limit: number }) {
  return (
    <Panel size={size} icon={<Users className={iconClass(size)} />} title="Top PFCCs">
      {board.pfccs.length === 0 ? (
        <Empty size={size}>Waiting for the first soul</Empty>
      ) : (
        board.pfccs.slice(0, limit).map((p, i) => (
          <Row
            key={p.pfcc}
            size={size}
            rank={i}
            label={p.pfcc}
            sub={`${p.members} ${p.members === 1 ? "member" : "members"}`}
            value={p.souls}
          />
        ))
      )}
    </Panel>
  );
}

function WinnersPanel({ board, size, limit }: { board: SwLeaderboard; size: Size; limit: number }) {
  return (
    <Panel size={size} icon={<Trophy className={iconClass(size)} />} title="Top soul winners">
      {board.members.length === 0 ? (
        <Empty size={size}>Waiting for the first soul</Empty>
      ) : (
        board.members.slice(0, limit).map((m, i) => (
          <Row
            key={`${m.name}-${i}`}
            size={size}
            rank={i}
            label={m.name}
            sub={m.pfcc}
            value={m.souls}
            done={m.souls >= board.target}
          />
        ))
      )}
    </Panel>
  );
}

/**
 * "Congratulations!" for each member who newly reaches the target, one at a
 * time. Members who'd already reached it when the screen opened aren't
 * celebrated again.
 */
export function TargetCelebration({
  board,
  onCelebrate,
}: {
  board: SwLeaderboard | null;
  onCelebrate: () => void;
}) {
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<{ name: string; pfcc: string }[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!board) return;
    const keys = board.completed.map((m) => `${m.name}|${m.reached_at}`);
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const fresh = board.completed.filter((m) => !seen.current!.has(`${m.name}|${m.reached_at}`));
    keys.forEach((k) => seen.current!.add(k));
    if (fresh.length) setQueue((q) => [...q, ...fresh.map((m) => ({ name: m.name, pfcc: m.pfcc }))].slice(-12));
  }, [board]);

  useEffect(() => {
    if (!current) return;
    onCelebrate();
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 7000);
    return () => clearTimeout(t);
  }, [current, onCelebrate]);

  if (!current || !board) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[16%] z-40 flex justify-center px-6">
      <div className="max-w-[90vw] animate-[sw-pop_0.5s_ease-out] rounded-2xl border border-[#3ba6f1]/30 bg-white/95 px-[clamp(1.25rem,4vh,2.5rem)] py-[clamp(1rem,2.4vh,1.75rem)] text-center shadow-[0_2vh_6vh_rgba(17,12,46,0.18)] backdrop-blur">
        <p className="text-[clamp(0.75rem,2vh,1.25rem)] font-medium uppercase tracking-[0.2em] text-[#3398e1]">
          🎉 Congratulations
        </p>
        <p className="mt-1 font-roobert text-[clamp(1.5rem,4.6vh,3.25rem)] leading-tight tracking-[-0.02em] text-[#0c0a09]">
          {current.name}
        </p>
        <p className="mt-1 text-[clamp(0.85rem,2.2vh,1.4rem)] text-[#57534e]">
          reached {board.target} souls{current.pfcc && current.pfcc !== "Not given" ? ` · ${current.pfcc}` : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Building blocks: "screen" sizes follow the screen height (projectors),
// "phone" sizes are plain rem for reading in your hand. ───────────────────────

const iconClass = (size: Size) => (size === "screen" ? "h-[2.2vh] w-[2.2vh]" : "h-4 w-4");

function Panel({
  size,
  icon,
  title,
  children,
}: {
  size: Size;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const s = size === "screen";
  return (
    <section
      className={`border border-[#e8e6e5] bg-white/90 shadow-[0_0.8vh_3vh_rgba(0,0,0,0.06)] backdrop-blur ${
        s ? "rounded-[1.6vh] p-[1.8vh]" : "rounded-xl p-4"
      }`}
    >
      <h3
        className={`flex items-center font-medium uppercase tracking-[0.12em] text-[#57534e] ${
          s ? "mb-[1vh] gap-[0.8vh] text-[1.9vh]" : "mb-3 gap-2 text-xs"
        }`}
      >
        <span className="text-[#3398e1]">{icon}</span>
        {title}
      </h3>
      <ol className={s ? "space-y-[0.7vh]" : "space-y-2.5"}>{children}</ol>
    </section>
  );
}

function Row({
  size,
  rank,
  label,
  sub,
  value,
  done,
}: {
  size: Size;
  rank: number;
  label: string;
  sub?: string;
  value: number;
  done?: boolean;
}) {
  const s = size === "screen";
  return (
    <li className={`flex items-center ${s ? "gap-[1vh]" : "gap-3"}`}>
      <span className={`shrink-0 text-center tabular-nums text-[#a8a29e] ${s ? "w-[3vh] text-[2vh]" : "w-6 text-sm"}`}>
        {MEDALS[rank] ?? rank + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-center truncate font-medium text-[#0c0a09] ${
            s ? "gap-[0.6vh] text-[2.2vh]" : "gap-1.5 text-sm"
          }`}
        >
          <span className="truncate">{label}</span>
          {done && (
            <CheckCircle2
              className={`shrink-0 text-[#16a34a] ${s ? "h-[2vh] w-[2vh]" : "h-4 w-4"}`}
              aria-label="Reached the target"
            />
          )}
        </span>
        {sub && <span className={`block truncate text-[#78716c] ${s ? "text-[1.6vh]" : "text-xs"}`}>{sub}</span>}
      </span>
      <span className={`shrink-0 font-roobert tabular-nums text-[#3398e1] ${s ? "text-[2.6vh]" : "text-lg"}`}>{value}</span>
    </li>
  );
}

function Empty({ size, children }: { size: Size; children: React.ReactNode }) {
  return <li className={`text-[#a8a29e] ${size === "screen" ? "text-[1.8vh]" : "text-sm"}`}>{children}</li>;
}
