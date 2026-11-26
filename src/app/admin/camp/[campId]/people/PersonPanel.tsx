"use client";
import { leaveTo } from "@/components/camp/leave";

import { useEffect, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Bell, Check, CreditCard, Link2, Lock, MessageSquare, Phone, RotateCcw, Trash2 } from "lucide-react";
import { arrivalLine } from "@/lib/camp/arrival";
import { APP_STATE_WORDS } from "@/lib/camp/app-words";
import { messageCost, type Delivery } from "@/lib/camp/message-cost";
import { coordinatorText, MAX_COORDINATOR_MESSAGE } from "@/lib/camp/sms";
import { HowPick } from "@/components/camp/HowPick";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { SHIRT_SIZES, type Gender, type ProfileInput } from "@/lib/camp/types";
import type { GenderRoom } from "@/lib/camp/gender";
import { CommuneLoader, Busy } from "@/components/camp/brand";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, RegistrationStatus, StackedBar, inputClass, primaryButtonClass } from "@/components/camp/ui";
import {
  cancelRegistrationAction,
  changeGenderAction,
  changeRoomTypeAction,
  checkInAction,
  findPeopleAction,
  genderRoomsAction,
  getPersonAction,
  messagePeopleAction,
  movePaymentAction,
  openPaymentsForAction,
  payForPeopleAction,
  payLinkAction,
  refundPersonAction,
  undoCheckInAction,
  updatePersonAction,
} from "../../actions";
import type { OpenPayment } from "@/lib/camp/payments";
import { Blockers } from "../OpenPayments";

type Data = Extract<Awaited<ReturnType<typeof getPersonAction>>, { ok: true }>["data"];
type Mode = "view" | "edit" | "room" | "gender" | "refund" | "cancel" | "message" | "movepay";

const PAYMENT_WORDS = { pending: "Processing", success: "", failed: "Not completed" } as const;
const ghanaPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

