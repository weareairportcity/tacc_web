"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { clearCampaignEntries } from "@/lib/soulwinning/admin";

const PHRASE = "DELETE ALL ENTRIES";
const HOLD_MS = 3000;
const READ_MS = 4000;

type Step = "closed" | "warn" | "type" | "hold" | "done";

export function ClearEntriesControl({
  campaignId,
  campaignName,
  entryCount,
  onCleared,
}: {
  campaignId: string;
  campaignName: string;
  entryCount: number;
  onCleared: () => void;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [typedName, setTypedName] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [canType, setCanType] = useState(false);
  const [held, setHeld] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdRaf = useRef<number>(0);
  const holding = useRef(false);

  const nameOk = typedName.trim() === campaignName;
  const phraseOk = typedPhrase.trim() === PHRASE;
  const typedOk = nameOk && phraseOk;

  useEffect(() => {
    if (step !== "type") {
      setCanType(false);
      return;
    }
    setCanType(false);
    const timer = window.setTimeout(() => setCanType(true), READ_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step === "closed") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, busy]);

  const close = () => {
    if (busy) return;
    stopHold();
    setStep("closed");
    setTypedName("");
    setTypedPhrase("");
    setHeld(0);
    setError(null);
  };

  const stopHold = () => {
    holding.current = false;
    if (holdRaf.current) cancelAnimationFrame(holdRaf.current);
    holdRaf.current = 0;
    setHeld(0);
  };

  const startHold = () => {
    if (!typedOk || busy) return;
    holding.current = true;
    const started = Date.now();
    const tick = () => {
      if (!holding.current) return;
      const next = Math.min(1, (Date.now() - started) / HOLD_MS);
      setHeld(next);
      if (next >= 1) {
        holding.current = false;
        void runClear();
        return;
      }
      holdRaf.current = requestAnimationFrame(tick);
    };
    holdRaf.current = requestAnimationFrame(tick);
  };

  const runClear = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearCampaignEntries(campaignId);
      setStep("done");
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear entries");
      setHeld(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-8 rounded-xl border border-[#f54911]/25 bg-[#f54911]/[0.04] p-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#f54911]">Danger zone</p>
        <p className="mt-1.5 text-sm text-[#57534e]">
          Wipe every soul on this campaign so the day can start from zero. This is permanent.
        </p>
        <button
          type="button"
          disabled={entryCount === 0}
          onClick={() => setStep("warn")}
          className="mt-3 rounded-lg border border-[#f54911] px-3.5 py-2 text-sm font-medium text-[#f54911] disabled:cursor-not-allowed disabled:opacity-40"
          data-clear-entries
        >
          {entryCount === 0 ? "No entries to clear" : "Clear all entries…"}
        </button>
      </div>

      {step !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c0a08]/80 p-4 backdrop-blur-[3px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-entries-title"
            className="w-full max-w-lg rounded-2xl bg-[#1a1210] p-5 text-[#fafaf9] shadow-[0_28px_80px_-16px_rgba(0,0,0,0.65)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            {step === "done" ? (
              <>
                <h2 id="clear-entries-title" className="font-roobert text-xl tracking-[-0.02em]">
                  Campaign is empty
                </h2>
                <p className="mt-2 text-sm text-[#d6d3d1]">
                  Every soul, photo and count for {campaignName} has been removed. The public
                  counter is back at zero.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 w-full rounded-lg bg-white py-2.5 text-sm font-medium text-[#0c0a09]"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f54911]/20 text-[#f54911]">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#f54911]">
                      Permanent deletion
                    </p>
                    <h2 id="clear-entries-title" className="mt-1 font-roobert text-xl tracking-[-0.02em]">
                      Delete every soul in {campaignName}?
                    </h2>
                  </div>
                </div>

                <ul className="mt-4 space-y-1.5 text-sm leading-snug text-[#d6d3d1]">
                  <li>{entryCount.toLocaleString()} souls will be erased. There is no undo, backup, or recycle bin.</li>
                  <li>The hall screen, wall, map and this list all go to zero.</li>
                  <li>Photos are deleted from storage with the records.</li>
                  <li>Members stay registered. Phones that have not finished syncing can send souls back up.</li>
                </ul>

                {step === "warn" && (
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={close}
                      className="flex-1 rounded-lg bg-white py-2.5 text-sm font-medium text-[#0c0a09]"
                    >
                      Cancel — keep the entries
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("type")}
                      className="flex-1 rounded-lg border border-[#f54911]/40 py-2.5 text-sm font-medium text-[#f54911]"
                    >
                      I understand. Continue
                    </button>
                  </div>
                )}

                {step === "type" && (
                  <div className="mt-5 space-y-3">
                    {!canType && (
                      <p className="text-xs text-[#a8a29e]">
                        Read the warning. The fields unlock in a few seconds.
                      </p>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs text-[#a8a29e]">
                        Type the campaign name exactly: <span className="text-[#fafaf9]">{campaignName}</span>
                      </span>
                      <input
                        value={typedName}
                        onChange={(event) => setTypedName(event.target.value)}
                        disabled={!canType}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none disabled:opacity-40"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-[#a8a29e]">
                        Type <span className="text-[#fafaf9]">{PHRASE}</span> in capital letters
                      </span>
                      <input
                        value={typedPhrase}
                        onChange={(event) => setTypedPhrase(event.target.value)}
                        disabled={!canType}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none disabled:opacity-40"
                      />
                    </label>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={close}
                        className="flex-1 rounded-lg bg-white py-2.5 text-sm font-medium text-[#0c0a09]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!typedOk}
                        onClick={() => setStep("hold")}
                        className="flex-1 rounded-lg bg-[#f54911] py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Continue to final confirm
                      </button>
                    </div>
                  </div>
                )}

                {step === "hold" && (
                  <div className="mt-5 space-y-3">
                    <p className="text-sm text-[#fecaca]">
                      Last chance. Press and hold the red button for three seconds. Letting go cancels.
                    </p>
                    {error && <p className="text-sm text-[#f54911]">{error}</p>}
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startHold();
                      }}
                      onPointerUp={stopHold}
                      onPointerLeave={stopHold}
                      onPointerCancel={stopHold}
                      onContextMenu={(event) => event.preventDefault()}
                      className="relative w-full overflow-hidden rounded-lg bg-[#7f1d1d] py-3 text-sm font-medium text-white select-none disabled:opacity-60"
                      style={{ touchAction: "none" }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-[#f54911]"
                        style={{ width: `${held * 100}%` }}
                      />
                      <span className="relative flex items-center justify-center gap-2">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {busy
                          ? "Deleting…"
                          : held > 0
                            ? "Keep holding…"
                            : "Hold to permanently delete"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={close}
                      className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-[#0c0a09] disabled:opacity-40"
                    >
                      Cancel — keep the entries
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
