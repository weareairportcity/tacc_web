"use client";

import { Busy } from "@/components/camp/brand";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Info } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { Gender, RoomType } from "@/lib/camp/types";
import { placesState } from "@/components/camp/places";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { askRoomChangeAction } from "../../actions";
import { WithdrawRequest } from "../MeControls";

export function ChangeRoomForm({
  slug,
  current,
  paid,
  gender,
  types,
  waiting,
}: {
  slug: string;
  current: string;
  paid: number;
  gender: Gender;
  types: RoomType[];
  waiting: { id: string; to: string } | null;
}) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const now = types.find((t) => t.id === current)!;
  const target = types.find((t) => t.id === to);

  if (waiting) {
    return (
      <p role="status" className="flex items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px]">
        <Clock className="h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
        <span className="flex-1">Move to {waiting.to} asked. We&apos;ll text you.</span>
        <WithdrawRequest slug={slug} requestId={waiting.id} />
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!target) return;
        start(async () => {
          setError("");
          const r = await askRoomChangeAction(slug, target.id, reason);
          if (!r.ok) return setError(r.error);
          router.refresh();
        });
      }}
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">Room types</legend>
        {types.map((t) => {
          const state = placesState(t, gender);
          const mine = t.id === current;
          const full = state === "full" && !mine;
          const diff = t.price_pesewas - now.price_pesewas;
          return (
            <label
              key={t.id}
              className={cn(
                "flex min-h-[60px] items-center gap-3 rounded-[10px] border px-4 py-3",
                mine || full ? "border-dashed border-stone-muted bg-stone-canvas" : "cm-press cursor-pointer border-stone-border bg-white has-[:checked]:border-2 has-[:checked]:border-soot has-[:checked]:bg-stone-canvas",
              )}
            >
              <input type="radio" name="to" disabled={mine || full} checked={to === t.id} onChange={() => setTo(t.id)} className="h-[18px] w-[18px] accent-soot" />
              <span className="flex flex-1 flex-col">
                <span className="text-[15px] font-medium">
                  {t.name}
                  {mine && <span className="font-normal text-warm-gray"> · yours now</span>}
                </span>
                <span className="text-[13px] text-warm-gray">
                  {t.capacity} in a room · {formatCedis(t.price_pesewas)}
                  {full ? " · full" : typeof state === "number" ? ` · ${state} left` : ""}
                </span>
              </span>
              {!mine && <span className="text-sm font-medium tabular-nums">{diff >= 0 ? "+" : "−"} {formatCedis(Math.abs(diff))}</span>}
            </label>
          );
        })}
      </fieldset>

      {target && (
        <section className="cm-pop flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
          <dl className="flex flex-col gap-1.5 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-warm-gray">{target.name}</dt>
              <dd>{formatCedis(target.price_pesewas)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">You&apos;ve paid</dt>
              <dd>{formatCedis(paid)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-border pt-2 font-semibold">
              <dt>{paid > target.price_pesewas ? "Back to you" : "Left to pay"}</dt>
              <dd>{formatCedis(Math.abs(target.price_pesewas - paid))}</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 text-[13px] text-warm-gray">
            <Info className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" /> You&apos;ll leave your roommate group.
          </p>
          <Field label="Reason (optional)">
            <textarea rows={2} className={`${inputClass} h-auto py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
            <Busy pending={pending} text="Sending…">{`Ask to move to ${target.name}`}</Busy>
          </button>
        </section>
      )}
    </form>
  );
}
