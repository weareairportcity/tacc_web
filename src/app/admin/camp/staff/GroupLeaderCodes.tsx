"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import type { LeaderCode } from "@/lib/camp/leaders";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { InlineConfirm } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { formatDay, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { newLeaderCodeAction, turnOffLeaderCodeAction } from "../actions";

/**
 * Group Leaders: each has their own code, named, for one group (PFCC → group
 * → fellowship). They see, pay for and scan everyone in that group's
 * fellowships, plus the group's ranking and money. Codes are shown once.
 */
export function GroupLeaderCodes({ groups, codes }: { groups: string[]; codes: LeaderCode[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useOneAtATime();
  const [group, setGroup] = useState(groups[0] ?? "");
  const [name, setName] = useState("");
  const [shown, setShown] = useState<{ key: string; code: string; label: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mine = codes.filter((c) => c.scope_kind === "group");
  const when = (iso: string | null) => (iso ? formatDay(iso) : "never");
  const keyOf = (g: string, n: string) => `${g}:${n.trim().toLowerCase()}`;

  const make = (g: string, n: string) =>
    start(async () => {
      const r = await newLeaderCodeAction("group", g, n);
      setConfirm(null);
      if (!r.ok) return toast(r.error, { tone: "error" });
      setShown({ key: keyOf(g, n), code: r.data.code, label: `${n.trim()} · ${g}` });
      setName("");
      toast(`Code made for ${n.trim()}. Copy it now: it won't be shown again.`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2 rounded-[10px] border border-stone-border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const existing = mine.find((c) => keyOf(c.scope_value, c.holder_name ?? "") === keyOf(group, name));
          if (existing) return setConfirm(keyOf(group, name));
          make(group, name);
        }}
      >
        <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[13px] text-warm-gray">
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={inputClass}>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-[2] flex-col gap-1 text-[13px] text-warm-gray">
          Group Leader&apos;s name
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="e.g. Ama Mensah" className={inputClass} />
        </label>
        <button type="submit" disabled={pending || name.trim().length < 2} className={`${primaryButtonClass} h-11 px-5`}>
          Make a code
        </button>
      </form>

      {shown && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3 text-sm">
          <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" />
          <span className="flex-1">{shown.label}: copy this code now. It won&apos;t be shown again.</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(shown.code).then(() => toast("Code copied"))}
            className="cm-press flex h-9 items-center gap-2 rounded-full bg-stone-canvas px-3.5 font-mono text-sm tracking-[0.1em]"
          >
            {shown.code} <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      )}

      {mine.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-4 text-sm text-warm-gray">No Group Leader codes yet.</p>
      ) : (
        <ul className="divide-y divide-stone-border overflow-hidden rounded-[10px] border border-stone-border bg-white">
          {mine.map((c) => {
            const k = keyOf(c.scope_value, c.holder_name ?? "");
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <KeyRound className="h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {c.holder_name} <span className="font-normal text-warm-gray">· {c.scope_value}</span>
                  </span>
                  <span className="text-xs text-warm-gray">
                    Made {when(c.created_at)} · last used {when(c.last_used_at)}
                  </span>
                </span>
                {confirm === k ? (
                  <span className="w-full">
                    <InlineConfirm
                      question={`Make a new code for ${c.holder_name}?`}
                      detail="Their old code stops working at once."
                      confirmLabel="Yes"
                      pending={pending}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => make(c.scope_value, c.holder_name ?? "")}
                    />
                  </span>
                ) : (
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirm(k)}
                      className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium"
                    >
                      New code
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await turnOffLeaderCodeAction(c.id);
                          if (!r.ok) return toast(r.error, { tone: "error" });
                          if (shown?.key === k) setShown(null);
                          toast(`${c.holder_name}'s code turned off`);
                          router.refresh();
                        })
                      }
                      className="cm-press h-9 rounded-full px-3 text-[13px] text-warm-gray"
                    >
                      Turn off
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
