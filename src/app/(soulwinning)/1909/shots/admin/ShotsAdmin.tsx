"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";
import { CumulativeChart, RatesChart, SoulsPerHourChart } from "../../admin/Charts";
import { DuplicateQueue } from "../../admin/DuplicateQueue";
import { EntriesTable } from "../../admin/EntriesTable";
import { Leaderboards } from "../../admin/Leaderboards";
import { PhotoWall } from "../../admin/PhotoWall";
import type { Dimension } from "@/lib/soulwinning/admin";
import {
  SHOT_CAMPAIGN,
  SHOT_DUPLICATES,
  SHOT_ENTRIES,
  SHOT_FELLOWSHIPS,
  SHOT_HOURLY,
  SHOT_MAP_POINTS,
  SHOT_MEMBERS,
  SHOT_OVERVIEW,
} from "../fixtures";

const SoulMap = dynamic(() => import("../../admin/SoulMap").then((mod) => mod.SoulMap), {
  ssr: false,
  loading: () => <p className="p-5 text-sm text-[#a8a29e]">Loading map…</p>,
});

type View = "overview" | "wall" | "entries" | "duplicates" | "map";

const VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "wall", label: "Wall" },
  { key: "entries", label: "Entries" },
  { key: "duplicates", label: "Duplicates" },
  { key: "map", label: "Map" },
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function ShotsAdmin({ view: initialView }: { view: View }) {
  const [view, setView] = useState<View>(initialView);
  const [dimension, setDimension] = useState<Dimension>(initialView === "overview" ? "entrant" : "fellowship");
  const rows = useMemo(
    () => (dimension === "entrant" ? SHOT_MEMBERS : SHOT_FELLOWSHIPS),
    [dimension]
  );

  return (
    <main className="min-h-screen bg-[#fafaf9] px-4 py-6 font-sans sm:px-6 sm:py-8">
      <div className={`mx-auto w-full ${view === "wall" ? "max-w-[92rem]" : "max-w-6xl"}`}>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={140} height={49} className="h-8 w-auto object-contain" />
            <div>
              <h1 className="font-roobert text-xl tracking-[-0.02em] text-[#0c0a09]">Soul Winning admin</h1>
              <p className="text-xs text-[#a8a29e]">{SHOT_CAMPAIGN.name}</p>
            </div>
          </div>
        </header>

        <nav className="mb-5 flex flex-wrap gap-1">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                view === item.key ? "bg-[#0c0a09] text-white" : "text-[#78716c] hover:bg-white"
              }`}
            >
              {item.label}
              {item.key === "duplicates" && (
                <span className="ml-1.5 rounded-full bg-[#f54911] px-1.5 text-[10px] text-white">
                  {SHOT_DUPLICATES.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {view === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Souls" value={SHOT_OVERVIEW.total_souls} />
              <Tile
                label="Spoke in tongues"
                value={SHOT_OVERVIEW.tongues_count}
                share={pct(SHOT_OVERVIEW.tongues_count, SHOT_OVERVIEW.total_souls)}
              />
              <Tile
                label="Coming to church"
                value={SHOT_OVERVIEW.church_count}
                share={pct(SHOT_OVERVIEW.church_count, SHOT_OVERVIEW.total_souls)}
              />
              <Tile label="Members entering" value={SHOT_OVERVIEW.entrant_count} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SoulsPerHourChart rows={SHOT_HOURLY} />
              <CumulativeChart rows={SHOT_HOURLY} />
            </div>
            <RatesChart rows={SHOT_HOURLY} />

            <Leaderboards
              dimension={dimension}
              onDimensionChange={setDimension}
              rows={rows}
              campaignSlug={SHOT_CAMPAIGN.slug}
            />
          </div>
        )}

        {view === "wall" && (
          <PhotoWall campaignId={SHOT_CAMPAIGN.id} previewRows={SHOT_ENTRIES} />
        )}

        {view === "entries" && (
          <EntriesTable campaignId={SHOT_CAMPAIGN.id} previewRows={SHOT_ENTRIES} />
        )}

        {view === "duplicates" && <DuplicateQueue rows={SHOT_DUPLICATES} onResolved={() => undefined} />}

        {view === "map" && <SoulMap campaignId={SHOT_CAMPAIGN.id} previewPoints={SHOT_MAP_POINTS} />}
      </div>
    </main>
  );
}

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
