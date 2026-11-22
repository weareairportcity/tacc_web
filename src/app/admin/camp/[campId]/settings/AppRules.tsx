"use client";

import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { useToast } from "@/components/camp/toast";
import { setAppSwitchAction } from "../../actions";

type Which = "app_required" | "leader_reminders" | "details_required";

/** The Commune app: whether attendees set it up first, whether leaders may send payment reminders, and whether emergency and health are required. */
export function AppRules({
  campId,
  required: initialRequired,
  reminders: initialReminders,
  details: initialDetails,
}: {
  campId: string;
  required: boolean;
  reminders: boolean;
  details: boolean;
}) {
  const toast = useToast();
  const [on, setOn] = useState<Record<Which, boolean>>({ app_required: initialRequired, leader_reminders: initialReminders, details_required: initialDetails });
  const [pending, start] = useOneAtATime();

  const flip = (which: Which, next: boolean, said: [string, string]) => {
    setOn((s) => ({ ...s, [which]: next }));
    start(async () => {
      const r = await setAppSwitchAction(campId, which, next);
      if (!r.ok) {
        setOn((s) => ({ ...s, [which]: !next }));
        return toast(r.error, { tone: "error" });
      }
      toast(next ? said[0] : said[1]);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Toggle
        checked={on.app_required}
        disabled={pending}
        onChange={(next) => flip("app_required", next, ["Attendees set up the app first", "Attendees can use their page without the app"])}
        title="Attendees add Commune to their phone before using their page"
        hint="On a phone, their page opens once Commune is on their Home Screen with notifications on. Anyone who can't taps “My phone can't do this” and gets texts instead. Computers are never asked."
      />
      <Toggle
        checked={on.leader_reminders}
        disabled={pending}
        onChange={(next) => flip("leader_reminders", next, ["Leaders can send payment reminders", "Leaders' payment reminders are off"])}
        title="Leaders can send payment reminders"
        hint="As app notifications only, never texts, so they cost nothing. Each person gets at most one a day, and only people with the app."
      />
      <Toggle
        checked={on.details_required}
        disabled={pending}
        onChange={(next) => flip("details_required", next, ["Emergency contact and health are required", "Emergency contact and health are optional"])}
        title="Attendees must add an emergency contact and health details"
        hint="When they open their page, a sheet asks who to call and about their health. They tick if they have no health conditions. They can't pay or pick roommates until it's saved."
      />
    </div>
  );
}

function Toggle({ checked, disabled, onChange, title, hint }: { checked: boolean; disabled: boolean; onChange: (next: boolean) => void; title: string; hint: string }) {
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
