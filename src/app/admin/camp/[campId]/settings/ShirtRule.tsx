"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/camp/toast";
import { setShirtRuleAction } from "../../actions";

/** T-shirts only for people who've paid in full. On by default. */
export function ShirtRule({ campId, on: initial }: { campId: string; on: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const r = await setShirtRuleAction(campId, next);
            if (!r.ok) {
              setOn(!next);
              return toast(r.error, { tone: "error" });
            }
            toast(next ? "T-shirts only for people who've paid in full" : "Anyone registered can get a T-shirt");
          });
        }}
        className="mt-0.5 h-5 w-5 flex-none accent-soot"
      />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-medium">Only give T-shirts to people who&apos;ve paid in full</span>
        <span className="text-[13px] leading-snug text-warm-gray">
          Scanning someone with a balance shows what they still owe, and no T-shirt is recorded. Turn off to let anyone registered collect one.
        </span>
      </span>
    </label>
  );
}
