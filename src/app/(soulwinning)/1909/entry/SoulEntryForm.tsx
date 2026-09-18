"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, MapPin, MapPinOff, Plus, X } from "lucide-react";
import { getCurrentCoords, saveSoulGroup, type Coords, type SoulDraft } from "@/lib/soulwinning/entries";
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
  onSaved: (count: number) => void;
}

export function SoulEntryForm({ campaignId, entrantId, onSaved }: Props) {
  const [souls, setSouls] = useState<SoulDraft[]>([emptySoul()]);
  const [isSaving, setIsSaving] = useState(false);
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

  const canSave = named.length > 0 && coords !== null && !isSaving;
  // The override never fires on its own: it only appears once a fix has
  // actually failed, and only a deliberate tap on it saves without one.
  const canSaveWithoutLocation = named.length > 0 && locationState === "unavailable" && !isSaving;

  const save = async (withCoords: Coords) => {
    setIsSaving(true);
    await saveSoulGroup({ campaignId, entrantId, souls: named, coords: withCoords });

    setSouls([emptySoul()]);
    setIsSaving(false);
    onSaved(named.length);

    requestLocation(); // next group, next fix
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !coords) return;
    await save(coords);
  };

  const handleSaveWithoutLocation = async () => {
    if (!canSaveWithoutLocation) return;
    await save(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="flex items-center gap-1.5 text-xs text-[#a8a29e]">
        {locationState === "pending" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Getting location — save unlocks once it lands…
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
            Still no location? Tap Retry first — it usually works outdoors. If it will not fix
            here, you can save this soul without one. The soul still counts; it just will not
            appear on the map.
          </p>
          <button
            type="button"
            onClick={handleSaveWithoutLocation}
            disabled={!canSaveWithoutLocation}
            className="w-full rounded-lg border border-[#f54911] px-4 py-3 text-sm font-semibold text-[#f54911] disabled:opacity-40"
          >
            {named.length > 1 ? `Save ${named.length} souls without location` : "Save without location"}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSave}
        className="w-full rounded-lg bg-[#3ba6f1] px-4 py-4 text-base font-semibold text-white disabled:opacity-40"
      >
        {coords === null
          ? "Waiting for location…"
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
    try {
      onChange(await compressPhoto(file));
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
