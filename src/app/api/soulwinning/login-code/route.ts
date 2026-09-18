import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { LOGIN_CODE_LENGTH, normalizeLoginCode } from "@/lib/soulwinning/login-code";

export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? normalizeLoginCode(body.code) : "";
  if (code.length !== LOGIN_CODE_LENGTH) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sw_entrants")
    .select("id, name, fellowship, phone, pfcc, login_code, created_at")
    .eq("login_code", code)
    .limit(1);

  if (error) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const row = data?.[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
}
