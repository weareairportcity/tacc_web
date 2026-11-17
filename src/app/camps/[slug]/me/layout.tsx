import { headers } from "next/headers";
import { isFullName } from "@/lib/camp/names";
import { FullNameStep } from "./FullNameStep";
import { notFound, redirect } from "next/navigation";
import { appInfo, mustSetUpApp } from "@/lib/camp/app-first";
import type { Metadata } from "next";
import { appPass, campAndAttendee } from "@/lib/camp/session";
import { AppGate, AppTracker } from "@/components/camp/notifications/AppGate";
import { appInstalledAction, notifyPrefsAction, pushRemoveAction, pushSubscribeAction, textsOnlyAction } from "../actions";

/**
 * An attendee's pages. On a phone, they open once Commune is on the Home
 * Screen with notifications on (or they chose texts): until then, the set-up
 * steps show instead. Coordinators can switch this off in Settings.
 */
/** Added to the Home Screen from here, Commune starts signed in as this person (see appPass). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { camp, me } = await campAndAttendee(slug);
  const pass = camp && me ? await appPass(me.id) : null;
  return pass && camp ? { manifest: `/camps/${camp.slug}/manifest.webmanifest?t=${encodeURIComponent(pass)}` } : {};
}

export default async function MeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { camp, me } = await campAndAttendee(slug);
  if (!camp) notFound();
  // On an iPhone the Home Screen app has its own sign-in: its first visit lands here signed out.
  if (!me) redirect(`/camps/${camp.slug}/sign-in?next=${encodeURIComponent(`/camps/${camp.slug}/me`)}`);
  const [info, h] = await Promise.all([appInfo(me.id), headers()]);
  const installed = appInstalledAction.bind(null, camp.slug);
  const tracker = <AppTracker known={info.installed} installed={installed} />;

  // Registered with one name, before full names were required: ask for the rest first.
  const askName = me.status !== "cancelled" && !isFullName(me.full_name) ? <FullNameStep slug={camp.slug} name={me.full_name} /> : null;
  if (!mustSetUpApp(camp, me, info, h.get("user-agent") ?? "")) {
    return (
      <>
        {tracker}
        {children}
        {askName}
      </>
    );
  }
  const pass = await appPass(me.id);
  return (
    <>
      {tracker}
      <AppGate
        startUrl={pass ? `/camps/${camp.slug}/app?t=${encodeURIComponent(pass)}` : null}
        first={me.full_name.trim().split(/\s+/)[0]}
        campName={camp.name}
        serverInstalled={info.installed}
        serverPush={info.push}
        actions={{ save: pushSubscribeAction.bind(null, camp.slug), remove: pushRemoveAction, prefs: notifyPrefsAction.bind(null, camp.slug) }}
        textsOnly={textsOnlyAction.bind(null, camp.slug, true)}
      />
    </>
  );
}
