"use client";

import { useState, useTransition } from "react";
import { deleteNote } from "./actions";

/** Two-step delete, confirmed inline rather than with a browser dialog. */
export function DeleteNoteButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[#b4562e] underline-offset-2 hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <span className="text-[#6b6560]">
        {error ?? `Delete ${name}'s note? It moves to the Drive bin.`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteNote(id);
            if (result.error) setError(result.error);
          })
        }
        className="font-medium text-[#b4562e] disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        className="text-[#6b6560]"
      >
        Cancel
      </button>
    </span>
  );
}
