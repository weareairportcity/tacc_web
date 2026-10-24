import Link from "next/link";
import { Download, Search } from "lucide-react";
import { CHURCHES, FELLOWSHIPS, PFCCS } from "@/lib/fellowships";
import { ROOMMATE_LABELS, ROOMMATE_STATUSES, filtersToQuery, type PeopleFilters as Filters } from "@/lib/camp/reports";
import { REGISTRATION_STATUSES, REGISTRATION_STATUS_LABELS, type RoomType } from "@/lib/camp/types";
import { buttonClass, inputClass, secondaryButtonClass } from "./ui";

/**
 * A plain GET form, so filters live in the URL: a filtered view can be
 * bookmarked or shared, and it works without JavaScript. The server
 * re-validates every value (parsePeopleFilters).
 */
export function PeopleFilters({
  filters,
  roomTypes,
  exportHref,
  searchLabel,
  showChurch,
  hide = [],
}: {
  filters: Filters;
  roomTypes: RoomType[];
  exportHref: string;
  searchLabel: string;
  showChurch: boolean;
  /** Filters that can't narrow a leader's list further, e.g. fellowship for a fellowship leader. */
  hide?: ("fellowship" | "pfcc")[];
}) {
  const select = (name: keyof Filters, label: string, options: [string, string][]) => (
    <select name={name} aria-label={label} defaultValue={filters[name] ?? ""} className={`${inputClass} py-1.5`}>
      <option value="">{label}: all</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
  const active = filtersToQuery(filters) !== "";

  return (
    <form method="get" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex gap-2">
        <input name="q" defaultValue={filters.q ?? ""} placeholder={searchLabel} aria-label={searchLabel} className={inputClass} />
        <button type="submit" className={buttonClass}>
          <Search className="h-4 w-4" /> Filter
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {select("status", "Status", REGISTRATION_STATUSES.map((s) => [s, REGISTRATION_STATUS_LABELS[s]]))}
        {!hide.includes("fellowship") && select("fellowship", "Fellowship", FELLOWSHIPS.map((f) => [f.name, f.name]))}
        {!hide.includes("pfcc") && select("pfcc", "PFCC", PFCCS.map((p) => [p, p]))}
        {showChurch && CHURCHES.length > 1 && select("church", "Church", CHURCHES.map((c) => [c, c]))}
        {select("gender", "Gender", [
          ["female", "Female"],
          ["male", "Male"],
        ])}
        {select("room_type", "Room type", roomTypes.map((t) => [t.id, t.name]))}
        {select("roommate", "Roommates", ROOMMATE_STATUSES.map((s) => [s, ROOMMATE_LABELS[s]]))}
        {select("room", "Room", [
          ["placed", "Placed"],
          ["waiting", "Waiting for a room"],
        ])}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a href={exportHref} className={secondaryButtonClass}>
          <Download className="h-4 w-4" /> Export CSV
        </a>
        {active && (
          <Link href="?" className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
