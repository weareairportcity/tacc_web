import Link from "next/link";
import { CommuneLogo } from "./brand";
import { SignOutButton } from "./SignOutButton";

/** Top bar for the coordinator pages that aren't inside one camp (the camp list, staff). */
export function AdminTopBar({ email }: { email?: string }) {
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
      <Link href="/admin/camp" className="flex items-center gap-2">
        <CommuneLogo label={null} />
        <span className="text-[15px] font-medium">commune</span>
      </Link>
      <span className="flex items-center gap-1.5 text-xs text-warm-gray">
        {email && <span className="hidden sm:inline">{email} ·</span>}
        <SignOutButton />
      </span>
    </header>
  );
}