/** One person, in a side panel over the People list. Every change ends in a toast. */
export function PersonPanel({ campId, id, onClose, onChanged }: { campId: string; id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [pending, start] = useOneAtATime();
  const [paying, setPaying] = useState(false);
  const [moving, setMoving] = useState<{ id: string; amount: number } | null>(null);
  const [blockers, setBlockers] = useState<{ me: string; payments: OpenPayment[] } | null>(null);

  const load = (personId: string) =>
    getPersonAction(campId, personId).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.error);
    });

  // The parent remounts this per person (key), so state starts fresh each time.
  useEffect(() => {
    if (id) load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, campId]);

  /** Runs an action, then toasts, reloads the panel and refreshes the list. */
  const act = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, message: (data: never) => string) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (!r.ok) return setError(r.error);
      toast(message(r.data as never));
      setMode("view");
      if (id) await load(id);
      onChanged();
    });

  const p = data?.person;
  const outstanding = p ? p.price_pesewas - p.paid_pesewas : 0;

  return (
    <Sheet
      open={!!id}
      onClose={onClose}
      title={p?.full_name ?? "Loading…"}
      subtitle={p ? <RegistrationStatus status={p.status} /> : null}
      footer={
        mode === "view" ? (
          <button type="button" onClick={onClose} className="cm-press ml-auto h-11 rounded-full bg-soot px-5 text-sm font-medium text-white">
            Done
          </button>
        ) : null
      }
    >
      {!data ? (
        error ? <ErrorText>{error}</ErrorText> : <div className="flex flex-1 items-center justify-center py-16"><CommuneLoader size={48} /></div>
      ) : mode === "edit" ? (
        <EditDetails
          data={data}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSave={(input) => act(() => updatePersonAction(campId, data.person.id, input), () => "Details saved")}
        />
      ) : mode === "room" ? (
        <ChangeRoom
          data={data}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSave={(roomTypeId, name) => act(() => changeRoomTypeAction(data.person.id, roomTypeId), (w: string | null) => w ?? `Moved to ${name}`)}
        />
      ) : mode === "gender" ? (
        <ChangeGender
          campId={campId}
          data={data}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSave={(gender, roomId) =>
            act(() => changeGenderAction(campId, data.person.id, gender, roomId), (w: string | null) => w ?? `${data.person.full_name} is now down as ${gender}`)
          }
        />
      ) : mode === "movepay" && moving ? (
        <MovePayment
          campId={campId}
          fromId={data.person.id}
          from={data.person.full_name}
          amount={moving.amount}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onMove={(toId, toName) =>
            act(() => movePaymentAction(campId, moving.id, toId), (w: { warning: string | null } | null) => w?.warning ?? `Moved ${formatCedis(moving.amount)} to ${toName}`)
          }
        />
      ) : mode === "message" ? (
        <MessageOne
          data={data}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSend={(message, how) =>
            act(
              () => messagePeopleAction(campId, [data.person.id], message, how),
              (r: { texts: number; app: number }) =>
                r.app && r.texts ? `Sent to ${data.person.full_name} by app and text` : r.app ? `Sent to ${data.person.full_name} in the app` : `Texted ${data.person.full_name}`,
            )
          }
        />
      ) : mode === "refund" ? (
        <Refund
          paid={data.person.paid_pesewas}
          name={data.person.full_name}
          phone={data.person.phone}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSend={(amount, reference, note) =>
            act(
              () => refundPersonAction(campId, data.person.id, amount, reference, note),
              (r: { refunded_pesewas: number; warning: string | null }) => r.warning ?? `Recorded a refund of ${formatCedis(r.refunded_pesewas)}`,
            )
          }
        />
      ) : (
        <>
          <section className="flex flex-col gap-2.5 rounded-[12px] bg-stone-canvas p-4">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[28px] leading-none tabular-nums">{formatCedis(outstanding > 0 ? outstanding : data.person.paid_pesewas)}</span>
              <span className="text-[13px] text-warm-gray">
                {outstanding > 0 ? `outstanding of ${formatCedis(data.person.price_pesewas)}` : "paid"}
              </span>
            </span>
            <StackedBar
              parts={[
                { key: "paid", value: data.person.paid_pesewas, color: "bg-st-paid", label: "Paid" },
                { key: "left", value: Math.max(0, outstanding), color: "bg-stone-border", label: "Outstanding" },
              ]}
            />
          </section>

          <div className="grid grid-cols-4 gap-2">
            <QuickButton
              icon={CreditCard}
              label="Pay"
              disabled={outstanding <= 0 || data.person.status === "cancelled" || pending}
              busy={pending && paying}
              onClick={() => {
                setPaying(true);
                setBlockers(null);
                start(async () => {
                  const r = await payForPeopleAction(campId, [data.person.id], "");
                  if (!r.ok) {
                    setPaying(false);
                    setError(r.error);
                    const open = await openPaymentsForAction(campId, [data.person.id]);
                    if (open.ok) setBlockers(open.data);
                    return;
                  }
                  await leaveTo(r.data);
                });
              }}
            />
            <QuickButton
              icon={Link2}
              label="Pay link"
              disabled={outstanding <= 0 || pending}
              onClick={() =>
                start(async () => {
                  const r = await payLinkAction(campId, data.person.id);
                  if (!r.ok) return setError(r.error);
                  await navigator.clipboard?.writeText(r.data).catch(() => null);
                  toast("Pay link copied");
                })
              }
            />
            <QuickButton icon={MessageSquare} label="Message" disabled={data.person.status === "cancelled" || !/^233\d{9}$/.test(data.person.phone)} onClick={() => setMode("message")} />
            <QuickButton icon={Phone} label="Call" href={/^233\d{9}$/.test(data.person.phone) ? `tel:+${data.person.phone}` : undefined} />
          </div>
          <ErrorText>{error}</ErrorText>
          {blockers && blockers.payments.length > 0 && <Blockers campId={campId} me={blockers.me} payments={blockers.payments} />}

          <Section title="Camp" action={data.roomTypes.length > 1 && data.person.status !== "cancelled" ? <EditLink onClick={() => setMode("room")} label="Change" /> : null}>
            <Row term="Room type" value={data.person.room_type_name} />
            <Row term="App" value={APP_STATE_WORDS[data.app.state]} />
            <Row term="Roommates" value={data.group ? (data.group.members.join(", ") || "Alone in a group") : data.person.any_room ? "Any room" : "None yet"} />
            <Row term="Room" value={data.room?.label ?? "Not placed"} />
            <Row
              term="Arrived"
              value={
                data.checkedIn ? (
                  <button
                    type="button"
                    onClick={() => act(() => undoCheckInAction(campId, data.person.id), () => "Check-in undone")}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Yes · <span className="underline underline-offset-[3px]">Undo</span>
                  </button>
                ) : data.person.status !== "cancelled" ? (
                  <button type="button" onClick={() => act(() => checkInAction(campId, data.person.id), () => `${data.person.full_name} checked in`)} className="underline underline-offset-[3px]">
                    Check in now
                  </button>
                ) : (
                  "—"
                )
              }
            />
          </Section>

          <Section title="Details" action={<EditLink onClick={() => setMode("edit")} label="Edit" />}>
            <Row term="Phone" value={ghanaPhone(data.person.phone)} />
            <Row term="Email" value={data.person.email || "—"} />
            <Row
              term="Gender"
              value={
                <span className="inline-flex items-center gap-2">
                  {data.person.gender === "male" ? "Male" : "Female"}
                  {data.person.status !== "cancelled" && (
                    <button type="button" onClick={() => setMode("gender")} className="underline underline-offset-[3px]">
                      Change
                    </button>
                  )}
                </span>
              }
            />
            <Row term="Fellowship" value={`${data.person.fellowship} · ${data.person.pfcc}`} />
            <Row term="Arriving" value={arrivalLine(data.person) || "Hasn't said yet"} />
            <Row term="T-shirt" value={data.person.shirt_size || "—"} />
          </Section>

          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Emergency
              </span>
            }
          >
            <Row term="Contact" value={data.details.emergency_name ? `${data.details.emergency_name}${data.details.emergency_phone ? ` · ${ghanaPhone(data.details.emergency_phone)}` : ""}` : "—"} />
            <Row term="Health" value={data.details.health_notes || "—"} />
            {data.details.is_minor === 1 && (
              <Row
                term="Under 18"
                value={`Guardian: ${data.details.guardian_name || "—"}${data.details.guardian_phone ? ` · ${ghanaPhone(data.details.guardian_phone)}` : ""}`}
              />
            )}
          </Section>

          {data.requests.length > 0 && (
            <Section title="Waiting">
              {data.requests.map((r) => (
                <Row
                  key={r.id}
                  term={r.kind === "refund" ? "Refund" : "Room change"}
                  value={
                    <a href={`/admin/camp/${campId}/requests?r=${r.id}`} className="underline underline-offset-[3px]">
                      {r.kind === "refund" ? formatCedis(r.amount_pesewas ?? 0) : `to ${r.to_room_type_name}`}
                    </a>
                  }
                />
              ))}
            </Section>
          )}

          <Section title="Payments">
            {data.payments.length === 0 && <p className="text-sm text-warm-gray">None yet.</p>}
            {data.payments.map((pay) => (
              <div key={pay.id}>
                <Row
                  term={`${(pay.paid_at ?? pay.created_at).slice(0, 10)}${pay.payer_name ? ` · ${pay.payer_name}` : pay.bulk_id ? " · by a coordinator" : ""}`}
                  value={
                    <span className={pay.status === "success" ? "" : "text-warm-gray"}>
                      {formatCedis(pay.amount_pesewas)}
                      {PAYMENT_WORDS[pay.status] && ` · ${PAYMENT_WORDS[pay.status]}`}
                    </span>
                  }
                />
                {pay.status === "success" && (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setMoving({ id: pay.id, amount: pay.amount_pesewas });
                      setMode("movepay");
                    }}
                    className="min-h-10 text-xs text-warm-gray underline underline-offset-[3px]"
                  >
                    Paid for someone else? Move to them
                  </button>
                )}
              </div>
            ))}
            {data.refunds.map((f) => (
              <Row key={f.id} term={`${f.created_at.slice(0, 10)} · refund`} value={`− ${formatCedis(f.amount_pesewas)}`} />
            ))}
          </Section>

          {mode === "cancel" ? (
            <InlineConfirm
              question={`Cancel ${data.person.full_name}'s registration?`}
              detail="They leave their room and group. Refund separately if needed."
              confirmLabel="Yes, cancel"
              pending={pending}
              onCancel={() => setMode("view")}
              onConfirm={() => act(() => cancelRegistrationAction(data.person.id), (w: string | null) => w ?? "Registration cancelled")}
            />
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
              {data.person.paid_pesewas > 0 && (
                <button type="button" onClick={() => setMode("refund")} className="inline-flex min-h-10 items-center gap-1.5">
                  <RotateCcw className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Refund
                </button>
              )}
              {data.person.status !== "cancelled" && (
                <button type="button" onClick={() => setMode("cancel")} className="inline-flex min-h-10 items-center gap-1.5">
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Cancel registration
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function QuickButton({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  busy,
}: {
  icon: typeof Phone;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const cls = "cm-press flex h-16 flex-col items-center justify-center gap-1 rounded-[12px] border border-stone-border bg-white text-[13px] font-medium disabled:opacity-40 aria-disabled:opacity-40";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-busy={busy} className={cls}>
        {busy ? <CommuneLoader size={20} label={null} /> : <Icon className="h-[19px] w-[19px]" strokeWidth={1.6} aria-hidden="true" />} {label}
      </button>
    );
  }
  return (
    <a href={href} aria-disabled={!href || undefined} className={cls}>
      <Icon className="h-[19px] w-[19px]" strokeWidth={1.6} aria-hidden="true" /> {label}
    </a>
  );
}

function Section({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mb-1 flex min-h-8 items-center justify-between">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {action}
      </div>
      <dl className="flex flex-col text-sm">{children}</dl>
    </section>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-t border-[#f0efee] py-1.5">
      <dt className="text-warm-gray">{term}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

const EditLink = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} className="cm-press h-8 rounded-full border border-stone-border bg-white px-3 text-xs font-medium">
    {label}
  </button>
);

function EditDetails({ data, pending, error, onCancel, onSave }: { data: Data; pending: boolean; error: string; onCancel: () => void; onSave: (input: ProfileInput) => void }) {
  const [v, setV] = useState<ProfileInput>({
    full_name: data.person.full_name,
    email: data.person.email,
    shirt_size: data.person.shirt_size,
    emergency_name: data.details.emergency_name,
    emergency_phone: data.details.emergency_phone ? `0${data.details.emergency_phone.slice(3)}` : "",
    health_notes: data.details.health_notes,
  });
  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <Field label="Full name">
        <input required className={inputClass} value={v.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Email">
        <input type="email" required className={inputClass} value={v.email} onChange={set("email")} />
      </Field>
      <Field label="T-shirt size">
        <select className={inputClass} value={v.shirt_size} onChange={set("shirt_size")}>
          <option value="">Not given</option>
          {SHIRT_SIZES.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </Field>
      <Field label="Emergency contact">
        <input className={inputClass} value={v.emergency_name} onChange={set("emergency_name")} />
      </Field>
      <Field label="Their phone">
        <input type="tel" inputMode="tel" className={inputClass} value={v.emergency_phone} onChange={set("emergency_phone")} />
      </Field>
      <Field label="Health notes">
        <textarea rows={3} className={`${inputClass} h-auto py-2.5`} value={v.health_notes} onChange={set("health_notes")} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
          Cancel
        </button>
        <button type="submit" disabled={pending} className={`${primaryButtonClass} flex-1`}>
          <Busy pending={pending} text="Saving…">Save</Busy>
        </button>
      </div>
    </form>
  );
}

function ChangeRoom({ data, pending, error, onCancel, onSave }: { data: Data; pending: boolean; error: string; onCancel: () => void; onSave: (roomTypeId: string, name: string) => void }) {
  const [to, setTo] = useState("");
  const target = data.roomTypes.find((t) => t.id === to);
  const diff = target ? target.price - data.person.price_pesewas : 0;
  const tooMuch = target ? data.person.paid_pesewas > target.price : false;
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">Move to</legend>
        {data.roomTypes
          .filter((t) => t.id !== data.person.room_type_id)
          .map((t) => (
            <label key={t.id} className="cm-press flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border border-stone-border px-4 has-[:checked]:border-2 has-[:checked]:border-soot has-[:checked]:bg-stone-canvas">
              <input type="radio" name="to" value={t.id} checked={to === t.id} onChange={() => setTo(t.id)} className="h-[18px] w-[18px] accent-soot" />
              <span className="flex-1 text-[15px] font-medium">{t.name}</span>
              <span className="text-sm tabular-nums text-warm-gray">{formatCedis(t.price)}</span>
            </label>
          ))}
      </fieldset>
      {target && (
        <p className="rounded-[12px] bg-stone-canvas px-4 py-3 text-sm">
          {tooMuch
            ? `They've paid ${formatCedis(data.person.paid_pesewas - target.price)} more than ${target.name} costs. Refund that first.`
            : diff > 0
              ? `${formatCedis(diff)} more to pay. They leave their group and room.`
              : `${formatCedis(-diff)} cheaper. They leave their group and room.`}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
          Cancel
        </button>
        <button type="button" disabled={!target || tooMuch || pending} onClick={() => target && onSave(target.id, target.name)} className={`${primaryButtonClass} flex-1`}>
          <Busy pending={pending} text="Moving…">{target ? `Move to ${target.name}` : "Pick a room type"}</Busy>
        </button>
      </div>
    </div>
  );
}

function ChangeGender({
  campId,
  data,
  pending,
  error,
  onCancel,
  onSave,
}: {
  campId: string;
  data: Data;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSave: (gender: Gender, roomId: string | null) => void;
}) {
  const to: Gender = data.person.gender === "male" ? "female" : "male";
  const word = to === "male" ? "men's" : "women's";
  const canPlace = data.person.status === "fully_paid";
  const [rooms, setRooms] = useState<GenderRoom[] | null>(null);
  const [roomId, setRoomId] = useState("");
  useEffect(() => {
    if (!canPlace) return;
    genderRoomsAction(campId, data.person.id).then((r) => setRooms(r.ok ? r.data : []));
  }, [campId, data.person.id, canPlace]);
  const leaves = [data.group && `their ${to === "male" ? "women's" : "men's"} roommate group`, data.room && `room ${data.room.label}`].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px]">
        {data.person.full_name} is down as {data.person.gender}. Change to <span className="font-semibold">{to}</span>?
      </p>
      <p className="rounded-[12px] bg-stone-canvas px-4 py-3 text-sm">
        Rooms and roommate groups are for men or women only.{" "}
        {leaves.length ? `They leave ${leaves.join(" and ")}.` : "They're not in a group or room yet."} This takes one of {data.person.room_type_name}&apos;s places for{" "}
        {to === "male" ? "men" : "women"}.
      </p>
      {canPlace && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">
            Put them in a {word} {data.person.room_type_name} room
          </legend>
          {rooms === null ? (
            <div className="flex justify-center py-4">
              <CommuneLoader size={32} />
            </div>
          ) : (
            <>
              <RoomChoice id="" label="Not now" note="Place them from Rooms later" checked={roomId === ""} onPick={setRoomId} />
              {rooms.map((r) => (
                <RoomChoice key={r.id} id={r.id} label={r.label} note={`${r.free} ${r.free === 1 ? "bed" : "beds"} free`} checked={roomId === r.id} onPick={setRoomId} />
              ))}
              {!rooms.length && <p className="text-sm text-warm-gray">No {word} {data.person.room_type_name} room has a free bed.</p>}
            </>
          )}
        </fieldset>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
          Cancel
        </button>
        <button type="button" disabled={pending} onClick={() => onSave(to, roomId || null)} className={`${primaryButtonClass} flex-1`}>
          <Busy pending={pending} text="Changing…">{`Change to ${to}`}</Busy>
        </button>
      </div>
    </div>
  );
}

function RoomChoice({ id, label, note, checked, onPick }: { id: string; label: string; note: string; checked: boolean; onPick: (id: string) => void }) {
  return (
    <label className="cm-press flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border border-stone-border px-4 has-[:checked]:border-2 has-[:checked]:border-soot has-[:checked]:bg-stone-canvas">
      <input type="radio" name="gender-room" value={id} checked={checked} onChange={() => onPick(id)} className="h-[18px] w-[18px] accent-soot" />
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <span className="text-sm text-warm-gray">{note}</span>
    </label>
  );
}

/**
 * expressPay has no refund API: the coordinator sends the money back by MoMo
 * or bank first, then records it here with the transaction reference.
 */
function Refund({
  paid,
  name,
  phone,
  pending,
  error,
  onCancel,
  onSend,
}: {
  paid: number;
  name: string;
  phone: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSend: (amount: string, reference: string, note: string) => void;
}) {
  const [amount, setAmount] = useState(pesewasToCedisInput(paid));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const first = name.split(" ")[0];
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[10px] bg-stone-canvas p-4 text-sm leading-relaxed">
        Send the money to {first} yourself first, by MoMo to <span className="tabular-nums">{ghanaPhone(phone)}</span> or by bank. Then record it here so their balance is right.
      </p>
      <Field label="Amount sent back" hint={`Up to ${formatCedis(paid)}. The payment fee isn't refunded.`}>
        <span className="relative flex">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
          <input inputMode="decimal" className={`${inputClass} pl-12 text-base tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </span>
      </Field>
      <Field label="Reference" hint="The MoMo or bank transaction ID, so it can be traced.">
        <input required className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="Note (optional)">
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <ErrorText>{error}</ErrorText>
      {confirming ? (
        <InlineConfirm
          question={`Record GHS ${amount} sent back to ${first}?`}
          detail="What they've paid goes down by this much. Can't be undone."
          confirmLabel="Yes, record it"
          primary
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => onSend(amount, reference, note)}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Cancel
          </button>
          <button type="button" disabled={reference.trim().length < 3} onClick={() => setConfirming(true)} className={`${primaryButtonClass} flex-1`}>
            Record refund
          </button>
        </div>
      )}
    </div>
  );
}

/** A message to this one person. Coordinators pick In the app, Text, or Both. */
function MessageOne({ data, pending, error, onCancel, onSend }: { data: Data; pending: boolean; error: string; onCancel: () => void; onSend: (message: string, how: Delivery) => void }) {
  const [message, setMessage] = useState("");
  const [how, setHow] = useState<Delivery>("app");
  const onApp = data.app.state === "on";
  const first = data.person.full_name.trim().split(/\s+/)[0];
  const cost = messageCost([{ first, app: data.app.state }], message, how);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSend(message, how);
      }}
    >
      <p className={`flex items-start gap-2.5 rounded-[12px] p-3.5 text-[15px] leading-snug ${onApp ? "bg-[#e7f4e7]" : "bg-stone-canvas"}`}>
        {onApp ? (
          <Bell className="mt-0.5 h-[18px] w-[18px] flex-none text-[#0b5e0b]" strokeWidth={1.7} aria-hidden="true" />
        ) : (
          <MessageSquare className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.7} aria-hidden="true" />
        )}
        <span>
          {onApp ? (
            <>
              {first} has notifications on. In the app is free; Text or Both costs credits.
            </>
          ) : (
            <>
              {first} isn&apos;t on the app ({APP_STATE_WORDS[data.app.state].toLowerCase()}). In the app still texts them; pick Text or Both to be sure.
            </>
          )}
        </span>
      </p>
      <HowPick value={how} onChange={setHow} />
      <Field label="Message">
        <textarea rows={4} autoFocus maxLength={MAX_COORDINATOR_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} h-auto py-2.5 leading-relaxed`} />
      </Field>
      <p className="rounded-[16px] rounded-bl-[4px] bg-[#e9f4fd] px-3.5 py-3 text-sm leading-relaxed break-words">{coordinatorText(first, message || "…")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
          Back
        </button>
        <button type="submit" disabled={pending || message.trim().length < 3} className={`${primaryButtonClass} flex-1`}>
          <Busy pending={pending} text="Sending…">
            {cost.credits ? `Send (${cost.credits} ${cost.credits === 1 ? "credit" : "credits"})` : "Send in the app"}
          </Busy>
        </button>
      </div>
    </form>
  );
}

/** Moves one payment to the person it was really for. Search by name, pick them, confirm. */
function MovePayment({
  campId,
  fromId,
  from,
  amount,
  pending,
  error,
  onCancel,
  onMove,
}: {
  campId: string;
  fromId: string;
  from: string;
  amount: number;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onMove: (toId: string, toName: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<{ id: string; full_name: string; fellowship: string; status: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; full_name: string } | null>(null);

  useEffect(() => {
    if (term.trim().length < 2) return;
    let stale = false;
    const t = setTimeout(() => {
      findPeopleAction(campId, term).then((r) => {
        if (!stale && r.ok) setFound(r.data.filter((x) => x.id !== fromId && x.status !== "cancelled"));
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [term, campId, fromId]);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[10px] bg-stone-canvas p-4 text-sm leading-relaxed">
        Move {formatCedis(amount)} from {from} to the person who really paid or was paid for. The receipt goes with it. {from}&apos;s balance goes up by that amount and theirs goes down.
      </p>
      <Field label="Move it to" hint="Type their name.">
        <input className={inputClass} value={term} onChange={(e) => { setTerm(e.target.value); setChosen(null); }} autoComplete="off" />
      </Field>
      {!chosen && term.trim().length >= 2 && found.length > 0 && (
        <ul className="flex flex-col divide-y divide-stone-border rounded-[10px] border border-stone-border">
          {found.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setChosen({ id: x.id, full_name: x.full_name })} className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm">
                <span className="font-medium">{x.full_name}</span>
                <span className="text-warm-gray">{x.fellowship}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>
      {chosen ? (
        <InlineConfirm
          question={`Move ${formatCedis(amount)} to ${chosen.full_name}?`}
          detail={`It leaves ${from} and counts towards ${chosen.full_name}. Logged in History.`}
          confirmLabel="Yes, move it"
          primary
          pending={pending}
          onCancel={() => setChosen(null)}
          onConfirm={() => onMove(chosen.id, chosen.full_name)}
        />
      ) : (
        <button type="button" onClick={onCancel} className="cm-press h-12 self-start rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
          Cancel
        </button>
      )}
    </div>
  );
}
