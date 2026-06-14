import { NextResponse } from "next/server";
import {
  getGroupForCode,
  hasSessionVotedForFilm,
  recordSessionVote,
  getVotes,
  addVote,
  getActiveGroups,
  getFilms,
} from "@/lib/vote-db";

export async function POST(req: Request) {
  const { sessionId, weeklyCode, filmId, acting, concept, quality } = await req.json();

  if (!sessionId || !weeklyCode || !filmId || acting == null || concept == null || quality == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  for (const [key, val] of [
    ["Acting", acting],
    ["Concept", concept],
    ["Quality", quality],
  ] as [string, number][]) {
    if (val < 1 || val > 10)
      return NextResponse.json({ error: `${key} must be 1–10` }, { status: 400 });
  }

  // Verify weekly code is valid
  const group = await getGroupForCode(weeklyCode);
  if (!group)
    return NextResponse.json({ error: "Invalid weekly code" }, { status: 403 });

  // Check film exists and belongs to the correct group
  const films = await getFilms();
  const film = films.find((f) => f.id === filmId);
  if (!film) return NextResponse.json({ error: "Film not found" }, { status: 404 });
  if (film.group !== group)
    return NextResponse.json({ error: "Film does not belong to this week" }, { status: 403 });

  // Check group is open for voting
  const activeGroups = await getActiveGroups();
  if (!activeGroups.includes(film.group))
    return NextResponse.json({ error: "This group is not currently open for voting" }, { status: 403 });

  // Check this device hasn't already voted for this film
  const alreadyVoted = await hasSessionVotedForFilm(sessionId, filmId);
  if (alreadyVoted)
    return NextResponse.json({ error: "You already voted for this film" }, { status: 409 });

  await Promise.all([
    addVote({
      film_id: filmId,
      session_id: sessionId,
      acting: Number(acting),
      concept: Number(concept),
      quality: Number(quality),
      total: Number(acting) + Number(concept) + Number(quality),
      created_at: Date.now(),
    }),
    recordSessionVote(sessionId, filmId),
  ]);

  return NextResponse.json({ ok: true });
}
