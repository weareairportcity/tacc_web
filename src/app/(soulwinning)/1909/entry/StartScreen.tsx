"use client";

import { useState, type FormEvent } from "react";
import { adoptEntrantByCode, type CodeLoginResult } from "@/lib/soulwinning/entrants";
import { LOGIN_CODE_LENGTH, normalizeLoginCode } from "@/lib/soulwinning/login-code";
import type { LocalEntrant } from "@/lib/soulwinning/local-db";
import { OnboardingForm } from "./OnboardingForm";

interface Props {
  onDone: (entrant: LocalEntrant) => void;
  onCancel?: () => void;
  adding?: boolean;
}

export function StartScreen({ onDone, onCancel, adding = false }: Props) {
  const [mode, setMode] = useState<"gate" | "new" | "code">("gate");

  if (mode === "new") {
    return (
      <OnboardingForm
        title={adding ? "New member" : "Before you start"}
        subtitle={
          adding
            ? "Kept on this phone, so switching back is one tap."
            : "Pick your fellowship. Every soul you log is credited to you."
        }
        onDone={onDone}
        onCancel={() => setMode("gate")}
      />
    );
  }

  if (mode === "code") {
    return <CodeForm onDone={onDone} onBack={() => setMode("gate")} />;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-[#0c0a09]">
          {adding ? "Add a member" : "Who is entering?"}
        </h2>
        <p className="text-sm">
          {adding
            ? "Someone new on this phone, or someone who already has a login code."
            : "First time, start new. Already logged somewhere else, type your code."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setMode("new")}
        className="w-full rounded-lg bg-[#3ba6f1] px-4 py-4 text-left"
      >
        <span className="block text-base font-semibold text-white">Start new</span>
        <span className="mt-0.5 block text-sm text-white/80">I have not logged in before</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("code")}
        className="w-full rounded-lg border border-[#e8e6e5] bg-white px-4 py-4 text-left"
      >
        <span className="block text-base font-semibold text-[#0c0a09]">I have a code</span>
        <span className="mt-0.5 block text-sm text-[#78716c]">Continue on this phone with my login code</span>
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-[#78716c]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function CodeForm({
  onDone,
  onBack,
}: {
  onDone: (entrant: LocalEntrant) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (normalizeLoginCode(code).length !== LOGIN_CODE_LENGTH || isSaving) return;
    setIsSaving(true);
    setError(null);
    const result: CodeLoginResult = await adoptEntrantByCode(code);
    if (!result.ok) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    onDone(result.entrant);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-[#0c0a09]">I have a code</h2>
        <p className="text-sm">Type the 4 characters shown on your other screen.</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[#a8a29e]">
          Login code
        </span>
        <input
          value={code}
          onChange={(event) => setCode(normalizeLoginCode(event.target.value))}
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={LOGIN_CODE_LENGTH}
          placeholder="K7M4"
          className="w-full rounded-lg border border-[#e8e6e5] bg-white px-4 py-4 text-center font-roobert text-3xl font-medium tracking-[0.32em] text-[#0c0a09] outline-none placeholder:text-[#d6d3d1] focus:border-[#3ba6f1]"
        />
      </label>

      {error && <p className="text-sm text-[#f54911]">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-[#e8e6e5] bg-white px-4 py-3.5 text-sm font-medium text-[#78716c]"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={normalizeLoginCode(code).length !== LOGIN_CODE_LENGTH || isSaving}
          className="flex-[2] rounded-lg bg-[#3ba6f1] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
