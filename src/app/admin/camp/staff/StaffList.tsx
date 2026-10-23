"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
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
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {bootstrap.map((email) => (
          <li key={`env-${email}`} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="flex-1 truncate font-medium">{email}</span>
            <span className="text-slate-500">Admin · set in CAMP_ADMIN_EMAILS</span>
          </li>
        ))}
        {staff.map((s) => (
          <li key={s.email} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="flex-1 truncate font-medium">{s.email}</span>
            <span className="text-slate-500">
              {ROLE_LABELS[s.role]} · {scopeLabel(s)}
            </span>
            {s.email !== me && (
              <button
                aria-label={`Remove ${s.email}`}
                disabled={pending}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => act(() => removeStaffAction(s.email))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
        {staff.length === 0 && bootstrap.length === 0 && (
          <li className="px-5 py-3 text-sm text-slate-500">No staff yet.</li>
        )}
      </ul>

      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => saveStaffAction(draft), () =>
            setDraft({ email: "", role: "coordinator", scope_kind: null, scope_value: null }),
          );
        }}
      >
        <h2 className="font-semibold">Add or change someone</h2>
        <p className="text-sm text-slate-500">
          They sign in at /admin/login with their usual admin email and password. Saving an existing email changes their role.
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
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </form>
    </div>
  );
}
