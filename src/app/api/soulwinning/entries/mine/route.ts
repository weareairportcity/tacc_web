import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { LOGIN_CODE_LENGTH, normalizeLoginCode } from "@/lib/soulwinning/login-code";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Souls this member has already synced — used so My souls is not empty when
 * IndexedDB was cleared, they opened a different browser, or they signed in
 * with their code on another phone. Proof is the login code, not a session.
 */
export async function POST(request: Request) {
  let body: { code?: unknown; campaign_id?: unknown };
  try {
    body = (await request.json()) as { code?: unknown; campaign_id?: unknown };
  } catch {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? normalizeLoginCode(body.code) : "";
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";

  if (code.length !== LOGIN_CODE_LENGTH || !UUID.test(campaignId)) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const { data: entrants, error: entrantError } = await supabaseAdmin
    .from("sw_entrants")
    .select("id")
    .eq("login_code", code)
    .limit(1);

  if (entrantError) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const entrantId = entrants?.[0]?.id as string | undefined;
  if (!entrantId) {
    return NextResponse.json({ entries: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabaseAdmin
    .from("sw_soul_entries")
    .select(
      "id, campaign_id, entrant_id, group_id, soul_name, phone, latitude, longitude, spoke_in_tongues, coming_to_church, created_at, photo_path"
    )
    .eq("campaign_id", campaignId)
    .eq("entrant_id", entrantId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  return NextResponse.json(
    { entries: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
