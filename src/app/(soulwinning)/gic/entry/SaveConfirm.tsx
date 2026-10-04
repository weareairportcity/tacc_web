"use client";

import { useEffect, useRef } from "react";
import { burstConfetti } from "@/lib/soulwinning/confetti";

export type SaveConfirmDetail = {
  names: string[];
  soulsAdded?: number;
  milestone: number | null;
  /** The member's target (7). A milestone that's a multiple of it is a celebration. */
  target?: number;
};

interface Props {
  detail: SaveConfirmDetail;
  onDone: () => void;
}

function scallopPath(lobes = 12, radius = 40, amp = 5.5, cx = 50, cy = 50) {
  const steps = lobes * 10;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = radius + amp * Math.cos(lobes * t);
    points.push(`${cx + r * Math.cos(t)} ${cy + r * Math.sin(t)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

export function SaveConfirm({ detail, onDone }: Props) {
  const count = detail.soulsAdded ?? detail.names.length;
  const first = detail.names[0] ?? "This soul";
  const target = detail.target;
  const celebrating = Boolean(target && detail.milestone && detail.milestone % target === 0);
  const title = celebrating ? "Congratulations!" : "Successful";
  const body = celebrating
    ? detail.milestone === target
      ? `You've reached your target of ${target} souls! 🎉 Keep going.`
      : `${detail.milestone} souls, ${detail.milestone! / target!}× your target! 🎉`
    : count > 1
      ? `${count} souls have been added.`
      : detail.milestone
        ? `You've led ${detail.milestone} souls today.`
        : `${first} has been added.`;
  const confettiRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!celebrating || !confettiRef.current) return;
    const canvas = confettiRef.current;
    burstConfetti(canvas, 320);
    const again = window.setTimeout(() => burstConfetti(canvas, 200), 900);
    return () => window.clearTimeout(again);
  }, [celebrating]);

  useEffect(() => {
    const timer = window.setTimeout(onDone, celebrating ? 8000 : 4200);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone, celebrating]);

  return (
    <div
      className="sw-confirm-overlay fixed inset-0 z-[60] flex items-end justify-center bg-[#0c0a09]/25 px-5 pb-10 pt-8 backdrop-blur-[10px] sm:items-center sm:pb-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sw-confirm-title"
      data-save-confirm
      onClick={onDone}
    >
      {celebrating && <canvas ref={confettiRef} className="pointer-events-none fixed inset-0 z-[61] h-full w-full" />}
      <div
        className="sw-confirm-card w-full max-w-[20.5rem] rounded-[2rem] bg-white px-7 pb-7 pt-10 text-center shadow-[0_24px_60px_-20px_rgba(12,10,9,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sw-confirm-seal mx-auto mb-5 grid h-[5.75rem] w-[5.75rem] place-items-center">
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
            <path d={scallopPath()} fill="#C8F59A" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            className="sw-confirm-check pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-[#2F6B2A]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 12.5 10.2 16.5 18 8.5" />
          </svg>
        </div>

        <h2 id="sw-confirm-title" className="font-display text-[1.65rem] leading-none text-[#0c0a09]">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-[16rem] text-[13px] leading-5 text-[#78716c]">{body}</p>

        <button
          type="button"
          onClick={onDone}
          className="mt-7 w-full rounded-full bg-[#1c1917] px-4 py-3.5 text-sm font-semibold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
