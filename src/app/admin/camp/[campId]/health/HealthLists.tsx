"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PersonPanel } from "../people/PersonPanel";
import { headlineClass, inputClass } from "@/components/camp/ui";
import { PeopleTabs } from "@/components/camp/PeopleTabs";
import type { HealthRow } from "@/lib/camp/profile";
import { cn } from "@/lib/utils";

const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

const missingWhat = (r: HealthRow) => {
  const emergency = Boolean(r.emergency_name.trim() && r.emergency_phone);
  const health = Boolean(r.health_none || r.health_notes.trim());
  if (!emergency && !health) return "Emergency contact and health";
  if (!emergency) return "Emergency contact";
  return "Health";
};

const healthLabel = (r: HealthRow) => (r.health_none ? "No conditions" : r.health_notes.trim() || "—");

/** Two tables: who has answered, and who still needs to. Tap a name for their panel. */
export function HealthLists({ campId, added, missing }: { campId: string; added: HealthRow[]; missing: HealthRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const shownAdded = useMemo(
    () => added.filter((r) => !term || r.full_name.toLowerCase().includes(term) || r.fellowship.toLowerCase().includes(term)),
    [added, term],
  );
  const shownMissing = useMemo(
    () => missing.filter((r) => !term || r.full_name.toLowerCase().includes(term) || r.fellowship.toLowerCase().includes(term)),
    [missing, term],
  );
  const people = `/admin/camp/${campId}/people`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Health</h1>
        <PeopleTabs base={people} current="health" health />
        <p className="text-[15px] text-warm-gray">
          {added.length} {added.length === 1 ? "person has" : "people have"} added an emergency contact and health details.
          {missing.length ? ` ${missing.length} ${missing.length === 1 ? "has" : "haven’t"} yet.` : ""}
        </p>
      </header>

      <label className="relative flex">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or fellowship" aria-label="Search people" className={`${inputClass} pl-10`} />
      </label>

      <HealthTable
        title="Added"
        empty="Nobody has added an emergency contact and health details yet."
        rows={shownAdded}
        columns={["Name", "Fellowship", "Emergency", "Health"]}
        onOpen={setPerson}
        cell={(r) => [r.full_name, r.fellowship, r.emergency_name ? `${r.emergency_name} · ${localPhone(r.emergency_phone)}` : "—", healthLabel(r)]}
      />

      <HealthTable
        title="Not added yet"
        empty="Everyone registered has added their emergency contact and health details."
        rows={shownMissing}
        columns={["Name", "Fellowship", "Still to add"]}
        onOpen={setPerson}
        cell={(r) => [r.full_name, r.fellowship, missingWhat(r)]}
      />

      <PersonPanel key={person ?? "none"} campId={campId} id={person} onClose={() => setPerson(null)} onChanged={() => router.refresh()} />
    </div>
  );
}

function HealthTable({
  title,
  empty,
  rows,
  columns,
  onOpen,
  cell,
}: {
  title: string;
  empty: string;
  rows: HealthRow[];
  columns: string[];
  onOpen: (id: string) => void;
  cell: (r: HealthRow) => string[];
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-baseline justify-between text-[15px] font-semibold">
        {title}
        <span className="font-sans text-[13px] font-normal text-warm-gray tabular-nums">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          <table className="w-full border-collapse text-sm">
            <thead className="max-sm:sr-only">
              <tr className="text-left text-xs text-warm-gray">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cells = cell(r);
                return (
                  <tr key={r.id} className="cm-row cursor-pointer border-t border-stone-border first:border-t-0 sm:first:border-t" onClick={() => onOpen(r.id)}>
                    {cells.map((v, i) => (
                      <td key={columns[i]} className={cn("px-4 py-3 align-top", i === 0 ? "font-medium" : "text-warm-gray max-sm:hidden")}>
                        {i === 0 ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="text-ink-black">{v}</span>
                            <span className="text-[13px] font-normal text-warm-gray sm:hidden">{cells.slice(1).join(" · ")}</span>
                          </span>
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
