import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { feedbackOpen, feedbackSummary, listFeedback, MAX_PER_SEND, thanksText } from "@/lib/camp/feedback";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { SendThanks } from "./SendThanks";

// Each thank-you is its own text, so a full press can take a while.
export const maxDuration = 300;

const WORDS = ["Poor", "Okay", "Good", "Great", "Excellent"];

/** After camp: the thank-you texts, and what people said. Answers carry no names. */
export default async function FeedbackPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const [summary, answers] = await Promise.all([feedbackSummary(camp.id), listFeedback(camp.id)]);
  const open = feedbackOpen(camp);
  const most = Math.max(1, ...summary.ratings);
  const skipped = Math.max(0, summary.arrived - summary.texted - summary.pending);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={`${headlineClass} text-[34px]`}>Feedback</h1>
        <p className="text-[15px] text-warm-gray">Answers are anonymous. Only people who arrived can give feedback.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
        <h2 className="text-[15px] font-semibold">Thank-you texts</h2>
        {!open ? (
          <p className="text-[15px]">You can send these from the last day of camp, {formatDate(camp.ends_on)}.</p>
        ) : (
          <p className="text-[15px] tabular-nums">
            Texted <strong className="font-semibold">{summary.texted}</strong> of {summary.arrived} who arrived.
            {skipped > 0 && <span className="text-warm-gray"> {skipped} already answered or can&apos;t be texted.</span>}
          </p>
        )}
        <p className="rounded-[12px] bg-stone-canvas px-4 py-3 text-sm leading-relaxed text-[#57534e]">
          {thanksText(camp, "Ama", "commune…/feedback/…")}
        </p>
        {open && <SendThanks campId={camp.id} pending={summary.pending} perPress={MAX_PER_SEND} />}
      </section>

      <section className="flex flex-col gap-5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums">{summary.average ? summary.average.toFixed(1) : "—"}</span>
            <span className="text-[15px] text-warm-gray">out of 5</span>
          </span>
          <span className="text-[15px] tabular-nums text-warm-gray">
            {summary.answers} {summary.answers === 1 ? "answer" : "answers"}
            {summary.texted > 0 && ` from ${summary.texted} texted`}
          </span>
        </div>
        <ul aria-label="How many gave each rating" className="flex flex-col gap-2">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary.ratings[n - 1];
            return (
              <li key={n} className="grid grid-cols-[88px_1fr_36px] items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums font-medium">{n}</span>
                  <span className="text-warm-gray">{WORDS[n - 1]}</span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-stone-canvas">
                  {count > 0 && <span className="block h-full rounded-full bg-soot" style={{ width: `${(count / most) * 100}%` }} />}
                </span>
                <span className="text-right tabular-nums">{count}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">What people wrote · {answers.length}</h2>
        {answers.length === 0 ? (
          <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">Nothing written yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white">
            {answers.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 border-t border-stone-border px-4 py-3.5 first:border-t-0">
                <span className="flex items-center gap-2 text-[13px] text-warm-gray">
                  <Star className="h-3.5 w-3.5 fill-current text-ink-black" strokeWidth={1.6} aria-hidden="true" />
                  <span className="font-medium text-ink-black tabular-nums">{a.rating}</span> {WORDS[a.rating - 1]} · {formatDate(a.created_on)}
                </span>
                {a.best && (
                  <p className="text-[15px] leading-relaxed">
                    <span className="text-warm-gray">Best part: </span>
                    {a.best}
                  </p>
                )}
                {a.change && (
                  <p className="text-[15px] leading-relaxed">
                    <span className="text-warm-gray">Change: </span>
                    {a.change}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
