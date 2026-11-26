"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Receipt, X } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { useToast } from "@/components/camp/toast";
import { ErrorText } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { AUDIENCE_WORDS, type Audience } from "@/lib/camp/broadcast-audience";
import { actorName } from "@/lib/camp/history-words";
import type { Scheduled } from "@/lib/camp/scheduled";
import { cancelScheduledAction } from "../../actions";

const n = (x: number) => x.toLocaleString("en-GB");
/** Ghana time is UTC. */
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const HOW: Record<string, string> = { app: "App first, text the rest", both: "Important: text everyone and the app", text: "Text everyone" };

const title = (s: Scheduled) => (s.kind === "arrival_details" ? "Arrival and health reminder" : s.message ?? "");
const audience = (s: Scheduled) =>
  s.kind === "arrival_details" ? "Everyone still missing their arrival or health details, each told what's missing" : `${AUDIENCE_WORDS[(s.audience ?? "all") as Audience] ?? "Everyone"} · ${HOW[s.how ?? ""] ?? ""}`;
const by = (s: Scheduled) => (s.created_by === "system" ? "Commune" : actorName(s.created_by, null));

type Result = { texts?: number; credits?: number; app?: number; failed?: number; sent?: number; error?: string; counts?: { arrival: number; details: number; both: number } };
const parse = (s: Scheduled): Result => {
  try {
    return s.result_json ? (JSON.parse(s.result_json) as Result) : {};
  } catch {
    return {};
  }
};

/** What's waiting to go (with who scheduled it, and cancel), then receipts for what has gone. */
export function ScheduledList({ campId, waiting, done }: { campId: string; waiting: Scheduled[]; done: Scheduled[] }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();

  if (!waiting.length && !done.length) return null;
  const cancel = (id: string) =>
    start(async () => {
      setError("");
      const r = await cancelScheduledAction(campId, id);
      if (!r.ok) return setError(r.error);
      setAsking(null);
      toast("Cancelled. It won't be sent.");
      router.refresh();
    });

  return (
    <section aria-label="Scheduled messages" className="flex flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <CalendarClock className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> Scheduled
        {waiting.length > 0 && <span className="font-normal text-warm-gray">{waiting.length} waiting</span>}
      </h2>
      <ErrorText>{error}</ErrorText>
      {waiting.length === 0 && <p className="text-[15px] text-warm-gray">Nothing is waiting to go.</p>}
      <ul className="flex flex-col">
        {waiting.map((s) => (
          <li key={s.id} className="flex flex-col gap-1.5 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
            <p className="text-[15px] font-medium tabular-nums">Goes {when(s.send_at)}</p>
            <p className="text-[15px] leading-relaxed">{title(s)}</p>
            <p className="text-[13px] text-warm-gray">
              {audience(s)} · scheduled by {by(s)} on {when(s.created_at)}
            </p>
            {asking === s.id ? (
              <div className="cm-pop flex flex-wrap items-center gap-2 pt-1">
                <span className="text-sm">Cancel this one?</span>
                <button type="button" onClick={() => setAsking(null)} className="cm-press h-10 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
                  Keep it
                </button>
                <button type="button" disabled={pending} onClick={() => cancel(s.id)} className="cm-press h-10 rounded-full bg-soot px-4 text-sm font-medium text-white disabled:opacity-60">
                  <Busy pending={pending} text="Cancelling…">Yes, cancel it</Busy>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setAsking(s.id)} className="cm-press inline-flex min-h-10 items-center gap-1.5 self-start text-sm underline underline-offset-[3px]">
                <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Cancel
              </button>
            )}
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h3 className="flex items-center gap-2 border-t border-stone-border pt-4 text-[15px] font-semibold">
            <Receipt className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> Receipts
          </h3>
          <ul className="flex flex-col">
            {done.map((s) => {
              const r = parse(s);
              const cancelled = !!s.cancelled_at && !s.sent_at;
              const sent = r.texts ?? r.sent ?? 0;
              const people = r.counts ? r.counts.arrival + r.counts.details + r.counts.both : sent + (r.app ?? 0) + (r.failed ?? 0);
              return (
                <li key={s.id} className="flex flex-col gap-1 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
                  <p className="flex items-center gap-2 text-[15px] font-medium">
                    {cancelled ? (
                      <span className="text-warm-gray">Cancelled</span>
                    ) : r.error ? (
                      <span className="text-[#b42318]">Didn&apos;t go</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-st-paid">
                        <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" /> Sent
                      </span>
                    )}
                    <span className="font-normal tabular-nums text-warm-gray">{cancelled ? when(s.cancelled_at!) : when(s.sent_at!)}</span>
                  </p>
                  <p className="text-[15px] leading-relaxed">{title(s)}</p>
                  <p className="text-[13px] tabular-nums text-warm-gray">
                    {cancelled
                      ? `Scheduled by ${by(s)} for ${when(s.send_at)}`
                      : r.error
                        ? r.error
                        : `Scheduled by ${by(s)} for ${when(s.send_at)} · to ${n(people)} ${people === 1 ? "person" : "people"}: ${n(sent)} by text${r.credits ? ` (${n(r.credits)} credits)` : ""}${r.app ? `, ${n(r.app)} in the app` : ""}${r.failed ? `, ${n(r.failed)} didn't go` : ""}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
