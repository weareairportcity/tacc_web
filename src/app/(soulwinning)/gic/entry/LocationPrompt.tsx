"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { getCurrentCoords } from "@/lib/soulwinning/entries";

interface Props {
  onGranted: () => void;
}

/**
 * Location is asked for once, here, rather than at the moment of the first
 * save — every soul logged has to carry where it happened, so the permission
 * has to be settled before the entry screen opens.
 */
export function LocationPrompt({ onGranted }: Props) {
  const [status, setStatus] = useState<"idle" | "asking" | "blocked">("idle");

  const request = async () => {
    setStatus("asking");
    const coords = await getCurrentCoords();
    if (coords) {
      onGranted();
      return;
    }
    setStatus("blocked");
  };

  return (
    <div className="space-y-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#c1e1f7]">
        <MapPin className="h-6 w-6 text-[#3398e1]" />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-2xl text-[#0c0a09]">Turn on location</h2>
        <p className="text-sm">
          Every soul you log is pinned to the spot where it happened, so the team can see
          where the outreach reached. Your phone will ask once — choose{" "}
          <span className="font-medium text-[#0c0a09]">Allow</span>.
        </p>
      </div>

      {status === "blocked" && (
        <div className="space-y-3 rounded-lg border border-[#e8e6e5] bg-white p-4 text-sm">
          <p className="font-medium text-[#0c0a09]">Location is still off</p>
          <p>Turn it on for this site, then tap Try again:</p>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px]">
            <li>
              <span className="font-medium text-[#0c0a09]">iPhone (Safari):</span> tap the{" "}
              <span className="font-medium">aA</span> button in the address bar → Website Settings →
              Location → Allow. If it stays off, Settings → Privacy &amp; Security → Location
              Services → Safari → While Using the App.
            </li>
            <li>
              <span className="font-medium text-[#0c0a09]">Android (Chrome):</span> tap the lock
              icon in the address bar → Permissions → Location → Allow.
            </li>
            <li>
              <span className="font-medium text-[#0c0a09]">Installed app:</span> close and reopen
              it after changing the setting.
            </li>
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={request}
        disabled={status === "asking"}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3ba6f1] px-4 py-4 text-base font-semibold text-white disabled:opacity-40"
      >
        {status === "asking" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "blocked" ? "Try again" : status === "asking" ? "Waiting for location…" : "Enable location"}
      </button>
    </div>
  );
}
