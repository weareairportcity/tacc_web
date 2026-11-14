import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { feedbackOpen, feedbackSummary, listFeedback, MAX_PER_SEND, thanksText } from "@/lib/camp/feedback";
import { listPayExperience, payExperienceSummary } from "@/lib/camp/pay-experience";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { SendThanks } from "./SendThanks";

// Each thank-you is its own text, so a full press can take a while.
export const maxDuration = 300;

const WORDS = ["Poor", "Okay", "Good", "Great", "Excellent"];

/** Checkout stars, and after camp: the thank-you texts and what people said. */
export default async function FeedbackPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const [pay, payRows, summary, answers] = await Promise.all([
    payExperienceSummary(camp.id),
    listPayExperience(camp.id),
    feedbackSummary(camp.id),
    listFeedback(camp.id),
  ]);
  const open = feedbackOpen(camp);
  const skipped = Math.max(0, summary.arrived - summary.texted - summary.pending);
  const payNotes = payRows.filter((r) => r.comment || r.rating <= 2);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={`${headlineClass} text-[34px]`}>Feedback</h1>
        <p className="text-[15px] text-warm-gray">How registering went, and after camp, how it was.</p>
      </header>

      <section className="flex flex-col gap-5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">The site</h2>
          <p className="text-[13px] text-warm-gray">After they finished registering. Names are on comments so you can follow up.</p>
        </div>
        <RatingBlock average={pay.average} answers={pay.answers} ratings={pay.ratings} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">What they said about the site · {payNotes.length}</h2>
        {payNotes.length === 0 ? (
          <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">
            {pay.answers === 0 ? "Nobody has rated the site yet." : "No comments yet. 1 and 2 star ratings will show here even without a comment."}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white">
            {payNotes.map((a) => (
              <li key={a.registration_id} className="flex flex-col gap-2 border-t border-stone-border px-4 py-3.5 first:border-t-0">
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-warm-gray">
                  <Star className="h-3.5 w-3.5 fill-current text-ink-black" strokeWidth={1.6} aria-hidden="true" />
                  <span className="font-medium text-ink-black tabular-nums">{a.rating}</span> {WORDS[a.rating - 1]} · {a.full_name} · {formatDate(a.created_at.slice(0, 10))}
                </span>
                {a.comment ? <p className="text-[15px] leading-relaxed">{a.comment}</p> : <p className="text-[15px] text-warm-gray">No comment.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

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
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">After camp</h2>
          <p className="text-[13px] text-warm-gray">Answers are anonymous. Only people who arrived can give this.</p>
        </div>
        <RatingBlock average={summary.average} answers={summary.answers} ratings={summary.ratings} extra={summary.texted > 0 ? ` from ${summary.texted} texted` : ""} />
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

function RatingBlock({ average, answers, ratings, extra = "" }: { average: number | null; answers: number; ratings: number[]; extra?: string }) {
  const most = Math.max(1, ...ratings);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span className="flex items-baseline gap-2.5">
          <span className="font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums">{average ? average.toFixed(1) : "—"}</span>
          <span className="text-[15px] text-warm-gray">out of 5</span>
        </span>
        <span className="text-[15px] tabular-nums text-warm-gray">
          {answers} {answers === 1 ? "answer" : "answers"}
          {extra}
        </span>
      </div>
      <ul aria-label="How many gave each rating" className="flex flex-col gap-2">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = ratings[star - 1];
          return (
            <li key={star} className="grid grid-cols-[88px_1fr_36px] items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums font-medium">{star}</span>
                <span className="text-warm-gray">{WORDS[star - 1]}</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-stone-canvas">
                {count > 0 && <span className="block h-full rounded-full bg-soot" style={{ width: `${(count / most) * 100}%` }} />}
              </span>
              <span className="text-right tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
