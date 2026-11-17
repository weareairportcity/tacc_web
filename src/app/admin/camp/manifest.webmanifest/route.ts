import { communeManifest } from "@/lib/camp/manifest";

/**
 * Commune Team, for coordinators and leaders. ?side=leader starts on the
 * leaders' sign-in. app=team marks the window as Commune Team, so a phone
 * that also has the attendee app knows which one it's in.
 */
export function GET(request: Request) {
  const leader = new URL(request.url).searchParams.get("side") === "leader";
  return communeManifest(
    { name: "Commune Team", short_name: "Commune Team", start_url: leader ? "/leaders?app=team" : "/admin/camp?app=team", scope: "/", id: leader ? "/team/leaders" : "/team" },
    false,
    true,
  );
}
