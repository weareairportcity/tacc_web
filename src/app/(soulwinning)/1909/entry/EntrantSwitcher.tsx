"use client";

import { Check, Plus, X } from "lucide-react";
import type { LocalEntrant } from "@/lib/soulwinning/local-db";
import { LoginCodeBadge } from "./LoginCodeBadge";

interface Props {
  entrants: LocalEntrant[];
  activeId: string | null;
  onPick: (entrant: LocalEntrant) => void;
  onAddNew?: () => void;
  onClose: () => void;
}

/**
 * Everyone who has entered on this device. Picking a name swaps the active
 * entrant instantly — their details are already on the device, so nothing is
 * re-typed (plan §5).
 */
export function EntrantSwitcher({ entrants, activeId, onPick, onAddNew, onClose }: Props) {
  const active = entrants.find((entrant) => entrant.id === activeId);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-[1.75rem] bg-white p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-xl text-[#0c0a09]">Switch member</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-[#a8a29e]" />
          </button>
        </div>
        <p className="mb-4 text-sm text-[#78716c]">
          {onAddNew
            ? "This phone can be passed around. Pick your name, or add someone new."
            : "This phone can be passed around. Pick your name."}
        </p>

        {active?.login_code && (
          <div className="mb-4">
            <LoginCodeBadge code={active.login_code} />
          </div>
        )}

        <div className="space-y-2">
          {entrants.map((entrant) => (
            <button
              key={entrant.id}
              type="button"
              onClick={() => onPick(entrant)}
              className="flex w-full items-center justify-between rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-left"
            >
              <span>
                <span className="block text-base font-medium text-[#0c0a09]">{entrant.name}</span>
                {(entrant.fellowship || entrant.pfcc) && (
                  <span className="block text-xs text-[#a8a29e]">
                    {[entrant.fellowship, entrant.pfcc].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {entrant.id === activeId && <Check className="h-4 w-4 text-[#3ba6f1]" />}
            </button>
          ))}

          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d6d3d1] px-4 py-3.5 text-sm font-medium text-[#78716c]"
            >
              <Plus className="h-4 w-4" />
              Add another member on this phone
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
