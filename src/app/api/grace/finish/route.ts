import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { countUploads, getNoteFolder, markNoteComplete, uploadText } from "@/lib/grace/drive";

/**
 * Step two: the browser says its uploads are done. Rather than trust that, we
 * count what actually landed in Drive, then write letter.txt beside the photos
 * and mark the note complete so it shows on the wall.
 */

// Only reachable if the page was left open far too long or something odd
// happened between the two steps; starting over is the fix either way.
const GONE = "We lost track of your note. Please tap Try again to send it again.";

// Drive file ids: letters, digits, - and _.
const DRIVE_ID = /^[\w-]{10,100}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" && DRIVE_ID.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: GONE }, { status: 400 });

  try {
    const note = await getNoteFolder(id);
    if (!note) return NextResponse.json({ error: GONE }, { status: 404 });
    if (note.status === "complete") return NextResponse.json({ ok: true });

    const { originals, previews } = await countUploads(id);
    if (originals < note.photoCount || previews < note.photoCount) {
      return NextResponse.json(
        { error: "Some of your photos did not finish uploading. Please tap Try again." },
        { status: 409 },
      );
    }

    const sent = formatInTimeZone(note.sentAt, "Africa/Accra", "d MMMM yyyy, h:mm a");
    await uploadText("letter.txt", `From: ${note.name}\nSent: ${sent}\n\n${note.letter}\n`, id);
    await markNoteComplete(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[grace/finish]", err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Please wait a moment and tap Try again." },
      { status: 500 },
    );
  }
}
