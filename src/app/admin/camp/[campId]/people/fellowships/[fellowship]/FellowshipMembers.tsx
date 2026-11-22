"use client";

import { useState } from "react";
import { ChevronRight, CreditCard, Search } from "lucide-react";
import { leaveTo } from "@/components/camp/leave";
import { PersonCardSheet } from "@/components/camp/PersonCard";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { useToast } from "@/components/camp/toast";
import { Legend, RegistrationStatus, StackedBar, inputClass, primaryButtonClass, statusParts } from "@/components/camp/ui";
import { formatCedis } from "@/lib/camp/money";
import { cn } from "@/lib/utils";
import { payForPeopleAction } from "../../../../actions";
import { PersonPanel } from "../../PersonPanel";

export type Member = { id: string; full_name: string; status: string; price: number; paid: number; room: string | null };

const cedis = (p: number) => formatCedis(p).replace(/\.00$/, "");
const SHOW = [
  ["", "Everyone"],
  ["fully_paid", "Fully paid"],
  ["partially_paid", "Part paid"],
  ["registered", "Nothing paid"],
] as const;

/** A fellowship's people: a summary, a filter, the list. Tap someone for their details. */
export function FellowshipMembers({ campId, leader, rows }: { campId: string; leader: boolean; rows: Member[] }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [show, setShow] = useState<string>("");
  const [person, setPerson] = useState<string | null>(null);
  const [pending, start] = useOneAtATime();
  const live = rows.filter((r) => r.status !== "cancelled");
  const count = (s: string) => live.filter((r) => r.status === s).length;
  const paid = live.reduce((n, r) => n + r.paid, 0);
  const expected = live.reduce((n, r) => n + r.price, 0);
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (show ? r.status === show : true) && (!term || r.full_name.toLowerCase().includes(term)));

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Summary" className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
        <p className="text-[17px] leading-snug">
          <strong className="font-display text-[36px] font-normal leading-none tracking-[-0.03em] tabular-nums">{live.length}</strong>
          <span className="text-warm-gray"> registered · {cedis(paid)} of {cedis(expected)} paid</span>
        </p>
        <StackedBar className="h-2" parts={statusParts({ fully_paid: count("fully_paid"), partially_paid: count("partially_paid"), registered: count("registered") }, false)} />
        <Legend parts={statusParts({ fully_paid: count("fully_paid"), partially_paid: count("partially_paid"), registered: count("registered") }, false)} />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search people" className={`${inputClass} pl-10`} />
        </label>
        <div role="group" aria-label="Show" className="flex gap-1 overflow-x-auto rounded-full border border-stone-border bg-white p-[3px]">
          {SHOW.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={show === key}
              onClick={() => setShow(key)}
              className={cn("cm-press h-9 flex-none rounded-full px-3.5 text-[13px] font-medium", show === key ? "bg-soot text-white" : "text-[#57534e]")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p role="status" className="text-sm font-semibold">
        {shown.length} {shown.length === 1 ? "person" : "people"}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">Nobody here.</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {shown.map((r) => {
            const left = Math.max(0, r.price - r.paid);
            return (
              <li key={r.id} className="border-t border-stone-border first:border-t-0">
                <button type="button" onClick={() => setPerson(r.id)} className="cm-row flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{r.full_name}</span>
                    <span className="truncate text-[13px] text-warm-gray">
                      {r.status === "cancelled" ? "Cancelled" : left > 0 ? `${cedis(left)} left to pay` : "Paid in full"}
                      {r.room ? ` · ${r.room}` : ""}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <RegistrationStatus status={r.status} />
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {leader ? (
        <PersonCardSheet
          campId={campId}
          personId={person}
          leader
          canMessage
          onClose={() => setPerson(null)}
          actions={(p) =>
            p.status !== "cancelled" &&
            p.price_pesewas > p.paid_pesewas && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await payForPeopleAction(campId, [p.id], "");
                    if (!r.ok) return toast(r.error, { tone: "error" });
                    await leaveTo(r.data);
                  })
                }
                className={`${primaryButtonClass} h-11 px-5`}
              >
                <CreditCard className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Pay {cedis(p.price_pesewas - p.paid_pesewas)} for them
              </button>
            )
          }
        />
      ) : (
        <PersonPanel key={person ?? "none"} campId={campId} id={person} onClose={() => setPerson(null)} onChanged={() => undefined} />
      )}
    </div>
  );
}
