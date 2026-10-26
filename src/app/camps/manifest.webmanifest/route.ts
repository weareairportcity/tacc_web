import { communeManifest } from "@/lib/camp/manifest";

export const dynamic = "force-static";

export function GET() {
  return communeManifest({ name: "Commune", short_name: "Commune", start_url: "/camps", scope: "/" });
}
