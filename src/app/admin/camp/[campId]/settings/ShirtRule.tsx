"use client";

import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { useToast } from "@/components/camp/toast";
import { setShirtRuleAction, setShirtsOnAction } from "../../actions";

/**
 * Every camp has T-shirts. Ask-for-size only hides the size question;
 * the pass QR and T-shirt scanner stay. Paid-only controls who can collect.
 */
export function ShirtRule({
  campId,
  askSize: initialAsk,
  on: initial,
}: {
  campId: string;
  askSize: boolean;
  on: boolean;
}) {
  const toast = useToast();
  const [askSize, setAskSize] = useState(initialAsk);
  const [on, setOn] = useState(initial);
  const [pending, start] = useOneAtATime();

  const flip = (
    next: boolean,
    set: (v: boolean) => void,
    save: (campId: string, on: boolean) => Promise<{ ok: true; data: null } | { ok: false; error: string }>,
    said: [string, string],
  ) => {
    set(next);
    start(async () => {
      const r = await save(campId, next);
      if (!r.ok) {
        set(!next);
        return toast(r.error, { tone: "error" });
      }
      toast(next ? said[0] : said[1]);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Toggle
        checked={askSize}
        disabled={pending}
        onChange={(next) =>
          flip(next, setAskSize, setShirtsOnAction, ["Size asked at registration", "Size not asked; scan the pass to hand shirts out"])
        }
        title="Ask for a T-shirt size when they register"
        hint="Off: nobody picks a size. Their pass still has a QR, and you scan it at camp to hand the shirt over."
      />
      <Toggle
        checked={on}
        disabled={pending}
        onChange={(next) =>
          flip(next, setOn, setShirtRuleAction, ["T-shirts only for people who've paid in full", "Anyone registered can get a T-shirt"])
        }
        title="Only give T-shirts to people who've paid in full"
        hint="Scanning someone with a balance shows what they still owe, and no T-shirt is recorded. Turn off to let anyone registered collect one."
      />
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-soot" />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-[13px] leading-snug text-warm-gray">{hint}</span>
      </span>
    </label>
  );
}
