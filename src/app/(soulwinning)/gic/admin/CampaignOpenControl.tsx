"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { campaignPhase } from "@/lib/soulwinning/api";
import { setCampaignOpen } from "@/lib/soulwinning/admin";
import type { SwCampaignSettings as SwCampaign } from "@/lib/soulwinning/types";

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Accra",
  });

/**
 * The campaign stays open until an admin closes it here. Closing stops new
 * logging on every phone within a couple of minutes; souls already on a phone
 * still count whenever they sync.
 */
export function CampaignOpenControl({
  campaign,
  onChanged,
}: {
  campaign: SwCampaign;
  onChanged: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = campaignPhase(campaign) !== "closed";

  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, busy]);

  const run = async (nextOpen: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setCampaignOpen(campaign.id, nextOpen);
      await onChanged();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            open ? "bg-[#16a34a]/10 text-[#15803d]" : "bg-[#f2f2f2] text-[#78716c]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-[#16a34a]" : "bg-[#a8a29e]"}`} />
          {open ? "Logging open" : `Closed ${time(campaign.closes_at)}`}
        </span>
        {open ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-[#f54911] px-3 py-2 text-xs font-medium text-[#f54911]"
          >
            Close campaign…
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e5] bg-white px-3 py-2 text-xs font-medium text-[#78716c] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Reopen
          </button>
        )}
        {error && !confirming && <span className="text-xs text-[#f54911]">{error}</span>}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c0a09]/60 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-campaign-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <h2 id="close-campaign-title" className="font-roobert text-xl tracking-[-0.02em] text-[#0c0a09]">
              Close {campaign.name}?
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm leading-snug text-[#57534e]">
              <li>Phones stop taking new souls within about 2 minutes.</li>
              <li>Souls already saved on a phone still count when they sync, even later.</li>
              <li>The counter and big screen keep their final numbers.</li>
              <li>You can reopen it from here if you close it by mistake.</li>
            </ul>
            {error && <p className="mt-3 text-sm text-[#f54911]">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-[#e8e6e5] py-2.5 text-sm font-medium text-[#0c0a09] disabled:opacity-50"
              >
                Keep it open
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#f54911] py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Close campaign now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
