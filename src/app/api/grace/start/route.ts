import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { createNoteFolder, startOriginalUpload, startPreviewUpload } from "@/lib/grace/drive";
import {
  MAX_NAME_LENGTH,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_WORDS,
  countWords,
  isHeic,
  isImage,
} from "@/lib/grace/rules";

/**
 * Step one of sending a birthday note.
 *
 * Makes the note's own Drive folder (holding the name and letter, marked
 * pending) and hands back two Drive upload sessions per photo: one for the
 * untouched original and one for the small preview the wall uses. The
 * browser uploads to both directly, then calls /api/grace/finish.
 */

type PhotoMeta = { name: string; type: string; size: number };

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

function extensionFor(photo: PhotoMeta) {
  const fromName = photo.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return fromName ?? EXT_BY_TYPE[photo.type] ?? "jpg";
}

// Some browsers hand over HEIC files with an empty type.
function mimeFor(photo: PhotoMeta) {
  if (photo.type) return photo.type;
  return isHeic(photo) ? "image/heic" : "application/octet-stream";
}

// Drive allows almost anything in a name, but keep folder names tidy.
const cleanName = (name: string) =>
  name.replace(/[\u0000-\u001f\u007f/\\]/g, "").replace(/\s+/g, " ").trim();

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  // Google ties the upload session to this origin, and only a page on our own
  // host should be opening sessions at all.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json(
      { error: "Please open this page from the church website and try again." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? cleanName(body.name) : "";
  const letter = typeof body?.letter === "string" ? body.letter.trim() : "";
  const photos: PhotoMeta[] = Array.isArray(body?.photos) ? body.photos : [];

  if (!name || name.length > MAX_NAME_LENGTH) return bad("Please write your name on the photo.");
  const words = countWords(letter);
  if (!words) return bad("Please write a note to Pastor.");
  if (words > MAX_WORDS) return bad(`Your note is too long. Please keep it to ${MAX_WORDS} words or fewer.`);
  if (photos.length < 1 || photos.length > MAX_PHOTOS) {
    return bad(`Please add 1 to ${MAX_PHOTOS} photos.`);
  }
  for (const p of photos) {
    if (
      typeof p?.name !== "string" ||
      typeof p?.type !== "string" ||
      !Number.isInteger(p?.size) ||
      p.size <= 0 ||
      !isImage(p)
    ) {
      return bad("One of your files is not a photo. Please remove it and try again.");
    }
    if (p.size > MAX_PHOTO_BYTES) return bad("One of your photos is too big. Please choose a photo under 50 MB.");
  }

  const now = new Date();
  const stamp = formatInTimeZone(now, "Africa/Accra", "yyyy-MM-dd HH.mm");

  try {
    const id = await createNoteFolder(
      `${name} – ${stamp}`,
      { name, letter, sentAt: now.toISOString() },
      photos.length,
    );

    const uploads = await Promise.all(
      photos.map(async (photo, i) => {
        const [original, preview] = await Promise.all([
          startOriginalUpload({
            noteId: id,
            fileName: `photo-${i + 1}.${extensionFor(photo)}`,
            mimeType: mimeFor(photo),
            size: photo.size,
            origin,
          }),
          startPreviewUpload({ noteId: id, index: i + 1, origin }),
        ]);
        return { original, preview };
      }),
    );

    return NextResponse.json({ id, uploads }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[grace/start]", err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Please wait a moment and tap Try again." },
      { status: 500 },
    );
  }
}
