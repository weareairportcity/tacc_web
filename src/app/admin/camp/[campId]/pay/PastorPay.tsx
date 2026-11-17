"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { leaveTo } from "@/components/camp/leave";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { ErrorText, RegistrationStatus, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { formatCedis } from "@/lib/camp/money";
import { cn } from "@/lib/utils";
import { payForPeopleAction } from "../../actions";

export type PayRow = { id: string; full_name: string; fellowship: string; status: string; price: number; paid: number };

const cedis = (p: number) => formatCedis(p).replace(/\.00$/, "");
const owes = (r: PayRow) => Math.max(0, r.price - r.paid);
/** expressPay checkouts are made for up to 100 people at a time. */
const MAX = 100;

/** Search, tick, pay. Only people with something left to pay can be ticked. */
export function PastorPay({ campId, rows }: { campId: string; rows: PayRow[] }) {
  const [q, setQ] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (everyone || owes(r) > 0) && (!term || r.full_name.toLowerCase().includes(term) || r.fellowship.toLowerCase().includes(term)));
  }, [rows, q, everyone]);
  const chosen = rows.filter((r) => picked.has(r.id));
  const total = chosen.reduce((n, r) => n + owes(r), 0);
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX) next.add(id);
      return next;
    });
  const owingShown = shown.filter((r) => owes(r) > 0);
  const allShownPicked = owingShown.length > 0 && owingShown.every((r) => picked.has(r.id));

  return (
    <div className="flex flex-col gap-4 pb-28">
      <label className="relative flex">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or fellowship" aria-label="Search people" className={`${inputClass} pl-10`} />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Show" className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {[
            [false, "Not fully paid"],
            [true, "Everyone"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={everyone === value}
              onClick={() => setEveryone(value as boolean)}
              className={cn("cm-press h-9 rounded-full px-4 text-sm font-medium", everyone === value ? "bg-soot text-white" : "text-[#57534e]")}
            >
              {label as string}
            </button>
          ))}
        </div>
        {owingShown.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setPicked((s) => {
                const next = new Set(s);
                if (allShownPicked) owingShown.forEach((r) => next.delete(r.id));
                else for (const r of owingShown) if (next.size < MAX) next.add(r.id);
                return next;
              })
            }
            className="cm-press h-9 rounded-full px-3 text-sm font-medium text-[#57534e]"
          >
            {allShownPicked ? "Untick these" : `Tick all ${Math.min(owingShown.length, MAX)}`}
          </button>
        )}
      </div>

      <p role="status" className="text-sm font-semibold">
        {shown.length} {shown.length === 1 ? "person" : "people"}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">{everyone || q ? "Nobody here." : "Everyone has paid in full."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {shown.slice(0, 400).map((r) => {
            const left = owes(r);
            const on = picked.has(r.id);
            return (
              <li key={r.id} className="border-t border-stone-border first:border-t-0">
                <label className={cn("cm-row flex min-h-[60px] items-center gap-3.5 px-4 py-2.5", left > 0 ? "cursor-pointer" : "opacity-70")}>
                  <input type="checkbox" className="peer sr-only" checked={on} disabled={left === 0} onChange={() => toggle(r.id)} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-full border peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-signal",
                      on ? "border-soot bg-soot text-white" : "border-stone-muted bg-white",
                      left === 0 && "invisible",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{r.full_name}</span>
                    <span className="truncate text-[13px] text-warm-gray">{r.fellowship}</span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    {left > 0 ? <span className="text-[15px] tabular-nums">{cedis(left)}</span> : <RegistrationStatus status={r.status} />}
                    {left > 0 && <span className="text-[12px] text-warm-gray">left to pay</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-30 px-4 lg:bottom-6 lg:left-[216px]">
          <div className="mx-auto flex max-w-[640px] flex-col gap-2 rounded-2xl bg-white p-3 shadow-[0_16px_40px_rgba(17,12,46,0.16)]">
            {error && <ErrorText>{error}</ErrorText>}
            <button
              type="button"
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const r = await payForPeopleAction(campId, chosen.map((p) => p.id), "");
                  if (!r.ok) return setError(r.error);
                  await leaveTo(r.data);
                })
              }
              className={`${primaryButtonClass} h-[52px] w-full`}
            >
              {pending ? "Opening expressPay…" : `Pay ${cedis(total)} for ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}
            </button>
            <button type="button" onClick={() => setPicked(new Set())} className="h-8 text-[13px] text-warm-gray">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
