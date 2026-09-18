"use client";

import { useEffect, useMemo, useState } from "react";
import { listEntriesByEntrant, type LocalEntry } from "@/lib/soulwinning/local-db";

export function MySoulsList({
  campaignId,
  entrantId,
  revision,
}: {
  campaignId: string;
  entrantId: string;
  revision: number;
}) {
  const [rows, setRows] = useState<LocalEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listEntriesByEntrant(entrantId, campaignId).then((next) => {
      if (!cancelled) setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, entrantId, revision]);

  if (!rows) {
    return <div className="rounded-lg border border-[#e8e6e5] bg-white px-5 py-10" />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#e8e6e5] bg-white px-5 py-10 text-center">
        <p className="text-sm font-medium text-[#0c0a09]">No souls on this phone yet</p>
        <p className="mt-1 text-sm text-[#78716c]">Log one on the other tab and it will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <SoulRow key={row.id} row={row} />
      ))}
    </div>
  );
}

function SoulRow({ row }: { row: LocalEntry }) {
  const preview = useMemo(() => (row.photo ? URL.createObjectURL(row.photo) : null), [row.photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const time = new Date(row.created_at).toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex gap-3 rounded-lg border border-[#e8e6e5] bg-white px-3 py-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f2f2f2] text-sm font-medium text-[#a8a29e]">
          {row.soul_name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#0c0a09]">{row.soul_name}</p>
        <p className="text-xs text-[#a8a29e]">
          {row.phone || "No phone"} · {time}
        </p>
        <p className="mt-1 flex flex-wrap gap-1">
          {row.spoke_in_tongues && (
            <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">tongues</span>
          )}
          {row.coming_to_church && (
            <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">church</span>
          )}
        </p>
      </div>
    </div>
  );
}
