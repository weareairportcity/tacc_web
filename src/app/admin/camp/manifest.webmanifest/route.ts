import { communeManifest } from "@/lib/camp/manifest";

export const dynamic = "force-static";

export function GET() {
  return communeManifest({ name: "Commune for coordinators", short_name: "Commune", start_url: "/admin/camp", scope: "/" });
}
