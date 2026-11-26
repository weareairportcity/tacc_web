"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Clock } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { actorName } from "@/lib/camp/history-words";
import type { Complaint } from "@/lib/camp/complaints";
import { cn } from "@/lib/utils";
import { resolveComplaintAction } from "../../actions";

/** Ghana time is UTC. */
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
const short = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

type Filter = "open" | "resolved" | "all";

export function ComplaintsList({ campId, rows, start, leader }: { campId: string; rows: Complaint[]; start: string | null; leader: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [openId, setOpenId] = useState<string | null>(start && rows.some((r) => r.id === start) ? start : null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, begin] = useOneAtATime();

  const counts = useMemo(() => ({ open: rows.filter((r) => r.status === "open").length, resolved: rows.filter((r) => r.status === "resolved").length, all: rows.length }), [rows]);
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const current = rows.find((r) => r.id === openId) ?? null;

  const close = () => {
    setOpenId(null);
    setNote("");
    setError("");
  };
  const resolve = (c: Complaint) =>
    begin(async () => {
      setError("");
      const r = await resolveComplaintAction(campId, c.id, note);
      if (!r.ok) return setError(r.error);
      toast(`Resolved. ${c.full_name.split(" ")[0]} has been thanked in the app.`);
      close();
      router.refresh();
    });

  return (
    <>
      <nav aria-label="Complaints" className="grid w-full max-w-[420px] grid-cols-3 gap-1 rounded-full border border-stone-border bg-white p-[3px]">
        {(["open", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("cm-press flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-medium capitalize", filter === f ? "bg-soot text-white" : "text-[#57534e]")}
          >
            {f}
            <span className={cn("text-xs tabular-nums", filter === f ? "text-white/70" : "text-warm-gray")}>{counts[f]}</span>
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px] text-warm-gray">{filter === "open" ? "Nothing waiting. No open complaints." : "Nothing here."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {shown.map((c) => (
            <li key={c.id} className="border-t border-stone-border first:border-t-0">
              <button type="button" onClick={() => setOpenId(c.id)} className="cm-row flex w-full items-start gap-3 px-4 py-3.5 text-left text-sm">
                <span
                  className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", c.status === "open" ? "bg-cyan-signal" : "bg-st-paid")}
                  aria-label={c.status === "open" ? "Open" : "Resolved"}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{c.full_name}</span>
                    <span className="flex-none text-[13px] tabular-nums text-warm-gray">{short(c.created_at)}</span>
                  </span>
                  <span className="line-clamp-2 leading-snug text-[#57534e]">{c.body}</span>
                  <span className="flex items-center gap-2 text-[13px] text-warm-gray">
                    {c.fellowship}
                    {c.photo_url && (
                      <span className="inline-flex items-center gap-1">
                        <Camera className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" /> Photo
                      </span>
                    )}
                    {c.status === "resolved" && c.resolved_at && <span>Resolved {short(c.resolved_at)}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!current}
        onClose={close}
        title={current?.full_name ?? ""}
        subtitle={current ? `${current.fellowship} · ${current.status === "open" ? "Open" : "Resolved"}` : null}
        footer={
          current && current.status === "open" ? (
            <button type="button" disabled={pending} aria-busy={pending} onClick={() => resolve(current)} className={`${primaryButtonClass} h-12 flex-1`}>
              <Busy pending={pending} text="Resolving…">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Mark resolved
                </span>
              </Busy>
            </button>
          ) : (
            <button type="button" onClick={close} className="cm-press ml-auto h-11 rounded-full bg-soot px-5 text-sm font-medium text-white">
              Done
            </button>
          )
        }
      >
        {current && (
          <>
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{current.body}</p>
            {current.photo_url && (
              <a href={current.photo_url} target="_blank" rel="noreferrer" className="self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.photo_url} alt="The photo they sent" loading="lazy" className="max-h-[360px] w-auto max-w-full rounded-[12px] border border-stone-border" />
              </a>
            )}
            <dl className="flex flex-col gap-2.5 rounded-[12px] bg-stone-canvas p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-warm-gray">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Reported
                </dt>
                <dd className="text-right tabular-nums">{when(current.created_at)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-warm-gray">From</dt>
                <dd className="text-right">
                  {current.full_name}
                  {!leader && <span className="block tabular-nums text-warm-gray">{localPhone(current.phone)}</span>}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-warm-gray">Fellowship</dt>
                <dd className="text-right">
                  {current.fellowship} · {current.pfcc}
                </dd>
              </div>
              {current.status === "resolved" && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-warm-gray">Resolved</dt>
                    <dd className="text-right tabular-nums">{current.resolved_at ? when(current.resolved_at) : ""}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-warm-gray">Resolved by</dt>
                    <dd className="text-right">{current.resolved_by ? actorName(current.resolved_by, null) : ""}</dd>
                  </div>
                  {current.resolution_note && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-warm-gray">Note</dt>
                      <dd className="text-right">{current.resolution_note}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            {current.status === "open" && (
              <Field label="Note for the record (optional)" hint="They're thanked in the app either way. The note shows on their page and in your log.">
                <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            )}
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </Sheet>
    </>
  );
}
