"use client";

import { useEffect, useState } from "react";
import { CommuneLoader } from "@/components/camp/brand";
import { headlineClass } from "@/components/camp/ui";
import { checkLinkPaymentAction } from "../../../actions";

export function LinkPaid({ slug, token, reference, first }: { slug: string; token: string; reference: string; first: string }) {
  const [status, setStatus] = useState<"pending" | "success" | "failed">("pending");
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const r = await checkLinkPaymentAction(slug, token, reference);
      const s = r.ok ? r.data : "failed";
      setStatus(s);
      if (s === "pending" && ++tries < 30) timer = setTimeout(check, 4000);
    };
    check();
    return () => clearTimeout(timer);
  }, [slug, token, reference]);

  return (
    <div className="flex flex-col items-start gap-4 pt-10">
      {status === "pending" ? (
        <>
          <CommuneLoader size={56} />
          <h1 className={`${headlineClass} text-[32px]`}>Confirming with Paystack…</h1>
        </>
      ) : status === "success" ? (
        <h1 className={`cm-rise ${headlineClass} text-[32px]`}>
          Thank you. <span className="text-cyan-edge">{first}</span> will see it.
        </h1>
      ) : (
        <>
          <h1 className={`${headlineClass} text-[32px]`}>The payment didn&apos;t go through</h1>
          <a href={`/camps/${slug}/pay/${token}`} className="underline underline-offset-[3px]">
            Try again
          </a>
        </>
      )}
    </div>
  );
}
