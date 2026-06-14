import { NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/vote-db";

export async function POST(req: Request) {
  const { password } = await req.json();
  const adminPw = await getAdminPassword();

  if (password === adminPw) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Wrong password" }, { status: 401 });
}
