"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ClearEntriesControl } from "./ClearEntriesControl";

/** Every entry, searchable — the raw record behind all the aggregates. */

export type Entry = {
  id: string;
  soul_name: string;
  phone: string | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  duplicate_status: string;
  counted: boolean;
  photo_path: string | null;
  created_at: string;
  sw_entrants: { name: string; fellowship: string | null; pfcc: string | null } | null;
};

const PAGE = 100;

export function EntriesTable({
  campaignId,
  campaignName,
  previewRows,
  onCleared,
}: {
  campaignId: string;
  campaignName?: string;
  previewRows?: Entry[];
  onCleared?: () => void;
}) {
  const [rows, setRows] = useState<Entry[] | null>(previewRows ?? null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (previewRows) {
      setRows(previewRows);
      return;
    }

    let cancelled = false;

    void (async () => {
      setRows(null);
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("sw_soul_entries")
        .select(
          "id, soul_name, phone, spoke_in_tongues, coming_to_church, duplicate_status, counted, photo_path, created_at, sw_entrants(name, fellowship, pfcc)"
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (cancelled) return;
      if (queryError) setError(queryError.message);
      else setRows((data as unknown as Entry[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [campaignId, previewRows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.soul_name, row.phone, row.sw_entrants?.name, row.sw_entrants?.fellowship, row.sw_entrants?.pfcc]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [rows, query]);

  if (error) return <p className="text-sm text-[#f54911]">{error}</p>;
  if (!rows) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#e8e6e5] bg-white py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#a8a29e]" />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#e8e6e5] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e8e6e5] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[#a8a29e]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, member, fellowship or PFCC"
            className="min-w-0 flex-1 text-sm outline-none placeholder:text-[#d6d3d1]"
          />
        </div>
        <p className="text-xs text-[#a8a29e]">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[#e8e6e5] text-left text-xs text-[#a8a29e]">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Phone</th>
              <th className="pb-2 font-medium">Won by</th>
              <th className="pb-2 font-medium">Fellowship</th>
              <th className="pb-2 font-medium">PFCC</th>
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((row) => (
              <tr key={row.id} className="border-b border-[#f2f2f2] last:border-0">
                <td className="py-2.5 text-[#0c0a09]">
                  {row.soul_name}
                  {row.photo_path && <span className="ml-1.5 text-[10px] text-[#3398e1]">photo</span>}
                  {!row.counted && (
                    <span className="ml-1.5 rounded-full bg-[#f54911]/10 px-1.5 text-[10px] text-[#f54911]">
                      {row.duplicate_status === "pending" ? "review" : row.duplicate_status}
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-[#78716c]">{row.phone || "—"}</td>
                <td className="py-2.5 text-[#78716c]">{row.sw_entrants?.name ?? "—"}</td>
                <td className="py-2.5 text-[#78716c]">{row.sw_entrants?.fellowship || "—"}</td>
                <td className="py-2.5 text-[#78716c]">{row.sw_entrants?.pfcc || "—"}</td>
                <td className="py-2.5 text-[#a8a29e]">
                  {new Date(row.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2.5">
                  <span className="flex flex-wrap gap-1">
                    {row.spoke_in_tongues && (
                      <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">
                        tongues
                      </span>
                    )}
                    {row.coming_to_church && (
                      <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">
                        church
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((prev) => prev + PAGE)}
          className="mt-4 w-full rounded-lg border border-[#e8e6e5] py-2.5 text-sm font-medium text-[#78716c]"
        >
          Show {Math.min(PAGE, filtered.length - limit)} more
        </button>
      )}

      {campaignName && !previewRows && (
        <ClearEntriesControl
          campaignId={campaignId}
          campaignName={campaignName}
          entryCount={rows.length}
          onCleared={() => {
            setRows([]);
            setQuery("");
            setLimit(PAGE);
            onCleared?.();
          }}
        />
      )}
    </section>
  );
}
