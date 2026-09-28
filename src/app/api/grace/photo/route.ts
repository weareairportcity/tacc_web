import { NextResponse } from "next/server";
import { currentRole } from "@/lib/grace/auth";
import { fetchPreview } from "@/lib/grace/drive";

/**
 * Wall preview images, streamed from Drive for signed-in viewers only.
 *
 * A preview never changes once uploaded, so the browser may keep it for a
 * year: each photo crosses the wire once per viewer, not on every visit.
 */

const DRIVE_ID = /^[\w-]{10,100}$/;

export async function GET(request: Request) {
  if (!(await currentRole())) {
    return NextResponse.json({ error: "Please enter the code first." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !DRIVE_ID.test(id)) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const drive = await fetchPreview(id);
  if (!drive?.body) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  return new Response(drive.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
