"use client";

import { useState } from "react";
import { Check, Loader2, Merge } from "lucide-react";
import { resolveDuplicate, type DuplicateRow } from "@/lib/soulwinning/admin";

/**
 * Flagged entries are saved but held out of the official count until reviewed
 * (plan §11). "Separate soul" counts it; "Merge" keeps it on record but leaves
 * it out of the total. Nothing is ever deleted.
 */

interface Props {
  rows: DuplicateRow[];
  onResolved: () => void;
}

const time = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function DuplicateQueue({ rows, onResolved }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (id: string, status: "unique" | "merged") => {
    setBusyId(id);
    setError(null);
    try {
      await resolveDuplicate(id, status);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that entry");
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#e8e6e5] bg-white p-6 text-center">
        <p className="text-sm text-[#78716c]">Nothing to review.</p>
        <p className="mt-1 text-xs text-[#a8a29e]">
          Entries matching a name and phone already logged today appear here, and stay out of the
          public count until you decide.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[#f54911]">{error}</p>}

      {rows.map((row) => (
        <div key={row.id} className="rounded-xl border border-[#e8e6e5] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-[#0c0a09]">{row.soul_name}</p>
              <p className="text-xs text-[#78716c]">
                {row.phone || "No phone"} · logged by {row.entrant_name} at {time(row.created_at)}
              </p>
              {row.original_id ? (
                <p className="mt-2 rounded-lg bg-[#fafaf9] px-3 py-2 text-xs text-[#78716c]">
                  Matches an entry by {row.original_entrant_name} at{" "}
                  {row.original_created_at ? time(row.original_created_at) : "—"}
                </p>
              ) : (
                <p className="mt-2 text-xs text-[#a8a29e]">
                  The entry it matched has since been removed.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => resolve(row.id, "unique")}
                className="flex items-center gap-1.5 rounded-lg bg-[#3ba6f1] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Separate soul
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => resolve(row.id, "merged")}
                className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e5] px-3 py-2 text-xs font-medium text-[#78716c] disabled:opacity-40"
              >
                <Merge className="h-3.5 w-3.5" />
                Merge
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
