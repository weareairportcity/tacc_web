"use client";

import { useEffect, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { useRouter } from "next/navigation";
import { Busy } from "@/components/camp/brand";
import { Sheet } from "@/components/camp/sheet";
import { ErrorText, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { joinGroupAction, rememberJoinAction } from "../../actions";

export function JoinButton({
  slug,
  code,
  label = "Join the group",
  leavingFrom,
}: {
  slug: string;
  code: string;
  label?: string;
  /** First name of the group they'd leave; opens "are you sure?" first. */
  leavingFrom?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useOneAtATime();

  const join = (leaveCurrent: boolean) =>
    start(async () => {
      const r = await joinGroupAction(slug, code, leaveCurrent);
      setConfirm(false);
      if (!r.ok) return setError(r.error);
      router.replace(`/camps/${slug}/roommates`);
    });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => (leavingFrom ? setConfirm(true) : join(false))}
        className={`${primaryButtonClass} h-[52px] w-full`}
      >
        <Busy pending={pending && !confirm} text="Joining…">
          {label}
        </Busy>
      </button>
      <ErrorText>{error}</ErrorText>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Are you sure?"
        subtitle={leavingFrom ? `This makes you leave ${leavingFrom}'s group.` : undefined}
        footer={
          <>
            <button type="button" onClick={() => setConfirm(false)} className={`${secondaryButtonClass} h-12 flex-1`}>
              No
            </button>
            <button type="button" disabled={pending} onClick={() => join(true)} className={`${primaryButtonClass} h-12 flex-[1.4]`}>
              <Busy pending={pending} text="Joining…">
                Yes, join
              </Busy>
            </button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed">
          You can only be in one group. Joining this one takes you out of {leavingFrom}&apos;s.
        </p>
      </Sheet>
    </div>
  );
}

/** Keeps the friend's link on this phone while they register and pay (pages can't set cookies themselves). */
export function RememberJoin({ slug, code }: { slug: string; code: string }) {
  useEffect(() => {
    rememberJoinAction(slug, code).catch(() => null);
  }, [slug, code]);
  return null;
}
