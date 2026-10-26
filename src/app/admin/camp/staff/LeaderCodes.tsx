"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import type { LeaderCode } from "@/lib/camp/leaders";
import { InlineConfirm } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { cn } from "@/lib/utils";
import { newLeaderCodeAction, turnOffLeaderCodeAction } from "../actions";

type Scope = { kind: "fellowship" | "pfcc"; value: string };

/**
 * One code per fellowship and per PFCC. Codes are shown once, when made;
 * after that only "made on" and "last used" are known. Making a new one
 * turns the old one off.
 */
export function LeaderCodes({ scopes, codes }: { scopes: Scope[]; codes: LeaderCode[] }) {
  const router = useRouter();
  const toast = useToast();
  const [shown, setShown] = useState<{ key: string; code: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = (s: Scope) => `${s.kind}:${s.value}`;
  const codeOf = (s: Scope) => codes.find((c) => c.scope_kind === s.kind && c.scope_value === s.value);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

  return (
    <ul className="divide-y divide-stone-border overflow-hidden rounded-[10px] border border-stone-border bg-white">
      {scopes.map((s) => {
        const c = codeOf(s);
        const k = key(s);
        return (
          <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <KeyRound className={cn("h-4 w-4 flex-none", c ? "text-ink-black" : "text-ash-gray")} strokeWidth={1.6} aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">
                {s.value} <span className="font-normal text-warm-gray">· {s.kind === "pfcc" ? "PFCC" : "fellowship"}</span>
              </span>
              <span className="text-xs text-warm-gray">{c ? `Made ${when(c.created_at)} · last used ${when(c.last_used_at)}` : "No code"}</span>
            </span>
            {shown?.key === k && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(shown.code).then(() => toast("Code copied"))}
                className="cm-press flex h-9 items-center gap-2 rounded-full bg-stone-canvas px-3.5 font-mono text-sm tracking-[0.1em]"
              >
                {shown.code} <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
              </button>
            )}
            {confirm === k ? (
              <span className="w-full">
                <InlineConfirm
                  question={`Make a new code for ${s.value}?`}
                  detail={c ? "The old code stops working at once." : undefined}
                  confirmLabel="Yes"
                  pending={pending}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() =>
                    start(async () => {
                      const r = await newLeaderCodeAction(s.kind, s.value);
                      setConfirm(null);
                      if (!r.ok) return toast(r.error, { tone: "error" });
                      setShown({ key: k, code: r.data.code });
                      toast(`New code for ${s.value}. Copy it now: it won't be shown again.`);
                      router.refresh();
                    })
                  }
                />
              </span>
            ) : (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    c
                      ? setConfirm(k)
                      : start(async () => {
                          const r = await newLeaderCodeAction(s.kind, s.value);
                          if (!r.ok) return toast(r.error, { tone: "error" });
                          setShown({ key: k, code: r.data.code });
                          toast(`Code made for ${s.value}. Copy it now: it won't be shown again.`);
                          router.refresh();
                        })
                  }
                  className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium"
                >
                  {c ? "New code" : "Make a code"}
                </button>
                {c && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await turnOffLeaderCodeAction(c.id);
                        if (!r.ok) return toast(r.error, { tone: "error" });
                        if (shown?.key === k) setShown(null);
                        toast(`${s.value}'s code turned off`);
                        router.refresh();
                      })
                    }
                    className="cm-press h-9 rounded-full px-3 text-[13px] text-warm-gray"
                  >
                    Turn off
                  </button>
                )}
                {shown?.key === k && <Check className="h-4 w-4 self-center text-st-paid" strokeWidth={2.4} aria-label="Made" />}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
