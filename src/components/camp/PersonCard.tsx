"use client";

import { useEffect, useState } from "react";
import { Bell, Check, MessageSquare, Phone } from "lucide-react";
import { leaderMessageAction, personCardAction } from "@/app/admin/camp/actions";
import { APP_STATE_WORDS } from "@/lib/camp/app-words";
import type { PersonCard } from "@/lib/camp/checkin";
import { formatCedis } from "@/lib/camp/money";
import { MAX_COORDINATOR_MESSAGE } from "@/lib/camp/sms";
import { CommuneLoader, Busy } from "./brand";
import { useOneAtATime } from "./useOneAtATime";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { ErrorText, Field, formatAccraStamp, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const when = (at: string) => formatAccraStamp(at);

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
  canMessage,
  actions,
}: {
  campId: string;
  personId: string | null;
  onClose: () => void;
  leader: boolean;
  /** Fellowship, PFCC and group leaders: in-app message, never a text. */
  canMessage?: boolean;
  actions?: (p: PersonCard) => React.ReactNode;
}) {
  const toast = useToast();
  const [card, setCard] = useState<PersonCard | null>(null);
  const [error, setError] = useState("");
  const [messaging, setMessaging] = useState(false);

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
      setMessaging(false);
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
              ...(p.guardian ? ([["Under 18", `Guardian: ${p.guardian}`]] as [string, React.ReactNode][]) : []),
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
            {canMessage && p.status !== "cancelled" && (
              <button type="button" onClick={() => setMessaging((on) => !on)} className={`${secondaryButtonClass} h-11 px-5`}>
                <MessageSquare className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Message
              </button>
            )}
            {actions?.(p)}
          </div>
          {canMessage && messaging && (
            <LeaderMessage
              campId={campId}
              person={p}
              onSent={() => {
                setMessaging(false);
                toast(`Sent to ${p.full_name.trim().split(/\s+/)[0]} in the app`);
              }}
            />
          )}
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

/** In-app only. If they haven't turned notifications on, we say so and don't send. */
function LeaderMessage({ campId, person, onSent }: { campId: string; person: PersonCard; onSent: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  const first = person.full_name.trim().split(/\s+/)[0];
  const onApp = person.app === "on";
  if (!onApp) {
    return (
      <p className="flex items-start gap-2.5 rounded-[12px] bg-stone-canvas p-3.5 text-[15px] leading-snug">
        <Bell className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.7} aria-hidden="true" />
        <span>
          {first} hasn&apos;t turned on notifications ({APP_STATE_WORDS[person.app].toLowerCase()}). You can only message them in the app.
        </span>
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-[12px] border border-stone-border p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError("");
          const r = await leaderMessageAction(campId, person.id, message);
          if (!r.ok) return setError(r.error);
          setMessage("");
          onSent();
        });
      }}
    >
      <p className="flex items-start gap-2.5 text-[15px] leading-snug">
        <Bell className="mt-0.5 h-[18px] w-[18px] flex-none text-[#0b5e0b]" strokeWidth={1.7} aria-hidden="true" />
        <span>
          This goes to {first} in the app. Leaders can&apos;t send texts. <strong className="font-semibold">Free.</strong>
        </span>
      </p>
      <Field label="Message">
        <textarea rows={3} autoFocus maxLength={MAX_COORDINATOR_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} h-auto py-2.5 leading-relaxed`} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || message.trim().length < 3} className={`${primaryButtonClass} h-11 w-full`}>
        <Busy pending={pending} text="Sending…">Send in the app</Busy>
      </button>
    </form>
  );
}
