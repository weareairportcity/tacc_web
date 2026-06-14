import { NextResponse } from "next/server";
import { getFilms, saveFilm, deleteFilm } from "@/lib/vote-db";

export async function GET() {
  const films = await getFilms();
  return NextResponse.json(films);
}

export async function POST(req: Request) {
  const film = await req.json();
  await saveFilm(film);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await deleteFilm(id);
  return NextResponse.json({ ok: true });
}
