import { NextResponse } from "next/server";
import { getServiceStatuses, isServiceId } from "@/lib/services-db";

/**
 * Which song is live and which are sung, polled by a service's playlist page.
 * Vercel's CDN caches the answer for 5 seconds and serves everyone from that
 * copy, so a full church costs the same as one phone.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isServiceId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const songs = await getServiceStatuses(id);
    return NextResponse.json(
      { songs },
      {
        headers: {
          "Cache-Control": "public, max-age=0, must-revalidate",
          "CDN-Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        },
      },
    );
  } catch (err) {
    console.error("[sotw/services/live]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
