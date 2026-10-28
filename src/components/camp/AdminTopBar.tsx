import Link from "next/link";
import { CommuneLogo } from "./brand";
import { AccountMenu } from "./AccountMenu";

/** Top bar for the pages that aren't inside one camp (the camp list, staff). */
export function AdminTopBar({ email, leader = false }: { email?: string; leader?: boolean }) {
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
      <Link href={leader ? "/leaders" : "/admin/camp"} className="flex items-center gap-2">
        <CommuneLogo label={null} />
        <span className="text-[15px] font-medium">commune</span>
      </Link>
      <AccountMenu name={email ?? ""} leader={leader} />
    </header>
  );
}
