"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Users } from "lucide-react";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { createGroupAction, leaveGroupAction, removeMemberAction, setAnyRoomAction, type ActionResult } from "../actions";

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
      <button type="button" disabled={pending} onClick={() => act(() => createGroupAction(slug))} className={`${primaryButtonClass} h-[52px] w-full`}>
        {pending ? <Spinner on /> : <Users className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />}
        Start a group
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Two taps, with what happens in words on the second. */
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
      className={confirming ? "cm-press inline-flex h-11 items-center justify-center rounded-full bg-soot px-4 text-sm font-medium text-white" : className}
    >
      {pending ? <Spinner on /> : confirming ? confirmLabel : label}
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
        className={`${secondaryButtonClass} h-11`}
      />
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

export function LeaveGroup({ slug, isOwner }: { slug: string; isOwner: boolean }) {
  const { act, error, pending } = useGroupAction();
  return (
    <span className="flex flex-col gap-1 self-start">
      <ConfirmButton
        label="Leave this group"
        confirmLabel={isOwner ? "Yes, leave. The next person takes over" : "Yes, leave this group"}
        pending={pending}
        onConfirm={() => act(() => leaveGroupAction(slug))}
        className={`${secondaryButtonClass} h-12 px-5`}
      />
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

const WhatsApp = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z" />
    <path d="M9 9.5c.3 1.9 1.6 3.5 3.6 4.4l1.2-1.1 2 .9-.4 1.6c-3.6.2-7-3-7.2-6.6L10 8.4l.9 2z" />
  </svg>
);

/** The group's join link: send it on WhatsApp, or copy it. Friends tap it to join; it's the only way in. */
export function ShareLink({ url, campName, firstName }: { url: string; campName: string; firstName: string }) {
  const [copied, setCopied] = useState(false);
  // Plain characters only, so it reads the same in any app.
  const text = `Hi! It's ${firstName}. Join my room at ${campName} (The Airport City Church): ${url}`;
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={`${primaryButtonClass} h-[52px] w-full`}>
        <WhatsApp />
        Send on WhatsApp
      </a>
      <button type="button" onClick={copy} className={`${secondaryButtonClass} h-12 w-full text-[15px]`} aria-live="polite">
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
        {copied ? "Link copied" : "Copy the link instead"}
      </button>
    </div>
  );
}

/** "I don't mind who I'm with": skip choosing, a coordinator places them. Undo with the same button. */
export function AnyRoom({ slug, on }: { slug: string; on: boolean }) {
  const { act, error, pending } = useGroupAction();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} onClick={() => act(() => setAnyRoomAction(slug, !on))} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
        <Spinner on={pending} />
        {on ? "I'd like to choose after all" : "Put me in any room"}
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
