"use client";

import { Busy } from "@/components/camp/brand";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Info, RotateCcw } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { Gender, RoomType } from "@/lib/camp/types";
import { placesState } from "@/components/camp/places";
import { Note } from "@/components/camp/subpage";
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
      <section role="status" className="flex flex-col gap-2 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card">
        <p className="flex items-center gap-2.5 text-[17px] font-semibold">
          <Clock className="h-5 w-5 flex-none" strokeWidth={1.7} aria-hidden="true" /> Waiting for a coordinator
        </p>
        <p className="text-[15px] leading-relaxed text-warm-gray">You asked to move to {waiting.to}. We&apos;ll text you the answer. Changed your mind? Take your request back.</p>
        <span className="self-start">
          <WithdrawRequest slug={slug} requestId={waiting.id} />
        </span>
      </section>
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
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
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
                "flex min-h-[76px] items-center gap-3.5 rounded-2xl border p-3.5",
                mine || full
                  ? "border-dashed border-stone-muted bg-stone-canvas text-warm-gray"
                  : "cm-press cursor-pointer border-stone-border bg-white has-[:checked]:border-2 has-[:checked]:border-cyan-edge has-[:checked]:bg-cyan-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal",
              )}
            >
              <input type="radio" name="to" disabled={mine || full} checked={to === t.id} onChange={() => setTo(t.id)} className="sr-only" />
              {/* How many share a room, as a number. */}
              <span className="flex h-14 w-14 flex-none flex-col items-center justify-center rounded-[12px] bg-stone-rail text-ink-black">
                <span className="font-display text-2xl leading-none">{t.capacity}</span>
                <span className="text-[10px] text-warm-gray">per room</span>
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className={cn("text-[17px] font-medium", (mine || full) && "text-ink-black")}>{t.name}</span>
                <span className="text-[13px]">
                  {mine ? "Your room now" : full ? "Full" : typeof state === "number" ? `${state} ${state === 1 ? "place" : "places"} left` : `${t.capacity} in a room`}
                </span>
              </span>
              {!mine && !full && (
                <span className="flex flex-col items-end text-right tabular-nums">
                  <span className="font-display text-lg">{formatCedis(t.price_pesewas)}</span>
                  <span className="text-[13px] text-warm-gray">{diff > 0 ? `${formatCedis(diff)} more` : diff < 0 ? `${formatCedis(-diff)} less` : "Same price"}</span>
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {target && (
        <section className="cm-pop flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
          <h2 className="font-display text-xl tracking-[-0.017em]">If a coordinator says yes</h2>
          <dl className="flex flex-col gap-1.5 text-[15px] tabular-nums">
            <div className="flex justify-between">
              <dt className="text-warm-gray">{target.name} costs</dt>
              <dd>{formatCedis(target.price_pesewas)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">You&apos;ve paid</dt>
              <dd>{formatCedis(paid)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-border pt-2 font-semibold">
              <dt>{paid > target.price_pesewas ? "You've paid more by" : paid === target.price_pesewas ? "You'll pay" : "You'll pay"}</dt>
              <dd>{paid === target.price_pesewas ? "Nothing more" : paid > target.price_pesewas ? formatCedis(paid - target.price_pesewas) : `${formatCedis(target.price_pesewas - paid)} more`}</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 text-sm text-warm-gray">
            <Info className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" /> You&apos;ll leave your roommate group, and choose roommates again for {target.name}.
          </p>
          <Field label="Why do you want to move? (you can skip this)">
            <textarea rows={2} className={`${inputClass} h-auto py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
            <Busy pending={pending} text="Sending…">{`Ask to move to ${target.name}`}</Busy>
          </button>
        </section>
      )}

      <Note icon={RotateCcw}>
        <strong className="font-semibold">Moving to a cheaper room?</strong>{" "}
        The difference isn&apos;t refunded automatically. After the move, ask for a refund on Cancel or
        refund. It goes back to the number that paid.
      </Note>
      <p className="text-sm leading-relaxed text-warm-gray">
        After you ask, this page shows &ldquo;Waiting for a coordinator&rdquo; and we text you the answer. You can take your request back while you wait.
      </p>
    </form>
  );
}
