import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { feedbackOpen, feedbackPerson } from "@/lib/camp/feedback";
import { CampBanner } from "@/components/camp/photos";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { FeedbackForm } from "./FeedbackForm";

export const metadata: Metadata = { title: "How was camp? · Commune" };

/** The link in the thank-you text. No sign-in: the link names who it's for, and the answer is saved without it. */
export default async function FeedbackPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const camp = await getCampBySlug(slug);
  const person = camp ? await feedbackPerson(camp, token) : null;
  if (!camp || !person) notFound();

  return (
    <section className="cm-rise mt-2 flex flex-col overflow-hidden rounded-2xl bg-white shadow-seline-hero">
      <CampBanner camp={camp} className="h-28" />
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <p className="text-sm text-warm-gray">
          {camp.name} · {formatDate(camp.starts_on)}
        </p>
        {person.answered ? (
          <h1 className={`${headlineClass} text-[32px]`}>
            Thank you, <span className="text-cyan-edge">{person.firstName}</span>
          </h1>
        ) : (
          <h1 className={`${headlineClass} text-[32px]`}>
            How was camp, <span className="text-cyan-edge">{person.firstName}</span>?
          </h1>
        )}
        {person.answered ? (
          <p className="text-[15px]">You&apos;ve already told us how camp went. It helps us plan the next one.</p>
        ) : !feedbackOpen(camp) ? (
          <p className="text-[15px]">This opens on the last day of camp, {formatDate(camp.ends_on)}.</p>
        ) : (
          <FeedbackForm slug={camp.slug} token={token} />
        )}
      </div>
    </section>
  );
}
