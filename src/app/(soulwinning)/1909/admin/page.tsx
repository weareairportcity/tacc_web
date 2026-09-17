"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  downloadCsv,
  exportRawEntries,
  fetchCampaigns,
  fetchDuplicates,
  fetchHourly,
  fetchLeaderboard,
  fetchOverview,
  type Dimension,
  type DuplicateRow,
  type HourFilter,
  type HourlyRow,
  type LeaderboardRow,
  type Overview,
} from "@/lib/soulwinning/admin";
import type { SwCampaign } from "@/lib/soulwinning/types";
import { CumulativeChart, RatesChart, SoulsPerHourChart } from "./Charts";
import { DuplicateQueue } from "./DuplicateQueue";
import { Leaderboards } from "./Leaderboards";
import { SmsPanel } from "./SmsPanel";

// Leaflet touches window on import, so the map only loads in the browser.
const SoulMap = dynamic(() => import("./SoulMap").then((mod) => mod.SoulMap), {
  ssr: false,
  loading: () => <p className="p-5 text-sm text-[#a8a29e]">Loading map…</p>,
});

type Tab = "overview" | "map" | "duplicates" | "sms";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Map" },
  { key: "duplicates", label: "Duplicates" },
  { key: "sms", label: "SMS" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const hourLabel = (hour: number) => {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
};

export default function SoulWinningAdmin() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [campaigns, setCampaigns] = useState<SwCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [hours, setHours] = useState<HourFilter>({ from: null, to: null });
  const [dimension, setDimension] = useState<Dimension>("fellowship");
  const [tab, setTab] = useState<Tab>("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campaign = campaigns.find((row) => row.id === campaignId) ?? null;

  // Same gate as the rest of the admin area: a row in admin_roles decides.
  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/admin/login");
        return;
      }

      const { data: role } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (!role || !["soulwinning", "both"].includes(role.role)) {
        router.push("/admin/login");
        return;
      }

      const rows = await fetchCampaigns();
      setCampaigns(rows);
      setCampaignId(rows.find((row) => row.active)?.id ?? rows[0]?.id ?? null);
      setIsChecking(false);
    })();
  }, [router]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [nextOverview, nextLeaderboard, nextHourly, nextDuplicates] = await Promise.all([
        fetchOverview(campaignId, hours),
        fetchLeaderboard(campaignId, dimension, hours),
        fetchHourly(campaignId),
        fetchDuplicates(campaignId),
      ]);
      setOverview(nextOverview);
      setLeaderboard(nextLeaderboard);
      setHourly(nextHourly);
      setDuplicates(nextDuplicates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, dimension, hours]);

  useEffect(() => {
    // load() raises a loading flag before it awaits anything, which must not
    // happen synchronously inside an effect; a task boundary keeps that out of
    // the same render pass.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const reloadCampaigns = useCallback(async () => {
    setCampaigns(await fetchCampaigns());
  }, []);

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fafaf9]">
        <Loader2 className="h-5 w-5 animate-spin text-[#a8a29e]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafaf9] px-4 py-6 font-sans sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={140} height={49} className="h-8 w-auto object-contain" />
            <div>
              <h1 className="font-roobert text-xl tracking-[-0.02em] text-[#0c0a09]">
                Soul Winning admin
              </h1>
              <p className="text-xs text-[#a8a29e]">{campaign?.name ?? "No campaign"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e5] bg-white px-3 py-2 text-xs font-medium text-[#78716c]"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </header>

        {/* Filters in one row above everything they affect. */}
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-[#e8e6e5] bg-white p-4">
          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">Campaign</span>
            <select
              value={campaignId ?? ""}
              onChange={(event) => setCampaignId(event.target.value)}
              className="rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            >
              {campaigns.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">From hour</span>
            <select
              value={hours.from ?? ""}
              onChange={(event) =>
                setHours((prev) => ({ ...prev, from: event.target.value === "" ? null : Number(event.target.value) }))
              }
              className="rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            >
              <option value="">Any</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">To hour</span>
            <select
              value={hours.to ?? ""}
              onChange={(event) =>
                setHours((prev) => ({ ...prev, to: event.target.value === "" ? null : Number(event.target.value) }))
              }
              className="rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            >
              <option value="">Any</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </label>

          {(hours.from !== null || hours.to !== null) && (
            <button
              type="button"
              onClick={() => setHours({ from: null, to: null })}
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#3398e1]"
            >
              Clear hours
            </button>
          )}

          <div className="ml-auto">
            <button
              type="button"
              disabled={!campaign || isExporting}
              onClick={async () => {
                if (!campaign) return;
                setIsExporting(true);
                try {
                  downloadCsv(`${campaign.slug}-entries.csv`, await exportRawEntries(campaign.id));
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Export failed");
                } finally {
                  setIsExporting(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[#0c0a09] px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Raw entries CSV
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-[#f54911]/30 bg-[#f54911]/5 px-4 py-3 text-sm text-[#f54911]">
            {error}
          </p>
        )}

        <nav className="mb-5 flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                tab === item.key ? "bg-[#0c0a09] text-white" : "text-[#78716c] hover:bg-white"
              }`}
            >
              {item.label}
              {item.key === "duplicates" && duplicates.length > 0 && (
                <span className="ml-1.5 rounded-full bg-[#f54911] px-1.5 text-[10px] text-white">
                  {duplicates.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Souls" value={overview?.total_souls ?? 0} />
              <Tile
                label="Spoke in tongues"
                value={overview?.tongues_count ?? 0}
                share={overview ? pct(overview.tongues_count, overview.total_souls) : 0}
              />
              <Tile
                label="Coming to church"
                value={overview?.church_count ?? 0}
                share={overview ? pct(overview.church_count, overview.total_souls) : 0}
              />
              <Tile label="Volunteers entering" value={overview?.entrant_count ?? 0} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SoulsPerHourChart rows={hourly} />
              <CumulativeChart rows={hourly} />
            </div>
            <RatesChart rows={hourly} />

            <Leaderboards
              dimension={dimension}
              onDimensionChange={setDimension}
              rows={leaderboard}
              campaignSlug={campaign?.slug ?? "campaign"}
            />
          </div>
        )}

        {tab === "map" && campaign && <SoulMap campaignId={campaign.id} />}

        {tab === "duplicates" && <DuplicateQueue rows={duplicates} onResolved={() => void load()} />}

        {tab === "sms" && campaign && (
          <SmsPanel
            key={campaign.id}
            campaign={campaign}
            onCampaignChange={() => {
              void reloadCampaigns();
            }}
          />
        )}
      </div>
    </main>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Tile({ label, value, share }: { label: string; value: number; share?: number }) {
  return (
    <div className="rounded-xl border border-[#e8e6e5] bg-white px-4 py-3.5">
      <p className="font-roobert text-2xl font-medium tabular-nums tracking-[-0.02em] text-[#0c0a09]">
        {value.toLocaleString()}
        {share !== undefined && <span className="ml-1.5 text-sm text-[#3398e1]">{share}%</span>}
      </p>
      <p className="mt-0.5 text-xs text-[#78716c]">{label}</p>
    </div>
  );
}
