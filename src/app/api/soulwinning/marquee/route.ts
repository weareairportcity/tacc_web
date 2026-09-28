import { NextResponse } from "next/server";

// Retired with the 1909 outreach. Old tabs may still call this until they
// reload, so answer instantly without touching Supabase. The live version is
// in git history before this change.
export function GET() {
  return NextResponse.json(
    { error: "The 1909 outreach has ended." },
    { status: 410, headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
