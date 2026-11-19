"use client";

import { useEffect, useRef, useState } from "react";
import { BedDouble, ChevronRight, HeartPulse, Phone, Search, ShieldAlert, Users } from "lucide-react";
import type { FoundPerson } from "@/lib/camp/reports";
import type { MedicalCard } from "@/lib/camp/medical";
import { CommuneLoader } from "@/components/camp/brand";
import { Sheet } from "@/components/camp/sheet";
import { ErrorText, inputClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { medicalCardAction, medicalFindAction } from "../../actions";

const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

/** A phone number as a big tap-to-call row. */
function CallRow({ name, phone, note }: { name: string; phone: string; note?: string }) {
  return (
    <a href={`tel:+${phone}`} className="cm-row flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{name}</span>
        <span className="truncate text-[13px] tabular-nums text-warm-gray">
          {localPhone(phone)}
          {note ? ` · ${note}` : ""}
        </span>
      </span>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-soot text-white">
        <Phone className="h-4 w-4" strokeWidth={1.8} aria-label={`Call ${name}`} />
      </span>
    </a>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Phone; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[13px] font-medium text-warm-gray">
        <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

const box = "overflow-hidden rounded-[10px] border border-stone-border bg-white [&>*+*]:border-t [&>*+*]:border-stone-border";

/**
 * The medical team's search: type a name or phone, tap the person, and their
 * health notes, emergency contact, room and roommates open in a sheet.
 */
export function MedicalSearch({ campId }: { campId: string }) {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<FoundPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [card, setCard] = useState<MedicalCard | null>(null);
  const [cardError, setCardError] = useState("");
  const asked = useRef(0);

  useEffect(() => {
    const q = term.trim();
    const n = ++asked.current;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await medicalFindAction(campId, q);
      if (n !== asked.current) return;
      setSearching(false);
      if (r.ok) {
        setFound(r.data);
        setError("");
      } else setError(r.error);
    }, 220);
    return () => clearTimeout(t);
  }, [term, campId]);

  const show = (id: string) => {
    setOpen(id);
    setCard(null);
    setCardError("");
    void medicalCardAction(campId, id).then((r) => {
      if (r.ok) setCard(r.data);
      else setCardError(r.error);
    });
  };

  const typed = term.trim().length >= 2;
  const p = card && card.id === open ? card : null;

  return (
    <>
      <label className="relative block">
        <span className="sr-only">Name or phone</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-warm-gray" strokeWidth={1.7} aria-hidden="true" />
        <input
          type="search"
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Name or phone"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className={cn(inputClass, "h-14 rounded-full pl-12 text-[17px] sm:h-14 sm:text-[17px]")}
        />
      </label>
      <ErrorText>{error}</ErrorText>

      {typed && (
        <ul className={cn(box, "shadow-seline-card")} aria-busy={searching} aria-live="polite">
          {found.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => show(f.id)} className="cm-row flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">{f.full_name}</span>
                  <span className="truncate text-[13px] text-warm-gray">
                    {f.fellowship}
                    {f.room_label ? ` · Room ${f.room_label}` : ""}
                    {f.status === "cancelled" ? " · Cancelled" : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
          {found.length === 0 && !searching && <li className="px-4 py-5 text-center text-[15px] text-warm-gray">No one found. Try part of the name, or the phone number.</li>}
        </ul>
      )}
      {!typed && <p className="text-center text-[13px] text-warm-gray">Each person you open is noted in the History.</p>}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={p?.full_name ?? "Loading…"} subtitle={p ? `${p.fellowship} · ${p.gender === "male" ? "Male" : "Female"}${p.is_minor ? " · Under 18" : ""}` : undefined}>
        {!p ? (
          cardError ? <ErrorText>{cardError}</ErrorText> : <CommuneLoader size={28} />
        ) : (
          <div className="flex flex-col gap-5">
            {p.phone && (
              <div className={box}>
                <CallRow name={p.full_name} phone={p.phone} note="their phone" />
              </div>
            )}

            <Block icon={HeartPulse} title="Health notes">
              {p.health_notes ? (
                <p className="whitespace-pre-wrap rounded-[10px] bg-cyan-tint px-4 py-3 text-[15px] leading-relaxed">{p.health_notes}</p>
              ) : (
                <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px] text-warm-gray">Nothing written.</p>
              )}
            </Block>

            <Block icon={ShieldAlert} title={p.is_minor ? "Emergency contact and guardian" : "Emergency contact"}>
              {p.emergency_phone || (p.is_minor && p.guardian_phone) ? (
                <div className={box}>
                  {p.emergency_phone && <CallRow name={p.emergency_name || "Emergency contact"} phone={p.emergency_phone} note="emergency contact" />}
                  {!!p.is_minor && p.guardian_phone && <CallRow name={p.guardian_name || "Guardian"} phone={p.guardian_phone} note="parent or guardian" />}
                </div>
              ) : (
                <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px] text-warm-gray">
                  {p.emergency_name ? `${p.emergency_name}, no phone added.` : "Not added."}
                </p>
              )}
            </Block>

            <Block icon={BedDouble} title="Room">
              <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px]">
                {p.room_label ? (
                  <>
                    <strong className="font-semibold">Room {p.room_label}</strong> <span className="text-warm-gray">· {p.room_type_name}</span>
                  </>
                ) : (
                  <span className="text-warm-gray">Not placed in a room yet · {p.room_type_name}</span>
                )}
              </p>
            </Block>

            {p.room_label && (
              <Block icon={Users} title={p.roommates.length ? `Roommates (${p.roommates.length})` : "Roommates"}>
                {p.roommates.length ? (
                  <div className={box}>
                    {p.roommates.map((r) => (
                      <CallRow key={`${r.full_name}${r.phone}`} name={r.full_name} phone={r.phone} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px] text-warm-gray">No one else in this room yet.</p>
                )}
              </Block>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
