"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useSoulPhoto } from "@/lib/soulwinning/use-soul-photo";
import type { Entry } from "./EntriesTable";

export function PhotoWall({
  campaignId,
  previewRows,
}: {
  campaignId: string;
  previewRows?: Entry[];
}) {
  const [rows, setRows] = useState<Entry[] | null>(previewRows ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pfcc, setPfcc] = useState("all");
  const [fellowship, setFellowship] = useState("all");
  const [member, setMember] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        .not("photo_path", "is", null)
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

  const photos = useMemo(
    () => (rows ?? []).filter((row) => row.photo_path && row.counted),
    [rows]
  );

  const pfccs = useMemo(
    () => unique(photos.map((row) => row.sw_entrants?.pfcc)),
    [photos]
  );
  const fellowships = useMemo(
    () => unique(photos.map((row) => row.sw_entrants?.fellowship)),
    [photos]
  );
  const members = useMemo(
    () => unique(photos.map((row) => row.sw_entrants?.name)),
    [photos]
  );

  const filtered = useMemo(
    () =>
      photos.filter((row) => {
        if (pfcc !== "all" && row.sw_entrants?.pfcc !== pfcc) return false;
        if (fellowship !== "all" && row.sw_entrants?.fellowship !== fellowship) return false;
        if (member !== "all" && row.sw_entrants?.name !== member) return false;
        return true;
      }),
    [photos, pfcc, fellowship, member]
  );

  const selected = filtered.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !filtered.some((row) => row.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (error) return <p className="text-sm text-[#f54911]">{error}</p>;
  if (!rows) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[#e8e6e5] bg-white py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#a8a29e]" />
      </div>
    );
  }

  return (
    <section data-wall>
      <div
        data-wall-filters
        className="mb-4 flex flex-wrap items-end gap-2 sm:gap-3"
      >
        <div className="flex flex-wrap gap-1">
          {["all", ...pfccs].map((value) => {
            const label = value === "all" ? "All PFCCs" : value;
            const active = pfcc === value;
            return (
              <button
                key={value}
                type="button"
                data-wall-filter-pfcc={value}
                onClick={() => setPfcc(value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-[#0c0a09] text-white" : "bg-white text-[#78716c] ring-1 ring-[#e8e6e5]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className="sr-only">Fellowship</span>
          <select
            data-wall-fellowship
            value={fellowship}
            onChange={(event) => setFellowship(event.target.value)}
            className="rounded-lg border border-[#e8e6e5] bg-white px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
          >
            <option value="all">All fellowships</option>
            {fellowships.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Member</span>
          <select
            data-wall-member
            value={member}
            onChange={(event) => setMember(event.target.value)}
            className="rounded-lg border border-[#e8e6e5] bg-white px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
          >
            <option value="all">All members</option>
            {members.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <p className="ml-auto text-xs text-[#a8a29e]">
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "photo" : "photos"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#e8e6e5] bg-white px-5 py-16 text-center text-sm text-[#78716c]">
          {photos.length === 0
            ? "No photos yet — they appear here as members log souls with a picture."
            : "No photos match these filters."}
        </div>
      ) : (
        <div className="sw-wall columns-2 gap-2 sm:columns-3 sm:gap-2.5 lg:columns-4 xl:columns-5">
          {filtered.map((row) => (
            <WallTile
              key={row.id}
              row={row}
              active={selected?.id === row.id}
              dimmed={!!selected && selected.id !== row.id}
              onOpen={() => setSelectedId(row.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <PrintOverlay entry={selected} onClose={() => setSelectedId(null)} />
      )}
    </section>
  );
}

function WallTile({
  row,
  active,
  dimmed,
  onOpen,
}: {
  row: Entry;
  active: boolean;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const url = useSoulPhoto(row.photo_path);
  const member = row.sw_entrants?.name;

  return (
    <button
      type="button"
      data-wall-tile={row.soul_name}
      onClick={onOpen}
      className={`group relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-[14px] text-left sm:mb-2.5 ${
        active ? "ring-2 ring-[#0c0a09] ring-offset-2 ring-offset-[#fafaf9]" : ""
      } ${dimmed ? "opacity-40" : "opacity-100"}`}
    >
      <div className="relative bg-[#eceae8]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} loading="lazy" className="block w-full" />
        ) : (
          <div className="aspect-[3/4] w-full" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c0a09]/70 via-[#0c0a09]/20 to-transparent px-3 pb-2.5 pt-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="font-roobert text-[15px] leading-tight tracking-[-0.02em] text-white">
            {row.soul_name}
          </p>
          {member && <p className="mt-0.5 text-[11px] text-white/80">Won by {member}</p>}
        </div>
      </div>
    </button>
  );
}

function PrintOverlay({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const url = useSoulPhoto(entry.photo_path);
  const [landscape, setLandscape] = useState(false);
  const member = entry.sw_entrants?.name;
  const fellowship = entry.sw_entrants?.fellowship;
  const pfcc = entry.sw_entrants?.pfcc;
  const when = new Date(entry.created_at).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      data-wall-detail
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#fafaf9]/70 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <article
        className="relative w-full rounded-[6px] bg-white p-3 pb-5 shadow-[0_28px_80px_-24px_rgba(12,10,9,0.5)]"
        style={{ maxWidth: landscape ? "28rem" : "22rem" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 rounded-full bg-white/90 p-1 text-[#78716c] shadow-sm"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="block w-full rounded-[3px]"
            onLoad={(event) => {
              const image = event.currentTarget;
              setLandscape(image.naturalWidth > image.naturalHeight);
            }}
          />
        )}
        <h2 className="mt-4 px-1 font-roobert text-[1.65rem] leading-none tracking-[-0.03em] text-[#0c0a09]">
          {entry.soul_name}
        </h2>
        <p className="mt-2 px-1 text-sm text-[#57534e]">
          {member ? `Won by ${member}` : "Won in the field"}
          {fellowship ? ` · ${fellowship}` : ""}
          {pfcc ? ` · ${pfcc}` : ""}
        </p>
        {entry.phone && (
          <p className="mt-1 px-1 text-sm tabular-nums text-[#78716c]">{entry.phone}</p>
        )}
        <p className="mt-1 px-1 text-xs text-[#a8a29e]">{when}</p>
        <div className="mt-3 flex flex-wrap gap-1 px-1">
          {entry.spoke_in_tongues && (
            <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[11px] text-[#3398e1]">
              Spoke in tongues
            </span>
          )}
          {entry.coming_to_church && (
            <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[11px] text-[#78716c]">
              Coming to church
            </span>
          )}
        </div>
      </article>
    </div>
  );
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))].sort(
    (a, b) => a.localeCompare(b)
  );
}
