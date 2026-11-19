import Link from "next/link";
import { Check, CircleUserRound, UserPlus } from "lucide-react";
import { leaderAccounts } from "@/lib/camp/leaders";
import { SignOutButton } from "./SignOutButton";
import { SwitchAccount } from "./SwitchAccount";

/**
 * Who's signed in, and Sign out, from the top bar on every page and screen
 * size. Signing out ends only this side's sign-in (coordinator or leader).
 * On the leaders' side, a phone can hold several codes (say a fellowship's
 * and the medical team's): switch between them here, or add another.
 */
export async function AccountMenu({ name, leader, className = "" }: { name: string; leader: boolean; className?: string }) {
  const accounts = leader ? await leaderAccounts().catch(() => []) : [];
  const others = accounts.filter((a) => !a.active);
  return (
    <details className={`group relative ${className}`}>
      <summary
        aria-label="Account"
        className="cm-press relative flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-stone-border bg-white [&::-webkit-details-marker]:hidden"
      >
        <CircleUserRound className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
        {others.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-soot px-1 text-[11px] font-semibold text-white">
            {accounts.length}
            <span className="sr-only"> accounts on this phone</span>
          </span>
        )}
      </summary>
      <div className="cm-pop absolute right-0 top-[52px] z-50 flex w-72 origin-top-right flex-col gap-1 rounded-[12px] border border-stone-border bg-white p-3 shadow-[0_16px_40px_rgba(17,12,46,0.14)]">
        <span className="text-xs text-warm-gray">{leader ? "Signed in with a code" : "Signed in as"}</span>
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {others.length > 0 && <Check className="h-4 w-4 flex-none text-st-paid" strokeWidth={2.4} aria-label="In use" />}
          <span className="truncate">{name}</span>
        </span>
        {others.length > 0 && (
          <div className="mt-2 flex flex-col border-t border-stone-border pt-2">
            <span className="pb-1 text-xs text-warm-gray">Switch to</span>
            {others.map((a) => (
              <SwitchAccount key={a.id} id={a.id} name={a.name} />
            ))}
          </div>
        )}
        {leader && (
          <Link href="/leaders?add=1" className="cm-hover -mx-1 mt-1 flex min-h-11 items-center gap-2.5 rounded-[8px] px-2 text-sm font-medium">
            <UserPlus className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Add another account
          </Link>
        )}
        <SignOutButton leader={leader} label={others.length > 0 ? `Sign out of ${name}` : undefined} className="mt-2 h-11 rounded-full border border-stone-border text-sm font-medium text-ink-black no-underline" />
      </div>
    </details>
  );
}
