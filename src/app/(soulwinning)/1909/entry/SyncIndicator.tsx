"use client";

import { useEffect, useState } from "react";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { subscribeToSync, syncNow, type SyncState } from "@/lib/soulwinning/sync";

/** Non-blocking: it reports, it never stands between a volunteer and a save. */
export function SyncIndicator() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => subscribeToSync(setState), []);

  if (!state) return null;
  if (state.pending === 0 && state.online) return null;

  const label = !state.online
    ? `Offline · ${state.pending} waiting`
    : `${state.pending} pending sync`;

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className="flex items-center gap-1.5 rounded-full bg-[#f2f2f2] px-3 py-1.5 text-xs font-medium text-[#78716c]"
    >
      {!state.online ? (
        <CloudOff className="h-3.5 w-3.5" />
      ) : state.syncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
