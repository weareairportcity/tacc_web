import { CircleUserRound } from "lucide-react";
import { SignOutButton } from "./SignOutButton";

/**
 * Who's signed in, and Sign out, from the top bar on every page and screen
 * size. Signing out ends only this side's sign-in (coordinator or leader).
 */
export function AccountMenu({ name, leader, className = "" }: { name: string; leader: boolean; className?: string }) {
  return (
    <details className={`group relative ${className}`}>
      <summary
        aria-label="Account"
        className="cm-press flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-stone-border bg-white [&::-webkit-details-marker]:hidden"
      >
        <CircleUserRound className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
      </summary>
      <div className="cm-pop absolute right-0 top-[52px] z-50 flex w-64 origin-top-right flex-col gap-1 rounded-[12px] border border-stone-border bg-white p-3 shadow-[0_16px_40px_rgba(17,12,46,0.14)]">
        <span className="text-xs text-warm-gray">{leader ? "Signed in as leader" : "Signed in as"}</span>
        <span className="truncate text-sm font-medium">{name}</span>
        <SignOutButton leader={leader} className="mt-2 h-11 rounded-full border border-stone-border text-sm font-medium text-ink-black no-underline" />
      </div>
    </details>
  );
}
