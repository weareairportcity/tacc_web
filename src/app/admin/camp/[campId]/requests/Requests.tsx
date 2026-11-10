"use client";

import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import Link from "next/link";
import { ArrowLeftRight, Check, ChevronRight, RotateCcw, X } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import type { CampRequest } from "@/lib/camp/types";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, RegistrationStatus, headlineClass, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { approveRefundAction, approveRoomChangeAction, declineRequestAction } from "../../actions";

const since = (iso: string) => {
  const hours = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return hours < 1 ? "just now" : hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
};

function line(r: CampRequest) {
  if (r.kind === "refund") return r.registration_status === "cancelled" ? "Refund · cancelled" : "Refund";
  return `${r.room_type_name} → ${r.to_room_type_name}`;
}

function amount(r: CampRequest) {
  if (r.kind === "refund") return formatCedis(r.amount_pesewas ?? 0);
  const diff = (r.to_price_pesewas ?? 0) - r.price_pesewas;
  return diff >= 0 ? `+ ${formatCedis(diff)}` : `− ${formatCedis(-diff)}`;
}

export function Requests({ campId, requests, done, open: initialOpen }: { campId: string; requests: CampRequest[]; done: boolean; open: string | null }) {
  const [open, setOpen] = useState<string | null>(initialOpen);
  const current = requests.find((r) => r.id === open) ?? null;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Requests</h1>
        <nav aria-label="Requests" className="flex gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {[
            ["", "Waiting"],
            ["done", "Decided"],
          ].map(([v, label]) => (
            <Link key={v} href={v ? "?show=done" : "?"} aria-current={(v === "done") === done ? "page" : undefined} className={cn("cm-press flex h-9 items-center rounded-full px-4 text-sm font-medium", (v === "done") === done ? "bg-soot text-white" : "")}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {requests.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px]">{done ? "Nothing decided yet." : "Nothing waiting. When attendees ask for a refund or a different room, it shows here."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {requests.map((r) => {
            const Icon = r.kind === "refund" ? RotateCcw : ArrowLeftRight;
            return (
              <li key={r.id} className="border-t border-stone-border first:border-t-0">
                <button type="button" onClick={() => setOpen(r.id)} className={cn("cm-row flex min-h-16 w-full items-center gap-3.5 px-4 py-2.5 text-left", open === r.id && "bg-cyan-tint")}>
                  <Icon className="h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{r.full_name}</span>
                    <span className="truncate text-[13px] text-warm-gray">
                      {line(r)}
                      {done && ` · ${r.status === "approved" ? "approved" : r.status === "declined" ? "declined" : "withdrawn"}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 tabular-nums">
                    <span className="text-sm font-medium">{amount(r)}</span>
                    <span className="text-xs text-warm-gray">{since(done ? (r.decided_at ?? r.created_at) : r.created_at)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-warm-gray">Refunds are decided case by case. Send the money by MoMo or bank yourself, then record it here with its reference. The payment fee isn&apos;t refunded.</p>

      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.full_name ?? ""} subtitle={current ? line(current) : undefined}>
        {current && <Decide key={current.id} campId={campId} request={current} onDone={() => setOpen(null)} />}
      </Sheet>
    </div>
  );
}

function Decide({ campId, request: r, onDone }: { campId: string; request: CampRequest; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(pesewasToCedisInput(Math.min(r.amount_pesewas ?? 0, r.paid_pesewas)));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [step, setStep] = useState<"view" | "approve" | "decline">("view");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  const overpaid = r.kind === "room_change" ? r.paid_pesewas - (r.to_price_pesewas ?? 0) : 0;
  // A refund, or a downgrade they've overpaid for: money goes back by hand first, then it's recorded here.
  const sendsMoney = r.kind === "refund" || overpaid > 0;
  const first = r.full_name.split(" ")[0];

  const finish = (message: string) => {
    toast(message);
    onDone();
  };

  return (
    <>
      {r.reason && <blockquote className="rounded-[12px] bg-stone-canvas px-4 py-3.5 text-[15px] leading-relaxed">“{r.reason}”</blockquote>}
      <dl className="flex flex-col text-sm">
        {[
          ["Status", <RegistrationStatus key="s" status={r.registration_status} />],
          ["Paid", formatCedis(r.paid_pesewas)],
          ...(r.kind === "room_change"
            ? [
                ["New price", formatCedis(r.to_price_pesewas ?? 0)],
                overpaid > 0 ? ["Back to them", formatCedis(overpaid)] : ["Left to pay after", formatCedis((r.to_price_pesewas ?? 0) - r.paid_pesewas)],
              ]
            : [["Asked for", formatCedis(r.amount_pesewas ?? 0)]]),
        ].map(([t, v]) => (
          <div key={String(t)} className="flex min-h-10 items-center justify-between border-t border-[#f0efee]">
            <dt className="text-warm-gray">{t}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/admin/camp/${campId}/people?person=${r.registration_id}`} className="text-sm underline underline-offset-[3px]">
        Open {r.full_name.split(" ")[0]}&apos;s details
      </Link>

      {r.status !== "pending" ? (
        <p className="flex items-center gap-2 text-sm">
          {r.status === "approved" ? <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> : <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          {r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Withdrawn"}
          {r.decided_by && ` by ${r.decided_by.split("@")[0]}`}
          {r.decision_note && ` · “${r.decision_note}”`}
        </p>
      ) : (
        <>
          {sendsMoney && (
            <p className="rounded-[10px] bg-stone-canvas p-4 text-sm leading-relaxed">
              To approve, send {r.kind === "refund" ? "the refund" : formatCedis(overpaid)} to {first} first, by MoMo or bank. Then enter the transaction reference.
            </p>
          )}
          {r.kind === "refund" && (
            <Field label="Amount sent back" hint={`Up to ${formatCedis(r.paid_pesewas)}.`}>
              <span className="relative flex">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
                <input inputMode="decimal" className={`${inputClass} pl-12 text-base tabular-nums`} value={value} onChange={(e) => setValue(e.target.value)} />
              </span>
            </Field>
          )}
          {sendsMoney && (
            <Field label="Reference" hint="The MoMo or bank transaction ID, so it can be traced.">
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" />
            </Field>
          )}
          <Field label="Note to them (optional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <ErrorText>{error}</ErrorText>
          {step === "approve" ? (
            <InlineConfirm
              question={
                r.kind === "refund" ? `Record GHS ${value} sent back to ${first}?` : `Move ${first} to ${r.to_room_type_name}?`
              }
              detail={
                r.kind === "refund"
                  ? "What they've paid goes down by this much. Can't be undone."
                  : overpaid > 0
                    ? `The ${formatCedis(overpaid)} you sent back is recorded first. They leave their group and room.`
                    : "They leave their group and room."
              }
              confirmLabel="Yes"
              primary
              pending={pending}
              onCancel={() => setStep("view")}
              onConfirm={() =>
                start(async () => {
                  setError("");
                  const res = r.kind === "refund" ? await approveRefundAction(r.id, value, note, reference) : await approveRoomChangeAction(r.id, note, reference);
                  if (!res.ok) {
                    setStep("view");
                    return setError(res.error);
                  }
                  finish(r.kind === "refund" ? `Recorded ${first}'s refund` : `${first} moved to ${r.to_room_type_name}`);
                })
              }
            />
          ) : step === "decline" ? (
            <InlineConfirm
              question={`Decline ${r.full_name.split(" ")[0]}'s request?`}
              confirmLabel="Yes, decline"
              pending={pending}
              onCancel={() => setStep("view")}
              onConfirm={() =>
                start(async () => {
                  const res = await declineRequestAction(r.id, note);
                  if (!res.ok) {
                    setStep("view");
                    return setError(res.error);
                  }
                  finish("Declined");
                })
              }
            />
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("decline")} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
                Decline
              </button>
              <button type="button" disabled={sendsMoney && reference.trim().length < 3} onClick={() => setStep("approve")} className={`${primaryButtonClass} h-12 flex-1`}>
                {r.kind === "refund" ? "Record refund" : "Approve"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
