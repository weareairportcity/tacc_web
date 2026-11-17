"use client";

import { useMemo, useState } from "react";
import { Bell, MessageSquare, Send } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { useToast } from "@/components/camp/toast";
import { ErrorText, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import type { AppState } from "@/lib/camp/app-first";
import { AUDIENCE_WORDS, AUDIENCES, inAudience, type Audience } from "@/lib/camp/broadcast-audience";
import { coordinatorText, MAX_COORDINATOR_MESSAGE } from "@/lib/camp/sms";
import type { RegistrationStatus } from "@/lib/camp/types";
import { smsPartsOf } from "@/lib/sms-plain";
import { cn } from "@/lib/utils";
import { broadcastAction } from "../../actions";

type Person = { first: string; status: RegistrationStatus; app: AppState };

const TEMPLATES: [string, string][] = [
  ["Payment reminder", "Please pay what's left of your camp fee soon. You can pay in Commune with MoMo or card."],
  ["Get the app", "Please add Commune to your phone and turn on notifications, so you get your receipts and room for free. Open your camp page to start."],
  ["What to bring", "For camp, please bring your Bible, a notebook, toiletries, a towel and comfortable clothes."],
  ["Check-in time", "Check-in at camp opens at [time] on [day]. Please have your pass ready on your phone."],
];

const n = (x: number) => x.toLocaleString("en-GB");

/**
 * One message to many: who it's for, what it says, and what it'll cost, all
 * before anything is sent. Each person is greeted by first name. With "app
 * first" on, people with the app get it free as a notification.
 */
export function Composer({ campId, campName, balance, people }: { campId: string; campName: string; balance: number | null; people: Person[] }) {
  const toast = useToast();
  const [audience, setAudience] = useState<Audience>("all");
  const [message, setMessage] = useState("");
  const [appFirst, setAppFirst] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();

  const counts = useMemo(() => Object.fromEntries(AUDIENCES.map((a) => [a, people.filter((p) => inAudience(p, a)).length])) as Record<Audience, number>, [people]);
  const picked = useMemo(() => people.filter((p) => inAudience(p, audience)), [people, audience]);
  const byApp = appFirst ? picked.filter((p) => p.app === "on") : [];
  const byText = appFirst ? picked.filter((p) => p.app !== "on") : picked;
  // Exact: each person's own text, with their own first name.
  const credits = useMemo(() => byText.reduce((s, p) => s + smsPartsOf(coordinatorText(p.first, message || "…")), 0), [byText, message]);
  const perText = smsPartsOf(coordinatorText(byText[0]?.first ?? "Ama", message || "…"));
  const tooMany = balance !== null && credits > balance;
  const ready = message.trim().length >= 3 && picked.length > 0;

  const send = () =>
    start(async () => {
      setError("");
      const r = await broadcastAction(campId, audience, message, appFirst);
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setMessage("");
      toast(
        `Sent to ${n(r.data.texts + r.data.app)} ${r.data.texts + r.data.app === 1 ? "person" : "people"}: ${n(r.data.texts)} by text (${n(r.data.credits)} credits)${r.data.app ? `, ${n(r.data.app)} in the app` : ""}${r.data.failed ? `. ${r.data.failed} didn't go.` : ""}`,
        r.data.failed ? { tone: "error" } : undefined,
      );
    });

  return (
    <section aria-label="Send a message" className="grid gap-5 rounded-2xl bg-white p-5 shadow-seline-hero sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <h2 className="font-display text-[24px] tracking-[-0.015em]">Send a message</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Who it&apos;s for</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => setAudience(a)}
                className={cn(
                  "cm-press flex min-h-[60px] flex-col items-start justify-center rounded-[14px] border px-3.5 py-2 text-left",
                  audience === a ? "border-soot bg-soot text-white" : "border-stone-border bg-white",
                )}
              >
                <span className="font-display text-[22px] leading-none tabular-nums">{n(counts[a])}</span>
                <span className={cn("mt-1 text-[13px] leading-tight", audience === a ? "text-white" : "text-warm-gray")}>{AUDIENCE_WORDS[a]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Start from a ready message</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(([label, text]) => (
              <button key={label} type="button" onClick={() => setMessage(text)} className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium">
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Message
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirming(false);
            }}
            rows={5}
            maxLength={MAX_COORDINATOR_MESSAGE}
            placeholder="Write what everyone should know"
            className={`${inputClass} h-auto py-2.5 leading-relaxed`}
          />
          <span className="text-right text-xs font-normal tabular-nums text-warm-gray">
            {message.length}/{MAX_COORDINATOR_MESSAGE} · {perText} {perText === 1 ? "credit" : "credits"} a text
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-stone-border p-3.5">
          <input type="checkbox" checked={appFirst} onChange={(e) => setAppFirst(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-soot" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium">Use the app when they have it</span>
            <span className="text-[13px] leading-snug text-warm-gray">People with notifications on get it in Commune, free. Only the rest are texted.</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">What {picked[0]?.first || "they"} will get</span>
          <p className="rounded-[16px] rounded-bl-[4px] bg-[#e9f4fd] px-3.5 py-3 text-sm leading-relaxed break-words">{coordinatorText(picked[0]?.first ?? "Ama", message || "…")}</p>
          <span className="text-xs text-warm-gray">Each person gets their own, with their first name. Curly quotes and emoji are swapped for plain letters, so they don&apos;t cost extra.</span>
        </div>
      </div>

      {/* The cost, always in view while writing. */}
      <aside aria-live="polite" className="flex flex-col gap-4 self-start rounded-[16px] bg-stone-canvas p-5 lg:sticky lg:top-20">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-warm-gray">This message</h3>
        <dl className="flex flex-col gap-3 text-[15px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt>People</dt>
            <dd className="font-semibold tabular-nums">{n(picked.length)}</dd>
          </div>
          {appFirst && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-1.5">
                <Bell className="h-4 w-4 text-[#0b5e0b]" strokeWidth={1.7} aria-hidden="true" /> In the app
              </dt>
              <dd className="tabular-nums">
                {n(byApp.length)} <span className="text-warm-gray">· free</span>
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> By text
            </dt>
            <dd className="tabular-nums">{n(byText.length)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1 border-t border-stone-border pt-4">
          <span className="text-[13px] text-warm-gray">Credits it will use</span>
          <span className={cn("font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums", tooMany && "text-[#b42318]")}>{n(credits)}</span>
          {balance !== null && (
            <span className={cn("text-[13px] tabular-nums", tooMany ? "font-medium text-[#b42318]" : "text-warm-gray")}>
              {tooMany ? `More than the ${n(balance)} left. Top up mNotify first.` : `${n(balance - credits)} left after, of ${n(balance)}`}
            </span>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        {confirming ? (
          <div className="cm-pop flex flex-col gap-2">
            <p className="text-[15px] leading-snug">
              Send to <strong className="font-semibold">{n(picked.length)}</strong> {picked.length === 1 ? "person" : "people"} for <strong className="font-semibold">{n(credits)}</strong> {credits === 1 ? "credit" : "credits"}?
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
                Back
              </button>
              <button type="button" disabled={pending} aria-busy={pending} onClick={send} className="cm-press h-12 flex-1 rounded-full bg-soot px-4 text-sm font-medium text-white disabled:opacity-60">
                <Busy pending={pending} text="Sending…">Yes, send</Busy>
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={!ready || tooMany} onClick={() => setConfirming(true)} className={`${primaryButtonClass} h-[52px] w-full`}>
            <Send className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Send
          </button>
        )}
        <p className="text-[12px] leading-snug text-warm-gray">From the sender Commune, for {campName}. Cancelled registrations are left out.</p>
      </aside>
    </section>
  );
}
