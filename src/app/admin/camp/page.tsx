import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Users } from "lucide-react";
import { listCamps } from "@/lib/camp/camps";
import { registrationPhase } from "@/lib/camp/registrations";
import type { Camp } from "@/lib/camp/types";
import { AdminTopBar } from "@/components/camp/AdminTopBar";
import { CAMP_STATUS_ICONS, formatDate, headlineClass, secondaryButtonClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "./access";
import { NewCamp } from "./NewCamp";

/** What a coordinator reads about a camp's state, in words. */
function campState(camp: Camp) {
  if (camp.status === "draft") return "Draft · only coordinators can see it";
  if (camp.status === "archived") return "Archived";
  const phase = registrationPhase(camp);
  if (phase === "upcoming") return `Registration opens ${formatDate(camp.registration_opens_on)}`;
  if (phase === "open") return `Registration open · closes ${formatDate(camp.registration_closes_on)}`;
  return "Registration closed";
}

export default async function CampAdminHome() {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const leader = staff.role === "leader";
  // Leaders see published camps only, and open each one's read-only people list.
  const camps = (await listCamps()).filter((c) => !leader || c.status !== "draft");

  return (
    <>
      <AdminTopBar email={staff.email} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pb-16 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className={headlineClass}>
              Your <span className="text-cyan-edge">camps</span>
            </h1>
            {leader && staff.scope_value && <p className="text-sm text-warm-gray">Leader for {staff.scope_value}</p>}
          </div>
          {staff.role === "admin" && (
            <Link href="/admin/camp/staff" className={secondaryButtonClass}>
              <Users className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Staff
            </Link>
          )}
        </div>

        {!leader && <NewCamp />}

        {camps.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-stone-muted bg-white p-8 text-center text-sm text-warm-gray">
            No camps yet. Create one to start taking registrations.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {camps.map((camp, i) => {
              const Icon = CAMP_STATUS_ICONS[camp.status];
              return (
                <li key={camp.id} className="cm-rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <Link
                    href={leader ? `/admin/camp/${camp.id}/people` : `/admin/camp/${camp.id}`}
                    className="cm-press flex h-full flex-col gap-3 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card"
                  >
                    <span className="flex items-center gap-2 text-[13px] text-warm-gray">
                      <Icon className="h-4 w-4 text-ink-black" strokeWidth={1.6} aria-hidden="true" />
                      {campState(camp)}
                    </span>
                    <span className="font-display text-2xl leading-tight tracking-[-0.015em]">{camp.name}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-gray">
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
                    <span className="mt-auto flex items-center justify-between border-t border-stone-border pt-3 text-sm font-medium">
                      {leader ? "Your people" : "Open dashboard"}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
