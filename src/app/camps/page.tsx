import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { listPublicCamps } from "@/lib/camp/camps";
import { daysUntil, registrationPhase } from "@/lib/camp/registrations";
import type { Camp } from "@/lib/camp/types";
import { CampBanner, CampLogo } from "@/components/camp/photos";
import { StatusLine, formatDate, headlineClass, titleClass } from "@/components/camp/ui";

/** Where /camp and the old camp links land. Open and upcoming camps first, closed ones after. */
export default async function CampsIndex() {
  const camps = await listPublicCamps();
  const current = camps.filter((c) => registrationPhase(c) !== "closed");
  const closed = camps.filter((c) => registrationPhase(c) === "closed");

  return (
    <div className="flex flex-col gap-8 pt-6">
      <div className="cm-rise flex flex-col gap-3">
        <h1 className={headlineClass}>
          Find your <span className="text-cyan-edge">camp</span>
        </h1>
        <p className="text-[15px] leading-relaxed text-warm-gray">Register, pay, and choose who you share a room with.</p>
      </div>

      {current.length === 0 && closed.length === 0 && (
        <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">
          No camps are taking registrations right now. Check back soon.
        </p>
      )}

      {current.length > 0 && (
        <ul className="flex flex-col gap-4">
          {current.map((camp, i) => (
            <li key={camp.id} className="cm-rise" style={{ animationDelay: `${80 + i * 60}ms` }}>
              <CampCard camp={camp} />
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-warm-gray">Registration closed</h2>
          <ul className="flex flex-col gap-3">
            {closed.map((camp) => (
              <li key={camp.id}>
                <Link
                  href={`/camps/${camp.slug}`}
                  className="cm-press flex items-center gap-4 rounded-[10px] border border-stone-border bg-white p-4"
                >
                  <CampLogo camp={camp} size={44} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[15px] font-medium">{camp.name}</span>
                    <span className="text-[13px] text-warm-gray">
                      {formatDate(camp.starts_on)} · Sign in to see your registration
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ash-gray" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CampCard({ camp }: { camp: Camp }) {
  const phase = registrationPhase(camp);
  return (
    <Link
      href={`/camps/${camp.slug}`}
      className="cm-press flex flex-col overflow-hidden rounded-2xl border border-stone-border bg-white shadow-seline-card"
    >
      <CampBanner camp={camp} className="h-40" settle={false} />
      <span className="flex flex-col gap-3 p-5">
      {phase === "open" ? (
        <StatusLine dot="live" strong="Registration open">
          closes {formatDate(camp.registration_closes_on)}
        </StatusLine>
      ) : (
        <StatusLine icon={Clock} strong={`Registration opens ${formatDate(camp.registration_opens_on)}`}>
          in {daysUntil(camp.registration_opens_on)} days
        </StatusLine>
      )}
      <span className="flex items-center gap-3">
        <CampLogo camp={camp} size={40} />
        <span className={`${titleClass} text-[26px] leading-tight tracking-[-0.02em]`}>{camp.name}</span>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-warm-gray">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
          {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
        </span>
        {camp.venue && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            {camp.venue}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between border-t border-stone-border pt-3 text-sm font-medium">
        {phase === "open" ? "Register or sign in" : "See what to have ready"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
      </span>
    </Link>
  );
}
