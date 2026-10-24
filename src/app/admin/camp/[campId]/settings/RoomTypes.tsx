"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import type { RoomType } from "@/lib/camp/types";
import { deleteRoomTypeAction, saveRoomTypeAction } from "../../actions";
import { ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/camp/ui";

type Draft = { id: string | null; name: string; price: string; capacity: number };

export function RoomTypes({ campId, roomTypes }: { campId: string; roomTypes: RoomType[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "");
      after?.();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {roomTypes.length === 0 && !draft && (
        <p className="text-sm text-slate-500">No room types yet. Add one, e.g. Hostel, 4 beds, GHS 600.</p>
      )}
      {roomTypes.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {roomTypes.map((type) => (
            <li key={type.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1 font-medium">{type.name}</span>
              <span className="text-slate-500">{type.capacity} beds</span>
              <span className="w-28 text-right tabular-nums">{formatCedis(type.price_pesewas)}</span>
              <button
                aria-label={`Edit ${type.name}`}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() =>
                  setDraft({
                    id: type.id,
                    name: type.name,
                    price: pesewasToCedisInput(type.price_pesewas),
                    capacity: type.capacity,
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                aria-label={`Delete ${type.name}`}
                disabled={pending}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => act(() => deleteRoomTypeAction(type.id))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form
          className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => saveRoomTypeAction(campId, draft.id, draft), () => setDraft(null));
          }}
        >
          <Field label="Name">
            <input
              required
              className={inputClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Beds per room">
            <input
              required
              type="number"
              min={1}
              max={100}
              className={inputClass}
              value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
            />
          </Field>
          <Field label="Price (GHS)">
            <input
              required
              inputMode="decimal"
              className={inputClass}
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              placeholder="600.00"
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className={secondaryButtonClass}
          onClick={() => setDraft({ id: null, name: "", price: "", capacity: 4 })}
        >
          <Plus className="h-4 w-4" /> Add room type
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
