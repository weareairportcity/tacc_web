import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { registrationOpen } from "@/lib/camp/registrations";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { SignIn } from "../SignIn";

/** Signing in, on its own screen: the code, a reminder to keep it, and a new code by text. */
export default async function SignInPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; registered?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const next = query.next?.startsWith(`/camps/${slug}/`) ? query.next : undefined;
  if (await currentAttendee(camp.id)) redirect(next ?? `/camps/${camp.slug}/me`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <CampBackLink href={`/camps/${camp.slug}`} camp={camp} />
        <h1 className="cm-rise font-display text-[36px] leading-[1.12] tracking-[-0.022em]">
          Welcome <span className="text-cyan-edge">back</span>
        </h1>
        <p className="text-base leading-relaxed text-warm-gray">Type the sign-in code we texted you when you registered.</p>
      </div>
      {query.registered && (
        <p role="status" className="rounded-[12px] bg-cyan-tint px-4 py-3 text-[15px] leading-relaxed">
          That phone number is already registered. Sign in with your code.
        </p>
      )}
      <SignIn slug={camp.slug} next={next} />
      <p className="order-2 flex items-start gap-3 rounded-[14px] bg-stone-rail p-4 text-[15px] leading-relaxed">
        <Save className="mt-0.5 h-5 w-5 flex-none" strokeWidth={1.5} aria-hidden="true" />
        <span>
          <strong className="font-semibold">Keep your code safe.</strong>{" "}It&apos;s in the text we sent when you registered. Don&apos;t delete that message. You need the code
          each time you sign in on a new phone.
        </span>
      </p>
      {registrationOpen(camp) && (
        <p className="order-4 text-center text-[15px] text-warm-gray">
          Not registered yet?{" "}
          <Link href={`/camps/${camp.slug}/register`} className="font-medium text-ink-black underline decoration-stone-muted underline-offset-[3px]">
            Register for camp
          </Link>
        </p>
      )}
    </div>
  );
}
