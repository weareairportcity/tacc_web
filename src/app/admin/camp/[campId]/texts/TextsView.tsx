import { Bell, Coins, MessageSquare } from "lucide-react";
import type { Recipient } from "@/lib/camp/broadcast";
import { firstName } from "@/lib/camp/sms";
import { SMS_KIND_WORDS, type Broadcast, type SmsUse } from "@/lib/camp/sms-log";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { Composer } from "./Composer";

const n = (x: number) => x.toLocaleString("en-GB");

/** The Texts page itself, given its data (the page loads it; kept apart so it can be shown with sample data). */
export function TextsView({
  camp,
  recipients,
  use,
  broadcasts,
  balance,
}: {
  camp: { id: string; name: string };
  recipients: Pick<Recipient, "full_name" | "status" | "app">[];
  use: SmsUse[];
  broadcasts: Broadcast[];
  balance: number | null;
}) {
  const used = use.reduce((s, u) => s + u.credits, 0);
  const texts = use.reduce((s, u) => s + u.texts, 0);
  const free = use.reduce((s, u) => s + u.pushed, 0);
  const onApp = recipients.filter((r) => r.app === "on").length;
  const most = Math.max(1, ...use.map((u) => u.credits));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Texts</h1>
        <p className="text-[15px] text-warm-gray">Every text costs mNotify credits. App notifications are free.</p>
      </header>

      <section aria-label="Credits" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Coins} label="Credits left on mNotify" big={balance === null ? "—" : n(balance)} sub={balance === null ? "Couldn't check just now" : "For all texts, not just this camp"} lifted />
        <Stat icon={MessageSquare} label="Used by this camp" big={n(used)} sub={`${n(texts)} ${texts === 1 ? "text" : "texts"} so far`} />
        <Stat icon={Bell} label="Reach them free" big={`${n(onApp)} of ${n(recipients.length)}`} sub={free ? `${n(free)} app notifications sent instead of texts` : "have app notifications on"} />
      </section>

      <Composer
        campId={camp.id}
        campName={camp.name}
        balance={balance}
        people={recipients.map((r) => ({ first: firstName(r.full_name), status: r.status, app: r.app }))}
      />

      <section className="flex flex-col gap-3 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
        <h2 className="text-[15px] font-semibold">Where this camp&apos;s credits went</h2>
        {use.length === 0 ? (
          <p className="text-[15px] text-warm-gray">No texts yet.</p>
        ) : (
          <ul className="flex flex-col">
            {use.map((u) => (
              <li key={u.kind} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
                <span className="text-[15px]">{SMS_KIND_WORDS[u.kind] ?? u.kind}</span>
                <span className="text-right text-[15px] font-semibold tabular-nums">
                  {n(u.credits)} <span className="font-normal text-warm-gray">{u.credits === 1 ? "credit" : "credits"}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-stone-canvas">
                  <span className="block h-full rounded-full bg-cyan-edge" style={{ width: `${Math.max(2, (u.credits / most) * 100)}%` }} />
                </span>
                <span className="text-right text-[13px] tabular-nums text-warm-gray">
                  {n(u.texts)} {u.texts === 1 ? "text" : "texts"}
                  {u.pushed ? ` · ${n(u.pushed)} free in the app` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {broadcasts.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
          <h2 className="text-[15px] font-semibold">Sent to everyone</h2>
          <ul className="flex flex-col">
            {broadcasts.map((b) => (
              <li key={b.id} className="flex flex-col gap-1 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
                <p className="text-[15px] leading-relaxed">{b.note}</p>
                <p className="text-[13px] tabular-nums text-warm-gray">
                  {formatDate(b.created_at.slice(0, 10))} · {n(b.texts)} {b.texts === 1 ? "text" : "texts"} ({n(b.credits)} credits)
                  {b.pushed ? ` · ${n(b.pushed)} in the app` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}


function Stat({ icon: Icon, label, big, sub, lifted }: { icon: typeof Bell; label: string; big: string; sub: string; lifted?: boolean }) {
  return (
    <div className={lifted ? "flex flex-col gap-1.5 rounded-2xl bg-white p-5 shadow-seline-hero" : "flex flex-col gap-1.5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card"}>
      <span className="flex items-center gap-2 text-[13px] text-warm-gray">
        <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> {label}
      </span>
      <span className="font-display text-[32px] leading-none tracking-[-0.024em] tabular-nums">{big}</span>
      <span className="text-[13px] text-[#57534e]">{sub}</span>
    </div>
  );
}
