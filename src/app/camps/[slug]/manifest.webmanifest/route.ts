import { communeManifest } from "@/lib/camp/manifest";

/**
 * Each camp's own install: Commune opens on the attendee's page for this
 * camp. From a signed-in page the address carries their app pass (?t=), so
 * the Home Screen app starts signed in where they left off.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = /^[a-z0-9-]{1,80}$/.test(slug) ? slug : "";
  if (!safe) return communeManifest({ name: "Commune", short_name: "Commune", start_url: "/camps", scope: "/" });
  const pass = new URL(request.url).searchParams.get("t") ?? "";
  const personal = /^[0-9a-f-]{36}\.[\w-]{10,64}$/i.test(pass);
  return communeManifest(
    { name: "Commune", short_name: "Commune", start_url: personal ? `/camps/${safe}/app?t=${pass}` : `/camps/${safe}/me?app=1`, scope: "/", id: `/camps/${safe}` },
    personal,
  );
}
