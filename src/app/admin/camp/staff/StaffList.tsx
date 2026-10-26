"use client";

import { Busy } from "@/components/camp/brand";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { FELLOWSHIPS, PFCCS } from "@/lib/fellowships";
import type { ScopeKind, Staff, StaffRole } from "@/lib/camp/types";
import { removeStaffAction, saveStaffAction } from "../actions";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/camp/ui";

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  coordinator: "Coordinator",
  leader: "Leader (read-only)",
};

const scopeLabel = (s: Staff) => (s.role === "leader" ? `${s.scope_value}` : "All camps");

export function StaffList({ staff, me, bootstrap }: { staff: Staff[]; me: string; bootstrap: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Staff>({ email: "", role: "coordinator", scope_kind: null, scope_value: null });
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

  const setRole = (role: StaffRole) =>
    setDraft((d) =>
      role === "leader"
        ? { ...d, role, scope_kind: d.scope_kind ?? "fellowship", scope_value: d.scope_value ?? FELLOWSHIPS[0].name }
        : { ...d, role, scope_kind: null, scope_value: null },
    );

  const setScopeKind = (kind: ScopeKind) =>
    setDraft((d) => ({ ...d, scope_kind: kind, scope_value: kind === "pfcc" ? PFCCS[0] : FELLOWSHIPS[0].name }));

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-stone-border rounded-[10px] border border-stone-border bg-white">
        {bootstrap.map((email) => (
          <li key={`env-${email}`} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="flex-1 truncate font-medium">{email}</span>
            <span className="text-warm-gray">Admin · set in CAMP_ADMIN_EMAILS</span>
          </li>
        ))}
        {staff.map((s) => (
          <li key={s.email} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="flex-1 truncate font-medium">{s.email}</span>
            <span className="text-warm-gray">
              {ROLE_LABELS[s.role]} · {scopeLabel(s)}
            </span>
            {s.email !== me && (
              <button
                aria-label={`Remove ${s.email}`}
                disabled={pending}
                className="rounded p-1.5 text-ash-gray hover:bg-stone-canvas hover:text-ink-black"
                onClick={() => act(() => removeStaffAction(s.email))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
        {staff.length === 0 && bootstrap.length === 0 && (
          <li className="px-5 py-3 text-sm text-warm-gray">No staff yet.</li>
        )}
      </ul>

      <form
        className="space-y-4 rounded-[10px] border border-stone-border bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => saveStaffAction(draft), () =>
            setDraft({ email: "", role: "coordinator", scope_kind: null, scope_value: null }),
          );
        }}
      >
        <h2 className="font-medium">Add or change someone</h2>
        <p className="text-sm text-warm-gray">
          They sign in at commune.theairportcitychurch.com/admin with their email and password. Saving an existing email changes
          their role. Fellowship and PFCC leaders can use a leader code instead (below).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <input
              required
              type="email"
              className={inputClass}
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={draft.role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          {draft.role === "leader" && (
            <>
              <Field label="Sees">
                <select
                  className={inputClass}
                  value={draft.scope_kind ?? "fellowship"}
                  onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
                >
                  <option value="fellowship">One fellowship</option>
                  <option value="pfcc">One PFCC</option>
                </select>
              </Field>
              <Field label={draft.scope_kind === "pfcc" ? "PFCC" : "Fellowship"}>
                <select
                  className={inputClass}
                  value={draft.scope_value ?? ""}
                  onChange={(e) => setDraft({ ...draft, scope_value: e.target.value })}
                >
                  {(draft.scope_kind === "pfcc" ? PFCCS : FELLOWSHIPS.map((f) => f.name)).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
          <Busy pending={pending} text="Saving…" size={18}>Save</Busy>
        </button>
      </form>
    </div>
  );
}
