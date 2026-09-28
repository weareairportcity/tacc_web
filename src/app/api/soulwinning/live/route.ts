import { NextResponse } from "next/server";
import { SW_API, SW_CAMPAIGN } from "@/lib/soulwinning/api";

/**
 * The counter feed every screen polls. Vercel's CDN caches the answer for 10
 * seconds and serves everyone from that copy, so 5 screens or 500 cost the
 * same: about one run of this function (and one Cloudflare request) every 10s.
 */
export async function GET() {
  try {
    const response = await fetch(`${SW_API}/v1/live/${SW_CAMPAIGN}`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    return new NextResponse(await response.text(), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "live feed unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
