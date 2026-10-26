import type { Metadata } from "next";
import { CommuneLogo } from "@/components/camp/brand";
import { headlineClass } from "@/components/camp/ui";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · Commune" };

/** Commune's own coordinator sign-in, separate from the church admin portal. */
export default async function CoordinatorSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only paths inside Commune's coordinator app.
  const to = next && /^\/admin\/camp(\/|$|\?)/.test(next) ? next : "/admin/camp";
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-12 sm:py-10">
      <span className="flex items-center gap-2">
        <CommuneLogo size={30} label={null} />
        <span className="text-[15px] font-medium">commune</span>
      </span>
      <main className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center gap-6 py-10">
        <h1 className={`cm-rise ${headlineClass}`}>
          Welcome <span className="text-cyan-edge">back</span>
        </h1>
        <SignInForm next={to} />
      </main>
    </div>
  );
}
