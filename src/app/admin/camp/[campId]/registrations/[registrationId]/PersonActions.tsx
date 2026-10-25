"use client";

import { CommuneLoader } from "@/components/camp/brand";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { RoomType } from "@/lib/camp/types";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/camp/ui";
import { changeRoomTypeAction, recordRefundAction } from "../../../actions";

/** Runs an action that may return a warning; keeps the warning on screen after the refresh. */
function useAdjust() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true; data: string | null } | { ok: false; error: string }>, onDone?: () => void) => {
    setError("");
    setWarning("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error);
      if (result.data) setWarning(result.data);
      onDone?.();
      router.refresh();
    });
  };
  const notices = (
    <>
      <ErrorText>{error}</ErrorText>
      {warning && (
        <p className="flex items-start gap-2 text-sm text-ink-black">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {warning}
        </p>
      )}
    </>
  );
  return { run, pending, notices };
}

export function RecordRefund({ registrationId, paid }: { registrationId: string; paid: number }) {
  const { run, pending, notices } = useAdjust();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => recordRefundAction(registrationId, amount, reference, note),
          () => {
            setAmount("");
            setReference("");
            setNote("");
          },
        );
      }}
      className="space-y-3"
    >
      <p className="text-sm text-warm-gray">
        Refund in the Paystack dashboard first, then record it here. Up to {formatCedis(paid)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount (GHS)">
          <input required inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paystack refund reference">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {notices}
      <button type="submit" disabled={pending || paid === 0} className={buttonClass}>
        {pending && <CommuneLoader size={18} label={null} />}
        Record refund
      </button>
    </form>
  );
}

export function ChangeRoomType({
  registrationId,
  current,
  roomTypes,
  paid,
}: {
  registrationId: string;
  current: string;
  roomTypes: RoomType[];
  paid: number;
}) {
  const { run, pending, notices } = useAdjust();
  const [roomTypeId, setRoomTypeId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const others = roomTypes.filter((t) => t.id !== current);

  return (
    <div className="space-y-3">
      <p className="text-sm text-warm-gray">
        The new price applies. They leave their roommate group and room, which belong to the old room type.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="New room type"
          className={`${inputClass} max-w-xs`}
          value={roomTypeId}
          onChange={(e) => {
            setRoomTypeId(e.target.value);
            setConfirming(false);
          }}
        >
          <option value="">Choose a room type…</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {formatCedis(t.price_pesewas)}
              {t.price_pesewas < paid ? " (refund needed first)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!roomTypeId || pending}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            setConfirming(false);
            run(() => changeRoomTypeAction(registrationId, roomTypeId), () => setRoomTypeId(""));
          }}
          className={confirming ? "rounded-[10px] bg-ink-black px-4 py-2 text-sm font-medium text-white" : buttonClass}
        >
          {pending && <CommuneLoader size={18} label={null} />}
          {confirming ? "Change it?" : "Change room type"}
        </button>
      </div>
      {notices}
    </div>
  );
}
