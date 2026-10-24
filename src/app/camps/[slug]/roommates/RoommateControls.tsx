"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen, Search } from "lucide-react";
import type { Invitee } from "@/lib/camp/types";
import { ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/camp/ui";
import {
  acceptInviteAction,
  cancelInviteAction,
  createGroupAction,
  declineInviteAction,
  inviteAction,
  joinGroupAction,
  leaveGroupAction,
  removeMemberAction,
  searchInviteesAction,
  setGroupLockedAction,
  type ActionResult,
} from "../actions";

const linkButton = "text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50";

/** Runs a server action, shows its error, and refreshes the page on success. */
function useGroupAction() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<ActionResult<unknown>>) => {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  };
  return { act, error, pending };
}

const Spinner = ({ on }: { on: boolean }) => (on ? <Loader2 className="h-4 w-4 animate-spin" /> : null);

export function CreateGroup({ slug }: { slug: string }) {
  const { act, error, pending } = useGroupAction();
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} onClick={() => act(() => createGroupAction(slug))} className={buttonClass}>
        <Spinner on={pending} />
        Start a group
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function JoinGroup({ slug }: { slug: string }) {
  const { act, error, pending } = useGroupAction();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act(() => joinGroupAction(slug, code));
      }}
      className="space-y-3"
    >
      <Field label="Group code from a friend">
        <input
          required
          autoComplete="off"
          autoCapitalize="characters"
          className={`${inputClass} font-mono uppercase tracking-widest`}
          placeholder="ABC-DEF"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} className={buttonClass}>
        <Spinner on={pending} />
        Join group
      </button>
    </form>
  );
}

export function ReceivedInviteActions({ slug, inviteId }: { slug: string; inviteId: string }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => act(() => acceptInviteAction(slug, inviteId))} className={buttonClass}>
          <Spinner on={pending} />
          Join
        </button>
        <button type="button" disabled={pending} onClick={() => act(() => declineInviteAction(slug, inviteId))} className={linkButton}>
          Decline
        </button>
      </span>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

/** Two clicks, like cancelling a registration. */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  pending,
  className,
}: {
  label: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
  className: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onBlur={() => setConfirming(false)}
      onClick={() => {
        if (!confirming) return setConfirming(true);
        setConfirming(false);
        onConfirm();
      }}
      className={confirming ? "rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white" : className}
    >
      {confirming ? confirmLabel : label}
    </button>
  );
}

export function RemoveMember({ slug, registrationId, name }: { slug: string; registrationId: string; name: string }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col items-end">
      <ConfirmButton
        label="Remove"
        confirmLabel={`Remove ${name.split(" ")[0]}?`}
        pending={pending}
        onConfirm={() => act(() => removeMemberAction(slug, registrationId))}
        className={linkButton}
      />
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

export function LeaveGroup({ slug, isOwner }: { slug: string; isOwner: boolean }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col gap-1">
      <ConfirmButton
        label="Leave group"
        confirmLabel={isOwner ? "Leave? The next member becomes owner" : "Leave this group?"}
        pending={pending}
        onConfirm={() => act(() => leaveGroupAction(slug))}
        className={secondaryButtonClass}
      />
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

export function LockToggle({ slug, locked }: { slug: string; locked: boolean }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => act(() => setGroupLockedAction(slug, !locked))}
        className={locked ? secondaryButtonClass : buttonClass}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {locked ? "Unlock group" : "Lock group"}
      </button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

export function InviteSearch({ slug }: { slug: string }) {
  const { act, error, pending } = useGroupAction();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Invitee[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, startSearch] = useTransition();

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError("");
    startSearch(async () => {
      const result = await searchInviteesAction(slug, term);
      if (!result.ok) return setSearchError(result.error);
      setResults(result.data);
    });
  };

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Search by name"
          aria-label="Search by name"
          minLength={2}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="submit" disabled={searching || term.trim().length < 2} className={secondaryButtonClass}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>
      <ErrorText>{searchError || error}</ErrorText>
      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nobody found. Only people who are fully paid, booked the same room type and aren&apos;t in a group show up.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {results.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{p.full_name}</span>
                  <span className="text-slate-500"> · {p.fellowship}</span>
                </span>
                {p.invited ? (
                  <span className="text-xs text-slate-500">Invited</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      act(async () => {
                        const result = await inviteAction(slug, p.id);
                        if (result.ok) setResults((rs) => rs?.map((r) => (r.id === p.id ? { ...r, invited: 1 } : r)) ?? null);
                        return result;
                      })
                    }
                    className={secondaryButtonClass}
                  >
                    Invite
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export function SentInviteCancel({ slug, inviteId }: { slug: string; inviteId: string }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col items-end">
      <button type="button" disabled={pending} onClick={() => act(() => cancelInviteAction(slug, inviteId))} className={linkButton}>
        Withdraw
      </button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}
