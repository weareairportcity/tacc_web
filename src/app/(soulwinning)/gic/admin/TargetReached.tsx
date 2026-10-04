"use client";

import { useEffect, useState } from "react";
import { Award, Download, Loader2 } from "lucide-react";
import { downloadCsv, fetchTargetReached, toCsv, type TargetRow } from "@/lib/soulwinning/admin";

const MEDALS = ["🥇", "🥈", "🥉"];
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" });

/** Members who reached the per-member target, in the order they got there. */
export function TargetReached({
  campaignId,
  campaignSlug,
  refreshKey,
}: {
  campaignId: string;
  campaignSlug: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<{ target: number; rows: TargetRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTargetReached(campaignId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshKey]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `${campaignSlug}-reached-${data.target}.csv`,
      toCsv(
        ["order", "name", "fellowship", "pfcc", "phone", "souls", "reached_target_at"],
        data.rows.map((r, i) => [i + 1, r.name, r.fellowship, r.pfcc, r.phone, r.souls, r.reached_at]),
      ),
    );
  };

  return (
    <section className="rounded-xl border border-[#e8e6e5] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-roobert text-lg text-[#0c0a09]">
            <Award className="h-5 w-5 text-[#3398e1]" />
            Reached the target{data ? ` of ${data.target}` : ""}
          </h2>
          <p className="text-xs text-[#a8a29e]">In the order they got there — the first to reach it at the top.</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="rounded-full bg-[#c1e1f7]/60 px-3 py-1 text-sm font-medium text-[#3398e1]">
              {data.rows.length} {data.rows.length === 1 ? "member" : "members"}
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || data.rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e5] px-3 py-2 text-xs font-medium text-[#78716c] disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-[#f54911]">{error}</p>
      ) : !data ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#a8a29e]" />
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-[#a8a29e]">Nobody has reached {data.target} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[#a8a29e]">
              <tr>
                <th className="py-2 pr-3 font-normal">#</th>
                <th className="py-2 pr-3 font-normal">Member</th>
                <th className="py-2 pr-3 font-normal">PFCC</th>
                <th className="py-2 pr-3 font-normal">Reached at</th>
                <th className="py-2 text-right font-normal">Souls now</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.name}-${r.reached_at}`} className="border-t border-[#f2f2f2]">
                  <td className="py-2 pr-3 text-[#a8a29e]">{MEDALS[i] ?? i + 1}</td>
                  <td className="py-2 pr-3 text-[#0c0a09]">
                    {r.name}
                    {r.fellowship && <span className="block text-xs text-[#a8a29e]">{r.fellowship}</span>}
                  </td>
                  <td className="py-2 pr-3 text-[#78716c]">{r.pfcc || "Not given"}</td>
                  <td className="py-2 pr-3 tabular-nums text-[#78716c]">{time(r.reached_at)}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-[#3398e1]">{r.souls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
