"use client";

import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { MessageSquare } from "lucide-react";
import { InlineConfirm } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { primaryButtonClass } from "@/components/camp/ui";
import { sendThanksAction } from "../../actions";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** "Text N people", with a confirm: each text costs, and nobody is texted twice. */
export function SendThanks({ campId, pending: waiting, perPress }: { campId: string; pending: number; perPress: number }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useOneAtATime();
  if (waiting === 0) return <p className="text-sm text-warm-gray">Everyone who arrived has had their thank-you.</p>;
  const now = Math.min(waiting, perPress);
  return confirming ? (
    <InlineConfirm
      question={`Send ${now} thank-you ${now === 1 ? "message" : "messages"}?`}
      detail={`Each person gets their own feedback link: in the app if they have it (free), otherwise by text (2 credits). Nobody gets two.${waiting > now ? ` The other ${waiting - now} go on the next press.` : ""}`}
      confirmLabel="Send"
      primary
      pending={pending}
      onCancel={() => setConfirming(false)}
      onConfirm={() =>
        start(async () => {
          const r = await sendThanksAction(campId);
          setConfirming(false);
          if (!r.ok) return toast(r.error, { tone: "error" });
          const { sent, app, failed, remaining } = r.data;
          if (!sent && !app) return toast("The messages didn't go. Press again to try again.", { tone: "error" });
          toast(`Thanked ${people(sent + app)}${app ? ` (${app} in the app)` : ""}${failed ? `. ${failed} didn't go; press again to retry.` : remaining ? `. ${remaining} still to text.` : ""}`, failed ? { tone: "error" } : undefined);
        })
      }
    />
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className={`${primaryButtonClass} self-start`}>
      <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" /> Thank {people(waiting)}
    </button>
  );
}
