"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Lock, LockOpen, Search, Share2 } from "lucide-react";
import type { Invitee } from "@/lib/camp/types";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, buttonClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import {
  acceptInviteAction,
  cancelInviteAction,
  createGroupAction,
  declineInviteAction,
  inviteAction,
  leaveGroupAction,
  removeMemberAction,
  searchInviteesAction,
  setAnyRoomAction,
  setGroupLockedAction,
  type ActionResult,
} from "../actions";

const linkButton =
  "min-h-10 px-1 text-[13px] text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black disabled:opacity-50";

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

const Spinner = ({ on }: { on: boolean }) => (on ? <CommuneLoader size={20} label={null} /> : null);

export function CreateGroup({ slug }: { slug: string }) {
  const { act, error, pending } = useGroupAction();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} onClick={() => act(() => createGroupAction(slug))} className={`${primaryButtonClass} w-full`}>
        <Spinner on={pending} />
        Start a group
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
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
      className={confirming ? "cm-press inline-flex h-10 items-center rounded-full bg-ink-black px-4 text-[13px] font-medium text-white" : className}
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
        {pending ? <CommuneLoader size={20} label={null} /> : locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
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
    <div className="flex flex-col gap-3">
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
          {searching ? <CommuneLoader size={18} label={null} /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>
      <ErrorText>{searchError || error}</ErrorText>
      {results &&
        (results.length === 0 ? (
          <p className="text-sm leading-relaxed text-warm-gray">
            Nobody found. Only people who are fully paid, booked the same room type and aren&apos;t in a group show up.
          </p>
        ) : (
          <ul className="flex flex-col text-sm">
            {results.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t border-stone-border py-2.5">
                <span>
                  <span className="font-medium">{p.full_name}</span>
                  <span className="text-warm-gray"> · {p.fellowship}</span>
                </span>
                {p.invited ? (
                  <span className="flex items-center gap-1 text-[13px] text-warm-gray"><Check className="h-3.5 w-3.5" aria-hidden="true" />Invited</span>
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

/** The group's join link: copy it, or share it on WhatsApp. Friends tap it and they're in. */
export function ShareLink({ url, campName }: { url: string; campName: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Join my room for ${campName}: ${url}`;
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center gap-2 rounded-full border border-stone-muted bg-white pl-4 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-warm-gray">{url.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={copy} className={`${secondaryButtonClass} h-9 flex-none px-3.5`} aria-live="polite">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={`${primaryButtonClass} w-full`}>
        <Share2 className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
        Send on WhatsApp
      </a>
    </div>
  );
}

/** "I'm happy with any room": skip choosing, a coordinator places them. */
export function AnyRoom({ slug, on }: { slug: string; on: boolean }) {
  const { act, error, pending } = useGroupAction();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => act(() => setAnyRoomAction(slug, e.target.checked))}
          className="h-5 w-5 accent-soot"
        />
        <span className="text-[15px] font-medium">I&apos;m happy with any room</span>
      </label>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
