import Link from "next/link";
import { CommuneLogo } from "./brand";

/** Top bar for the coordinator pages that aren't inside one camp (the camp list, staff). */
export function AdminTopBar({ email }: { email?: string }) {
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
      <Link href="/admin/camp" className="flex items-center gap-2">
        <CommuneLogo label={null} />
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-medium">commune</span>
          <span className="text-xs text-warm-gray">Coordinator</span>
        </span>
      </Link>
      <span className="text-xs text-warm-gray">
        {email && <>{email} · </>}
        <Link href="/admin/login" className="text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black">
          Switch portal
        </Link>
      </span>
    </header>
  );
}
