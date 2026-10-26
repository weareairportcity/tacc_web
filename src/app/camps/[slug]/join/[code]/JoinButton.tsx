"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, primaryButtonClass } from "@/components/camp/ui";
import { joinGroupAction } from "../../actions";

export function JoinButton({ slug, code }: { slug: string; code: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinGroupAction(slug, code);
            if (!r.ok) return setError(r.error);
            router.replace(`/camps/${slug}/roommates`);
          })
        }
        className={`${primaryButtonClass} h-[52px] w-full`}
      >
        {pending && <CommuneLoader size={22} label={null} />}
        Join the group
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
