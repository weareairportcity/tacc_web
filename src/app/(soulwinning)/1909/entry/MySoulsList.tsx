"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteLocalEntries, fetchRemoteEntries } from "@/lib/soulwinning/entries";
import { listEntriesByEntrant, type LocalEntry } from "@/lib/soulwinning/local-db";
import { SoulDetail } from "../SoulDetail";

type Listed = {
  key: string;
  ids: string[];
  name: string;
  phone: string;
  created_at: string;
  photo: Blob | null;
  photoPath: string | null;
  latitude: number | null;
  longitude: number | null;
  bulk: boolean;
  souls: number;
  tongues: number;
  church: number;
};

function collapse(rows: LocalEntry[]): Listed[] {
  const grouped = new Map<string, LocalEntry[]>();
  const singles: LocalEntry[] = [];

  for (const row of rows) {
    if (row.group_id) {
      const list = grouped.get(row.group_id) ?? [];
      list.push(row);
      grouped.set(row.group_id, list);
    } else {
      singles.push(row);
    }
  }

  const listed: Listed[] = singles.map((row) => toListed(row));

  for (const [groupId, members] of grouped) {
    const sameName = members.every((item) => item.soul_name === members[0].soul_name);
    if (sameName && members.length > 1) {
      const lead = members.find((item) => item.phone) ?? members[0];
      listed.push({
        key: groupId,
        ids: members.map((item) => item.id),
        name: lead.soul_name,
        phone: lead.phone,
        created_at: lead.created_at,
        photo: members.find((item) => item.photo)?.photo ?? null,
        photoPath: members.find((item) => item.photo_path)?.photo_path ?? null,
        latitude: lead.latitude,
        longitude: lead.longitude,
        bulk: true,
        souls: members.length,
        tongues: members.filter((item) => item.spoke_in_tongues).length,
        church: members.filter((item) => item.coming_to_church).length,
      });
    } else {
      for (const row of members) listed.push(toListed(row));
    }
  }

  return listed.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function toListed(row: LocalEntry): Listed {
  return {
    key: row.id,
    ids: [row.id],
    name: row.soul_name,
    phone: row.phone,
    created_at: row.created_at,
    photo: row.photo,
    photoPath: row.photo_path,
    latitude: row.latitude,
    longitude: row.longitude,
    bulk: false,
    souls: 1,
    tongues: row.spoke_in_tongues ? 1 : 0,
    church: row.coming_to_church ? 1 : 0,
  };
}

export function MySoulsList({
  campaignId,
  entrantId,
  loginCode,
  revision,
  onChanged,
  onCount,
}: {
  campaignId: string;
  entrantId: string;
  loginCode?: string;
  revision: number;
  onChanged?: () => void;
  onCount?: (count: number) => void;
}) {
  const [rows, setRows] = useState<LocalEntry[] | null>(null);
  const [open, setOpen] = useState<Listed | null>(null);
  const openPreview = useMemo(
    () => (open?.photo ? URL.createObjectURL(open.photo) : null),
    [open?.photo]
  );

  useEffect(() => {
    return () => {
      if (openPreview) URL.revokeObjectURL(openPreview);
    };
  }, [openPreview]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = await listEntriesByEntrant(entrantId, campaignId);
        if (cancelled) return;
        if (local.length > 0) {
          setRows(local);
          onCount?.(local.length);
        }

        const remote = await fetchRemoteEntries({
          loginCode: loginCode ?? "",
          campaignId,
        });
        if (cancelled) return;

        if (remote.length === 0) {
          setRows(local);
          onCount?.(local.length);
          return;
        }

        const merged = new Map<string, LocalEntry>();
        for (const row of remote) merged.set(row.id, row);
        for (const row of local) merged.set(row.id, row);
        const next = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRows(next);
        onCount?.(next.length);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, entrantId, loginCode, revision]);

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

  const listed = collapse(rows);

  return (
    <div className="space-y-2">
      {listed.map((item) => (
        <SoulRow
          key={item.key}
          item={item}
          onOpen={() => setOpen(item)}
          onDeleted={(ids) => {
            setRows((prev) => (prev ?? []).filter((row) => !ids.includes(row.id)));
            if (open && ids.some((id) => open.ids.includes(id))) setOpen(null);
            onChanged?.();
          }}
        />
      ))}
      {open && (
        <SoulDetail
          data={{
            name: open.name,
            phone: open.phone || null,
            photoUrl: openPreview,
            photoPath: open.photoPath,
            createdAt: open.created_at,
            bulk: open.bulk,
            souls: open.souls,
            tongues: open.tongues,
            church: open.church,
            latitude: open.latitude,
            longitude: open.longitude,
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function SoulRow({
  item,
  onOpen,
  onDeleted,
}: {
  item: Listed;
  onOpen: () => void;
  onDeleted: (ids: string[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (item.photo ? URL.createObjectURL(item.photo) : null), [item.photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const time = new Date(item.created_at).toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteLocalEntries(item.ids);
      onDeleted(item.ids);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete");
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#e8e6e5] bg-white px-3 py-3">
      <div className="flex gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f2f2f2] text-sm font-medium text-[#a8a29e]">
              {item.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#0c0a09]">{item.name}</p>
            <p className="text-xs text-[#a8a29e]">
              {item.bulk ? `${item.souls} souls` : item.phone || "No phone"} · {time}
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {item.bulk ? (
                <>
                  <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">
                    {item.tongues} tongues
                  </span>
                  <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">
                    {item.church} church
                  </span>
                </>
              ) : (
                <>
                  {item.tongues > 0 && (
                    <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">
                      tongues
                    </span>
                  )}
                  {item.church > 0 && (
                    <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">
                      church
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </button>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="self-start text-xs font-medium text-[#f54911]"
          >
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 space-y-2 rounded-md bg-[#f54911]/5 p-3">
          <p className="text-sm text-[#0c0a09]">
            {item.bulk
              ? `Remove all ${item.souls} souls in this group?`
              : `Remove ${item.name}?`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-[#e8e6e5] bg-white py-2 text-sm font-medium text-[#78716c]"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="rounded-lg bg-[#f54911] py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Removing…" : "Delete"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[#f54911]">{error}</p>}
    </div>
  );
}
