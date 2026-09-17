"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { createEntrant, type EntrantDraft } from "@/lib/soulwinning/entrants";
import type { LocalEntrant } from "@/lib/soulwinning/local-db";

const EMPTY: EntrantDraft = { name: "", fellowship: "", phone: "", pfcc: "" };

interface Props {
  title: string;
  subtitle: string;
  onDone: (entrant: LocalEntrant) => void;
  onCancel?: () => void;
}

export function OnboardingForm({ title, subtitle, onDone, onCancel }: Props) {
  const [draft, setDraft] = useState<EntrantDraft>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  const set = (key: keyof EntrantDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || isSaving) return;
    setIsSaving(true);
    const entrant = await createEntrant(draft);
    onDone(entrant);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-[#0c0a09]">{title}</h2>
        <p className="text-sm">{subtitle}</p>
      </div>

      <div className="space-y-3">
        <Field label="Name" value={draft.name} onChange={set("name")} autoFocus required />
        <Field label="Fellowship" value={draft.fellowship} onChange={set("fellowship")} />
        <Field label="Number" value={draft.phone} onChange={set("phone")} type="tel" inputMode="tel" />
        <Field label="PFCC" value={draft.pfcc} onChange={set("pfcc")} />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[#e8e6e5] bg-white px-4 py-3.5 text-sm font-medium text-[#78716c]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!draft.name.trim() || isSaving}
          className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-[#3ba6f1] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Start logging
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-lg border border-[#e8e6e5] bg-white px-4 py-3.5 text-base text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
      />
    </label>
  );
}
