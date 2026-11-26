"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, MessageSquare, Phone } from "lucide-react";
import { Sheet } from "@/components/camp/sheet";
import type { KeyBearer } from "@/lib/camp/key-bearers";
import { PersonPanel, type Mode } from "../people/PersonPanel";

const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

/**
 * One key per room: who holds it, and why. Tap a row for the room and
 * everyone in it, each with Message and Call. Tap a name for all their details.
 */
export function KeyBearers({ campId, rows, empty }: { campId: string; rows: KeyBearer[]; empty: number }) {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [person, setPerson] = useState<{ id: string; mode: Mode } | null>(null);
  const room = rows.find((r) => r.room_id === roomId) ?? null;

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
              <button type="button" onClick={() => setRoomId(r.room_id)} className="cm-row flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-sm">
                <KeyRound className="h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{r.bearer.full_name}</span>
                  <span className="truncate text-[13px] text-warm-gray">
                    {r.bearer.fellowship} · {r.why === "made" ? "made the room" : "first in the room"}
                  </span>
                </span>
                <span className="hidden tabular-nums text-warm-gray sm:inline">{localPhone(r.bearer.phone)}</span>
                <span className="flex flex-col items-end">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-[13px] tabular-nums text-warm-gray">
                    {r.occupied} of {r.capacity} beds · {r.gender === "male" ? "men" : "women"}
                  </span>
                </span>
                {r.bearer.checked_in && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-st-paid/15 px-2 py-0.5 text-xs font-medium text-st-paid">
                    <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" /> Here
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!room} onClose={() => setRoomId(null)} title={room ? `Room ${room.label}` : ""} subtitle={room ? `${room.room_type_name} · ${room.gender === "male" ? "men" : "women"} · ${room.occupied} of ${room.capacity} beds` : null}>
        {room && (
          <ul className="flex flex-col">
            {room.occupants.map((o) => {
              const key = o.registration_id === room.bearer.registration_id;
              return (
                <li key={o.registration_id} className="flex items-center gap-3 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
                  <button type="button" onClick={() => setPerson({ id: o.registration_id, mode: "view" })} className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="flex items-center gap-1.5 text-[15px] font-medium">
                      <span className="truncate">{o.full_name}</span>
                      {key && <KeyRound className="h-4 w-4 flex-none text-cyan-edge" strokeWidth={1.8} aria-label="Key bearer" />}
                    </span>
                    <span className="truncate text-[13px] text-warm-gray">
                      {o.fellowship}
                      {o.checked_in ? " · Here" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerson({ id: o.registration_id, mode: "message" })}
                    className="cm-press inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-border bg-white px-3.5 text-sm font-medium"
                  >
                    <MessageSquare className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Message
                  </button>
                  <a href={`tel:+${o.phone}`} className="cm-press inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-border bg-white px-3.5 text-sm font-medium">
                    <Phone className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Call
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <PersonPanel key={`${person?.id}-${person?.mode}`} campId={campId} id={person?.id ?? null} startMode={person?.mode} onClose={() => setPerson(null)} onChanged={() => router.refresh()} />
    </div>
  );
}
