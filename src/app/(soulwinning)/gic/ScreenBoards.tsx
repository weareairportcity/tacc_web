"use client";

import { useEffect, useRef, useState } from "react";
import { Award, CheckCircle2, Trophy, Users } from "lucide-react";
import type { SwLeaderboard } from "@/lib/soulwinning/types";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * The big screen's leaderboards: top PFCCs and the first to reach the target
 * on the left, top soul winners on the right. Shown on wide screens only, so
 * the total in the middle always has room.
 */
export function ScreenBoards({ board }: { board: SwLeaderboard | null }) {
  if (!board) return null;
  const { target } = board;
  return (
    <>
      <aside className="pointer-events-none absolute left-[clamp(0.75rem,1.6vw,2rem)] top-[18%] z-10 hidden w-[clamp(15rem,21vw,28rem)] flex-col gap-[1.6vh] lg:flex">
        <Panel icon={<Users className="h-[2.2vh] w-[2.2vh]" />} title="Top PFCCs">
          {board.pfccs.length === 0 ? (
            <Empty>Waiting for the first soul</Empty>
          ) : (
            board.pfccs.slice(0, 5).map((p, i) => (
              <Row key={p.pfcc} rank={i} label={p.pfcc} sub={`${p.members} ${p.members === 1 ? "member" : "members"}`} value={p.souls} />
            ))
          )}
        </Panel>
        <Panel
          icon={<Award className="h-[2.2vh] w-[2.2vh]" />}
          title={`Reached ${target}`}
          badge={board.completed.length > 0 ? String(board.completed.length) : undefined}
        >
          {board.completed.length === 0 ? (
            <Empty>Who will be first to {target}?</Empty>
          ) : (
            board.completed.slice(0, 5).map((m, i) => (
              <Row key={`${m.name}-${m.reached_at}`} rank={i} label={m.name} sub={m.pfcc} value={m.souls} done />
            ))
          )}
          {board.completed.length > 5 && (
            <p className="mt-[0.6vh] text-[1.6vh] text-[#78716c]">+{board.completed.length - 5} more have reached {target}</p>
          )}
        </Panel>
      </aside>

      <aside className="pointer-events-none absolute right-[clamp(0.75rem,1.6vw,2rem)] top-[18%] z-10 hidden w-[clamp(15rem,21vw,28rem)] flex-col lg:flex">
        <Panel icon={<Trophy className="h-[2.2vh] w-[2.2vh]" />} title="Top soul winners">
          {board.members.length === 0 ? (
            <Empty>Waiting for the first soul</Empty>
          ) : (
            board.members.slice(0, 8).map((m, i) => (
              <Row key={`${m.name}-${i}`} rank={i} label={m.name} sub={m.pfcc} value={m.souls} done={m.souls >= target} />
            ))
          )}
        </Panel>
      </aside>
    </>
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
      <div className="animate-[sw-pop_0.5s_ease-out] rounded-[2vh] border border-[#3ba6f1]/30 bg-white/95 px-[4vh] py-[2.4vh] text-center shadow-[0_2vh_6vh_rgba(17,12,46,0.18)] backdrop-blur">
        <p className="text-[2vh] font-medium uppercase tracking-[0.2em] text-[#3398e1]">🎉 Congratulations</p>
        <p className="mt-[0.8vh] font-roobert text-[4.6vh] leading-tight tracking-[-0.02em] text-[#0c0a09]">{current.name}</p>
        <p className="mt-[0.6vh] text-[2.2vh] text-[#57534e]">
          reached {board.target} souls{current.pfcc && current.pfcc !== "Not given" ? ` · ${current.pfcc}` : ""}
        </p>
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.6vh] border border-[#e8e6e5] bg-white/90 p-[1.8vh] shadow-[0_0.8vh_3vh_rgba(0,0,0,0.06)] backdrop-blur">
      <h2 className="mb-[1vh] flex items-center gap-[0.8vh] text-[1.9vh] font-medium uppercase tracking-[0.12em] text-[#57534e]">
        <span className="text-[#3398e1]">{icon}</span>
        {title}
        {badge && (
          <span className="ml-auto rounded-full bg-[#3ba6f1] px-[1vh] py-[0.2vh] text-[1.7vh] font-semibold text-white">{badge}</span>
        )}
      </h2>
      <ol className="space-y-[0.7vh]">{children}</ol>
    </section>
  );
}

function Row({
  rank,
  label,
  sub,
  value,
  done,
}: {
  rank: number;
  label: string;
  sub?: string;
  value: number;
  done?: boolean;
}) {
  return (
    <li className="flex items-center gap-[1vh]">
      <span className="w-[3vh] shrink-0 text-center text-[2vh] tabular-nums text-[#a8a29e]">
        {MEDALS[rank] ?? rank + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[0.6vh] truncate text-[2.2vh] font-medium text-[#0c0a09]">
          <span className="truncate">{label}</span>
          {done && <CheckCircle2 className="h-[2vh] w-[2vh] shrink-0 text-[#16a34a]" aria-label="Reached the target" />}
        </span>
        {sub && <span className="block truncate text-[1.6vh] text-[#78716c]">{sub}</span>}
      </span>
      <span className="shrink-0 font-roobert text-[2.6vh] tabular-nums text-[#3398e1]">{value}</span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="text-[1.8vh] text-[#a8a29e]">{children}</li>;
}
