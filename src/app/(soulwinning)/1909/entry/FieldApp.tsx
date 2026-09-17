"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, PartyPopper } from "lucide-react";
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
import { OnboardingForm } from "./OnboardingForm";
import { SoulEntryForm } from "./SoulEntryForm";
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
  const [myTotal, setMyTotal] = useState(0);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; milestone: boolean } | null>(null);

  // Load this device's entrants, then start the background queue. Whatever
  // happens, the screen must end up showing something: a volunteer staring at a
  // blank phone mid-outreach is the worst outcome there is.
  useEffect(() => {
    void (async () => {
      try {
        const [all, active, allowed] = await Promise.all([
          listEntrants(),
          getActiveEntrant(),
          hasLocationPermission(),
        ]);
        setEntrants(all);
        setEntrant(active);
        setLocationAllowed(allowed);
        if (active) setMyTotal(await countEntriesByEntrant(active.id, campaign.id));
        await refreshPendingCount();
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : "Could not open this device's storage");
      } finally {
        setIsReady(true);
      }
    })();

    return startSync();
  }, [campaign.id]);

  // Scoped to /1909 — this worker can never intercept the rest of the site.
  // Production only: in dev, /_next/static chunks are not content-hashed, so
  // the worker's cache-first rule would keep serving stale code after an edit.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (registration.scope.includes("/1909")) void registration.unregister();
        }
      });
      void caches.keys().then((keys) => {
        for (const key of keys) if (key.startsWith("sw1909-")) void caches.delete(key);
      });
      return;
    }

    void navigator.serviceWorker.register("/1909/sw.js", { scope: "/1909", updateViaCache: "none" });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.milestone ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectEntrant = useCallback(
    async (next: LocalEntrant) => {
      setActiveEntrantId(next.id);
      setEntrant(next);
      setEntrants(await listEntrants());
      setMyTotal(await countEntriesByEntrant(next.id, campaign.id));
      setIsSwitching(false);
      setIsAddingPerson(false);
      void syncNow();
    },
    [campaign.id]
  );

  const handleSaved = useCallback(
    async (savedCount: number) => {
      if (!entrant) return;

      const previous = myTotal;
      const total = await countEntriesByEntrant(entrant.id, campaign.id);
      setMyTotal(total);
      await refreshPendingCount();
      void syncNow();

      // Every 10th soul this entrant has personally logged (plan §6).
      const crossed = Math.floor(total / MILESTONE_EVERY) > Math.floor(previous / MILESTONE_EVERY);
      const milestone = Math.floor(total / MILESTONE_EVERY) * MILESTONE_EVERY;

      setToast(
        crossed
          ? { text: `You've led ${milestone} souls today!`, milestone: true }
          : { text: savedCount > 1 ? `${savedCount} souls saved` : "Soul saved", milestone: false }
      );
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
        <OnboardingForm
          title="Before you start"
          subtitle="Just once on this phone — so every soul you log is credited to you."
          onDone={selectEntrant}
        />
      </main>
    );
  }

  // Part of onboarding, and re-shown if the permission is ever revoked: no soul
  // can be logged without the location it was won at.
  if (!locationAllowed) {
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

      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsSwitching(true)}
          className="flex items-center gap-1.5 text-left"
        >
          <span className="text-base font-semibold text-[#0c0a09]">{entrant.name}</span>
          <ChevronDown className="h-4 w-4 text-[#a8a29e]" />
        </button>
        <SyncIndicator />
      </div>

      <div className="mb-5 rounded-lg border border-[#e8e6e5] bg-white px-5 py-4">
        <p className="text-3xl font-semibold tabular-nums text-[#0c0a09]">{myTotal}</p>
        <p className="text-xs text-[#a8a29e]">souls you&apos;ve logged today</p>
      </div>

      <SoulEntryForm campaignId={campaign.id} entrantId={entrant.id} onSaved={handleSaved} />

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
            <OnboardingForm
              title="New person"
              subtitle="Their details are kept on this phone, so switching back is one tap."
              onDone={selectEntrant}
              onCancel={() => {
                setIsAddingPerson(false);
                setIsSwitching(false);
              }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-5">
          <div
            className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-[0_12px_45px_0_rgba(17,12,46,0.12)] ${
              toast.milestone ? "bg-[#0c0a09] text-white" : "bg-white text-[#0c0a09]"
            }`}
          >
            {toast.milestone && <PartyPopper className="h-4 w-4 text-[#3ba6f1]" />}
            {toast.text}
          </div>
        </div>
      )}
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
