import { notFound, redirect } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { listMyComplaints } from "@/lib/camp/complaints";
import { campAndAttendee } from "@/lib/camp/session";
import { Intro } from "@/components/camp/subpage";
import { ReportForm } from "./ReportForm";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Report a problem to the coordinators and your leaders, in words with a photo if you like. */
export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { camp, me } = await campAndAttendee(slug);
  if (!camp) notFound();
  if (!me) redirect(`/camps/${camp.slug}`);
  const mine = await listMyComplaints(me.id);
  return (
    <div className="flex flex-col gap-6">
      <Intro
        slug={camp.slug}
        title={
          <>
            Report a <span className="text-cyan-edge">problem</span>
          </>
        }
      >
        Tell us what&apos;s wrong. The coordinators and your leaders see it straight away, and you&apos;ll get a notification when it&apos;s resolved.
      </Intro>
      <ReportForm slug={camp.slug} />
      {mine.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">What you&apos;ve reported</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-[14px] border border-stone-border bg-white p-4">
                <p className="text-[15px] leading-relaxed">{c.body}</p>
                {c.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt="The photo you sent" loading="lazy" className="max-h-48 w-auto self-start rounded-[10px] border border-stone-border" />
                )}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-warm-gray">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" /> {when(c.created_at)}
                  </span>
                  {c.status === "resolved" ? (
                    <span className="inline-flex items-center gap-1 font-medium text-st-paid">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" /> Resolved{c.resolved_at ? ` ${when(c.resolved_at)}` : ""}
                    </span>
                  ) : (
                    <span className="font-medium text-ink-black">With the coordinators</span>
                  )}
                </p>
                {c.status === "resolved" && c.resolution_note && <p className="text-sm text-[#57534e]">{c.resolution_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
