"use client";

import { useEffect, useState } from "react";
import { Check, Phone } from "lucide-react";
import { personCardAction } from "@/app/admin/camp/actions";
import type { PersonCard } from "@/lib/camp/checkin";
import { formatCedis } from "@/lib/camp/money";
import { CommuneLoader } from "./brand";
import { Sheet } from "./sheet";
import { ErrorText, secondaryButtonClass } from "./ui";

const when = (at: string) =>
  new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).replace(",", "");

const localPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

const money = (p: PersonCard) => {
  if (p.status === "cancelled") return "Cancelled";
  const left = p.price_pesewas - p.paid_pesewas;
  if (left <= 0) return "Fully paid";
  return p.paid_pesewas > 0 ? `Part paid · ${formatCedis(left)} to go` : `Nothing paid · ${formatCedis(left)} to go`;
};

/**
 * A person's details in a sheet, from a tapped name. Read-only: Call, and
 * whatever the page adds (`actions`, e.g. Undo check-in or Pay for them).
 * Leaders get no health notes, emergency contact or roommates.
 */
export function PersonCardSheet({
  campId,
  personId,
  onClose,
  leader,
  actions,
}: {
  campId: string;
  personId: string | null;
  onClose: () => void;
  leader: boolean;
  actions?: (p: PersonCard) => React.ReactNode;
}) {
  const [card, setCard] = useState<PersonCard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!personId) return;
    let live = true;
    personCardAction(campId, personId).then((r) => {
      if (!live) return;
      if (r.ok) setCard(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
      setCard(null);
      setError("");
    };
  }, [campId, personId]);

  const p = card && card.id === personId ? card : null;
  const rows: [string, React.ReactNode][] = p
    ? [
        ...(leader ? ([["Phone", localPhone(p.phone)]] as [string, React.ReactNode][]) : []),
        ["Fellowship", p.pfcc ? `${p.fellowship} · ${p.pfcc}` : p.fellowship],
        ["Room type", p.room_type_name],
        ["Roommates", leader ? (p.group_size ? `In a group of ${p.group_size}` : p.any_room ? "Any room" : "Not chosen yet") : (p.roommates ?? (p.group_size ? `In a group of ${p.group_size}` : p.any_room ? "Any room" : "Not chosen yet"))],
        ["Room", p.room_label ?? "Not placed"],
        ["Paid", `${formatCedis(p.paid_pesewas)} of ${formatCedis(p.price_pesewas)}`],
        ["Arrived", p.checked_in_at ? when(p.checked_in_at) : "Not yet"],
        ["T-shirt", `${p.shirt_size || "No size"} · ${p.shirt_given_at ? "given" : "not given yet"}`],
        ...(!leader
          ? ([
              ["Health", p.health_notes || "Nothing noted"],
              ["Emergency", p.emergency_name ? `${p.emergency_name}${p.emergency_phone ? ` · ${localPhone(p.emergency_phone)}` : ""}` : "Not added"],
            ] as [string, React.ReactNode][])
          : []),
      ]
    : [];

  return (
    <Sheet
      open={!!personId}
      onClose={onClose}
      title={p?.full_name ?? "Loading…"}
      subtitle={
        p ? (
          p.checked_in_at && !leader ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-st-paid" strokeWidth={2.4} aria-hidden="true" />
              Arrived {when(p.checked_in_at)}
            </span>
          ) : (
            money(p)
          )
        ) : undefined
      }
    >
      {!p ? (
        error ? <ErrorText>{error}</ErrorText> : <CommuneLoader size={28} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {p.phone && (
              <a href={`tel:+${p.phone}`} className={`${secondaryButtonClass} h-11 px-5`}>
                <Phone className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Call
              </a>
            )}
            {actions?.(p)}
          </div>
          <dl className="flex flex-col">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 border-t border-stone-border py-3 text-[15px] first:border-t-0">
                <dt className="text-warm-gray">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {leader && <p className="text-[13px] leading-relaxed text-warm-gray">Leaders see their own people only. Health notes stay with coordinators.</p>}
        </>
      )}
    </Sheet>
  );
}
