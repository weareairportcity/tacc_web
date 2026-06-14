import { NextResponse } from "next/server";
import { getActiveGroups, saveActiveGroups } from "@/lib/vote-db";

export async function GET() {
  const groups = await getActiveGroups();
  return NextResponse.json(groups);
}

export async function POST(req: Request) {
  const { groups } = await req.json();
  await saveActiveGroups(groups);
  return NextResponse.json({ ok: true });
}
