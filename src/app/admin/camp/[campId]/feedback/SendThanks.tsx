"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { InlineConfirm } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { primaryButtonClass } from "@/components/camp/ui";
import { sendThanksAction } from "../../actions";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** "Text N people", with a confirm: each text costs, and nobody is texted twice. */
export function SendThanks({ campId, pending: waiting, perPress }: { campId: string; pending: number; perPress: number }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (waiting === 0) return <p className="text-sm text-warm-gray">Everyone who arrived has had their thank-you.</p>;
  const now = Math.min(waiting, perPress);
  return confirming ? (
    <InlineConfirm
      question={`Send ${now} thank-you ${now === 1 ? "text" : "texts"}?`}
      detail={`Each person gets their own feedback link. Texts cost money, and nobody gets two.${waiting > now ? ` The other ${waiting - now} go on the next press.` : ""}`}
      confirmLabel="Send"
      primary
      pending={pending}
      onCancel={() => setConfirming(false)}
      onConfirm={() =>
        start(async () => {
          const r = await sendThanksAction(campId);
          setConfirming(false);
          if (!r.ok) return toast(r.error, { tone: "error" });
          const { sent, failed, remaining } = r.data;
          if (!sent) return toast("The texts didn't go. Press again to try again.", { tone: "error" });
          toast(`Texted ${people(sent)}${failed ? `. ${failed} didn't go; press again to retry.` : remaining ? `. ${remaining} still to text.` : ""}`, failed ? { tone: "error" } : undefined);
          router.refresh();
        })
      }
    />
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className={`${primaryButtonClass} self-start`}>
      <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" /> Text {people(waiting)}
    </button>
  );
}
