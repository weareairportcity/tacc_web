import { NextResponse } from "next/server";
import { getSessionVotedFilms } from "@/lib/vote-db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json([]);
  const voted = await getSessionVotedFilms(sessionId);
  return NextResponse.json(voted);
}
