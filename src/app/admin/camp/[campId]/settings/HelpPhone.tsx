"use client";

import { useState } from "react";
import { Busy } from "@/components/camp/brand";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass } from "@/components/camp/ui";
import { setHelpPhoneAction } from "../../actions";

/** The number behind "Need help? Call or WhatsApp a coordinator" on attendee pages. Empty hides it. */
export function HelpPhone({ campId, phone }: { campId: string; phone: string }) {
  const toast = useToast();
  const [value, setValue] = useState(phone ? `0${phone.slice(3)}` : "");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError("");
          const r = await setHelpPhoneAction(campId, value);
          if (!r.ok) return setError(r.error);
          toast(r.data ? "Attendees will see Call and WhatsApp buttons" : "Help buttons hidden");
        });
      }}
    >
      <Field label="Help number" hint="A phone that has WhatsApp. Leave empty to hide the help buttons.">
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="055 111 2222" className={`${inputClass} max-w-xs`} value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} className="cm-press h-10 self-start rounded-full bg-soot px-4 text-sm font-medium text-white disabled:opacity-60">
        <Busy pending={pending} text="Saving…">Save</Busy>
      </button>
    </form>
  );
}
