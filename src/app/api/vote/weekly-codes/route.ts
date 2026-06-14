import { NextResponse } from "next/server";
import { getWeeklyCodes, setWeeklyCode, getGroupForCode } from "@/lib/vote-db";

const GROUPS = ["Group 1", "Group 2", "Group 3", "Group 4", "Pastors Group"];

export async function GET() {
  const codes = await getWeeklyCodes();
  return NextResponse.json(codes);
}

export async function POST(req: Request) {
  const body = await req.json();

  // Verify a voter's code → returns group
  if (body.action === "verify") {
    const group = await getGroupForCode(body.code);
    if (!group) return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    return NextResponse.json({ group });
  }

  // Generate a new random code for a group (admin)
  if (body.action === "generate") {
    const { group } = body;
    if (!GROUPS.includes(group))
      return NextResponse.json({ error: "Invalid group" }, { status: 400 });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setWeeklyCode(group, code);
    return NextResponse.json({ code });
  }

  // Set a custom code for a group (admin)
  if (body.action === "set") {
    const { group, code } = body;
    if (!GROUPS.includes(group))
      return NextResponse.json({ error: "Invalid group" }, { status: 400 });
    await setWeeklyCode(group, code);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
