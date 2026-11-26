import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendArrivalReminders, type Variant } from "@/lib/camp/arrival-reminder";
import { sendScheduled } from "@/lib/camp/scheduled";

// Sending to a few hundred people takes a while.
export const maxDuration = 300;

/** The Worker's cron calls this with the admin secret for each scheduled message that has come due. */
export async function POST(request: Request) {
  const secret = process.env.SW_API_ADMIN_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; test?: { camp_id?: unknown; registration_id?: unknown; variant?: unknown; dry?: unknown } };
  const origin = new URL(request.url).origin;
  try {
    // Admin: a dry run (who would get what) or a test to one person.
    if (body.test && typeof body.test.camp_id === "string") {
      const t = body.test;
      const campId = body.test.camp_id;
      const only = typeof t.registration_id === "string" ? t.registration_id : null;
      if (t.dry !== true && !only) return NextResponse.json({ error: "a test needs a registration_id; the real send is scheduled" }, { status: 400 });
      const force = t.variant === "arrival" || t.variant === "details" || t.variant === "both" ? (t.variant as Variant) : null;
      return NextResponse.json(await sendArrivalReminders(campId, { only, force: only ? force : null, dry: t.dry === true, origin }));
    }
    if (typeof body.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json(await sendScheduled(body.id, origin));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
