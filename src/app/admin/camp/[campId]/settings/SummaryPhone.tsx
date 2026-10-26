"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass } from "@/components/camp/ui";
import { setMyPhoneAction } from "../../actions";

/** Where the 7 pm summary text goes. Empty turns it off. */
export function SummaryPhone({ phone }: { phone: string }) {
  const toast = useToast();
  const [value, setValue] = useState(phone ? `0${phone.slice(3)}` : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError("");
          const r = await setMyPhoneAction(value);
          if (!r.ok) return setError(r.error);
          toast(r.data ? "You'll get the 7 pm text" : "Evening text turned off");
        });
      }}
    >
      <Field label="Your phone" hint="New registrations, money in, places running low and requests waiting. Leave empty for no text.">
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="055 111 2222" className={`${inputClass} max-w-xs`} value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} className="cm-press h-10 self-start rounded-full bg-soot px-4 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
