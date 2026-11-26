import { Check, KeyRound } from "lucide-react";
import { PersonLink } from "@/components/camp/shell/PersonOnThisPage";
import type { KeyBearer } from "@/lib/camp/key-bearers";

const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

/** One key per room: who holds it, and why. Tap a name for their panel. */
export function KeyBearers({ rows, empty }: { rows: KeyBearer[]; empty: number }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-warm-gray">
        {rows.length} {rows.length === 1 ? "room has" : "rooms have"} someone in it, so a key bearer. The key bearer is whoever made the room, or the first person put in it.
        {empty ? ` ${empty} ${empty === 1 ? "room is" : "rooms are"} empty.` : ""}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px] text-warm-gray">No rooms have anyone in them yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {rows.map((r) => (
            <li key={r.room_id} className="border-t border-stone-border first:border-t-0">
              <PersonLink id={r.bearer.registration_id} className="cm-row flex min-h-14 items-center gap-3 px-4 py-2 text-sm">
                <KeyRound className="h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{r.bearer.full_name}</span>
                  <span className="truncate text-[13px] text-warm-gray">
                    {r.bearer.fellowship} · {r.why === "made" ? "made the room" : "first in the room"}
                  </span>
                </span>
                <span className="hidden text-warm-gray tabular-nums sm:inline">{localPhone(r.bearer.phone)}</span>
                <span className="flex flex-col items-end">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-[13px] text-warm-gray tabular-nums">
                    {r.occupied} of {r.capacity} beds · {r.gender === "male" ? "men" : "women"}
                  </span>
                </span>
                {r.bearer.checked_in && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-st-paid/15 px-2 py-0.5 text-xs font-medium text-st-paid">
                    <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" /> Here
                  </span>
                )}
              </PersonLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
