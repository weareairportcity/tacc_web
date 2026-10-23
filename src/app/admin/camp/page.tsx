import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { listCamps } from "@/lib/camp/camps";
import { NoAccess, pageStaff } from "./access";
import { NewCamp } from "./NewCamp";
import { STATUS_STYLES, secondaryButtonClass } from "./ui";

export default async function CampAdminHome() {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const camps = await listCamps();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Camps</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {staff.email}</p>
        </div>
        {staff.role === "admin" && (
          <Link href="/admin/camp/staff" className={secondaryButtonClass}>
            <Users className="h-4 w-4" /> Staff
          </Link>
        )}
      </div>

      <NewCamp />

      {camps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No camps yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {camps.map((camp) => (
            <li key={camp.id}>
              <Link href={`/admin/camp/${camp.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{camp.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[camp.status]}`}>
                      {camp.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {camp.starts_on} to {camp.ends_on}
                    {camp.venue && ` · ${camp.venue}`}
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
