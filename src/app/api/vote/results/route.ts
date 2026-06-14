import { NextResponse } from "next/server";
import { getFilms, getVotes, getActiveGroups } from "@/lib/vote-db";

export async function GET() {
  const [films, votes, activeGroups] = await Promise.all([
    getFilms(),
    getVotes(),
    getActiveGroups(),
  ]);

  const results = films.map((film) => {
    const filmVotes = votes[film.id] || [];
    const count = filmVotes.length;

    const avg = (key: "acting" | "concept" | "quality") =>
      count > 0
        ? (
            filmVotes.reduce((s, v) => s + (v[key] || 0), 0) / count
          ).toFixed(1)
        : null;

    const avgTotal =
      count > 0
        ? (
            filmVotes.reduce((s, v) => s + (v.acting + v.concept + v.quality), 0) /
            count
          ).toFixed(1)
        : null;

    return {
      ...film,
      voteCount: count,
      avgActing: avg("acting"),
      avgConcept: avg("concept"),
      avgQuality: avg("quality"),
      avgTotal,
    };
  });

  results.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return (parseFloat(b.avgTotal || "0") || 0) - (parseFloat(a.avgTotal || "0") || 0);
  });

  return NextResponse.json({ results, activeGroups });
}
