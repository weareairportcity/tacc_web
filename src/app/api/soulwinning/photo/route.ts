import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Mints a short-lived signed URL for a soul photo.
 *
 * The sw-photos bucket is private and anon has no read policy, so this route is
 * the only way an image address comes into being — and it expires in a minute,
 * so a URL copied out of the page is useless almost immediately.
 *
 * The path is checked against a row in sw_soul_entries before signing, so this
 * cannot be used to enumerate or reach anything else in storage.
 */

const TTL_SECONDS = 60;

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  // limit(1), not maybeSingle(): maybeSingle treats more than one match as an
  // error and returns nothing, which would 404 a photo that exists.
  const { data: entries } = await supabaseAdmin
    .from("sw_soul_entries")
    .select("id")
    .eq("photo_path", path)
    .limit(1);

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("sw-photos")
    .createSignedUrl(path, TTL_SECONDS);

  if (error || !data) {
    // A row can carry a photo_path whose object is not in storage yet — the
    // device is still offline, or the upload failed and has not retried. That
    // is an expected state, not a server fault: answer 404 so the card simply
    // renders without a picture instead of the counter retrying a 500 forever.
    const missing = /not.?found|NoSuchKey/i.test(error?.message ?? "");
    return NextResponse.json(
      { error: missing ? "photo not uploaded yet" : "could not sign" },
      { status: missing ? 404 : 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { url: data.signedUrl },
    { headers: { "Cache-Control": "no-store" } }
  );
}
