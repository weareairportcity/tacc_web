"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { PaymentStatus } from "@/lib/camp/types";
import { Card, buttonClass } from "@/components/camp/ui";
import { checkPaymentAction } from "../actions";

const POLL_MS = 4000;
const GIVE_UP_MS = 2 * 60 * 1000;

export function Processing({ slug, reference }: { slug: string; reference: string }) {
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      const result = await checkPaymentAction(slug, reference).catch(() => null);
      if (stopped) return;
      if (result?.ok && result.data !== "pending") return setStatus(result.data);
      if (Date.now() - started > GIVE_UP_MS) return setWaitedTooLong(true);
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [slug, reference]);

  const back = (
    <Link href={`/camps/${slug}/me`} className={`${buttonClass} w-full py-3 text-base`}>
      Back to your registration
    </Link>
  );

  if (status === "success") {
    return (
      <Card title="Payment received">
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Thank you. Your balance has been updated.
          </p>
          {back}
        </div>
      </Card>
    );
  }
  if (status === "failed") {
    return (
      <Card title="Payment not completed">
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <XCircle className="h-5 w-5 text-red-600" /> Nothing was added to your balance. You can try again.
          </p>
          {back}
        </div>
      </Card>
    );
  }
  return (
    <Card title="Checking your payment">
      <div className="space-y-4">
        {waitedTooLong ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="h-5 w-5" /> Still processing. Mobile money can take a while. You can close this page:
            your balance updates by itself once Paystack confirms.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Waiting for Paystack to confirm. This usually takes a few
            seconds.
          </p>
        )}
        {back}
      </div>
    </Card>
  );
}
