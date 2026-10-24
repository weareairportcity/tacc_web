import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { listPublicCamps } from "@/lib/camp/camps";
import { registrationOpen } from "@/lib/camp/registrations";
import { formatDate } from "@/components/camp/ui";

/** Where /camp and the old camp links now land (camp Phase 6). */
export default async function CampsIndex() {
  const camps = await listPublicCamps();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Camps</h1>
      {camps.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No camps are open for registration right now.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {camps.map((camp) => (
            <li key={camp.id}>
              <Link href={`/camps/${camp.slug}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{camp.name}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
                    </span>
                    {camp.venue && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {camp.venue}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    {registrationOpen(camp) ? "Registration open" : "Sign in to see your registration"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
