"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { SwCampaign } from "@/lib/soulwinning/types";
import {
  getActiveEntrant,
  listEntrants,
  setActiveEntrantId,
} from "@/lib/soulwinning/entrants";
import { countEntriesByEntrant, type LocalEntrant } from "@/lib/soulwinning/local-db";
import { hasLocationPermission } from "@/lib/soulwinning/entries";
import { refreshPendingCount, startSync, syncNow } from "@/lib/soulwinning/sync";
import { EntrantSwitcher } from "./EntrantSwitcher";
import { LocationPrompt } from "./LocationPrompt";
import { MySoulsList } from "./MySoulsList";
import { SaveConfirm, type SaveConfirmDetail } from "./SaveConfirm";
import { SoulEntryForm } from "./SoulEntryForm";
import { StartScreen } from "./StartScreen";
import { SyncIndicator } from "./SyncIndicator";

const MILESTONE_EVERY = 10;

interface Props {
  campaign: SwCampaign;
}

export function FieldApp({ campaign }: Props) {
  const [isReady, setIsReady] = useState(false);
  const [entrants, setEntrants] = useState<LocalEntrant[]>([]);
  const [entrant, setEntrant] = useState<LocalEntrant | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [tab, setTab] = useState<"log" | "mine">("log");
  const [myTotal, setMyTotal] = useState(0);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SaveConfirmDetail | null>(null);

  // Load this device's members, then start the background queue. Whatever
  // happens, the screen must end up showing something: a member staring at a
  // blank phone mid-outreach is the worst outcome there is.
  useEffect(() => {
    let cancelled = false;
    const failSafe = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 2500);

    void (async () => {
      try {
        const [all, active, allowed] = await Promise.all([
          listEntrants(),
          getActiveEntrant(),
          hasLocationPermission(),
        ]);
        if (cancelled) return;
        setEntrants(all);
        setEntrant(active);
        setLocationAllowed(allowed);
        setIsReady(true);
        if (active) setMyTotal(await countEntriesByEntrant(active.id, campaign.id));
        await refreshPendingCount();
      } catch (error) {
        if (cancelled) return;
        setStartupError(error instanceof Error ? error.message : "Could not open this device's storage");
        setIsReady(true);
      } finally {
        clearTimeout(failSafe);
      }
    })();

    // Demo / screenshot pages must never push into the live campaign.
    if (campaign.id === "shot-campaign") {
      return () => {
        cancelled = true;
        clearTimeout(failSafe);
      };
    }

    const stopSync = startSync();
    return () => {
      cancelled = true;
      clearTimeout(failSafe);
      stopSync();
    };
  }, [campaign.id]);

  const selectEntrant = useCallback(
    async (next: LocalEntrant) => {
      setActiveEntrantId(next.id);
      setEntrant(next);
      setEntrants(await listEntrants());
      setMyTotal(await countEntriesByEntrant(next.id, campaign.id));
      setIsSwitching(false);
      setIsAddingPerson(false);
      if (campaign.id !== "shot-campaign") void syncNow();
    },
    [campaign.id]
  );

  const handleSaved = useCallback(
    ({ names, soulsAdded }: { names: string[]; soulsAdded: number }) => {
      setConfirm({ names, soulsAdded, milestone: null });
      if (!entrant) return;

      void (async () => {
        try {
          const previous = myTotal;
          const total = await countEntriesByEntrant(entrant.id, campaign.id);
          setMyTotal(total);
          await refreshPendingCount();
          const crossed = Math.floor(total / MILESTONE_EVERY) > Math.floor(previous / MILESTONE_EVERY);
          const milestone = Math.floor(total / MILESTONE_EVERY) * MILESTONE_EVERY;
          if (crossed) setConfirm({ names, soulsAdded, milestone });
        } catch {
          // The soul is already on the phone — do not hide the success card.
        }
        if (campaign.id !== "shot-campaign") void syncNow();
      })();
    },
    [campaign.id, entrant, myTotal]
  );

  if (!isReady) {
    return <div className="min-h-screen" />;
  }

  if (startupError) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <Header campaign={campaign} />
        <div className="space-y-3 rounded-lg border border-[#e8e6e5] bg-white p-5">
          <h2 className="font-display text-xl text-[#0c0a09]">This phone couldn&apos;t start the app</h2>
          <p className="text-sm">{startupError}</p>
          <p className="text-sm">
            Close the app fully and open it again. If it keeps happening, use another phone and
            tell a coordinator — nothing already saved on this device has been lost.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-[#3ba6f1] px-4 py-3.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!entrant) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <Header campaign={campaign} />
        <StartScreen onDone={selectEntrant} />
      </main>
    );
  }

  // Returning members on iPhone often come back with location "unknown", even
  // after they already allowed it. Do not hide My souls behind that wall —
  // the form still asks for a fix at save time.
  if (!locationAllowed && myTotal === 0) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <Header campaign={campaign} />
        <LocationPrompt onGranted={() => setLocationAllowed(true)} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <Header campaign={campaign} />

      <div className="mb-5 space-y-2">
        <div className="flex justify-end">
          <SyncIndicator />
        </div>
        <button
          type="button"
          onClick={() => setIsSwitching(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-[#e8e6e5] bg-white px-3.5 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0c0a09] text-sm font-medium text-white">
            {entrant.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-[#a8a29e]">Logging as</span>
            <span className="block truncate text-base font-semibold text-[#0c0a09]">{entrant.name}</span>
            {entrant.fellowship && (
              <span className="block truncate text-xs text-[#78716c]">{entrant.fellowship}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-[#3ba6f1]">
            Switch
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[#f2f2f2] p-1">
        <button
          type="button"
          onClick={() => setTab("log")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "log" ? "bg-white text-[#0c0a09] shadow-sm" : "text-[#78716c]"
          }`}
        >
          Log a soul
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "mine" ? "bg-white text-[#0c0a09] shadow-sm" : "text-[#78716c]"
          }`}
        >
          My souls{myTotal > 0 ? ` · ${myTotal}` : ""}
        </button>
      </div>

      {tab === "log" ? (
        <SoulEntryForm campaignId={campaign.id} entrantId={entrant.id} onSaved={handleSaved} />
      ) : (
        <MySoulsList
          campaignId={campaign.id}
          entrantId={entrant.id}
          loginCode={entrant.login_code}
          revision={myTotal}
          onChanged={() => {
            void countEntriesByEntrant(entrant.id, campaign.id).then(setMyTotal);
          }}
          onCount={setMyTotal}
        />
      )}

      {isSwitching && !isAddingPerson && (
        <EntrantSwitcher
          entrants={entrants}
          activeId={entrant.id}
          onPick={selectEntrant}
          onAddNew={() => setIsAddingPerson(true)}
          onClose={() => setIsSwitching(false)}
        />
      )}

      {isAddingPerson && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fafaf9] px-5 py-10">
          <div className="mx-auto w-full max-w-md">
            <StartScreen
              adding
              onDone={selectEntrant}
              onCancel={() => {
                setIsAddingPerson(false);
                setIsSwitching(false);
              }}
            />
          </div>
        </div>
      )}

      {confirm && <SaveConfirm detail={confirm} onDone={() => setConfirm(null)} />}
    </main>
  );
}

function Header({ campaign }: { campaign: SwCampaign }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#a8a29e]">
        Soul Winning Tracker
      </p>
      <h1 className="font-display text-2xl text-[#0c0a09]">{campaign.name}</h1>
    </div>
  );
}
