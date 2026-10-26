"use client";
import { leaveTo } from "@/components/camp/leave";

import { useEffect, useState, useTransition } from "react";
import { Check, CreditCard, Link2, Lock, Phone, RotateCcw, Trash2 } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { SHIRT_SIZES, type ProfileInput } from "@/lib/camp/types";
import { CommuneLoader, Busy } from "@/components/camp/brand";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, RegistrationStatus, StackedBar, inputClass, primaryButtonClass } from "@/components/camp/ui";
import {
  cancelRegistrationAction,
  changeRoomTypeAction,
  checkInAction,
  getPersonAction,
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
type Mode = "view" | "edit" | "room" | "refund" | "cancel";

const PAYMENT_WORDS = { pending: "Processing", success: "", failed: "Not completed" } as const;
const ghanaPhone = (p: string) => (/^233\d{9}$/.test(p) ? `0${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p);

/** One person, in a side panel over the People list. Every change ends in a toast. */
export function PersonPanel({ campId, id, onClose, onChanged }: { campId: string; id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);
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
      ) : mode === "refund" ? (
        <Refund
          paid={data.person.paid_pesewas}
          name={data.person.full_name}
          pending={pending}
          error={error}
          onCancel={() => setMode("view")}
          onSend={(amount, note) =>
            act(() => refundPersonAction(campId, data.person.id, amount, note), (r: { refunded_pesewas: number }) => `Refunded ${formatCedis(r.refunded_pesewas)}`)
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

          <div className="grid grid-cols-3 gap-2">
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
            <QuickButton icon={Phone} label="Call" href={/^233\d{9}$/.test(data.person.phone) ? `tel:+${data.person.phone}` : undefined} />
          </div>
          <ErrorText>{error}</ErrorText>
          {blockers && blockers.payments.length > 0 && <Blockers campId={campId} me={blockers.me} payments={blockers.payments} />}

          <Section title="Camp" action={data.roomTypes.length > 1 && data.person.status !== "cancelled" ? <EditLink onClick={() => setMode("room")} label="Change" /> : null}>
            <Row term="Room type" value={data.person.room_type_name} />
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
            <Row term="Gender" value={data.person.gender === "male" ? "Male" : "Female"} />
            <Row term="Fellowship" value={`${data.person.fellowship} · ${data.person.pfcc}`} />
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
              <Row
                key={pay.id}
                term={`${(pay.paid_at ?? pay.created_at).slice(0, 10)}${pay.payer_name ? ` · ${pay.payer_name}` : pay.bulk_id ? " · by a coordinator" : ""}`}
                value={
                  <span className={pay.status === "success" ? "" : "text-warm-gray"}>
                    {formatCedis(pay.amount_pesewas)}
                    {PAYMENT_WORDS[pay.status] && ` · ${PAYMENT_WORDS[pay.status]}`}
                  </span>
                }
              />
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

function Refund({ paid, name, pending, error, onCancel, onSend }: { paid: number; name: string; pending: boolean; error: string; onCancel: () => void; onSend: (amount: string, note: string) => void }) {
  const [amount, setAmount] = useState(pesewasToCedisInput(paid));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Amount" hint={`Up to ${formatCedis(paid)}. Paystack fees aren't refunded.`}>
        <span className="relative flex">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
          <input inputMode="decimal" className={`${inputClass} pl-12 text-base tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </span>
      </Field>
      <Field label="Note (optional)">
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <ErrorText>{error}</ErrorText>
      {confirming ? (
        <InlineConfirm
          question={`Send GHS ${amount} back to ${name.split(" ")[0]}?`}
          detail="Through Paystack, to the MoMo or card they used. Can't be undone."
          confirmLabel="Yes, refund"
          primary
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => onSend(amount, note)}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Cancel
          </button>
          <button type="button" onClick={() => setConfirming(true)} className={`${primaryButtonClass} flex-1`}>
            Refund GHS {amount}
          </button>
        </div>
      )}
    </div>
  );
}
