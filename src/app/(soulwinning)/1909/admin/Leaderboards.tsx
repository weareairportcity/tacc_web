"use client";

import { Download } from "lucide-react";
import { downloadCsv, rankingsCsv, type Dimension, type LeaderboardRow } from "@/lib/soulwinning/admin";

const TABS: { key: Dimension; label: string }[] = [
  { key: "fellowship", label: "Fellowships" },
  { key: "pfcc", label: "PFCCs" },
  { key: "entrant", label: "Individuals" },
];

interface Props {
  dimension: Dimension;
  onDimensionChange: (dimension: Dimension) => void;
  rows: LeaderboardRow[];
  campaignSlug: string;
}

export function Leaderboards({ dimension, onDimensionChange, rows, campaignSlug }: Props) {
  const top = rows[0]?.souls ?? 0;

  return (
    <section className="rounded-xl border border-[#e8e6e5] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onDimensionChange(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                dimension === tab.key
                  ? "bg-[#c1e1f7] text-[#3398e1]"
                  : "text-[#78716c] hover:bg-[#fafaf9]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            downloadCsv(`${campaignSlug}-${dimension}-rankings.csv`, rankingsCsv(dimension, rows))
          }
          className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e5] px-3 py-1.5 text-xs font-medium text-[#78716c]"
        >
          <Download className="h-3.5 w-3.5" />
          Rankings CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#a8a29e]">No souls logged for this filter yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[#e8e6e5] text-left text-xs text-[#a8a29e]">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 text-right font-medium">Souls</th>
                <th className="pb-2 text-right font-medium">Tongues</th>
                <th className="pb-2 text-right font-medium">Church</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`} className="border-b border-[#f2f2f2] last:border-0">
                  <td className="py-2.5 text-[#a8a29e]">{index + 1}</td>
                  <td className="py-2.5">
                    <span className="block text-[#0c0a09]">{row.label}</span>
                    {row.sublabel && <span className="block text-xs text-[#a8a29e]">{row.sublabel}</span>}
                    {/* The bar is a secondary read of the same number in the row. */}
                    <span className="mt-1 block h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-[#f2f2f2]">
                      <span
                        className="block h-full rounded-full bg-[#3398e1]"
                        style={{ width: `${top ? (row.souls / top) * 100 : 0}%` }}
                      />
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-[#0c0a09]">{row.souls}</td>
                  <td className="py-2.5 text-right tabular-nums text-[#78716c]">
                    {row.tongues}
                    <span className="ml-1 text-xs text-[#a8a29e]">
                      {row.souls ? Math.round((row.tongues / row.souls) * 100) : 0}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[#78716c]">
                    {row.church}
                    <span className="ml-1 text-xs text-[#a8a29e]">
                      {row.souls ? Math.round((row.church / row.souls) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
