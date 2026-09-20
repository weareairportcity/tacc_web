"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileArchive, FileText, Loader2 } from "lucide-react";
import {
  download,
  exportSeparatedZip,
  exportSingle,
  fetchExportRows,
  type ExportRow,
  type Format,
} from "@/lib/soulwinning/export";
import { fetchHourly, fetchLeaderboard, fetchOverview } from "@/lib/soulwinning/admin";
import { buildSummaryPdf, loadLogo } from "@/lib/soulwinning/summary-pdf";
import type { SwCampaign } from "@/lib/soulwinning/types";

export function ExportPanel({ campaign }: { campaign: SwCampaign }) {
  const [rows, setRows] = useState<ExportRow[] | null>(null);
  const [scope, setScope] = useState("all");
  const [format, setFormat] = useState<Format>("csv");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // setRows runs in the promise callback, not synchronously in the effect.
    fetchExportRows(campaign.id)
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  const { fellowships, pfccs } = useMemo(() => {
    return {
      fellowships: [...new Set((rows ?? []).map((row) => row.fellowship))].sort(),
      pfccs: [...new Set((rows ?? []).map((row) => row.pfcc))].sort(),
    };
  }, [rows]);

  const parsedScope = useMemo(() => {
    if (scope === "all") return { kind: "all" } as const;
    const [kind, ...rest] = scope.split(":");
    return { kind: kind as "fellowship" | "pfcc", value: rest.join(":") };
  }, [scope]);

  const count = useMemo(() => {
    if (!rows) return 0;
    const scoped =
      parsedScope.kind === "all"
        ? rows
        : rows.filter(
            (row) => (parsedScope.kind === "fellowship" ? row.fellowship : row.pfcc) === parsedScope.value
          );
    return scoped.reduce((sum, row) => sum + row.souls, 0);
  }, [rows, parsedScope]);

  const totalSouls = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + row.souls, 0),
    [rows]
  );

  if (error) return <p className="text-sm text-[#f54911]">{error}</p>;
  if (!rows) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#e8e6e5] bg-white py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#a8a29e]" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-[#e8e6e5] bg-white p-5 lg:col-span-2">
        <h3 className="font-roobert text-base text-[#0c0a09]">One-page summary</h3>
        <p className="mb-4 text-xs text-[#a8a29e]">
          The day on one sheet: the total against the goal, tongues and church, top fellowships,
          PFCCs and members, and how the hours moved. No names of the souls.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("summary");
            setError(null);
            try {
              const hours = { from: null, to: null };
              const [overview, fellowships, pfccs, members, hourly, logo] = await Promise.all([
                fetchOverview(campaign.id, hours),
                fetchLeaderboard(campaign.id, "fellowship", hours, 12),
                fetchLeaderboard(campaign.id, "pfcc", hours, 12),
                fetchLeaderboard(campaign.id, "entrant", hours, 12),
                fetchHourly(campaign.id),
                loadLogo(),
              ]);
              if (!overview) throw new Error("Could not load the day's totals");
              download(
                `${campaign.slug}-summary.pdf`,
                buildSummaryPdf({
                  campaign,
                  overview,
                  fellowships,
                  pfccs,
                  members,
                  hourly,
                  logo,
                })
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not build the summary");
            } finally {
              setBusy(null);
            }
          }}
          className="flex w-full max-w-md items-center justify-center gap-2 rounded-lg bg-[#3ba6f1] px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy === "summary" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Download summary PDF
        </button>
      </section>

      <section className="rounded-xl border border-[#e8e6e5] bg-white p-5">
        <h3 className="font-roobert text-base text-[#0c0a09]">One file</h3>
        <p className="mb-4 text-xs text-[#a8a29e]">
          Everything, or a single fellowship or PFCC. Names, phones, outcomes and who won them — no
          ids, coordinates or sync details.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">Category</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="w-full rounded-lg border border-[#e8e6e5] px-3 py-2.5 text-sm outline-none focus:border-[#3ba6f1]"
            >
              <option value="all">All souls ({totalSouls})</option>
              <optgroup label="Fellowships">
                {fellowships.map((value) => (
                  <option key={value} value={`fellowship:${value}`}>
                    {value}
                  </option>
                ))}
              </optgroup>
              <optgroup label="PFCCs">
                {pfccs.map((value) => (
                  <option key={value} value={`pfcc:${value}`}>
                    {value}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="flex gap-1">
            {(["csv", "pdf"] as Format[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFormat(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase ${
                  format === option ? "bg-[#c1e1f7] text-[#3398e1]" : "text-[#78716c] hover:bg-[#fafaf9]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => exportSingle(rows, campaign, format, parsedScope)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0c0a09] px-4 py-3 text-sm font-medium text-white"
          >
            <Download className="h-4 w-4" />
            Download {count} {count === 1 ? "soul" : "souls"} as {format.toUpperCase()}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[#e8e6e5] bg-white p-5">
        <h3 className="font-roobert text-base text-[#0c0a09]">Everything, separated</h3>
        <p className="mb-4 text-xs text-[#a8a29e]">
          One zip holding the overall list plus a file for each of the {fellowships.length} fellowships
          and {pfccs.length} PFCCs — so each leader can be handed just their own sheet.
        </p>

        <div className="space-y-2">
          {([
            { key: "csv", label: "CSV only", formats: ["csv"] as Format[] },
            { key: "pdf", label: "PDF only", formats: ["pdf"] as Format[] },
            { key: "both", label: "CSV and PDF", formats: ["csv", "pdf"] as Format[] },
          ]).map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(option.key);
                try {
                  await exportSeparatedZip(rows, campaign, option.formats);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Export failed");
                } finally {
                  setBusy(null);
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e8e6e5] px-4 py-3 text-sm font-medium text-[#78716c] disabled:opacity-40"
            >
              {busy === option.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
