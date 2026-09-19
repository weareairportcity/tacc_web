"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, MapPin, MapPinOff, Plus, X } from "lucide-react";
import { getCurrentCoords, saveGroupParty, saveSoulGroup, type Coords, type SoulDraft } from "@/lib/soulwinning/entries";
import { compressPhoto } from "@/lib/soulwinning/photo";

const emptySoul = (): SoulDraft => ({
  soul_name: "",
  phone: "",
  spoke_in_tongues: false,
  coming_to_church: false,
  photo: null,
});

interface Props {
  campaignId: string;
  entrantId: string;
  onSaved: (detail: { names: string[]; soulsAdded: number }) => void;
}

export function SoulEntryForm({ campaignId, entrantId, onSaved }: Props) {
  const [souls, setSouls] = useState<SoulDraft[]>([emptySoul()]);
  const [mode, setMode] = useState<"person" | "group">("person");
  const [groupName, setGroupName] = useState("");
  const [groupContact, setGroupContact] = useState("");
  const [groupSouls, setGroupSouls] = useState("");
  const [groupTongues, setGroupTongues] = useState("0");
  const [groupChurch, setGroupChurch] = useState("0");
  const [groupPhoto, setGroupPhoto] = useState<Blob | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<"pending" | "found" | "unavailable">("pending");

  // Every soul carries where it happened, so the group's fix is taken up front
  // and the save stays locked until it lands. All souls in the group share it.
  const [coords, setCoords] = useState<Coords>(null);

  // Kicks off a fix without touching state synchronously — the state only
  // moves when the browser answers.
  const runLocationRequest = useCallback(() => {
    void getCurrentCoords().then((next) => {
      setCoords(next);
      setLocationState(next ? "found" : "unavailable");
    });
  }, []);

  const requestLocation = useCallback(() => {
    setCoords(null);
    setLocationState("pending");
    runLocationRequest();
  }, [runLocationRequest]);

  useEffect(() => {
    runLocationRequest();
  }, [runLocationRequest]);

  const update = (index: number, patch: Partial<SoulDraft>) =>
    setSouls((prev) => prev.map((soul, i) => (i === index ? { ...soul, ...patch } : soul)));

  const named = souls.filter((soul) => soul.soul_name.trim());
  const partySize = Math.max(0, Math.floor(Number(groupSouls)));
  const tonguesN = Math.max(0, Math.floor(Number(groupTongues)));
  const churchN = Math.max(0, Math.floor(Number(groupChurch)));

  const formError = (): string | null => {
    if (mode === "person") {
      if (named.length === 0) return "Enter a name first.";
      return null;
    }
    if (!groupName.trim()) return "Enter a group name.";
    if (partySize < 1) return "Enter how many souls were won.";
    if (partySize > 500) return "A group can be at most 500.";
    if (tonguesN > partySize || churchN > partySize) {
      return "Tongues and church cannot be more than souls won.";
    }
    return null;
  };

  const save = async (withCoords: Coords) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (mode === "group") {
        const entries = await saveGroupParty({
          campaignId,
          entrantId,
          draft: {
            name: groupName,
            contact: groupContact,
            souls: partySize,
            tongues: tonguesN,
            church: churchN,
            photo: groupPhoto,
          },
          coords: withCoords,
        });
        const savedName = groupName.trim();
        setGroupName("");
        setGroupContact("");
        setGroupSouls("");
        setGroupTongues("0");
        setGroupChurch("0");
        setGroupPhoto(null);
        onSaved({ names: [savedName], soulsAdded: entries.length });
      } else {
        await saveSoulGroup({ campaignId, entrantId, souls: named, coords: withCoords });
        const names = named.map((soul) => soul.soul_name.trim());
        setSouls([emptySoul()]);
        onSaved({ names, soulsAdded: names.length });
      }
      requestLocation();
    } catch {
      setSaveError("Could not save on this phone. Close the app fully and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isLocating) return;
    const problem = formError();
    if (problem) {
      setSaveError(problem);
      return;
    }
    let used = coords;
    if (used === null) {
      setIsLocating(true);
      setSaveError(null);
      setLocationState("pending");
      used = await getCurrentCoords();
      setCoords(used);
      setLocationState(used ? "found" : "unavailable");
      setIsLocating(false);
      if (!used) {
        setSaveError("Need location to save. Stay outdoors, tap Retry, then Save again.");
        return;
      }
    }
    await save(used);
  };

  const handleSaveWithoutLocation = async () => {
    if (isSaving || isLocating) return;
    const problem = formError();
    if (problem) {
      setSaveError(problem);
      return;
    }
    await save(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f2f2f2] p-1">
        <button
          type="button"
          onClick={() => setMode("person")}
          className={`rounded-md py-2 text-sm font-medium ${
            mode === "person" ? "bg-white text-[#0c0a09] shadow-sm" : "text-[#78716c]"
          }`}
        >
          One person
        </button>
        <button
          type="button"
          onClick={() => setMode("group")}
          className={`rounded-md py-2 text-sm font-medium ${
            mode === "group" ? "bg-white text-[#0c0a09] shadow-sm" : "text-[#78716c]"
          }`}
        >
          A group
        </button>
      </div>

      {mode === "person" ? (
        <>
          {souls.map((soul, index) => (
            <div key={index} className="space-y-3 rounded-lg border border-[#e8e6e5] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
                  Soul {index + 1}
                </span>
                {souls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSouls((prev) => prev.filter((_, i) => i !== index))}
                    className="text-[#a8a29e]"
                    aria-label={`Remove soul ${index + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <input
                value={soul.soul_name}
                onChange={(e) => update(index, { soul_name: e.target.value })}
                placeholder="Name"
                autoFocus={index === souls.length - 1 && index > 0}
                className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
              />
              <input
                value={soul.phone}
                onChange={(e) => update(index, { phone: e.target.value })}
                placeholder="Phone"
                type="tel"
                inputMode="tel"
                className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
              />

              <PhotoField
                photo={soul.photo}
                onChange={(photo) => update(index, { photo })}
                index={index}
              />

              <Toggle
                label="Spoke in tongues"
                checked={soul.spoke_in_tongues}
                onChange={(value) => update(index, { spoke_in_tongues: value })}
              />
              <Toggle
                label="Coming to church"
                checked={soul.coming_to_church}
                onChange={(value) => update(index, { coming_to_church: value })}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setSouls((prev) => [...prev, emptySoul()])}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d6d3d1] px-4 py-3 text-sm font-medium text-[#78716c]"
          >
            <Plus className="h-4 w-4" />
            Add another soul
          </button>
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-[#e8e6e5] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
            Group
          </p>
          <p className="text-sm text-[#78716c]">
            One class, one crowd, one altar call. The number of souls won is what moves the
            hall.
          </p>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
          />
          <input
            value={groupContact}
            onChange={(e) => setGroupContact(e.target.value)}
            placeholder="Contact (phone)"
            type="tel"
            inputMode="tel"
            className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
          />
          <label className="block space-y-1" htmlFor="sw-group-souls">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
              Souls won
            </span>
            <input
              id="sw-group-souls"
              value={groupSouls}
              onChange={(e) => setGroupSouls(e.target.value)}
              inputMode="numeric"
              type="number"
              min={1}
              max={500}
              className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none focus:border-[#3ba6f1]"
            />
          </label>
          <label className="block space-y-1" htmlFor="sw-group-tongues">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
              Spoke in tongues
            </span>
            <input
              id="sw-group-tongues"
              value={groupTongues}
              onChange={(e) => setGroupTongues(e.target.value)}
              inputMode="numeric"
              type="number"
              min={0}
              max={500}
              className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none focus:border-[#3ba6f1]"
            />
          </label>
          <label className="block space-y-1" htmlFor="sw-group-church">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
              Coming to church
            </span>
            <input
              id="sw-group-church"
              value={groupChurch}
              onChange={(e) => setGroupChurch(e.target.value)}
              inputMode="numeric"
              type="number"
              min={0}
              max={500}
              className="w-full rounded-lg border border-[#e8e6e5] px-4 py-3.5 text-base text-[#0c0a09] outline-none focus:border-[#3ba6f1]"
            />
          </label>
          <PhotoField photo={groupPhoto} onChange={setGroupPhoto} index={0} />
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-[#a8a29e]">
        {locationState === "pending" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Getting location — save waits for it…
          </>
        )}
        {locationState === "found" && (
          <>
            <MapPin className="h-3.5 w-3.5 text-[#3ba6f1]" />
            Location captured for this group
          </>
        )}
        {locationState === "unavailable" && (
          <>
            <MapPinOff className="h-3.5 w-3.5 text-[#f54911]" />
            <span className="text-[#f54911]">No location yet</span>
            <button type="button" onClick={requestLocation} className="font-medium underline">
              Retry
            </button>
          </>
        )}
      </div>

      {locationState === "unavailable" && (
        <div className="space-y-3 rounded-lg border border-[#f54911]/30 bg-[#f54911]/5 p-4">
          <p className="text-sm text-[#0c0a09]">
            Location is required for the map. Tap Retry first — it usually works outdoors. Save
            without location only if it will not fix.
          </p>
          <button
            type="button"
            onClick={handleSaveWithoutLocation}
            disabled={isSaving || isLocating || Boolean(formError())}
            className="w-full rounded-lg border border-[#f54911] px-4 py-3 text-sm font-semibold text-[#f54911] disabled:opacity-40"
          >
            {mode === "group"
              ? `Save ${partySize || "group"} without location`
              : named.length > 1
                ? `Save ${named.length} souls without location`
                : "Save without location"}
          </button>
        </div>
      )}

      {saveError && (
        <p className="rounded-lg border border-[#f54911]/30 bg-[#f54911]/5 px-4 py-3 text-sm text-[#f54911]" role="alert">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving || isLocating}
        className="w-full rounded-lg bg-[#3ba6f1] px-4 py-4 text-base font-semibold text-white disabled:opacity-40"
      >
        {isLocating
          ? "Getting location…"
          : isSaving
            ? "Saving…"
            : mode === "group"
              ? partySize > 1
                ? `Save ${partySize} souls`
                : "Save group"
              : named.length > 1
                ? `Save ${named.length} souls`
                : "Save soul"}
      </button>
    </form>
  );
}

/** Optional photo. Take one with the camera or pick one already on the phone. */
function PhotoField({
  photo,
  onChange,
  index,
}: {
  photo: Blob | null;
  onChange: (photo: Blob | null) => void;
  index: number;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setPhotoError(null);
    try {
      onChange(await compressPhoto(file));
    } catch {
      setPhotoError("Could not read that photo. Try another, or save without one.");
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  if (preview) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[#fafaf9] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="" className="h-14 w-14 rounded-md object-cover" />
        <span className="flex-1 text-sm text-[#78716c]">Photo added</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="px-2 text-xs font-medium text-[#f54911]"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {photoError && <p className="text-xs text-[#f54911]">{photoError}</p>}
      <div className="grid grid-cols-2 gap-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
        aria-label={`Take photo for soul ${index + 1}`}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
        aria-label={`Upload photo for soul ${index + 1}`}
      />
      <button
        type="button"
        disabled={isBusy}
        onClick={() => cameraRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#d6d3d1] px-3 py-3 text-sm font-medium text-[#78716c] disabled:opacity-50"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        Take photo
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => uploadRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#d6d3d1] px-3 py-3 text-sm font-medium text-[#78716c] disabled:opacity-50"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        Upload photo
      </button>
    </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg bg-[#fafaf9] px-4 py-3 text-left"
    >
      <span className="text-sm font-medium text-[#0c0a09]">{label}</span>
      <span
        className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-[#3ba6f1]" : "bg-[#d6d3d1]"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
