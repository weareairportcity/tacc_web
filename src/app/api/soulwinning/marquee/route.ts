import { NextResponse } from "next/server";
import { listMarqueePhotoPaths } from "@/lib/soulwinning/marquee-paths";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Paths only — the hall marquee must keep showing every submitted photo even
 * when the latest soul was logged without a picture.
 */
export async function GET(request: Request) {
  const campaignId = new URL(request.url).searchParams.get("campaign");
  if (!campaignId || !UUID.test(campaignId)) {
    return NextResponse.json({ error: "campaign required" }, { status: 400 });
  }

  const paths = await listMarqueePhotoPaths(campaignId);
  return NextResponse.json(
    { paths },
    { headers: { "Cache-Control": "no-store" } }
  );
}
